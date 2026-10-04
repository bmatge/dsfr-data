/**
 * Application state for the Builder app.
 * Defines interfaces, types, and the singleton state object.
 */

import type { Source } from '@dsfr-data/shared';
import { REFERENTIELS } from './geo-codes.js';
import { lectureDefaults, type LectureSettings } from './lecture.js';
export { isMapType, MAP_TYPES, type MapType } from './geo-codes.js';
export { PROXY_BASE_URL, PROXY_BASE_URL_EMBED, LIB_URL } from '@dsfr-data/shared';

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
  | 'datalist'
  // Formes ajoutées par #1204 : la bibliothèque les rendait, le Builder non.
  | 'podium'
  | 'bar-line'
  | 'map-reg'
  | 'map-aca'
  | 'map-monde';

/**
 * Types qui acceptent plusieurs séries (bouton « Ajouter une série »). Source
 * unique : `chart-type-selector.ts` (affichage du groupe) et le prérequis
 * `type-multi-series` de l'assistant (#1006) la lisent.
 */
export const MULTI_SERIES_TYPES: readonly ChartType[] = ['bar', 'horizontalBar', 'line', 'radar'];

/** Le type accepte-t-il plusieurs séries ? */
export function supportsMultiSeries(type: ChartType): boolean {
  return MULTI_SERIES_TYPES.includes(type);
}

/**
 * Types qui lisent un format LONG (`series-field` de `dsfr-data-chart`) : une
 * ligne par étiquette et par série, la série étant nommée par un champ. Mêmes
 * types que les séries multiples, dont c'est l'autre écriture (#1204).
 */
export const SERIES_FIELD_TYPES: readonly ChartType[] = MULTI_SERIES_TYPES;

/** Types dont les séries peuvent s'empiler (`stacked` : barres seulement, côté lib). */
export const STACKED_TYPES: readonly ChartType[] = ['bar', 'horizontalBar'];

/** Champ de séries pris en compte : celui de l'état, si le type lit un format long. */
export function activeSeriesField(s: Pick<BuilderState, 'chartType' | 'seriesField'>): string {
  return SERIES_FIELD_TYPES.includes(s.chartType) ? s.seriesField || '' : '';
}

/** L'empilement s'applique-t-il ? (réglage coché ET type en barres) */
export function stackedActive(s: Pick<BuilderState, 'chartType' | 'stacked'>): boolean {
  return !!s.stacked && STACKED_TYPES.includes(s.chartType);
}

/**
 * Types rendus par un composant de la bibliothèque dans TOUS les modes de
 * génération, données intégrées comprises (#1204). Les types historiques
 * écrivent, en données intégrées, la balise DSFR Chart nue (`<bar-chart>`) ;
 * ceux-ci écrivent `<dsfr-data-source data='…'>` suivi du composant, qui porte
 * la mise en forme (podium, deux axes du barres + ligne).
 */
export const LIB_RENDERED_TYPES: readonly ChartType[] = [
  'podium',
  'bar-line',
  // La carte départementale historique garde sa balise nue ; les trois
  // découpages ajoutés laissent la bibliothèque traduire codes et noms vers
  // les clés de DSFR Chart, et compter ce qu'elle ignore.
  'map-reg',
  'map-aca',
  'map-monde',
];

/**
 * Séries tracées en plus de la première, selon le type (source unique, lue par
 * le générateur de code et l'agrégation locale) :
 * - barres + ligne : exactement une, la mesure de la ligne ;
 * - types multi-séries : celles du formulaire — sauf en format long, où les
 *   séries viennent d'un champ (`series-field`) : les deux écritures s'excluent ;
 * - les autres : aucune.
 */
export function tracedExtraSeries(
  s: Pick<
    BuilderState,
    'chartType' | 'extraSeries' | 'lineField' | 'lineFieldLabel' | 'seriesField'
  >
): ExtraSeries[] {
  if (s.chartType === 'bar-line') {
    return s.lineField ? [{ field: s.lineField, label: s.lineFieldLabel }] : [];
  }
  if (!supportsMultiSeries(s.chartType)) return [];
  if (activeSeriesField(s)) return [];
  return s.extraSeries.filter((x) => x.field);
}

/** Podium : nombre de places par défaut (celui de `dsfr-data-podium`). */
export const PODIUM_PLACES_DEFAUT = 5;

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

/** An extra data séries configuration */
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
  /**
   * Originating app. Maps to server column `source_app`. Older entries may
   * still carry the legacy field name `source` — readers must support both.
   */
  sourceApp: string;
  createdAt: string;
  /**
   * Serialized builder state. Maps to server column `builder_state_json`.
   * Older entries may still carry the legacy field name `builderState`.
   */
  builderStateJson: Partial<BuilderState>;
}

/**
 * The builder state object (serializable parts for favorites).
 * Les réglages de lecture (#1218 : unité, bornes, lignes de référence, cibles,
 * couleurs fixées, catégories vides, synthèse de carte) sont décrits dans
 * `lecture.ts`.
 */
export interface BuilderState extends LectureSettings {
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
  /**
   * Barres + ligne (#1204) : champ de la seconde mesure, tracée en ligne
   * (`value-field-2` de `dsfr-data-chart`), et son nom affiché.
   */
  lineField: string;
  lineFieldLabel: string;
  /** Podium (#1204) : nombre de places affichées (`max-items`). */
  podiumMaxItems: number;
  /**
   * Format long (#1204) : champ qui nomme la série de chaque ligne
   * (`series-field`). Exclusif avec `extraSeries` ; vide = format large.
   */
  seriesField: string;
  /** Barres empilées (#1204) : `stacked` de `dsfr-data-chart`. */
  stacked: boolean;
  codeField: string;
  aggregation: AggregationType;
  /**
   * True once the user has explicitly picked an aggregation in the UI.
   * While false, the smart default re-evaluates on each value-field change.
   * Reset to false when a new source is loaded.
   */
  aggregationUserModified: boolean;
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
  /**
   * Inscrit l'état de la vue dans l'adresse de la page : filtres à facettes
   * (`url-sync` + `url-params` sur `dsfr-data-facets`) et numéro de page
   * (`url-sync` sur `dsfr-data-list`). Un seul réglage pour le concept.
   */
  urlSync: boolean;
  /**
   * Nom du paramètre d'adresse portant le numéro de page
   * (`url-page-param` de `dsfr-data-list`). Défaut : `page`.
   */
  urlPageParam: string;
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
      case 'map-reg':
      case 'map-aca':
      case 'map-monde':
        config = !!s.valueField && !!s.codeField;
        if (!s.codeField) missing.push(REFERENTIELS[s.chartType].manque);
        if (!s.valueField) missing.push('le champ numérique (valeur)');
        break;
      case 'bar-line':
        config = !!s.labelField && !!s.valueField && !!s.lineField;
        if (!s.labelField) missing.push('le champ Étiquettes');
        if (!s.valueField) missing.push('le champ des barres');
        if (!s.lineField) missing.push('le champ de la ligne');
        break;
      default:
        config = !!s.labelField && !!s.valueField;
        if (!s.labelField) missing.push('le champ Étiquettes');
        if (!s.valueField) missing.push('le champ Valeur à mesurer');
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
  lineField: '',
  lineFieldLabel: '',
  podiumMaxItems: PODIUM_PLACES_DEFAUT,
  seriesField: '',
  stacked: false,
  codeField: '',
  aggregation: 'avg',
  aggregationUserModified: false,
  sortOrder: 'none',
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
  urlSync: false,
  urlPageParam: 'page',
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
  ...lectureDefaults(),
};
