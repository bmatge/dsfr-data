import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { getByPath } from '../utils/json-path.js';
import { escapeHtml } from '@dsfr-data/shared/lib';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { renderSourceLoading, renderSourceError } from '../utils/status-templates.js';
import { getDataMeta } from '../utils/data-bridge.js';
import { PaginationController } from '../utils/pagination-controller.js';

/**
 * <dsfr-data-display> - Affichage dynamique de données via template HTML
 *
 * Recupere les données d'une source et les injecte dans un template HTML
 * défini par l'utilisateur, en generant autant d'elements qu'il y a de
 * resultats. Ideal pour créer des listes de cartes, tuiles, ou tout
 * autre motif repetitif DSFR.
 *
 * Le template utilise des placeholders :
 * - {{champ}}           : valeur echappee (HTML-safe)
 * - {{{champ}}}         : valeur brute (non echappee)
 * - {{champ|défaut}}    : valeur avec fallback si null/undefined
 * - {{champ:number}}    : valeur formatee avec separateur de milliers (ex: 32 073 247)
 * - {{champ.sous.clé}}  : acces aux proprietes imbriquees
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
 *           <p class="fr-badge fr-badge--sm">{{catégorie}}</p>
 *         </div>
 *       </div>
 *     </div>
 *   </template>
 * </dsfr-data-display>
 */
let displayInstanceSeq = 0;

@customElement('dsfr-data-display')
export class DsfrDataDisplay extends SourceSubscriberMixin(LitElement) {
  /** Prefixe d'ids DOM unique par instance (#304 — item-N duplique entre displays) */
  private readonly _uid = `dsfr-display-${++displayInstanceSeq}`;
  @property({ type: String })
  source = '';

  /** Nombre de colonnes dans la grille (1-6, défaut 1 = pleine largeur) */
  @property({ type: Number })
  cols = 1;

  /** Nombre d'elements par page (0 = tout afficher) */
  @property({ type: Number })
  pagination = 0;

  /** Message quand aucune donnee */
  @property({ type: String })
  empty = 'Aucun resultat';

  /** Classe CSS de gap pour la grille (défaut: fr-grid-row--gutters) */
  @property({ type: String })
  gap = 'fr-grid-row--gutters';

  /** Champ de données a utiliser comme identifiant unique par item. Si vide, utilise l'index */
  @property({ type: String, attribute: 'uid-field' })
  uidField = '';

  /** Synchronise le numero de page dans l'URL (replaceState) */
  @property({ type: Boolean, attribute: 'url-sync' })
  urlSync = false;

  /** Nom du parametre URL pour la page (défaut: "page") */
  @property({ type: String, attribute: 'url-page-param' })
  urlPageParam = 'page';

  @state()
  private _data: Record<string, unknown>[] = [];

  @state()
  /** Controleur de pagination partage avec dsfr-data-list (#304) */
  private _pager = new PaginationController(this);

  // Accesseurs de compatibilite (etat porte par le controleur #304)
  private get _currentPage(): number {
    return this._pager.currentPage;
  }
  private set _currentPage(v: number) {
    this._pager.currentPage = v;
  }
  protected get _previousPage(): number {
    return this._pager.previousPage;
  }
  private get _serverPagination(): boolean {
    return this._pager.serverMode;
  }
  private get _serverTotal(): number | undefined {
    return this._pager.serverTotal;
  }
  private get _serverPageSize(): number {
    return this._pager.serverPageSize;
  }

  /** True quand la source fournit des metadonnees de pagination serveur */
  @state()

  /** Total serveur ; undefined = inconnu (ex. Grist Records hors derniere page) */
  private _templateContent = '';

  private _hashScrollDone = false;

  /** Message annonce par la live region (lecteurs d'écran) */
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
    this._pager.connect();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._pager.disconnect();
  }

  onSourceReset(): void {
    // Changer de source ne doit pas laisser les elements precedents (#284)
    this._data = [];
    this._pager.reset();
  }

  onSourceError(_error: Error): void {
    // En pagination serveur, revert a la page precedente sur echec du fetch
    // — meme contrat que dsfr-data-list (#284/#304)
    this._pager.onError(this._data.length > 0);
  }

  onSourceData(data: unknown): void {
    this._data = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    this._hashScrollDone = false;
    // Detection serveur (#270) ; le controleur preserve ?page=N (#304)
    this._pager.onData(this.source ? getDataMeta(this.source) : undefined);
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

    // Une seule passe pour {{{champ}}} (brut) et {{champ}} (echappe) :
    // la valeur substituee n'est jamais re-scannee, donc une donnee qui
    // contient elle-meme "{{x}}" est rendue litteralement (pas d'injection
    // de template en cascade).
    return this._templateContent.replace(
      /\{\{\{([^}]+)\}\}\}|\{\{([^}]+)\}\}/g,
      (_match, rawExpr: string | undefined, escExpr: string | undefined) => {
        if (rawExpr !== undefined) {
          return this._resolveExpression(item, rawExpr.trim(), index);
        }
        return escapeHtml(this._resolveExpression(item, (escExpr as string).trim(), index));
      }
    );
  }

  /** Resout une expression : champ, champ:format, champ|défaut, champ:format|défaut, $index, $uid */
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
    // En mode serveur, les données recues sont déjà la bonne page
    if (this._serverPagination) return this._data;
    if (!this.pagination || this.pagination <= 0) return this._data;
    const start = (this._currentPage - 1) * this.pagination;
    return this._data.slice(start, start + this.pagination);
  }

  private _getTotalPages(): number {
    if (this._serverPagination) {
      return this._pager.totalPages(this._data.length);
    }
    if (!this.pagination || this.pagination <= 0) return 1;
    return Math.ceil(this._data.length / this.pagination);
  }

  private _announce(message: string) {
    this._liveAnnouncement = '';
    requestAnimationFrame(() => {
      this._liveAnnouncement = message;
    });
  }

  private _handlePageChange(page: number) {
    this._pager.changePage(page);
    this._announce(`Page ${page} sur ${this._getTotalPages()}`);
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
        return `${this._uid}-item-${String(val).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      }
    }
    return `${this._uid}-item-${index}`;
  }

  private _renderGrid(items: Record<string, unknown>[]) {
    const colClass = this._getColClass();
    // $index exact dans les deux modes (#304) : en pagination serveur,
    // l'offset se calcule avec la taille de page SERVEUR (pas l'attribut
    // pagination local)
    const startIndex = this._pager.pageOffset();

    const itemsHtml = items
      .map((item, i) => {
        const globalIndex = startIndex + i;
        const rendered = this._renderItem(item, globalIndex);
        const uid = this._getItemUid(item, globalIndex);
        return `<div class="${colClass}" id="${uid}">${rendered}</div>`;
      })
      .join('');

    const gridHtml = `<div class="fr-grid-row ${this.gap}">${itemsHtml}</div>`;
    return html`<div .innerHTML="${gridHtml}"></div>`;
  }

  private _renderPagination(totalPages: number) {
    // En mode serveur la pagination s'affiche meme sans attribut
    // `pagination` redonde avec le page-size de la source (#304)
    if (!this._serverPagination && (this.pagination <= 0 || totalPages <= 1)) return '';
    if (this._serverPagination && totalPages <= 1) return '';

    const pages: number[] = [];
    for (
      let i = Math.max(1, this._currentPage - 2);
      i <= Math.min(totalPages, this._currentPage + 2);
      i++
    ) {
      pages.push(i);
    }

    return html`
      <nav
        class="fr-pagination fr-mt-2w"
        aria-label="${this.getAttribute('aria-label')
          ? 'Pagination - ' + this.getAttribute('aria-label')
          : 'Pagination'}"
      >
        <ul class="fr-pagination__list">
          <li>
            <button
              class="fr-pagination__link fr-pagination__link--first"
              ?disabled="${this._currentPage === 1}"
              @click="${() => this._handlePageChange(1)}"
              aria-label="Première page"
              type="button"
            >
              Première page
            </button>
          </li>
          <li>
            <button
              class="fr-pagination__link fr-pagination__link--prev"
              ?disabled="${this._currentPage === 1}"
              @click="${() => this._handlePageChange(this._currentPage - 1)}"
              aria-label="Page précédente"
              type="button"
            >
              Page précédente
            </button>
          </li>
          ${pages.map(
            (page) => html`
              <li>
                <button
                  class="fr-pagination__link ${page === this._currentPage
                    ? 'fr-pagination__link--active'
                    : ''}"
                  @click="${() => this._handlePageChange(page)}"
                  aria-current="${page === this._currentPage ? 'page' : nothing}"
                  aria-label="Page ${page} sur ${totalPages}"
                  type="button"
                >
                  ${page}
                </button>
              </li>
            `
          )}
          <li>
            <button
              class="fr-pagination__link fr-pagination__link--next"
              ?disabled="${this._currentPage === totalPages}"
              @click="${() => this._handlePageChange(this._currentPage + 1)}"
              aria-label="Page suivante"
              type="button"
            >
              Page suivante
            </button>
          </li>
          <li>
            <button
              class="fr-pagination__link fr-pagination__link--last"
              ?disabled="${this._currentPage === totalPages}"
              @click="${() => this._handlePageChange(totalPages)}"
              aria-label="Dernière page"
              type="button"
            >
              Dernière page
            </button>
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
    const totalItems = this._serverPagination
      ? // Total inconnu : afficher au moins le nombre de lignes vues
        (this._serverTotal ?? (this._currentPage - 1) * this._serverPageSize + this._data.length)
      : this._data.length;

    return html`
      <div
        class="dsfr-data-display"
        role="region"
        aria-label="${this.getAttribute('aria-label') || 'Liste de resultats'}"
      >
        <div aria-live="polite" aria-atomic="true" class="fr-sr-only">
          ${this._liveAnnouncement}
        </div>
        ${this._sourceLoading
          ? renderSourceLoading('dsfr-data-display')
          : this._sourceError && !(this._serverPagination && this._data.length > 0)
            ? renderSourceError('dsfr-data-display', this._sourceError)
            : totalItems === 0
              ? html`
                  <div class="dsfr-data-display__empty" aria-live="polite" role="status">
                    ${this.empty}
                  </div>
                `
              : html`
                  <p
                    class="fr-text--sm fr-mb-1w"
                    aria-live="polite"
                    aria-atomic="true"
                    role="status"
                  >
                    ${totalItems} resultat${totalItems > 1 ? 's' : ''}
                  </p>
                  ${this._renderGrid(paginatedData)} ${this._renderPagination(totalPages)}
                `}
      </div>

      <style>
        .dsfr-data-display__loading,
        .dsfr-data-display__error {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 2rem;
          color: var(--text-mention-grey, #666);
          font-size: 0.875rem;
        }
        .dsfr-data-display__error {
          color: var(--text-default-error, #ce0500);
        }
        .dsfr-data-display__empty {
          text-align: center;
          color: var(--text-mention-grey, #666);
          padding: 2rem;
          font-size: 0.875rem;
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
