import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { escapeHtml } from '@dsfr-data/shared/lib';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { escapeColonValue } from '../utils/where.js';
import { dispatchSourceCommand, getDataMeta } from '../utils/data-bridge.js';
import { TransformerMixin } from '../utils/transformer-mixin.js';
import type { SourceElement } from '../utils/source-element.js';

type SearchOperator = 'contains' | 'starts' | 'words';

/**
 * <dsfr-data-search> - Recherche textuelle
 *
 * Composant visuel intermediaire qui affiche un champ de recherche DSFR et filtre
 * les données avant de les redistribuer aux composants en aval. Se place entre
 * une source/normalize et les facettes/visualisations.
 *
 * Position dans le pipeline :
 * dsfr-data-source -> dsfr-data-normalize -> dsfr-data-search -> dsfr-data-facets -> dsfr-data-display
 *
 * La recherche reduit le jeu de données, les facettes affinent ensuite.
 *
 * @example
 * <dsfr-data-search id="searched" source="clean"
 *   fields="Nom_de_l_entreprise, SIRET"
 *   placeholder="Rechercher une entreprise..."
 *   operator="words" count>
 * </dsfr-data-search>
 */
@customElement('dsfr-data-search')
export class DsfrDataSearch extends TransformerMixin(LitElement) {
  /** ID de la source de données a ecouter */
  @property({ type: String })
  source = '';

  /** Champs sur lesquels rechercher (virgule-separes). Vide = tous les champs */
  @property({ type: String })
  fields = '';

  /** Placeholder du champ de saisie */
  @property({ type: String })
  placeholder = 'Rechercher\u2026';

  /** Label du champ (accessible) */
  @property({ type: String })
  label = 'Rechercher';

  /** Delai en ms avant declenchement du filtre apres la derniere frappe */
  @property({ type: Number })
  debounce = 300;

  /** Nombre minimum de caractères avant declenchement */
  @property({ type: Number, attribute: 'min-length' })
  minLength = 0;

  /** Ajoute un champ _highlight a chaque record avec les termes trouves marques en <mark> */
  @property({ type: Boolean })
  highlight = false;

  /** Mode de recherche : contains, starts, words */
  @property({ type: String })
  operator: SearchOperator = 'contains';

  /** Si true, le label est en sr-only (visuellement masque, accessible) */
  @property({ type: Boolean, attribute: 'sr-label' })
  srLabel = false;

  /** Affiche un compteur de resultats sous le champ */
  @property({ type: Boolean })
  count = false;

  /** Nom du parametre d'URL a lire comme terme de recherche initial. Vide = desactive */
  @property({ type: String, attribute: 'url-search-param' })
  urlSearchParam = '';

  /** Synchronise l'URL quand l'utilisateur tape (replaceState) */
  @property({ type: Boolean, attribute: 'url-sync' })
  urlSync = false;

  /**
   * Active le mode recherche serveur.
   * Au lieu de filtrer localement, envoie une commande { where } au source upstream
   * (dsfr-data-query server-side) qui re-fetche les données avec le filtre search.
   */
  @property({ type: Boolean, attribute: 'server-search' })
  serverSearch = false;

  /**
   * Template pour la recherche serveur.
   * {q} est remplace par le terme de recherche.
   * Si vide et server-search active, lu depuis l'adapter de la source amont.
   * Ex ODS: 'search("{q}")', custom: '{q} IN nom'
   */
  @property({ type: String, attribute: 'search-template' })
  searchTemplate = '';

  @state()
  private _allData: Record<string, unknown>[] = [];

  @state()
  private _filteredData: Record<string, unknown>[] = [];

  @state()
  private _term = '';

  @state()
  private _resultCount = 0;

  /** Message d'erreur de configuration (id/source manquant) — rendu en alerte DSFR */
  @state()
  private _configError: string | null = null;

  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _urlParamApplied = false;

  // --- Public API (delegation to upstream source) ---

  /**
   * Retourne l'adapter de la source amont (delegation transparente).
   * Permet aux composants en aval (dsfr-data-facets) d'acceder a l'adapter
   * sans connaitre la structure du pipeline.
   */
  public getAdapter(): import('../adapters/api-adapter.js').ApiAdapter | null {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getAdapter' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getAdapter();
      }
    }
    return null;
  }

  /**
   * Retourne le where effectif de la source amont (delegation transparente).
   */
  public getEffectiveWhere(excludeKey?: string): string {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getEffectiveWhere' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getEffectiveWhere(excludeKey);
      }
    }
    return '';
  }

  /**
   * Retourne les parametres adapter resolus de la source amont
   * (delegation transparente, headers api-key-ref inclus — #274).
   */
  public getAdapterParams(): import('../adapters/api-adapter.js').AdapterParams | null {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getAdapterParams' in sourceEl) {
        return (sourceEl as unknown as SourceElement).getAdapterParams?.() ?? null;
      }
    }
    return null;
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-search');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  /** Parametres de recherche → re-filtrage local (#281) */
  protected transformerReprocessProps(): string[] {
    return ['fields', 'operator', 'minLength', 'highlight'];
  }

  protected onTransformerReprocess(): void {
    if (this._allData.length > 0) {
      this._applyFilter();
    }
  }

  // --- Public methods ---

  /** Efface le champ et restaure toutes les données */
  clear() {
    this._term = '';
    const input = this.querySelector('input');
    if (input) {
      input.value = '';
      input.focus();
    }
    this._applyFilter();
  }

  /** Declenche une recherche programmatique */
  search(term: string) {
    this._term = term;
    const input = this.querySelector('input');
    if (input) input.value = term;
    this._applyFilter();
  }

  /** Retourne les données actuellement filtrees */
  getData(): Record<string, unknown>[] {
    return this._filteredData;
  }

  /** Remplace le jeu de données source */
  setData(data: Record<string, unknown>[]) {
    this._allData = Array.isArray(data) ? data : [];
    this._applyFilter();
  }

  // --- Private implementation ---

  /** Alias historique de reinitTransformer() — conserve pour les tests */
  _initialize() {
    this.reinitTransformer();
  }

  // --- Hooks TransformerMixin (#280) ---

  protected transformerName(): string {
    return 'dsfr-data-search';
  }

  protected validateTransformerConfig(): string | null {
    if (!this.id) {
      this._configError = 'attribut "id" requis';
      return this._configError;
    }
    if (!this.source) {
      this._configError = 'attribut "source" requis';
      return this._configError;
    }
    this._configError = null;
    return null;
  }

  protected beforeTransformerSubscribe(): void {
    // Read search template from adapter if empty and server-search enabled
    if (this.serverSearch && !this.searchTemplate) {
      const sourceEl = document.getElementById(this.source);
      const adapter = (sourceEl as unknown as SourceElement)?.getAdapter?.();
      if (adapter?.getDefaultSearchTemplate) {
        this.searchTemplate = adapter.getDefaultSearchTemplate() || '';
      }
    }

    // In server-search mode with URL param, read the param and send the
    // command proactively BEFORE data arrives. This lets dsfr-data-source
    // include the search filter in the initial request.
    if (this.serverSearch && this.urlSearchParam && !this._urlParamApplied) {
      this._applyUrlSearchParam();
      this._urlParamApplied = true;
      if (this._term) {
        this._applyServerSearch();
      }
    }
  }

  protected onTransformerData(data: unknown): void {
    this._onData(data);
  }

  /**
   * Meta amont propagee telle quelle en server-search (lignes pre-filtrees
   * par le serveur, total valide). En filtre client le nombre de lignes
   * change : pas de meta (#282).
   */
  protected transformMeta(meta: import('../utils/data-bridge.js').PaginationMeta) {
    return this.serverSearch ? meta : null;
  }

  private _onData(data: unknown) {
    const rows = Array.isArray(data) ? data : [];

    if (this.serverSearch) {
      // Server-search mode: data arrives pre-filtered from the server.
      // Pass it through without local filtering.
      this._allData = rows;
      this._filteredData = rows;

      // Use meta.total if available for count, otherwise use row count
      const meta = getDataMeta(this.source);
      this._resultCount = meta?.total ?? rows.length;

      // Re-emit under our own ID — meta posee AVANT le dispatch par le mixin
      this.emitTransformedData(rows);

      // On first load with URL param, trigger server search
      if (this.urlSearchParam && !this._urlParamApplied) {
        this._applyUrlSearchParam();
        this._urlParamApplied = true;
        if (this._term) {
          this._applyServerSearch();
        }
      }
      return;
    }

    this._allData = rows;
    if (this.urlSearchParam && !this._urlParamApplied) {
      this._applyUrlSearchParam();
      this._urlParamApplied = true;
    }
    this._applyFilter();
  }

  /** Read URL search param and set as initial search term */
  _applyUrlSearchParam() {
    if (!this.urlSearchParam) return;
    const params = new URLSearchParams(window.location.search);
    const value = params.get(this.urlSearchParam);
    if (value) {
      this._term = value;
    }
  }

  _applyFilter() {
    // Server-search mode: delegate to upstream source via command
    if (this.serverSearch && this.source) {
      this._applyServerSearch();
      return;
    }

    const term = this._term;

    if (!term || term.length < this.minLength) {
      this._filteredData = [...this._allData];
    } else {
      const fields = this._getFields();
      const op = this.operator || 'contains';
      const normTerm = this._normalize(term);

      this._filteredData = this._allData.filter((record) =>
        this._matchRecord(record, normTerm, fields, op)
      );
    }

    if (this.highlight && term && term.length >= this.minLength) {
      this._filteredData = this._filteredData.map((r) => this._addHighlight(r, term));
    }

    this._resultCount = this._filteredData.length;
    this._dispatch();
  }

  /**
   * Server-search: envoie une commande { where } au source upstream
   * au lieu de filtrer localement.
   */
  private _applyServerSearch() {
    const term = this._term;
    let where = '';

    if (term && term.length >= this.minLength) {
      // Echappement selon le dialecte du provider (#271) : ODSQL echappe
      // \ et " (valeur entre guillemets), colon percent-encode , : |
      // (caracteres structurels de la clause)
      const format = this.getAdapter()?.capabilities?.whereFormat ?? 'odsql';
      const escaped =
        format === 'colon'
          ? escapeColonValue(term)
          : term.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      where = this.searchTemplate.replace(/\{q\}/g, escaped);
    }

    // Dispatch command to upstream source (dsfr-data-query server-side)
    dispatchSourceCommand(this.source, { where, whereKey: this.id });

    // Sync URL if enabled
    if (this.urlSync && this.urlSearchParam) {
      this._syncUrl();
    }

    // Emit dsfr-data-search-change event
    document.dispatchEvent(
      new CustomEvent('dsfr-data-search-change', {
        bubbles: true,
        composed: true,
        detail: {
          sourceId: this.id,
          term: this._term,
          count: this._resultCount,
        },
      })
    );
  }

  _matchRecord(
    record: Record<string, unknown>,
    normTerm: string,
    fields: string[],
    operator: SearchOperator
  ): boolean {
    const searchFields =
      fields.length > 0 ? fields : Object.keys(record).filter((k) => !k.startsWith('_'));

    switch (operator) {
      case 'starts':
        return searchFields.some((f) => {
          const words = this._normalize(String(record[f] ?? '')).split(/\s+/);
          return words.some((w) => w.startsWith(normTerm));
        });

      case 'words': {
        const queryWords = normTerm.split(/\s+/).filter(Boolean);
        return queryWords.every((qw) =>
          searchFields.some((f) => this._normalize(String(record[f] ?? '')).includes(qw))
        );
      }

      case 'contains':
      default:
        return searchFields.some((f) =>
          this._normalize(String(record[f] ?? '')).includes(normTerm)
        );
    }
  }

  _normalize(str: string): string {
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  _getFields(): string[] {
    if (!this.fields) return [];
    return this.fields
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
  }

  _addHighlight(record: Record<string, unknown>, term: string): Record<string, unknown> {
    const clone = { ...record };
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // `escaped` is already regex-escaped above, so the resulting regex is linear.
    // eslint-disable-next-line security/detect-non-literal-regexp
    const regex = new RegExp('(' + escaped + ')', 'gi'); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
    const fields = this._getFields();
    const searchIn =
      fields.length > 0 ? fields : Object.keys(record).filter((k) => typeof record[k] === 'string');

    const highlights: string[] = [];
    searchIn.forEach((f) => {
      const value = record[f];
      if (typeof value !== 'string') return;
      // split avec groupe capturant : les matchs sont aux indices impairs.
      // Chaque segment est echappe AVANT insertion des <mark> pour que du HTML
      // present dans la donnee source reste inerte (XSS via {{{_highlight}}}).
      const parts = value.split(regex);
      if (parts.length < 2) return; // aucun match dans ce champ : pas de highlight
      highlights.push(
        parts
          .map((seg, i) => (i % 2 === 1 ? `<mark>${escapeHtml(seg)}</mark>` : escapeHtml(seg)))
          .join('')
      );
    });
    clone._highlight = highlights.join(' \u2026 ');
    return clone;
  }

  private _onInput(value: string) {
    this._term = value;
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      this._applyFilter();
    }, this.debounce);
  }

  private _onSubmit() {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this._applyFilter();
  }

  private _dispatch() {
    if (!this.id) return;

    this.emitTransformedData(this._filteredData);

    if (this.urlSync && this.urlSearchParam) {
      this._syncUrl();
    }

    document.dispatchEvent(
      new CustomEvent('dsfr-data-search-change', {
        bubbles: true,
        composed: true,
        detail: {
          sourceId: this.id,
          term: this._term,
          count: this._filteredData.length,
        },
      })
    );
  }

  /** Sync current search term back to URL (replaceState) */
  private _syncUrl() {
    const params = new URLSearchParams(window.location.search);
    if (this._term) {
      params.set(this.urlSearchParam, this._term);
    } else {
      params.delete(this.urlSearchParam);
    }
    const search = params.toString();
    const newUrl = search
      ? `${window.location.pathname}?${search}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, '', newUrl);
  }

  render() {
    if (this._configError) {
      return html`
        <div class="fr-alert fr-alert--warning fr-alert--sm" role="alert">
          <p>
            <strong>&lt;dsfr-data-search&gt;</strong> : ${this._configError}. Le composant ne peut
            pas s'initialiser.
          </p>
        </div>
      `;
    }

    const id = this.id || 'search';
    // fr-sr-only : la classe sr-only n'existe pas en DSFR — l'attribut
    // sr-label etait sans effet (#312)
    const labelClass = this.srLabel ? 'fr-label fr-sr-only' : 'fr-label';

    return html`
      <div
        class="fr-search-bar"
        role="search"
        aria-label="${this.getAttribute('aria-label') || this.label}"
      >
        <label class="${labelClass}" for="dsfr-data-search-${id}">${this.label}</label>
        <input
          class="fr-input"
          type="search"
          id="dsfr-data-search-${id}"
          placeholder="${this.placeholder}"
          autocomplete="off"
          .value="${this._term}"
          @input="${(e: Event) => this._onInput((e.target as HTMLInputElement).value)}"
          @search="${(e: Event) => {
            this._term = (e.target as HTMLInputElement).value;
            this._onSubmit();
          }}"
          @keydown="${(e: KeyboardEvent) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              this._onSubmit();
            }
            if (e.key === 'Escape') {
              this.clear();
            }
          }}"
        />
        <button
          class="fr-btn"
          title="Rechercher"
          type="button"
          @click="${(e: Event) => {
            e.preventDefault();
            this._onSubmit();
          }}"
        >
          Rechercher
        </button>
      </div>
      ${
        this.count
          ? html`
              <p
                class="fr-text--sm fr-mt-1v dsfr-data-search-count"
                aria-live="polite"
                aria-atomic="true"
                role="status"
              >
                ${this._resultCount} resultat${this._resultCount !== 1 ? 's' : ''}
              </p>
            `
          : html`
              <p class="fr-sr-only" aria-live="polite" aria-atomic="true" role="status">
                ${this._resultCount} resultat${this._resultCount !== 1 ? 's' : ''}
              </p>
            `
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-search': DsfrDataSearch;
  }
}
