import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { SelectionFilterMixin } from '../utils/selection-filter.js';
import { getByPath } from '../utils/json-path.js';
import { escapeHtml } from '@dsfr-data/shared/lib';
import {
  renderTemplate,
  resolveTemplateExpression,
  formatTemplateValue,
} from '../utils/template-expression.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import {
  renderSourceLoading,
  renderSourceError,
  renderSourceIdle,
  IDLE_MESSAGE_DEFAULT,
} from '../utils/status-templates.js';
import { getDataMeta } from '../utils/data-bridge.js';
import { PaginationController } from '../utils/pagination-controller.js';
import {
  parsePerRow,
  spanForPerRow,
  legacyConflictMessage,
  syncLayoutError,
} from '../utils/grid-layout.js';

/**
 * <dsfr-data-display> - Affichage dynamique de données via template HTML
 *
 * Recupere les données d'une source et les injecte dans un template HTML
 * défini par l'utilisateur, en generant autant d'éléments qu'il y a de
 * résultats. Ideal pour créer des listes de cartes, tuiles, ou tout
 * autre motif repetitif DSFR.
 *
 * Le template utilise des placeholders, grammaire `{{chemin[:format[:arg]][|défaut]}}` :
 * - {{champ}}           : valeur échappée (HTML-safe)
 * - {{{champ}}}         : valeur brute (non échappée)
 * - {{champ|défaut}}    : valeur avec fallback si null/undefined
 * - {{champ:number}}    : séparateur de milliers fr-FR (ex: 32 073 247) ; `:number:2` fixe les décimales
 * - {{champ:date}}      : date JJ/MM/AAAA (« — » si invalide) ; `:datetime` ajoute HH:MM
 * - {{tags}}            : un tableau est joint par « , » ; `{{tags:join: / }}` choisit le séparateur
 * - {{lien:url}}        : ne laisse passer que http:, https:, mailto:, tel: et les URL relatives,
 *                         sinon chaîne vide — à utiliser dans tout href
 * - {{champ.sous.clé}}  : accès aux propriétés imbriquées
 * - {{$index}}          : index de l'élément (0-based) ; {{$uid}} : identifiant DOM de l'élément
 * - {{#if champ}}…{{/if}} et {{#unless champ}}…{{/unless}} : blocs conditionnels non imbriqués,
 *                         vrais si la valeur n'est ni null, undefined, « », [] ni false. Le bloc doit
 *                         englober du texte, des éléments complets ou une valeur d'attribut : placé
 *                         entre deux attributs, il est découpé par l'analyse HTML du template
 * L'argument d'un format ne peut pas contenir « | » (il ouvre le défaut).
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
 *           {{#if site_web}}<a class="fr-link" href="{{site_web:url}}">Site web</a>{{/if}}
 *         </div>
 *       </div>
 *     </div>
 *   </template>
 * </dsfr-data-display>
 */
let displayInstanceSeq = 0;

/**
 * @fires dsfr-data-select - `{ record, elementId, selected }` sur le composant (bubbles, composed) — au clic sur un élément en `refine-on-click` (#734). `selected` vaut `true` à la sélection, `false` quand le clic la retire (second clic sur le même élément, ou croix du tag de contexte).
 * @fires dsfr-data-source-command - `{ sourceId, where, whereKey, origin }` sur `document` — en `refine-on-click` SANS `context` (chemin dégradé) : clause `eq` poussée directement à `source` sous le whereKey `display-select-ID`. Avec `context`, c'est le contexte qui diffuse.
 */
@customElement('dsfr-data-display')
export class DsfrDataDisplay extends SelectionFilterMixin(SourceSubscriberMixin(LitElement)) {
  /** Prefixe d'ids DOM unique par instance (#304 — item-N duplique entre displays) */
  private readonly _uid = `dsfr-display-${++displayInstanceSeq}`;
  /** Id de la source (ou du transformateur) dont ce composant consomme les données. */
  @property({ type: String })
  source = '';

  /**
   * Nombre de colonnes dans la grille (1-6, défaut 1 = pleine largeur). Même
   * rôle que `per-row`, qui est préféré : `cols` désigne une LARGEUR sur
   * `dsfr-data-facets` (#790). Toujours accepté, avec le même sens.
   */
  @property({ type: Number })
  cols = 1;

  /**
   * Nombre d'éléments par ligne à partir de 768 px (en dessous : un par
   * ligne) — 1, 2, 3, 4 ou 6, les diviseurs de la grille de 12 colonnes.
   * Remplace `cols`, même sens, sans l'ambiguïté du mot sur les autres
   * composants (#790). Prime sur `cols` s'ils sont posés ensemble.
   */
  @property({ type: String, attribute: 'per-row' })
  perRow = '';

  /** Erreur de colonnage posée par ce composant (#790). */
  private _layoutError: string | null = null;

  /** Nombre d'éléments par page (0 = tout afficher) */
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

  /** Synchronise le numéro de page dans l'URL (replaceState) */
  @property({ type: Boolean, attribute: 'url-sync' })
  urlSync = false;

  /** Nom du paramètre URL pour la page (défaut: "page") */
  @property({ type: String, attribute: 'url-page-param' })
  urlPageParam = 'page';

  /**
   * Message rendu quand l'amont attend un filtre (`require-where`, #690).
   * Distinct de « aucune donnée » : aucune requête n'a été faite. Vide,
   * le libellé par défaut est utilisé.
   */
  @property({ type: String, attribute: 'idle-message' })
  idleMessage = IDLE_MESSAGE_DEFAULT;

  // --- Sélection au clic (#734, ADR-104 — mixin partagé avec la carte) ---

  /**
   * Champ dont la valeur de l'élément cliqué devient un filtre `eq` (#734).
   * Premier clic = filtre, second clic sur le même élément = retrait, clic sur
   * un autre élément = remplacement. Chaque élément reçoit un bouton
   * « Filtrer sur … », atteignable au clavier et dont l'état est annoncé
   * (`aria-pressed`) : la mise en avant de l'élément sélectionné n'est jamais
   * la seule marque. Avec `context="id"` (recommandé), le composant
   * s'enregistre comme filtre du dsfr-data-context : diffusion à toutes ses
   * sources cibles au dialecte de chacune, tag dans dsfr-data-context-tags,
   * URL portée par le contexte. Sans `context`, la clause part directement à
   * `source` (whereKey `display-select-ID`) — sans tag ni URL, et la liste se
   * filtre elle-même (seul l'élément cliqué reste, jusqu'au second clic).
   */
  @property({ type: String, attribute: 'refine-on-click' })
  refineOnClick = '';

  /**
   * Identifiant du dsfr-data-context auquel s'enregistrer en
   * `refine-on-click` (#734, ADR-104). Le contexte peut être déclaré après le
   * composant dans la page. Vide = commande directe à `source` (chemin dégradé).
   */
  @property({ type: String })
  context = '';

  /**
   * Libellé du tag de contexte en `refine-on-click` (#734). Vide = le nom du
   * champ filtré.
   */
  @property({ type: String })
  label = '';

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

  /** Total serveur ; undefined = inconnu (ex. Grist Records hors dernière page) */
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

  // --- Sélection au clic (#734, mixin partagé avec la carte) ---

  /** whereKey du chemin dégradé : `display-select-ID` */
  protected selectionWhereKeyPrefix(): string {
    return 'display-select';
  }

  /** Repli d'identifiant : le préfixe d'ids DOM de l'instance (#304) */
  protected selectionUid(): string {
    return this._uid;
  }

  /** La sélection a changé : redessiner l'état des éléments et l'annoncer */
  protected onSelectionChange(): void {
    this.requestUpdate();
    const value = this._selectedValue();
    this._announce(value ? `Filtre appliqué : ${value}` : 'Filtre retiré');
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('perRow') || changedProperties.has('cols')) this._syncLayoutError();
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

    // Moteur partagé avec dsfr-data-map-popup (#694) : pré-passe des blocs
    // {{#if}}/{{#unless}} sur le texte du template, puis UNE seule passe pour
    // {{{champ}}} (brut) et {{champ}} (échappé). La valeur substituée n'est
    // jamais re-scannée : une donnée qui contient elle-même "{{x}}" est
    // rendue littéralement (pas d'injection de template en cascade).
    return renderTemplate(this._templateContent, item, {
      raw: true,
      vars: this._templateVars(item, index),
      origin: `dsfr-data-display${this.id ? `#${this.id}` : ''}`,
    });
  }

  /** Variables spéciales du template : `$index` et `$uid` */
  private _templateVars(
    item: Record<string, unknown>,
    index: number
  ): Record<string, () => string> {
    return {
      $index: () => String(index),
      $uid: () => this._getItemUid(item, index),
    };
  }

  /** Résout une expression : champ, champ:format[:arg], champ|défaut, $index, $uid (conservé pour compatibilité, comme _formatValue) */
  _resolveExpression(item: Record<string, unknown>, expr: string, index: number): string {
    return resolveTemplateExpression(item, expr, this._templateVars(item, index));
  }

  /** Applique un format a une valeur. Formats supportes : number */
  _formatValue(value: unknown, format: string): string {
    return formatTemplateValue(value, format);
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
    const perRow = parsePerRow(this.perRow, 6).value;
    if (perRow !== null) return `fr-col-12 fr-col-md-${spanForPerRow(perRow)}`;
    const cols = Math.max(1, Math.min(6, this.cols));
    const colSize = Math.floor(12 / cols);
    return `fr-col-12 fr-col-md-${colSize}`;
  }

  /** `per-row` invalide, ou posé avec `cols` (#790). */
  private _syncLayoutError(): void {
    const perRow = parsePerRow(this.perRow, 6);
    const message =
      perRow.error ??
      (perRow.value !== null && this.hasAttribute('cols')
        ? legacyConflictMessage('cols', 'per-row')
        : null);
    this._layoutError = syncLayoutError(this, 'dsfr-data-display', message, this._layoutError);
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
    const refine = this.selectionField !== '';
    // Le rendu passe par une chaîne : le clic est délégué au conteneur et
    // l'élément retrouvé par son index de page (#734)
    this._renderedItems = items;

    const itemsHtml = items
      .map((item, i) => {
        const globalIndex = startIndex + i;
        const rendered = this._renderItem(item, globalIndex);
        const uid = this._getItemUid(item, globalIndex);
        if (!refine) return `<div class="${colClass}" id="${uid}">${rendered}</div>`;
        const selected = this.isSelected(item);
        const classes = `${colClass} dsfr-data-display__item${
          selected ? ' dsfr-data-display__item--selected' : ''
        }`;
        return (
          `<div class="${classes}" id="${uid}" data-dsfr-select="${i}"` +
          `${selected ? ' aria-current="true"' : ''}>${rendered}` +
          this._renderSelectButton(item, i, selected) +
          `</div>`
        );
      })
      .join('');

    const gridHtml = `<div class="fr-grid-row ${this.gap}">${itemsHtml}</div>`;
    return html`<div
      @click="${refine ? this._handleGridClick : nothing}"
      .innerHTML="${gridHtml}"
    ></div>`;
  }

  /**
   * Bouton de sélection d'un élément (#734) : c'est lui le chemin clavier et
   * le porteur de l'état annoncé (`aria-pressed`). Son libellé change avec
   * l'état — la mise en avant de la carte n'est jamais la seule marque.
   */
  private _renderSelectButton(
    item: Record<string, unknown>,
    index: number,
    selected: boolean
  ): string {
    const value = this.selectionValueOf(item);
    const action = selected ? `Retirer le filtre ${value}` : `Filtrer sur ${value}`;
    const icon = selected ? 'fr-icon-check-line' : 'fr-icon-filter-line';
    return (
      `<button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary ${icon} fr-btn--icon-left ` +
      `dsfr-data-display__select-btn" aria-pressed="${selected ? 'true' : 'false'}" ` +
      `data-dsfr-select="${index}">${escapeHtml(action)}</button>`
    );
  }

  /**
   * Clic délégué sur la grille : le bouton de sélection ou n'importe où sur
   * l'élément (confort à la souris), sans voler le clic d'un lien ou d'un
   * contrôle rendu par le template.
   */
  private _handleGridClick = (event: Event) => {
    const target = event.target as Element | null;
    if (!target) return;
    const button = target.closest('button[data-dsfr-select]');
    const holder = button ?? target.closest('[data-dsfr-select]');
    if (!holder) return;
    if (!button && target.closest('a, button, input, select, textarea, label')) return;
    const index = Number(holder.getAttribute('data-dsfr-select'));
    const item = this._renderedItems[index];
    if (item) this._onFeatureClick(item);
  };

  /** Éléments du dernier rendu — l'index délégué y renvoie */
  private _renderedItems: Record<string, unknown>[] = [];

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
        aria-label="${
          this.getAttribute('aria-label')
            ? 'Pagination - ' + this.getAttribute('aria-label')
            : 'Pagination'
        }"
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
                  class="fr-pagination__link ${
                    page === this._currentPage ? 'fr-pagination__link--active' : ''
                  }"
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
        ${
          this._sourceLoading
            ? renderSourceLoading('dsfr-data-display')
            : this._sourceError && !(this._serverPagination && this._data.length > 0)
              ? renderSourceError('dsfr-data-display', this._sourceError)
              : this._sourceIdle
                ? renderSourceIdle('dsfr-data-display', this.idleMessage)
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
                    `
        }
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
        .dsfr-data-display__select-btn {
          margin-top: 0.5rem;
        }
        .dsfr-data-display__item--selected {
          box-shadow: inset 0 0 0 2px var(--border-active-blue-france, #000091);
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
