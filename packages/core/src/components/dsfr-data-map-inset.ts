/**
 * dsfr-data-map-inset — Encart territorial d'une carte (DROM, Corse, zoom local...)
 *
 * Composant compagnon place comme enfant de dsfr-data-map. Rend une mini-carte
 * verrouillee (zoom fixe, sans interactions) centree sur un territoire, qui
 * reutilise automatiquement les couches (dsfr-data-map-layer) ET le popup
 * (dsfr-data-map-popup) de la carte hote : un clic sur un élément de l'encart
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
import { BREAKPOINTS, syncLayoutError, type Breakpoint } from '../utils/grid-layout.js';
import { TERRITORY_PRESETS } from '../utils/territories.js';

export { TERRITORY_PRESETS, TERRITORY_GROUPS } from '../utils/territories.js';

/** Variables CSS de l'echelle de largeur (#818), posees sur l'encart. */
const INSET_WIDTH_VARS = [
  '--dsfr-data-inset-w',
  ...(Object.keys(BREAKPOINTS) as Breakpoint[]).map((bp) => `--dsfr-data-inset-w-${bp}`),
];

/** Longueur CSS lisible pour une largeur d'encart. */
const LENGTH = /^\d+(\.\d+)?(px|rem|em|%|vw)$/;

/**
 * Lit une echelle de longueurs (#818) : `"50% md:20%"`, `"md:20%"`. Rend la
 * base (ou null) et les paliers, ou une erreur nommee. Meme grammaire que
 * `parseScale` (#789), sur des longueurs CSS.
 */
export function parseLengthScale(text: string): {
  base: string | null;
  steps: Array<[Breakpoint, string]>;
  error: string | null;
} {
  const steps: Array<[Breakpoint, string]> = [];
  let base: string | null = null;
  const fail = (why: string) => ({ base: null, steps: [], error: `width="${text}" : ${why}` });
  for (const [i, token] of text.split(/\s+/).entries()) {
    const colon = token.indexOf(':');
    if (colon === -1) {
      if (i !== 0)
        return fail(`« ${token} » sans point de rupture — seul le premier terme peut être nu`);
      if (!LENGTH.test(token)) return fail(`longueur « ${token} » illisible (px, rem, em, %, vw)`);
      base = token;
      continue;
    }
    const bp = token.slice(0, colon);
    const value = token.slice(colon + 1);
    if (!(bp in BREAKPOINTS)) {
      return fail(
        `point de rupture inconnu « ${bp} » — points de rupture DSFR : ${Object.keys(BREAKPOINTS).join(', ')}`
      );
    }
    if (!LENGTH.test(value)) return fail(`longueur « ${value} » illisible (px, rem, em, %, vw)`);
    steps.push([bp as Breakpoint, value]);
  }
  return { base, steps, error: null };
}

@customElement('dsfr-data-map-inset')
export class DsfrDataMapInset extends LitElement {
  /** Territoire predefini (guadeloupe, martinique, guyane, la-reunion, mayotte,
   *  saint-pierre-et-miquelon, saint-martin, saint-barthelemy, nouvelle-caledonie,
   *  polynesie-française, wallis-et-futuna, corse) — fournit center/zoom/label */
  @property({ type: String })
  territory = '';

  /** Centre "lat,lon" de l'encart (requis sans territory ; prioritaire sur le preset) */
  @property({ type: String })
  center = '';

  /** Zoom fixe de l'encart (prioritaire sur le preset) */
  @property({ type: Number })
  zoom = 0;

  /** Libellé affiché au-dessus de l'encart (et nom accessible de la mini-carte) */
  @property({ type: String })
  label = '';

  /** Hauteur de la mini-carte (px, rem, vh). Un `%` est un ratio de la LARGEUR de l'encart, comme sur `dsfr-data-map`. */
  @property({ type: String })
  height = '160px';

  /**
   * Largeur de l'encart (px, rem, %). Un `%` est relatif a la largeur de la
   * carte hote : `width="20%"` repartit cinq encarts sur une ligne. Sans
   * attribut, la feuille injectee par la carte pose `10rem` — une regle de
   * page `dsfr-data-map-inset { width: … }` prime toujours dessus (#643).
   * Echelle mobile-first (#818), comme `per-row` et `span` (#789) :
   * `width="50% md:20%"` — le premier terme sous le premier point de
   * rupture, puis un palier par point de rupture DSFR (sm 576, md 768,
   * lg 992, xl 1248 px) ; un palier absent reprend le precedent. En echelle,
   * une regle de page prime aussi, a toutes les largeurs. Un point de
   * rupture inconnu ou une longueur illisible est une erreur de configuration.
   */
  @property({ type: String })
  width = '';

  /** Erreur de largeur posee par ce composant (#818). */
  private _widthError: string | null = null;

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

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('width')) {
      // Attribut retire : on n'efface que ce qu'on avait pose, jamais un
      // style="width:…" ecrit par l'integrateur
      if (this.width || changedProperties.get('width')) this._applyWidth();
    }
    if (changedProperties.has('height') && this._innerMap) {
      this._innerMap.setAttribute('height', this.height);
    }
  }

  /**
   * Attribut `width` : valeur nue → style inline, comme toujours ; echelle
   * (#818) → variables CSS consommees par la feuille de la carte, un style
   * inline ne pouvant pas porter de media query. Vide → la feuille decide.
   */
  private _applyWidth() {
    const text = this.width.trim();
    const isScale = /\s/.test(text);
    for (const name of INSET_WIDTH_VARS) this.style.removeProperty(name);
    this.removeAttribute('data-width-scale');
    if (!isScale) {
      this.style.width = text;
      this._widthError = syncLayoutError(this, 'dsfr-data-map-inset', null, this._widthError);
      return;
    }
    this.style.width = '';
    const parsed = parseLengthScale(text);
    this._widthError = syncLayoutError(this, 'dsfr-data-map-inset', parsed.error, this._widthError);
    if (parsed.error) return;
    this.setAttribute('data-width-scale', '');
    if (parsed.base) this.style.setProperty('--dsfr-data-inset-w', parsed.base);
    for (const [bp, value] of parsed.steps) {
      this.style.setProperty(`--dsfr-data-inset-w-${bp}`, value);
    }
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

    // Le placement (flottant, largeur par defaut, gouttiere) vient de la
    // feuille injectee par dsfr-data-map (#643) : rien en style inline, pour
    // que le CSS de page garde la main. Seul l'attribut explicite se pose ici.
    if (this.width) this._applyWidth();

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
    // Fond attenue (#686) : le filtre est scope a chaque carte, l'encart
    // reprend le reglage de la carte hote
    const tilesStyle = host.getAttribute('tiles-style');
    if (tilesStyle) inner.setAttribute('tiles-style', tilesStyle);
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
