import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getByPath } from '../utils/json-path.js';
import { flattenGristEnvelope } from '../utils/grist-envelope.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import {
  getProxiedUrl,
  buildCorsProxyRequest,
  normalizeProviderAuthHeaders,
} from '@dsfr-data/shared/lib';
import type { ApiAdapter, AdapterParams, ServerSideOverlay } from '../adapters/api-adapter.js';
import { getAdapter } from '../adapters/adapter-registry.js';
import { getCacheProvider, cacheKeyFor } from '../utils/cache-provider.js';
import { logFetchError } from '../utils/fetch-diagnostics.js';
import {
  dispatchDataLoaded,
  dispatchDataError,
  dispatchDataLoading,
  dispatchDataIdle,
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
 *
 * @fires dsfr-data-loaded - `{ sourceId, data }` sur `document` — données chargees et publiees sous l'`id` de cette source. C'est l'evenement que tout l'aval ecoute.
 * @fires dsfr-data-loading - `{ sourceId }` sur `document` — un chargement demarre.
 * @fires dsfr-data-error - `{ sourceId, error, attemptedUrl? }` sur `document` — le fetch ou le
 *   parsing a echoue. `attemptedUrl` (#603) porte l'URL REELLEMENT appelee, proxy applique :
 *   elle diverge souvent du `base-url` ecrit dans le HTML, et le message de l'`Error` reste
 *   volontairement court. La cle est absente quand l'URL n'a pas pu être construite, ou pour
 *   une erreur qui ne vient pas d'un fetch (données inline invalides, configuration).
 * @fires dsfr-data-idle - `{ sourceId, reason }` sur `document` — la source attend un filtre
 *   (`require-where` posé, aucun filtre reçu). Aucune requête n'est partie : l'état est distinct
 *   d'un chargement, d'une erreur et d'un résultat vide. Les afficheurs le rendent en message
 *   « choisissez un filtre » (#690).
 * @fires cache-fallback - `{ sourceId }` sur l'élément — les données servies viennent du cache externe après un echec reseau (#307).
 */
@customElement('dsfr-data-source')
export class DsfrDataSource extends LitElement {
  // --- Mode URL brute (existant) ---

  /** URL de l'API a interroger (mode URL brute). Vide en mode adapter ou en mode `data` inline. */
  @property({ type: String })
  url = '';

  /** Méthode HTTP : `GET` (défaut) ou `POST`. */
  @property({ type: String })
  method: 'GET' | 'POST' = 'GET';

  /**
   * En-têtes HTTP en JSON. Ex: `'{"Authorization": "Bearer xxx"}'`.
   * OpenDataSoft : la clé va dans `Authorization: Apikey CLE` (seul en-tête
   * autorisé en CORS) — un `apikey` nu est réécrit automatiquement (#655).
   */
  @property({ type: String })
  headers = '';

  /** Paramètres de requête en JSON : query string en GET, corps en POST. */
  @property({ type: String })
  params = '';

  /** Rafraichissement automatique en secondes (0 = desactive). */
  @property({ type: Number })
  refresh = 0;

  /** Chemin JSONPath vers le tableau de données dans la réponse. Ex: `"results"`, `"data.items"`. */
  @property({ type: String })
  transform = '';

  /** Active la pagination serveur en mode URL : injecte page/page_size dans l'URL et publie la meta. */
  @property({ type: Boolean })
  paginate = false;

  /** Taille de page pour la pagination serveur (nombre de records par page). */
  @property({ type: Number, attribute: 'page-size' })
  pageSize = 20;

  /** TTL du cache externe en secondes (0 = desactive). Actif uniquement si la page hote enregistre `window.DSFR_DATA_CACHE_PROVIDER` (#307) — no-op en embed anonyme. */
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

  /** Référence vers une clé API déclarée dans window.DSFR_DATA_KEYS */
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

  /**
   * Group-by (pour les APIs qui le supportent server-side). ODS : un élément
   * peut être une expression aliasée (`year(date) as annee`), transmise telle
   * quelle — l'alias `as` est obligatoire cote ODS (#641).
   */
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

  /** Limite du nombre de résultats */
  @property({ type: Number })
  limit = 0;

  /**
   * Plafond de records du fetchAll en mode adapter (#233). 0 = plafond par
   * défaut de l'adapter (ODS : 1000). A relever explicitement pour les
   * dashboards « un fetch, N agrégations client » — attention au nombre de
   * requêtes en boucle et au poids mémoire.
   */
  @property({ type: Number, attribute: 'max-records' })
  maxRecords = 0;

  /**
   * Ne rien charger tant qu'aucun filtre n'a été reçu (#690).
   *
   * Pensé pour les pages d'exploration : sans cet attribut, une source
   * interroge l'API dès le montage et rapatrie le jeu entier — une requête
   * coûteuse dont personne ne regarde le résultat. Avec lui, la source reste
   * en attente, émet `dsfr-data-idle` et ne part chercher les données qu'au
   * premier filtre.
   *
   * Ce qui compte comme filtre : les clauses reçues par commande — facettes,
   * recherche, `dsfr-data-context`, délégation d'un `dsfr-data-query`. Le
   * `where` STATIQUE de la source ne compte PAS : il fait partie de la
   * définition du jeu, pas du geste de l'utilisateur ; le contraire rendrait
   * l'attribut sans effet sur toute source qui restreint déjà son périmètre.
   *
   * Quand le dernier filtre est retiré, la source repasse en attente : jamais
   * de requête « tout » implicite. Sans effet en mode données inline (`data`),
   * qui ne fait aucune requête.
   */
  @property({ type: Boolean, attribute: 'require-where' })
  requireWhere = false;

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
  /** Warn-once : require-where pose sur une source qui ne peut rien recevoir (#690) */
  private _requireWhereModeWarned = false;

  /** Dynamic WHERE overlays from dsfr-data-facets, dsfr-data-search, etc. */
  private _whereOverlays = new Map<string, string>();
  /** Dynamic orderBy overlay from dsfr-data-list sort */
  private _orderByOverlay = '';
  /** Dynamic groupBy overlay from dsfr-data-query délégation */
  private _groupByOverlay = '';
  /** Dynamic aggregate overlay from dsfr-data-query délégation */
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
      changedProperties.has('proxyUrl') ||
      changedProperties.has('requireWhere');

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

  /**
   * Returns the effective WHERE clause (static + all dynamic overlays merged).
   * `excludeKey` : un whereKey, ou une liste de whereKeys a ignorer (#678 —
   * une facette en mode `context` emet un whereKey PAR champ et doit les
   * exclure tous du where de base de sa cascade).
   */
  public getEffectiveWhere(excludeKey?: string | string[]): string {
    const excluded = new Set(
      Array.isArray(excludeKey) ? excludeKey : excludeKey !== undefined ? [excludeKey] : []
    );
    const parts: string[] = [];
    if (this.where) parts.push(this.where);
    for (const [key, value] of this._whereOverlays) {
      if (!excluded.has(key) && value) parts.push(value);
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

  /**
   * Un filtre utilisateur est-il posé (#690) ? Seuls les overlays reçus par
   * commande comptent — le `where` statique fait partie de la définition de
   * la source, pas du geste de l'utilisateur.
   */
  private _hasReceivedWhere(): boolean {
    for (const value of this._whereOverlays.values()) {
      if (value) return true;
    }
    return false;
  }

  /** Entrée (ou retour) en attente d'un filtre : rien n'est chargé (#690). */
  private _enterIdle() {
    // Piège de configuration : en mode URL, les commandes where sont
    // refusées (#288) — aucun filtre ne pourra jamais lever l'attente, la
    // source resterait muette pour toujours. Le dire une fois.
    if (!this._isAdapterMode() && !this._requireWhereModeWarned) {
      this._requireWhereModeWarned = true;
      console.warn(
        `dsfr-data-source[${this.id}]: require-where est sans issue en mode URL — ` +
          `les commandes where y sont refusées (#288). Utilisez un api-type ` +
          `(opendatasoft, tabular, grist, insee) pour que les filtres atteignent la source.`
      );
    }

    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this._data = null;
    this._error = null;
    this._loading = false;
    if (this.id) dispatchDataIdle(this.id);
  }

  private async _fetchData() {
    // Garde AVANT toute construction de requête (#690) : ni fetch, ni
    // validation d'adapter, ni `dsfr-data-loading` — l'aval doit voir un
    // état d'attente, pas un chargement qui n'arrive jamais.
    if (this.requireWhere && !this._hasReceivedWhere()) {
      this._enterIdle();
      return;
    }

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

    // Hoistee : le catch en a besoin pour nommer l'URL reellement appelee (#598)
    let attemptedUrl = '';

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

      attemptedUrl = url;

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

      // Enveloppe Grist en mode URL (#482) : [{id, fields:{…}}] → [{…fields}],
      // pour livrer les mêmes lignes plates que le mode adapter api-type="grist"
      this._data = flattenGristEnvelope(this._data);

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
      dispatchDataError(this.id, this._error, attemptedUrl || undefined);
      logFetchError(`dsfr-data-source[${this.id}]: Erreur de chargement`, error, attemptedUrl);
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

    // Declare hors du try : le catch reconstitue l'URL appelee a partir de
    // l'overlay pour le diagnostic (#598). Reste assigne dans la branche
    // server-side, pour ne pas appeler getEffectiveWhere() en mode fetchAll.
    let overlay: ServerSideOverlay | undefined;

    try {
      let result;

      if (this.serverSide) {
        // Server-side pagination: fetch one page at a time
        overlay = {
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
        //
        // `truncated` (#658) : le jeu livre est un sous-ensemble — total
        // connu et superieur aux lignes recues (plafond max-records ou
        // limit), ou plafond atteint sur une page pleine quand le total est
        // inconnu (group_by ODS, #641 — signal pose par l'adapter). Le warn
        // console existait deja ; ce champ rend la troncature lisible par le
        // volet Diagnostic.
        const received = Array.isArray(result.data) ? result.data.length : 0;
        const truncated =
          result.truncated === true ||
          (typeof result.totalCount === 'number' && result.totalCount > received);
        setDataMeta(this.id, {
          page: 1,
          pageSize: 0,
          total: result.totalCount,
          serverSide: false,
          needsClientProcessing: result.needsClientProcessing,
          ...(truncated ? { truncated: true } : {}),
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
      const diagnosticUrl = this._diagnosticUrl(adapter, params, overlay);
      dispatchDataError(this.id, this._error, diagnosticUrl);
      logFetchError(`dsfr-data-source[${this.id}]: Erreur de chargement`, error, diagnosticUrl);
    } finally {
      if (generation === this._fetchGeneration) {
        this._loading = false;
      }
    }
  }

  /**
   * URL construite par l'adapter pour ce fetch, a seule fin de diagnostic
   * (#598). En mode fetchAll l'adapter pagine ensuite lui-meme : l'URL rendue
   * est celle de la première requête, sans les surcharges de page.
   *
   * Purement informative — ne doit jamais faire echouer le log d'erreur.
   */
  private _diagnosticUrl(
    adapter: ApiAdapter,
    params: AdapterParams,
    overlay?: ServerSideOverlay
  ): string | undefined {
    try {
      return overlay ? adapter.buildServerSideUrl(params, overlay) : adapter.buildUrl(params);
    } catch {
      return undefined;
    }
  }

  /**
   * Paramètres adapter resolus, headers effectifs inclus (headers +
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

    // Mode URL sur un hote ODS : `apikey` nu → `Authorization: Apikey K`
    // (#655, provider detecte depuis l'URL ; no-op pour les autres)
    if (this.url && Object.keys(headers).length > 0) {
      headers = normalizeProviderAuthHeaders(this.url, headers).headers;
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
   * Fingerprint de la requête courante (#307) : la cle de cache inclut
   * URL/params/where/page... — l'ancienne cle (id seul) pouvait resservir
   * la page 3 filtree d'hier pour une requête page 1 sans filtre.
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
