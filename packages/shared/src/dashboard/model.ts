/**
 * Modele de document multi-blocs partage (#515).
 *
 * Promu ici depuis apps/dashboard/src/state.ts pour etre consomme par DEUX
 * apps : le dashboard (edition manuelle) et le studio (assistant IA). C'est le
 * modele qu'un LLM manipule par actions JSON validees — d'ou l'union
 * discriminee stricte (#521) : un `Record<string, any>` n'est pas
 * schematisable.
 *
 * apps/dashboard/src/state.ts re-exporte l'integralite de ce module : les
 * imports historiques (`./state.js`) restent valides.
 */

import type { ChartConfig } from './chart-config.js';

export type WidgetType = 'kpi' | 'chart' | 'table' | 'text' | 'filters' | 'map';

/**
 * Configuration d'un widget — UNION DISCRIMINEE sur `Widget.type` (#521).
 *
 * Le vocabulaire est aligne sur celui des composants `dsfr-data-*` et du
 * builder-IA : `value` (et non `valeur`), `icon` (et non `icone`), `type` (et
 * non `chartType`). Les anciens noms sont des alias FRANCAIS DEPRECIES des
 * composants — ceux-la memes que la reference generee des skills (#512) signale
 * desormais comme a proscrire. Les dashboards deja enregistres utilisent
 * l'ancienne forme : `normalizeWidget()` les convertit a la lecture.
 */

/** Indicateur chiffre cle. */
export interface KpiWidgetConfig {
  /** Expression de valeur : `champ`, `champ:avg`, `count:*`… (ex-`valeur`). */
  value: string;
  label: string;
  format: KpiFormat;
  /** Classe Remix Icon, ex. `ri-global-line` (ex-`icone`). */
  icon: string;
  /** Id d'une source du dashboard — l'export branche alors un KPI vivant (#515). */
  sourceId?: string;
}

export type KpiFormat = 'nombre' | 'pourcentage' | 'euro' | 'texte';

export type ChartWidgetType = 'bar' | 'line' | 'pie' | 'radar';

export type ChartPalette = 'categorical' | 'sequentialAscending' | 'divergent';

/** Graphique configure a la main dans le dashboard. */
export interface ManualChartWidgetConfig {
  fromFavorite?: false;
  fromBuilder?: false;
  /** Aligne sur `ChartConfig.type` du builder-IA (ex-`chartType`). */
  type: ChartWidgetType;
  labelField: string;
  valueField: string;
  palette: ChartPalette;
  /** Id d'une source du dashboard — l'export branche alors un graphique vivant (#515). */
  sourceId?: string;
}

/**
 * Graphique repris d'un favori : il porte le HTML DEJA GENERE par le builder,
 * et n'est donc pas reconfigurable ici — d'ou l'absence des champs ci-dessus.
 */
export interface FavoriteChartWidgetConfig {
  fromFavorite: true;
  fromBuilder?: false;
  favoriteId: string;
  /** Snippet HTML produit par le builder au moment de la mise en favori. */
  code: string;
  /** Etat du builder, reinjecte par « Editer dans le Builder ». */
  builderState?: unknown;
}

/**
 * Graphique produit par l'assistant (#515) : porte la ChartConfig COMPLETE du
 * builder-IA (16 types, where, aggregation…) — c'est le meme objet que valide
 * le JSON Schema strict de l'action `createChart`. L'export le traduit en
 * pipeline declaratif `dsfr-data-query` + composant d'affichage.
 */
export interface BuilderChartWidgetConfig {
  fromFavorite?: false;
  fromBuilder: true;
  chart: ChartConfig;
  /** Id de la source du dashboard dont ce widget consomme les donnees. */
  sourceId?: string;
}

export type ChartWidgetConfig =
  ManualChartWidgetConfig | FavoriteChartWidgetConfig | BuilderChartWidgetConfig;

export interface TableWidgetConfig {
  columns: string[];
  searchable: boolean;
  sortable: boolean;
  /** Id d'une source du dashboard — l'export branche alors un tableau vivant (#515). */
  sourceId?: string;
}

export type TextStyle = 'paragraph' | 'title' | 'callout';

export interface TextWidgetConfig {
  /** Contenu HTML saisi par l'utilisateur. */
  content: string;
  style: TextStyle;
}

/** Operateurs proposes pour un filtre partage (sous-ensemble de dsfr-data-context-filter). */
export type FilterOperator = 'eq' | 'in';

/** Un filtre partage : un champ, un libelle, des valeurs proposees. */
export interface DashboardFilterSpec {
  field: string;
  /** Libelle naturel (tags + label du select) — defaut : field. */
  label?: string;
  /** `eq` = select simple, `in` = select multiple. */
  operator?: FilterOperator;
  /**
   * Valeurs proposees dans le select. Remplies de facon DETERMINISTE par
   * l'app (valeurs distinctes des donnees chargees), pas par le LLM.
   */
  options?: string[];
}

/**
 * Bloc de filtres partages (#515) : rendu en selects DSFR + dsfr-data-context
 * a l'export. Les filtres s'appliquent aux sources listees (toutes par defaut).
 */
export interface FiltersWidgetConfig {
  filters: DashboardFilterSpec[];
  /** Ids des sources pilotees — vide/absent = toutes les sources du dashboard. */
  sourceIds?: string[];
}

/** Types de couches d'une carte Leaflet (aligne sur dsfr-data-map-layer). */
export type MapLayerType = 'marker' | 'circle' | 'heatmap' | 'geoshape';

/**
 * Une couche de carte (#531). Multi-sources par nature : chaque couche
 * reference sa propre source du dashboard.
 */
export interface MapLayerSpec {
  sourceId: string;
  type: MapLayerType;
  /** Libelle de la couche (legende / lisibilite du document). */
  label?: string;
  /** marker / circle / heatmap : champs de coordonnees. */
  latField?: string;
  lonField?: string;
  /** geoshape : champ GeoJSON. */
  geoField?: string;
  /**
   * Champ de valeur : rayon (circle), intensite (heatmap), remplissage
   * choroplethe (geoshape). Ignore pour marker.
   */
  valueField?: string;
  /** Champ de couleur categorielle (marker/circle/geoshape). */
  colorField?: string;
  /** Champs affiches dans la popup au clic (separes par des virgules). */
  popupFields?: string;
  /** Champ affiche au survol. */
  tooltipField?: string;
  selectedPalette?: string;
}

/**
 * Bloc carte Leaflet multi-couches (#531) : rendu en <dsfr-data-map> +
 * <dsfr-data-map-layer> a l'export. Premier bloc multi-sources du modele.
 */
export interface MapWidgetConfig {
  layers: MapLayerSpec[];
  /** Hauteur CSS de la carte — defaut 500px. */
  height?: string;
  /** Ajuste le viewport aux donnees (defaut true a l'export). */
  fitBounds?: boolean;
  /** Encarts territoriaux : "drom" ou territoires nommes ("guadeloupe,corse"). */
  insets?: string;
  /** Centre "lat,lon" (si fitBounds est coupe). */
  center?: string;
  zoom?: number;
}

export type WidgetConfig =
  | KpiWidgetConfig
  | ChartWidgetConfig
  | TableWidgetConfig
  | TextWidgetConfig
  | FiltersWidgetConfig
  | MapWidgetConfig;

interface WidgetBase {
  id: string;
  title: string;
  position: { row: number; col: number };
}

/**
 * Widget du dashboard. Union discriminee : `switch (widget.type)` restreint
 * `widget.config` au bon type, sans cast.
 */
export type Widget =
  | (WidgetBase & { type: 'kpi'; config: KpiWidgetConfig })
  | (WidgetBase & { type: 'chart'; config: ChartWidgetConfig })
  | (WidgetBase & { type: 'table'; config: TableWidgetConfig })
  | (WidgetBase & { type: 'text'; config: TextWidgetConfig })
  | (WidgetBase & { type: 'filters'; config: FiltersWidgetConfig })
  | (WidgetBase & { type: 'map'; config: MapWidgetConfig });

/** Un graphique issu d'un favori porte son HTML et n'est pas reconfigurable. */
export function isFavoriteChart(config: ChartWidgetConfig): config is FavoriteChartWidgetConfig {
  return config.fromFavorite === true;
}

/** Un graphique produit par l'assistant porte une ChartConfig complete (#515). */
export function isBuilderChart(config: ChartWidgetConfig): config is BuilderChartWidgetConfig {
  return (config as BuilderChartWidgetConfig).fromBuilder === true;
}

export interface DashboardSource {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface DashboardFavorite {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export interface DashboardData {
  id: string | null;
  name: string;
  description: string;
  createdAt: string | null;
  updatedAt: string | null;
  layout: {
    columns: number;
    gap: string;
    rowColumns?: Record<number, number>;
  };
  widgets: Widget[];
  sources: DashboardSource[];
}

export function createEmptyDashboard(): DashboardData {
  return {
    id: null,
    name: 'Mon tableau de bord',
    description: '',
    createdAt: null,
    updatedAt: null,
    layout: {
      columns: 2,
      gap: 'fr-grid-row--gutters',
    },
    widgets: [],
    sources: [],
  };
}

/** Returns the column count for a specific row, falling back to global default. */
export function getRowColumns(dashboard: DashboardData, rowIndex: number): number {
  return dashboard.layout.rowColumns?.[rowIndex] ?? dashboard.layout.columns ?? 2;
}

/** Sets the column count for a specific row. */
export function setRowColumns(dashboard: DashboardData, rowIndex: number, columns: number): void {
  if (!dashboard.layout.rowColumns) {
    dashboard.layout.rowColumns = {};
  }
  dashboard.layout.rowColumns[rowIndex] = columns;
}

/** Removes a row from rowColumns and re-indexes all rows above the deleted index. */
export function removeRowFromLayout(dashboard: DashboardData, rowIndex: number): void {
  if (!dashboard.layout.rowColumns) return;

  const updated: Record<number, number> = {};
  for (const [key, value] of Object.entries(dashboard.layout.rowColumns)) {
    const idx = Number(key);
    if (idx < rowIndex) {
      updated[idx] = value;
    } else if (idx > rowIndex) {
      updated[idx - 1] = value;
    }
  }
  dashboard.layout.rowColumns = Object.keys(updated).length > 0 ? updated : undefined;
}

// ---------------------------------------------------------------------------
// Normalisation a la lecture (#521)
// ---------------------------------------------------------------------------

/**
 * Convertit un widget lu depuis le stockage vers la forme courante.
 *
 * INDISPENSABLE : les dashboards sont persistes en `localStorage` ET en base
 * (MariaDB), et ils sont PARTAGEABLES entre utilisateurs. Un renommage sec de
 * `valeur`/`icone`/`chartType` casserait des donnees reelles, y compris celles
 * d'autres comptes. On lit donc les deux formes et on n'ecrit que la nouvelle.
 *
 * Tolerant a dessein : ces donnees viennent d'un stockage externe, pas du code.
 * Un widget incomplet est complete par ses defauts plutot que rejete — perdre
 * un dashboard entier pour un champ manquant serait pire que l'afficher degrade.
 */
export function normalizeWidget(raw: unknown): Widget | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Record<string, unknown>;
  const type = w.type;
  if (
    type !== 'kpi' &&
    type !== 'chart' &&
    type !== 'table' &&
    type !== 'text' &&
    type !== 'filters' &&
    type !== 'map'
  ) {
    return null;
  }

  const cfg = (w.config ?? {}) as Record<string, unknown>;
  const str = (...keys: string[]): string => {
    for (const k of keys) if (typeof cfg[k] === 'string') return cfg[k] as string;
    return '';
  };
  const optStr = (key: string): string | undefined =>
    typeof cfg[key] === 'string' && cfg[key] !== '' ? (cfg[key] as string) : undefined;
  const base: WidgetBase = {
    id: typeof w.id === 'string' ? w.id : crypto.randomUUID(),
    title: typeof w.title === 'string' ? w.title : getDefaultTitle(type),
    position: normalizePosition(w.position),
  };

  switch (type) {
    case 'kpi':
      return {
        ...base,
        type,
        config: {
          // `valeur` / `icone` : alias francais deprecies (#300), encore
          // presents dans tous les dashboards enregistres avant #521.
          value: str('value', 'valeur'),
          label: str('label'),
          format: oneOf(cfg.format, KPI_FORMATS, 'nombre'),
          icon: str('icon', 'icone'),
          sourceId: optStr('sourceId'),
        },
      };

    case 'chart':
      if (cfg.fromFavorite === true) {
        return {
          ...base,
          type,
          config: {
            fromFavorite: true,
            favoriteId: str('favoriteId'),
            code: str('code'),
            // Entrees anciennes : `builderState` ; recentes : `builderStateJson`.
            builderState: cfg.builderState ?? cfg.builderStateJson,
          },
        };
      }
      if (cfg.fromBuilder === true) {
        // La ChartConfig vient du JSON Schema strict de l'assistant : on la
        // reprend telle quelle, en exigeant seulement le minimum vital.
        const chart = cfg.chart;
        if (!chart || typeof chart !== 'object') return null;
        const c = chart as Record<string, unknown>;
        if (typeof c.type !== 'string' || typeof c.valueField !== 'string') return null;
        return {
          ...base,
          type,
          config: {
            fromBuilder: true,
            chart: chart as unknown as ChartConfig,
            sourceId: optStr('sourceId'),
          },
        };
      }
      return {
        ...base,
        type,
        config: {
          // `chartType` cote dashboard, `type` cote builder-IA : on garde `type`.
          type: oneOf(cfg.type ?? cfg.chartType, CHART_TYPES, 'bar'),
          labelField: str('labelField'),
          valueField: str('valueField'),
          palette: oneOf(cfg.palette, CHART_PALETTES, 'categorical'),
          sourceId: optStr('sourceId'),
        },
      };

    case 'table':
      return {
        ...base,
        type,
        config: {
          columns: Array.isArray(cfg.columns)
            ? cfg.columns.filter((c): c is string => typeof c === 'string')
            : [],
          searchable: cfg.searchable !== false,
          sortable: cfg.sortable !== false,
          sourceId: optStr('sourceId'),
        },
      };

    case 'text':
      return {
        ...base,
        type,
        config: {
          content: str('content'),
          style: oneOf(cfg.style, TEXT_STYLES, 'paragraph'),
        },
      };

    case 'filters':
      return {
        ...base,
        type,
        config: {
          filters: Array.isArray(cfg.filters)
            ? cfg.filters
                .map((f) => normalizeFilterSpec(f))
                .filter((f): f is DashboardFilterSpec => f !== null)
            : [],
          sourceIds: Array.isArray(cfg.sourceIds)
            ? cfg.sourceIds.filter((s): s is string => typeof s === 'string')
            : undefined,
        },
      };

    case 'map':
      return {
        ...base,
        type,
        config: {
          layers: Array.isArray(cfg.layers)
            ? cfg.layers
                .map((l) => normalizeMapLayer(l))
                .filter((l): l is MapLayerSpec => l !== null)
            : [],
          height: typeof cfg.height === 'string' && cfg.height !== '' ? cfg.height : undefined,
          fitBounds: typeof cfg.fitBounds === 'boolean' ? cfg.fitBounds : undefined,
          insets: typeof cfg.insets === 'string' && cfg.insets !== '' ? cfg.insets : undefined,
          center: typeof cfg.center === 'string' && cfg.center !== '' ? cfg.center : undefined,
          zoom: typeof cfg.zoom === 'number' ? cfg.zoom : undefined,
        },
      };
  }
}

export const MAP_LAYER_TYPES: readonly MapLayerType[] = ['marker', 'circle', 'heatmap', 'geoshape'];

function normalizeMapLayer(raw: unknown): MapLayerSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  if (typeof l.sourceId !== 'string' || l.sourceId === '') return null;
  const opt = (key: string): string | undefined =>
    typeof l[key] === 'string' && l[key] !== '' ? (l[key] as string) : undefined;
  return {
    sourceId: l.sourceId,
    type: oneOf(l.type, MAP_LAYER_TYPES, 'marker'),
    label: opt('label'),
    latField: opt('latField'),
    lonField: opt('lonField'),
    geoField: opt('geoField'),
    valueField: opt('valueField'),
    colorField: opt('colorField'),
    popupFields: opt('popupFields'),
    tooltipField: opt('tooltipField'),
    selectedPalette: opt('selectedPalette'),
  };
}

function normalizeFilterSpec(raw: unknown): DashboardFilterSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  if (typeof f.field !== 'string' || f.field === '') return null;
  return {
    field: f.field,
    label: typeof f.label === 'string' && f.label !== '' ? f.label : undefined,
    operator: oneOf(f.operator, FILTER_OPERATORS, 'eq'),
    options: Array.isArray(f.options)
      ? f.options.filter((o): o is string => typeof o === 'string')
      : undefined,
  };
}

export const KPI_FORMATS: readonly KpiFormat[] = ['nombre', 'pourcentage', 'euro', 'texte'];
export const CHART_TYPES: readonly ChartWidgetType[] = ['bar', 'line', 'pie', 'radar'];
export const CHART_PALETTES: readonly ChartPalette[] = [
  'categorical',
  'sequentialAscending',
  'divergent',
];
export const TEXT_STYLES: readonly TextStyle[] = ['paragraph', 'title', 'callout'];
export const FILTER_OPERATORS: readonly FilterOperator[] = ['eq', 'in'];

/**
 * Valeur si elle appartient a l'enumeration, defaut sinon.
 *
 * Sert autant a normaliser le stockage qu'a lire un `<select>` : dans les deux
 * cas on recoit une `string` sans garantie et il faut la ramener a l'union.
 */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function normalizePosition(value: unknown): { row: number; col: number } {
  const p = (value ?? {}) as Record<string, unknown>;
  return {
    row: typeof p.row === 'number' ? p.row : 0,
    col: typeof p.col === 'number' ? p.col : 0,
  };
}

/** Titre par defaut d'un widget fraichement pose. */
export function getDefaultTitle(type: WidgetType): string {
  const titles: Record<WidgetType, string> = {
    kpi: 'Indicateur',
    chart: 'Graphique',
    table: 'Tableau de données',
    text: 'Texte',
    filters: 'Filtres',
    map: 'Carte',
  };
  return titles[type];
}

/**
 * Configuration par defaut, typee par branche. Colocalisee avec les types :
 * ajouter un champ a une config sans lui donner de defaut devient une erreur
 * de compilation ici meme.
 */
export function getDefaultConfig(type: 'kpi'): KpiWidgetConfig;
export function getDefaultConfig(type: 'chart'): ManualChartWidgetConfig;
export function getDefaultConfig(type: 'table'): TableWidgetConfig;
export function getDefaultConfig(type: 'text'): TextWidgetConfig;
export function getDefaultConfig(type: 'filters'): FiltersWidgetConfig;
export function getDefaultConfig(type: 'map'): MapWidgetConfig;
export function getDefaultConfig(type: WidgetType): WidgetConfig;
export function getDefaultConfig(type: WidgetType): WidgetConfig {
  switch (type) {
    case 'kpi':
      return { value: '', label: 'Mon KPI', format: 'nombre', icon: '' };
    case 'chart':
      return { type: 'bar', labelField: '', valueField: '', palette: 'categorical' };
    case 'table':
      return { columns: [], searchable: true, sortable: true };
    case 'text':
      return { content: '<p>Votre texte ici...</p>', style: 'paragraph' };
    case 'filters':
      return { filters: [] };
    case 'map':
      return { layers: [] };
  }
}

/**
 * Cree un widget vide du type demande.
 *
 * Passe par un `switch` plutot que par `{ type, config: getDefaultConfig(type) }` :
 * TypeScript ne peut pas correler une variable `type` avec la branche d'union
 * correspondante, donc seul le branchement explicite donne la surete de type.
 */
export function createWidget(type: WidgetType, row: number, col: number): Widget {
  const base: WidgetBase = {
    id: crypto.randomUUID(),
    title: getDefaultTitle(type),
    position: { row, col },
  };
  switch (type) {
    case 'kpi':
      return { ...base, type, config: getDefaultConfig('kpi') };
    case 'chart':
      return { ...base, type, config: getDefaultConfig('chart') };
    case 'table':
      return { ...base, type, config: getDefaultConfig('table') };
    case 'text':
      return { ...base, type, config: getDefaultConfig('text') };
    case 'filters':
      return { ...base, type, config: getDefaultConfig('filters') };
    case 'map':
      return { ...base, type, config: getDefaultConfig('map') };
  }
}

/** Normalise un dashboard entier lu depuis le stockage. */
export function normalizeDashboard(raw: DashboardData): DashboardData {
  return {
    ...raw,
    widgets: (raw.widgets ?? [])
      .map((w) => normalizeWidget(w))
      .filter((w): w is Widget => w !== null),
  };
}
