import { LitElement, html, svg, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { getByPath } from '../utils/json-path.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import { CHOROPLETH_SCALES, quantileBreaks, getColorForValue } from '@dsfr-data/shared/lib';
import { renderSourceLoading, renderSourceError } from '../utils/status-templates.js';
import { geoPath, geoNaturalEarth1 } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { COUNTRY_CONTINENT, toIsoNumeric } from '../data/continent-lookup.js';
import { COUNTRY_NAMES_FR } from '../data/country-names.js';
import type { ContinentName } from '../data/continent-lookup.js';

// Lazy-loaded topology cache
let topologyCache: Topology | null = null;

// TopoJSON asset filename — kept as a variable so Vite does not
// detect it as a static asset and inline it as base64 (~140 KB).
const TOPO_ASSET = 'world-countries-110m.json';

/** Promesse en vol partagee (#299) : deux world-maps = UN seul fetch */
let topologyPromise: Promise<Topology> | null = null;

async function loadTopology(): Promise<Topology> {
  if (topologyCache) return topologyCache;
  if (topologyPromise) return topologyPromise;
  topologyPromise = _doLoadTopology().catch((e) => {
    topologyPromise = null;
    throw e;
  });
  return topologyPromise;
}

async function _doLoadTopology(): Promise<Topology> {
  // Try loading from data/ relative to the library script location,
  // then fall back to /data/ (served by public/ in dev or by the host in prod).
  const scriptBase = import.meta.url.replace(/\/[^/]+$/, '');
  const candidates = [
    `${scriptBase}/data/${TOPO_ASSET}`,
    `${scriptBase}/../data/${TOPO_ASSET}`,
    `/data/${TOPO_ASSET}`,
  ];
  for (const url of candidates) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        topologyCache = (await resp.json()) as Topology;
        return topologyCache;
      }
    } catch {
      /* try next */
    }
  }
  throw new Error(`Could not load ${TOPO_ASSET} from any candidate path`);
}

const WIDTH = 960;
const HEIGHT = 500;
const PADDING = 20;

type CodeFormat = 'iso-a2' | 'iso-a3' | 'iso-num';

interface CountryFeature {
  type: 'Feature';
  id: string;
  properties: { name: string };
  geometry: GeoPermissibleObjects;
}

/**
 * Palettes choropleth 9 teintes — tokens DSFR complets
 * blue-france: 975→main-525 | red-marianne: 975→main-472 | grey: 975→main-50
 */
// Echelles choroplethes : source unique @dsfr-data/shared (#302) — la copie
// locale bucketait en sens OPPOSE de map-layer (v >= break vs value <= break).

const CONTINENT_LABELS: Record<string, string> = {
  Africa: 'Afrique',
  Europe: 'Europe',
  Asia: 'Asie',
  'North America': 'Amerique du Nord',
  'South America': 'Amerique du Sud',
  Oceania: 'Oceanie',
};

/**
 * <dsfr-data-world-map> - Carte du monde choropleth avec zoom continent
 *
 * Composant Lit natif (pas DSFR Chart) pour afficher une carte du monde
 * coloree par valeur, avec zoom interactif par continent.
 *
 * @example
 * <dsfr-data-world-map
 *   source="data"
 *   code-field="country_code"
 *   value-field="population"
 *   code-format="iso-a2"
 *   name="Population"
 *   selected-palette="sequentialAscending">
 * </dsfr-data-world-map>
 */
@customElement('dsfr-data-world-map')
export class DsfrDataWorldMap extends SourceSubscriberMixin(LitElement) {
  @property({ type: String })
  source = '';

  @property({ type: String, attribute: 'code-field' })
  codeField = '';

  @property({ type: String, attribute: 'value-field' })
  valueField = '';

  @property({ type: String, attribute: 'code-format' })
  codeFormat: CodeFormat = 'iso-a2';

  @property({ type: String })
  name = '';

  @property({ type: String, attribute: 'selected-palette' })
  selectedPalette = 'sequentialAscending';

  @property({ type: String, attribute: 'unit-tooltip' })
  unitTooltip = '';

  /**
   * Mode de zoom : "continent" (clic = zoom continent) ou "none".
   * Renomme depuis `zoom` (#299) — dsfr-data-map a un `zoom` NUMERIQUE
   * Leaflet : meme nom, types opposes dans la meme famille carte.
   * L'ancien attribut `zoom` reste lu (alias deprecie, warn).
   */
  @property({ type: String, attribute: 'zoom-mode' })
  zoomMode: 'continent' | 'none' = 'continent';

  @state() private _data: unknown[] = [];
  @state() private _topology: Topology | null = null;
  @state() private _zoomedContinent: ContinentName | null = null;
  @state() private _hoveredCountryId: string | null = null;
  @state() private _tooltipX = 0;
  @state() private _tooltipY = 0;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-world-map');
    // Alias deprecie (#299) : zoom="continent|none" -> zoom-mode
    if (this.hasAttribute('zoom') && !this.hasAttribute('zoom-mode')) {
      const legacy = this.getAttribute('zoom');
      if (legacy === 'continent' || legacy === 'none') {
        this.zoomMode = legacy;
        console.warn(
          `dsfr-data-world-map: l'attribut "zoom" est déprécié (collision avec le zoom numérique de dsfr-data-map) — utilisez "zoom-mode"`
        );
      }
    }
    this._validateFields();
    this._loadMap();
  }

  /** code-field/value-field manquants avec une source : carte grise silencieuse sinon (#299) */
  private _validateFields() {
    if (this.source && (!this.codeField || !this.valueField)) {
      const missing = [!this.codeField && 'code-field', !this.valueField && 'value-field']
        .filter(Boolean)
        .join(', ');
      reportConfigError(
        this,
        'dsfr-data-world-map',
        `attribut(s) requis manquant(s) avec une source : ${missing}`
      );
    } else {
      clearConfigError(this);
    }
  }

  onSourceReset(): void {
    this._data = [];
  }

  onSourceData(data: unknown): void {
    this._data = Array.isArray(data) ? data : [];
  }

  private async _loadMap() {
    try {
      this._topology = await loadTopology();
      this.requestUpdate();
    } catch (e) {
      console.error('dsfr-data-world-map: failed to load topology', e);
    }
  }

  // --- Data processing ---

  private _buildValueMap(): Map<string, number> {
    const map = new Map<string, number>();
    if (!this._data.length || !this.codeField || !this.valueField) return map;

    for (const record of this._data) {
      const rawCode = String(getByPath(record, this.codeField) ?? '').trim();
      if (!rawCode) continue;
      const numCode = toIsoNumeric(rawCode, this.codeFormat);
      if (!numCode) continue;
      const value = Number(getByPath(record, this.valueField));
      if (!isNaN(value)) {
        map.set(numCode, Math.round(value * 100) / 100);
      }
    }
    return map;
  }

  private _getChoroplethPalette(): readonly string[] {
    return CHOROPLETH_SCALES[this.selectedPalette] || CHOROPLETH_SCALES['sequentialAscending'];
  }

  private _getColorScale(values: number[]): (v: number) => string {
    if (values.length === 0) return () => '#E5E5F4';
    const palette = this._getChoroplethPalette();

    // Quantiles + bucketing partages (#302) : la convention unique est
    // `value <= break` (bornes superieures inclusives) — l'ancien `v >=
    // break` colorait differemment de map-layer une meme valeur posee sur
    // un break
    const breaks = quantileBreaks(values, palette.length);
    return (v: number) => getColorForValue(v, breaks, palette);
  }

  // --- Geo helpers ---

  private _getFeatures(): CountryFeature[] {
    if (!this._topology) return [];
    const countries = this._topology.objects['countries'] as GeometryCollection;
    const fc = feature(this._topology, countries);
    // `feature` peut renvoyer une Feature simple ou une FeatureCollection ; ici
    // countries est une GeometryCollection donc on a une FeatureCollection.
    return (fc as unknown as { features: CountryFeature[] }).features;
  }

  private _getBorders(): GeoPermissibleObjects | null {
    if (!this._topology) return null;
    const countries = this._topology.objects['countries'] as GeometryCollection;
    return mesh(this._topology, countries, (a, b) => a !== b) as unknown as GeoPermissibleObjects;
  }

  private _getProjection() {
    const proj = geoNaturalEarth1()
      .translate([WIDTH / 2, HEIGHT / 2])
      .scale(153);

    if (this._zoomedContinent) {
      const features = this._getFeatures().filter(
        (f) => COUNTRY_CONTINENT[f.id] === this._zoomedContinent
      );
      if (features.length > 0) {
        const fc = { type: 'FeatureCollection' as const, features };
        proj.fitExtent(
          [
            [PADDING, PADDING],
            [WIDTH - PADDING, HEIGHT - PADDING],
          ],
          fc as GeoPermissibleObjects
        );
      }
    }

    return proj;
  }

  // --- Event handlers ---

  private _onCountryClick(countryId: string) {
    if (this.zoomMode === 'none') return;

    if (this._zoomedContinent) {
      // Already zoomed: clicking again resets
      this._zoomedContinent = null;
    } else {
      const continent = COUNTRY_CONTINENT[countryId] as ContinentName | undefined;
      if (continent) {
        this._zoomedContinent = continent;
      }
    }
  }

  private _onCountryHover(e: MouseEvent, countryId: string | null) {
    this._hoveredCountryId = countryId;
    if (countryId) {
      const rect = (this as HTMLElement).getBoundingClientRect();
      this._tooltipX = e.clientX - rect.left + 12;
      this._tooltipY = e.clientY - rect.top - 8;
    }
  }

  private _onBackClick() {
    this._zoomedContinent = null;
  }

  // --- Render ---

  private _renderMap() {
    const features = this._getFeatures();
    const borders = this._getBorders();
    const projection = this._getProjection();
    const path = geoPath(projection);
    const valueMap = this._buildValueMap();
    const allValues = [...valueMap.values()];
    const colorScale = this._getColorScale(allValues);
    const noDataColor = '#F0F0F0';

    const countryPaths = features.map((f) => {
      const d = path(f.geometry as GeoPermissibleObjects) || '';
      const value = valueMap.get(f.id);
      const fill = value !== undefined ? colorScale(value) : noDataColor;
      const isHovered = this._hoveredCountryId === f.id;

      // A11y (#299) : pays focusable, annonce nom + valeur au focus,
      // Entree/Espace = clic — l'interaction etait 100 % souris
      const countryName = COUNTRY_NAMES_FR[f.id] || f.properties?.name || f.id;
      const ariaValue =
        value !== undefined
          ? `${value.toLocaleString('fr-FR')}${this.unitTooltip ? ' ' + this.unitTooltip : ''}`
          : 'pas de données';
      return svg`<path
        class="dsfr-data-world-map__country"
        d=${d}
        fill=${fill}
        stroke=${isHovered ? '#000091' : 'none'}
        stroke-width=${isHovered ? '1.5' : '0'}
        data-id=${f.id}
        tabindex="0"
        role=${this.zoomMode !== 'none' ? 'button' : 'img'}
        aria-label="${countryName} : ${ariaValue}"
        style="cursor: ${this.zoomMode !== 'none' ? 'pointer' : 'default'}"
        @click=${() => this._onCountryClick(f.id)}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._onCountryClick(f.id);
          }
        }}
        @focus=${() => {
          this._hoveredCountryId = f.id;
        }}
        @blur=${() => {
          this._hoveredCountryId = null;
        }}
        @mouseenter=${(e: MouseEvent) => this._onCountryHover(e, f.id)}
        @mousemove=${(e: MouseEvent) => this._onCountryHover(e, f.id)}
        @mouseleave=${(e: MouseEvent) => this._onCountryHover(e, null)}
      />`;
    });

    const borderPath = borders ? path(borders) || '' : '';

    return html`
      <div class="dsfr-data-world-map__container" style="position: relative;">
        ${this._zoomedContinent
          ? html`
              <button
                class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline"
                style="position: absolute; top: 8px; left: 8px; z-index: 2;"
                @click=${this._onBackClick}
                aria-label="Revenir a la vue monde"
              >
                <span class="fr-icon-arrow-left-line" aria-hidden="true"></span>
                ${CONTINENT_LABELS[this._zoomedContinent] || this._zoomedContinent}
              </button>
            `
          : nothing}

        <svg
          viewBox="0 0 ${WIDTH} ${HEIGHT}"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label=${this._getAriaLabel()}
          style="width: 100%; height: auto; display: block;"
        >
          <g class="dsfr-data-world-map__countries">${countryPaths}</g>
          ${borderPath
            ? svg`<path
            class="dsfr-data-world-map__borders"
            d=${borderPath}
            fill="none"
            stroke="#fff"
            stroke-width="0.5"
            stroke-linejoin="round"
            pointer-events="none"
          />`
            : nothing}
        </svg>

        ${this._renderTooltip(valueMap)} ${this._renderLegend(allValues, colorScale)}
      </div>
    `;
  }

  private _renderTooltip(valueMap: Map<string, number>) {
    if (!this._hoveredCountryId) return nothing;

    const name =
      COUNTRY_NAMES_FR[this._hoveredCountryId] ||
      this._getFeatures().find((f) => f.id === this._hoveredCountryId)?.properties?.name ||
      this._hoveredCountryId;
    const value = valueMap.get(this._hoveredCountryId);
    const valueText =
      value !== undefined
        ? `${value.toLocaleString('fr-FR')}${this.unitTooltip ? ' ' + this.unitTooltip : ''}`
        : 'Pas de données';

    return html`
      <div
        class="dsfr-data-world-map__tooltip"
        style="position: absolute; left: ${this._tooltipX}px; top: ${this._tooltipY}px;
          pointer-events: none; z-index: 10;
          background: var(--background-default-grey, #fff);
          color: var(--text-default-grey, #161616);
          border: 1px solid var(--border-default-grey, #ddd);
          border-radius: 4px; padding: 4px 8px; font-size: 0.8125rem;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15); white-space: nowrap;"
      >
        <strong>${name}</strong><br />
        ${valueText}
      </div>
    `;
  }

  private _renderLegend(values: number[], _colorScale: (v: number) => string) {
    if (values.length === 0) return nothing;

    const palette = this._getChoroplethPalette();
    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    return html`
      <div
        class="dsfr-data-world-map__legend"
        style="display: flex; align-items: center; gap: 4px;
        margin-top: 8px; font-size: 0.75rem; color: var(--text-mention-grey, #666);"
      >
        ${this.name
          ? html`<span style="margin-right: 4px; font-weight: 500;">${this.name}</span>`
          : nothing}
        <span>${min.toLocaleString('fr-FR')}</span>
        <div style="display: flex; height: 12px; border-radius: 2px; overflow: hidden;">
          ${palette.map((c) => html`<div style="width: 20px; background: ${c};"></div>`)}
        </div>
        <span>${max.toLocaleString('fr-FR')}</span>
        ${this.unitTooltip ? html`<span>${this.unitTooltip}</span>` : nothing}
      </div>
    `;
  }

  private _getAriaLabel(): string {
    const count = this._data.length;
    const continent = this._zoomedContinent
      ? CONTINENT_LABELS[this._zoomedContinent] || this._zoomedContinent
      : 'monde';
    return `Carte ${continent}, ${count} valeurs`;
  }

  render() {
    if (this._sourceLoading) {
      return html`
        ${renderSourceLoading('dsfr-data-world-map', 'Chargement de la carte...')}
        <style>
          .dsfr-data-world-map__loading {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 2rem;
            color: var(--text-mention-grey, #666);
            font-size: 0.875rem;
          }
        </style>
      `;
    }

    if (this._sourceError) {
      return html`
        ${renderSourceError('dsfr-data-world-map', this._sourceError)}
        <style>
          .dsfr-data-world-map__error {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 1rem;
            color: var(--text-default-error, #ce0500);
            background: var(--background-alt-red-marianne, #ffe5e5);
            border-radius: 4px;
          }
        </style>
      `;
    }

    if (!this._topology) {
      return html`
        <div class="dsfr-data-world-map__loading" aria-live="polite">
          <span class="fr-icon-loader-4-line" aria-hidden="true"></span>
          Chargement de la carte...
        </div>
        <style>
          .dsfr-data-world-map__loading {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 2rem;
            color: var(--text-mention-grey, #666);
            font-size: 0.875rem;
          }
        </style>
      `;
    }

    // Avec ou sans donnees, la carte se rend (pays en gris sans valeur) —
    // les deux branches identiques (#299) sont fusionnees
    return this._renderMap();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-world-map': DsfrDataWorldMap;
  }
}
