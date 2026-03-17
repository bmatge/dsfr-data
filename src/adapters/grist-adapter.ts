/**
 * Adapter pour l'API Grist (grist.numerique.gouv.fr, docs.getgrist.com).
 *
 * Deux modes de fonctionnement, selectionnes automatiquement :
 *
 * **Mode Records** (GET /records) :
 *   - filter equality/IN via ?filter={"col":["v1","v2"]}
 *   - sort via ?sort=-col,col2
 *   - pagination via ?limit=N&offset=M
 *   - Utilise pour les cas simples (datalist, affichage pagine)
 *
 * **Mode SQL** (POST /sql) :
 *   - GROUP BY, SUM/AVG/COUNT/MIN/MAX
 *   - WHERE avec tous les operateurs (=, !=, >, <, LIKE, IN, IS NULL...)
 *   - Facettes via SELECT col, COUNT(*) ... GROUP BY col
 *   - Utilise quand group-by, aggregate ou operateurs avances sont demandes
 *   - Fallback gracieux en mode Records + client-side si endpoint SQL indisponible
 *
 * Le base-url passe en attribut doit deja inclure le proxy si necessaire
 * (ex: https://<proxy-domain>/grist-gouv-proxy/api/docs/xxx/tables/yyy/records).
 */

import type {
  ApiAdapter, AdapterCapabilities, AdapterParams,
  FetchResult, FacetResult, ServerSideOverlay
} from './api-adapter.js';
import type { QueryAggregate } from '../components/dsfr-data-query.js';
import type { ProviderConfig } from '@dsfr-data/shared';
import { GRIST_CONFIG, getProxiedUrl } from '@dsfr-data/shared';

/** Construit les options fetch avec headers optionnels */
function buildFetchOptions(params: Pick<AdapterParams, 'headers'>, signal?: AbortSignal): RequestInit {
  const opts: RequestInit = {};
  if (signal) opts.signal = signal;
  if (params.headers && Object.keys(params.headers).length > 0) {
    opts.headers = params.headers;
  }
  return opts;
}

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
    whereFormat: 'colon',
  };

  /** Cache de disponibilite du endpoint SQL par hostname */
  private _sqlAvailableByHost = new Map<string, boolean>();

  validate(params: AdapterParams): string | null {
    if (!params.baseUrl) {
      return 'attribut "base-url" requis pour les requetes Grist';
    }
    return null;
  }

  // =========================================================================
  // fetchAll / fetchPage — orchestration Records vs SQL
  // =========================================================================

  async fetchAll(params: AdapterParams, signal: AbortSignal): Promise<FetchResult> {
    if (this._needsSqlMode(params) && await this._checkSqlAvailability(params)) {
      return this._fetchSql(params, undefined, signal);
    }

    // Mode Records (enrichi avec filter/sort/limit)
    const url = getProxiedUrl(this.buildUrl(params));
    const response = await fetch(url, buildFetchOptions(params, signal));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const json = await response.json();
    const data = this._flattenRecords(json.records || []);

    return {
      data,
      totalCount: data.length,
      // Server-side si filter ou sort appliques, sinon client-side
      needsClientProcessing: !params.where && !params.orderBy,
    };
  }

  async fetchPage(params: AdapterParams, overlay: ServerSideOverlay, signal: AbortSignal): Promise<FetchResult> {
    if (this._needsSqlMode(params, overlay) && await this._checkSqlAvailability(params)) {
      return this._fetchSql(params, overlay, signal);
    }

    // Mode Records pagine
    const url = getProxiedUrl(this.buildServerSideUrl(params, overlay));
    const response = await fetch(url, buildFetchOptions(params, signal));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const json = await response.json();
    const data = this._flattenRecords(json.records || []);
    const pageSize = params.pageSize || data.length;
    const isLastPage = data.length < pageSize;

    return {
      data,
      totalCount: isLastPage
        ? ((overlay.page || 1) - 1) * pageSize + data.length
        : -1,
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

    // Sort
    const sort = overlay.orderBy || params.orderBy;
    if (sort) {
      url.searchParams.set('sort', this._orderByToGristSort(sort));
    }

    // Pagination
    if (overlay.page && params.pageSize) {
      url.searchParams.set('limit', String(params.pageSize));
      url.searchParams.set('offset', String((overlay.page - 1) * params.pageSize));
    }

    return url.toString();
  }

  // =========================================================================
  // Facettes server-side via SQL GROUP BY + COUNT
  // =========================================================================

  async fetchFacets(
    params: Pick<AdapterParams, 'baseUrl' | 'datasetId' | 'headers'>,
    fields: string[],
    where: string,
    signal?: AbortSignal
  ): Promise<FacetResult[]> {
    const results: FacetResult[] = [];
    const fullParams = params as AdapterParams;

    // Verifier que SQL est disponible
    if (!await this._checkSqlAvailability(fullParams)) {
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

      const sqlUrl = getProxiedUrl(this._getSqlEndpointUrl(fullParams));
      try {
        const response = await fetch(sqlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(params.headers || {}) },
          body: JSON.stringify({ sql, args, timeout: 500 }),
          signal,
        });

        if (!response.ok) continue;

        const json = await response.json();
        const rows: unknown[][] = json.records || [];
        results.push({
          field,
          values: rows
            .map((row) => ({
              value: String(row[0] ?? ''),
              count: Number(row[1]) || 0,
            }))
            .filter((v) => v.value !== ''),
        });
      } catch {
        continue;
      }
    }

    return results;
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

  buildFacetWhere(
    selections: Record<string, Set<string>>,
    excludeField?: string
  ): string {
    const parts: string[] = [];
    for (const [field, values] of Object.entries(selections)) {
      if (field === excludeField || values.size === 0) continue;
      if (values.size === 1) {
        parts.push(`${field}:eq:${[...values][0]}`);
      } else {
        parts.push(`${field}:in:${[...values].join('|')}`);
      }
    }
    return parts.join(', ');
  }

  // =========================================================================
  // parseAggregates
  // =========================================================================

  parseAggregates(aggExpr: string): QueryAggregate[] {
    return aggExpr.split(',').map(part => {
      const [field, func, alias] = part.trim().split(':');
      return {
        field,
        function: func as QueryAggregate['function'],
        alias: alias || `${func}_${field}`,
      };
    });
  }

  // =========================================================================
  // Introspection : columns + tables (Etape 3)
  // =========================================================================

  /**
   * Recupere les metadonnees des colonnes d'une table Grist.
   * GET /api/docs/{docId}/tables/{tableId}/columns
   */
  async fetchColumns(
    params: AdapterParams,
    signal?: AbortSignal
  ): Promise<GristColumn[]> {
    const url = getProxiedUrl(params.baseUrl.replace(/\/records.*$/, '/columns'));
    try {
      const response = await fetch(url, buildFetchOptions(params, signal));
      if (!response.ok) return [];

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
  async fetchTables(
    params: AdapterParams,
    signal?: AbortSignal
  ): Promise<GristTable[]> {
    const url = getProxiedUrl(params.baseUrl.replace(/\/tables\/[^/]+\/records.*$/, '/tables'));
    try {
      const response = await fetch(url, buildFetchOptions(params, signal));
      if (!response.ok) return [];

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
    const parts = where.split(',').map(p => p.trim()).filter(Boolean);

    for (const part of parts) {
      const [field, op, ...rest] = part.split(':');
      const value = rest.join(':');

      if (op === 'eq') {
        filter[field] = [value];
      } else if (op === 'in') {
        filter[field] = value.split('|');
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
    return orderBy.split(',').map(part => {
      const [field, dir] = part.trim().split(':');
      return dir === 'desc' ? `-${field}` : field;
    }).join(',');
  }

  /** Aplatir records[].fields en objets plats */
  private _flattenRecords(records: unknown[]): Record<string, unknown>[] {
    return records.map((r: unknown) => {
      const rec = r as Record<string, unknown>;
      const fields = rec.fields as Record<string, unknown> | undefined;
      return fields ? { ...fields } : rec as Record<string, unknown>;
    });
  }

  // =========================================================================
  // Mode SQL : detection
  // =========================================================================

  /**
   * Determine si la requete necessite le mode SQL.
   * SQL est active quand group-by, aggregate ou operateurs avances sont demandes.
   */
  private _needsSqlMode(params: AdapterParams, overlay?: ServerSideOverlay): boolean {
    if (params.groupBy || params.aggregate) return true;

    const where = this._mergeWhere(params.where, overlay?.effectiveWhere);
    if (where && this._hasAdvancedOperators(where)) return true;

    return false;
  }

  private _hasAdvancedOperators(where: string): boolean {
    const advancedOps = ['gt', 'gte', 'lt', 'lte', 'contains', 'notcontains', 'neq', 'isnull', 'isnotnull', 'notin'];
    return where.split(',').some(part => {
      const segments = part.trim().split(':');
      return segments.length >= 2 && advancedOps.includes(segments[1]);
    });
  }

  private _mergeWhere(staticWhere?: string, overlayWhere?: string): string {
    if (overlayWhere && staticWhere) return `${staticWhere}, ${overlayWhere}`;
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
    const { select, groupBy, where, orderBy, limit, offset, args } =
      this._buildSqlQuery(params, overlay, table);

    const sql = [
      `SELECT ${select}`,
      `FROM ${this._escapeIdentifier(table)}`,
      where ? `WHERE ${where}` : '',
      groupBy ? `GROUP BY ${groupBy}` : '',
      orderBy ? `ORDER BY ${orderBy}` : '',
      limit ? `LIMIT ${limit}` : '',
      offset ? `OFFSET ${offset}` : '',
    ].filter(Boolean).join(' ');

    const sqlUrl = getProxiedUrl(this._getSqlEndpointUrl(params));
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
      // Fallback : si SQL indisponible, revenir au mode Records
      if (response.status === 404 || response.status === 403) {
        console.warn('[dsfr-data] Grist SQL endpoint not available, falling back to client-side processing');
        this._sqlAvailableByHost.set(this._extractHostname(params.baseUrl), false);
        return this._fetchAllRecords(params, signal);
      }
      throw new Error(`Grist SQL HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    const data = this._sqlResultToObjects(json);

    return {
      data,
      totalCount: data.length,
      needsClientProcessing: false,
    };
  }

  /** Fetch Records mode (internal fallback) */
  private async _fetchAllRecords(params: AdapterParams, signal: AbortSignal): Promise<FetchResult> {
    const url = getProxiedUrl(this.buildUrl(params));
    const response = await fetch(url, buildFetchOptions(params, signal));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const json = await response.json();
    const data = this._flattenRecords(json.records || []);

    return {
      data,
      totalCount: data.length,
      needsClientProcessing: true,
    };
  }

  // =========================================================================
  // Mode SQL : construction de requete
  // =========================================================================

  private _buildSqlQuery(params: AdapterParams, overlay: ServerSideOverlay | undefined, _table: string): SqlQuery {
    const args: (string | number)[] = [];
    let select = '*';
    let groupBy = '';
    let where = '';
    let orderBy = '';
    let limit = '';
    let offset = '';

    // SELECT + GROUP BY + AGGREGATE
    if (params.groupBy) {
      const groupFields = params.groupBy.split(',').map(f => this._escapeIdentifier(f.trim()));
      groupBy = groupFields.join(', ');

      if (params.aggregate) {
        const aggParts = this.parseAggregates(params.aggregate);
        const selectParts = [
          ...groupFields,
          ...aggParts.map(a =>
            `${a.function.toUpperCase()}(${this._escapeIdentifier(a.field)}) as ${this._escapeIdentifier(a.alias || `${a.function}_${a.field}`)}`
          ),
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

    // ORDER BY
    const sort = overlay?.orderBy || params.orderBy;
    if (sort) {
      orderBy = sort.split(',').map(part => {
        const [field, dir] = part.trim().split(':');
        return `${this._escapeIdentifier(field)} ${dir === 'desc' ? 'DESC' : 'ASC'}`;
      }).join(', ');
    }

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

  // =========================================================================
  // Mode SQL : conversion WHERE colon → SQL parametre
  // =========================================================================

  /**
   * Convertit une clause WHERE colon-syntax en SQL parametre.
   * Tous les operateurs sont supportes.
   */
  _colonWhereToSql(where: string, args: (string | number)[]): string {
    const clauses: string[] = [];
    const parts = where.split(',').map(p => p.trim()).filter(Boolean);

    for (const part of parts) {
      const [field, op, ...rest] = part.split(':');
      const value = rest.join(':');
      const col = this._escapeIdentifier(field);

      switch (op) {
        case 'eq':
          clauses.push(`${col} = ?`);
          args.push(value);
          break;
        case 'neq':
          clauses.push(`${col} != ?`);
          args.push(value);
          break;
        case 'gt':
          clauses.push(`${col} > ?`);
          args.push(this._toNumberOrString(value));
          break;
        case 'gte':
          clauses.push(`${col} >= ?`);
          args.push(this._toNumberOrString(value));
          break;
        case 'lt':
          clauses.push(`${col} < ?`);
          args.push(this._toNumberOrString(value));
          break;
        case 'lte':
          clauses.push(`${col} <= ?`);
          args.push(this._toNumberOrString(value));
          break;
        case 'contains':
          clauses.push(`${col} LIKE ?`);
          args.push(`%${value}%`);
          break;
        case 'notcontains':
          clauses.push(`${col} NOT LIKE ?`);
          args.push(`%${value}%`);
          break;
        case 'in': {
          const vals = value.split('|');
          clauses.push(`${col} IN (${vals.map(() => '?').join(',')})`);
          args.push(...vals);
          break;
        }
        case 'notin': {
          const vals = value.split('|');
          clauses.push(`${col} NOT IN (${vals.map(() => '?').join(',')})`);
          args.push(...vals);
          break;
        }
        case 'isnull':
          clauses.push(`${col} IS NULL`);
          break;
        case 'isnotnull':
          clauses.push(`${col} IS NOT NULL`);
          break;
      }
    }

    return clauses.join(' AND ');
  }

  // =========================================================================
  // Mode SQL : parsing reponse
  // =========================================================================

  /**
   * Convertit le format reponse SQL Grist en tableau d'objets.
   * Input:  { records: [[v1, v2], [v3, v4]], columns: ["col1", "col2"] }
   * Output: [{ col1: v1, col2: v2 }, { col1: v3, col2: v4 }]
   */
  _sqlResultToObjects(json: { records?: unknown[][]; columns?: string[] }): Record<string, unknown>[] {
    const { records = [], columns = [] } = json;
    return records.map(row => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
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

  private async _checkSqlAvailability(params: Pick<AdapterParams, 'baseUrl' | 'headers'>): Promise<boolean> {
    const hostname = this._extractHostname(params.baseUrl);
    const cached = this._sqlAvailableByHost.get(hostname);
    if (cached !== undefined) return cached;

    try {
      const sqlUrl = getProxiedUrl(this._getSqlEndpointUrl(params));
      const response = await fetch(sqlUrl + '?q=SELECT%201', {
        method: 'GET',
        headers: (params.headers || {}) as Record<string, string>,
        signal: AbortSignal.timeout(2000),
      });
      const available = response.ok;
      this._sqlAvailableByHost.set(hostname, available);
      if (!available) {
        console.info(`[dsfr-data] Grist SQL endpoint not available on ${hostname} — using client-side processing`);
      }
      return available;
    } catch {
      this._sqlAvailableByHost.set(hostname, false);
      console.info(`[dsfr-data] Grist SQL endpoint not available on ${hostname} — using client-side processing`);
      return false;
    }
  }

  private _extractHostname(url: string): string {
    try { return new URL(url).hostname; } catch { return url; }
  }
}
