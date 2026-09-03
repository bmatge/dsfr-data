/**
 * Application state for the Builder Carto app.
 * Manages map config and multiple layers, each with its own source.
 * The whole state is persisted to localStorage (BUILDER_CARTO_STATE_KEY)
 * so a reload does not lose the work in progress.
 */

import { loadFromStorage, saveToStorageQuiet } from '@dsfr-data/shared';

export { PROXY_BASE_URL, LIB_URL } from '@dsfr-data/shared';

/**
 * Loose source type — the shared Source interface doesn't cover all provider
 * fields, et les consommateurs (code-generator, main.ts) accèdent aux champs
 * dynamiquement. Un `Record<string, unknown>` casserait les concatenations
 * string. Retyper proprement = discriminated union par provider, hors scope
 * du mécanique phase 3b.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cf. commentaire bloc
export type AnySource = Record<string, any>;

export type LayerType = 'marker' | 'geoshape' | 'circle' | 'heatmap';

export type PopupMode = 'none' | 'tooltip' | 'popup' | 'panel-right' | 'panel-left';

export type TilePreset =
  | 'ign-plan'
  | 'ign-ortho'
  | 'ign-cadastre'
  | 'osm'
  | 'osm-standard'
  | 'opentopomap'
  // Deprecies (redirigent vers ign-plan) — conserves pour les etats sauvegardes
  | 'ign-topo'
  | 'carto-positron'
  | 'carto-dark';

/**
 * Les 12 territoires d'encart supportes par <dsfr-data-map-inset>
 * (presets de packages/core/src/utils/territories.ts — liste stable,
 * dupliquee ici car l'app consomme la lib buildee, pas ses sources TS).
 */
export const INSET_TERRITORIES: { id: string; label: string; drom: boolean }[] = [
  { id: 'guadeloupe', label: 'Guadeloupe', drom: true },
  { id: 'martinique', label: 'Martinique', drom: true },
  { id: 'guyane', label: 'Guyane', drom: true },
  { id: 'la-reunion', label: 'La Réunion', drom: true },
  { id: 'mayotte', label: 'Mayotte', drom: true },
  { id: 'corse', label: 'Corse', drom: false },
  { id: 'saint-pierre-et-miquelon', label: 'Saint-Pierre-et-Miquelon', drom: false },
  { id: 'saint-martin', label: 'Saint-Martin', drom: false },
  { id: 'saint-barthelemy', label: 'Saint-Barthélemy', drom: false },
  { id: 'nouvelle-caledonie', label: 'Nouvelle-Calédonie', drom: false },
  { id: 'polynesie-francaise', label: 'Polynésie française', drom: false },
  { id: 'wallis-et-futuna', label: 'Wallis-et-Futuna', drom: false },
];

export const DROM_IDS = INSET_TERRITORIES.filter((t) => t.drom).map((t) => t.id);

/** Champ detecte sur la source d'une couche (assistance de saisie). */
export interface FieldInfo {
  name: string;
  /** number | string | object | mixed */
  type: string;
  /** Part de valeurs renseignees sur l'echantillon, 0..1 */
  fillRate: number;
}

export interface LayerConfig {
  id: string;
  name: string;
  source: AnySource | null;
  type: LayerType;
  visible: boolean;

  // Geo fields
  latField: string;
  lonField: string;
  geoField: string;

  // Information display
  popupMode: PopupMode;
  popupFields: string;
  popupTemplate: string;
  tooltipField: string;
  titleField: string;
  popupWidth: string;

  // Appearance
  color: string;
  colorField: string;
  colorMap: string;
  filter: string;
  /** Classe CSS appliquee aux traces SVG (motifs, hachures) — geoshape/circle */
  shapeClass: string;
  /** Couche decorative : ni clic, ni tooltip, exclue du fit-bounds */
  noInteractive: boolean;

  // Geoshape / circle
  fillField: string;
  fillOpacity: number;
  selectedPalette: string;

  // Circle
  radius: number;
  radiusField: string;
  radiusUnit: 'px' | 'm';
  radiusMin: number;
  radiusMax: number;

  // Marker
  cluster: boolean;
  clusterRadius: number;

  // Heatmap
  heatRadius: number;
  heatBlur: number;
  heatField: string;

  // Timeline
  timeField: string;
  timeBucket: 'none' | 'hour' | 'day' | 'month' | 'year';
  timeMode: 'snapshot' | 'cumulative';

  // Viewport
  minZoom: number;
  maxZoom: number;
  bbox: boolean;
  bboxDebounce: number;
  bboxField: string;
  maxItems: number;

  /** Resolved fields from source data (assistance de saisie) */
  fields: FieldInfo[];
  /** Preview data */
  data: Record<string, unknown>[];
}

export interface MapConfig {
  center: string;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  tiles: TilePreset;
  height: string;
  name: string;
  fitBounds: boolean;
  noControls: boolean;
  maxBounds: string;
  /** Carte figee : aucune interaction (vignettes, encarts) */
  locked: boolean;
  /** Restreint les fonds de carte aux presets souverains IGN */
  sovereignOnly: boolean;
  /** Territoires d'encart selectionnes (ids de INSET_TERRITORIES) */
  insets: string[];
  /** Vitesse de lecture de la timeline (0.5, 1, 2, 4) */
  timelineSpeed: number;
  /** Intervalle de base entre deux pas de temps (ms) */
  timelineInterval: number;
  /** Genere le compagnon d'accessibilite <dsfr-data-a11y> */
  a11y: boolean;
}

export interface CartoState {
  map: MapConfig;
  layers: LayerConfig[];
  activeLayerId: string;
  generationMode: 'embedded' | 'dynamic';
}

let layerCounter = 0;

export function createLayer(): LayerConfig {
  layerCounter++;
  return {
    id: `layer-${layerCounter}`,
    name: `Couche ${layerCounter}`,
    source: null,
    type: 'marker',
    visible: true,

    latField: '',
    lonField: '',
    geoField: '',

    popupMode: 'tooltip',
    popupFields: '',
    popupTemplate: '',
    tooltipField: '',
    titleField: '',
    popupWidth: '350px',

    color: '#000091',
    colorField: '',
    colorMap: '',
    filter: '',
    shapeClass: '',
    noInteractive: false,

    fillField: '',
    fillOpacity: 0.6,
    selectedPalette: '',

    radius: 8,
    radiusField: '',
    radiusUnit: 'px' as const,
    radiusMin: 4,
    radiusMax: 30,

    cluster: false,
    clusterRadius: 80,

    heatRadius: 25,
    heatBlur: 15,
    heatField: '',

    timeField: '',
    timeBucket: 'none' as const,
    timeMode: 'snapshot' as const,

    minZoom: 0,
    maxZoom: 18,
    bbox: false,
    bboxDebounce: 300,
    bboxField: '',
    maxItems: 5000,

    fields: [],
    data: [],
  };
}

function createDefaultMap(): MapConfig {
  return {
    center: '46.603,2.888',
    zoom: 6,
    minZoom: 2,
    maxZoom: 18,
    tiles: 'ign-plan',
    height: '500px',
    name: '',
    fitBounds: false,
    noControls: false,
    maxBounds: '',
    locked: false,
    sovereignOnly: false,
    insets: [],
    timelineSpeed: 1,
    timelineInterval: 1000,
    a11y: true,
  };
}

export const state: CartoState = {
  map: createDefaultMap(),
  layers: [createLayer()],
  activeLayerId: 'layer-1',
  generationMode: 'embedded',
};

// ---------------------------------------------------------------------------
// Persistance de l'etat du builder (reprise de session)
// ---------------------------------------------------------------------------

export const BUILDER_CARTO_STATE_KEY = 'dsfr-data-builder-carto-state';

export function persistState(): void {
  saveToStorageQuiet(BUILDER_CARTO_STATE_KEY, state);
}

/**
 * Restaure l'etat sauvegarde (localStorage). Merge defensif : les champs
 * ajoutes par les versions ulterieures gardent leur defaut si absents de
 * l'etat sauvegarde (anciens enregistrements).
 */
export function restoreState(): boolean {
  const saved = loadFromStorage<Partial<CartoState> | null>(BUILDER_CARTO_STATE_KEY, null);
  if (!saved || !Array.isArray(saved.layers) || saved.layers.length === 0) return false;

  state.map = { ...createDefaultMap(), ...(saved.map ?? {}) };
  if (!Array.isArray(state.map.insets)) state.map.insets = [];

  state.layers = saved.layers.map((l) => ({ ...createLayer(), ...l }));
  // layerCounter doit depasser tous les ids restaures (layer-N)
  layerCounter = state.layers.reduce((max, l) => {
    const n = Number(String(l.id).replace('layer-', ''));
    return Number.isFinite(n) && n > max ? n : max;
  }, layerCounter);

  state.activeLayerId =
    saved.activeLayerId && state.layers.some((l) => l.id === saved.activeLayerId)
      ? saved.activeLayerId
      : state.layers[0].id;
  state.generationMode = saved.generationMode === 'dynamic' ? 'dynamic' : 'embedded';
  return true;
}

/** Reinitialise completement l'etat (bouton « Repartir de zero »). */
export function resetState(): void {
  layerCounter = 0;
  state.map = createDefaultMap();
  state.layers = [createLayer()];
  state.activeLayerId = state.layers[0].id;
  state.generationMode = 'embedded';
  persistState();
}
