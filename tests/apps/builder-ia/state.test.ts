import { describe, it, expect } from 'vitest';
import { state } from '../../../apps/builder-ia/src/state';
import type { AppState, ChartConfig, Source, Field, Message } from '../../../apps/builder-ia/src/state';

describe('builder-ia state', () => {
  it('should have expected initial state', () => {
    expect(state.source).toBeNull();
    expect(state.localData).toBeNull();
    expect(state.fields).toEqual([]);
    expect(state.chartConfig).toBeNull();
    expect(state.chart).toBeNull();
    expect(state.messages).toEqual([]);
    expect(state.isThinking).toBe(false);
  });

  it('should have correct Source type shape', () => {
    const source: Source = {
      id: '1',
      name: 'Test Source',
      type: 'api',
      url: 'https://example.com/api',
      recordCount: 42,
    };
    expect(source.type).toBe('api');
    expect(source.url).toBe('https://example.com/api');
  });

  it('should have correct Field type shape', () => {
    const field: Field = {
      name: 'population',
      type: 'numerique',
      sample: 12345,
    };
    expect(field.name).toBe('population');
    expect(field.type).toBe('numerique');
  });

  it('should have correct ChartConfig type shape', () => {
    const config: ChartConfig = {
      type: 'bar',
      labelField: 'region',
      valueField: 'population',
      aggregation: 'sum',
      limit: 10,
      sortOrder: 'desc',
      title: 'Population par region',
    };
    expect(config.type).toBe('bar');
    expect(config.aggregation).toBe('sum');
  });

  it('should have correct Message type shape', () => {
    const msg: Message = {
      role: 'user',
      content: 'Fais un graphique',
    };
    expect(msg.role).toBe('user');
  });

  it('should support all chart types', () => {
    const types: ChartConfig['type'][] = [
      'bar', 'line', 'pie', 'doughnut', 'radar',
      'horizontalBar', 'scatter', 'gauge', 'kpi', 'map',
    ];
    for (const type of types) {
      const config: ChartConfig = { type, valueField: 'value' };
      expect(config.type).toBe(type);
    }
  });
});
