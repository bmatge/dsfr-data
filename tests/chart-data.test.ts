import { describe, it, expect } from 'vitest';
import {
  extractLabelValues,
  aggregateByLabel,
  sortByValue,
  processChartData,
} from '../src/utils/chart-data.js';

describe('chart-data', () => {
  const rawData = [
    { name: 'Paris', value: 100 },
    { name: 'Lyon', value: 80 },
    { name: 'Paris', value: 50 },
    { name: 'Marseille', value: 120 },
    { name: 'Lyon', value: 40 },
  ];

  describe('extractLabelValues', () => {
    it('extracts labels and values from flat data', () => {
      const result = extractLabelValues(rawData, 'name', 'value');
      expect(result).toHaveLength(5);
      expect(result[0]).toEqual({ label: 'Paris', value: 100 });
      expect(result[1]).toEqual({ label: 'Lyon', value: 80 });
    });

    it('handles nested fields', () => {
      const nested = [
        { fields: { nom: 'A', score: 90 } },
        { fields: { nom: 'B', score: 70 } },
      ];
      const result = extractLabelValues(nested, 'fields.nom', 'fields.score');
      expect(result[0]).toEqual({ label: 'A', value: 90 });
      expect(result[1]).toEqual({ label: 'B', value: 70 });
    });

    it('returns N/A for missing labels', () => {
      const data = [{ value: 10 }];
      const result = extractLabelValues(data, 'name', 'value');
      expect(result[0].label).toBe('N/A');
    });

    it('returns 0 for non-numeric values', () => {
      const data = [{ name: 'X', value: 'abc' }];
      const result = extractLabelValues(data, 'name', 'value');
      expect(result[0].value).toBe(0);
    });
  });

  describe('aggregateByLabel', () => {
    const items = [
      { label: 'A', value: 10 },
      { label: 'B', value: 20 },
      { label: 'A', value: 30 },
      { label: 'B', value: 40 },
    ];

    it('returns data unchanged for "none" aggregation', () => {
      expect(aggregateByLabel(items, 'none')).toEqual(items);
    });

    it('sums values by label', () => {
      const result = aggregateByLabel(items, 'sum');
      const aItem = result.find(r => r.label === 'A');
      const bItem = result.find(r => r.label === 'B');
      expect(aItem?.value).toBe(40);
      expect(bItem?.value).toBe(60);
    });

    it('averages values by label', () => {
      const result = aggregateByLabel(items, 'avg');
      const aItem = result.find(r => r.label === 'A');
      expect(aItem?.value).toBe(20);
    });

    it('counts values by label', () => {
      const result = aggregateByLabel(items, 'count');
      const aItem = result.find(r => r.label === 'A');
      expect(aItem?.value).toBe(2);
    });

    it('finds min by label', () => {
      const result = aggregateByLabel(items, 'min');
      const aItem = result.find(r => r.label === 'A');
      expect(aItem?.value).toBe(10);
    });

    it('finds max by label', () => {
      const result = aggregateByLabel(items, 'max');
      const bItem = result.find(r => r.label === 'B');
      expect(bItem?.value).toBe(40);
    });
  });

  describe('sortByValue', () => {
    const items = [
      { label: 'A', value: 30 },
      { label: 'B', value: 10 },
      { label: 'C', value: 50 },
    ];

    it('returns data unchanged for "none"', () => {
      const result = sortByValue(items, 'none');
      expect(result[0].label).toBe('A');
    });

    it('sorts ascending', () => {
      const result = sortByValue(items, 'asc');
      expect(result[0].label).toBe('B');
      expect(result[2].label).toBe('C');
    });

    it('sorts descending', () => {
      const result = sortByValue(items, 'desc');
      expect(result[0].label).toBe('C');
      expect(result[2].label).toBe('B');
    });

    it('does not mutate the input array', () => {
      const original = [...items];
      sortByValue(items, 'asc');
      expect(items).toEqual(original);
    });
  });

  describe('processChartData', () => {
    it('returns empty arrays for empty data', () => {
      const result = processChartData([], 'name', 'value');
      expect(result).toEqual({ labels: [], values: [] });
    });

    it('processes flat data without aggregation', () => {
      const data = [
        { name: 'A', value: 10 },
        { name: 'B', value: 20 },
      ];
      const result = processChartData(data, 'name', 'value');
      expect(result.labels).toEqual(['A', 'B']);
      expect(result.values).toEqual([10, 20]);
    });

    it('applies full pipeline: aggregate + sort + limit', () => {
      const result = processChartData(rawData, 'name', 'value', 'sum', 'desc', 2);
      expect(result.labels).toHaveLength(2);
      // Paris sum = 150, Marseille = 120, Lyon = 120
      expect(result.labels[0]).toBe('Paris');
      expect(result.values[0]).toBe(150);
    });

    it('rounds values to 2 decimal places', () => {
      const data = [
        { name: 'A', value: 10 },
        { name: 'A', value: 20 },
        { name: 'A', value: 30 },
      ];
      const result = processChartData(data, 'name', 'value', 'avg');
      expect(result.values[0]).toBe(20);
    });

    it('respects limit parameter', () => {
      const result = processChartData(rawData, 'name', 'value', 'none', 'none', 3);
      expect(result.labels).toHaveLength(3);
    });
  });
});
