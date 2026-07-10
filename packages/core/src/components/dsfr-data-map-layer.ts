/**
 * dsfr-data-map-layer — Couche de données pour dsfr-data-map
 *
 * Composant invisible utilisant SourceSubscriberMixin pour recevoir des données
 * et les projeter sur la carte parente (markers, geoshape, circle, heatmap).
 */
import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { dispatchSourceCommand } from '../utils/data-bridge.js';
import { getByPath } from '../utils/json-path.js';
import { CHOROPLETH_SCALES, quantileBreaks, getColorForValue } from '@dsfr-data/shared/lib';
import { escapeHtml } from '@dsfr-data/shared/lib';
import type { DsfrDataMap } from './dsfr-data-map.js';
import type { SourceElement } from '../utils/source-element.js';
// @ts-expect-error — Vite ?inline import returns CSS as string
import markerClusterCss from 'leaflet.markercluster/dist/MarkerCluster.css?inline';
// @ts-expect-error — Vite ?inline import returns CSS as string
import markerClusterDefaultCss from 'leaflet.markercluster/dist/MarkerCluster.Default.css?inline';

// Leaflet types
type LeafletModule = typeof import('leaflet');
type LeafletMap = import('leaflet').Map;
type LayerGroup = import('leaflet').LayerGroup;
type LatLngBounds = import('leaflet').LatLngBounds;
type LeafletLayer = import('leaflet').Layer;
type LeafletPopupEvent = import('leaflet').PopupEvent;
type FeatureGroup = import('leaflet').FeatureGroup;

/**
 * Leaflet exposé sur window par dsfr-data-map (voir loadLeaflet). Ajoute
 * `heatLayer` (plugin leaflet.heat) et `MarkerClusterGroup` (plugin
 * leaflet.markercluster) qui ne sont pas dans les types officiels Leaflet.
 */
type LeafletWithPlugins = LeafletModule & {
  heatLayer?: (
    latLngs: Array<[number, number, number?]>,
    opts?: Record<string, unknown>
  ) => LeafletLayer;
  markerClusterGroup?: (opts?: Record<string, unknown>) => FeatureGroup;
  MarkerClusterGroup?: new (opts?: Record<string, unknown>) => FeatureGroup;
};
type WindowWithLeaflet = Window & { L?: LeafletWithPlugins };

type HeatLayerFactory = NonNullable<LeafletWithPlugins['heatLayer']>;
type ClusterFactory = (opts: Record<string, unknown>) => FeatureGroup;

/**
 * Résout un symbole ajouté par un plugin Leaflet (markercluster, heat) après
 * son `import()` dynamique. Les plugins UMD étendent l'objet `module.exports`
 * de Leaflet ; selon l'interop CJS du bundler, l'ajout est visible sur
 * `window.L` (namespace exposé par loadLeaflet) ou seulement sur l'export
 * `default` du module Leaflet bundlé — on consulte les deux. Plus aucun
 * fallback CDN runtime (#292) : incompatible CSP strict et sovereign-only.
 */
async function resolveLeafletPluginSymbol<T>(name: string): Promise<T | undefined> {
  const winL = (window as WindowWithLeaflet).L as Record<string, unknown> | undefined;
  if (winL?.[name]) return winL[name] as T;
  const ns = (await import('leaflet')) as unknown as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  return (ns[name] ?? ns.default?.[name]) as T | undefined;
}

// Echelles choroplethes + bucketing : source unique @dsfr-data/shared (#302)
// — la copie locale divergeait de world-map (categorical absente, bucketing
// oppose : value <= break ici, v >= break la-bas).

let layerBoundsSeq = 0;

@customElement('dsfr-data-map-layer')
export class DsfrDataMapLayer extends SourceSubscriberMixin(LitElement) {
  /** Cle stable des bounds aupres de la carte parente (#294) */
  private readonly _boundsKey = `dsfr-map-layer-${++layerBoundsSeq}`;

  /**
   * Jeton de generation des rendus (#295) : deux _renderLayer qui se
   * chevauchent pendant le await import(...) (cluster/heatmap)
   * franchissaient chacun clearLayers() puis ajoutaient CHACUN tous les
   * items — doublons visibles. Le rendu obsolete s'abandonne apres chaque
   * await.
   */
  private _renderGeneration = 0;

  // --- Source & geo ---

  @property({ type: String })
  source = '';

  @property({ type: String })
  type: 'marker' | 'geoshape' | 'circle' | 'heatmap' = 'marker';

  @property({ type: String, attribute: 'lat-field' })
  latField = '';

  @property({ type: String, attribute: 'lon-field' })
  lonField = '';

  @property({ type: String, attribute: 'geo-field' })
  geoField = '';

  // --- Display ---

  @property({ type: String, attribute: 'popup-template' })
  popupTemplate = '';

  @property({ type: String, attribute: 'popup-fields' })
  popupFields = '';

  @property({ type: String, attribute: 'tooltip-field' })
  tooltipField = '';

  @property({ type: String })
  color = '#000091';

  @property({ type: String, attribute: 'color-field' })
  colorField = '';

  @property({ type: String, attribute: 'color-map' })
  colorMap = '';

  @property({ type: String, attribute: 'fill-field' })
  fillField = '';

  @property({ type: Number, attribute: 'fill-opacity' })
  fillOpacity = 0.6;

  @property({ type: String, attribute: 'selected-palette' })
  selectedPalette = '';

  @property({ type: Number })
  radius = 8;

  @property({ type: String, attribute: 'radius-field' })
  radiusField = '';

  @property({ type: String, attribute: 'radius-unit' })
  radiusUnit: 'px' | 'm' = 'px';

  @property({ type: Number, attribute: 'radius-min' })
  radiusMin = 4;

  @property({ type: Number, attribute: 'radius-max' })
  radiusMax = 30;

  // --- Heatmap ---

  @property({ type: Number, attribute: 'heat-radius' })
  heatRadius = 25;

  @property({ type: Number, attribute: 'heat-blur' })
  heatBlur = 15;

  @property({ type: String, attribute: 'heat-field' })
  heatField = '';

  // --- Clustering ---

  @property({ type: Boolean })
  cluster = false;

  @property({ type: Number, attribute: 'cluster-radius' })
  clusterRadius = 80;

  // --- Zoom & viewport ---

  @property({ type: Number, attribute: 'min-zoom' })
  minZoom = 0;

  @property({ type: Number, attribute: 'max-zoom' })
  maxZoom = 18;

  @property({ type: Boolean })
  bbox = false;

  @property({ type: Number, attribute: 'bbox-debounce' })
  bboxDebounce = 300;

  @property({ type: String, attribute: 'bbox-field' })
  bboxField = '';

  // --- Timeline ---

  @property({ type: String, attribute: 'time-field' })
  timeField = '';

  @property({ type: String, attribute: 'time-bucket' })
  timeBucket: 'none' | 'hour' | 'day' | 'month' | 'year' = 'none';

  @property({ type: String, attribute: 'time-mode' })
  timeMode: 'snapshot' | 'cumulative' = 'snapshot';

  // --- Performance ---

  @property({ type: Number, attribute: 'max-items' })
  maxItems = 5000;

  // --- Internal state ---

  private _mapParent: DsfrDataMap | null = null;
  private _leafletMap: LeafletMap | null = null;
  private _L: LeafletModule | null = null;
  private _layerGroup: FeatureGroup | null = null;
  private _clusterGroup: FeatureGroup | null = null;
  private _visible = true;
  private _data: Record<string, unknown>[] = [];
  private _bboxTimer: ReturnType<typeof setTimeout> | null = null;
  private _banner: HTMLDivElement | null = null;
  private _totalCount = 0;
  private _clusterLoaded = false;
  private _markerClusterFactory: ClusterFactory | null = null;
  private _heatLayer: LeafletLayer | null = null;
  private _heatLoaded = false;
  private _heatLayerFactory: HeatLayerFactory | null = null;
  private _radiusScale: ((val: number) => number) | null = null;

  /** Compagnon popup resolu une fois par rendu (#297) */
  private _popupCompanion: import('./dsfr-data-map-popup.js').DsfrDataMapPopup | null = null;
  private _colorMapParsed: Map<string, string> | null = null;

  // Timeline state
  private _timeFrames: Map<string, Record<string, unknown>[]> = new Map();
  private _timeSteps: string[] = [];
  private _currentFrameIndex = -1; // -1 = show all (no timeline active)

  // Light DOM — invisible component
  createRenderRoot() {
    return this;
  }

  // --- Color mapping ---

  /** Parse color-map="val1:#color1,val2:#color2" into a Map */
  private _parseColorMap(): Map<string, string> {
    const map = new Map<string, string>();
    if (!this.colorMap) return map;
    for (const pair of this.colorMap.split(',')) {
      const sep = pair.lastIndexOf(':');
      if (sep > 0) {
        const value = pair.substring(0, sep).trim();
        const color = pair.substring(sep + 1).trim();
        if (value && color) map.set(value, color);
      }
    }
    return map;
  }

  /** Resolve color for a record: color-field + color-map, or fallback to this.color */
  private _resolveColor(record: Record<string, unknown>): string {
    if (!this.colorField || !this._colorMapParsed?.size) return this.color;
    const val = String(getByPath(record, this.colorField) ?? '');
    return this._colorMapParsed.get(val) ?? this.color;
  }

  // --- SourceSubscriberMixin hook ---

  onSourceData(data: unknown): void {
    this._data = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    if (this.timeField) {
      this._buildTimeFrames();
      // If timeline is active, re-render current frame; else show all
      if (this._currentFrameIndex >= 0) {
        this.setTimelineFrame(Math.min(this._currentFrameIndex, this._timeSteps.length - 1));
        return;
      }
    }
    this._renderLayer();
  }

  // --- Timeline API ---

  /** Build time frame index from data */
  private _buildTimeFrames(): void {
    this._timeFrames.clear();
    for (const record of this._data) {
      const raw = getByPath(record, this.timeField);
      const key = this._bucketTime(raw);
      if (key === null) continue;
      if (!this._timeFrames.has(key)) this._timeFrames.set(key, []);
      this._timeFrames.get(key)!.push(record);
    }
    // Sort keys chronologically
    this._timeSteps = [...this._timeFrames.keys()].sort();
    // Notify any timeline companion
    this.dispatchEvent(
      new CustomEvent('dsfr-data-map-layer-time-ready', {
        bubbles: true,
        detail: { steps: this._timeSteps },
      })
    );
  }

  /** Bucket a raw date value to the configured granularity */
  private _bucketTime(raw: unknown): string | null {
    if (raw == null) return null;
    const str = String(raw);
    if (this.timeBucket === 'none') return str;
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    switch (this.timeBucket) {
      case 'year':
        return `${d.getFullYear()}`;
      case 'month':
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      case 'day':
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      case 'hour':
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`;
      default:
        return str;
    }
  }

  /** Get data for a given frame index (snapshot or cumulative) */
  private _getFrameData(frameIndex: number): Record<string, unknown>[] {
    if (frameIndex < 0 || frameIndex >= this._timeSteps.length) return [];
    if (this.timeMode === 'cumulative') {
      const result: Record<string, unknown>[] = [];
      for (let i = 0; i <= frameIndex; i++) {
        const key = this._timeSteps[i];
        result.push(...(this._timeFrames.get(key) || []));
      }
      return result;
    }
    // snapshot
    const key = this._timeSteps[frameIndex];
    return this._timeFrames.get(key) || [];
  }

  /** Called by dsfr-data-map-timeline to set current frame */
  setTimelineFrame(index: number): void {
    this._currentFrameIndex = index;
    // Items passes en parametre (#295) : l'ancien swap temporaire de
    // this._data autour d'un _renderLayer() non awaite ne tenait que parce
    // que la lecture etait dans la portion synchrone — bombe a retardement,
    // et observable par un rendu concurrent.
    this._renderLayer(undefined, this._getFrameData(index));
  }

  /** Called by dsfr-data-map-timeline to reset (show all data) */
  resetTimeline(): void {
    this._currentFrameIndex = -1;
    this._renderLayer();
  }

  /** Returns sorted time step labels */
  getTimeSteps(): string[] {
    return this._timeSteps;
  }

  // --- Map lifecycle ---

  /** Called by dsfr-data-map when the Leaflet map is ready */
  _onMapReady(): void {
    this._mapParent = this.closest('dsfr-data-map') as DsfrDataMap | null;
    if (!this._mapParent) return;
    this._leafletMap = this._mapParent.getLeafletMap();
    this._L = this._mapParent.getLeafletLib();
    if (!this._leafletMap || !this._L) return;

    // Create layer group (featureGroup → getBounds() disponible pour fit-bounds)
    this._layerGroup = this._L.featureGroup();

    // Check initial zoom visibility
    this._updateVisibility();

    // If data already available, render
    if (this._data.length > 0) {
      this._renderLayer();
    }
  }

  /** Called by dsfr-data-map on moveend/zoomend */
  _onViewportChange(): void {
    if (!this._leafletMap) return;

    // Update zoom-range visibility
    this._updateVisibility();

    // Viewport-driven fetch (bbox)
    if (this.bbox && this._visible) {
      if (this._bboxTimer) clearTimeout(this._bboxTimer);
      this._bboxTimer = setTimeout(() => this._sendBboxCommand(), this.bboxDebounce);
    }
  }

  connectedCallback() {
    super.connectedCallback();
    // Attribut retire (#297) : declare mais jamais lu (no-op)
    if (this.hasAttribute('filter')) {
      console.warn(
        `dsfr-data-map-layer[${this.id}]: l'attribut "filter" a été retiré (il était sans effet) — ` +
          `filtrez en amont via dsfr-data-query ou le where de dsfr-data-source`
      );
    }
    sendWidgetBeacon('dsfr-data-map-layer', this.type);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Libere les bounds enregistres aupres de la carte (#294)
    this._mapParent?.unregisterLayerBounds?.(this._boundsKey);
    // Libere le filtre viewport pousse sur la source (#297) : un layer
    // retire laissait la source filtree sur le dernier viewport pour tous
    // ses autres consommateurs
    if (this.bbox && this.source) {
      dispatchSourceCommand(this.source, { where: '', whereKey: 'map-bbox' });
    }
    if (this._bboxTimer) clearTimeout(this._bboxTimer);
    if (this._layerGroup && this._leafletMap) {
      this._layerGroup.removeFrom(this._leafletMap);
    }
    if (this._clusterGroup && this._leafletMap) {
      this._clusterGroup.removeFrom(this._leafletMap);
    }
    if (this._heatLayer) {
      this._heatLayer.remove();
      this._heatLayer = null;
    }
    this._removeBanner();
  }

  // --- Zoom-range visibility ---

  private _updateVisibility() {
    if (!this._leafletMap || !this._layerGroup) return;
    const zoom = this._leafletMap.getZoom();
    const shouldBeVisible = zoom >= this.minZoom && zoom <= this.maxZoom;

    if (shouldBeVisible && !this._visible) {
      this._visible = true;
      const group = this._clusterGroup || this._layerGroup;
      if (!this._leafletMap.hasLayer(group)) {
        group.addTo(this._leafletMap);
      }
      if (this._heatLayer && !this._leafletMap.hasLayer(this._heatLayer)) {
        this._heatLayer.addTo(this._leafletMap);
      }
    } else if (!shouldBeVisible && this._visible) {
      this._visible = false;
      const group = this._clusterGroup || this._layerGroup;
      if (this._leafletMap.hasLayer(group)) {
        group.removeFrom(this._leafletMap);
      }
      if (this._heatLayer && this._leafletMap.hasLayer(this._heatLayer)) {
        this._heatLayer.removeFrom(this._leafletMap);
      }
      this._removeBanner();
    }
  }

  // --- Bbox command ---

  private _sendBboxCommand() {
    if (!this._leafletMap || !this.source) return;
    const bounds = this._leafletMap.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    // Determine the geo field for the bbox clause
    const field = this.bboxField || this.geoField || this._autoDetectGeoField();

    // Find the source element to check adapter capabilities
    const sourceEl = document.getElementById(this.source) as unknown as SourceElement | null;
    const adapter = sourceEl?.getAdapter?.();

    if (adapter?.capabilities?.serverGeo) {
      // ODS-style in_bbox clause
      const where = `in_bbox(${field}, ${sw.lat}, ${sw.lng}, ${ne.lat}, ${ne.lng})`;
      dispatchSourceCommand(this.source, {
        where,
        whereKey: 'map-bbox',
      });
    } else {
      // Client-side fallback — filter cached data by bounds
      this._renderLayer(bounds);
    }
  }

  private _autoDetectGeoField(): string {
    if (this._data.length === 0) return 'geo_point_2d';
    const first = this._data[0];
    for (const candidate of [
      'geo_point_2d',
      'geo_shape',
      'geometry',
      'geom',
      'geo_point',
      'geopoint',
    ]) {
      if (first[candidate] !== undefined) return candidate;
    }
    return 'geo_point_2d';
  }

  // --- Render layer ---

  private async _renderLayer(
    clientBounds?: LatLngBounds,
    itemsOverride?: Record<string, unknown>[]
  ) {
    if (!this._leafletMap || !this._L || !this._layerGroup) return;
    const Leaf = this._L;
    const generation = ++this._renderGeneration;

    // Clear previous layer content
    this._layerGroup.clearLayers();
    if (this._clusterGroup) {
      this._clusterGroup.clearLayers();
    }

    let items = itemsOverride ?? this._data;

    // Compagnon popup resolu une fois par rendu (#297) — _findPopupCompanion
    // etait appele PAR RECORD (jusqu'a maxItems querySelector par rendu)
    this._popupCompanion = this._findPopupCompanion();

    // Client-side bounds filter — points ET geometries (#297) : ne savoir
    // extraire que des points faisait disparaitre TOUS les polygones des le
    // premier pan quand bbox est actif sans serverGeo
    if (clientBounds) {
      items = items.filter((record) => this._recordIntersectsBounds(record, clientBounds));
    }

    this._totalCount = items.length;

    // Max items safety
    const truncated = this.maxItems > 0 && items.length > this.maxItems;
    if (truncated) {
      items = items.slice(0, this.maxItems);
    }

    // Parse color-map (categorical color mapping)
    this._colorMapParsed = this.colorField && this.colorMap ? this._parseColorMap() : null;

    // Choropleth setup (for geoshape with fill-field)
    let breaks: number[] = [];
    let palette: readonly string[] = [];
    if (this.fillField && this.selectedPalette && this.type === 'geoshape') {
      const values = items
        .map((r) => Number(getByPath(r, this.fillField)))
        .filter((v) => !isNaN(v));
      palette = CHOROPLETH_SCALES[this.selectedPalette] || CHOROPLETH_SCALES['sequentialAscending'];
      breaks = quantileBreaks(values, palette.length);
    }

    // Auto-scaling for circle radius-field
    this._radiusScale = null;
    if (this.radiusField && this.type === 'circle') {
      const values = items
        .map((r) => Number(getByPath(r, this.radiusField)))
        .filter((v) => !isNaN(v) && isFinite(v));
      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min;
        if (range > 0) {
          const rMin = this.radiusMin;
          const rMax = this.radiusMax;
          this._radiusScale = (val: number) => rMin + ((val - min) / range) * (rMax - rMin);
        } else {
          const mid = (this.radiusMin + this.radiusMax) / 2;
          this._radiusScale = () => mid;
        }
      }
    }

    // Load heatmap if needed
    if (this.type === 'heatmap' && !this._heatLoaded) {
      await this._loadHeatLayer();
      // Rendu obsolete : un _renderLayer plus recent est passe (#295)
      if (generation !== this._renderGeneration) return;
    }

    // Load clustering if needed
    if (this.cluster && !this._clusterLoaded) {
      await this._loadMarkerCluster();
      if (generation !== this._renderGeneration) return;
    }

    // Create cluster group if clustering
    if (this.cluster && this._clusterLoaded) {
      if (!this._clusterGroup) {
        const createCluster = this._markerClusterFactory;
        if (!createCluster) return;
        this._clusterGroup = createCluster({
          maxClusterRadius: this.clusterRadius,
          iconCreateFunction: (clusterObj: { getChildCount: () => number }) => {
            const count = clusterObj.getChildCount();
            const size = count < 10 ? 'small' : count < 100 ? 'medium' : 'large';
            return Leaf.divIcon({
              html: `<span class="dsfr-data-map__cluster dsfr-data-map__cluster--${size}">${count}</span>`,
              className: 'dsfr-data-map__cluster-icon',
              iconSize: Leaf.point(40, 40),
            });
          },
        });
        if (this._visible) {
          this._clusterGroup.addTo(this._leafletMap);
        }
      }
    }

    const targetGroup = this._clusterGroup || this._layerGroup;

    // Render each item
    for (const record of items) {
      switch (this.type) {
        case 'marker':
          this._addMarker(record, Leaf, targetGroup);
          break;
        case 'geoshape':
          this._addGeoshape(record, Leaf, targetGroup, breaks, palette);
          break;
        case 'circle':
          this._addCircle(record, Leaf, targetGroup);
          break;
        case 'heatmap':
          // Collected below, not per-item
          break;
      }
    }

    // Heatmap: render all points at once via L.heatLayer
    if (this.type === 'heatmap') {
      this._renderHeatmap(items, Leaf);
    }

    // Add to map if visible
    if (this._visible && this._leafletMap) {
      if (!this._clusterGroup && !this._leafletMap.hasLayer(this._layerGroup)) {
        this._layerGroup.addTo(this._leafletMap);
      }
    }

    // Report bounds for fit-bounds — par cle de layer, remplacement a
    // chaque rendu (#294)
    if (this._mapParent?.fitBounds) {
      const layerBounds = (this._clusterGroup || this._layerGroup).getBounds?.();
      if (layerBounds?.isValid?.()) {
        this._mapParent.registerLayerBounds(this._boundsKey, layerBounds);
      }
    }

    // Max-items banner
    this._updateBanner(truncated, items.length);

    // A11y: update map description with layer data summary
    if (this._mapParent) {
      const summaries: string[] = [];
      const allLayers = this._mapParent.querySelectorAll('dsfr-data-map-layer');
      for (const l of allLayers) {
        const layerEl = l as DsfrDataMapLayer;
        const count = (layerEl as unknown as { _data?: unknown[] })._data?.length ?? 0;
        if (count > 0) {
          const typeLabel =
            layerEl.type === 'marker'
              ? 'marqueurs'
              : layerEl.type === 'geoshape'
                ? 'zones'
                : layerEl.type === 'circle'
                  ? 'cercles'
                  : 'points';
          summaries.push(`${count} ${typeLabel}`);
        }
      }
      if (summaries.length > 0) {
        this._mapParent.updateDescription([`Couches : ${summaries.join(', ')}.`]);
      }
    }
  }

  // --- Marker ---

  private _addMarker(record: Record<string, unknown>, Leaf: LeafletModule, group: LayerGroup) {
    const coords = this._extractCoords(record);
    if (!coords) return;

    const markerColor = this._resolveColor(record);
    const icon = Leaf.divIcon({
      html: `<span class="fr-icon-map-pin-2-fill" style="color: ${markerColor}; font-size: 1.5rem;" aria-hidden="true"></span>`,
      className: 'dsfr-data-map__marker',
      iconSize: [24, 24],
      iconAnchor: [12, 24],
      popupAnchor: [0, -24],
    });

    // A11y: alt text on marker from tooltip-field (Leaflet uses title attr)
    const altText = this.tooltipField ? String(getByPath(record, this.tooltipField) ?? '') : '';

    const marker = Leaf.marker([coords.lat, coords.lon], {
      icon,
      alt: altText || 'Marqueur',
    });
    this._bindPopup(marker, record);
    this._bindTooltip(marker, record);
    group.addLayer(marker);
  }

  // --- Geoshape ---

  private _addGeoshape(
    record: Record<string, unknown>,
    Leaf: LeafletModule,
    group: LayerGroup,
    breaks: number[],
    palette: readonly string[]
  ) {
    const geoData = this.geoField ? getByPath(record, this.geoField) : null;
    if (!geoData || typeof geoData !== 'object') return;

    const recordColor = this._resolveColor(record);
    let fillColor = recordColor;
    if (this.fillField && breaks.length > 0) {
      const val = Number(getByPath(record, this.fillField));
      if (!isNaN(val)) {
        fillColor = getColorForValue(val, breaks, palette);
      }
    }

    const geoJson =
      geoData && typeof geoData === 'object' && 'type' in (geoData as object) ? geoData : null;
    if (!geoJson) return;

    const layer = Leaf.geoJSON(geoJson as import('geojson').GeoJsonObject, {
      style: {
        color: recordColor,
        weight: 1,
        fillColor,
        fillOpacity: this.fillOpacity,
      },
    });

    this._bindPopup(layer, record);
    this._bindTooltip(layer, record);
    group.addLayer(layer);
  }

  // --- Circle ---

  private _addCircle(record: Record<string, unknown>, Leaf: LeafletModule, group: LayerGroup) {
    const coords = this._extractCoords(record);
    if (!coords) return;

    let r = this.radius;
    if (this.radiusField) {
      const val = Number(getByPath(record, this.radiusField));
      if (!isNaN(val)) {
        // radius-unit="m" : la valeur du champ EST en metres — l'echelle px
        // (radius-min..radius-max) produisait des cercles invisibles (#297)
        r = this.radiusUnit === 'm' ? val : this._radiusScale ? this._radiusScale(val) : val;
      }
    }

    const circleColor = this._resolveColor(record);
    let circle: import('leaflet').Layer;
    if (this.radiusUnit === 'm') {
      circle = Leaf.circle([coords.lat, coords.lon], {
        radius: r,
        color: circleColor,
        fillColor: circleColor,
        fillOpacity: this.fillOpacity,
        weight: 1,
      });
    } else {
      circle = Leaf.circleMarker([coords.lat, coords.lon], {
        radius: r,
        color: circleColor,
        fillColor: circleColor,
        fillOpacity: this.fillOpacity,
        weight: 1,
      });
    }

    this._bindPopup(circle, record);
    this._bindTooltip(circle, record);
    group.addLayer(circle);
  }

  // --- Heatmap ---

  private _renderHeatmap(items: Record<string, unknown>[], _Leaf: LeafletModule) {
    if (!this._leafletMap) return;

    // Remove previous heat layer
    if (this._heatLayer) {
      this._heatLayer.remove();
      this._heatLayer = null;
    }

    const points: [number, number, number][] = [];
    for (const record of items) {
      const coords = this._extractCoords(record);
      if (!coords) continue;
      let intensity = 1;
      if (this.heatField) {
        const val = Number(getByPath(record, this.heatField));
        if (!isNaN(val)) intensity = val;
      }
      points.push([coords.lat, coords.lon, intensity]);
    }

    if (points.length === 0) return;

    if (this._heatLoaded && this._heatLayerFactory) {
      this._heatLayer = this._heatLayerFactory(points, {
        radius: this.heatRadius,
        blur: this.heatBlur,
        maxZoom: this.maxZoom,
      });
      if (this._visible && this._leafletMap) {
        this._heatLayer.addTo(this._leafletMap);
      }
    } else {
      // Fallback: transparent circles
      for (const [lat, lon] of points) {
        const circle = this._L!.circleMarker([lat, lon], {
          radius: 8,
          color: 'transparent',
          fillColor: this.color,
          fillOpacity: 0.3,
          weight: 0,
        });
        this._layerGroup!.addLayer(circle);
      }
    }
  }

  private async _loadHeatLayer() {
    try {
      // leaflet.heat est un plugin UMD qui étend l'objet Leaflet : l'import
      // dynamique (chunk produit par le build) déclenche l'effet de bord,
      // puis on résout heatLayer là où l'interop l'a déposé.
      // @ts-expect-error — leaflet.heat ships no types
      await import('leaflet.heat');
      this._heatLayerFactory =
        (await resolveLeafletPluginSymbol<HeatLayerFactory>('heatLayer')) ?? null;
      this._heatLoaded = !!this._heatLayerFactory;
      if (!this._heatLoaded) {
        console.warn('dsfr-data-map-layer: leaflet.heat not available, using circle fallback');
      }
    } catch {
      console.warn('dsfr-data-map-layer: leaflet.heat not available, using circle fallback');
      this._heatLoaded = false;
    }
  }

  // --- Coordinate extraction ---

  /**
   * Le record intersecte-t-il le viewport ? Points ET geometries (#297).
   * Une geometrie inextractible est CONSERVEE : ne pas faire disparaitre
   * ce qu'on ne sait pas filtrer.
   */
  private _recordIntersectsBounds(record: Record<string, unknown>, bounds: LatLngBounds): boolean {
    const coords = this._extractCoords(record);
    if (coords) {
      return bounds.contains([coords.lat, coords.lon]);
    }

    const geoValue = this.geoField
      ? getByPath(record, this.geoField)
      : (record['geo_shape'] ?? record['geometry'] ?? record['geom']);
    const bbox = this._geometryBbox(geoValue);
    if (!bbox) return true;

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return (
      bbox.maxLat >= sw.lat &&
      bbox.minLat <= ne.lat &&
      bbox.maxLon >= sw.lng &&
      bbox.minLon <= ne.lng
    );
  }

  /**
   * Bbox d'une geometrie GeoJSON (Feature, Polygon, MultiPolygon, lignes...)
   * par parcours des coordonnees [lon, lat] (#297). null si inextractible.
   */
  private _geometryBbox(
    geo: unknown
  ): { minLat: number; minLon: number; maxLat: number; maxLon: number } | null {
    const g = geo as
      { type?: string; coordinates?: unknown; geometry?: unknown } | null | undefined;
    if (!g || typeof g !== 'object') return null;
    if (g.type === 'Feature' && g.geometry) return this._geometryBbox(g.geometry);
    if (!g.coordinates) return null;

    let minLat = Infinity;
    let minLon = Infinity;
    let maxLat = -Infinity;
    let maxLon = -Infinity;
    const walk = (node: unknown): void => {
      if (!Array.isArray(node)) return;
      if (node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
        const lon = node[0];
        const lat = node[1];
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        return;
      }
      for (const child of node) walk(child);
    };
    walk(g.coordinates);

    if (!isFinite(minLat)) return null;
    return { minLat, minLon, maxLat, maxLon };
  }

  private _extractCoords(record: Record<string, unknown>): { lat: number; lon: number } | null {
    // Mode 1: lat-field + lon-field
    if (this.latField && this.lonField) {
      const lat = Number(getByPath(record, this.latField));
      const lon = Number(getByPath(record, this.lonField));
      if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
      return null;
    }

    // Mode 2: geo-field (GeoJSON Point or {lat, lon} object)
    if (this.geoField) {
      const geo = getByPath(record, this.geoField) as
        | { type?: string; coordinates?: unknown[]; lat?: unknown; lon?: unknown }
        | unknown[]
        | null
        | undefined;
      if (!geo) return null;

      // GeoJSON Point: { type: "Point", coordinates: [lon, lat] }
      if (
        !Array.isArray(geo) &&
        geo.type === 'Point' &&
        Array.isArray(geo.coordinates) &&
        geo.coordinates.length >= 2
      ) {
        return { lat: Number(geo.coordinates[1]), lon: Number(geo.coordinates[0]) };
      }
      // ODS geo_point_2d: { lat: N, lon: N }
      if (!Array.isArray(geo) && typeof geo.lat === 'number' && typeof geo.lon === 'number') {
        return { lat: geo.lat, lon: geo.lon };
      }
      // Array [lat, lon]
      if (Array.isArray(geo) && geo.length >= 2) {
        return { lat: Number(geo[0]), lon: Number(geo[1]) };
      }
      return null;
    }

    // Auto-detect from known field names
    for (const candidate of ['geo_point_2d', 'geopoint', 'geo_point']) {
      const geo = record[candidate] as
        { type?: string; coordinates?: unknown[]; lat?: unknown; lon?: unknown } | undefined;
      if (geo) {
        if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
          return { lat: Number(geo.coordinates[1]), lon: Number(geo.coordinates[0]) };
        }
        if (typeof geo.lat === 'number' && typeof geo.lon === 'number') {
          return { lat: geo.lat, lon: geo.lon };
        }
      }
    }

    return null;
  }

  // --- Popups ---

  /** Find a dsfr-data-map-popup companion that matches this layer.
   *  Priority: 1) popup child of this layer, 2) popup at map level with matching `for` */
  private _findPopupCompanion(): import('./dsfr-data-map-popup.js').DsfrDataMapPopup | null {
    // 1. Check for popup nested inside this layer element
    const ownPopup = this.querySelector('dsfr-data-map-popup');
    if (ownPopup) return ownPopup as import('./dsfr-data-map-popup.js').DsfrDataMapPopup;

    // 2. Check for popup at map level with explicit `for` targeting this layer
    if (!this._mapParent) return null;
    const layerId = this.id || this.source;
    const popups = this._mapParent.querySelectorAll(':scope > dsfr-data-map-popup');
    for (const p of popups) {
      const popup = p as import('./dsfr-data-map-popup.js').DsfrDataMapPopup;
      // Aligne sur matchesLayer() (#296) : sans `for`, le popup matche
      // toutes les couches — l'exemple de la docstring (popup enfant de la
      // carte, sans for) ne fonctionnait pas car le layer exigeait un for
      if (popup.matchesLayer?.(layerId)) return popup;
    }
    return null;
  }

  private _bindPopup(layer: LeafletLayer, record: Record<string, unknown>): void {
    const companion = this._popupCompanion;

    if (companion) {
      // Companion popup component handles display
      if (companion.mode === 'popup') {
        // Leaflet popup with companion template
        const html = companion.getPopupHtml(record);
        layer.bindPopup(html);
        this._bindPopupA11y(layer, record);
      } else {
        // Panel/modal: open on click, no Leaflet popup
        layer.on('click', () => {
          companion.showForRecord(record);
        });
      }
      return;
    }

    // Fallback: legacy popup-template / popup-fields attributes
    if (!this.popupTemplate && !this.popupFields) return;

    let content: string;
    if (this.popupTemplate) {
      content = this._interpolateTemplate(this.popupTemplate, record);
    } else {
      content = this._buildPopupTable(record);
    }

    layer.bindPopup(`<div class="dsfr-data-map__popup">${content}</div>`);
    this._bindPopupA11y(layer, record);
  }

  /** A11y bindings for Leaflet popups (both companion popup mode and legacy) */
  private _bindPopupA11y(layer: LeafletLayer, record: Record<string, unknown>): void {
    // A11y: on popup open, announce to screen reader + focus close button
    layer.on('popupopen', (e: LeafletPopupEvent) => {
      const popup = e.popup;
      const plainText = this._getPopupPlainText(record);
      this._mapParent?.announceToScreenReader(plainText);
      const closeBtn = popup
        .getElement()
        ?.querySelector('.leaflet-popup-close-button') as HTMLElement | null;
      if (closeBtn) {
        closeBtn.setAttribute('aria-label', 'Fermer la popup');
        setTimeout(() => closeBtn.focus(), 50);
      }
    });

    // A11y: on popup close, return focus to the marker/layer
    layer.on('popupclose', () => {
      const el = (layer as LeafletLayer & { getElement?: () => HTMLElement | null }).getElement?.();
      if (el) {
        setTimeout(() => el.focus(), 50);
      }
    });
  }

  private _interpolateTemplate(template: string, record: Record<string, unknown>): string {
    return template.replace(/\{([^}]+)\}/g, (_match, field: string) => {
      const value = getByPath(record, field.trim());
      return value !== undefined ? escapeHtml(String(value)) : '';
    });
  }

  private _buildPopupTable(record: Record<string, unknown>): string {
    const fields = this.popupFields
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    const rows = fields.map((field) => {
      const value = getByPath(record, field);
      const display = value !== undefined ? escapeHtml(String(value)) : '';
      return `<tr><th>${escapeHtml(field)}</th><td>${display}</td></tr>`;
    });
    return `<table class="fr-table fr-table--sm">${rows.join('')}</table>`;
  }

  // --- Tooltips ---

  private _bindTooltip(layer: LeafletLayer, record: Record<string, unknown>): void {
    if (!this.tooltipField) return;
    const value = getByPath(record, this.tooltipField);
    if (value !== undefined) {
      layer.bindTooltip(escapeHtml(String(value)));
    }
  }

  /** Extract plain text from a popup record for screen reader announcement */
  private _getPopupPlainText(record: Record<string, unknown>): string {
    if (this.popupFields) {
      const fields = this.popupFields
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean);
      return fields
        .map((field) => {
          const value = getByPath(record, field);
          return value !== undefined ? `${field}: ${value}` : '';
        })
        .filter(Boolean)
        .join(', ');
    }
    if (this.popupTemplate) {
      // Strip HTML from interpolated template
      const html = this._interpolateTemplate(this.popupTemplate, record);
      return html
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return '';
  }

  // --- Clustering ---

  private async _loadMarkerCluster() {
    try {
      // Inject MarkerCluster CSS (inlined to avoid CSP issues)
      if (!document.querySelector('style[data-markercluster-css]')) {
        const style = document.createElement('style');
        style.setAttribute('data-markercluster-css', '');
        style.textContent = markerClusterCss + '\n' + markerClusterDefaultCss;
        document.head.appendChild(style);
      }

      // leaflet.markercluster est un plugin UMD qui étend l'objet Leaflet :
      // l'import dynamique (chunk produit par le build) déclenche l'effet de
      // bord, puis on résout la factory/le constructeur là où l'interop CJS
      // l'a déposé (window.L ou export default du module Leaflet bundlé).
      await import('leaflet.markercluster');

      const factory = await resolveLeafletPluginSymbol<ClusterFactory>('markerClusterGroup');
      const ctor = factory
        ? undefined
        : await resolveLeafletPluginSymbol<new (opts?: Record<string, unknown>) => FeatureGroup>(
            'MarkerClusterGroup'
          );
      this._markerClusterFactory = factory ?? (ctor ? (opts) => new ctor(opts) : null);
      this._clusterLoaded = !!this._markerClusterFactory;

      // Inject DSFR cluster styles
      if (!document.querySelector('style[data-dsfr-map-cluster]')) {
        const style = document.createElement('style');
        style.setAttribute('data-dsfr-map-cluster', '');
        style.textContent = `
          .dsfr-data-map__cluster-icon {
            background: none !important;
            border: none !important;
          }
          .dsfr-data-map__cluster {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            color: white;
            font-weight: 700;
            font-size: 0.875rem;
          }
          .dsfr-data-map__cluster--small {
            background: var(--background-action-high-blue-france, #000091);
          }
          .dsfr-data-map__cluster--medium {
            background: var(--background-action-high-blue-ecume, #2323B4);
          }
          .dsfr-data-map__cluster--large {
            background: var(--background-flat-error, #C9191E);
          }
        `;
        document.head.appendChild(style);
      }
    } catch {
      console.warn('dsfr-data-map-layer: leaflet.markercluster not available, clustering disabled');
      this._clusterLoaded = false;
    }
  }

  // --- Max-items banner ---

  private _updateBanner(truncated: boolean, displayedCount: number) {
    this._removeBanner();
    if (!truncated) return;

    this._banner = document.createElement('div');
    this._banner.className = 'dsfr-data-map__max-items-banner';
    this._banner.textContent = `${displayedCount.toLocaleString('fr-FR')} elements affiches sur ${this._totalCount.toLocaleString('fr-FR')} disponibles. Zoomez pour voir plus de detail.`;
    // Plusieurs layers tronques : empiler les banners au lieu de les
    // superposer (#297)
    const existing =
      this._mapParent?.querySelectorAll('.dsfr-data-map__max-items-banner').length ?? 0;
    if (existing > 0) {
      this._banner.style.bottom = `${10 + existing * 36}px`;
    }
    this._mapParent?.appendChild(this._banner);
  }

  private _removeBanner() {
    if (this._banner) {
      this._banner.remove();
      this._banner = null;
    }
  }

  render() {
    return undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-map-layer': DsfrDataMapLayer;
  }
}
