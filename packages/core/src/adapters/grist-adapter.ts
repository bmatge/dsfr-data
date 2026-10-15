/**
 * Adapter pour l'API Grist (grist.numerique.gouv.fr, docs.getgrist.com).
 *
 * Deux modes de fonctionnement, sélectionnés automatiquement :
 *
 * **Mode Records** (GET /records) :
 *   - filter equality/IN via ?filter={"col":["v1","v2"]}
 *   - sort via ?sort=-col,col2
 *   - `limit=N`, et RIEN d'autre pour paginer : `/records` ne connait pas
 *     `offset` (#1279 — mesure le 2026-10-13 sur grist.numerique.gouv.fr :
 *     `limit=5&offset=5` rend les memes cinq lignes que `limit=5` ; le source
 *     de grist-core ne lit que `sort` et `limit`, `DocApiUtils.ts`). La page N
 *     est donc demandee par `limit = N x taille` et decoupee ici.
 *   - Utilise pour les cas simples (datalist, affichage pagine)
 *
 * **Mode SQL** (POST /sql) :
 *   - GROUP BY, SUM/AVG/COUNT/MIN/MAX
 *   - WHERE avec tous les operateurs (=, !=, >, <, LIKE, IN, IS NULL...)
 *   - Facettes via SELECT col, COUNT(*) ... GROUP BY col
 *   - Utilise quand group-by, aggregate ou operateurs avances sont demandes
 *   - Fallback gracieux en mode Records + client-side si endpoint SQL indisponible
 *   - Pagination par `LIMIT` / `OFFSET`, toujours sur un ordre TOTAL (#1279) :
 *     voir `_pageOrder`
 *
 * Le base-url passe en attribut doit déjà inclure le proxy si necessaire
 * (ex: https://<proxy-domain>/grist-gouv-proxy/api/docs/xxx/tables/yyy/records).
 */

import type {
  ApiAdapter,
  AdapterCapabilities,
  AdapterParams,
  FetchResult,
  FacetResult,
  FacetDescriptor,
  ServerSideOverlay,
} from './api-adapter.js';
import type { QueryAggregate } from '../components/dsfr-data-query.js';
import { parseAggregates } from '../utils/aggregates.js';
import {
  buildColonFacetWhere,
  unescapeColonValue,
  parseOrderBy,
  splitColonFields,
  isMultiFieldClause,
} from '../utils/where.js';
import type { ProviderConfig } from '@dsfr-data/shared/lib';
import {
  GRIST_CONFIG,
  escapeLikePattern,
  canServerExpress,
  resolveTransportUrl,
  transportFetch,
} from '@dsfr-data/shared/lib';
import { httpError, releaseBody } from '../utils/http-error.js';

/** Construit les options fetch avec headers optionnels */
function buildFetchOptions(
  params: Pick<AdapterParams, 'headers'>,
  signal?: AbortSignal
): RequestInit {
  const opts: RequestInit = {};
  if (signal) opts.signal = signal;
  if (params.headers && Object.keys(params.headers).length > 0) {
    opts.headers = params.headers;
  }
  return opts;
}

/**
 * Identifiant de ligne d'une table Grist : colonne reservee, presente sur
 * toute table, unique — triable par `/records` (`sort=…,id`, mesure le
 * 2026-10-13 : `sort=-id&limit=3` rend 101, 100, 99) comme par `/sql`.
 * C'est la cle de departage d'une pagination (#1279).
 */
const GRIST_ROW_ID = 'id';

// ---------------------------------------------------------------------------
// Types internes
// ---------------------------------------------------------------------------

interface SqlQuery {
  select: string;
  groupBy: string;
  where: string;
  orderBy: string;
  limit: string;
  offset: string;
  args: (string | number)[];
}

export interface GristColumn {
  id: string;
  label: string;
  type: string;
  isFormula: boolean;
  formula: string;
}

export interface GristTable {
  id: string;
}

/** Operateur SQL de chaque comparaison d'ordre du dialecte colon (#1321). */
const SQL_ORDRE: Record<'gt' | 'gte' | 'lt' | 'lte', string> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

// ---------------------------------------------------------------------------
// GristAdapter
// ---------------------------------------------------------------------------

export class GristAdapter implements ApiAdapter {
  readonly type = 'grist';

  readonly capabilities: AdapterCapabilities = {
    serverFetch: true,
    serverFacets: true,
    serverSearch: false,
    serverGroupBy: true,
    serverOrderBy: true,
    serverGeo: false,
    whereFormat: 'colon',
  };

  /**
   * Cache de disponibilite du endpoint SQL, par ENDPOINT (host + document)
   * et avec TTL (#287) : un 403 ponctuel sur un document ne condamne plus
   * tous les documents du host, ni definitivement. (Etat d'instance assume
   * sur un adapter singleton : memoisation revocable, pas un etat metier.)
   */
  private _sqlAvailability = new Map<string, { available: boolean; expiresAt: number }>();

  /** TTL du cache de dispo SQL : long quand ca marche, court quand ca echoue */
  private static readonly SQL_AVAILABLE_TTL_MS = 30 * 60 * 1000;
  private static readonly SQL_UNAVAILABLE_TTL_MS = 2 * 60 * 1000;

  validate(params: AdapterParams): string | null {
    if (!params.baseUrl) {
      return 'attribut "base-url" requis pour les requêtes Grist';
    }
    return null;
  }

  // =========================================================================
  // fetchAll / fetchPage — orchestration Records vs SQL
  // =========================================================================

  async fetchAll(params: AdapterParams, signal: AbortSignal): Promise<FetchResult> {
    if (this._needsSqlMode(params) && (await this._checkSqlAvailability(params, signal))) {
      return this._fetchSql(params, undefined, signal);
    }

    // Mode Records (enrichi avec filter/sort/limit)
    const url = resolveTransportUrl(this.buildUrl(params), params);
    const response = await transportFetch(url, buildFetchOptions(params, signal), params);
    if (!response.ok) throw httpError(response);

    const json = await response.json();
    const data = this._flattenRecords(json.records || []);

    return {
      data,
      totalCount: data.length,
      // Records applique filter (eq/in), sort et limit. Si on est ici alors
      // que le SQL etait requis (group-by/aggregate/operateurs avances) mais
      // indisponible, ces transformations restent a faire cote client (#270).
      needsClientProcessing: this._needsSqlMode(params),
    };
  }

  async fetchPage(
    params: AdapterParams,
    overlay: ServerSideOverlay,
    signal: AbortSignal
  ): Promise<FetchResult> {
    if (this._needsSqlMode(params, overlay) && (await this._checkSqlAvailability(params, signal))) {
      return this._fetchSql(params, overlay, signal);
    }

    // Mode Records pagine
    const url = resolveTransportUrl(this.buildServerSideUrl(params, overlay), params);
    const response = await transportFetch(url, buildFetchOptions(params, signal), params);
    if (!response.ok) throw httpError(response);

    const json = await response.json();
    // `/records` ne sait pas sauter de lignes (#1279) : la requete a demande
    // les `page x taille` premieres, la page est leur derniere tranche.
    const received = this._flattenRecords(json.records || []);
    const pageSize = params.pageSize || received.length;
    const start = overlay.page && params.pageSize ? (overlay.page - 1) * pageSize : 0;
    const data = start > 0 ? received.slice(start) : received;
    const isLastPage = data.length < pageSize;

    return {
      data,
      // Total inconnu hors derniere page : undefined, jamais -1 (#270).
      // L'aval propose "page suivante" tant que la page courante est pleine.
      totalCount: isLastPage ? received.length : undefined,
      needsClientProcessing: false,
    };
  }

  // =========================================================================
  // buildUrl / buildServerSideUrl — Mode Records
  // =========================================================================

  buildUrl(params: AdapterParams): string {
    const url = new URL(params.baseUrl);

    // Filter server-side : convertir le where colon en JSON Grist
    if (params.where) {
      const gristFilter = this._colonWhereToGristFilter(params.where);
      if (gristFilter) {
        url.searchParams.set('filter', JSON.stringify(gristFilter));
      }
    }

    // Sort server-side
    if (params.orderBy) {
      url.searchParams.set('sort', this._orderByToGristSort(params.orderBy));
    }

    // Limit (sans pagination)
    if (params.limit) {
      url.searchParams.set('limit', String(params.limit));
    }

    return url.toString();
  }

  buildServerSideUrl(params: AdapterParams, overlay: ServerSideOverlay): string {
    const url = new URL(params.baseUrl);

    // Merge static where + dynamic where (facets, search)
    const mergedWhere = overlay.effectiveWhere || params.where;
    if (mergedWhere) {
      const gristFilter = this._colonWhereToGristFilter(mergedWhere);
      if (gristFilter) {
        url.searchParams.set('filter', JSON.stringify(gristFilter));
      }
    }

    const paged = !!(overlay.page && params.pageSize);

    // Sort. Pagine, le tri demande est complete par `id`, l'identifiant de
    // ligne que porte toute table Grist : l'ordre est TOTAL, le meme d'une
    // page a l'autre et le meme que celui du mode SQL (`_pageOrder`).
    const sort = overlay.orderBy || params.orderBy;
    if (sort) {
      const keys = this._orderByToGristSort(sort);
      const total = paged && !parseOrderBy(sort).some((p) => p.field === GRIST_ROW_ID);
      url.searchParams.set('sort', total ? `${keys},${GRIST_ROW_ID}` : keys);
    }

    // Pagination : `/records` ne connait que `limit` — `offset` y est ignore
    // sans erreur, et chaque page rendait les lignes de la premiere (#1279).
    // La page N part donc en `limit = N x taille` ; `fetchPage` n'en garde
    // que la derniere tranche.
    if (paged) {
      url.searchParams.set('limit', String(overlay.page * params.pageSize));
    }

    return url.toString();
  }

  // =========================================================================
  // Facettes server-side via SQL GROUP BY + COUNT
  // =========================================================================

  async fetchFacets(
    params: Pick<AdapterParams, 'baseUrl' | 'datasetId' | 'headers' | 'proxyUrl' | 'relayUrl'>,
    fields: string[],
    where: string,
    signal?: AbortSignal
  ): Promise<FacetResult[]> {
    const results: FacetResult[] = [];
    const fullParams = params as AdapterParams;

    // Vérifier que SQL est disponible
    if (!(await this._checkSqlAvailability(fullParams))) {
      return results;
    }

    for (const field of fields) {
      const table = this._getTableId(fullParams);
      const col = this._escapeIdentifier(field);
      const args: (string | number)[] = [];

      let sql = `SELECT ${col}, COUNT(*) as cnt FROM ${this._escapeIdentifier(table)}`;
      if (where) {
        sql += ` WHERE ${this._colonWhereToSql(where, args)}`;
      }
      sql += ` GROUP BY ${col} ORDER BY cnt DESC LIMIT 200`;

      const sqlUrl = resolveTransportUrl(this._getSqlEndpointUrl(fullParams), fullParams, 'POST');
      try {
        const response = await fetch(sqlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(params.headers || {}) },
          body: JSON.stringify({ sql, args, timeout: 500 }),
          signal,
        });

        if (!response.ok) {
          releaseBody(response);
          continue;
        }

        const json = await response.json();
        // Lignes lues par NOM de colonne (#1279) : l'API rend des objets
        // `{ fields }`, pas des tableaux — voir `_sqlResultToObjects`.
        // L'ancienne forme positionnelle (`[valeur, compte]`) reste lue.
        const records: unknown[] = json.records || [];
        const rows = Array.isArray(records[0])
          ? (records as unknown[][]).map((row) => ({ [field]: row[0], cnt: row[1] }))
          : this._sqlResultToObjects({ records });
        results.push({
          field,
          values: rows
            .map((row) => ({
              value: String(row[field] ?? ''),
              count: Number(row.cnt) || 0,
            }))
            .filter((v) => v.value !== ''),
        });
      } catch {
        continue;
      }
    }

    return results;
  }

  /**
   * Equivalent Grist de la decouverte des facettes (#680) : les colonnes de
   * type Choice / ChoiceList sont les champs categoriels declares par le
   * document. Les dates Grist sont des nombres (epoch), pas des annees :
   * aucun marquage `isDate`.
   */
  async discoverFacets(
    params: Pick<AdapterParams, 'baseUrl' | 'datasetId' | 'headers' | 'proxyUrl' | 'relayUrl'>,
    signal?: AbortSignal
  ): Promise<FacetDescriptor[]> {
    const columns = await this.fetchColumns(params as AdapterParams, signal);
    return columns
      .filter((c) => c.type === 'Choice' || c.type === 'ChoiceList')
      .map((c) => ({ field: c.id, label: c.label !== c.id ? c.label : undefined }));
  }

  // =========================================================================
  // Search template
  // =========================================================================

  getDefaultSearchTemplate(): null {
    return null;
  }

  // =========================================================================
  // ProviderConfig + facet where
  // =========================================================================

  getProviderConfig(): ProviderConfig {
    return GRIST_CONFIG;
  }

  /**
   * Ce qui peut etre confie a Grist (#1285, ADR-159, lot 2) : une clause dont
   * la STRUCTURE de comparaison y est la meme que dans le navigateur.
   *
   * - `contains` part en SQL, `LIKE ? ESCAPE '\'`, jokers de la valeur
   *   echappes (`_sqlClause`) : sous-chaine, casse ignoree pour les seules
   *   lettres ASCII (`É` n'est pas `é`), accents respectes — l'ecart de casse
   *   est celui du serveur, admis par l'ADR-159 (point 3).
   * - `notcontains` reste au navigateur : `NOT LIKE` ecarte les valeurs
   *   absentes, que le navigateur garde (89 lignes sur 101 quand 12 sont
   *   nulles, ADR-159).
   *
   * Le mode Records ne sait filtrer que `eq` / `in` : une clause `contains`
   * fait passer en SQL (`_hasAdvancedOperators`) ; sans endpoint SQL, la
   * clause n'est pas appliquee par le serveur et la reponse le dit
   * (`needsClientProcessing`).
   */
  supportsServerClause(clause: string): boolean {
    return canServerExpress(GRIST_CONFIG.id, clause);
  }

  buildFacetWhere(selections: Record<string, Set<string>>, excludeField?: string): string {
    return buildColonFacetWhere(selections, excludeField);
  }

  // =========================================================================
  // parseAggregates
  // =========================================================================

  /**
   * Delegue au parseur partage (#269). L'alias par defaut est desormais
   * `field__fn` comme partout (query client-side, ODS, Tabular) — l'ancien
   * `fn_field` cassait le value-field des charts a la bascule de provider
   * ou de mode SQL <-> Records.
   */
  parseAggregates(aggExpr: string): QueryAggregate[] {
    return parseAggregates(aggExpr);
  }

  // =========================================================================
  // Introspection : columns + tables (Etape 3)
  // =========================================================================

  /**
   * Recupere les metadonnees des colonnes d'une table Grist.
   * GET /api/docs/{docId}/tables/{tableId}/columns
   */
  async fetchColumns(params: AdapterParams, signal?: AbortSignal): Promise<GristColumn[]> {
    const url = resolveTransportUrl(params.baseUrl.replace(/\/records.*$/, '/columns'), params);
    try {
      const response = await transportFetch(url, buildFetchOptions(params, signal), params);
      if (!response.ok) {
        releaseBody(response);
        return [];
      }

      const json = await response.json();
      return (json.columns || []).map((col: Record<string, unknown>) => {
        const fields = col.fields as Record<string, unknown> | undefined;
        return {
          id: col.id as string,
          label: (fields?.label as string) || (col.id as string),
          type: (fields?.type as string) || 'Any',
          isFormula: (fields?.isFormula as boolean) || false,
          formula: (fields?.formula as string) || '',
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Liste les tables d'un document Grist.
   * GET /api/docs/{docId}/tables
   */
  async fetchTables(params: AdapterParams, signal?: AbortSignal): Promise<GristTable[]> {
    const url = resolveTransportUrl(
      params.baseUrl.replace(/\/tables\/[^/]+\/records.*$/, '/tables'),
      params
    );
    try {
      const response = await transportFetch(url, buildFetchOptions(params, signal), params);
      if (!response.ok) {
        releaseBody(response);
        return [];
      }

      const json = await response.json();
      return (json.tables || []).map((t: Record<string, unknown>) => ({
        id: t.id as string,
      }));
    } catch {
      return [];
    }
  }

  // =========================================================================
  // Mode Records : conversions
  // =========================================================================

  /**
   * Convertit une clause WHERE colon-syntax en objet filtre Grist.
   * Supporte eq et in. Les autres operateurs sont ignores (mode SQL les gere).
   */
  _colonWhereToGristFilter(where: string): Record<string, string[]> | null {
    const filter: Record<string, string[]> = {};
    const parts = where
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    for (const part of parts) {
      const [field, op, ...rest] = part.split(':');
      const value = rest.join(':');
      // Champs multiples (#1026) : un OU que le filtre Records ne sait pas
      // dire — la clause fait passer en mode SQL (`_hasAdvancedOperators`).
      if (isMultiFieldClause(part)) continue;

      if (op === 'eq') {
        filter[field] = [unescapeColonValue(value)];
      } else if (op === 'in') {
        filter[field] = value.split('|').map(unescapeColonValue);
      }
      // Autres operateurs : ignores (fallback client-side ou mode SQL)
    }

    return Object.keys(filter).length > 0 ? filter : null;
  }

  /**
   * Convertit order-by colon-syntax en parametre sort Grist.
   * "population:desc, nom:asc" → "-population,nom"
   */
  _orderByToGristSort(orderBy: string): string {
    // Grammaire commune "field:dir, field2:dir2" (#273)
    return parseOrderBy(orderBy)
      .map((p) => (p.direction === 'desc' ? `-${p.field}` : p.field))
      .join(',');
  }

  /** Aplatir records[].fields en objets plats */
  private _flattenRecords(records: unknown[]): Record<string, unknown>[] {
    return records.map((r: unknown) => {
      const rec = r as Record<string, unknown>;
      const fields = rec.fields as Record<string, unknown> | undefined;
      return fields ? { ...fields } : (rec as Record<string, unknown>);
    });
  }

  // =========================================================================
  // Mode SQL : detection
  // =========================================================================

  /**
   * Determine si la requête necessite le mode SQL.
   * SQL est active quand group-by, aggregate ou operateurs avances sont demandes.
   */
  private _needsSqlMode(params: AdapterParams, overlay?: ServerSideOverlay): boolean {
    if (params.groupBy || params.aggregate) return true;

    const where = this._mergeWhere(params.where, overlay?.effectiveWhere);
    if (where && this._hasAdvancedOperators(where)) return true;

    return false;
  }

  private _hasAdvancedOperators(where: string): boolean {
    const advancedOps = [
      'gt',
      'gte',
      'lt',
      'lte',
      'contains',
      'notcontains',
      'neq',
      'isnull',
      'isnotnull',
      'notin',
    ];
    return where.split(',').some((part) => {
      // Champs multiples (#1026) : seul le SQL sait relier deux champs par un OU
      if (isMultiFieldClause(part.trim())) return true;
      const segments = part.trim().split(':');
      return segments.length >= 2 && advancedOps.includes(segments[1]);
    });
  }

  private _mergeWhere(staticWhere?: string, overlayWhere?: string): string {
    // effectiveWhere (getEffectiveWhere de la source) contient DEJA le where
    // statique : le re-merger dupliquait chaque clause — SQL `WHERE X AND X`
    // avec args doubles (#287). Pattern des autres adapters.
    return overlayWhere || staticWhere || '';
  }

  // =========================================================================
  // Mode SQL : execution
  // =========================================================================

  private async _fetchSql(
    params: AdapterParams,
    overlay: ServerSideOverlay | undefined,
    signal: AbortSignal
  ): Promise<FetchResult> {
    const table = this._getTableId(params);
    const { select, groupBy, where, orderBy, limit, offset, args } = this._buildSqlQuery(
      params,
      overlay,
      table
    );

    const sql = [
      `SELECT ${select}`,
      `FROM ${this._escapeIdentifier(table)}`,
      where ? `WHERE ${where}` : '',
      groupBy ? `GROUP BY ${groupBy}` : '',
      orderBy ? `ORDER BY ${orderBy}` : '',
      limit ? `LIMIT ${limit}` : '',
      offset ? `OFFSET ${offset}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    const sqlUrl = resolveTransportUrl(this._getSqlEndpointUrl(params), params, 'POST');
    const response = await fetch(sqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(params.headers || {}),
      },
      body: JSON.stringify({ sql, args, timeout: 800 }),
      signal,
    });

    if (!response.ok) {
      releaseBody(response);
      // Fallback : si SQL indisponible, revenir au mode Records
      if (response.status === 404 || response.status === 403) {
        console.warn(
          '[dsfr-data] Grist SQL endpoint not available, falling back to client-side processing'
        );
        this._sqlAvailability.set(this._getSqlEndpointUrl(params), {
          available: false,
          expiresAt: Date.now() + GristAdapter.SQL_UNAVAILABLE_TTL_MS,
        });
        return this._fetchAllRecords(params, signal);
      }
      throw new Error(`Grist SQL HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    const data = this._sqlResultToObjects(json);

    // Une PAGE (#1279) : son nombre de lignes n'est pas le total. Comme en
    // mode Records, le total n'est connu qu'a la derniere page (#270) — le
    // dire egal a la taille de page cachait toutes les pages suivantes.
    const page = overlay?.page && params.pageSize ? overlay.page : 0;
    const totalCount =
      page === 0
        ? data.length
        : data.length < params.pageSize
          ? (page - 1) * params.pageSize + data.length
          : undefined;

    return {
      data,
      totalCount,
      needsClientProcessing: false,
    };
  }

  /** Fetch Records mode (internal fallback) */
  private async _fetchAllRecords(params: AdapterParams, signal: AbortSignal): Promise<FetchResult> {
    const url = resolveTransportUrl(this.buildUrl(params), params);
    const response = await transportFetch(url, buildFetchOptions(params, signal), params);
    if (!response.ok) throw httpError(response);

    const json = await response.json();
    const data = this._flattenRecords(json.records || []);

    return {
      data,
      totalCount: data.length,
      needsClientProcessing: true,
    };
  }

  // =========================================================================
  // Mode SQL : construction de requête
  // =========================================================================

  private _buildSqlQuery(
    params: AdapterParams,
    overlay: ServerSideOverlay | undefined,
    _table: string
  ): SqlQuery {
    const args: (string | number)[] = [];
    let select = '*';
    let groupBy = '';
    let where = '';
    let limit = '';
    let offset = '';

    // SELECT + GROUP BY + AGGREGATE
    if (params.groupBy) {
      // filter(Boolean) : "region," ne doit pas produire d'identifiant vide
      // (throw `Empty SQL identifier`, #287)
      const groupFields = params.groupBy
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean)
        .map((f) => this._escapeIdentifier(f));
      groupBy = groupFields.join(', ');

      if (params.aggregate) {
        const aggParts = this.parseAggregates(params.aggregate);
        const selectParts = [
          ...groupFields,
          ...aggParts.map((a) => {
            // `distinct` (#672) : SQL COUNT(DISTINCT col), alias col__distinct
            const sqlFn =
              a.function === 'distinct'
                ? `COUNT(DISTINCT ${this._escapeIdentifier(a.field)})`
                : `${a.function.toUpperCase()}(${this._escapeIdentifier(a.field)})`;
            return `${sqlFn} as ${this._escapeIdentifier(a.alias || `${a.field}__${a.function}`)}`;
          }),
        ];
        select = selectParts.join(', ');
      } else {
        select = groupFields.join(', ') + ', COUNT(*) as count';
      }
    }

    // WHERE (merge static + overlay)
    const mergedWhere = this._mergeWhere(params.where, overlay?.effectiveWhere);
    if (mergedWhere) {
      where = this._colonWhereToSql(mergedWhere, args);
    }

    // ORDER BY — complete en ordre TOTAL des que la requete pagine (#1279)
    const sort = overlay?.orderBy || params.orderBy;
    const sortParts = sort ? parseOrderBy(sort) : [];
    const paged = !!(overlay?.page && params.pageSize);
    const orderBy = [
      ...sortParts.map((p) => ({ field: p.field, direction: p.direction.toUpperCase() })),
      ...(paged
        ? this._pageOrder(
            params,
            sortParts.map((p) => p.field)
          )
        : []),
    ]
      .map((p) => `${this._escapeIdentifier(p.field)} ${p.direction}`)
      .join(', ');

    // LIMIT / OFFSET
    if (overlay?.page && params.pageSize) {
      limit = String(params.pageSize);
      if (overlay.page > 1) {
        offset = String((overlay.page - 1) * params.pageSize);
      }
    } else if (params.limit) {
      limit = String(params.limit);
    }

    return { select, groupBy, where, orderBy, limit, offset, args };
  }

  /**
   * Cles de DEPARTAGE d'une requete SQL paginee (#1279), a poser apres le tri
   * demande : `LIMIT` / `OFFSET` ne rend chaque ligne une fois que si l'ordre
   * est total d'une page a l'autre, et SQLite ne promet rien de l'ordre des
   * lignes que l'`ORDER BY` ne departage pas — encore moins sans `ORDER BY`.
   *
   * - lignes brutes : `id`, l'identifiant de ligne de toute table Grist
   *   (cle primaire : le tri ne coute rien) ;
   * - groupes : les colonnes du `group-by` que le tri ne nomme pas — a elles
   *   toutes, elles identifient un groupe.
   *
   * Rien si le tri demande nomme deja ces colonnes.
   */
  private _pageOrder(
    params: AdapterParams,
    sorted: string[]
  ): Array<{ field: string; direction: 'ASC' }> {
    const keys = params.groupBy
      ? params.groupBy
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean)
      : [GRIST_ROW_ID];
    return keys
      .filter((key, i) => keys.indexOf(key) === i && !sorted.includes(key))
      .map((field) => ({ field, direction: 'ASC' as const }));
  }

  // =========================================================================
  // Mode SQL : conversion WHERE colon → SQL parametre
  // =========================================================================

  /**
   * Convertit une clause WHERE colon-syntax en SQL parametre.
   * Tous les operateurs sont supportes.
   */
  _colonWhereToSql(where: string, args: (string | number)[]): string {
    const clauses: string[] = [];
    const parts = where
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    for (const part of parts) {
      const [field, op, ...rest] = part.split(':');
      // Clause sans champ ou sans operateur : ignoree (un where malforme est
      // deja signale en amont par reportConfigError #277 — ne pas jeter ici)
      if (!field || !op) continue;
      // Valeurs percent-encodees par buildColonFacetWhere (#271)
      const value = unescapeColonValue(rest.join(':'));
      // Champs multiples (#1026) : `a|b:op:v` → `(a … OR b …)`, meme operateur
      // et meme valeur ; les arguments suivent l'ordre des `?`.
      const sub: string[] = [];
      for (const oneField of splitColonFields(field)) {
        this._sqlClause(oneField, op, rest, value, sub, args);
      }
      if (sub.length === 1) clauses.push(sub[0]);
      else if (sub.length > 1) clauses.push(`(${sub.join(' OR ')})`);
    }

    return clauses.join(' AND ');
  }

  /** Une clause SQL a UN champ (voir `_colonWhereToSql`), poussee dans `sub`. */
  private _sqlClause(
    field: string,
    op: string,
    rest: string[],
    value: string,
    sub: string[],
    args: (string | number)[]
  ): void {
    const col = this._escapeIdentifier(field);

    switch (op) {
      case 'eq':
        sub.push(`${col} = ?`);
        args.push(value);
        break;
      case 'neq':
        sub.push(`${col} != ?`);
        args.push(value);
        break;
      // Comparaisons d'ordre (#1321) : une case Text vide vaut `''` dans Grist,
      // et SQLite range `''` avant tout texte — `c < 'B'` la retient, alors que
      // le navigateur ecarte une valeur vide de toute comparaison
      // (`compareForRange`). `c != ''` l'ecarte cote serveur aussi. Sans effet
      // sur une colonne Numeric (vide = `null`, deja ecarte ; un nombre n'est
      // jamais egal a `''`) ni Ref (vide = `0`, un nombre des deux cotes).
      // Mesure du 2026-10-15 sur grist.numerique.gouv.fr (101 lignes, colonne
      // derivee nulle sur 12 et vide sur 13) : `c < 'B'` → 21, la forme → 8,
      // le navigateur 8 ; `c >= ''` → 89, la forme → 76, le navigateur 76.
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        sub.push(`(${col} != '' AND ${col} ${SQL_ORDRE[op]} ?)`);
        args.push(this._toNumberOrString(value));
        break;
      // Sous-chaine (#1285, ADR-159) : `%`, `_` et `\` de la valeur sont
      // echappes, et SQLite ne lit `\` comme echappement qu'avec la clause
      // `ESCAPE` (sans elle, `\%` n'echappe rien — mesure du 2026-10-14).
      // `notcontains` n'est pas confie a Grist (`supportsServerClause`) ; sa
      // traduction reste juste pour un appelant qui l'enverrait quand meme,
      // aux valeurs absentes pres.
      case 'contains':
        sub.push(`${col} LIKE ? ESCAPE '\\'`);
        args.push(`%${escapeLikePattern(value)}%`);
        break;
      case 'notcontains':
        sub.push(`${col} NOT LIKE ? ESCAPE '\\'`);
        args.push(`%${escapeLikePattern(value)}%`);
        break;
      case 'in': {
        const vals = rest.join(':').split('|').map(unescapeColonValue);
        sub.push(`${col} IN (${vals.map(() => '?').join(',')})`);
        args.push(...vals);
        break;
      }
      // `NOT IN` ecarte les valeurs absentes (logique a trois valeurs), que le
      // navigateur garde : `IS NULL OR` les rend (#1312, mesure du 2026-10-14
      // sur grist.numerique.gouv.fr, 101 lignes dont 12 nulles :
      // `NOT IN ('zzz')` → 89, `(c IS NULL OR c NOT IN ('zzz'))` → 101).
      // `neq` (`!=`) les ecarte, comme le navigateur (89) : il reste tel quel.
      case 'notin': {
        const vals = rest.join(':').split('|').map(unescapeColonValue);
        sub.push(`(${col} IS NULL OR ${col} NOT IN (${vals.map(() => '?').join(',')}))`);
        args.push(...vals);
        break;
      }
      case 'isnull':
        sub.push(`${col} IS NULL`);
        break;
      case 'isnotnull':
        sub.push(`${col} IS NOT NULL`);
        break;
    }
  }

  // =========================================================================
  // Mode SQL : parsing reponse
  // =========================================================================

  /**
   * Convertit la reponse de l'endpoint SQL en tableau d'objets.
   *
   * La forme que sert Grist (#1279, mesuree le 2026-10-13 en GET et en POST
   * sur grist.numerique.gouv.fr, et decrite par la documentation de l'API) :
   *   { statement, records: [{ fields: { col1: v1, col2: v2 } }, …] }
   * — la meme enveloppe que `/records`, sans `id` de premier niveau.
   *
   * L'adaptateur ne lisait que `{ records: [[v1, v2]], columns: [...] }`, une
   * forme que l'API ne rend pas : chaque ligne devenait un objet VIDE. Elle
   * reste lue, pour une instance ou un intermediaire qui la servirait.
   */
  _sqlResultToObjects(json: {
    records?: unknown[];
    columns?: string[];
  }): Record<string, unknown>[] {
    const { records = [], columns = [] } = json;
    return records.map((row) => {
      if (Array.isArray(row)) {
        const obj: Record<string, unknown> = {};
        columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        return obj;
      }
      const fields = (row as { fields?: unknown } | null)?.fields;
      return fields && typeof fields === 'object' ? { ...(fields as Record<string, unknown>) } : {};
    });
  }

  // =========================================================================
  // Mode SQL : utilitaires
  // =========================================================================

  /**
   * Derive l'URL du endpoint SQL depuis le baseUrl Records.
   * baseUrl : .../api/docs/{docId}/tables/{tableId}/records
   * sqlUrl  : .../api/docs/{docId}/sql
   */
  _getSqlEndpointUrl(params: Pick<AdapterParams, 'baseUrl'>): string {
    const url = params.baseUrl;
    const match = url.match(/\/api\/docs\/([^/]+)/);
    if (!match) throw new Error('Cannot derive SQL endpoint from Grist URL: ' + url);
    return url.replace(/\/tables\/[^/]+\/records.*$/, '/sql');
  }

  /**
   * Extrait le nom de la table depuis le baseUrl.
   */
  _getTableId(params: Pick<AdapterParams, 'baseUrl'>): string {
    const match = params.baseUrl.match(/\/tables\/([^/]+)/);
    if (!match) throw new Error('Cannot extract table ID from Grist URL: ' + params.baseUrl);
    return match[1];
  }

  /**
   * Echappe un identifiant SQL avec des guillemets doubles (standard SQLite).
   * Supporte les noms avec espaces et accents.
   */
  _escapeIdentifier(name: string): string {
    const clean = name.trim();
    if (!clean) throw new Error('Empty SQL identifier');
    return `"${clean.replace(/"/g, '""')}"`;
  }

  private _toNumberOrString(value: string): string | number {
    const num = Number(value);
    return !isNaN(num) && value.trim() !== '' ? num : value;
  }

  // =========================================================================
  // SQL availability check (per hostname cache)
  // =========================================================================

  private async _checkSqlAvailability(
    params: Pick<AdapterParams, 'baseUrl' | 'headers' | 'proxyUrl' | 'relayUrl'>,
    signal?: AbortSignal
  ): Promise<boolean> {
    const endpoint = this._getSqlEndpointUrl(params);
    const cached = this._sqlAvailability.get(endpoint);
    if (cached && cached.expiresAt > Date.now()) return cached.available;

    const hostname = this._extractHostname(params.baseUrl);
    // Sonde limitee a 2s ET liee au signal du composant (#287) : un
    // composant demonte n'a pas a attendre la sonde
    const probeSignal =
      signal && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, AbortSignal.timeout(2000)])
        : AbortSignal.timeout(2000);

    try {
      // La sonde suit le chemin du POST qu'elle annonce (R5 : jamais au relais)
      const sqlUrl = resolveTransportUrl(endpoint, params, 'POST');
      const response = await fetch(sqlUrl + '?q=SELECT%201', {
        method: 'GET',
        headers: (params.headers || {}) as Record<string, string>,
        signal: probeSignal,
      });
      const available = response.ok;
      // Sonde : seul le statut compte, le corps n'est jamais lu (#1272)
      releaseBody(response);
      this._sqlAvailability.set(endpoint, {
        available,
        expiresAt:
          Date.now() +
          (available ? GristAdapter.SQL_AVAILABLE_TTL_MS : GristAdapter.SQL_UNAVAILABLE_TTL_MS),
      });
      if (!available) {
        console.warn(
          `[dsfr-data] Grist SQL endpoint not available on ${hostname} — using client-side processing`
        );
      }
      return available;
    } catch {
      // Abort du COMPOSANT : la sonde n'a rien prouve — ne pas empoisonner
      // le cache (#287), la prochaine tentative re-sondera
      if (signal?.aborted) return false;
      this._sqlAvailability.set(endpoint, {
        available: false,
        expiresAt: Date.now() + GristAdapter.SQL_UNAVAILABLE_TTL_MS,
      });
      console.warn(
        `[dsfr-data] Grist SQL endpoint not available on ${hostname} — using client-side processing`
      );
      return false;
    }
  }

  private _extractHostname(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
}
