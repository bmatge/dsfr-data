import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getByPath } from '../utils/json-path.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import { getProxiedUrl, buildCorsProxyRequest } from '@dsfr-data/shared/lib';
import type { ApiAdapter, AdapterParams, ServerSideOverlay } from '../adapters/api-adapter.js';
import { getAdapter } from '../adapters/adapter-registry.js';
import { getCacheProvider, cacheKeyFor } from '../utils/cache-provider.js';
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
 * <dsfr-data-source> - Connecteur de données
 *
 * Composant invisible qui se connecte a une API REST, récupéré les données,
 * les normalise et les diffuse via des événements custom.
 *
 * Deux modes de fonctionnement :
 * 1. Mode URL brute (existant) : `url` pointe vers une API REST quelconque
 * 2. Mode adapter (nouveau) : `api-type` active un adapter qui gere URL,
 *    pagination, parsing spécifiques au provider.
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

  /**
   * Domaine du proxy CORS pour CETTE source (#340), prioritaire sur
   * `window.DSFR_DATA_PROXY` et la config build-time. Sert a la fois la
   * reecriture d'hote connu (Grist gouv/SaaS, Tabular, INSEE) et le
   * `use-proxy` generique. Vide = resolution proxy globale habituelle.
   * Ex: `proxy-url="https://mon-proxy.fr"`.
   */
  @property({ type: String, attribute: 'proxy-url' })
  proxyUrl = '';

  /** Reference vers une clé API declaree dans window.DSFR_DATA_KEYS */
  @property({ type: String, attribute: 'api-key-ref' })
  apiKeyRef = '';

  // --- Mode inline data ---

  /** Données JSON inline (pas de fetch) */
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

  /** Agrégation (pour les APIs qui le supportent server-side) */
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

  /**
   * Plafond de records du fetchAll en mode adapter (#233). 0 = plafond par
   * defaut de l'adapter (ODS : 1000). A relever explicitement pour les
   * dashboards « un fetch, N agregations client » — attention au nombre de
   * requetes en boucle et au poids memoire.
   */
  @property({ type: Number, attribute: 'max-records' })
  maxRecords = 0;

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
  private _fetchScheduled = false;
  private _reemitScheduled = false;
  /** Jeton de generation : seul le fetch courant pilote _loading (#288) */
  private _fetchGeneration = 0;
  /** Warn-once : commandes adapter recues en mode URL (#288) */
  private _urlModeCommandWarned = false;

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
      changedProperties.has('apiKeyRef') ||
      changedProperties.has('method') ||
      changedProperties.has('useProxy');
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
    // Attributs communs aux deux modes, historiquement non cables au
    // refetch (#288) — headers a le meme role qu'api-key-ref qui refetchait
    const sharedChanged =
      changedProperties.has('pageSize') ||
      changedProperties.has('serverSide') ||
      changedProperties.has('headers') ||
      changedProperties.has('proxyUrl');

    if (urlModeChanged || adapterModeChanged || sharedChanged) {
      if (
        (this.paginate || this.serverSide) &&
        (changedProperties.has('url') ||
          changedProperties.has('params') ||
          adapterModeChanged ||
          sharedChanged)
      ) {
        this._currentPage = 1;
      }
      // Invalidate adapter cache on api-type change
      if (changedProperties.has('apiType')) {
        this._adapter = null;
      }
      this._scheduleFetch();
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
      reportConfigError(this, 'dsfr-data-source', 'attribut "id" requis pour identifier la source');
      return;
    }
    try {
      const parsed = JSON.parse(this.data);
      this._data = parsed;
      dispatchDataLoaded(this.id, this._data);
    } catch (e) {
      this._error = new Error('Données inline invalides (JSON attendu)');
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

      // Mode URL : les commandes adapter (where/orderBy/groupBy/aggregate)
      // ne sont pas applicables — _buildUrl ne sait pas les serialiser pour
      // une API arbitraire. Les accepter stockait un overlay jamais utilise
      // et refetchait a URL identique : filtre silencieusement perdu (#288).
      // Refus EXPLICITE (warn-once) ; la pagination querystring reste servie.
      const hasAdapterCommand =
        cmd.where !== undefined ||
        cmd.orderBy !== undefined ||
        cmd.groupBy !== undefined ||
        cmd.aggregate !== undefined;
      if (hasAdapterCommand && !this._isAdapterMode()) {
        if (!this._urlModeCommandWarned) {
          this._urlModeCommandWarned = true;
          console.warn(
            `dsfr-data-source[${this.id}]: commandes where/orderBy/groupBy/aggregate ignorees en mode URL — ` +
              `utilisez un api-type (opendatasoft, tabular, grist, insee) pour les filtres serveur (#288)`
          );
        }
        if (needsFetch) {
          this._scheduleFetch();
        } else if (this._data !== null && !this._fetchScheduled && !this._loading) {
          // Le contrat « une commande produit toujours une emission » (#276)
          // tient aussi pour une commande refusee : l'emetteur attend une
          // reponse, le cache courant EST la reponse (rien n'a change)
          this._scheduleReemit();
        }
        return;
      }

      if (cmd.where !== undefined) {
        const key = cmd.whereKey || '__default';
        const previous = this._whereOverlays.get(key);
        // Dedup : une commande where identique ne refetche pas (#275) —
        // les re-negociations de dsfr-data-query renvoient le meme where
        if (cmd.where && cmd.where !== previous) {
          this._whereOverlays.set(key, cmd.where);
          // Reset to page 1 when filters change
          this._currentPage = 1;
          needsFetch = true;
        } else if (!cmd.where && previous !== undefined) {
          this._whereOverlays.delete(key);
          this._currentPage = 1;
          needsFetch = true;
        }
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
        this._scheduleFetch();
      } else if (this._data !== null && !this._fetchScheduled && !this._loading) {
        // Commande entierement dedupliquee : re-emettre le cache pour qu'un
        // transformateur qui attend une emission post-commande ne gele pas
        // (#276). Contrat : une commande produit TOUJOURS une emission.
        // Async (macrotask) pour laisser l'appelant s'abonner apres sa
        // commande ; coalesce si plusieurs commandes no-op arrivent.
        this._scheduleReemit();
      }
    });
  }

  /** Re-emission asynchrone du cache (commande no-op, #276) */
  private _scheduleReemit() {
    if (this._reemitScheduled) return;
    this._reemitScheduled = true;
    setTimeout(() => {
      this._reemitScheduled = false;
      // Un fetch a pu etre demande entre-temps : son emission suffira
      if (!this._fetchScheduled && !this._loading && this._data !== null) {
        dispatchDataLoaded(this.id, this._data);
      }
    }, 0);
  }

  private async _fetchData() {
    if (this._isAdapterMode()) {
      return this._fetchViaAdapter();
    }
    return this._fetchViaUrl();
  }

  /**
   * Coalesce fetches: defer to the next macrotask so concurrent willUpdates
   * (from queries delegating server-side ops to this source) get to register
   * their overlays before the first fetch runs. Without this, 3 queries on
   * the same Grist source each trigger a command → 3 refetches, the first 2
   * aborted (visible as NS_BINDING_ABORTED in Firefox).
   */
  private _scheduleFetch() {
    if (this._fetchScheduled) return;
    this._fetchScheduled = true;
    setTimeout(() => {
      this._fetchScheduled = false;
      this._fetchData();
    }, 0);
  }

  // --- URL mode (legacy, unchanged behavior) ---

  private async _fetchViaUrl() {
    if (!this.url) return;

    if (!this.id) {
      reportConfigError(this, 'dsfr-data-source', 'attribut "id" requis pour identifier la source');
      return;
    }

    if (this._abortController) {
      this._abortController.abort();
    }
    this._abortController = new AbortController();
    const generation = ++this._fetchGeneration;

    this._loading = true;
    this._error = null;
    dispatchDataLoading(this.id);

    try {
      const rawUrl = this._buildUrl();
      let url = getProxiedUrl(rawUrl, this.proxyUrl);
      const options = this._buildFetchOptions();

      // If use-proxy is set and URL was not already proxied by getProxiedUrl(),
      // route through the generic CORS proxy
      if (this.useProxy && url === rawUrl) {
        const proxy = buildCorsProxyRequest(
          url,
          options.headers as Record<string, string>,
          this.proxyUrl
        );
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
          `Reponse non-JSON (content-type: ${ct}) — vérifiez l'URL ou la configuration du proxy`
        );
      }

      if (this.paginate && json.meta) {
        setDataMeta(this.id, {
          page: json.meta.page ?? this._currentPage,
          pageSize: json.meta.page_size ?? this.pageSize,
          total: json.meta.total ?? 0,
          serverSide: true,
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

      // Cache externe via hook (fire-and-forget, #307)
      if (this.cacheTtl > 0 && getCacheProvider()) {
        this._putCache(this._data).catch(() => {});
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }

      // Fallback offline via le hook de cache (#307)
      if (this.cacheTtl > 0 && getCacheProvider()) {
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
      // Un fetch remplace (abort concurrent) ne doit pas eteindre le
      // loading du fetch courant (#288)
      if (generation === this._fetchGeneration) {
        this._loading = false;
      }
    }
  }

  // --- Adapter mode (new) ---

  private async _fetchViaAdapter() {
    if (!this.id) {
      reportConfigError(this, 'dsfr-data-source', 'attribut "id" requis pour identifier la source');
      return;
    }

    const adapter = this.getAdapter();
    if (!adapter) {
      // api-type inconnu (#283) : signal DOM + erreur aval — l'ancien throw
      // du registre remontait hors try via setTimeout (unhandled rejection,
      // consommateurs geles en loading)
      const message = `api-type "${this.apiType}" inconnu — types supportes : generic, opendatasoft, tabular, grist, insee (ou registerAdapter)`;
      reportConfigError(this, `dsfr-data-source[${this.id}]`, message);
      this._error = new Error(message);
      dispatchDataError(this.id, this._error);
      return;
    }

    // Validate params
    const params = this.getAdapterParams();
    const validationError = adapter.validate(params);
    if (validationError) {
      // Erreur de config muette pour l'aval avant #283 (console.warn seul)
      reportConfigError(this, `dsfr-data-source[${this.id}]`, validationError);
      this._error = new Error(validationError);
      dispatchDataError(this.id, this._error);
      return;
    }

    clearConfigError(this);

    if (this._abortController) {
      this._abortController.abort();
    }
    this._abortController = new AbortController();
    const generation = ++this._fetchGeneration;

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

        // Publish pagination meta — serverSide:true est le signal d'activation
        // de la pagination serveur en aval (contrat #270)
        setDataMeta(this.id, {
          page: this._currentPage,
          pageSize: this.pageSize,
          total: result.totalCount,
          serverSide: true,
          needsClientProcessing: result.needsClientProcessing,
        });
      } else {
        // Fetch all with auto-pagination
        result = await adapter.fetchAll(params, this._abortController.signal);

        // Publish meta with needsClientProcessing flag. serverSide:false —
        // l'aval ne doit PAS activer sa pagination serveur sur un fetchAll
        // (pageSize 0 produisait des totaux de pages Infinity, #270)
        setDataMeta(this.id, {
          page: 1,
          pageSize: 0,
          total: result.totalCount,
          serverSide: false,
          needsClientProcessing: result.needsClientProcessing,
        });
      }

      this._data = result.data;
      dispatchDataLoaded(this.id, this._data);

      // Cache externe via hook (fire-and-forget, #307)
      if (this.cacheTtl > 0 && getCacheProvider()) {
        this._putCache(this._data).catch(() => {});
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }

      // Fallback offline via le hook de cache (#307)
      if (this.cacheTtl > 0 && getCacheProvider()) {
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
      if (generation === this._fetchGeneration) {
        this._loading = false;
      }
    }
  }

  /**
   * Parametres adapter resolus, headers effectifs inclus (headers +
   * api-key-ref). Consomme par les composants aval via SourceElement (#274).
   */
  public getAdapterParams(): AdapterParams {
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
      maxRecords: this.maxRecords,
      transform: this.transform,
      pageSize: this.pageSize,
      headers: parsedHeaders,
      proxyUrl: this.proxyUrl || undefined,
    };
  }

  // --- API key registry resolution ---

  private _resolveApiKeyHeaders(): Record<string, string> | null {
    if (!this.apiKeyRef) return null;
    const registry = window.DSFR_DATA_KEYS;
    if (!registry || typeof registry !== 'object') {
      console.warn(
        `dsfr-data-source[${this.id}]: window.DSFR_DATA_KEYS non défini, api-key-ref="${this.apiKeyRef}" ignore`
      );
      return null;
    }
    const value = registry[this.apiKeyRef];
    if (!value || typeof value !== 'string') {
      console.warn(
        `dsfr-data-source[${this.id}]: clé "${this.apiKeyRef}" introuvable dans window.DSFR_DATA_KEYS`
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

  /**
   * Fingerprint de la requete courante (#307) : la cle de cache inclut
   * URL/params/where/page... — l'ancienne cle (id seul) pouvait resservir
   * la page 3 filtree d'hier pour une requete page 1 sans filtre.
   */
  private _cacheFingerprint(): unknown {
    return {
      url: this.url,
      method: this.method,
      params: this.params,
      transform: this.transform,
      apiType: this.apiType,
      baseUrl: this.baseUrl,
      datasetId: this.datasetId,
      resource: this.resource,
      where: this.getEffectiveWhere(),
      select: this.select,
      groupBy: this.groupBy,
      aggregate: this.aggregate,
      orderBy: this._orderByOverlay ?? this.orderBy,
      page: this._currentPage,
      pageSize: this.pageSize,
      serverSide: this.serverSide,
      limit: this.limit,
    };
  }

  /** Ecrit dans le cache externe si un provider est enregistre (#307). */
  private _putCache(data: unknown): Promise<void> {
    const provider = getCacheProvider();
    if (!provider) return Promise.resolve();
    return provider.put(cacheKeyFor(this.id, this._cacheFingerprint()), data, this.cacheTtl);
  }

  /** Lit le cache externe si un provider est enregistre (#307). */
  private async _getCache(): Promise<unknown | null> {
    const provider = getCacheProvider();
    if (!provider) return null;
    try {
      return await provider.get(cacheKeyFor(this.id, this._cacheFingerprint()));
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
