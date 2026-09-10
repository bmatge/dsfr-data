import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #673 — ratio de deux agrégats `value="<expr> / <expr>"` sur dsfr-data-kpi,
 * `count:champ:valeur` sur un champ tableau, `count-if` refusé sur query.
 */

import {
  parseExpression,
  computeAggregation,
  isRateExpression,
  countsReceivedRows,
} from '@/utils/aggregations.js';
import { validateAggregateFunctions } from '@/utils/aggregates.js';
import { resolveKpiLine } from '@/utils/kpi-lines.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { clearDataCache, clearDataMeta, setDataMeta } from '@/utils/data-bridge.js';

const DOSSIERS = [
  { statut: 'ouvert', montant: 100, tags: ['urgent', 'fiscal'] },
  { statut: 'ouvert', montant: 50, tags: ['fiscal'] },
  { statut: 'clos', montant: 30, tags: [] },
  { statut: 'clos', montant: 20, tags: null },
];

/** Vue interne du KPI. */
interface KpiInternals {
  _sourceData: unknown;
  _computeValue(): number | string | null;
  _formatDisplay(v: number | string | null): string;
  _getTendanceInfo(): { value: number; direction: string } | null;
  _resolveLines(): Array<{ text: string }>;
  _validateConfig(): void;
  _blockingConfigError: string | null;
  _getColor(): string;
}
const internals = (k: DsfrDataKpi) => k as unknown as KpiInternals;

describe('#673 — grammaire ratio', () => {
  it('parse "<expr> / <expr>" avec chaque côté dans la grammaire actuelle', () => {
    const parsed = parseExpression('count:statut:ouvert / count');
    expect(parsed.type).toBe('ratio');
    expect(parsed.numerator).toMatchObject({
      type: 'count',
      field: 'statut',
      filterValue: 'ouvert',
    });
    expect(parsed.denominator).toEqual({ type: 'count', field: '' });
    expect(parseExpression('montant:sum / meta:total').denominator).toEqual({
      type: 'meta',
      field: 'total',
    });
    expect(isRateExpression('montant:sum / count')).toBe(true);
    expect(isRateExpression('montant:sum')).toBe(false);
  });

  it('un côté invalide invalide le ratio, avec le message du côté fautif', () => {
    const parsed = parseExpression('montant:somme / count');
    expect(parsed.type).toBe('invalid');
    expect(parsed.error).toContain('"somme"');
  });

  it('plus d’un séparateur ou un côté vide : ratio mal formé', () => {
    expect(parseExpression('a:sum / b:sum / c:sum').type).toBe('invalid');
    expect(parseExpression('a:sum / b:sum / c:sum').error).toContain('mal formé');
  });

  it('sans espaces autour, "/" reste un caractère de nom de champ', () => {
    expect(parseExpression('km/h:avg')).toEqual({ type: 'avg', field: 'km/h' });
  });

  it('AC : count:statut:ouvert / count -> part correcte (fraction)', () => {
    expect(computeAggregation(DOSSIERS, 'count:statut:ouvert / count')).toBe(0.5);
    expect(computeAggregation(DOSSIERS, 'montant:sum / count')).toBe(50);
  });

  it('division par zéro ou côté non numérique -> null (jamais Infinity)', () => {
    expect(computeAggregation(DOSSIERS, 'count / count:statut:archive')).toBeNull();
    expect(computeAggregation(DOSSIERS, 'statut:first / count')).toBeNull();
    expect(computeAggregation([], 'count / count')).toBeNull();
  });

  it('meta:total est résolu par le contexte, sinon les lignes reçues', () => {
    expect(computeAggregation(DOSSIERS, 'count / meta:total', { metaTotal: 8 })).toBe(0.5);
    expect(computeAggregation(DOSSIERS, 'count / meta:total')).toBe(1);
    expect(computeAggregation(DOSSIERS, 'meta:total', { metaTotal: 8 })).toBe(8);
  });

  it('countsReceivedRows : vrai si un côté compte les lignes reçues', () => {
    expect(countsReceivedRows(parseExpression('count:statut:ouvert / count'))).toBe(true);
    expect(countsReceivedRows(parseExpression('montant:sum / montant:max'))).toBe(false);
  });
});

describe('#673 — count:champ:valeur sur un champ tableau (contains)', () => {
  it('compte les lignes dont un élément est égal', () => {
    expect(computeAggregation(DOSSIERS, 'count:tags:fiscal')).toBe(2);
    expect(computeAggregation(DOSSIERS, 'count:tags:urgent')).toBe(1);
    expect(computeAggregation(DOSSIERS, 'count:tags:absent')).toBe(0);
  });

  it('égalité lâche conservée sur les éléments (75 vs "75")', () => {
    expect(computeAggregation([{ d: [75, 13] }, { d: ['75'] }], 'count:d:75')).toBe(2);
  });
});

describe('#673 — count-if refusé sur dsfr-data-query', () => {
  it('validateAggregateFunctions nomme where comme alternative', () => {
    expect(validateAggregateFunctions('statut:count-if')).toContain('where=');
  });
});

describe('#673 — dsfr-data-kpi : rendu du ratio', () => {
  let kpi: DsfrDataKpi;
  beforeEach(() => {
    clearDataCache('dossiers');
    clearDataMeta('dossiers');
    kpi = new DsfrDataKpi();
    kpi.source = 'dossiers';
    internals(kpi)._sourceData = DOSSIERS;
  });
  afterEach(() => vi.restoreAllMocks());

  it('AC : value="count:statut:ouvert / count" format="pourcentage" -> « 50 % »', () => {
    kpi.value = 'count:statut:ouvert / count';
    kpi.format = 'pourcentage';
    expect(internals(kpi)._computeValue()).toBe(50);
    expect(internals(kpi)._formatDisplay(internals(kpi)._computeValue())).toBe('50\u00a0%');
  });

  it('format decimal : la fraction brute', () => {
    kpi.value = 'count:statut:ouvert / count';
    kpi.format = 'decimal';
    expect(internals(kpi)._computeValue()).toBe(0.5);
    expect(internals(kpi)._formatDisplay(0.5)).toBe('0,5');
  });

  it('un ratio non-taux (montant moyen) n’est pas mis à l’échelle hors pourcentage', () => {
    kpi.value = 'montant:sum / count';
    kpi.format = 'euro';
    expect(internals(kpi)._computeValue()).toBe(50);
    expect(internals(kpi)._formatDisplay(50)).toBe('50\u00a0€');
  });

  it('les seuils s’expriment dans l’unité affichée (pourcentage)', () => {
    kpi.value = 'count:statut:ouvert / count';
    kpi.format = 'pourcentage';
    kpi.thresholdGreen = 40;
    kpi.thresholdOrange = 20;
    expect(internals(kpi)._getColor()).toBe('vert');
  });

  it('division par zéro : « — », pas Infinity', () => {
    kpi.value = 'count / count:statut:archive';
    kpi.format = 'pourcentage';
    expect(internals(kpi)._computeValue()).toBeNull();
    expect(internals(kpi)._formatDisplay(null)).toBe('—');
  });

  it('where s’applique aux deux côtés, pas à meta:total', () => {
    setDataMeta('dossiers', { page: 1, pageSize: 0, total: 8, serverSide: false });
    kpi.value = 'count / meta:total';
    kpi.where = 'statut:eq:ouvert';
    kpi.format = 'pourcentage';
    expect(internals(kpi)._computeValue()).toBe(25);
  });

  it('trend accepte un ratio et le rend en pourcentage', () => {
    kpi.value = 'count';
    kpi.trend = 'count:statut:ouvert / count';
    expect(internals(kpi)._getTendanceInfo()).toEqual({ value: 50, direction: 'up' });
  });

  it('lines : ratio rendu en pourcentage par défaut, fraction en decimal', () => {
    kpi.value = 'count';
    kpi.lines = '[{"value":"count:statut:ouvert / count","suffix":"ouverts"}]';
    expect(internals(kpi)._resolveLines()[0].text).toBe('50\u00a0% ouverts');
    expect(
      resolveKpiLine({ value: 'count:statut:ouvert / count', format: 'decimal' }, DOSSIERS)?.text
    ).toBe('0,5');
  });

  it('côté invalide : erreur de configuration bloquante', () => {
    kpi.value = 'montant:somme / count';
    internals(kpi)._validateConfig();
    expect(internals(kpi)._blockingConfigError).toContain('"somme"');
  });

  it('value="meta:total" reste valide et lit la meta', () => {
    setDataMeta('dossiers', { page: 1, pageSize: 0, total: 8, serverSide: false });
    kpi.value = 'meta:total';
    internals(kpi)._validateConfig();
    expect(internals(kpi)._blockingConfigError).toBeNull();
    expect(internals(kpi)._computeValue()).toBe(8);
  });
});
