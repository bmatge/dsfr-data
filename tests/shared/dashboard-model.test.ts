/**
 * Modele de document multi-blocs partage (#515) — extensions du modele :
 * widget chart `fromBuilder` (ChartConfig complete) et widget `filters`
 * (filtres partages). La normalisation historique (kpi/chart/table/text,
 * alias francais) reste couverte par tests/apps/dashboard/normalize-widget.test.ts
 * via les re-exports de l'app.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeWidget,
  createWidget,
  getDefaultConfig,
  getDefaultTitle,
  isBuilderChart,
  isFavoriteChart,
} from '../../packages/shared/src/dashboard/model';
import type { ChartConfig } from '../../packages/shared/src/dashboard/chart-config';

const chart: ChartConfig = {
  type: 'bar',
  labelField: 'region',
  valueField: 'population',
  aggregation: 'sum',
};

describe('dashboard/model — widget fromBuilder', () => {
  it('normalise un widget fromBuilder en conservant la ChartConfig', () => {
    const w = normalizeWidget({
      id: 'w1',
      type: 'chart',
      title: 'Population',
      position: { row: 0, col: 0 },
      config: { fromBuilder: true, chart, sourceId: 'src-1' },
    });
    expect(w).not.toBeNull();
    if (w?.type !== 'chart') throw new Error('type attendu: chart');
    expect(isBuilderChart(w.config)).toBe(true);
    expect(isFavoriteChart(w.config)).toBe(false);
    if (!isBuilderChart(w.config)) throw new Error('garde attendue');
    expect(w.config.chart).toEqual(chart);
    expect(w.config.sourceId).toBe('src-1');
  });

  it('rejette un fromBuilder sans ChartConfig minimale', () => {
    const noChart = normalizeWidget({
      id: 'w1',
      type: 'chart',
      position: { row: 0, col: 0 },
      config: { fromBuilder: true },
    });
    expect(noChart).toBeNull();

    const incomplete = normalizeWidget({
      id: 'w1',
      type: 'chart',
      position: { row: 0, col: 0 },
      config: { fromBuilder: true, chart: { type: 'bar' } },
    });
    expect(incomplete).toBeNull();
  });

  it('un chart manuel avec sourceId le conserve', () => {
    const w = normalizeWidget({
      id: 'w1',
      type: 'chart',
      position: { row: 0, col: 0 },
      config: { type: 'bar', labelField: 'a', valueField: 'b', sourceId: 'src-2' },
    });
    if (w?.type !== 'chart' || isFavoriteChart(w.config) || isBuilderChart(w.config)) {
      throw new Error('chart manuel attendu');
    }
    expect(w.config.sourceId).toBe('src-2');
  });
});

describe('dashboard/model — widget filters', () => {
  it('normalise un widget filters (specs valides gardees, invalides ecartees)', () => {
    const w = normalizeWidget({
      id: 'f1',
      type: 'filters',
      position: { row: 0, col: 0 },
      config: {
        filters: [
          { field: 'region', label: 'Région', operator: 'in', options: ['IDF', 'PACA'] },
          { field: '' }, // invalide : ecarte
          { operator: 'eq' }, // invalide : pas de field
          { field: 'annee' },
        ],
        sourceIds: ['src-1'],
      },
    });
    if (w?.type !== 'filters') throw new Error('type attendu: filters');
    expect(w.config.filters).toHaveLength(2);
    expect(w.config.filters[0]).toEqual({
      field: 'region',
      label: 'Région',
      operator: 'in',
      options: ['IDF', 'PACA'],
    });
    // Operateur inconnu ou absent : ramene a eq.
    expect(w.config.filters[1].operator).toBe('eq');
    expect(w.config.sourceIds).toEqual(['src-1']);
  });

  it('createWidget/getDefaultConfig couvrent le type filters', () => {
    expect(getDefaultTitle('filters')).toBe('Filtres');
    expect(getDefaultConfig('filters')).toEqual({ filters: [] });
    const w = createWidget('filters', 1, 0);
    expect(w.type).toBe('filters');
    expect(w.position).toEqual({ row: 1, col: 0 });
  });

  it('un type inconnu reste rejete', () => {
    expect(normalizeWidget({ id: 'x', type: 'video', config: {} })).toBeNull();
  });
});
