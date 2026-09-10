import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { ContextFilterLike } from '@dsfr-data/shared/lib';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import type { DsfrDataContext } from './dsfr-data-context.js';

/** Un tag rendu : le filtre, la valeur affichée et le geste de retrait */
interface TagEntry {
  filter: ContextFilterLike;
  value: string;
  remove: () => void;
}

/**
 * <dsfr-data-context-tags> — récap des filtres actifs d'un contexte (#232).
 *
 * Affiche des tags DSFR supprimables : un tag par filtre actif (libellé
 * naturel + valeur). La croix réinitialise le filtre en VIDANT son UI —
 * même chemin qu'un utilisateur qui efface le champ : les sources, l'URL
 * (#231) et les tags se mettent à jour ensemble.
 *
 * Tout type de filtre confondu (#678, contrat `ContextFilterLike`) : filtres
 * classiques, champs d'une <dsfr-data-facets context="…">, terme d'une
 * <dsfr-data-search context="…">. Un filtre multi-valeurs (facette `in`)
 * donne UN tag par valeur, chacune retirable seule (#679) ; la recherche
 * donne un tag « Recherche : terme ».
 *
 * ```html
 * <dsfr-data-context-tags for="ctx" clear-all></dsfr-data-context-tags>
 * ```
 *
 * @attr {boolean} clear-all - Ajoute un bouton unique « Tout effacer » (#679) après les tags : vide tous les filtres actifs en une fois (une seule écriture d'URL, une seule notification), annoncé en région live. Absent quand aucun filtre n'est actif. Poser `no-reset` sur les facettes de la page pour ne pas doubler leur bouton local.
 */
@customElement('dsfr-data-context-tags')
export class DsfrDataContextTags extends LitElement {
  /** Id du dsfr-data-context observé */
  @property({ type: String })
  for = '';

  /** Bouton « Tout effacer » (#679) — un seul geste pour vider tous les filtres du contexte */
  @property({ type: Boolean, attribute: 'clear-all' })
  clearAll = false;

  /** Message annoncé par la région live (lecteurs d'écran) */
  @state()
  private _liveAnnouncement = '';

  private _context: DsfrDataContext | null = null;

  private _onContextChange = () => this.requestUpdate();

  /** Light DOM : styles DSFR de la page appliqués aux tags */
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // Bind différé : le contexte peut être déclaré après dans le fragment
    queueMicrotask(() => this._bind());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._context?.removeEventListener('dsfr-data-context-change', this._onContextChange);
    this._context = null;
  }

  willUpdate(changed: Map<string, unknown>) {
    super.willUpdate(changed);
    if (changed.has('for') && this.hasUpdated) {
      this._context?.removeEventListener('dsfr-data-context-change', this._onContextChange);
      this._bind();
    }
  }

  private _bind(): void {
    if (!this.isConnected) return;
    const el = this.for ? document.getElementById(this.for) : null;
    if (!el || el.tagName.toLowerCase() !== 'dsfr-data-context') {
      reportConfigError(
        this,
        'dsfr-data-context-tags',
        this.for
          ? `dsfr-data-context introuvable : "${this.for}"`
          : 'attribut "for" requis (id du dsfr-data-context observé)'
      );
      return;
    }
    clearConfigError(this);
    this._context = el as DsfrDataContext;
    this._context.addEventListener('dsfr-data-context-change', this._onContextChange);
    this.requestUpdate();
  }

  /**
   * Un tag par filtre actif — ou par valeur quand le filtre en expose
   * plusieurs (`displayValues` + `clearValue`, facette `in`, #679).
   */
  private _entries(): TagEntry[] {
    const entries: TagEntry[] = [];
    for (const filter of this._context?.activeFilters() ?? []) {
      const values = filter.displayValues?.() ?? [];
      if (values.length > 1 && filter.clearValue) {
        for (const value of values) {
          entries.push({ filter, value, remove: () => filter.clearValue!(value) });
        }
      } else {
        entries.push({ filter, value: filter.displayValue(), remove: () => filter.clear() });
      }
    }
    return entries;
  }

  private _announce(message: string): void {
    // Vider puis poser : un message identique est ré-annoncé
    this._liveAnnouncement = '';
    requestAnimationFrame(() => {
      this._liveAnnouncement = message;
    });
  }

  private _remove(entry: TagEntry): void {
    entry.remove();
    this._announce(`Filtre retiré : ${entry.filter.displayLabel()} ${entry.value}`);
  }

  /** « Tout effacer » (#679) : un lot côté contexte, une seule diffusion */
  private _clearAll(): void {
    // Annonce en nombre de tags (ce que l'utilisateur voit), pas de filtres
    const count = this._entries().length;
    this._context?.clearAll();
    this._announce(
      count === 0
        ? 'Aucun filtre actif'
        : count === 1
          ? 'Le filtre a été retiré'
          : `Les ${count} filtres ont été retirés`
    );
  }

  render() {
    const entries = this._entries();
    return html`
      <p class="fr-sr-only" aria-live="polite">${this._liveAnnouncement}</p>
      ${
        entries.length === 0
          ? nothing
          : html`
              <ul class="fr-tags-group" role="list">
                ${entries.map(
                (entry) => html`
                  <li>
                    <button
                      type="button"
                      class="fr-tag fr-tag--sm fr-tag--dismiss"
                      aria-label="Retirer le filtre ${entry.filter.displayLabel()} : ${entry.value}"
                      @click="${() => this._remove(entry)}"
                    >
                      ${entry.filter.displayLabel()}&nbsp;: ${entry.value}
                    </button>
                  </li>
                `
              )}
                ${
                this.clearAll
                  ? html`
                      <li>
                        <button
                          type="button"
                          class="fr-btn fr-btn--tertiary fr-btn--sm fr-btn--icon-left fr-icon-close-circle-line"
                          data-action="clear-all"
                          @click="${this._clearAll}"
                        >
                          Tout effacer
                        </button>
                      </li>
                    `
                  : nothing
              }
              </ul>
            `
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-context-tags': DsfrDataContextTags;
  }
}
