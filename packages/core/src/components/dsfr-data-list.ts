import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { escapeHtml } from '@dsfr-data/shared';
import { getDataMeta, dispatchSourceCommand } from '../utils/data-bridge.js';

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
@customElement('dsfr-data-list')
export class DsfrDataList extends SourceSubscriberMixin(LitElement) {
  @property({ type: String })
  source = '';

  /** Définition des colonnes: "cle:Label, cle2:Label2" */
  @property({ type: String })
  colonnes = '';

  /** Afficher un champ de recherche */
  @property({ type: Boolean })
  recherche = false;

  /** Colonnes filtrables: "ministere,statut" */
  @property({ type: String })
  filtres = '';

  /** Tri par défaut: "score:desc" */
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

  /** Nom du parametre URL pour la page (defaut: "page") */
  @property({ type: String, attribute: 'url-page-param' })
  urlPageParam = 'page';

  /**
   * Active le tri serveur.
   * Au lieu de trier localement, envoie une commande { orderBy } au source upstream
   * (dsfr-data-query server-side) qui re-fetche les donnees triees.
   */
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
  private _currentPage = 1;

  /** True quand la source fournit des metadonnees de pagination serveur */
  @state()
  private _serverPagination = false;

  private _serverTotal = 0;
  private _serverPageSize = 0;
  private _previousPage = 1;
  private _popstateHandler: (() => void) | null = null;

  /** Message annonce par la live region (lecteurs d'ecran) */
  @state()
  private _liveAnnouncement = '';

  // Light DOM pour les styles DSFR
  createRenderRoot() {
    return this;
  }

  static styles = css``;

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-list');
    this._initSort();
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

  willUpdate(changedProperties: Map<string, unknown>) {
    super.willUpdate(changedProperties);
    if (changedProperties.has('tri')) {
      this._initSort();
    }
  }

  onSourceError(_error: Error): void {
    // In server pagination mode, revert to previous page on fetch failure
    // (e.g., API offset limit exceeded). Keep showing current data.
    if (this._serverPagination && this._data.length > 0) {
      this._currentPage = this._previousPage;
    }
  }

  onSourceData(data: unknown): void {
    this._data = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

    // Detecter la pagination serveur via les metadonnees
    const meta = this.source ? getDataMeta(this.source) : undefined;
    if (meta && meta.total > 0) {
      this._serverPagination = true;
      this._serverTotal = meta.total;
      this._serverPageSize = meta.pageSize;
      this._currentPage = meta.page;
    } else {
      this._serverPagination = false;
      this._currentPage = 1;
    }
  }

  // --- Parsing ---

  parseColumns(): ColumnDef[] {
    if (!this.colonnes) return [];
    return this.colonnes.split(',').map((col) => {
      const [key, label] = col.trim().split(':');
      return { key: key.trim(), label: label?.trim() || key.trim() };
    });
  }

  private _getFilterableColumns(): string[] {
    if (!this.filtres) return [];
    return this.filtres.split(',').map((f) => f.trim());
  }

  private _initSort() {
    if (this.tri) {
      const [key, direction] = this.tri.split(':');
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
    if (this._sort && !this.serverTri) {
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
    // En mode serveur, les donnees recues sont deja la bonne page
    if (this._serverPagination) return filtered;
    if (!this.pagination || this.pagination <= 0) return filtered;

    const start = (this._currentPage - 1) * this.pagination;
    return filtered.slice(start, start + this.pagination);
  }

  private _getTotalPages(): number {
    if (this._serverPagination) {
      return Math.ceil(this._serverTotal / this._serverPageSize);
    }
    if (!this.pagination || this.pagination <= 0) return 1;
    return Math.ceil(this.getFilteredData().length / this.pagination);
  }

  // --- Event handlers ---

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

  private _handleSearch(e: Event) {
    this._searchQuery = (e.target as HTMLInputElement).value;
    this._currentPage = 1;
    if (this.urlSync) this._syncPageUrl();
  }

  private _handleFilter(key: string, e: Event) {
    this._activeFilters = { ...this._activeFilters, [key]: (e.target as HTMLSelectElement).value };
    this._currentPage = 1;
    if (this.urlSync) this._syncPageUrl();
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

    // In server-tri mode, delegate sorting to the upstream source
    if (this.serverTri && this.source) {
      dispatchSourceCommand(this.source, {
        orderBy: `${this._sort.key}:${this._sort.direction}`,
      });
    }
  }

  private _handlePageChange(page: number) {
    this._previousPage = this._currentPage;
    this._currentPage = page;
    const totalPages = this._getTotalPages();
    this._announce(`Page ${page} sur ${totalPages}`);
    // En mode serveur, demander la page a la source
    if (this._serverPagination && this.source) {
      dispatchSourceCommand(this.source, { page });
    }
    if (this.urlSync) this._syncPageUrl();
  }

  // --- Export ---

  private _exportCsv() {
    const columns = this.parseColumns();
    const data = this.getFilteredData();

    const header = columns.map((c) => c.label).join(';');
    const rows = data.map((item) =>
      columns
        .map((c) => {
          const str = String(item[c.key] ?? '');
          return str.includes(';') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(';')
    );

    const csv = [header, ...rows].join('\n');
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

  private _renderToolbar() {
    const hasExport = this.export?.includes('csv') || this.export?.includes('html');
    if (!this.recherche && !hasExport) return '';

    return html`
      <div class="dsfr-data-list__toolbar">
        ${this.recherche
          ? html`
              <div class="fr-search-bar" role="search">
                <label class="fr-label fr-sr-only" for="search-${this.source}">Rechercher</label>
                <input
                  class="fr-input"
                  type="search"
                  id="search-${this.source}"
                  placeholder="Rechercher..."
                  .value="${this._searchQuery}"
                  @input="${this._handleSearch}"
                />
                <button class="fr-btn" title="Rechercher" type="button">
                  <span class="fr-icon-search-line" aria-hidden="true"></span>
                </button>
              </div>
            `
          : html`<div></div>`}

        <div class="dsfr-data-list__export-buttons">
          ${this.export?.includes('csv')
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
            : ''}
          ${this.export?.includes('html')
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
            : ''}
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
                      ${isSorted
                        ? html` <span aria-hidden="true">${sortDir === 'asc' ? '↑' : '↓'}</span> `
                        : ''}
                    </button>
                  </th>
                `;
              })}
            </tr>
          </thead>
          <tbody>
            ${paginatedData.length === 0
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
                )}
          </tbody>
        </table>
      </div>
    `;
  }

  private _renderPagination(totalPages: number) {
    if (this.pagination <= 0 || totalPages <= 1) return '';

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

  // --- Main render ---

  render() {
    const columns = this.parseColumns();
    const filterableColumns = this._getFilterableColumns();
    const paginatedData = this._getPaginatedData();
    const totalPages = this._getTotalPages();
    const totalFiltered = this._serverPagination
      ? this._serverTotal
      : this.getFilteredData().length;

    return html`
      <div
        class="dsfr-data-list"
        role="region"
        aria-label="${this.getAttribute('aria-label') || 'Liste de donnees'}"
      >
        ${this._renderFilters(columns, filterableColumns)} ${this._renderToolbar()}

        <div aria-live="polite" aria-atomic="true" class="fr-sr-only">
          ${this._liveAnnouncement}
        </div>
        ${this._sourceLoading
          ? html`
              <div class="dsfr-data-list__loading" aria-live="polite" aria-busy="true">
                <span class="fr-icon-loader-4-line" aria-hidden="true"></span>
                Chargement des données...
              </div>
            `
          : this._sourceError && !(this._serverPagination && this._data.length > 0)
            ? html`
                <div class="dsfr-data-list__error" aria-live="assertive" role="alert">
                  <span class="fr-icon-error-line" aria-hidden="true"></span>
                  Erreur: ${this._sourceError.message}
                </div>
              `
            : html`
                <p class="fr-text--sm" aria-live="polite" aria-atomic="true" role="status">
                  ${totalFiltered} résultat${totalFiltered > 1 ? 's' : ''}
                  ${!this._serverPagination &&
                  (this._searchQuery || Object.values(this._activeFilters).some((v) => v))
                    ? ' (filtré)'
                    : ''}
                </p>
                ${this._renderTable(columns, paginatedData)} ${this._renderPagination(totalPages)}
              `}
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
