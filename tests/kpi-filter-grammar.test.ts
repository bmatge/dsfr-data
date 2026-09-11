import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #764 — deux défauts du parseur d'expressions du KPI.
 *
 * 1. `count:champ:valeur`, forme RECOMMANDÉE depuis le ratio (#673, 0.24.0),
 *    déclenchait l'avertissement de dépréciation de la grammaire `fn:champ`
 *    (#303) : l'avertissement était posé avant le traitement des trois parties.
 * 2. `sum:champ:valeur` était accepté et ignorait son filtre : le total NON
 *    filtré s'affichait, sans erreur ni avertissement.
 *
 * L'avertissement de dépréciation est unique par module (`legacyGrammarWarned`) :
 * chaque test recharge le module pour observer le premier appel.
 */

type AggregationsModule = typeof import('@/utils/aggregations.js');

let agg: AggregationsModule;
let warnSpy: { mock: { calls: unknown[][] } };

const DOSSIERS = [
  { statut: 'ouvert', montant: 100, heure: '12:30' },
  { statut: 'ouvert', montant: 50, heure: '09:00' },
  { statut: 'clos', montant: 30, heure: '12:30' },
];

beforeEach(async () => {
  vi.resetModules();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  agg = await import('@/utils/aggregations.js');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function deprecationWarns(): unknown[][] {
  return warnSpy.mock.calls.filter((call: unknown[]) => String(call[0]).includes('dépréciée'));
}

describe('#764 — count:champ:valeur n’est pas déprécié', () => {
  it('parse sans avertissement de dépréciation', () => {
    expect(agg.parseExpression('count:statut:ouvert')).toEqual({
      type: 'count',
      field: 'statut',
      filterField: 'statut',
      filterValue: 'ouvert',
    });
    expect(deprecationWarns()).toHaveLength(0);
  });

  it('un ratio dont un côté est count:champ:valeur ne l’émet pas non plus', () => {
    // Chaque côté du ratio est reparsé : c'était le second chemin d'émission.
    expect(agg.computeAggregation(DOSSIERS, 'count:statut:ouvert / count')).toBeCloseTo(2 / 3);
    expect(deprecationWarns()).toHaveLength(0);
  });

  it('une valeur contenant un deux-points est lue en entier', () => {
    expect(agg.parseExpression('count:heure:12:30').filterValue).toBe('12:30');
    expect(agg.computeAggregation(DOSSIERS, 'count:heure:12:30')).toBe(2);
  });

  it('la valeur n’est pas réécrite par la résolution d’alias des fonctions', () => {
    expect(agg.parseExpression('count:mode:count-distinct').filterValue).toBe('count-distinct');
  });
});

describe('#764 — fn:champ:valeur avec une autre fonction que count', () => {
  it.each(['sum', 'avg', 'min', 'max', 'first', 'last'])(
    '%s:champ:valeur est une erreur de configuration nommée',
    (fn) => {
      const parsed = agg.parseExpression(`${fn}:montant:ouvert`);
      expect(parsed.type).toBe('invalid');
      expect(parsed.error).toContain(`${fn}:montant:ouvert`);
      expect(parsed.error).toContain('count:champ:valeur');
    }
  );

  it('ne rend plus le total non filtré', () => {
    // Avant : 180, le total de toutes les lignes, sans un mot.
    expect(agg.computeAggregation(DOSSIERS, 'sum:montant:ouvert')).toBeNull();
  });

  it('invalide aussi le ratio qui la contient', () => {
    const parsed = agg.parseExpression('sum:montant:ouvert / montant:sum');
    expect(parsed.type).toBe('invalid');
    expect(parsed.error).toContain('sum:montant:ouvert');
  });
});

describe('#764 — la grammaire à deux parties reste dépréciée', () => {
  it('sum:montant émet l’avertissement, une seule fois', () => {
    expect(agg.parseExpression('sum:montant')).toEqual({ type: 'sum', field: 'montant' });
    agg.parseExpression('avg:montant');
    const warns = deprecationWarns();
    expect(warns).toHaveLength(1);
    expect(String(warns[0][0])).toContain('"sum:montant" (fn:champ) est dépréciée');
  });

  it('la grammaire commune n’émet rien', () => {
    agg.parseExpression('montant:sum');
    agg.parseExpression('count');
    expect(deprecationWarns()).toHaveLength(0);
  });
});

describe('#764 — le KPI bloque sur la forme fautive', () => {
  it('value="sum:montant:ouvert" pose une erreur de configuration', async () => {
    const { DsfrDataKpi } = await import('@/components/dsfr-data-kpi.js');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const kpi = new DsfrDataKpi();
    kpi.value = 'sum:montant:ouvert';
    (kpi as unknown as { _validateConfig(): void })._validateConfig();

    expect(kpi.getAttribute('data-dsfr-config-error')).toContain('sum:montant:ouvert');
    expect(errorSpy).toHaveBeenCalled();
  });
});
