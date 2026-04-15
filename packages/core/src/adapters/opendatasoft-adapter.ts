/**
 * Adapter pour l'API OpenDataSoft (ODS).
 *
 * Gere : construction d'URL ODSQL, pagination offset, parsing results/total_count,
 * facettes serveur (/facets endpoint), search template.
 */

import type {
  ApiAdapter,
  AdapterCapabilities,
  AdapterParams,
  FetchResult,
  ServerSideOverlay,
  FacetResult,
} from './api-adapter.js';
import type { QueryAggregate } from '../components/dsfr-data-query.js';
import type { ProviderConfig } from '@dsfr-data/shared';
import { ODS_CONFIG, getProxiedUrl } from '@dsfr-data/shared';

/**
 * Échappe une chaîne destinée à être interpolée dans une string ODSQL (`"…"`).
 * Ordre crucial : backslashes d'abord (sinon les `\"` qu'on ajoute seraient
 * ré-échappés), puis les doubles quotes.
 */
function escapeOdsqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

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

/** Nombre max de records par requete ODS */
const ODS_PAGE_SIZE = 100;

/** Nombre max de pages a fetcher (limite de securite : 1 000 records) */
const ODS_MAX_PAGES = 10;

export class OpenDataSoftAdapter implements ApiAdapter {
  readonly type = 'opendatasoft';

  readonly capabilities: AdapterCapabilities = {
    serverFetch: true,
    serverFacets: true,
    serverSearch: true,
    serverGroupBy: true,
    serverOrderBy: true,
    serverGeo: true,
    whereFormat: 'odsql',
  };

  validate(params: AdapterParams): string | null {
    if (!params.datasetId) {
      return 'attribut "dataset-id" requis pour les requetes OpenDataSoft';
    }
    return null;
  }

  /**
   * Fetch toutes les donnees avec pagination automatique via offset.
   * ODS limite a 100 records par requete.
   *
   * - limit > 0 : fetch exactement ce nombre de records
   * - limit = 0 : fetch TOUS les records disponibles (via total_count)
   */
  async fetchAll(params: AdapterParams, signal: AbortSignal): Promise<FetchResult> {
    const fetchAllRecords = params.limit <= 0;
    const requestedLimit = fetchAllRecords ? ODS_MAX_PAGES * ODS_PAGE_SIZE : params.limit;
    const pageSize = ODS_PAGE_SIZE;
    let allResults: unknown[] = [];
    let offset = 0;
    let totalCount = -1;

    for (let page = 0; page < ODS_MAX_PAGES; page++) {
      const remaining = requestedLimit - allResults.length;
      if (remaining <= 0) break;

      const url = getProxiedUrl(this.buildUrl(params, Math.min(pageSize, remaining), offset));

      const response = await fetch(url, buildFetchOptions(params, signal));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      const pageResults = json.results || [];
      allResults = allResults.concat(pageResults);

      if (typeof json.total_count === 'number') {
        totalCount = json.total_count;
      }

      if ((totalCount >= 0 && allResults.length >= totalCount) || pageResults.length < pageSize) {
        break;
      }

      offset += pageResults.length;
    }

    // Avertir si pagination incomplete
    if (totalCount >= 0 && allResults.length < totalCount && allResults.length < requestedLimit) {
      console.warn(
        `dsfr-data-query: pagination incomplete - ${allResults.length}/${totalCount} resultats recuperes ` +
          `(limite de securite: ${ODS_MAX_PAGES} pages de ${ODS_PAGE_SIZE})`
      );
    }

    return {
      data: allResults,
      totalCount: totalCount >= 0 ? totalCount : allResults.length,
      needsClientProcessing: false,
    };
  }

  /**
   * Fetch une seule page en mode server-side.
   */
  async fetchPage(
    params: AdapterParams,
    overlay: ServerSideOverlay,
    signal: AbortSignal
  ): Promise<FetchResult> {
    const url = getProxiedUrl(this.buildServerSideUrl(params, overlay));

    const response = await fetch(url, buildFetchOptions(params, signal));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    const data = json.results || [];
    const totalCount = typeof json.total_count === 'number' ? json.total_count : 0;

    return {
      data,
      totalCount,
      needsClientProcessing: false,
      rawJson: json,
    };
  }

  /**
   * Construit une URL ODS pour le fetch complet (avec pagination).
   * limitOverride et pageOrOffsetOverride controlent la pagination per-page.
   */
  buildUrl(params: AdapterParams, limitOverride?: number, pageOrOffsetOverride?: number): string {
    const base = params.baseUrl || 'https://data.opendatasoft.com';
    const url = new URL(`${base}/api/explore/v2.1/catalog/datasets/${params.datasetId}/records`);

    if (params.select) {
      url.searchParams.set('select', params.select);
    } else if (params.aggregate && params.groupBy) {
      url.searchParams.set('select', this._buildSelectFromAggregate(params));
    }

    const whereClause = params.where || params.filter;
    if (whereClause) {
      url.searchParams.set('where', whereClause);
    }

    if (params.groupBy) {
      url.searchParams.set('group_by', params.groupBy);
    }

    if (params.orderBy) {
      const sortExpr = params.orderBy.replace(
        /:(\w+)$/,
        (_, dir: string) => ` ${dir.toUpperCase()}`
      );
      url.searchParams.set('order_by', sortExpr);
    }

    if (limitOverride !== undefined) {
      url.searchParams.set('limit', String(limitOverride));
    } else if (params.limit > 0) {
      url.searchParams.set('limit', String(Math.min(params.limit, ODS_PAGE_SIZE)));
    }

    if (pageOrOffsetOverride && pageOrOffsetOverride > 0) {
      url.searchParams.set('offset', String(pageOrOffsetOverride));
    }

    return url.toString();
  }

  /**
   * Construit l'URL ODS en mode server-side (une seule page).
   */
  buildServerSideUrl(params: AdapterParams, overlay: ServerSideOverlay): string {
    const base = params.baseUrl || 'https://data.opendatasoft.com';
    const url = new URL(`${base}/api/explore/v2.1/catalog/datasets/${params.datasetId}/records`);

    // SELECT
    if (params.select) {
      url.searchParams.set('select', params.select);
    } else if (params.aggregate && params.groupBy) {
      url.searchParams.set('select', this._buildSelectFromAggregate(params));
    }

    // WHERE: merge statique + dynamique
    if (overlay.effectiveWhere) {
      url.searchParams.set('where', overlay.effectiveWhere);
    }

    // GROUP BY
    if (params.groupBy) {
      url.searchParams.set('group_by', params.groupBy);
    }

    // ORDER BY: overlay prioritaire, fallback statique
    const effectiveOrderBy = overlay.orderBy;
    if (effectiveOrderBy) {
      const sortExpr = effectiveOrderBy.replace(
        /:(\w+)$/,
        (_, dir: string) => ` ${dir.toUpperCase()}`
      );
      url.searchParams.set('order_by', sortExpr);
    }

    // PAGINATION: une seule page
    url.searchParams.set('limit', String(params.pageSize));
    const offset = (overlay.page - 1) * params.pageSize;
    if (offset > 0) {
      url.searchParams.set('offset', String(offset));
    }

    return url.toString();
  }

  /**
   * Fetch les valeurs de facettes depuis l'endpoint ODS /facets.
   */
  async fetchFacets(
    params: Pick<AdapterParams, 'baseUrl' | 'datasetId' | 'headers'>,
    fields: string[],
    where: string,
    signal?: AbortSignal
  ): Promise<FacetResult[]> {
    const base = params.baseUrl || 'https://data.opendatasoft.com';
    const url = new URL(`${base}/api/explore/v2.1/catalog/datasets/${params.datasetId}/facets`);

    for (const f of fields) {
      url.searchParams.append('facet', f);
    }
    if (where) {
      url.searchParams.set('where', where);
    }

    const response = await fetch(getProxiedUrl(url.toString()), buildFetchOptions(params, signal));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    const results: FacetResult[] = [];

    for (const facetData of json.facets || []) {
      results.push({
        field: facetData.name,
        values: (facetData.facets || []).map((v: { value: string; count: number }) => ({
          value: v.value,
          count: v.count,
        })),
      });
    }

    return results;
  }

  getDefaultSearchTemplate(): string {
    return 'search("{q}")';
  }

  getProviderConfig(): ProviderConfig {
    return ODS_CONFIG;
  }

  buildFacetWhere(selections: Record<string, Set<string>>, excludeField?: string): string {
    const parts: string[] = [];
    for (const [field, values] of Object.entries(selections)) {
      if (field === excludeField || values.size === 0) continue;
      if (values.size === 1) {
        const val = escapeOdsqlString([...values][0]);
        parts.push(`${field} = "${val}"`);
      } else {
        const vals = [...values].map((v) => `"${escapeOdsqlString(v)}"`).join(', ');
        parts.push(`${field} IN (${vals})`);
      }
    }
    return parts.join(' AND ');
  }

  parseAggregates(aggExpr: string): QueryAggregate[] {
    if (!aggExpr) return [];
    const aggregates: QueryAggregate[] = [];
    const parts = aggExpr
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of parts) {
      const segments = part.split(':');
      if (segments.length >= 2) {
        aggregates.push({
          field: segments[0],
          function: segments[1] as QueryAggregate['function'],
          alias: segments[2],
        });
      }
    }
    return aggregates;
  }

  /**
   * Convertit aggregate="field:func" + group-by en syntaxe ODS select.
   */
  private _buildSelectFromAggregate(params: AdapterParams): string {
    const aggregates = this.parseAggregates(params.aggregate);
    const selectParts: string[] = [];

    for (const agg of aggregates) {
      const odsFunc = agg.function === 'count' ? 'count(*)' : `${agg.function}(${agg.field})`;
      const alias = agg.alias || `${agg.field}__${agg.function}`;
      selectParts.push(`${odsFunc} as ${alias}`);
    }

    const groupFields = params.groupBy
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    for (const gf of groupFields) {
      selectParts.push(gf);
    }

    return selectParts.join(', ');
  }
}
