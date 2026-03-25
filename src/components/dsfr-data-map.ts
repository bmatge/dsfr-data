/**
 * dsfr-data-map — Conteneur carte interactive Leaflet
 *
 * Orchestre ses couches enfantes (dsfr-data-map-layer), gere le viewport
 * et expose des controles utilisateur. Ne consomme pas de donnees directement.
 */
import { LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { sendWidgetBeacon } from '../utils/beacon.js';

// Leaflet types — loaded dynamically
type LeafletMap = import('leaflet').Map;
type LeafletTileLayer = import('leaflet').TileLayer;
type LatLngBoundsExpression = import('leaflet').LatLngBoundsExpression;

/** Tile presets — souverains, sans cle API */
const TILE_PRESETS: Record<string, { url: string; attribution: string; options?: Record<string, unknown> }> = {
  'ign-plan': {
    url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    attribution: '&copy; <a href="https://www.ign.fr/">IGN</a>',
  },
  'ign-ortho': {
    url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    attribution: '&copy; <a href="https://www.ign.fr/">IGN</a>',
  },
  'ign-topo': {
    url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.MAPS.BDUNI.J1&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    attribution: '&copy; <a href="https://www.ign.fr/">IGN</a>',
  },
  'ign-cadastre': {
    url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    attribution: '&copy; <a href="https://www.ign.fr/">IGN</a>',
  },
  'osm': {
    url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
};

// Lazy Leaflet module cache
let L: typeof import('leaflet') | null = null;

async function loadLeaflet(): Promise<typeof import('leaflet')> {
  if (L) return L;
  L = await import('leaflet');
  // Expose L globally — required by Leaflet plugins (markercluster, heat)
  (window as any).L = L;
  return L;
}

@customElement('dsfr-data-map')
export class DsfrDataMap extends LitElement {
  // --- Attributs publics ---

  @property({ type: String })
  center = '46.603,2.888';

  @property({ type: Number })
  zoom = 6;

  @property({ type: Number, attribute: 'min-zoom' })
  minZoom = 2;

  @property({ type: Number, attribute: 'max-zoom' })
  maxZoom = 18;

  @property({ type: String })
  height = '500px';

  @property({ type: String })
  tiles = 'ign-plan';

  @property({ type: Boolean, attribute: 'no-controls' })
  noControls = false;

  @property({ type: Boolean, attribute: 'fit-bounds' })
  fitBounds = false;

  @property({ type: String, attribute: 'max-bounds' })
  maxBounds = '';

  @property({ type: String })
  name = '';

  // --- Etat interne ---

  private _leafletMap: LeafletMap | null = null;
  private _tileLayer: LeafletTileLayer | null = null;
  private _container: HTMLDivElement | null = null;
  private _observer: MutationObserver | null = null;
  private _layerBounds: import('leaflet').LatLngBounds[] = [];
  private _skipLink: HTMLAnchorElement | null = null;
  private _srDescription: HTMLParagraphElement | null = null;
  private _liveRegion: HTMLDivElement | null = null;
  private _afterMapAnchor: HTMLDivElement | null = null;

  // Light DOM
  createRenderRoot() { return this; }

  // --- Lifecycle ---

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-map', this.tiles);
    this._initMap();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._observer?.disconnect();
    this._observer = null;
    if (this._leafletMap) {
      this._leafletMap.remove();
      this._leafletMap = null;
    }
    this._container = null;
    this._skipLink?.remove();
    this._skipLink = null;
    this._srDescription?.remove();
    this._srDescription = null;
    this._liveRegion?.remove();
    this._liveRegion = null;
    this._afterMapAnchor?.remove();
    this._afterMapAnchor = null;
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);

    if (this._leafletMap) {
      if (changedProperties.has('tiles')) {
        this._updateTiles();
      }
      if (changedProperties.has('height') && this._container) {
        this._container.style.height = this.height;
        this._leafletMap.invalidateSize();
      }
    }
  }

  // --- Public API ---

  /** Retourne l'instance Leaflet L.Map (ou null si pas encore prete) */
  getLeafletMap(): LeafletMap | null {
    return this._leafletMap;
  }

  /** Retourne le module Leaflet charge (pour les layers) */
  getLeafletLib(): typeof import('leaflet') | null {
    return L;
  }

  /** Notifie la carte qu'un layer a ses bounds prets (pour fit-bounds) */
  registerLayerBounds(bounds: import('leaflet').LatLngBounds): void {
    this._layerBounds.push(bounds);
    if (this.fitBounds && this._leafletMap) {
      this._applyFitBounds();
    }
  }

  /** Annonce un message aux screen readers via la live region */
  announceToScreenReader(message: string): void {
    if (!this._liveRegion) return;
    // Clear then set to ensure re-announcement
    this._liveRegion.textContent = '';
    requestAnimationFrame(() => {
      if (this._liveRegion) this._liveRegion.textContent = message;
    });
  }

  /** Met a jour la description de la carte (appele par les layers quand les donnees changent) */
  updateDescription(layerSummaries: string[]): void {
    if (!this._srDescription) return;
    const parts = [this._buildMapDescription()];
    parts.push(...layerSummaries);
    this._srDescription.textContent = parts.join(' ');
  }

  private _buildMapDescription(): string {
    const parts: string[] = [];
    parts.push(`Carte interactive${this.name ? ` : ${this.name}` : ''}.`);
    parts.push('Utilisez les fleches pour deplacer la carte, + et - pour zoomer.');
    parts.push('Tabulez pour atteindre les marqueurs.');
    return parts.join(' ');
  }

  // --- Init ---

  private async _initMap() {
    const leaflet = await loadLeaflet();

    // Inject Leaflet CSS if not already present
    if (!document.querySelector('link[href*="leaflet.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // Inject component CSS
    this._injectStyles();

    // Ensure stable ID for ARIA references
    if (!this.id) {
      this.id = `dsfr-data-map-${Date.now()}`;
    }
    const mapId = this.id;
    const descId = `${mapId}-desc`;
    const afterId = `${mapId}-after`;

    // --- A11y: Skip link "Passer la carte" (WCAG 2.4.1 Bypass Blocks) ---
    this._skipLink = document.createElement('a');
    this._skipLink.href = `#${afterId}`;
    this._skipLink.className = 'dsfr-data-map__skiplink';
    this._skipLink.textContent = 'Passer la carte';
    this.insertBefore(this._skipLink, this.firstChild);

    // --- A11y: Screen-reader description (aria-describedby) ---
    this._srDescription = document.createElement('p');
    this._srDescription.id = descId;
    this._srDescription.className = 'dsfr-data-map__sr-only';
    this._srDescription.textContent = this._buildMapDescription();
    this.insertBefore(this._srDescription, this._skipLink.nextSibling);

    // Create container div
    this._container = document.createElement('div');
    this._container.className = 'dsfr-data-map__container';
    this._container.style.height = this.height;
    this._container.style.width = '100%';
    this._container.setAttribute('role', 'application');
    this._container.setAttribute('aria-label', `Carte interactive${this.name ? ` : ${this.name}` : ''}`);
    this._container.setAttribute('aria-describedby', descId);
    // Keyboard: allow Tab in, then Tab out cleanly (no trap)
    this._container.setAttribute('tabindex', '0');

    this.insertBefore(this._container, this._srDescription.nextSibling);

    // --- A11y: Live region for popup announcements ---
    this._liveRegion = document.createElement('div');
    this._liveRegion.setAttribute('aria-live', 'assertive');
    this._liveRegion.setAttribute('aria-atomic', 'true');
    this._liveRegion.className = 'dsfr-data-map__sr-only';
    this._liveRegion.id = `${mapId}-live`;
    this.insertBefore(this._liveRegion, this._container.nextSibling);

    // --- A11y: Anchor after map for skip link target ---
    this._afterMapAnchor = document.createElement('div');
    this._afterMapAnchor.id = afterId;
    this._afterMapAnchor.setAttribute('tabindex', '-1');
    // Append after all map-layer children
    this.appendChild(this._afterMapAnchor);

    // Parse center
    const [lat, lon] = this.center.split(',').map(Number);

    // Init Leaflet map
    this._leafletMap = leaflet.map(this._container, {
      center: [lat || 46.603, lon || 2.888],
      zoom: this.zoom,
      minZoom: this.minZoom,
      maxZoom: this.maxZoom,
      zoomControl: !this.noControls,
    });

    // Max bounds
    if (this.maxBounds) {
      const parts = this.maxBounds.split(',').map(Number);
      if (parts.length === 4) {
        this._leafletMap.setMaxBounds([
          [parts[0], parts[1]],
          [parts[2], parts[3]],
        ] as LatLngBoundsExpression);
      }
    }

    // Tiles
    this._updateTiles();

    // Viewport events → notify layers
    this._leafletMap.on('moveend', () => this._notifyLayers());
    this._leafletMap.on('zoomend', () => this._notifyLayers());

    // Observe child layer additions/removals
    this._observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if ((node as HTMLElement).tagName?.toLowerCase() === 'dsfr-data-map-layer') {
            (node as any)._onMapReady?.();
          }
        }
      }
    });
    this._observer.observe(this, { childList: true });

    // Notify already-present layers
    this._notifyExistingLayers();
  }

  private _updateTiles() {
    if (!this._leafletMap || !L) return;
    if (this._tileLayer) {
      this._tileLayer.remove();
    }
    const preset = TILE_PRESETS[this.tiles];
    if (preset) {
      this._tileLayer = L.tileLayer(preset.url, {
        attribution: preset.attribution,
        ...preset.options,
      }).addTo(this._leafletMap);
    } else {
      // Custom URL template
      this._tileLayer = L.tileLayer(this.tiles, {
        attribution: '',
      }).addTo(this._leafletMap);
    }
  }

  private _notifyLayers() {
    const layers = this.querySelectorAll('dsfr-data-map-layer');
    for (const layer of layers) {
      (layer as any)._onViewportChange?.();
    }
  }

  private _notifyExistingLayers() {
    const layers = this.querySelectorAll('dsfr-data-map-layer');
    for (const layer of layers) {
      (layer as any)._onMapReady?.();
    }
  }

  private _applyFitBounds() {
    if (!this._leafletMap || !L || this._layerBounds.length === 0) return;
    let combined = this._layerBounds[0];
    for (let i = 1; i < this._layerBounds.length; i++) {
      combined = combined.extend(this._layerBounds[i]);
    }
    this._leafletMap.fitBounds(combined, { padding: [20, 20] });
  }

  private _injectStyles() {
    if (document.querySelector('style[data-dsfr-data-map]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-dsfr-data-map', '');
    style.textContent = `
      dsfr-data-map {
        display: block;
        position: relative;
      }
      .dsfr-data-map__container {
        z-index: 0;
      }
      /* Fix DSFR vs Leaflet conflict — DSFR styles all [href] with underlines and ::before/::after */
      .dsfr-data-map__container .leaflet-control-zoom a {
        text-decoration: none;
        background-image: none !important;
      }
      .dsfr-data-map__container .leaflet-control-zoom a::before,
      .dsfr-data-map__container .leaflet-control-zoom a::after {
        content: none !important;
      }
      /* Also neutralize DSFR [href] on popup close button and attribution links */
      .dsfr-data-map__container a[href] {
        background-image: none !important;
      }
      .dsfr-data-map__marker {
        background: none !important;
        border: none !important;
      }
      .dsfr-data-map__popup table {
        margin: 0;
        font-size: 0.875rem;
      }
      .dsfr-data-map__popup th {
        text-align: left;
        padding-right: 0.5rem;
        font-weight: 600;
        white-space: nowrap;
      }
      /* A11y: Skip link — visible only on focus */
      .dsfr-data-map__skiplink {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        margin: -1px;
        padding: 0;
        border: 0;
      }
      .dsfr-data-map__skiplink:focus {
        position: relative;
        width: auto;
        height: auto;
        overflow: visible;
        clip: auto;
        white-space: normal;
        margin: 0;
        display: inline-block;
        padding: 0.25rem 0.75rem;
        background: var(--background-default-grey, #fff);
        color: var(--text-action-high-blue-france, #000091);
        text-decoration: underline;
        font-size: 0.875rem;
        z-index: 1001;
      }
      /* A11y: Screen-reader only content */
      .dsfr-data-map__sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        margin: -1px;
        padding: 0;
        border: 0;
      }
      .dsfr-data-map__max-items-banner {
        position: absolute;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1000;
        background: var(--background-contrast-warning, #FFE9E6);
        color: var(--text-default-warning, #B34000);
        padding: 0.5rem 1rem;
        border-radius: 4px;
        font-size: 0.875rem;
        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);
  }

  render() {
    // Light DOM — the container div is created imperatively
    return nothing;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-map': DsfrDataMap;
  }
}
