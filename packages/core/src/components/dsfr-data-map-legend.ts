/**
 * dsfr-data-map-legend — Légende d'une couche de carte (#685)
 *
 * Composant compagnon placé comme enfant de dsfr-data-map (même modèle que
 * dsfr-data-map-popup / dsfr-data-map-inset). Rend en light DOM, sous la
 * carte, une liste DSFR d'entrées « pastille + texte » décrivant la couche
 * visée par `for` :
 * - couche catégorielle (`color-field` + `color-map`) : une entrée par paire
 *   de `color-map`, plus le repli `color` s'il a servi (« Autres valeurs ») ;
 * - choroplèthe (`type="geoshape"` + `fill-field`) : une entrée par classe,
 *   avec ses bornes chiffrées au format fr-FR (`classes`, `method`, `breaks`
 *   de la couche) ;
 * - couche monochrome : une seule entrée, libellée par `label`.
 *
 * Les entrées viennent de `getLegendEntries()` de la couche et sont
 * rafraîchies à chaque `dsfr-data-map-layer-render` (filtre amont, timeline,
 * bbox…). RGAA : la couleur seule ne porte pas l'information — la pastille est
 * `aria-hidden`, le texte porte le sens.
 *
 * Hors périmètre : les cartes choroplèthes de `dsfr-data-chart type="map"`
 * (échelle continue rendue par DSFR Chart, sans classes exposées) — demande
 * amont `nb-classes` ouverte chez GouvernementFR/dsfr-chart.
 *
 * @example
 * <dsfr-data-map center="46.5,2.6" zoom="6">
 *   <dsfr-data-map-layer id="densite" source="depts" type="geoshape" geo-field="geometry"
 *     fill-field="densite" selected-palette="sequentialAscending" classes="5">
 *   </dsfr-data-map-layer>
 *   <dsfr-data-map-legend for="densite" label="Densité (hab./km²)"></dsfr-data-map-legend>
 * </dsfr-data-map>
 */
import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { LegendEntry } from '@dsfr-data/shared/lib';
import { sendWidgetBeacon } from '../utils/beacon.js';

/** Surface minimale attendue d'une couche (evite l'import du composant : pas de couplage de chargement). */
type LegendSourceLayer = Element & { getLegendEntries?: () => LegendEntry[] };

@customElement('dsfr-data-map-legend')
export class DsfrDataMapLegend extends LitElement {
  /** Id (ou `source`) de la couche dsfr-data-map-layer décrite. Vide = toutes les couches directes de la carte hôte, entrées concaténées. */
  @property({ type: String, attribute: 'for' })
  for = '';

  /** Titre de la légende, affiché au-dessus de la liste (ex. « Densité (hab./km²) »). Sert aussi de libellé à l'entrée unique d'une couche monochrome. */
  @property({ type: String })
  label = '';

  private _root: HTMLDivElement | null = null;
  private _onRender = (e: Event) => this._handleRender(e);

  createRenderRoot() {
    // Light DOM : coherent avec la famille dsfr-data-map (styles DSFR de la page)
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-map-legend');
    this._injectStyles();
    // Les couches emettent sur elles-memes (bubbles) : ecouter sur document
    // couvre la legende dans la carte comme hors de la carte (`for` global).
    document.addEventListener('dsfr-data-map-layer-render', this._onRender);
    // Les couches freres peuvent ne pas etre presentes au parse initial, et
    // une couche deja rendue n'emettra plus : lecture differee de leur etat.
    requestAnimationFrame(() => this.refresh());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('dsfr-data-map-layer-render', this._onRender);
    this._root?.remove();
    this._root = null;
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('for') || changedProperties.has('label')) this.refresh();
  }

  /** Couches decrites par cette legende (voir `for`). */
  private _targetLayers(): LegendSourceLayer[] {
    const host = this.closest('dsfr-data-map');
    if (this.for) {
      const byId = document.getElementById(this.for);
      if (byId?.tagName.toLowerCase() === 'dsfr-data-map-layer') return [byId as LegendSourceLayer];
      // Repli sur `source` (comme matchesLayer() du popup) — comparaison en JS,
      // pas de selecteur d'attribut : la valeur vient du HTML de l'integrateur
      const scope = host ?? document;
      for (const layer of scope.querySelectorAll('dsfr-data-map-layer')) {
        if (layer.getAttribute('source') === this.for) return [layer as LegendSourceLayer];
      }
      if (byId) this._warnNotALayer(byId, scope);
      return [];
    }
    if (!host) return [];
    return [...host.querySelectorAll(':scope > dsfr-data-map-layer')] as LegendSourceLayer[];
  }

  /** Valeur de `for` deja signalee : un avertissement par valeur, pas par rendu. */
  private _warnedFor: string | null = null;

  /**
   * `for` designe un element qui existe mais n'est pas une couche (#771) :
   * le piege vient du voisinage, le `for` de `dsfr-data-a11y` designe le
   * composant HOTE (la carte), celui de la legende la COUCHE. La legende se
   * rendait masquee, sans un mot.
   */
  private _warnNotALayer(found: Element, scope: ParentNode): void {
    if (this._warnedFor === this.for) return;
    this._warnedFor = this.for;
    const layerIds = [...scope.querySelectorAll('dsfr-data-map-layer')]
      .map((layer) => layer.id)
      .filter(Boolean);
    const hint = layerIds.length
      ? ` — couche(s) disponible(s) : ${layerIds.map((id) => `for="${id}"`).join(', ')}`
      : ' — donner un id à la couche à décrire et le reprendre dans for';
    console.warn(
      `dsfr-data-map-legend: for="${this.for}" désigne un <${found.tagName.toLowerCase()}>, ` +
        `pas un <dsfr-data-map-layer> : la légende reste vide. Son for attend l'id de la ` +
        `COUCHE (celui de dsfr-data-a11y attend la carte)${hint}`
    );
  }

  private _handleRender(e: Event) {
    const target = e.target as Element | null;
    if (!target || !this._targetLayers().includes(target as LegendSourceLayer)) return;
    this.refresh();
  }

  /** Entrées actuellement affichées (lecture, pour les tests et les diagnostics). */
  getEntries(): LegendEntry[] {
    const entries: LegendEntry[] = [];
    for (const layer of this._targetLayers()) {
      for (const entry of layer.getLegendEntries?.() ?? []) entries.push(entry);
    }
    return entries;
  }

  /** Relit les couches et redessine la liste. */
  refresh(): void {
    if (!this.isConnected) return;
    const entries = this.getEntries();
    if (!this._root) {
      this._root = document.createElement('div');
      this._root.className = 'dsfr-data-map-legend';
      this._root.setAttribute('role', 'group');
      this.appendChild(this._root);
    }
    this._root.setAttribute(
      'aria-label',
      this.label ? `Légende : ${this.label}` : 'Légende de la carte'
    );
    this._root.replaceChildren();
    if (entries.length === 0) {
      this._root.hidden = true;
      return;
    }
    this._root.hidden = false;

    if (this.label) {
      const title = document.createElement('p');
      title.className = 'fr-text--sm fr-text--bold fr-mb-1v dsfr-data-map-legend__title';
      title.textContent = this.label;
      this._root.appendChild(title);
    }

    const list = document.createElement('ul');
    list.className = 'fr-raw-list dsfr-data-map-legend__list';
    for (const entry of entries) {
      const item = document.createElement('li');
      item.className = 'fr-text--sm dsfr-data-map-legend__item';
      const swatch = document.createElement('span');
      swatch.className = 'dsfr-data-map-legend__swatch';
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.backgroundColor = entry.color;
      const text = document.createElement('span');
      text.className = 'dsfr-data-map-legend__label';
      text.textContent = entry.label || this.label || 'Données';
      item.append(swatch, text);
      list.appendChild(item);
    }
    this._root.appendChild(list);
  }

  private _injectStyles() {
    if (document.querySelector('style[data-dsfr-data-map-legend]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-dsfr-data-map-legend', '');
    style.textContent = `
      /* clear: la legende passe SOUS les encarts flottants (#643) */
      :where(dsfr-data-map-legend) {
        display: block;
        clear: both;
        padding-top: 0.5rem;
      }
      .dsfr-data-map-legend__list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem 1rem;
        margin: 0;
        padding: 0;
      }
      .dsfr-data-map-legend__item {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        margin: 0;
        padding: 0;
      }
      .dsfr-data-map-legend__swatch {
        display: inline-block;
        width: 1rem;
        height: 1rem;
        border-radius: 0.125rem;
        border: 1px solid var(--border-default-grey, #ddd);
        flex: none;
      }
    `;
    document.head.appendChild(style);
  }

  render() {
    return undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-map-legend': DsfrDataMapLegend;
  }
}
