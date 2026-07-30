/**
 * dsfr-data-map-inset — Encart territorial d'une carte (DROM, Corse, zoom local...)
 *
 * Composant compagnon place comme enfant de dsfr-data-map. Rend une mini-carte
 * verrouillee (zoom fixe, sans interactions) centree sur un territoire, qui
 * reutilise automatiquement les couches (dsfr-data-map-layer) ET le popup
 * (dsfr-data-map-popup) de la carte hote : un clic sur un element de l'encart
 * ouvre le volet/la modale de la carte principale.
 *
 * @example
 * <dsfr-data-map center="46.5,2.6" zoom="6" tiles="ign-plan">
 *   <dsfr-data-map-layer source="territoires" type="geoshape" geo-field="geojson">
 *   </dsfr-data-map-layer>
 *   <dsfr-data-map-popup mode="panel-right" title-field="nom">
 *     <template>...</template>
 *   </dsfr-data-map-popup>
 *   <dsfr-data-map-inset center="16.20,-61.45" zoom="9" label="Guadeloupe"></dsfr-data-map-inset>
 *   <dsfr-data-map-inset center="14.63,-61.00" zoom="9" label="Martinique"></dsfr-data-map-inset>
 * </dsfr-data-map>
 */
import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TERRITORY_PRESETS } from '../utils/territories.js';

export { TERRITORY_PRESETS, TERRITORY_GROUPS } from '../utils/territories.js';

@customElement('dsfr-data-map-inset')
export class DsfrDataMapInset extends LitElement {
  /** Territoire predefini (guadeloupe, martinique, guyane, la-reunion, mayotte,
   *  saint-pierre-et-miquelon, saint-martin, saint-barthelemy, nouvelle-caledonie,
   *  polynesie-francaise, wallis-et-futuna, corse) — fournit center/zoom/label */
  @property({ type: String })
  territory = '';

  /** Centre "lat,lon" de l'encart (requis sans territory ; prioritaire sur le preset) */
  @property({ type: String })
  center = '';

  /** Zoom fixe de l'encart (prioritaire sur le preset) */
  @property({ type: Number })
  zoom = 0;

  /** Libelle affiche au-dessus de l'encart (et nom accessible de la mini-carte) */
  @property({ type: String })
  label = '';

  /** Hauteur de la mini-carte */
  @property({ type: String })
  height = '160px';

  private _built = false;
  private _innerMap: HTMLElement | null = null;

  createRenderRoot() {
    // Light DOM : coherent avec dsfr-data-map (Leaflet + styles globaux)
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // Differer la construction : au parse initial, les dsfr-data-map-layer
    // freres peuvent ne pas encore etre presents dans le DOM.
    requestAnimationFrame(() => this._build());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._innerMap?.remove();
    this._innerMap = null;
    this._built = false;
  }

  private _build() {
    if (this._built || !this.isConnected) return;
    const host = this.closest('dsfr-data-map');
    if (!host) return;

    // Resolution territoire predefini : les attributs explicites priment
    if (this.territory) {
      const preset = TERRITORY_PRESETS[this.territory];
      if (!preset) {
        console.warn(
          `dsfr-data-map-inset: territoire inconnu "${this.territory}". ` +
            `Territoires disponibles : ${Object.keys(TERRITORY_PRESETS).join(', ')}.`
        );
        return;
      }
      if (!this.center) this.center = preset.center;
      if (!this.zoom) this.zoom = preset.zoom;
      if (!this.label) this.label = preset.label;
    }
    if (!this.center) return;
    if (!this.zoom) this.zoom = 8;

    // Les encarts sont des enfants directs de la carte hote ; on ne clone que
    // ses couches directes (jamais d'encart -> pas de recursion possible).
    const layers = host.querySelectorAll(':scope > dsfr-data-map-layer');
    if (layers.length === 0) return;

    this.style.display = 'inline-block';
    this.style.verticalAlign = 'top';

    if (this.label) {
      const labelEl = document.createElement('span');
      labelEl.className = 'dsfr-data-map-inset__label';
      labelEl.textContent = this.label;
      labelEl.style.cssText =
        'display:block;text-align:center;font-size:.8125rem;font-weight:700;margin-bottom:.25rem;';
      this.appendChild(labelEl);
    }

    const inner = document.createElement('dsfr-data-map');
    inner.setAttribute('center', this.center);
    inner.setAttribute('zoom', String(this.zoom));
    inner.setAttribute('min-zoom', String(this.zoom));
    inner.setAttribute('max-zoom', String(this.zoom));
    inner.setAttribute('height', this.height);
    inner.setAttribute('no-controls', '');
    inner.setAttribute('locked', '');
    const tiles = host.getAttribute('tiles');
    if (tiles) inner.setAttribute('tiles', tiles);
    inner.setAttribute('name', this.label ? `Encart — ${this.label}` : 'Encart de carte');

    for (const layer of layers) {
      // Clone superficiel : attributs seulement (pas les popups/templates enfants).
      const clone = layer.cloneNode(false) as HTMLElement;
      // Jamais d'id duplique dans le document ; matchesLayer() retombe sur `source`.
      clone.removeAttribute('id');
      inner.appendChild(clone);
    }

    this.appendChild(inner);
    this._innerMap = inner;
    this._built = true;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-map-inset': DsfrDataMapInset;
  }
}
