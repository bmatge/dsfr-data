import { describe, it, expect } from 'vitest';
import { state, PROXY_BASE_URL, FAVORITES_KEY } from '../../../apps/builder/src/state';
import type {
  ChartType,
  AggregationType,
  SortOrder,
  Field,
  Source,
  GenerationMode,
} from '../../../apps/builder/src/state';

describe('builder state', () => {
  it('should have PROXY_BASE_URL constant', () => {
    expect(PROXY_BASE_URL).toBe('https://chartsbuilder.matge.com');
  });

  it('should have FAVORITES_KEY constant', () => {
    expect(FAVORITES_KEY).toBe('dsfr-data-favorites');
  });

  it('should have expected initial state', () => {
    expect(state.sourceType).toBe('saved');
    expect(state.chartType).toBe('bar');
    expect(state.aggregation).toBe('avg');
    expect(state.sortOrder).toBe('none');
    expect(state.title).toBe('Mon graphique');
    expect(state.palette).toBe('default');
    expect(state.color2).toBe('#E1000F');
    expect(state.generationMode).toBe('embedded');
    expect(state.advancedMode).toBe(false);
    expect(state.refreshInterval).toBe(0);
  });

  it('should have null/empty initial values for data properties', () => {
    expect(state.savedSource).toBeNull();
    expect(state.localData).toBeNull();
    expect(state.fields).toEqual([]);
    expect(state.data).toEqual([]);
    expect(state.data2).toEqual([]);
  });

  it('should support all chart types', () => {
    const types: ChartType[] = [
      'bar',
      'horizontalBar',
      'line',
      'pie',
      'doughnut',
      'radar',
      'scatter',
      'gauge',
      'kpi',
      'map',
    ];
    expect(types).toHaveLength(10);
  });

  it('should support all aggregation types', () => {
    const aggs: AggregationType[] = ['avg', 'sum', 'count', 'min', 'max'];
    expect(aggs).toHaveLength(5);
  });

  it('should support sort orders', () => {
    const orders: SortOrder[] = ['asc', 'desc', 'none'];
    expect(orders).toHaveLength(3);
  });

  it('should support generation modes', () => {
    const modes: GenerationMode[] = ['embedded', 'dynamic'];
    expect(modes).toHaveLength(2);
  });

  it('should have correct Field type shape', () => {
    const field: Field = {
      name: 'population',
      type: 'numerique',
      sample: 12345,
      fullPath: 'data.population',
      displayName: 'Population',
    };
    expect(field.name).toBe('population');
  });

  it('should have correct Source type shape', () => {
    const source: Source = {
      id: '1',
      name: 'Test',
      type: 'api',
      apiUrl: 'https://example.com/api',
      recordCount: 42,
    };
    expect(source.type).toBe('api');
  });
});
