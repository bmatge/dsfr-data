import { describe, it, expect, vi } from 'vitest';
import {
  filterToOdsql,
  applyLocalFilter,
  splitFilterForOdsql,
} from '../../packages/shared/src/query/filter-translator';
import { odsqlCanExpress } from '../../packages/shared/src/query/server-clause';
import { escapeColonValue } from '../../packages/shared/src/utils/colon-escape';

/**
 * AC de #315 (A7) : mêmes résultats serveur/local pour les 12 opérateurs ;
 * valeur avec guillemet correctement échappée dans le code généré.
 */

const ROWS = [
  { nom: 'Paris', dept: '75', pop: 2000000, note: null },
  { nom: 'Lyon', dept: '69', pop: 500000, note: 'grande "ville"' },
  { nom: 'Brest', dept: '29', pop: 140000, note: undefined },
];

describe('filterToOdsql (#315)', () => {
  it('échappe les guillemets et antislashes dans les valeurs', () => {
    expect(filterToOdsql('nom:eq:Saint-"Quote"')).toBe('nom = "Saint-\\"Quote\\""');
    expect(filterToOdsql('nom:in:A"B|C')).toBe('nom in ("A\\"B", "C")');
  });

  it('ne quote pas les littéraux numériques des comparaisons arithmétiques', () => {
    expect(filterToOdsql('pop:gt:5000')).toBe('pop > 5000');
    expect(filterToOdsql('pop:lte:1.5e3')).toBe('pop <= 1.5e3');
    // Valeur non numérique : reste quotée
    expect(filterToOdsql('date:gte:2024-01-01')).toBe('date >= "2024-01-01"');
  });

  it('décode les valeurs percent-encodées de la couche colon (#271)', () => {
    const expr = `region:eq:${escapeColonValue('Provence, Alpes')}`;
    expect(filterToOdsql(expr)).toBe('region = "Provence, Alpes"');
  });

  it('couvre les 10 opérateurs qui ont une traduction ODSQL (#1285)', () => {
    expect(filterToOdsql('a:eq:1')).toContain('=');
    expect(filterToOdsql('a:neq:1')).toContain('!=');
    expect(filterToOdsql('a:gt:1')).toContain('>');
    expect(filterToOdsql('a:gte:1')).toContain('>=');
    expect(filterToOdsql('a:lt:1')).toContain('<');
    expect(filterToOdsql('a:lte:1')).toContain('<=');
    expect(filterToOdsql('a:in:x|y')).toContain('in (');
    expect(filterToOdsql('a:notin:x|y')).toContain('NOT a in (');
    expect(filterToOdsql('a:isnull')).toBe('a is null');
    expect(filterToOdsql('a:isnotnull')).toBe('a is not null');
  });
});

describe('contains / notcontains : aucune traduction ODSQL (#1285, ADR-159)', () => {
  // Le `like` d'un portail Opendatasoft compare des MOTS : `like "%aliment%"`
  // rend 0 ligne pour 14 366 « alimentation » (mesuré le 2026-10-12).
  it('filterToOdsql n’écrit plus aucun like, et le dit', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(filterToOdsql('nom:contains:aliment')).toBe('');
    expect(filterToOdsql('nom:notcontains:aliment')).toBe('');
    expect(filterToOdsql('a|b:contains:x')).toBe('');
    expect(filterToOdsql('annee:eq:2024, nom:contains:lim, dep:in:75|13')).toBe(
      'annee = "2024" AND dep in ("75", "13")'
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('splitFilterForOdsql'));
    warn.mockRestore();
  });

  it('odsqlCanExpress : tout sauf la sous-chaîne', () => {
    expect(odsqlCanExpress('nom:contains:x')).toBe(false);
    expect(odsqlCanExpress('a|b:notcontains:x')).toBe(false);
    for (const clause of ['a:eq:1', 'a:neq:1', 'a:gte:1', 'a:in:x|y', 'a:notin:x', 'a:isnull']) {
      expect(odsqlCanExpress(clause), clause).toBe(true);
    }
    // Une valeur qui porte le mot « contains » n'est pas un opérateur.
    expect(odsqlCanExpress('a:eq:contains')).toBe(true);
  });

  it('splitFilterForOdsql rend les deux parts, dont la somme est le filtre', () => {
    expect(splitFilterForOdsql('annee:eq:2024, nom:contains:aliment, x:notcontains:y')).toEqual({
      server: 'annee:eq:2024',
      client: 'nom:contains:aliment, x:notcontains:y',
      odsql: 'annee = "2024"',
    });
    expect(splitFilterForOdsql('annee:eq:2024')).toEqual({
      server: 'annee:eq:2024',
      client: '',
      odsql: 'annee = "2024"',
    });
    // Appliquer `client` aux lignes que `server` retient = appliquer le filtre entier.
    const lignes = [
      { annee: '2024', nom: 'alimentation' },
      { annee: '2023', nom: 'alimentation' },
      { annee: '2024', nom: 'habitat' },
    ];
    const filtre = 'annee:eq:2024, nom:contains:lim';
    const { server, client } = splitFilterForOdsql(filtre);
    expect(applyLocalFilter(applyLocalFilter(lignes, server), client)).toEqual(
      applyLocalFilter(lignes, filtre)
    );
  });
});

describe('applyLocalFilter (#315)', () => {
  it('supporte in/notin avec la même sémantique lâche que eq', () => {
    // dept est string "75" — le filtre in doit matcher
    expect(applyLocalFilter(ROWS, 'dept:in:75|69').map((r) => r.nom)).toEqual(['Paris', 'Lyon']);
    expect(applyLocalFilter(ROWS, 'dept:notin:75|69').map((r) => r.nom)).toEqual(['Brest']);
    // valeur numérique vs donnée string : coercition lâche
    expect(applyLocalFilter([{ dept: 75 }], 'dept:in:75|13')).toHaveLength(1);
  });

  it('parité serveur/local : les 12 opérateurs filtrent (plus de default silencieux)', () => {
    expect(applyLocalFilter(ROWS, 'pop:gt:400000')).toHaveLength(2);
    expect(applyLocalFilter(ROWS, 'pop:gte:500000')).toHaveLength(2);
    expect(applyLocalFilter(ROWS, 'pop:lt:200000')).toHaveLength(1);
    expect(applyLocalFilter(ROWS, 'pop:lte:140000')).toHaveLength(1);
    expect(applyLocalFilter(ROWS, 'nom:eq:Paris')).toHaveLength(1);
    expect(applyLocalFilter(ROWS, 'nom:neq:Paris')).toHaveLength(2);
    expect(applyLocalFilter(ROWS, 'nom:contains:ly')).toHaveLength(1);
    expect(applyLocalFilter(ROWS, 'nom:notcontains:ly')).toHaveLength(2);
    expect(applyLocalFilter(ROWS, 'note:isnull')).toHaveLength(2);
    expect(applyLocalFilter(ROWS, 'note:isnotnull')).toHaveLength(1);
  });

  it('décode les valeurs percent-encodées', () => {
    const rows = [{ region: 'Provence, Alpes' }, { region: 'Bretagne' }];
    const expr = `region:eq:${escapeColonValue('Provence, Alpes')}`;
    expect(applyLocalFilter(rows, expr)).toHaveLength(1);
  });

  it('avertit sur un opérateur inconnu au lieu de tout retourner en silence', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = applyLocalFilter(ROWS, 'nom:regexlike:foo');
    expect(result).toHaveLength(3);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('regexlike'));
    warnSpy.mockRestore();
  });

  it('filtres combinés : intersection (every)', () => {
    expect(applyLocalFilter(ROWS, 'pop:gt:100000, dept:in:75|29').map((r) => r.nom)).toEqual([
      'Paris',
      'Brest',
    ]);
  });
});
