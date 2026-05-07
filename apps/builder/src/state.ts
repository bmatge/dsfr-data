/**
 * Application state for the Builder app.
 * Defines interfaces, types, and the singleton state object.
 */

import type { Source } from '@dsfr-data/shared';
export { PROXY_BASE_URL, LIB_URL } from '@dsfr-data/shared';

/** Favorites localStorage key */
export const FAVORITES_KEY = 'dsfr-data-favorites';

/** Supported chart types */
export type ChartType =
  | 'bar'
  | 'horizontalBar'
  | 'line'
  | 'pie'
  | 'doughnut'
  | 'radar'
  | 'scatter'
  | 'gauge'
  | 'kpi'
  | 'map'
  | 'datalist';

/** Source types */
export type SourceType = 'saved';

/** Generation modes */
export type GenerationMode = 'embedded' | 'dynamic';

/** Aggregation functions */
export type AggregationType = 'avg' | 'sum' | 'count' | 'min' | 'max';

/** Sort orders */
export type SortOrder = 'asc' | 'desc' | 'none';

/** A datalist column definition */
export interface DatalistColumn {
  field: string;
  label: string;
  visible: boolean;
  filtrable: boolean;
}

/** Normalize pipeline configuration */
export interface NormalizeConfig {
  enabled: boolean;
  flatten: string;
  trim: boolean;
  numericAuto: boolean;
  numeric: string;
  rename: string;
  stripHtml: boolean;
  replace: string;
  lowercaseKeys: boolean;
}

/** A single facet field configuration */
export interface FacetFieldConfig {
  field: string;
  label: string;
  display: 'checkbox' | 'select' | 'multiselect' | 'radio';
  searchable: boolean;
  disjunctive: boolean;
}

/** Facets configuration */
export interface FacetsConfig {
  enabled: boolean;
  fields: FacetFieldConfig[];
  maxValues: number;
  sort: string;
  hideEmpty: boolean;
}

/** A field descriptor extracted from data */
export interface Field {
  name: string;
  fullPath?: string;
  displayName?: string;
  type: string;
  sample: unknown;
}

// Source is imported from @dsfr-data/shared (unified interface)
export type { Source } from '@dsfr-data/shared';

/** An extra data series configuration */
export interface ExtraSeries {
  field: string;
  label: string;
}

/** A single data record (aggregated result) */
export interface DataRecord {
  [key: string]: unknown;
  value?: number;
  value2?: number;
}

/** A favorite entry */
export interface Favorite {
  id: string;
  name: string;
  code: string;
  chartType: ChartType;
  source: string;
  createdAt: string;
  builderState: Partial<BuilderState>;
}

/** The builder state object (serializable parts for favorites) */
export interface BuilderState {
  sourceType: SourceType;
  apiUrl: string;
  savedSource: Source | null;
  localData: Record<string, unknown>[] | null;
  fields: Field[];
  chartType: ChartType;
  labelField: string;
  labelFieldLabel: string;
  valueField: string;
  valueFieldLabel: string;
  valueField2: string;
  extraSeries: ExtraSeries[];
  codeField: string;
  aggregation: AggregationType;
  sortOrder: SortOrder;
  /**
   * Field to sort by. Empty string means "auto" (sort by aggregated value for
   * charts, by label for datalist). Set to a specific field name to sort by
   * that field (e.g. labelField for alphabetical sort).
   */
  sortField: string;
  title: string;
  subtitle: string;
  palette: string;
  color2: string;
  data: DataRecord[];
  data2: DataRecord[];
  generationMode: GenerationMode;
  refreshInterval: number;
  advancedMode: boolean;
  queryFilter: string;
  queryGroupBy: string;
  queryAggregate: string;
  datalistRecherche: boolean;
  datalistFiltres: boolean;
  datalistExportCsv: boolean;
  datalistExportHtml: boolean;
  datalistColumns: DatalistColumn[];
  normalizeConfig: NormalizeConfig;
  facetsConfig: FacetsConfig;
  a11yEnabled: boolean;
  a11yTable: boolean;
  a11yDownload: boolean;
  a11yDescription: string;
  databoxEnabled: boolean;
  databoxTitle: string;
  databoxSource: string;
  databoxDate: string;
  databoxDownload: boolean;
  databoxScreenshot: boolean;
  databoxFullscreen: boolean;
  databoxTrend: string;
  /** Chart.js instance for preview (not serialized) */
  chartInstance: unknown;
  /** True when using sample data (transient, not serialized) */
  isSampleData: boolean;
}

/** Result of computing how complete the current builder configuration is. */
export interface Completeness {
  /** True when a source has been loaded and fields are available. */
  source: boolean;
  /** True when a chart type is selected. */
  type: boolean;
  /** True when the mandatory fields for the selected chart type are filled. */
  config: boolean;
  /** True once the chart has been generated at least once (runtime-only). */
  generate: boolean;
  /**
   * Human-readable labels describing what is missing for the current step.
   * Empty when every step up to (and including) `config` is complete.
   */
  missing: string[];
}

/**
 * Pure function: inspect the state and return which of the 4 "gates" (source,
 * type, config, generate) are reached, plus a human list of what is missing.
 *
 * Used by the progress stepper, section indicators, empty-state checklist and
 * the "Generate" button sub-text. Keeping it a pure function (no DOM access)
 * makes it trivial to unit-test and safe to call on every input change.
 *
 * `generated` must be passed by the caller since it is not stored in `state`
 * (it is runtime UI state tracked by the preview panel).
 */
export function getCompleteness(s: BuilderState, generated: boolean = false): Completeness {
  const source = Array.isArray(s.fields) && s.fields.length > 0;
  const type = !!s.chartType;

  let config = false;
  const missing: string[] = [];

  if (!source) {
    missing.push('une source de données');
  }
  if (!type) {
    missing.push('un type de graphique');
  }

  if (source && type) {
    switch (s.chartType) {
      case 'datalist':
        config = !!s.labelField;
        if (!config) missing.push('le champ à afficher');
        break;
      case 'kpi':
      case 'gauge':
        config = !!s.valueField;
        if (!config) missing.push('le champ numérique (valeur)');
        break;
      case 'map':
        config = !!s.valueField && !!s.codeField;
        if (!s.codeField) missing.push('le champ code (département/région)');
        if (!s.valueField) missing.push('le champ numérique (valeur)');
        break;
      default:
        config = !!s.labelField && !!s.valueField;
        if (!s.labelField) missing.push('le champ catégorie (axe X)');
        if (!s.valueField) missing.push('le champ numérique (axe Y)');
        break;
    }
  }

  return {
    source,
    type,
    config,
    generate: generated && source && type && config,
    missing,
  };
}

/** The singleton application state */
export const state: BuilderState = {
  sourceType: 'saved',
  apiUrl: '',
  savedSource: null,
  localData: null,
  fields: [],
  chartType: 'bar',
  labelField: '',
  labelFieldLabel: '',
  valueField: '',
  valueFieldLabel: '',
  valueField2: '',
  extraSeries: [],
  codeField: '',
  aggregation: 'avg',
  sortOrder: 'desc',
  sortField: '',
  title: 'Mon graphique',
  subtitle: '',
  palette: 'default',
  color2: '#E1000F',
  data: [],
  data2: [],
  generationMode: 'embedded',
  refreshInterval: 0,
  advancedMode: false,
  queryFilter: '',
  queryGroupBy: '',
  queryAggregate: '',
  datalistRecherche: true,
  datalistFiltres: false,
  datalistExportCsv: true,
  datalistExportHtml: false,
  datalistColumns: [],
  normalizeConfig: {
    enabled: false,
    flatten: '',
    trim: false,
    numericAuto: false,
    numeric: '',
    rename: '',
    stripHtml: false,
    replace: '',
    lowercaseKeys: false,
  },
  facetsConfig: {
    enabled: false,
    fields: [],
    maxValues: 6,
    sort: 'count',
    hideEmpty: false,
  },
  isSampleData: false,
  a11yEnabled: true,
  a11yTable: true,
  a11yDownload: true,
  a11yDescription: '',
  databoxEnabled: false,
  databoxTitle: '',
  databoxSource: '',
  databoxDate: '',
  databoxDownload: true,
  databoxScreenshot: false,
  databoxFullscreen: false,
  databoxTrend: '',
  chartInstance: null,
};
