import { describe, it, expect, beforeEach } from 'vitest';

/**
 * #675 — agrégat KPI `champ:evolution` = (dernière − première) / première
 * sur la source dans son ordre courant ; rendu en pourcentage via
 * `format="pourcentage"`, `trend` et `lines`. `lag` différé (#255).
 */

import {
  parseExpression,
  computeAggregation,
  isRateExpression,
  KPI_AGGREGATION_TYPES,
} from '@/utils/aggregations.js';
import { validateAggregateFunctions } from '@/utils/aggregates.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { clearDataCache, clearDataMeta } from '@/utils/data-bridge.js';

const ANNEES = [
  { annee: 2024, recettes: 200 },
  { annee: 2025, recettes: 250 },
];

/** Vue interne du KPI. */
interface KpiInternals {
  _sourceData: unknown;
  _computeValue(): number | string | null;
  _formatDisplay(v: number | string | null): string;
  _getTendanceInfo(): { value: number; direction: string } | null;
  _resolveLines(): Array<{ text: string; color: string | null }>;
  _validateConfig(): void;
  _blockingConfigError: string | null;
}
const internals = (k: DsfrDataKpi) => k as unknown as KpiInternals;

describe('#675 — grammaire evolution', () => {
  it('evolution est une fonction KPI, un taux', () => {
    expect(KPI_AGGREGATION_TYPES).toContain('evolution');
    expect(parseExpression('recettes:evolution')).toEqual({ type: 'evolution', field: 'recettes' });
    expect(isRateExpression('recettes:evolution')).toBe(true);
  });

  it('AC : deux années -> (250 − 200) / 200 = 0,25', () => {
    expect(computeAggregation(ANNEES, 'recettes:evolution')).toBe(0.25);
  });

  it('suit l’ordre courant de la source (ordre inversé -> taux inversé)', () => {
    expect(computeAggregation([...ANNEES].reverse(), 'recettes:evolution')).toBe(-0.2);
  });

  it('première et dernière sur plusieurs lignes, valeurs non numériques ignorées', () => {
    const rows = [
      { r: '100' },
      { r: 'n.d.' },
      { r: 300 },
      { r: '1 500,5' }, // décimale française (#301)
      { r: null },
    ];
    expect(computeAggregation(rows, 'r:evolution')).toBeCloseTo((1500.5 - 100) / 100, 10);
  });

  it('moins de deux valeurs ou première = 0 -> null', () => {
    expect(computeAggregation([{ r: 5 }], 'r:evolution')).toBeNull();
    expect(computeAggregation([], 'r:evolution')).toBeNull();
    expect(computeAggregation([{ r: 0 }, { r: 10 }], 'r:evolution')).toBeNull();
    expect(computeAggregation([{ r: 'x' }, { r: 10 }], 'r:evolution')).toBeNull();
  });

  it('évolution nulle -> 0 (stable), baisse -> négatif', () => {
    expect(computeAggregation([{ r: 10 }, { r: 10 }], 'r:evolution')).toBe(0);
    expect(computeAggregation([{ r: 10 }, { r: 5 }], 'r:evolution')).toBe(-0.5);
  });

  it('une colonne nommée "evolution" garde la lecture champ:fn (evolution:avg)', () => {
    expect(parseExpression('evolution:avg')).toEqual({ type: 'avg', field: 'evolution' });
    expect(computeAggregation([{ evolution: 5.2 }], 'evolution:avg')).toBe(5.2);
    // La lecture inversée (dépréciée) reste celle des fonctions historiques…
    expect(parseExpression('sum:count')).toEqual({ type: 'sum', field: 'count' });
    // …mais evolution et distinct n'ont pas de forme inversée
    expect(parseExpression('evolution:recettes').type).toBe('invalid');
    expect(parseExpression('distinct:commune').type).toBe('invalid');
  });

  it('réservé au KPI : refusé sur aggregate de dsfr-data-query', () => {
    expect(validateAggregateFunctions('recettes:evolution')).toContain('"evolution" inconnue');
  });
});

describe('#675 — dsfr-data-kpi : rendu de evolution', () => {
  let kpi: DsfrDataKpi;
  beforeEach(() => {
    clearDataCache('chrono');
    clearDataMeta('chrono');
    kpi = new DsfrDataKpi();
    kpi.source = 'chrono';
    internals(kpi)._sourceData = ANNEES;
  });

  it('AC : value="recettes:evolution" format="pourcentage" -> « 25 % »', () => {
    kpi.value = 'recettes:evolution';
    kpi.format = 'pourcentage';
    internals(kpi)._validateConfig();
    expect(internals(kpi)._blockingConfigError).toBeNull();
    expect(internals(kpi)._computeValue()).toBe(25);
    expect(internals(kpi)._formatDisplay(25)).toBe('25 %');
  });

  it('trend="recettes:evolution" -> flèche en hausse de 25 %', () => {
    kpi.value = 'recettes:last';
    kpi.trend = 'recettes:evolution';
    expect(internals(kpi)._getTendanceInfo()).toEqual({ value: 25, direction: 'up' });
  });

  it('lines : évolution signée, colorée auto', () => {
    kpi.value = 'recettes:last';
    kpi.lines = '[{"value":"recettes:evolution","sign":true,"suffix":"vs N-1","color":"auto"}]';
    const [line] = internals(kpi)._resolveLines();
    expect(line.text).toBe('+25 % vs N-1');
    expect(line.color).toContain('success');
  });

  it('where filtre les lignes avant le calcul', () => {
    internals(kpi)._sourceData = [
      { annee: 2023, recettes: 100, type: 'A' },
      { annee: 2024, recettes: 200, type: 'B' },
      { annee: 2025, recettes: 300, type: 'A' },
    ];
    kpi.value = 'recettes:evolution';
    kpi.format = 'pourcentage';
    kpi.where = 'type:eq:A';
    expect(internals(kpi)._computeValue()).toBe(200);
  });

  it('une seule ligne : « — », ligne masquée sans repli na', () => {
    internals(kpi)._sourceData = [{ recettes: 10 }];
    kpi.value = 'recettes:evolution';
    kpi.format = 'pourcentage';
    expect(internals(kpi)._formatDisplay(internals(kpi)._computeValue())).toBe('—');
    kpi.lines = '[{"value":"recettes:evolution"}]';
    expect(internals(kpi)._resolveLines()).toHaveLength(0);
  });
});
