import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getByPath, setByPath } from '../utils/json-path.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import {
  dispatchDataLoaded,
  dispatchDataError,
  dispatchDataLoading,
  dispatchSourceCommand,
  clearDataCache,
  clearDataMeta,
  setDataMeta,
  subscribeToSource,
  getDataCache,
  getDataMeta,
  subscribeToSourceCommands
} from '../utils/data-bridge.js';
import type { AdapterCapabilities } from '../adapters/api-adapter.js';

/**
 * Operateurs de filtre supportes
 */
export type FilterOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'notcontains' | 'in' | 'notin'
  | 'isnull' | 'isnotnull';

/**
 * Fonctions d'agregation supportees
 */
export type AggregateFunction = 'count' | 'sum' | 'avg' | 'min' | 'max';

/**
 * Structure d'un filtre
 */
export interface QueryFilter {
  field: string;
  operator: FilterOperator;
  value?: string | number | boolean | (string | number)[];
}

/**
 * Structure d'une agregation
 */
export interface QueryAggregate {
  field: string;
  function: AggregateFunction;
  alias?: string;
}

/**
 * Structure du tri
 */
export interface QuerySort {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * <dsfr-data-query> - Composant de transformation de donnees
 *
 * Transforme, filtre, agrege et trie des donnees provenant d'une source
 * (dsfr-data-source ou dsfr-data-normalize).
 *
 * Ne fait aucun fetch HTTP : les donnees sont recues d'un composant amont
 * (dsfr-data-source ou dsfr-data-normalize) via le data-bridge.
 *
 * **Negotiation server-side** : a l'initialisation, dsfr-data-query interroge les
 * capabilities de l'adapter (via dsfr-data-source.getAdapter()) et delegue
 * automatiquement les operations (group-by, aggregate, order-by) au serveur
 * quand l'adapter le supporte. Si l'adapter ne supporte pas l'operation,
 * ou si dsfr-data-source a deja ses propres attributs, dsfr-data-query fait le
 * traitement client-side en fallback.
 *
 * Si l'adapter signale needsClientProcessing=true (ex: Grist SQL indisponible),
 * dsfr-data-query reprend le traitement client-side meme pour les operations
 * initialement deleguees.
 *
 * @example Server-side automatique (ODS supporte group-by server-side)
 * <dsfr-data-source id="src" api-type="opendatasoft"
 *   base-url="https://data.opendatasoft.com" dataset-id="communes-france">
 * </dsfr-data-source>
 * <dsfr-data-query id="stats" source="src"
 *   group-by="region" aggregate="population:sum:total_pop"
 *   order-by="total_pop:desc" limit="10">
 * </dsfr-data-query>
 *
 * @example Client-side (source generique sans adapter)
 * <dsfr-data-query
 *   id="stats"
 *   source="raw-data"
 *   group-by="region"
 *   aggregate="population:sum, count:count"
 *   order-by="population__sum:desc"
 *   limit="10">
 * </dsfr-data-query>
 */
@customElement('dsfr-data-query')
export class DsfrDataQuery extends LitElement {
  /**
   * ID de la source de donnees (dsfr-data-source ou dsfr-data-normalize)
   */
  @property({ type: String })
  source = '';

  /**
   * Clause WHERE / Filtres
   * - opendatasoft: syntaxe ODSQL "population > 5000 AND status = 'active'"
   * - tabular/generic: "field:operator:value, field2:operator:value2"
   */
  @property({ type: String })
  where = '';

  /**
   * Alias pour where (compatibilite)
   */
  @property({ type: String })
  filter = '';

  /**
   * Champs de regroupement (separes par virgule)
   */
  @property({ type: String, attribute: 'group-by' })
  groupBy = '';

  /**
   * Agregations pour mode generic/tabular
   * Format: "field:function, field2:function"
   * Ex: "population:sum, count:count"
   */
  @property({ type: String })
  aggregate = '';

  /**
   * Tri des resultats
   * Format: "field:direction" ou "field__function:direction"
   * Ex: "total_pop:desc" ou "population__sum:desc"
   */
  @property({ type: String, attribute: 'order-by' })
  orderBy = '';

  /**
   * Limite de resultats
   */
  @property({ type: Number })
  limit = 0;

  /**
   * Chemin vers les donnees dans la reponse API
   */
  @property({ type: String })
  transform = '';

  /**
   * Active le mode server-side pilotable.
   * En mode server-side, la source amont ne fetche qu'UNE page a la fois
   * et ecoute les commandes (page, where, orderBy) des composants en aval.
   */
  @property({ type: Boolean, attribute: 'server-side' })
  serverSide = false;

  /**
   * Taille de page pour le mode server-side (nombre de records par page)
   */
  @property({ type: Number, attribute: 'page-size' })
  pageSize = 20;

  /**
   * Intervalle de rafraichissement en secondes
   */
  @property({ type: Number })
  refresh = 0;

  @state()
  private _loading = false;

  @state()
  private _error: Error | null = null;

  @state()
  private _data: unknown[] = [];

  @state()
  private _rawData: unknown[] = [];

  private _refreshInterval: number | null = null;
  private _unsubscribe: (() => void) | null = null;
  private _unsubscribeCommands: (() => void) | null = null;

  /**
   * Tracks which operations have been delegated to dsfr-data-source server-side.
   * When needsClientProcessing comes back true, we fall back to client-side.
   */
  private _serverDelegated = {
    groupBy: false,
    aggregate: false,
    orderBy: false,
  };

  // Pas de rendu - composant invisible
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  render() {
    return html``;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-query');
    this._initialize();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clear server-side overlays on dsfr-data-source before cleanup
    this._clearServerDelegation();
    this._cleanup();
    if (this.id) {
      clearDataCache(this.id);
      clearDataMeta(this.id);
    }
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    super.willUpdate(changedProperties);

    const queryProps = ['source', 'where', 'filter', 'groupBy', 'aggregate',
                        'orderBy', 'limit', 'transform', 'serverSide', 'pageSize'];

    if (queryProps.some(prop => changedProperties.has(prop))) {
      this._initialize();
    }

    if (changedProperties.has('refresh')) {
      this._setupRefresh();
    }
  }

  private _cleanup() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._unsubscribeCommands) {
      this._unsubscribeCommands();
      this._unsubscribeCommands = null;
    }
  }

  private _setupRefresh() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }

    if (this.refresh > 0) {
      this._refreshInterval = window.setInterval(() => {
        this._initialize();
      }, this.refresh * 1000);
    }
  }

  private _initialize() {
    if (!this.id) {
      console.warn('dsfr-data-query: attribut "id" requis pour identifier la requete');
      return;
    }

    // Unsubscribe from previous source
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._unsubscribeCommands) {
      this._unsubscribeCommands();
      this._unsubscribeCommands = null;
    }

    if (!this.source) {
      console.warn(`dsfr-data-query[${this.id}]: attribut "source" requis`);
      return;
    }

    // Negotiate server-side delegation BEFORE subscribing to data.
    // This sends commands to dsfr-data-source so it re-fetches with the right params.
    this._negotiateServerSide();

    this._subscribeToSourceData(this.source);

    // Forward commands from downstream to upstream source
    this._setupCommandForwarding();
  }

  // --- Server-side negotiation ---

  /**
   * Check upstream adapter capabilities and delegate operations server-side
   * when possible. Sends commands to dsfr-data-source with groupBy/aggregate/orderBy
   * so the adapter handles them in the API request.
   *
   * Falls back to client-side for operations the adapter can't handle,
   * or when dsfr-data-source already has its own groupBy/aggregate attributes.
   */
  private _negotiateServerSide() {
    // Reset delegation state
    this._serverDelegated = { groupBy: false, aggregate: false, orderBy: false };

    const sourceEl = document.getElementById(this.source);
    if (!sourceEl || !('getAdapter' in sourceEl)) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = (sourceEl as any).getAdapter?.();
    if (!adapter?.capabilities) return;

    const caps: AdapterCapabilities = adapter.capabilities;

    // Don't override if dsfr-data-source already has its own groupBy/aggregate
    // (user explicitly configured them on the source — respect that)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceGroupBy = (sourceEl as any).groupBy || '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceAggregate = (sourceEl as any).aggregate || '';

    const cmd: Record<string, string> = {};

    // Delegate group-by + aggregate together (they're coupled).
    // Don't override if source already has its own groupBy or aggregate.
    if (this.groupBy && caps.serverGroupBy && !sourceGroupBy && !sourceAggregate) {
      cmd.groupBy = this.groupBy;
      this._serverDelegated.groupBy = true;

      if (this.aggregate) {
        cmd.aggregate = this.aggregate;
        this._serverDelegated.aggregate = true;
      }
    }

    // Delegate order-by
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceOrderBy = (sourceEl as any).orderBy || '';
    if (this.orderBy && caps.serverOrderBy && !sourceOrderBy) {
      cmd.orderBy = this.orderBy;
      this._serverDelegated.orderBy = true;
    }

    if (Object.keys(cmd).length > 0) {
      dispatchSourceCommand(this.source, cmd);
    }
  }

  /**
   * Clear server-side overlays on dsfr-data-source (disconnect cleanup).
   * Sends empty values so dsfr-data-source reverts to its own attributes.
   */
  private _clearServerDelegation() {
    if (!this.source || !this._hasServerDelegation()) return;

    const cmd: Record<string, string> = {};
    if (this._serverDelegated.groupBy) cmd.groupBy = '';
    if (this._serverDelegated.aggregate) cmd.aggregate = '';
    if (this._serverDelegated.orderBy) cmd.orderBy = '';

    if (Object.keys(cmd).length > 0) {
      dispatchSourceCommand(this.source, cmd);
    }

    this._serverDelegated = { groupBy: false, aggregate: false, orderBy: false };
  }

  /**
   * Returns true if we delegated any operation server-side.
   */
  private _hasServerDelegation(): boolean {
    return this._serverDelegated.groupBy ||
           this._serverDelegated.aggregate ||
           this._serverDelegated.orderBy;
  }

  // --- Source subscription ---

  private _subscribeToSourceData(sourceId: string) {
    // Check cache first (avoids race condition if source already emitted).
    // BUT skip cache if we just sent server-side commands — the cached data
    // is stale (pre-delegation). Wait for fresh data from dsfr-data-source.
    if (!this._hasServerDelegation()) {
      const cachedData = getDataCache(sourceId);
      if (cachedData !== undefined) {
        this._rawData = Array.isArray(cachedData) ? cachedData : [cachedData];
        this._handleSourceData();
      }
    }

    this._unsubscribe = subscribeToSource(sourceId, {
      onLoaded: (data: unknown) => {
        this._rawData = Array.isArray(data) ? data : [data];
        this._handleSourceData();
      },
      onLoading: () => {
        this._loading = true;
        dispatchDataLoading(this.id);
      },
      onError: (error: Error) => {
        this._error = error;
        this._loading = false;
        dispatchDataError(this.id, error);
      }
    });
  }

  /**
   * Handle data received from upstream source.
   */
  private _handleSourceData() {
    try {
      dispatchDataLoading(this.id);
      this._loading = true;
      this._processClientSide();
    } catch (error) {
      this._error = error as Error;
      dispatchDataError(this.id, this._error);
      console.error(`dsfr-data-query[${this.id}]: Erreur de traitement`, error);
    } finally {
      this._loading = false;
    }
  }

  // --- Client-side processing ---

  /**
   * Traitement des donnees : applique client-side uniquement les operations
   * qui n'ont pas ete delegues server-side.
   *
   * Si needsClientProcessing est true dans la meta de la source,
   * ca signifie que l'adapter n'a pas pu traiter server-side (ex: Grist SQL
   * indisponible) — on fait le fallback client-side.
   */
  private _processClientSide() {
    let result = [...this._rawData] as Record<string, unknown>[];

    // Check if the adapter flagged that client processing is needed
    // (server-side delegation failed, e.g. Grist SQL endpoint unavailable)
    const meta = getDataMeta(this.source);
    const forceClientSide = meta?.needsClientProcessing === true;

    // 1. Appliquer les filtres (toujours client-side pour dsfr-data-query)
    const filterExpr = this.filter || this.where;
    if (filterExpr) {
      result = this._applyFilters(result, filterExpr);
    }

    // 2. Appliquer le groupement et les agregations
    // Skip si delegue server-side, SAUF si needsClientProcessing (fallback)
    const needsClientGroupBy = this.groupBy &&
      (!this._serverDelegated.groupBy || forceClientSide);
    if (needsClientGroupBy) {
      result = this._applyGroupByAndAggregate(result);
    }

    // 3. Appliquer le tri
    // Skip si delegue server-side, SAUF si needsClientProcessing (fallback)
    const needsClientSort = this.orderBy &&
      (!this._serverDelegated.orderBy || forceClientSide);
    if (needsClientSort) {
      result = this._applySort(result);
    }

    // 4. Appliquer la limite (toujours client-side)
    if (this.limit > 0) {
      result = result.slice(0, this.limit);
    }

    this._data = result;

    // Forward pagination meta from upstream source so downstream components
    // (dsfr-data-facets, dsfr-data-search, dsfr-data-list) can access it.
    if (meta) {
      setDataMeta(this.id, meta);
    }

    dispatchDataLoaded(this.id, this._data);
  }

  /**
   * Parse et applique les filtres (format: "field:operator:value")
   */
  private _applyFilters(data: Record<string, unknown>[], filterExpr: string): Record<string, unknown>[] {
    const filters = this._parseFilters(filterExpr);

    return data.filter(item => {
      return filters.every(filter => this._matchesFilter(item, filter));
    });
  }

  private _parseFilters(filterExpr: string): QueryFilter[] {
    const filters: QueryFilter[] = [];
    const parts = filterExpr.split(',').map(p => p.trim()).filter(Boolean);

    for (const part of parts) {
      const segments = part.split(':');
      if (segments.length >= 2) {
        const field = segments[0];
        const operator = segments[1] as FilterOperator;
        let value: string | number | boolean | (string | number)[] | undefined;

        if (segments.length > 2) {
          const rawValue = segments.slice(2).join(':');

          // Parse la valeur
          if (operator === 'in' || operator === 'notin') {
            value = rawValue.split('|').map(v => {
              const parsed = this._parseValue(v);
              // Pour in/notin, on ne garde que string/number
              return typeof parsed === 'boolean' ? String(parsed) : parsed;
            }) as (string | number)[];
          } else {
            value = this._parseValue(rawValue);
          }
        }

        filters.push({ field, operator, value });
      }
    }

    return filters;
  }

  private _parseValue(val: string): string | number | boolean {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (!isNaN(Number(val)) && val !== '') return Number(val);
    return val;
  }

  private _matchesFilter(item: Record<string, unknown>, filter: QueryFilter): boolean {
    const value = getByPath(item, filter.field);

    switch (filter.operator) {
      case 'eq':
        // eslint-disable-next-line eqeqeq
        return value == filter.value;
      case 'neq':
        // eslint-disable-next-line eqeqeq
        return value != filter.value;
      case 'gt':
        return Number(value) > Number(filter.value);
      case 'gte':
        return Number(value) >= Number(filter.value);
      case 'lt':
        return Number(value) < Number(filter.value);
      case 'lte':
        return Number(value) <= Number(filter.value);
      case 'contains':
        return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
      case 'notcontains':
        return !String(value).toLowerCase().includes(String(filter.value).toLowerCase());
      case 'in':
        return Array.isArray(filter.value) && filter.value.includes(value as string | number);
      case 'notin':
        return Array.isArray(filter.value) && !filter.value.includes(value as string | number);
      case 'isnull':
        return value === null || value === undefined;
      case 'isnotnull':
        return value !== null && value !== undefined;
      default:
        return true;
    }
  }

  /**
   * Applique le GROUP BY et les agregations
   */
  private _applyGroupByAndAggregate(data: Record<string, unknown>[]): Record<string, unknown>[] {
    const groupFields = this.groupBy.split(',').map(f => f.trim()).filter(Boolean);
    const aggregates = this._parseAggregates(this.aggregate);

    // Creer les groupes
    const groups = new Map<string, Record<string, unknown>[]>();

    for (const item of data) {
      const key = groupFields.map(f => String(getByPath(item, f) ?? '')).join('|||');
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    }

    // Calculer les agregations pour chaque groupe
    const result: Record<string, unknown>[] = [];

    for (const [key, items] of groups) {
      const row: Record<string, unknown> = {};

      // Ajouter les champs de regroupement (structure imbriquee preservee)
      const keyParts = key.split('|||');
      groupFields.forEach((field, i) => {
        setByPath(row, field, keyParts[i]);
      });

      // Calculer les agregations (structure imbriquee preservee)
      for (const agg of aggregates) {
        const fieldName = agg.alias || `${agg.field}__${agg.function}`;
        setByPath(row, fieldName, this._computeAggregate(items, agg));
      }

      result.push(row);
    }

    return result;
  }

  _parseAggregates(aggExpr: string): QueryAggregate[] {
    if (!aggExpr) return [];

    const aggregates: QueryAggregate[] = [];
    const parts = aggExpr.split(',').map(p => p.trim()).filter(Boolean);

    for (const part of parts) {
      // Format: "field:function" ou "field:function:alias"
      const segments = part.split(':');
      if (segments.length >= 2) {
        aggregates.push({
          field: segments[0],
          function: segments[1] as AggregateFunction,
          alias: segments[2]
        });
      }
    }

    return aggregates;
  }

  private _computeAggregate(items: Record<string, unknown>[], agg: QueryAggregate): number {
    const values = items
      .map(item => Number(getByPath(item, agg.field)))
      .filter(v => !isNaN(v));

    switch (agg.function) {
      case 'count':
        return items.length;
      case 'sum':
        return values.reduce((a, b) => a + b, 0);
      case 'avg':
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      case 'min':
        return values.length > 0 ? Math.min(...values) : 0;
      case 'max':
        return values.length > 0 ? Math.max(...values) : 0;
      default:
        return 0;
    }
  }

  /**
   * Applique le tri
   */
  private _applySort(data: Record<string, unknown>[]): Record<string, unknown>[] {
    const sortParts = this.orderBy.split(':');
    if (sortParts.length < 1) return data;

    const field = sortParts[0];
    const direction = (sortParts[1] || 'asc').toLowerCase();

    return [...data].sort((a, b) => {
      const valA = getByPath(a, field);
      const valB = getByPath(b, field);

      // Comparaison numerique si possible
      const numA = Number(valA);
      const numB = Number(valB);

      if (!isNaN(numA) && !isNaN(numB)) {
        return direction === 'desc' ? numB - numA : numA - numB;
      }

      // Comparaison string
      const strA = String(valA ?? '');
      const strB = String(valB ?? '');
      return direction === 'desc'
        ? strB.localeCompare(strA)
        : strA.localeCompare(strB);
    });
  }

  // --- Command forwarding ---

  /**
   * Forward commands from downstream components to the upstream source.
   * Datalist/search/facets send commands (page, where, orderBy) to this query;
   * we forward them to the actual dsfr-data-source so it can re-fetch.
   *
   * Always enabled when there's a source — WHERE commands from server-search
   * and server-facets need to reach dsfr-data-source even when this query
   * doesn't have server-side pagination.
   */
  private _setupCommandForwarding() {
    if (this._unsubscribeCommands) {
      this._unsubscribeCommands();
      this._unsubscribeCommands = null;
    }

    if (!this.id || !this.source) return;

    this._unsubscribeCommands = subscribeToSourceCommands(this.id, (cmd) => {
      dispatchSourceCommand(this.source, cmd);
    });
  }

  // --- Public API ---

  /**
   * Retourne le where effectif complet (statique + dynamique).
   * Delegue a la source amont si disponible.
   */
  getEffectiveWhere(excludeKey?: string): string {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getEffectiveWhere' in sourceEl) {
        return (sourceEl as any).getEffectiveWhere(excludeKey);
      }
    }
    return this.where || this.filter || '';
  }

  /**
   * Retourne l'adapter courant (delegue a la source amont)
   */
  public getAdapter(): any {
    if (this.source) {
      const sourceEl = document.getElementById(this.source);
      if (sourceEl && 'getAdapter' in sourceEl) {
        return (sourceEl as any).getAdapter();
      }
    }
    return null;
  }

  /**
   * Force le rechargement des donnees
   */
  public reload() {
    if (this.source) {
      const cachedData = getDataCache(this.source);
      if (cachedData !== undefined) {
        this._rawData = Array.isArray(cachedData) ? cachedData : [cachedData];
        this._handleSourceData();
      }
    }
  }

  /**
   * Retourne les donnees actuelles
   */
  public getData(): unknown[] {
    return this._data;
  }

  /**
   * Retourne l'etat de chargement
   */
  public isLoading(): boolean {
    return this._loading;
  }

  /**
   * Retourne l'erreur eventuelle
   */
  public getError(): Error | null {
    return this._error;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-query': DsfrDataQuery;
  }
}
