import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { SelectionFilterMixin } from '../utils/selection-filter.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import {
  renderSourceLoading,
  renderSourceError,
  renderSourceIdle,
  IDLE_MESSAGE_DEFAULT,
} from '../utils/status-templates.js';
import { escapeHtml, buildCsv, formatNumberFr } from '@dsfr-data/shared/lib';
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

/** Entrée de la liste de pages : numéro ou ellipse (motif DSFR, #669) */
export type PageItem = number | 'ellipsis';

/**
 * <dsfr-data-list> - Liste filtrable et cherchable
 *
 * Affiche un tableau de données avec recherche, filtres et pagination.
 *
 * Les cellules numériques sont rendues en fr-FR (`2.27` → « 2,27 », au plus
 * 2 décimales ou `decimals`, #666) ; les chaînes (codes INSEE, SIREN…) restent
 * intactes et les exports CSV/HTML restent bruts. Avant #666, le contournement
 * était `normalize round="champ:2"`, qui arrondit mais ne localise pas.
 *
 * Le `caption` du tableau (RGAA 5.4, #669) vient de l'attribut `caption`, à
 * défaut de `aria-label`, sinon « Liste des données ». La pagination suit le
 * motif DSFR : première/dernière page, ellipses, « Page N sur M ».
 *
 * Les alias francais (`colonnes`, `recherche`, `filtres`, `tri`, `server-tri`)
 * restent acceptes pour ne pas casser le code déjà publie, mais sont
 * `@deprecated` depuis #300 : cet exemple montre les attributs COURANTS, pour
 * qui lit le composant. (Le custom-éléments manifest ne capte pas les
 * `@example` de classe : la référence servie a l'assistant IA vient de
 * `apps/builder-ia/src/skills.ts`, corrige separement — #615.)
 *
 * @example
 * <dsfr-data-list
 *   source="sites"
 *   columns="nom:Nom du site, ministere:Ministère, score_rgaa:RGAA"
 *   search
 *   filters="ministere,statut"
 *   sort="score_rgaa:desc"
 *   pagination="10">
 * </dsfr-data-list>
 */
let listInstanceSeq = 0;

/**
 * @fires dsfr-data-select - `{ record, elementId, selected }` sur le tableau (bubbles, composed) — au clic sur une ligne en `refine-on-click` (#734). `selected` vaut `true` à la sélection, `false` quand le clic la retire (second clic sur la même ligne, ou croix du tag de contexte).
 * @fires dsfr-data-source-command - `{ sourceId, where, whereKey, origin }` sur `document` — en `refine-on-click` SANS `context` (chemin dégradé) : clause `eq` poussée directement à `source` sous le whereKey `list-select-ID`. Avec `context`, c'est le contexte qui diffuse.
 */
@customElement('dsfr-data-list')
export class DsfrDataList extends SelectionFilterMixin(SourceSubscriberMixin(LitElement)) {
  /** Prefixe d'ids DOM unique par instance (#304 — ids dupliques entre listes) */
  private readonly _uid = `dsfr-list-${++listInstanceSeq}`;
  /** Id de la source (ou du transformateur) dont ce tableau consomme les données. */
  @property({ type: String })
  source = '';

  /**
   * Définition des colonnes : `"clé:Label, cle2:Label2"`. Omis : toutes les clés
   * présentes dans les données deviennent colonnes, dans leur ordre d'apparition,
   * libellé = clé — le tableau suit un schéma dynamique (aval d'un `dsfr-data-pivot`, #255).
   */
  @property({ type: String })
  columns = '';

  /**
   * Complète `columns` avec les clés des données qui n'y figurent pas (ordre
   * d'apparition, libellé = clé) : les premières colonnes sont libellées et
   * figées, les suivantes suivent les données (#640).
   */
  @property({ type: Boolean, attribute: 'columns-auto' })
  columnsAuto = false;

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

  /**
   * Titre du tableau, rendu dans `caption` (masqué visuellement, lu par les
   * lecteurs d'écran — RGAA 5.4, #669). À défaut, dérivé de `aria-label`.
   */
  @property({ type: String })
  caption = '';

  /**
   * Nombre de décimales des cellules numériques (#666). Absent : au plus
   * 2 décimales, format fr-FR. Les exports CSV/HTML ne sont pas concernés.
   */
  @property({ type: Number })
  decimals: number | null = null;

  /** Formats d'export disponibles: "csv", "html" (separables par virgule) */
  @property({ type: String })
  export = '';

  /** Synchronise le numéro de page dans l'URL (replaceState) */
  @property({ type: Boolean, attribute: 'url-sync' })
  urlSync = false;

  /** Nom du paramètre URL pour la page (défaut: "page") */
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

  /**
   * Message rendu quand l'amont attend un filtre (`require-where`, #690).
   * Distinct de « aucune donnée » : aucune requête n'a été faite. Vide,
   * le libellé par défaut est utilisé.
   */
  @property({ type: String, attribute: 'idle-message' })
  idleMessage = IDLE_MESSAGE_DEFAULT;

  // --- Sélection au clic (#734, ADR-104 — mixin partagé avec la carte) ---

  /**
   * Champ dont la valeur de la ligne cliquée devient un filtre `eq` (#734).
   * Premier clic = filtre, second clic sur la même ligne = retrait, clic sur
   * une autre ligne = remplacement. Une colonne de sélection est ajoutée en
   * tête du tableau : un bouton par ligne, atteignable au clavier, dont
   * l'état est annoncé (`aria-pressed`) — la couleur de la ligne
   * sélectionnée n'est jamais la seule marque. Avec `context="id"`
   * (recommandé), le tableau s'enregistre comme filtre du dsfr-data-context :
   * diffusion à toutes ses sources cibles au dialecte de chacune, tag dans
   * dsfr-data-context-tags, URL portée par le contexte. Sans `context`, la
   * clause part directement à `source` (whereKey `list-select-ID`) — sans tag
   * ni URL, et le tableau se filtre lui-même (seule la ligne cliquée reste,
   * jusqu'au second clic).
   */
  @property({ type: String, attribute: 'refine-on-click' })
  refineOnClick = '';

  /**
   * Identifiant du dsfr-data-context auquel s'enregistrer en
   * `refine-on-click` (#734, ADR-104). Le contexte peut être déclaré après le
   * tableau dans la page. Vide = commande directe à `source` (chemin dégradé).
   */
  @property({ type: String })
  context = '';

  /**
   * Libellé du tag de contexte en `refine-on-click` (#734). Vide = le libellé
   * de la colonne filtrée, à défaut le nom du champ.
   */
  @property({ type: String })
  label = '';

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

  /** Total serveur ; undefined = inconnu (ex. Grist Records hors dernière page) */

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

  // --- Sélection au clic (#734, mixin partagé avec la carte) ---

  /** whereKey du chemin dégradé : `list-select-ID` */
  protected selectionWhereKeyPrefix(): string {
    return 'list-select';
  }

  /** Repli d'identifiant : le préfixe d'ids DOM de l'instance (#304) */
  protected selectionUid(): string {
    return this._uid;
  }

  /** Libellé du tag : `label`, à défaut le libellé de la colonne, à défaut le champ */
  selectionLabel(): string {
    if (this.label) return this.label;
    const field = this.selectionField;
    const column = this.parseColumns().find((col) => col.key === field);
    return column?.label || field;
  }

  /** La sélection a changé : redessiner l'état des lignes et l'annoncer */
  protected onSelectionChange(): void {
    this.requestUpdate();
    const value = this._selectedValue();
    this._announce(value ? `Filtre appliqué : ${value}` : 'Filtre retiré');
  }

  /**
   * Clic n'importe où sur la ligne : même bascule que le bouton de sélection,
   * sans le doubler (le clic du bouton remonte jusqu'ici) ni voler le clic
   * d'un lien ou d'un contrôle rendu dans une cellule.
   */
  private _handleRowClick(event: Event, item: Record<string, unknown>) {
    const target = event.target as Element | null;
    if (target?.closest('a, button, input, select, textarea, label')) return;
    this._onFeatureClick(item);
  }

  // --- Parsing ---

  parseColumns(): ColumnDef[] {
    const columnsExpr = this.columns || this.colonnes;
    const declared: ColumnDef[] = !columnsExpr
      ? []
      : columnsExpr.split(',').map((col) => {
          const [key, label] = col.trim().split(':');
          return { key: key.trim(), label: label?.trim() || key.trim() };
        });
    // Sans `columns`, ou avec `columns-auto` : les clés des données complètent
    // la liste (ordre d'apparition, libellé = clé) — schéma dynamique (#255).
    if (columnsExpr && !this.columnsAuto) return declared;
    const known = new Set(declared.map((c) => c.key));
    for (const key of this._dataKeys()) {
      if (!known.has(key)) {
        known.add(key);
        declared.push({ key, label: key });
      }
    }
    return declared;
  }

  /**
   * Union ordonnée des clés des lignes reçues (les lignes peuvent être
   * hétérogènes). Un pivot amont publie l'ordre voulu dans la meta (#255) :
   * JavaScript énumère les clés entières (`2022`, `2023`) avant les autres,
   * `Object.keys` seul mettrait les années devant la commune.
   */
  private _dataKeys(): string[] {
    const present: string[] = [];
    const presentSet = new Set<string>();
    for (const row of this._data) {
      if (!row || typeof row !== 'object') continue;
      for (const key of Object.keys(row)) {
        if (!presentSet.has(key)) {
          presentSet.add(key);
          present.push(key);
        }
      }
    }
    // L'indice du pivot ne fait qu'ORDONNER des clés réellement présentes : un
    // normalize intermédiaire (rename) peut l'avoir rendu partiellement caduc.
    const pivot = this.source ? getDataMeta(this.source)?.pivot : undefined;
    if (!pivot) return present;
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const key of [...pivot.rowFields, ...pivot.columnNames, ...present]) {
      if (presentSet.has(key) && !seen.has(key)) {
        seen.add(key);
        ordered.push(key);
      }
    }
    return ordered;
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

  /** False en pagination serveur tant que la source n'a pas publié de total (#270) */
  private _isTotalKnown(): boolean {
    return !(this._serverPagination && this._serverTotal === undefined);
  }

  /** « Page 3 sur 115 », ou « Page 3 » quand le total est inconnu */
  private _pagePosition(page: number, totalPages: number): string {
    return this._isTotalKnown() ? `Page ${page} sur ${totalPages}` : `Page ${page}`;
  }

  private _handlePageChange(page: number) {
    this._pager.changePage(page);
    this._announce(this._pagePosition(page, this._getTotalPages()));
  }

  /**
   * Pages à afficher (#669) : première et dernière, fenêtre autour de la
   * courante, ellipse pour chaque trou — « 1 2 3 … 115 », « 1 … 49 50 51 … 115 ».
   * Un trou d'une seule page est comblé par son numéro plutôt qu'une ellipse.
   * Total inconnu (`totalKnown` false) : pas de dernière page ni d'ellipse finale.
   */
  getPageItems(totalPages: number, current: number, totalKnown = true): PageItem[] {
    const wanted = new Set<number>([1]);
    if (totalKnown) wanted.add(totalPages);
    for (let p = current - 1; p <= current + 1; p++) wanted.add(p);
    if (current <= 3) [2, 3].forEach((p) => wanted.add(p));
    if (totalKnown && current >= totalPages - 2) {
      [totalPages - 2, totalPages - 1].forEach((p) => wanted.add(p));
    }
    const pages = [...wanted].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

    const items: PageItem[] = [];
    let prev = 0;
    for (const p of pages) {
      const gap = p - prev;
      if (gap === 2) items.push(p - 1);
      else if (gap > 2) items.push('ellipsis');
      items.push(p);
      prev = p;
    }
    return items;
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

  /**
   * Texte d'une cellule : « — » pour l'absence, Oui/Non pour les booléens,
   * nombres en fr-FR (#666), tout le reste tel quel (jamais de parsing des
   * chaînes : un code INSEE « 75056 » reste « 75056 »).
   */
  formatCellValue(value: unknown): string {
    // Champ multivalué (ODS, Grist) : jonction lisible, comme les templates (#663)
    if (Array.isArray(value)) return value.join(', ');
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
    if (typeof value === 'number') {
      return formatNumberFr(
        value,
        this.decimals === null ? undefined : { decimals: this.decimals }
      );
    }
    return String(value);
  }

  /** Titre du tableau : `caption`, sinon `aria-label`, sinon libellé générique (#669) */
  private _getCaption(): string {
    return this.caption || this.getAttribute('aria-label') || 'Liste des données';
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
    const refine = this.selectionField !== '';
    const colSpan = columns.length + (refine ? 1 : 0);
    return html`
      <div class="fr-table fr-table--bordered">
        <table>
          <caption class="fr-sr-only">
            ${this._getCaption()}
          </caption>
          <thead>
            <tr>
              ${
                refine
                  ? html`<th scope="col" class="dsfr-data-list__select-head">
                      <span class="fr-sr-only">Filtrer</span>
                    </th>`
                  : nothing
              }
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
                      <td colspan="${colSpan}" class="dsfr-data-list__empty" role="status">
                        Aucune donnée à afficher
                      </td>
                    </tr>
                  `
                : paginatedData.map((item) => this._renderRow(columns, item, refine))
            }
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Une ligne du tableau. En `refine-on-click`, elle porte le geste de clic
   * (confort à la souris) et, en tête, une cellule de sélection avec un vrai
   * bouton : c'est lui le chemin clavier et le porteur de l'état annoncé
   * (`aria-pressed`). La ligne sélectionnée porte aussi `aria-current` et une
   * marque visuelle qui ne se réduit pas à une couleur (barre latérale +
   * icône dans le bouton).
   */
  private _renderRow(columns: ColumnDef[], item: Record<string, unknown>, refine: boolean) {
    const selected = refine && this.isSelected(item);
    return html`
      <tr
        class="${selected ? 'dsfr-data-list__row--selected' : ''}"
        aria-current="${selected ? 'true' : nothing}"
        @click="${refine ? (e: Event) => this._handleRowClick(e, item) : nothing}"
      >
        ${refine ? this._renderSelectCell(item, selected) : nothing}
        ${columns.map((col) => html` <td>${this.formatCellValue(item[col.key])}</td> `)}
      </tr>
    `;
  }

  /** Cellule de sélection : un bouton par ligne, atteignable au clavier (#734) */
  private _renderSelectCell(item: Record<string, unknown>, selected: boolean) {
    const value = this.selectionValueOf(item);
    const action = selected ? `Retirer le filtre ${value}` : `Filtrer sur ${value}`;
    return html`
      <td class="dsfr-data-list__select-cell">
        <button
          type="button"
          class="dsfr-data-list__select-btn"
          aria-pressed="${selected ? 'true' : 'false'}"
          title="${action}"
          @click="${() => this._onFeatureClick(item)}"
        >
          <span
            class="${selected ? 'fr-icon-check-line' : 'fr-icon-filter-line'} fr-icon--sm"
            aria-hidden="true"
          ></span>
          <span class="fr-sr-only">${action}</span>
        </button>
      </td>
    `;
  }

  private _renderPagination(totalPages: number) {
    // En mode serveur la pagination s'affiche meme sans attribut
    // `pagination` redonde avec le page-size de la source (#304)
    if (!this._serverPagination && (this.pagination <= 0 || totalPages <= 1)) return '';
    if (this._serverPagination && totalPages <= 1) return '';

    const totalKnown = this._isTotalKnown();
    const current = this._currentPage;
    const items = this.getPageItems(totalPages, current, totalKnown);
    const position = this._pagePosition(current, totalPages);

    return html`
      <nav
        class="fr-pagination"
        role="navigation"
        aria-label="${
          this.getAttribute('aria-label')
            ? 'Pagination - ' + this.getAttribute('aria-label')
            : 'Pagination'
        }"
      >
        <p class="fr-text--sm fr-mb-1w dsfr-data-list__page-position">${position}</p>
        <ul class="fr-pagination__list">
          <li>
            <button
              class="fr-pagination__link fr-pagination__link--first"
              ?disabled="${current === 1}"
              @click="${() => this._handlePageChange(1)}"
              aria-label="Première page"
              type="button"
            >
              Première page
            </button>
          </li>
          <li>
            <button
              class="fr-pagination__link fr-pagination__link--prev fr-pagination__link--lg-label"
              ?disabled="${current === 1}"
              @click="${() => this._handlePageChange(current - 1)}"
              aria-label="Page précédente"
              type="button"
            >
              Page précédente
            </button>
          </li>
          ${items.map((item) =>
            item === 'ellipsis'
              ? html`
                  <li>
                    <span class="fr-pagination__link dsfr-data-list__ellipsis" aria-hidden="true"
                      >…</span
                    >
                  </li>
                `
              : html`
                  <li>
                    <button
                      class="fr-pagination__link ${
                        item === current ? 'fr-pagination__link--active' : ''
                      }"
                      @click="${() => this._handlePageChange(item)}"
                      aria-current="${item === current ? 'page' : nothing}"
                      aria-label="${this._pagePosition(item, totalPages)}"
                      type="button"
                    >
                      ${item}
                    </button>
                  </li>
                `
          )}
          <li>
            <button
              class="fr-pagination__link fr-pagination__link--next fr-pagination__link--lg-label"
              ?disabled="${current === totalPages}"
              @click="${() => this._handlePageChange(current + 1)}"
              aria-label="Page suivante"
              type="button"
            >
              Page suivante
            </button>
          </li>
          ${
            totalKnown
              ? html`
                  <li>
                    <button
                      class="fr-pagination__link fr-pagination__link--last"
                      ?disabled="${current === totalPages}"
                      @click="${() => this._handlePageChange(totalPages)}"
                      aria-label="Dernière page"
                      type="button"
                    >
                      Dernière page
                    </button>
                  </li>
                `
              : nothing
          }
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
              : this._sourceIdle
                ? renderSourceIdle('dsfr-data-list', this.idleMessage)
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
                    ${this._renderTable(columns, paginatedData)}
                    ${this._renderPagination(totalPages)}
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
        .dsfr-data-list__page-position {
          color: var(--text-mention-grey, #666);
        }
        .dsfr-data-list__ellipsis {
          cursor: default;
        }
        .dsfr-data-list__select-head,
        .dsfr-data-list__select-cell {
          width: 3rem;
          text-align: center;
        }
        .dsfr-data-list__select-btn {
          background: none;
          border: 1px solid var(--border-default-grey, #ddd);
          border-radius: 0.25rem;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
          color: var(--text-action-high-blue-france, #000091);
          font-family: inherit;
        }
        .dsfr-data-list__select-btn[aria-pressed='true'] {
          background-color: var(--background-action-high-blue-france, #000091);
          color: var(--text-inverted-blue-france, #fff);
          border-color: var(--background-action-high-blue-france, #000091);
        }
        .dsfr-data-list__row--selected > td {
          background-color: var(--background-alt-blue-france, #f5f5fe);
          font-weight: 700;
        }
        .dsfr-data-list__row--selected > td:first-child {
          box-shadow: inset 0.25rem 0 0 0 var(--border-active-blue-france, #000091);
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
