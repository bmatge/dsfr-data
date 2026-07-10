import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { renderSourceLoading, renderSourceError } from '../utils/status-templates.js';
import { escapeHtml, buildCsv } from '@dsfr-data/shared/lib';
import { getDataMeta } from '../utils/data-bridge.js';
import { PaginationController } from '../utils/pagination-controller.js';

interface ColumnDef {
  key: string;
  label: string;
}

interface SortState {
  key: string;
  direction: 'asc' | 'desc';
}

/**
 * <dsfr-data-list> - Liste filtrable et cherchable
 *
 * Affiche un tableau de données avec recherche, filtres et pagination.
 *
 * @example
 * <dsfr-data-list
 *   source="sites"
 *   colonnes="nom:Nom du site, ministere:Ministère, score_rgaa:RGAA"
 *   recherche="true"
 *   filtres="ministere,statut"
 *   tri="score_rgaa:desc"
 *   pagination="10">
 * </dsfr-data-list>
 */
let listInstanceSeq = 0;

@customElement('dsfr-data-list')
export class DsfrDataList extends SourceSubscriberMixin(LitElement) {
  /** Prefixe d'ids DOM unique par instance (#304 — ids dupliques entre listes) */
  private readonly _uid = `dsfr-list-${++listInstanceSeq}`;
  @property({ type: String })
  source = '';

  /** Définition des colonnes: "clé:Label, cle2:Label2" */
  @property({ type: String })
  columns = '';

  /** @deprecated alias français de `columns` (#300) */
  @property({ type: String })
  colonnes = '';

  /** Afficher un champ de recherche */
  @property({ type: Boolean })
  search = false;

  /** @deprecated alias français de `search` (#300) */
  @property({ type: Boolean })
  recherche = false;

  /** Colonnes filtrables: "ministere,statut" */
  @property({ type: String })
  filters = '';

  /** @deprecated alias français de `filters` (#300) */
  @property({ type: String })
  filtres = '';

  /** Tri par défaut: "score:desc" */
  @property({ type: String })
  sort = '';

  /** @deprecated alias français de `sort` (#300) */
  @property({ type: String })
  tri = '';

  /** Nombre d'éléments par page (0 = pas de pagination) */
  @property({ type: Number })
  pagination = 0;

  /** Formats d'export disponibles: "csv", "html" (separables par virgule) */
  @property({ type: String })
  export = '';

  /** Synchronise le numero de page dans l'URL (replaceState) */
  @property({ type: Boolean, attribute: 'url-sync' })
  urlSync = false;

  /** Nom du parametre URL pour la page (défaut: "page") */
  @property({ type: String, attribute: 'url-page-param' })
  urlPageParam = 'page';

  /**
   * Active le tri serveur.
   * Au lieu de trier localement, envoie une commande { orderBy } au source upstream
   * (dsfr-data-query server-side) qui re-fetche les données triees.
   */
  @property({ type: Boolean, attribute: 'server-sort' })
  serverSort = false;

  /** @deprecated alias français de `server-sort` (#300) */
  @property({ type: Boolean, attribute: 'server-tri' })
  serverTri = false;

  @state()
  private _data: Record<string, unknown>[] = [];

  @state()
  private _searchQuery = '';

  @state()
  private _activeFilters: Record<string, string> = {};

  @state()
  private _sort: SortState | null = null;

  @state()
  /** Controleur de pagination partage avec dsfr-data-display (#304) */
  private _pager = new PaginationController(this);

  /** True quand la source fournit des metadonnees de pagination serveur */
  @state()

  /** Total serveur ; undefined = inconnu (ex. Grist Records hors derniere page) */

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

  /** Message annonce par la live region (lecteurs d'écran) */
  @state()
  private _liveAnnouncement = '';

  // Light DOM pour les styles DSFR
  createRenderRoot() {
    return this;
  }

  static styles = css``;

  /** Warn-once : attributs français dépréciés (#300, cible = anglais) */
  private _warnDeprecatedFrenchAttrs() {
    const aliases: Array<[string, string]> = [
      ['colonnes', 'columns'],
      ['recherche', 'search'],
      ['filtres', 'filters'],
      ['tri', 'sort'],
      ['server-tri', 'server-sort'],
    ];
    const used = aliases.filter(([fr]) => this.hasAttribute(fr)).map(([fr, en]) => `${fr}→${en}`);
    if (used.length > 0) {
      console.warn(
        `dsfr-data-list: attributs français dépréciés (${used.join(', ')}) — la convention cible est l'anglais, les alias seront retirés à la 1.0 (#300)`
      );
    }
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-list');
    this._warnDeprecatedFrenchAttrs();
    this._initSort();
    this._pager.connect();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._pager.disconnect();
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    super.willUpdate(changedProperties);
    if (changedProperties.has('tri') || changedProperties.has('sort')) {
      this._initSort();
    }
  }

  onSourceReset(): void {
    // Changer de source ne doit pas laisser les lignes precedentes (#284)
    this._data = [];
    this._pager.reset();
  }

  onSourceError(_error: Error): void {
    // In server pagination mode, revert to previous page on fetch failure
    // (e.g., API offset limit exceeded). Keep showing current data.
    this._pager.onError(this._data.length > 0);
  }

  onSourceData(data: unknown): void {
    this._data = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    // Detection serveur via le flag explicite serverSide (#270) ; le
    // controleur preserve une page restauree depuis l'URL (#304)
    this._pager.onData(this.source ? getDataMeta(this.source) : undefined);
  }

  // --- Parsing ---

  parseColumns(): ColumnDef[] {
    const columnsExpr = this.columns || this.colonnes;
    if (!columnsExpr) return [];
    return columnsExpr.split(',').map((col) => {
      const [key, label] = col.trim().split(':');
      return { key: key.trim(), label: label?.trim() || key.trim() };
    });
  }

  private _getFilterableColumns(): string[] {
    const filtersExpr = this.filters || this.filtres;
    if (!filtersExpr) return [];
    return filtersExpr.split(',').map((f) => f.trim());
  }

  private _initSort() {
    const sortExpr = this.sort || this.tri;
    if (sortExpr) {
      const [key, direction] = sortExpr.split(':');
      this._sort = { key, direction: (direction as 'asc' | 'desc') || 'asc' };
    }
  }

  // --- Data processing ---

  private _getUniqueValues(key: string): string[] {
    const values = new Set<string>();
    this._data.forEach((item) => {
      const val = item[key];
      if (val !== undefined && val !== null) {
        values.add(String(val));
      }
    });
    return Array.from(values).sort();
  }

  getFilteredData(): Record<string, unknown>[] {
    let result = [...this._data];

    if (this._searchQuery) {
      const query = this._searchQuery.toLowerCase();
      result = result.filter((item) =>
        Object.values(item).some((val) => String(val).toLowerCase().includes(query))
      );
    }

    Object.entries(this._activeFilters).forEach(([key, value]) => {
      if (value) {
        result = result.filter((item) => String(item[key]) === value);
      }
    });

    // Skip client-side sort in server-tri mode (data comes pre-sorted)
    if (this._sort && !(this.serverSort || this.serverTri)) {
      const { key, direction } = this._sort;
      result.sort((a, b) => {
        const aVal = a[key];
        const bVal = b[key];

        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        const comparison =
          typeof aVal === 'number' && typeof bVal === 'number'
            ? aVal - bVal
            : String(aVal).localeCompare(String(bVal), 'fr');

        return direction === 'desc' ? -comparison : comparison;
      });
    }

    return result;
  }

  private _getPaginatedData(): Record<string, unknown>[] {
    const filtered = this.getFilteredData();
    // En mode serveur, les données recues sont déjà la bonne page
    if (this._serverPagination) return filtered;
    if (!this.pagination || this.pagination <= 0) return filtered;

    const start = (this._currentPage - 1) * this.pagination;
    return filtered.slice(start, start + this.pagination);
  }

  private _getTotalPages(): number {
    if (this._serverPagination) {
      // Total inconnu (ex. Grist Records hors derniere page) : proposer la
      // page suivante tant que la page courante est pleine ; le total exact
      // arrive avec la derniere page (#270)
      if (this._serverTotal === undefined) {
        const pageFull = this._data.length >= this._serverPageSize;
        return pageFull ? this._currentPage + 1 : this._currentPage;
      }
      return Math.max(1, Math.ceil(this._serverTotal / this._serverPageSize));
    }
    if (!this.pagination || this.pagination <= 0) return 1;
    return Math.ceil(this.getFilteredData().length / this.pagination);
  }

  // --- Event handlers ---

  /** Read page number from URL and apply */

  private _handleSearch(e: Event) {
    this._searchQuery = (e.target as HTMLInputElement).value;
    this._pager.resetToFirstPage();
  }

  private _handleFilter(key: string, e: Event) {
    this._activeFilters = { ...this._activeFilters, [key]: (e.target as HTMLSelectElement).value };
    this._pager.resetToFirstPage();
  }

  private _announce(message: string) {
    this._liveAnnouncement = '';
    requestAnimationFrame(() => {
      this._liveAnnouncement = message;
    });
  }

  private _handleSort(key: string) {
    const columns = this.parseColumns();
    const label = columns.find((c) => c.key === key)?.label ?? key;
    if (this._sort?.key === key) {
      this._sort = { key, direction: this._sort.direction === 'asc' ? 'desc' : 'asc' };
    } else {
      this._sort = { key, direction: 'asc' };
    }
    this._announce(
      `Tri par ${label}, ordre ${this._sort.direction === 'asc' ? 'croissant' : 'decroissant'}`
    );

    // In server-tri mode, delegate sorting to the upstream source —
    // retour page 1 dans la MEME commande (#304) : trier en page 5
    // affichait la page 5 du nouveau tri
    if ((this.serverSort || this.serverTri) && this.source) {
      this._pager.notifyServerSort(`${this._sort.key}:${this._sort.direction}`);
    }
  }

  private _handlePageChange(page: number) {
    this._pager.changePage(page);
    this._announce(`Page ${page} sur ${this._getTotalPages()}`);
  }

  // --- Export ---

  private _exportCsv() {
    const columns = this.parseColumns();
    const data = this.getFilteredData();

    if (this._serverPagination) {
      console.warn(
        'dsfr-data-list: export CSV en mode serveur — seule la page courante est exportée'
      );
    }

    const csv = buildCsv(data, { columns });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  private _exportHtml() {
    const columns = this.parseColumns();
    const data = this.getFilteredData();

    const headerCells = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');

    const bodyRows = data
      .map((item) => {
        const cells = columns
          .map((c) => {
            const val = item[c.key];
            const display = val === null || val === undefined ? '' : escapeHtml(String(val));
            return `<td>${display}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('\n');

    const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Export</title>
<style>
table { border-collapse: collapse; width: 100%; font-family: system-ui, sans-serif; }
th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
th { background: #f5f5fe; font-weight: 700; }
tr:nth-child(even) { background: #f6f6f6; }
</style>
</head>
<body>
<table>
<thead><tr>${headerCells}</tr></thead>
<tbody>
${bodyRows}
</tbody>
</table>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Cell formatting ---

  formatCellValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
    return String(value);
  }

  // --- Render sub-templates ---

  private _renderFilters(columns: ColumnDef[], filterableColumns: string[]) {
    if (filterableColumns.length === 0) return '';
    // Options construites sur la page chargee + compteur faux : filtres
    // locaux desactives en pagination serveur (#304)
    if (this._serverPagination) {
      this._warnServerLocalFeatures('le filtre');
      return '';
    }

    return html`
      <div class="dsfr-data-list__filters">
        ${filterableColumns.map((key) => {
          const column = columns.find((c) => c.key === key);
          const label = column?.label || key;
          const values = this._getUniqueValues(key);

          return html`
            <div class="fr-select-group">
              <label class="fr-label" for="filter-${key}">${label}</label>
              <select
                class="fr-select"
                id="filter-${key}"
                @change="${(e: Event) => this._handleFilter(key, e)}"
              >
                <option value="">Tous</option>
                ${values.map(
                  (val) => html`
                    <option value="${val}" ?selected="${this._activeFilters[key] === val}">
                      ${val}
                    </option>
                  `
                )}
              </select>
            </div>
          `;
        })}
      </div>
    `;
  }

  /** Warn-once : recherche/filtres locaux inoperants en pagination serveur (#304) */
  private _serverLocalFeaturesWarned = false;

  private _warnServerLocalFeatures(feature: string) {
    if (this._serverLocalFeaturesWarned) return;
    this._serverLocalFeaturesWarned = true;
    console.warn(
      `dsfr-data-list: ${feature} locale desactivee en pagination serveur — elle n'opererait que ` +
        `sur la page chargee (compteurs faux, options de filtre partielles). Utilisez ` +
        `dsfr-data-search server-search / dsfr-data-facets server-facets en amont (#304)`
    );
  }

  private _renderToolbar() {
    const hasExport = this.export?.includes('csv') || this.export?.includes('html');
    // En pagination serveur, la recherche locale n'opererait que sur la
    // page chargee : desactivee avec warning (#304)
    const wantsSearch = this.search || this.recherche;
    const recherche = wantsSearch && !this._serverPagination;
    if (wantsSearch && this._serverPagination) this._warnServerLocalFeatures('recherche');
    if (!recherche && !hasExport) return '';

    return html`
      <div class="dsfr-data-list__toolbar">
        ${
          recherche
            ? html`
                <div class="fr-search-bar" role="search">
                  <label class="fr-label fr-sr-only" for="${this._uid}-search">Rechercher</label>
                  <input
                    class="fr-input"
                    type="search"
                    id="${this._uid}-search"
                    placeholder="Rechercher..."
                    .value="${this._searchQuery}"
                    @input="${this._handleSearch}"
                  />
                  <button class="fr-btn" title="Rechercher" type="button">
                    <span class="fr-icon-search-line" aria-hidden="true"></span>
                  </button>
                </div>
              `
            : html`<div></div>`
        }

        <div class="dsfr-data-list__export-buttons">
          ${
            this.export?.includes('csv')
              ? html`
                  <button
                    class="fr-btn fr-btn--secondary fr-btn--sm"
                    @click="${this._exportCsv}"
                    type="button"
                  >
                    <span class="fr-icon-download-line fr-icon--sm" aria-hidden="true"></span>
                    Exporter CSV
                  </button>
                `
              : ''
          }
          ${
            this.export?.includes('html')
              ? html`
                  <button
                    class="fr-btn fr-btn--secondary fr-btn--sm"
                    @click="${this._exportHtml}"
                    type="button"
                  >
                    <span class="fr-icon-code-s-slash-line fr-icon--sm" aria-hidden="true"></span>
                    Exporter HTML
                  </button>
                `
              : ''
          }
        </div>
      </div>
    `;
  }

  private _renderTable(columns: ColumnDef[], paginatedData: Record<string, unknown>[]) {
    return html`
      <div class="fr-table fr-table--bordered">
        <table>
          <caption class="fr-sr-only">
            Liste des données
          </caption>
          <thead>
            <tr>
              ${columns.map((col) => {
                const isSorted = this._sort?.key === col.key;
                const sortDir = isSorted ? this._sort!.direction : null;
                const ariaSortValue =
                  sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none';
                const sortLabel = isSorted
                  ? `Trier par ${col.label}, actuellement tri ${sortDir === 'asc' ? 'croissant' : 'decroissant'}`
                  : `Trier par ${col.label}`;
                return html`
                  <th scope="col" aria-sort="${ariaSortValue}">
                    <button
                      class="dsfr-data-list__sort-btn"
                      @click="${() => this._handleSort(col.key)}"
                      aria-label="${sortLabel}"
                      type="button"
                    >
                      ${col.label}
                      ${
                        isSorted
                          ? html` <span aria-hidden="true">${sortDir === 'asc' ? '↑' : '↓'}</span> `
                          : ''
                      }
                    </button>
                  </th>
                `;
              })}
            </tr>
          </thead>
          <tbody>
            ${
              paginatedData.length === 0
                ? html`
                    <tr>
                      <td colspan="${columns.length}" class="dsfr-data-list__empty" role="status">
                        Aucune donnée à afficher
                      </td>
                    </tr>
                  `
                : paginatedData.map(
                    (item) => html`
                      <tr>
                        ${columns.map(
                          (col) => html` <td>${this.formatCellValue(item[col.key])}</td> `
                        )}
                      </tr>
                    `
                  )
            }
          </tbody>
        </table>
      </div>
    `;
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
        class="fr-pagination"
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

  // --- Main render ---

  render() {
    const columns = this.parseColumns();
    const filterableColumns = this._getFilterableColumns();
    const paginatedData = this._getPaginatedData();
    const totalPages = this._getTotalPages();
    const totalFiltered = this._serverPagination
      ? // Total inconnu : afficher au moins le nombre de lignes vues
        (this._serverTotal ?? (this._currentPage - 1) * this._serverPageSize + this._data.length)
      : this.getFilteredData().length;

    return html`
      <div
        class="dsfr-data-list"
        role="region"
        aria-label="${this.getAttribute('aria-label') || 'Liste de données'}"
      >
        ${this._renderFilters(columns, filterableColumns)} ${this._renderToolbar()}

        <div aria-live="polite" aria-atomic="true" class="fr-sr-only">
          ${this._liveAnnouncement}
        </div>
        ${
          this._sourceLoading
            ? renderSourceLoading('dsfr-data-list', 'Chargement des données...')
            : this._sourceError && !(this._serverPagination && this._data.length > 0)
              ? renderSourceError('dsfr-data-list', this._sourceError)
              : html`
                  <p class="fr-text--sm" aria-live="polite" aria-atomic="true" role="status">
                    ${totalFiltered} résultat${totalFiltered > 1 ? 's' : ''}
                    ${
                      !this._serverPagination &&
                      (this._searchQuery || Object.values(this._activeFilters).some((v) => v))
                        ? ' (filtré)'
                        : ''
                    }
                  </p>
                  ${this._renderTable(columns, paginatedData)} ${this._renderPagination(totalPages)}
                `
        }
      </div>

      <style>
        .dsfr-data-list__filters {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .dsfr-data-list__filters .fr-select-group {
          margin-bottom: 0;
        }
        .dsfr-data-list__toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .dsfr-data-list__toolbar .fr-search-bar {
          flex: 1;
          min-width: 200px;
          max-width: 400px;
        }
        @media (max-width: 576px) {
          .dsfr-data-list__filters {
            grid-template-columns: 1fr;
          }
          .dsfr-data-list__toolbar {
            flex-direction: column;
            align-items: stretch;
          }
          .dsfr-data-list__toolbar .fr-search-bar {
            max-width: none;
          }
        }
        .dsfr-data-list__export-buttons {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .dsfr-data-list__sort-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-weight: 700;
          font-size: inherit;
          font-family: inherit;
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        .dsfr-data-list__sort-btn:hover {
          text-decoration: underline;
        }
        .dsfr-data-list__loading,
        .dsfr-data-list__error {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 2rem;
          color: var(--text-mention-grey, #666);
          font-size: 0.875rem;
        }
        .dsfr-data-list__error {
          color: var(--text-default-error, #ce0500);
        }
        .dsfr-data-list__empty {
          text-align: center;
          color: var(--text-mention-grey);
          padding: 2rem !important;
        }
      </style>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-list': DsfrDataList;
  }
}
