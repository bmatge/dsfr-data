import { describe, it, expect, afterEach } from 'vitest';

import {
  accordAvecServeur,
  attenduServeur,
  etatQuota,
  fetchAggregate,
  QuotaError,
  SEUIL_QUOTA,
  urlRecoupement,
  validerCrosscheck,
  verdictRecoupement,
  viderRecoupement,
} from '../../tools/oracle/crosscheck.js';
import { controlesDuMode } from '../verif-donnees/index.js';
import type { Expect } from '../../tools/oracle/manifest.js';

/**
 * Le RECOUPEMENT SERVEUR (#883), éprouvé hors ligne.
 *
 * Ce que ce test tient : aucun recoupement du dépôt ne demande au serveur ce
 * qu'il ne sait pas dire (distinct, total_count, fonctions de date), la
 * clause part écrite à la main sur l'export JSON, le quota coupe le portail
 * sous le seuil et le dit, et les cinq verdicts à trois chiffres sont ceux
 * de la table du README.
 */

const vraiFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = vraiFetch;
  viderRecoupement();
});

const KPI: Expect = {
  kind: 'kpi',
  id: 'k',
  agg: 'sum',
  field: 'population',
  crosscheck: { select: 'sum(population) as v' },
};

describe('validerCrosscheck', () => {
  it('accepte un agrégat simple sur un KPI, et des lignes aliasées sur un group_by', () => {
    expect(validerCrosscheck({ select: 'sum(population) as v' }, KPI)).toEqual([]);
    const rows: Expect = {
      kind: 'rows',
      id: 'q',
      key: 'region',
      columns: ['pop', 'nb'],
      pipeline: [
        {
          op: 'group-by',
          by: 'region',
          columns: { pop: { agg: 'sum', field: 'population' }, nb: { agg: 'count' } },
        },
      ],
      crosscheck: { select: 'sum(population) as pop, count(*) as nb', groupBy: 'region' },
    };
    expect(validerCrosscheck(rows.crosscheck!, rows)).toEqual([]);
  });

  it('refuse ce que le serveur ne sait pas dire : distinct, total_count, meta, fonctions de date', () => {
    expect(validerCrosscheck({ select: 'count(distinct ville) as v' }, KPI)[0]).toContain('PG-026');
    expect(
      validerCrosscheck({ select: 'date_format(d, "yyyy") as v' }, KPI).length
    ).toBeGreaterThan(0);
    expect(
      validerCrosscheck(
        { select: 'count(*) as nb', groupBy: 'year(annee)' },
        { kind: 'rows', id: 'q', key: 'an', columns: ['nb'], pipeline: [] }
      )[0]
    ).toContain('group_by');
    // Un `where` à fonction de date filtre l'export et l'agrégat pareil, côté serveur : accepté.
    expect(validerCrosscheck({ select: 'sum(x) as v', where: 'year(annee) = 2025' }, KPI)).toEqual(
      []
    );
    // Un KPI qui filtre lui-même doit écrire sa clause.
    expect(
      validerCrosscheck(
        { select: 'sum(x) as v' },
        { ...KPI, filter: [{ field: 'c', op: 'eq', value: 'A' }] }
      )[0]
    ).toContain('where');
    expect(validerCrosscheck({ select: 'total_count as v' }, KPI)[0]).toContain('LIM-002');
    expect(validerCrosscheck({ select: 'sum(x) as v' }, { ...KPI, agg: 'distinct' })[0]).toContain(
      'distinct'
    );
  });

  it('refuse un pipeline que le serveur ne peut pas rejouer, et une forme de select fausse', () => {
    const joint: Expect = {
      ...KPI,
      pipeline: [{ op: 'join', right: 'r', on: 'code', type: 'left' }],
    };
    expect(validerCrosscheck({ select: 'sum(x) as v' }, joint)[0]).toContain('jointure');
    expect(validerCrosscheck({ select: 'sum(x) as total' }, KPI)[0]).toContain('aliasé `v`');
    expect(validerCrosscheck({ select: 'sum(x) as v', groupBy: 'region' }, KPI)[0]).toContain(
      'sans group_by'
    );
    const graphe: Expect = {
      kind: 'chart',
      id: 'g',
      labelColumn: 'a',
      valueColumns: ['b'],
      pipeline: [],
      crosscheck: { select: 'sum(b) as b', groupBy: 'a' },
    };
    expect(validerCrosscheck(graphe.crosscheck!, graphe)[0]).toContain('v1');
  });

  it('tous les recoupements du dépôt sont bien posés', () => {
    const fautifs: string[] = [];
    let poses = 0;
    for (const { domaine, check } of controlesDuMode('live')) {
      for (const e of check.expects) {
        if (!('crosscheck' in e) || !e.crosscheck) continue;
        poses++;
        for (const raison of validerCrosscheck(e.crosscheck, e))
          fautifs.push(`${domaine}/${check.id}/${e.id} : ${raison}`);
      }
    }
    expect(poses).toBeGreaterThanOrEqual(15);
    expect(fautifs).toEqual([]);
  });
});

describe('urlRecoupement', () => {
  it('écrit la clause à la main sur l’export JSON, depuis un jeu ou depuis une URL', () => {
    expect(
      urlRecoupement(
        { baseUrl: 'https://portail.invalid', dataset: 'jeu', where: "a = 'b'" },
        { select: 'sum(x) as v' }
      )
    ).toBe(
      'https://portail.invalid/api/explore/v2.1/catalog/datasets/jeu/exports/json?select=sum%28x%29+as+v&where=a+%3D+%27b%27'
    );
    // Depuis une URL brute : le `select` de l'export brut est remplacé, le `where` repris.
    expect(
      urlRecoupement(
        {
          url: 'https://portail.invalid/api/explore/v2.1/catalog/datasets/jeu/exports/json?select=a%2C+b&where=a+%3D+1',
        },
        { select: 'count(*) as v', groupBy: 'a' }
      )
    ).toBe(
      'https://portail.invalid/api/explore/v2.1/catalog/datasets/jeu/exports/json?select=count%28*%29+as+v&group_by=a&where=a+%3D+1'
    );
    // Une clause écrite dans le recoupement l'emporte.
    expect(
      urlRecoupement(
        { baseUrl: 'https://p.invalid', dataset: 'j', where: 'x = 1' },
        { select: 'count(*) as v', where: 'x = 2' }
      )
    ).toContain('where=x+%3D+2');
    expect(() =>
      urlRecoupement(
        { url: 'https://tabular.invalid/api/resources/x/data/' },
        { select: 'count(*) as v' }
      )
    ).toThrow('export JSON Opendatasoft');
  });
});

describe('fetchAggregate — quota', () => {
  function reseau(restantes: number[]): string[] {
    const vues: string[] = [];
    let i = 0;
    globalThis.fetch = (async (entree: string | URL) => {
      vues.push(String(entree));
      const r = restantes[Math.min(i++, restantes.length - 1)];
      return new Response(JSON.stringify([{ v: 42 }]), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': String(r) },
      });
    }) as typeof fetch;
    return vues;
  }
  const SOURCE = { baseUrl: 'https://data.sports.invalid', dataset: 'jeu' };

  it('lit le quota, ne redemande pas deux fois la même URL, et compte les requêtes par portail', async () => {
    const vues = reseau([4000]);
    expect(await fetchAggregate(SOURCE, { select: 'count(*) as v' })).toEqual([{ v: 42 }]);
    await fetchAggregate(SOURCE, { select: 'count(*) as v' });
    expect(vues).toHaveLength(1);
    expect(etatQuota()['data.sports.invalid']).toEqual({ restantes: 4000, requetes: 1 });
  });

  it('sous le seuil, coupe le portail pour le run et le dit', async () => {
    reseau([SEUIL_QUOTA - 100]);
    await fetchAggregate(SOURCE, { select: 'count(*) as v' });
    const etat = etatQuota()['data.sports.invalid'];
    expect(etat.coupe).toContain('sous le seuil');
    await expect(fetchAggregate(SOURCE, { select: 'sum(x) as v' })).rejects.toBeInstanceOf(
      QuotaError
    );
    // Un autre portail n'est pas concerné.
    await expect(
      fetchAggregate(
        { baseUrl: 'https://autre.invalid', dataset: 'j' },
        { select: 'count(*) as v' }
      )
    ).resolves.toEqual([{ v: 42 }]);
  });
});

describe('attenduServeur et accordAvecServeur', () => {
  it('un KPI : la valeur `v`, à la précision affichée, avec l’échelle de l’attente', () => {
    const s = attenduServeur({ ...KPI, decimals: 1 }, [{ v: 12.34 }]);
    expect(s).toEqual({ kind: 'kpi', value: 12.34, decimals: 1 });
    expect(accordAvecServeur(KPI, s, { kind: 'kpi', value: 12.3 }).ok).toBe(true);
    expect(accordAvecServeur(KPI, s, { kind: 'kpi', value: 12.5 }).ok).toBe(false);
    expect(attenduServeur({ ...KPI, scale: 100 }, [{ v: 0.25 }])).toEqual({
      kind: 'kpi',
      value: 25,
      decimals: 0,
    });
    expect(attenduServeur(KPI, [])).toEqual({ kind: 'kpi', value: null, decimals: 0 });
  });

  it('des lignes : par clé, pas par position', () => {
    const rows: Expect = {
      kind: 'rows',
      id: 'q',
      key: 'region',
      columns: ['nb'],
      pipeline: [],
      crosscheck: { select: 'count(*) as nb', groupBy: 'region' },
    };
    const s = attenduServeur(rows, [
      { region: 'Sud', nb: 2 },
      { region: 'Nord', nb: 3 },
    ]);
    expect(
      accordAvecServeur(rows, s, {
        kind: 'rows',
        rows: [
          { region: 'Nord', nb: 3 },
          { region: 'Sud', nb: 2 },
        ],
      }).ok
    ).toBe(true);
    expect(
      accordAvecServeur(rows, s, {
        kind: 'rows',
        rows: [
          { region: 'Nord', nb: 3 },
          { region: 'Sud', nb: 1 },
        ],
      }).ok
    ).toBe(false);
    expect(accordAvecServeur(rows, s, { kind: 'rows', rows: [{ region: 'Nord', nb: 3 }] }).ok).toBe(
      false
    );
  });
});

describe('verdictRecoupement — la table à trois chiffres', () => {
  it('énonce les cinq verdicts, et ne fait tomber que ce qui doit tomber', () => {
    expect(verdictRecoupement(true, true, true)).toMatchObject({
      code: 'trois-voix',
      echec: false,
    });
    expect(verdictRecoupement(true, false, false)).toMatchObject({
      code: 'bibliotheque',
      echec: true,
    });
    expect(verdictRecoupement(false, true, false)).toMatchObject({
      code: 'recoupement-a-qualifier',
      echec: false,
    });
    expect(verdictRecoupement(false, false, true)).toMatchObject({ code: 'oracle', echec: true });
    expect(verdictRecoupement(false, false, false)).toMatchObject({ code: 'rejouer', echec: true });
    expect(verdictRecoupement(false, false, true).texte).toBe(
      'oracle ≠ serveur, lib = serveur : le recalcul se trompe seul'
    );
  });
});
