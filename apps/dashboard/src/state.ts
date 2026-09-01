/**
 * Dashboard app - State management and types
 */

export type WidgetType = 'kpi' | 'chart' | 'table' | 'text';

/**
 * Configuration d'un widget — UNION DISCRIMINEE sur `Widget.type` (#521).
 *
 * C'etait un `Record<string, any>`, dette assumee en phase 1 de #45. Elle est
 * levee ici parce que l'assistant multi-blocs (#515) repose sur le principe
 * fondateur du builder-IA : le LLM ne produit jamais de HTML, seulement une
 * action JSON validee contre un JSON Schema STRICT. Un `Record<string, any>`
 * n'est pas schematisable.
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
}

export type KpiFormat = 'nombre' | 'pourcentage' | 'euro' | 'texte';

export type ChartWidgetType = 'bar' | 'line' | 'pie' | 'radar';

export type ChartPalette = 'categorical' | 'sequentialAscending' | 'divergent';

/** Graphique configure a la main dans le dashboard. */
export interface ManualChartWidgetConfig {
  fromFavorite?: false;
  /** Aligne sur `ChartConfig.type` du builder-IA (ex-`chartType`). */
  type: ChartWidgetType;
  labelField: string;
  valueField: string;
  palette: ChartPalette;
}

/**
 * Graphique repris d'un favori : il porte le HTML DEJA GENERE par le builder,
 * et n'est donc pas reconfigurable ici — d'ou l'absence des champs ci-dessus.
 */
export interface FavoriteChartWidgetConfig {
  fromFavorite: true;
  favoriteId: string;
  /** Snippet HTML produit par le builder au moment de la mise en favori. */
  code: string;
  /** Etat du builder, reinjecte par « Editer dans le Builder ». */
  builderState?: unknown;
}

export type ChartWidgetConfig = ManualChartWidgetConfig | FavoriteChartWidgetConfig;

export interface TableWidgetConfig {
  columns: string[];
  searchable: boolean;
  sortable: boolean;
}

export type TextStyle = 'paragraph' | 'title' | 'callout';

export interface TextWidgetConfig {
  /** Contenu HTML saisi par l'utilisateur. */
  content: string;
  style: TextStyle;
}

export type WidgetConfig =
  KpiWidgetConfig | ChartWidgetConfig | TableWidgetConfig | TextWidgetConfig;

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
  | (WidgetBase & { type: 'text'; config: TextWidgetConfig });

/** Un graphique issu d'un favori porte son HTML et n'est pas reconfigurable. */
export function isFavoriteChart(config: ChartWidgetConfig): config is FavoriteChartWidgetConfig {
  return config.fromFavorite === true;
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

export interface AppState {
  dashboard: DashboardData;
  selectedWidget: Widget | null;
  favorites: DashboardFavorite[];
  savedDashboards: DashboardData[];
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

export const state: AppState = {
  dashboard: createEmptyDashboard(),
  selectedWidget: null,
  favorites: [],
  savedDashboards: [],
};

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
  if (type !== 'kpi' && type !== 'chart' && type !== 'table' && type !== 'text') return null;

  const cfg = (w.config ?? {}) as Record<string, unknown>;
  const str = (...keys: string[]): string => {
    for (const k of keys) if (typeof cfg[k] === 'string') return cfg[k] as string;
    return '';
  };
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
      return {
        ...base,
        type,
        config: {
          // `chartType` cote dashboard, `type` cote builder-IA : on garde `type`.
          type: oneOf(cfg.type ?? cfg.chartType, CHART_TYPES, 'bar'),
          labelField: str('labelField'),
          valueField: str('valueField'),
          palette: oneOf(cfg.palette, CHART_PALETTES, 'categorical'),
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
  }
}

export const KPI_FORMATS: readonly KpiFormat[] = ['nombre', 'pourcentage', 'euro', 'texte'];
export const CHART_TYPES: readonly ChartWidgetType[] = ['bar', 'line', 'pie', 'radar'];
export const CHART_PALETTES: readonly ChartPalette[] = [
  'categorical',
  'sequentialAscending',
  'divergent',
];
export const TEXT_STYLES: readonly TextStyle[] = ['paragraph', 'title', 'callout'];

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
