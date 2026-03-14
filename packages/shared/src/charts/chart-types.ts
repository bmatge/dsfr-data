/**
 * DSFR Chart type mapping and normalization.
 * Single source of truth for chart type → DSFR tag resolution.
 */

/** Maps user-facing chart types (including aliases) to DSFR Chart element tag names */
export const DSFR_TAG_MAP: Record<string, string> = {
  bar: 'bar-chart',
  horizontalBar: 'bar-chart',
  line: 'line-chart',
  pie: 'pie-chart',
  doughnut: 'pie-chart',
  radar: 'radar-chart',
  scatter: 'scatter-chart',
  gauge: 'gauge-chart',
  'bar-line': 'bar-line-chart',
  map: 'map-chart',
  'map-reg': 'map-chart-reg',
};

/** Canonical chart types (without aliases) */
export type DSFRChartType =
  | 'bar'
  | 'line'
  | 'pie'
  | 'radar'
  | 'gauge'
  | 'scatter'
  | 'bar-line'
  | 'map'
  | 'map-reg';

const ALIASES: Record<string, DSFRChartType> = {
  horizontalBar: 'bar',
  doughnut: 'pie',
};

/** Normalise a user-facing chart type to its canonical form */
export function normalizeChartType(type: string): DSFRChartType {
  return (ALIASES[type] || type) as DSFRChartType;
}

/** Check whether a chart type string is supported */
export function isValidChartType(type: string): boolean {
  return type in DSFR_TAG_MAP;
}
