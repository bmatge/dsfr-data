import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import type { DsfrDataContext } from './dsfr-data-context.js';

/**
 * <dsfr-data-context-tags> — récap des filtres actifs d'un contexte (#232).
 *
 * Affiche des tags DSFR supprimables : un tag par filtre actif (libellé
 * naturel + valeur). La croix réinitialise le filtre en VIDANT son UI —
 * même chemin qu'un utilisateur qui efface le champ : les sources, l'URL
 * (#231) et les tags se mettent à jour ensemble.
 *
 * ```html
 * <dsfr-data-context-tags for="ctx"></dsfr-data-context-tags>
 * ```
 */
@customElement('dsfr-data-context-tags')
export class DsfrDataContextTags extends LitElement {
  /** Id du dsfr-data-context observé */
  @property({ type: String })
  for = '';

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

  render() {
    const active = this._context?.activeFilters() ?? [];
    if (active.length === 0) return nothing;

    return html`
      <ul class="fr-tags-group" role="list">
        ${active.map(
          (filter) => html`
            <li>
              <button
                type="button"
                class="fr-tag fr-tag--sm fr-tag--dismiss"
                aria-label="Retirer le filtre ${filter.displayLabel()} : ${filter.displayValue()}"
                @click="${() => filter.clear()}"
              >
                ${filter.displayLabel()}&nbsp;: ${filter.displayValue()}
              </button>
            </li>
          `
        )}
      </ul>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-context-tags': DsfrDataContextTags;
  }
}
