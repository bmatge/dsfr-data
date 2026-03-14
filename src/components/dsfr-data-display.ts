import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { getByPath } from '../utils/json-path.js';
import { escapeHtml } from '@dsfr-data/shared';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { getDataMeta, dispatchSourceCommand } from '../utils/data-bridge.js';

/**
 * <dsfr-data-display> - Affichage dynamique de donnees via template HTML
 *
 * Recupere les donnees d'une source et les injecte dans un template HTML
 * defini par l'utilisateur, en generant autant d'elements qu'il y a de
 * resultats. Ideal pour creer des listes de cartes, tuiles, ou tout
 * autre motif repetitif DSFR.
 *
 * Le template utilise des placeholders :
 * - {{champ}}           : valeur echappee (HTML-safe)
 * - {{{champ}}}         : valeur brute (non echappee)
 * - {{champ|defaut}}    : valeur avec fallback si null/undefined
 * - {{champ:number}}    : valeur formatee avec separateur de milliers (ex: 32 073 247)
 * - {{champ.sous.cle}}  : acces aux proprietes imbriquees
 * - {{$index}}          : index de l'element (0-based)
 *
 * @example
 * <dsfr-data-source id="data" url="/api/results" transform="records"></dsfr-data-source>
 * <dsfr-data-display source="data" cols="3" pagination="12">
 *   <template>
 *     <div class="fr-card">
 *       <div class="fr-card__body">
 *         <div class="fr-card__content">
 *           <h3 class="fr-card__title">{{titre}}</h3>
 *           <p class="fr-card__desc">{{description}}</p>
 *         </div>
 *         <div class="fr-card__footer">
 *           <p class="fr-badge fr-badge--sm">{{categorie}}</p>
 *         </div>
 *       </div>
 *     </div>
 *   </template>
 * </dsfr-data-display>
 */
@customElement('dsfr-data-display')
export class DsfrDataDisplay extends SourceSubscriberMixin(LitElement) {
  @property({ type: String })
  source = '';

  /** Nombre de colonnes dans la grille (1-6, defaut 1 = pleine largeur) */
  @property({ type: Number })
  cols = 1;

  /** Nombre d'elements par page (0 = tout afficher) */
  @property({ type: Number })
  pagination = 0;

  /** Message quand aucune donnee */
  @property({ type: String })
  empty = 'Aucun resultat';

  /** Classe CSS de gap pour la grille (defaut: fr-grid-row--gutters) */
  @property({ type: String })
  gap = 'fr-grid-row--gutters';

  /** Champ de donnees a utiliser comme identifiant unique par item. Si vide, utilise l'index */
  @property({ type: String, attribute: 'uid-field' })
  uidField = '';

  /** Synchronise le numero de page dans l'URL (replaceState) */
  @property({ type: Boolean, attribute: 'url-sync' })
  urlSync = false;

  /** Nom du parametre URL pour la page (defaut: "page") */
  @property({ type: String, attribute: 'url-page-param' })
  urlPageParam = 'page';

  @state()
  private _data: Record<string, unknown>[] = [];

  @state()
  private _currentPage = 1;

  /** True quand la source fournit des metadonnees de pagination serveur */
  @state()
  private _serverPagination = false;

  private _serverTotal = 0;
  private _serverPageSize = 0;

  private _templateContent = '';

  private _hashScrollDone = false;
  private _popstateHandler: (() => void) | null = null;

  /** Message annonce par la live region (lecteurs d'ecran) */
  @state()
  private _liveAnnouncement = '';

  // Light DOM pour les styles DSFR
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-display');
    this._captureTemplate();
    if (this.urlSync) {
      this._applyUrlPage();
      this._popstateHandler = () => {
        this._applyUrlPage();
        this.requestUpdate();
      };
      window.addEventListener('popstate', this._popstateHandler);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._popstateHandler) {
      window.removeEventListener('popstate', this._popstateHandler);
      this._popstateHandler = null;
    }
  }

  onSourceData(data: unknown): void {
    this._data = Array.isArray(data) ? data as Record<string, unknown>[] : [];
    this._hashScrollDone = false;

    // Detecter la pagination serveur via les metadonnees
    const meta = this.source ? getDataMeta(this.source) : undefined;
    if (meta && meta.total > 0) {
      this._serverPagination = true;
      this._serverTotal = meta.total;
      this._serverPageSize = meta.pageSize;
      // En mode serveur, la page courante vient de la meta (ne pas reset a 1)
      this._currentPage = meta.page;
    } else {
      this._serverPagination = false;
      this._currentPage = 1;
    }
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (!this._hashScrollDone && this._data.length > 0 && window.location.hash) {
      this._hashScrollDone = true;
      const targetId = window.location.hash.substring(1);
      requestAnimationFrame(() => {
        const el = this.querySelector(`#${CSS.escape(targetId)}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  private _captureTemplate(): void {
    const tpl = this.querySelector('template');
    if (tpl) {
      this._templateContent = tpl.innerHTML;
    }
  }

  /** Remplace les placeholders dans le template pour un item donne */
  private _renderItem(item: Record<string, unknown>, index: number): string {
    if (!this._templateContent) return '';

    let result = this._templateContent;

    // {{{champ}}} - valeur brute (triple braces, non echappee)
    result = result.replace(/\{\{\{([^}]+)\}\}\}/g, (_match, expr: string) => {
      const value = this._resolveExpression(item, expr.trim(), index);
      return value;
    });

    // {{champ}} ou {{champ|defaut}} - valeur echappee
    result = result.replace(/\{\{([^}]+)\}\}/g, (_match, expr: string) => {
      const value = this._resolveExpression(item, expr.trim(), index);
      return escapeHtml(value);
    });

    return result;
  }

  /** Resout une expression : champ, champ:format, champ|defaut, champ:format|defaut, $index, $uid */
  private _resolveExpression(item: Record<string, unknown>, expr: string, index: number): string {
    // Variable speciale : $index
    if (expr === '$index') return String(index);

    // Variable speciale : $uid
    if (expr === '$uid') return this._getItemUid(item, index);

    // Gestion du fallback : champ|valeur_defaut
    let fieldPath = expr;
    let defaultValue = '';
    const pipeIndex = expr.indexOf('|');
    if (pipeIndex !== -1) {
      fieldPath = expr.substring(0, pipeIndex).trim();
      defaultValue = expr.substring(pipeIndex + 1).trim();
    }

    // Gestion du format : champ:format
    let format = '';
    const colonIndex = fieldPath.indexOf(':');
    if (colonIndex !== -1) {
      format = fieldPath.substring(colonIndex + 1).trim();
      fieldPath = fieldPath.substring(0, colonIndex).trim();
    }

    const value = getByPath(item, fieldPath);
    if (value === null || value === undefined) return defaultValue;

    if (format) {
      return this._formatValue(value, format);
    }
    return String(value);
  }

  /** Applique un format a une valeur. Formats supportes : number */
  private _formatValue(value: unknown, format: string): string {
    if (format === 'number') {
      const num = typeof value === 'number' ? value : parseFloat(String(value));
      if (!isNaN(num)) {
        return num.toLocaleString('fr-FR');
      }
    }
    return String(value);
  }

  // --- Pagination ---

  private _getPaginatedData(): Record<string, unknown>[] {
    // En mode serveur, les donnees recues sont deja la bonne page
    if (this._serverPagination) return this._data;
    if (!this.pagination || this.pagination <= 0) return this._data;
    const start = (this._currentPage - 1) * this.pagination;
    return this._data.slice(start, start + this.pagination);
  }

  private _getTotalPages(): number {
    if (this._serverPagination) {
      return Math.ceil(this._serverTotal / this._serverPageSize);
    }
    if (!this.pagination || this.pagination <= 0) return 1;
    return Math.ceil(this._data.length / this.pagination);
  }

  /** Read page number from URL and apply */
  private _applyUrlPage() {
    const params = new URLSearchParams(window.location.search);
    const pageStr = params.get(this.urlPageParam);
    if (pageStr) {
      const page = parseInt(pageStr, 10);
      if (!isNaN(page) && page >= 1) {
        this._currentPage = page;
        // Always send page command if source exists — dsfr-data-query in server-side
        // mode will use it; non-server sources harmlessly ignore it.
        if (this.source) {
          dispatchSourceCommand(this.source, { page });
        }
      }
    }
  }

  /** Sync current page to URL via replaceState */
  private _syncPageUrl() {
    const params = new URLSearchParams(window.location.search);
    if (this._currentPage > 1) {
      params.set(this.urlPageParam, String(this._currentPage));
    } else {
      params.delete(this.urlPageParam);
    }
    const search = params.toString();
    const newUrl = search
      ? `${window.location.pathname}?${search}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, '', newUrl);
  }

  private _announce(message: string) {
    this._liveAnnouncement = '';
    requestAnimationFrame(() => { this._liveAnnouncement = message; });
  }

  private _handlePageChange(page: number) {
    this._currentPage = page;
    const totalPages = this._getTotalPages();
    this._announce(`Page ${page} sur ${totalPages}`);
    // En mode serveur, demander la page a la source
    if (this._serverPagination && this.source) {
      dispatchSourceCommand(this.source, { page });
    }
    if (this.urlSync) this._syncPageUrl();
  }

  // --- Grid ---

  private _getColClass(): string {
    const cols = Math.max(1, Math.min(6, this.cols));
    const colSize = Math.floor(12 / cols);
    return `fr-col-12 fr-col-md-${colSize}`;
  }

  // --- Render ---

  /** Generate the unique ID string for an item */
  _getItemUid(item: Record<string, unknown>, index: number): string {
    if (this.uidField) {
      const val = getByPath(item, this.uidField);
      if (val !== null && val !== undefined && val !== '') {
        return `item-${String(val).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      }
    }
    return `item-${index}`;
  }

  private _renderGrid(items: Record<string, unknown>[]) {
    const colClass = this._getColClass();
    const startIndex = this.pagination > 0
      ? (this._currentPage - 1) * this.pagination
      : 0;

    const itemsHtml = items.map((item, i) => {
      const globalIndex = startIndex + i;
      const rendered = this._renderItem(item, globalIndex);
      const uid = this._getItemUid(item, globalIndex);
      return `<div class="${colClass}" id="${uid}">${rendered}</div>`;
    }).join('');

    const gridHtml = `<div class="fr-grid-row ${this.gap}">${itemsHtml}</div>`;
    return html`<div .innerHTML="${gridHtml}"></div>`;
  }

  private _renderPagination(totalPages: number) {
    if (this.pagination <= 0 || totalPages <= 1) return '';

    const pages: number[] = [];
    for (let i = Math.max(1, this._currentPage - 2); i <= Math.min(totalPages, this._currentPage + 2); i++) {
      pages.push(i);
    }

    return html`
      <nav class="fr-pagination fr-mt-2w" aria-label="${this.getAttribute('aria-label') ? 'Pagination - ' + this.getAttribute('aria-label') : 'Pagination'}">
        <ul class="fr-pagination__list">
          <li>
            <button class="fr-pagination__link fr-pagination__link--first"
              ?disabled="${this._currentPage === 1}"
              @click="${() => this._handlePageChange(1)}"
              aria-label="Premi\u00e8re page" type="button">Premi\u00e8re page</button>
          </li>
          <li>
            <button class="fr-pagination__link fr-pagination__link--prev"
              ?disabled="${this._currentPage === 1}"
              @click="${() => this._handlePageChange(this._currentPage - 1)}"
              aria-label="Page pr\u00e9c\u00e9dente" type="button">Page pr\u00e9c\u00e9dente</button>
          </li>
          ${pages.map(page => html`
            <li>
              <button
                class="fr-pagination__link ${page === this._currentPage ? 'fr-pagination__link--active' : ''}"
                @click="${() => this._handlePageChange(page)}"
                aria-current="${page === this._currentPage ? 'page' : nothing}"
                aria-label="Page ${page} sur ${totalPages}"
                type="button"
              >${page}</button>
            </li>
          `)}
          <li>
            <button class="fr-pagination__link fr-pagination__link--next"
              ?disabled="${this._currentPage === totalPages}"
              @click="${() => this._handlePageChange(this._currentPage + 1)}"
              aria-label="Page suivante" type="button">Page suivante</button>
          </li>
          <li>
            <button class="fr-pagination__link fr-pagination__link--last"
              ?disabled="${this._currentPage === totalPages}"
              @click="${() => this._handlePageChange(totalPages)}"
              aria-label="Derni\u00e8re page" type="button">Derni\u00e8re page</button>
          </li>
        </ul>
      </nav>
    `;
  }

  render() {
    if (!this._templateContent) {
      this._captureTemplate();
    }

    const paginatedData = this._getPaginatedData();
    const totalPages = this._getTotalPages();
    const totalItems = this._serverPagination ? this._serverTotal : this._data.length;

    return html`
      <div class="dsfr-data-display" role="region" aria-label="${this.getAttribute('aria-label') || 'Liste de resultats'}">
        <div aria-live="polite" aria-atomic="true" class="fr-sr-only">${this._liveAnnouncement}</div>
        ${this._sourceLoading ? html`
          <div class="dsfr-data-display__loading" aria-live="polite" aria-busy="true">
            <span class="fr-icon-loader-4-line" aria-hidden="true"></span>
            Chargement...
          </div>
        ` : this._sourceError ? html`
          <div class="dsfr-data-display__error" aria-live="assertive" role="alert">
            <span class="fr-icon-error-line" aria-hidden="true"></span>
            Erreur de chargement
          </div>
        ` : totalItems === 0 ? html`
          <div class="dsfr-data-display__empty" aria-live="polite" role="status">
            ${this.empty}
          </div>
        ` : html`
          <p class="fr-text--sm fr-mb-1w" aria-live="polite" aria-atomic="true" role="status">
            ${totalItems} resultat${totalItems > 1 ? 's' : ''}
          </p>
          ${this._renderGrid(paginatedData)}
          ${this._renderPagination(totalPages)}
        `}
      </div>

      <style>
        .dsfr-data-display__loading,
        .dsfr-data-display__error {
          display: flex; align-items: center; justify-content: center;
          gap: 0.5rem; padding: 2rem; color: var(--text-mention-grey, #666);
          font-size: 0.875rem;
        }
        .dsfr-data-display__error { color: var(--text-default-error, #ce0500); }
        .dsfr-data-display__empty {
          text-align: center; color: var(--text-mention-grey, #666);
          padding: 2rem; font-size: 0.875rem;
        }
      </style>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-display': DsfrDataDisplay;
  }
}
