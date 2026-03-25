/**
 * Application state for the Builder Carto app.
 * Manages map config and multiple layers, each with its own source.
 */

export { PROXY_BASE_URL, LIB_URL } from '@dsfr-data/shared';

/** Loose source type — the shared Source interface doesn't cover all provider fields */
type AnySource = Record<string, any>;

export type LayerType = 'marker' | 'geoshape' | 'circle' | 'heatmap';

export type TilePreset = 'ign-plan' | 'ign-ortho' | 'ign-topo' | 'ign-cadastre' | 'osm';

export interface LayerConfig {
  id: string;
  name: string;
  source: AnySource | null;
  type: LayerType;
  latField: string;
  lonField: string;
  geoField: string;
  popupFields: string;
  popupTemplate: string;
  tooltipField: string;
  color: string;
  fillField: string;
  fillOpacity: number;
  selectedPalette: string;
  radiusField: string;
  radiusMin: number;
  radiusMax: number;
  cluster: boolean;
  clusterRadius: number;
  minZoom: number;
  maxZoom: number;
  bbox: boolean;
  maxItems: number;
  heatRadius: number;
  heatBlur: number;
  heatField: string;
  /** Resolved fields from source data */
  fields: { name: string; type: string }[];
  /** Preview data */
  data: Record<string, unknown>[];
}

export interface MapConfig {
  center: string;
  zoom: number;
  tiles: TilePreset;
  height: string;
  name: string;
  fitBounds: boolean;
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
    latField: '',
    lonField: '',
    geoField: '',
    popupFields: '',
    popupTemplate: '',
    tooltipField: '',
    color: '#000091',
    fillField: '',
    fillOpacity: 0.6,
    selectedPalette: '',
    radiusField: '',
    radiusMin: 4,
    radiusMax: 30,
    cluster: false,
    clusterRadius: 80,
    minZoom: 0,
    maxZoom: 18,
    bbox: false,
    maxItems: 5000,
    heatRadius: 25,
    heatBlur: 15,
    heatField: '',
    fields: [],
    data: [],
  };
}

export const state: CartoState = {
  map: {
    center: '46.603,2.888',
    zoom: 6,
    tiles: 'ign-plan',
    height: '600px',
    name: '',
    fitBounds: false,
  },
  layers: [createLayer()],
  activeLayerId: 'layer-1',
  generationMode: 'embedded',
};
