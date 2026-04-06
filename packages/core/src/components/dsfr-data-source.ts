import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getByPath } from '../utils/json-path.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { getProxiedUrl, buildCorsProxyRequest, isAuthenticated } from '@dsfr-data/shared';
import type { ApiAdapter, AdapterParams, ServerSideOverlay } from '../adapters/api-adapter.js';
import { getAdapter } from '../adapters/adapter-registry.js';
import {
  dispatchDataLoaded,
  dispatchDataError,
  dispatchDataLoading,
  clearDataCache,
  setDataMeta,
  clearDataMeta,
  subscribeToSourceCommands,
} from '../utils/data-bridge.js';

/**
 * <dsfr-data-source> - Connecteur de donnees
 *
 * Composant invisible qui se connecte a une API REST, recupere les donnees,
 * les normalise et les diffuse via des evenements custom.
 *
 * Deux modes de fonctionnement :
 * 1. Mode URL brute (existant) : `url` pointe vers une API REST quelconque
 * 2. Mode adapter (nouveau) : `api-type` active un adapter qui gere URL,
 *    pagination, parsing specifiques au provider.
 *
 * @example Mode URL brute
 * <dsfr-data-source id="sites" url="https://api.example.com/sites"
 *   transform="data.results" refresh="60">
 * </dsfr-data-source>
 *
 * @example Mode adapter
 * <dsfr-data-source id="src" api-type="opendatasoft"
 *   base-url="https://data.iledefrance.fr" dataset-id="elus-regionaux"
 *   select="count(*) as total, region" group-by="region">
 * </dsfr-data-source>
 */
@customElement('dsfr-data-source')
export class DsfrDataSource extends LitElement {
  // --- Mode URL brute (existant) ---

  @property({ type: String })
  url = '';

  @property({ type: String })
  method: 'GET' | 'POST' = 'GET';

  @property({ type: String })
  headers = '';

  @property({ type: String })
  params = '';

  @property({ type: Number })
  refresh = 0;

  @property({ type: String })
  transform = '';

  @property({ type: Boolean })
  paginate = false;

  @property({ type: Number, attribute: 'page-size' })
  pageSize = 20;

  @property({ type: Number, attribute: 'cache-ttl' })
  cacheTtl = 3600;

  /** Force le passage par le proxy CORS generique (pour les APIs externes sans CORS) */
  @property({ type: Boolean, attribute: 'use-proxy' })
  useProxy = false;

  /** Reference vers une cle API declaree dans window.DSFR_DATA_KEYS */
  @property({ type: String, attribute: 'api-key-ref' })
  apiKeyRef = '';

  // --- Mode inline data ---

  /** Donnees JSON inline (pas de fetch) */
  @property({ type: String })
  data = '';

  // --- Mode adapter (nouveau) ---

  /** Type d'API — active le mode adapter si != 'generic' et url est vide */
  @property({ type: String, attribute: 'api-type' })
  apiType = 'generic';

  /** URL de base de l'API (pour ODS, Tabular) */
  @property({ type: String, attribute: 'base-url' })
  baseUrl = '';

  /** ID du dataset (pour ODS) */
  @property({ type: String, attribute: 'dataset-id' })
  datasetId = '';

  /** ID de la ressource (pour Tabular) */
  @property({ type: String })
  resource = '';

  /** Clause WHERE statique */
  @property({ type: String })
  where = '';

  /** Clause SELECT (pour ODS) */
  @property({ type: String })
  select = '';

  /** Group-by (pour les APIs qui le supportent server-side) */
  @property({ type: String, attribute: 'group-by' })
  groupBy = '';

  /** Agregation (pour les APIs qui le supportent server-side) */
  @property({ type: String })
  aggregate = '';

  /** Order-by */
  @property({ type: String, attribute: 'order-by' })
  orderBy = '';

  /** Mode pagination serveur (datalist, tableaux) */
  @property({ type: Boolean, attribute: 'server-side' })
  serverSide = false;

  /** Limite du nombre de resultats */
  @property({ type: Number })
  limit = 0;

  // --- Internal state ---

  @state()
  private _loading = false;

  @state()
  private _error: Error | null = null;

  @state()
  private _data: unknown = null;

  private _currentPage = 1;
  private _refreshInterval: number | null = null;
  private _abortController: AbortController | null = null;
  private _unsubscribeCommands: (() => void) | null = null;

  /** Dynamic WHERE overlays from dsfr-data-facets, dsfr-data-search, etc. */
  private _whereOverlays = new Map<string, string>();
  /** Dynamic orderBy overlay from dsfr-data-list sort */
  private _orderByOverlay = '';
  /** Dynamic groupBy overlay from dsfr-data-query delegation */
  private _groupByOverlay = '';
  /** Dynamic aggregate overlay from dsfr-data-query delegation */
  private _aggregateOverlay = '';

  /** Cached adapter instance */
  private _adapter: ApiAdapter | null = null;

  createRenderRoot() {
    return this;
  }

  render() {
    return html``;
  }

  connectedCallback() {
    super.connectedCallback();
    sendWidgetBeacon('dsfr-data-source', this._isAdapterMode() ? this.apiType : undefined);
    this._setupRefresh();
    this._setupCommandListener();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._cleanup();
    if (this.id) {
      clearDataCache(this.id);
      clearDataMeta(this.id);
    }
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    super.willUpdate(changedProperties);

    // Mode inline data : pas de fetch, dispatch direct
    if (changedProperties.has('data') && this.data) {
      this._dispatchInlineData();
      return;
    }

    // Detect changes that should trigger a re-fetch
    const urlModeChanged =
      changedProperties.has('url') ||
      changedProperties.has('params') ||
      changedProperties.has('transform') ||
      changedProperties.has('apiKeyRef');
    const adapterModeChanged =
      changedProperties.has('apiType') ||
      changedProperties.has('baseUrl') ||
      changedProperties.has('datasetId') ||
      changedProperties.has('resource') ||
      changedProperties.has('where') ||
      changedProperties.has('select') ||
      changedProperties.has('groupBy') ||
      changedProperties.has('aggregate') ||
      changedProperties.has('orderBy') ||
      changedProperties.has('limit');

    if (urlModeChanged || adapterModeChanged) {
      if (
        (this.paginate || this.serverSide) &&
        (changedProperties.has('url') || changedProperties.has('params') || adapterModeChanged)
      ) {
        this._currentPage = 1;
      }
      // Invalidate adapter cache on api-type change
      if (changedProperties.has('apiType')) {
        this._adapter = null;
      }
      this._fetchData();
    }

    if (changedProperties.has('refresh')) {
      this._setupRefresh();
    }

    if (
      changedProperties.has('paginate') ||
      changedProperties.has('pageSize') ||
      changedProperties.has('serverSide') ||
      changedProperties.has('apiType')
    ) {
      this._setupCommandListener();
    }
  }

  // --- Public API ---

  /** Returns the adapter for this source (if in adapter mode) */
  public getAdapter(): ApiAdapter | null {
    if (!this._isAdapterMode()) return null;
    if (!this._adapter) {
      this._adapter = getAdapter(this.apiType);
    }
    return this._adapter;
  }

  /** Returns the effective WHERE clause (static + all dynamic overlays merged) */
  public getEffectiveWhere(excludeKey?: string): string {
    const parts: string[] = [];
    if (this.where) parts.push(this.where);
    for (const [key, value] of this._whereOverlays) {
      if (key !== excludeKey && value) parts.push(value);
    }
    const adapter = this.getAdapter();
    const separator = adapter?.capabilities.whereFormat === 'odsql' ? ' AND ' : ', ';
    return parts.join(separator);
  }

  public reload() {
    this._fetchData();
  }

  public getData(): unknown {
    return this._data;
  }

  public isLoading(): boolean {
    return this._loading;
  }

  public getError(): Error | null {
    return this._error;
  }

  // --- Private methods ---

  private _dispatchInlineData() {
    if (!this.id) {
      console.warn('dsfr-data-source: attribut "id" requis pour identifier la source');
      return;
    }
    try {
      const parsed = JSON.parse(this.data);
      this._data = parsed;
      dispatchDataLoaded(this.id, this._data);
    } catch (e) {
      this._error = new Error('Donnees inline invalides (JSON attendu)');
      dispatchDataError(this.id, this._error);
      console.error(`dsfr-data-source[${this.id}]: JSON invalide dans data`, e);
    }
  }

  private _isAdapterMode(): boolean {
    return (
      this.apiType !== 'generic' || (this.apiType === 'generic' && !this.url && this.baseUrl !== '')
    );
  }

  private _cleanup() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
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
        this._fetchData();
      }, this.refresh * 1000);
    }
  }

  private _setupCommandListener() {
    if (this._unsubscribeCommands) {
      this._unsubscribeCommands();
      this._unsubscribeCommands = null;
    }

    if (!this.id) return;

    const needsListener = this.paginate || this.serverSide || this._isAdapterMode();
    if (!needsListener) return;

    this._unsubscribeCommands = subscribeToSourceCommands(this.id, (cmd) => {
      let needsFetch = false;

      if (cmd.page !== undefined && cmd.page !== this._currentPage) {
        this._currentPage = cmd.page;
        needsFetch = true;
      }

      if (cmd.where !== undefined) {
        const key = cmd.whereKey || '__default';
        if (cmd.where) {
          this._whereOverlays.set(key, cmd.where);
        } else {
          this._whereOverlays.delete(key);
        }
        // Reset to page 1 when filters change
        this._currentPage = 1;
        needsFetch = true;
      }

      if (cmd.orderBy !== undefined && cmd.orderBy !== this._orderByOverlay) {
        this._orderByOverlay = cmd.orderBy;
        needsFetch = true;
      }

      if (cmd.groupBy !== undefined && cmd.groupBy !== this._groupByOverlay) {
        this._groupByOverlay = cmd.groupBy;
        needsFetch = true;
      }

      if (cmd.aggregate !== undefined && cmd.aggregate !== this._aggregateOverlay) {
        this._aggregateOverlay = cmd.aggregate;
        needsFetch = true;
      }

      if (needsFetch) {
        this._fetchData();
      }
    });
  }

  private async _fetchData() {
    if (this._isAdapterMode()) {
      return this._fetchViaAdapter();
    }
    return this._fetchViaUrl();
  }

  // --- URL mode (legacy, unchanged behavior) ---

  private async _fetchViaUrl() {
    if (!this.url) return;

    if (!this.id) {
      console.warn('dsfr-data-source: attribut "id" requis pour identifier la source');
      return;
    }

    if (this._abortController) {
      this._abortController.abort();
    }
    this._abortController = new AbortController();

    this._loading = true;
    this._error = null;
    dispatchDataLoading(this.id);

    try {
      const rawUrl = this._buildUrl();
      let url = getProxiedUrl(rawUrl);
      const options = this._buildFetchOptions();

      // If use-proxy is set and URL was not already proxied by getProxiedUrl(),
      // route through the generic CORS proxy
      if (this.useProxy && url === rawUrl) {
        const proxy = buildCorsProxyRequest(url, options.headers as Record<string, string>);
        url = proxy.url;
        options.headers = proxy.headers;
      }

      const response = await fetch(url, {
        ...options,
        signal: this._abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any;
      try {
        json = await response.json();
      } catch {
        const ct = response.headers?.get?.('content-type') || 'unknown';
        throw new Error(
          `Reponse non-JSON (content-type: ${ct}) — verifiez l'URL ou la configuration du proxy`
        );
      }

      if (this.paginate && json.meta) {
        setDataMeta(this.id, {
          page: json.meta.page ?? this._currentPage,
          pageSize: json.meta.page_size ?? this.pageSize,
          total: json.meta.total ?? 0,
        });
      }

      if (this.transform) {
        this._data = getByPath(json, this.transform);
      } else if (this.paginate && json.data && !this.transform) {
        this._data = json.data;
      } else {
        this._data = json;
      }

      dispatchDataLoaded(this.id, this._data);

      // Cache data server-side in DB mode (fire-and-forget)
      if (this.cacheTtl > 0 && isAuthenticated()) {
        this._putCache(this._data).catch(() => {});
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }

      // Try server cache fallback in DB mode
      if (this.cacheTtl > 0 && isAuthenticated()) {
        const cached = await this._getCache();
        if (cached) {
          this._data = cached;
          dispatchDataLoaded(this.id, this._data);
          this.dispatchEvent(new CustomEvent('cache-fallback', { detail: { sourceId: this.id } }));
          return;
        }
      }

      this._error = error as Error;
      dispatchDataError(this.id, this._error);
      console.error(`dsfr-data-source[${this.id}]: Erreur de chargement`, error);
    } finally {
      this._loading = false;
    }
  }

  // --- Adapter mode (new) ---

  private async _fetchViaAdapter() {
    if (!this.id) {
      console.warn('dsfr-data-source: attribut "id" requis pour identifier la source');
      return;
    }

    const adapter = this.getAdapter();
    if (!adapter) {
      console.warn(
        `dsfr-data-source[${this.id}]: adapter introuvable pour api-type="${this.apiType}"`
      );
      return;
    }

    // Validate params
    const params = this._getAdapterParams();
    const validationError = adapter.validate(params);
    if (validationError) {
      console.warn(`dsfr-data-source[${this.id}]: ${validationError}`);
      return;
    }

    if (this._abortController) {
      this._abortController.abort();
    }
    this._abortController = new AbortController();

    this._loading = true;
    this._error = null;
    dispatchDataLoading(this.id);

    try {
      let result;

      if (this.serverSide) {
        // Server-side pagination: fetch one page at a time
        const overlay: ServerSideOverlay = {
          page: this._currentPage,
          effectiveWhere: this.getEffectiveWhere(),
          orderBy: this._orderByOverlay || this.orderBy,
        };
        result = await adapter.fetchPage(params, overlay, this._abortController.signal);

        // Publish pagination meta
        setDataMeta(this.id, {
          page: this._currentPage,
          pageSize: this.pageSize,
          total: result.totalCount,
          needsClientProcessing: result.needsClientProcessing,
        });
      } else {
        // Fetch all with auto-pagination
        result = await adapter.fetchAll(params, this._abortController.signal);

        // Publish meta with needsClientProcessing flag
        setDataMeta(this.id, {
          page: 1,
          pageSize: 0,
          total: result.totalCount,
          needsClientProcessing: result.needsClientProcessing,
        });
      }

      this._data = result.data;
      dispatchDataLoaded(this.id, this._data);

      // Cache data server-side in DB mode (fire-and-forget)
      if (this.cacheTtl > 0 && isAuthenticated()) {
        this._putCache(this._data).catch(() => {});
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }

      // Try server cache fallback in DB mode
      if (this.cacheTtl > 0 && isAuthenticated()) {
        const cached = await this._getCache();
        if (cached) {
          this._data = cached;
          dispatchDataLoaded(this.id, this._data);
          this.dispatchEvent(new CustomEvent('cache-fallback', { detail: { sourceId: this.id } }));
          return;
        }
      }

      this._error = error as Error;
      dispatchDataError(this.id, this._error);
      console.error(`dsfr-data-source[${this.id}]: Erreur de chargement`, error);
    } finally {
      this._loading = false;
    }
  }

  private _getAdapterParams(): AdapterParams {
    let parsedHeaders: Record<string, string> | undefined;
    if (this.headers) {
      try {
        parsedHeaders = JSON.parse(this.headers);
      } catch {
        /* ignore */
      }
    }

    // api-key-ref takes precedence over explicit Authorization header
    const keyHeaders = this._resolveApiKeyHeaders();
    if (keyHeaders) {
      parsedHeaders = { ...(parsedHeaders || {}), ...keyHeaders };
    }

    return {
      baseUrl: this.baseUrl,
      datasetId: this.datasetId,
      resource: this.resource,
      select: this.select,
      where: this.getEffectiveWhere(),
      filter: '',
      groupBy: this._groupByOverlay || this.groupBy,
      aggregate: this._aggregateOverlay || this.aggregate,
      orderBy: this._orderByOverlay || this.orderBy,
      limit: this.limit,
      transform: this.transform,
      pageSize: this.pageSize,
      headers: parsedHeaders,
    };
  }

  // --- API key registry resolution ---

  private _resolveApiKeyHeaders(): Record<string, string> | null {
    if (!this.apiKeyRef) return null;
    const registry = window.DSFR_DATA_KEYS;
    if (!registry || typeof registry !== 'object') {
      console.warn(
        `dsfr-data-source[${this.id}]: window.DSFR_DATA_KEYS non defini, api-key-ref="${this.apiKeyRef}" ignore`
      );
      return null;
    }
    const value = registry[this.apiKeyRef];
    if (!value || typeof value !== 'string') {
      console.warn(
        `dsfr-data-source[${this.id}]: cle "${this.apiKeyRef}" introuvable dans window.DSFR_DATA_KEYS`
      );
      return null;
    }
    return { Authorization: value };
  }

  // --- URL building (legacy mode) ---

  private _buildUrl(): string {
    const base = window.location.origin !== 'null' ? window.location.origin : undefined;
    const url = new URL(this.url, base);

    if (this.params && this.method === 'GET') {
      try {
        const params = JSON.parse(this.params);
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.set(key, String(value));
        });
      } catch (e) {
        console.warn('dsfr-data-source: params invalides (JSON attendu)', e);
      }
    }

    if (this.paginate) {
      url.searchParams.set('page', String(this._currentPage));
      url.searchParams.set('page_size', String(this.pageSize));
    }

    return url.toString();
  }

  private _buildFetchOptions(): RequestInit {
    const options: RequestInit = {
      method: this.method,
    };

    let headers: Record<string, string> = {};

    if (this.headers) {
      try {
        headers = JSON.parse(this.headers);
      } catch (e) {
        console.warn('dsfr-data-source: headers invalides (JSON attendu)', e);
      }
    }

    // api-key-ref takes precedence over explicit Authorization header
    const keyHeaders = this._resolveApiKeyHeaders();
    if (keyHeaders) {
      headers = { ...headers, ...keyHeaders };
    }

    if (this.method === 'POST' && this.params) {
      headers = { 'Content-Type': 'application/json', ...headers };
      options.body = this.params;
    }

    if (Object.keys(headers).length > 0) {
      options.headers = headers;
    }

    return options;
  }

  // --- Server cache (DB mode) ---

  private async _putCache(data: unknown): Promise<void> {
    const recordCount = Array.isArray(data) ? data.length : 1;
    await fetch(`/api/cache/${encodeURIComponent(this.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ data, recordCount, ttlSeconds: this.cacheTtl }),
    });
  }

  private async _getCache(): Promise<unknown | null> {
    try {
      const res = await fetch(`/api/cache/${encodeURIComponent(this.id)}`, {
        credentials: 'include',
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data ?? null;
    } catch {
      return null;
    }
  }
}

declare global {
  interface Window {
    DSFR_DATA_KEYS?: Record<string, string>;
  }
  interface HTMLElementTagNameMap {
    'dsfr-data-source': DsfrDataSource;
  }
}
