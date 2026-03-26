/**
 * dsfr-data-map-layer — Couche de donnees pour dsfr-data-map
 *
 * Composant invisible utilisant SourceSubscriberMixin pour recevoir des donnees
 * et les projeter sur la carte parente (markers, geoshape, circle, heatmap).
 */
import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { dispatchSourceCommand } from '../utils/data-bridge.js';
import { getByPath } from '../utils/json-path.js';
import { escapeHtml } from '@dsfr-data/shared';
import type { DsfrDataMap } from './dsfr-data-map.js';
// @ts-ignore — Vite ?inline import returns CSS as string
import markerClusterCss from 'leaflet.markercluster/dist/MarkerCluster.css?inline';
// @ts-ignore — Vite ?inline import returns CSS as string
import markerClusterDefaultCss from 'leaflet.markercluster/dist/MarkerCluster.Default.css?inline';

// Leaflet types
type LeafletModule = typeof import('leaflet');
type LeafletMap = import('leaflet').Map;
type LayerGroup = import('leaflet').LayerGroup;
type LatLngBounds = import('leaflet').LatLngBounds;

/** Choropleth palettes — shared with dsfr-data-world-map */
const CHOROPLETH_PALETTES: Record<string, readonly string[]> = {
  'sequentialAscending': [
    '#F5F5FE', '#E3E3FD', '#C1C1FB', '#A1A1F8', '#8585F6',
    '#6A6AF4', '#4747E5', '#2323B4', '#000091',
  ],
  'sequentialDescending': [
    '#000091', '#2323B4', '#4747E5', '#6A6AF4', '#8585F6',
    '#A1A1F8', '#C1C1FB', '#E3E3FD', '#F5F5FE',
  ],
  'divergentAscending': [
    '#000091', '#4747E5', '#8585F6', '#C1C1FB', '#F5F5F5',
    '#FCC0B4', '#F58050', '#E3541C', '#C9191E',
  ],
  'divergentDescending': [
    '#C9191E', '#E3541C', '#F58050', '#FCC0B4', '#F5F5F5',
    '#C1C1FB', '#8585F6', '#4747E5', '#000091',
  ],
  'neutral': [
    '#F6F6F6', '#E5E5E5', '#CECECE', '#B5B5B5', '#929292',
    '#777777', '#666666', '#3A3A3A', '#161616',
  ],
  'default': [
    '#F5F5FE', '#E3E3FD', '#C1C1FB', '#A1A1F8', '#8585F6',
    '#6A6AF4', '#4747E5', '#2323B4', '#000091',
  ],
};

/** Compute quantile breaks for choropleth */
function quantileBreaks(values: number[], n: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const breaks: number[] = [];
  for (let i = 1; i < n; i++) {
    const idx = Math.floor((i / n) * sorted.length);
    breaks.push(sorted[Math.min(idx, sorted.length - 1)]);
  }
  return breaks;
}

function getColorForValue(value: number, breaks: number[], palette: readonly string[]): string {
  for (let i = 0; i < breaks.length; i++) {
    if (value <= breaks[i]) return palette[i];
  }
  return palette[palette.length - 1];
}

@customElement('dsfr-data-map-layer')
export class DsfrDataMapLayer extends SourceSubscriberMixin(LitElement) {

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

  // --- Performance ---

  @property({ type: Number, attribute: 'max-items' })
  maxItems = 5000;

  @property({ type: String })
  filter = '';

  // --- Internal state ---

  private _mapParent: DsfrDataMap | null = null;
  private _leafletMap: LeafletMap | null = null;
  private _L: LeafletModule | null = null;
  private _layerGroup: LayerGroup | null = null;
  private _clusterGroup: any = null;
  private _visible = true;
  private _data: Record<string, unknown>[] = [];
  private _bboxTimer: ReturnType<typeof setTimeout> | null = null;
  private _banner: HTMLDivElement | null = null;
  private _totalCount = 0;
  private _clusterLoaded = false;
  private _heatLayer: any = null;
  private _heatLoaded = false;
  private _radiusScale: ((val: number) => number) | null = null;

  // Light DOM — invisible component
  createRenderRoot() { return this; }

  // --- SourceSubscriberMixin hook ---

  onSourceData(data: unknown): void {
    this._data = Array.isArray(data) ? data as Record<string, unknown>[] : [];
    this._renderLayer();
  }

  // --- Map lifecycle ---

  /** Called by dsfr-data-map when the Leaflet map is ready */
  _onMapReady(): void {
    this._mapParent = this.closest('dsfr-data-map') as DsfrDataMap | null;
    if (!this._mapParent) return;
    this._leafletMap = this._mapParent.getLeafletMap();
    this._L = this._mapParent.getLeafletLib();
    if (!this._leafletMap || !this._L) return;

    // Create layer group
    this._layerGroup = this._L.layerGroup();

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

  disconnectedCallback() {
    super.disconnectedCallback();
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
    const sourceEl = document.getElementById(this.source) as any;
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
    for (const candidate of ['geo_point_2d', 'geo_shape', 'geometry', 'geom', 'geo_point', 'geopoint']) {
      if (first[candidate] !== undefined) return candidate;
    }
    return 'geo_point_2d';
  }

  // --- Render layer ---

  private async _renderLayer(clientBounds?: LatLngBounds) {
    if (!this._leafletMap || !this._L || !this._layerGroup) return;
    const Leaf = this._L;

    // Clear previous layer content
    this._layerGroup.clearLayers();
    if (this._clusterGroup) {
      this._clusterGroup.clearLayers();
    }

    let items = this._data;

    // Client-side bounds filter
    if (clientBounds) {
      items = items.filter(record => {
        const coords = this._extractCoords(record);
        if (!coords) return false;
        return clientBounds.contains([coords.lat, coords.lon]);
      });
    }

    this._totalCount = items.length;

    // Max items safety
    const truncated = this.maxItems > 0 && items.length > this.maxItems;
    if (truncated) {
      items = items.slice(0, this.maxItems);
    }

    // Choropleth setup (for geoshape with fill-field)
    let breaks: number[] = [];
    let palette: readonly string[] = [];
    if (this.fillField && this.selectedPalette && this.type === 'geoshape') {
      const values = items
        .map(r => Number(getByPath(r, this.fillField)))
        .filter(v => !isNaN(v));
      palette = CHOROPLETH_PALETTES[this.selectedPalette] || CHOROPLETH_PALETTES['default'];
      breaks = quantileBreaks(values, palette.length);
    }

    // Auto-scaling for circle radius-field
    this._radiusScale = null;
    if (this.radiusField && this.type === 'circle') {
      const values = items
        .map(r => Number(getByPath(r, this.radiusField)))
        .filter(v => !isNaN(v) && isFinite(v));
      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min;
        if (range > 0) {
          const rMin = this.radiusMin;
          const rMax = this.radiusMax;
          this._radiusScale = (val: number) =>
            rMin + ((val - min) / range) * (rMax - rMin);
        } else {
          const mid = (this.radiusMin + this.radiusMax) / 2;
          this._radiusScale = () => mid;
        }
      }
    }

    // Load heatmap if needed
    if (this.type === 'heatmap' && !this._heatLoaded) {
      await this._loadHeatLayer();
    }

    // Load clustering if needed
    if (this.cluster && !this._clusterLoaded) {
      await this._loadMarkerCluster();
    }

    // Create cluster group if clustering
    if (this.cluster && this._clusterLoaded) {
      if (!this._clusterGroup) {
        const WL = (window as any).L;
        // markerClusterGroup (lowercase factory) or new MarkerClusterGroup (constructor)
        const createCluster = WL.markerClusterGroup
          ? (opts: any) => WL.markerClusterGroup(opts)
          : (opts: any) => new WL.MarkerClusterGroup(opts);
        this._clusterGroup = createCluster({
          maxClusterRadius: this.clusterRadius,
          iconCreateFunction: (clusterObj: any) => {
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

    // Report bounds for fit-bounds
    if (this._mapParent?.fitBounds) {
      const layerBounds = (this._clusterGroup || this._layerGroup).getBounds?.();
      if (layerBounds?.isValid?.()) {
        this._mapParent.registerLayerBounds(layerBounds);
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
        const count = (layerEl as any)._data?.length ?? 0;
        if (count > 0) {
          const typeLabel = layerEl.type === 'marker' ? 'marqueurs'
            : layerEl.type === 'geoshape' ? 'zones'
            : layerEl.type === 'circle' ? 'cercles'
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

    const icon = Leaf.divIcon({
      html: `<span class="fr-icon-map-pin-2-fill" style="color: ${this.color}; font-size: 1.5rem;" aria-hidden="true"></span>`,
      className: 'dsfr-data-map__marker',
      iconSize: [24, 24],
      iconAnchor: [12, 24],
      popupAnchor: [0, -24],
    });

    // A11y: alt text on marker from tooltip-field (Leaflet uses title attr)
    const altText = this.tooltipField
      ? String(getByPath(record, this.tooltipField) ?? '')
      : '';

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
    palette: readonly string[],
  ) {
    const geoData = this.geoField ? getByPath(record, this.geoField) : null;
    if (!geoData || typeof geoData !== 'object') return;

    let fillColor = this.color;
    if (this.fillField && breaks.length > 0) {
      const val = Number(getByPath(record, this.fillField));
      if (!isNaN(val)) {
        fillColor = getColorForValue(val, breaks, palette);
      }
    }

    const geoJson = (geoData as any).type ? geoData : null;
    if (!geoJson) return;

    const layer = Leaf.geoJSON(geoJson as any, {
      style: {
        color: this.color,
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
        r = this._radiusScale ? this._radiusScale(val) : val;
      }
    }

    let circle: import('leaflet').Layer;
    if (this.radiusUnit === 'm') {
      circle = Leaf.circle([coords.lat, coords.lon], {
        radius: r,
        color: this.color,
        fillColor: this.color,
        fillOpacity: this.fillOpacity,
        weight: 1,
      });
    } else {
      circle = Leaf.circleMarker([coords.lat, coords.lon], {
        radius: r,
        color: this.color,
        fillColor: this.color,
        fillOpacity: this.fillOpacity,
        weight: 1,
      });
    }

    this._bindPopup(circle as any, record);
    this._bindTooltip(circle as any, record);
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

    if (this._heatLoaded && (window as any).L?.heatLayer) {
      this._heatLayer = (window as any).L.heatLayer(points, {
        radius: this.heatRadius,
        blur: this.heatBlur,
        maxZoom: this.maxZoom,
      });
      if (this._visible) {
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
      // leaflet.heat is a UMD plugin that extends global L.
      // Same approach as markercluster: try ESM import, fallback to CDN.
      await import('leaflet.heat' as any);

      if (!(window as any).L?.heatLayer) {
        // Fallback: load via CDN script tag
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/leaflet.heat@0.2.0/dist/leaflet-heat.js';
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('Failed to load leaflet.heat from CDN'));
          document.head.appendChild(s);
        });
      }

      this._heatLoaded = !!(window as any).L?.heatLayer;
    } catch {
      console.warn('dsfr-data-map-layer: leaflet.heat not available, using circle fallback');
      this._heatLoaded = false;
    }
  }

  // --- Coordinate extraction ---

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
      const geo = getByPath(record, this.geoField) as any;
      if (!geo) return null;

      // GeoJSON Point: { type: "Point", coordinates: [lon, lat] }
      if (geo.type === 'Point' && Array.isArray(geo.coordinates)) {
        return { lat: geo.coordinates[1], lon: geo.coordinates[0] };
      }
      // ODS geo_point_2d: { lat: N, lon: N }
      if (typeof geo.lat === 'number' && typeof geo.lon === 'number') {
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
      const geo = record[candidate] as any;
      if (geo) {
        if (geo.type === 'Point' && Array.isArray(geo.coordinates)) {
          return { lat: geo.coordinates[1], lon: geo.coordinates[0] };
        }
        if (typeof geo.lat === 'number' && typeof geo.lon === 'number') {
          return { lat: geo.lat, lon: geo.lon };
        }
      }
    }

    return null;
  }

  // --- Popups ---

  /** Find a dsfr-data-map-popup companion that matches this layer */
  private _findPopupCompanion(): import('./dsfr-data-map-popup.js').DsfrDataMapPopup | null {
    if (!this._mapParent) return null;
    const popups = this._mapParent.querySelectorAll('dsfr-data-map-popup');
    for (const p of popups) {
      if ((p as any).matchesLayer?.(this.id || '')) return p as any;
    }
    return null;
  }

  private _bindPopup(layer: any, record: Record<string, unknown>): void {
    const companion = this._findPopupCompanion();

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
  private _bindPopupA11y(layer: any, record: Record<string, unknown>): void {
    // A11y: on popup open, announce to screen reader + focus close button
    layer.on('popupopen', (e: any) => {
      const popup = e.popup;
      const plainText = this._getPopupPlainText(record);
      this._mapParent?.announceToScreenReader(plainText);
      const closeBtn = popup.getElement()?.querySelector('.leaflet-popup-close-button') as HTMLElement | null;
      if (closeBtn) {
        closeBtn.setAttribute('aria-label', 'Fermer la popup');
        setTimeout(() => closeBtn.focus(), 50);
      }
    });

    // A11y: on popup close, return focus to the marker/layer
    layer.on('popupclose', () => {
      const el = layer.getElement?.() as HTMLElement | null;
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
    const fields = this.popupFields.split(',').map(f => f.trim()).filter(Boolean);
    const rows = fields.map(field => {
      const value = getByPath(record, field);
      const display = value !== undefined ? escapeHtml(String(value)) : '';
      return `<tr><th>${escapeHtml(field)}</th><td>${display}</td></tr>`;
    });
    return `<table class="fr-table fr-table--sm">${rows.join('')}</table>`;
  }

  // --- Tooltips ---

  private _bindTooltip(layer: any, record: Record<string, unknown>): void {
    if (!this.tooltipField) return;
    const value = getByPath(record, this.tooltipField);
    if (value !== undefined) {
      layer.bindTooltip(escapeHtml(String(value)));
    }
  }

  /** Extract plain text from a popup record for screen reader announcement */
  private _getPopupPlainText(record: Record<string, unknown>): string {
    if (this.popupFields) {
      const fields = this.popupFields.split(',').map(f => f.trim()).filter(Boolean);
      return fields
        .map(field => {
          const value = getByPath(record, field);
          return value !== undefined ? `${field}: ${value}` : '';
        })
        .filter(Boolean)
        .join(', ');
    }
    if (this.popupTemplate) {
      // Strip HTML from interpolated template
      const html = this._interpolateTemplate(this.popupTemplate, record);
      return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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

      // leaflet.markercluster is a UMD plugin that extends the global L.
      // Vite may bundle it as ESM which breaks the global L extension.
      // We import it (which triggers the side-effect of extending L),
      // then verify it worked. If not, load via script tag as fallback.
      await import('leaflet.markercluster');

      if (!(window as any).L?.MarkerClusterGroup) {
        // Fallback: load via CDN script tag (guaranteed UMD global execution)
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('Failed to load leaflet.markercluster from CDN'));
          document.head.appendChild(s);
        });
      }

      this._clusterLoaded = !!(window as any).L?.MarkerClusterGroup;

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
