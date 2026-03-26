/**
 * Application state for the Builder Carto app.
 * Manages map config and multiple layers, each with its own source.
 */

export { PROXY_BASE_URL, LIB_URL } from '@dsfr-data/shared';

/** Loose source type — the shared Source interface doesn't cover all provider fields */
type AnySource = Record<string, any>;

export type LayerType = 'marker' | 'geoshape' | 'circle' | 'heatmap';

export type PopupMode = 'none' | 'tooltip' | 'popup' | 'panel-right' | 'panel-left';

export type TilePreset = 'ign-plan' | 'ign-ortho' | 'ign-topo' | 'ign-cadastre' | 'osm';

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
  filter: string;

  // Geoshape
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

  // Viewport
  minZoom: number;
  maxZoom: number;
  bbox: boolean;
  bboxDebounce: number;
  bboxField: string;
  maxItems: number;

  /** Resolved fields from source data */
  fields: { name: string; type: string }[];
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
    filter: '',

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

export const state: CartoState = {
  map: {
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
  },
  layers: [createLayer()],
  activeLayerId: 'layer-1',
  generationMode: 'embedded',
};
