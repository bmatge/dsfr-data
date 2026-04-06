/**
 * chart-data - Utilitaires partagés de traitement de données pour les graphiques
 *
 * Factorise la logique d'extraction label/value et d'agrégation
 * commune à dsfr-data-chart.
 */
import { getByPath } from './json-path.js';

export interface ProcessedDataItem {
  label: string;
  value: number;
}

export type ChartAggregation = 'none' | 'sum' | 'avg' | 'count' | 'min' | 'max';

/**
 * Extrait les paires label/valeur depuis les données brutes
 */
export function extractLabelValues(
  data: unknown[],
  labelField: string,
  valueField: string
): ProcessedDataItem[] {
  return data.map((record) => ({
    label: String(getByPath(record, labelField) ?? 'N/A'),
    value: Number(getByPath(record, valueField)) || 0,
  }));
}

/**
 * Agrège les données par label
 */
export function aggregateByLabel(
  data: ProcessedDataItem[],
  aggregation: ChartAggregation
): ProcessedDataItem[] {
  if (aggregation === 'none') return data;

  const groups = new Map<string, number[]>();
  for (const item of data) {
    const existing = groups.get(item.label) || [];
    existing.push(item.value);
    groups.set(item.label, existing);
  }

  const result: ProcessedDataItem[] = [];
  for (const [label, values] of groups) {
    result.push({ label, value: computeGroupValue(values, aggregation) });
  }

  return result;
}

function computeGroupValue(values: number[], aggregation: ChartAggregation): number {
  switch (aggregation) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'count':
      return values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    default:
      return values[0] || 0;
  }
}

/**
 * Trie les données par valeur
 */
export function sortByValue(
  data: ProcessedDataItem[],
  order: 'none' | 'asc' | 'desc'
): ProcessedDataItem[] {
  if (order === 'none') return data;
  return [...data].sort((a, b) => (order === 'desc' ? b.value - a.value : a.value - b.value));
}

/**
 * Pipeline complet: extract -> aggregate -> sort -> limit
 */
export function processChartData(
  rawData: unknown[],
  labelField: string,
  valueField: string,
  aggregation: ChartAggregation = 'none',
  sortOrder: 'none' | 'asc' | 'desc' = 'none',
  limit = 0
): { labels: string[]; values: number[] } {
  if (!rawData || rawData.length === 0) {
    return { labels: [], values: [] };
  }

  let processed = extractLabelValues(rawData, labelField, valueField);
  processed = aggregateByLabel(processed, aggregation);
  processed = sortByValue(processed, sortOrder);

  if (limit > 0) {
    processed = processed.slice(0, limit);
  }

  return {
    labels: processed.map((p) => p.label),
    values: processed.map((p) => Math.round(p.value * 100) / 100),
  };
}
