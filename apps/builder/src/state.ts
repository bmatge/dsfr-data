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
  /** Chart.js instance for preview (not serialized) */
  chartInstance: unknown;
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
  a11yEnabled: true,
  a11yTable: true,
  a11yDownload: true,
  a11yDescription: '',
  chartInstance: null,
};
