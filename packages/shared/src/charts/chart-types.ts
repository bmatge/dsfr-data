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
  'map-reg': 'map-chart',
  'map-aca': 'map-chart',
  'map-monde': 'map-chart',
};

/**
 * Maps map chart types to the <map-chart> `level` attribute
 * (unified map API, DSFR Chart >= 2.1.0).
 */
export const MAP_LEVEL_MAP: Record<string, string> = {
  map: 'dep',
  'map-reg': 'reg',
  'map-aca': 'aca',
  'map-monde': 'monde',
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
  | 'map-reg'
  | 'map-aca'
  | 'map-monde';
