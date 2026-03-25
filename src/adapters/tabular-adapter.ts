/**
 * Adapter pour l'API Tabular (data.gouv.fr).
 *
 * Gere : construction d'URL avec operateurs mappes, pagination page/links.next,
 * parsing data/meta.total, proxy CORS.
 */

import type {
  ApiAdapter, AdapterCapabilities, AdapterParams,
  FetchResult, ServerSideOverlay
} from './api-adapter.js';
import type { ProviderConfig } from '@dsfr-data/shared';
import { getProxyConfig, TABULAR_CONFIG } from '@dsfr-data/shared';

/** Construit les options fetch avec headers optionnels */
function buildFetchOptions(params: Pick<AdapterParams, 'headers'>, signal?: AbortSignal): RequestInit {
  const opts: RequestInit = {};
  if (signal) opts.signal = signal;
  if (params.headers && Object.keys(params.headers).length > 0) {
    opts.headers = params.headers;
  }
  return opts;
}

/** Nombre max de records par requete Tabular (API max = 50) */
const TABULAR_PAGE_SIZE = 50;

/** Nombre max de pages a fetcher (limite de securite : 50K records) */
const TABULAR_MAX_PAGES = 500;

export class TabularAdapter implements ApiAdapter {
  readonly type = 'tabular';

  readonly capabilities: AdapterCapabilities = {
    serverFetch: true,
    serverFacets: false,
    serverSearch: false,
    serverGroupBy: true,
    serverOrderBy: true,
    serverGeo: false,
    whereFormat: 'colon',
  };

  validate(params: AdapterParams): string | null {
    if (!params.resource) {
      return 'attribut "resource" requis pour les requetes Tabular';
    }
    return null;
  }

  /**
   * Fetch toutes les donnees avec pagination automatique via links.next.
   * Quand groupBy/aggregate sont presents, l'API Tabular les execute
   * cote serveur et retourne les donnees deja agregees (needsClientProcessing=false).
   */
  async fetchAll(params: AdapterParams, signal: AbortSignal): Promise<FetchResult> {
    const fetchAllRecords = params.limit <= 0;
    const requestedLimit = fetchAllRecords ? TABULAR_MAX_PAGES * TABULAR_PAGE_SIZE : params.limit;
    let allResults: unknown[] = [];
    let totalCount = -1;
    let currentPage = 1;

    for (let i = 0; i < TABULAR_MAX_PAGES; i++) {
      const remaining = requestedLimit - allResults.length;
      if (remaining <= 0) break;

      const url = this.buildUrl(params, TABULAR_PAGE_SIZE, currentPage);

      const response = await fetch(url, buildFetchOptions(params, signal));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      const pageResults = json.data || [];
      allResults = allResults.concat(pageResults);

      if (json.meta && typeof json.meta.total === 'number') {
        totalCount = json.meta.total;
      }

      // Page suivante via links.next
      let hasNext = false;
      if (json.links?.next) {
        try {
          const nextUrl = new URL(json.links.next, 'https://tabular-api.data.gouv.fr');
          const nextPage = Number(nextUrl.searchParams.get('page'));
          if (nextPage > 0) {
            currentPage = nextPage;
            hasNext = true;
          }
        } catch {
          // URL invalide, arreter la pagination
        }
      }

      if (
        !hasNext ||
        (totalCount >= 0 && allResults.length >= totalCount) ||
        pageResults.length < TABULAR_PAGE_SIZE
      ) {
        break;
      }
    }

    // Trim au limit demande
    if (!fetchAllRecords && allResults.length > requestedLimit) {
      allResults = allResults.slice(0, requestedLimit);
    }

    // Avertir si pagination incomplete
    if (totalCount >= 0 && allResults.length < totalCount && allResults.length < requestedLimit) {
      console.warn(
        `dsfr-data-query: pagination incomplete - ${allResults.length}/${totalCount} resultats recuperes ` +
        `(limite de securite: ${TABULAR_MAX_PAGES} pages de ${TABULAR_PAGE_SIZE})`
      );
    }

    // Quand l'API a execute groupBy/aggregate, les donnees sont deja traitees
    const serverHandled = !!(params.groupBy || params.aggregate);

    return {
      data: allResults,
      totalCount: totalCount >= 0 ? totalCount : allResults.length,
      needsClientProcessing: !serverHandled,
    };
  }

  /**
   * Fetch une seule page en mode server-side.
   */
  async fetchPage(params: AdapterParams, overlay: ServerSideOverlay, signal: AbortSignal): Promise<FetchResult> {
    const url = this.buildServerSideUrl(params, overlay);

    const response = await fetch(url, buildFetchOptions(params, signal));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    const data = json.data || [];
    const totalCount = json.meta?.total ?? 0;

    return {
      data,
      totalCount,
      needsClientProcessing: false,
      rawJson: json,
    };
  }

  /**
   * Construit une URL Tabular pour le fetch complet.
   */
  buildUrl(params: AdapterParams, pageSizeOverride?: number, pageOverride?: number): string {
    const base = this._getBaseUrl(params);
    const origin = typeof window !== 'undefined' && window.location.origin !== 'null'
      ? window.location.origin
      : undefined;
    const url = new URL(`${base}/api/resources/${params.resource}/data/`, origin);

    // Filtres (format: "field:operator:value")
    const filterExpr = params.filter || params.where;
    if (filterExpr) {
      this._applyColonFilters(url, filterExpr);
    }

    // Group by
    if (params.groupBy) {
      const groupFields = params.groupBy.split(',').map(f => f.trim());
      for (const field of groupFields) {
        url.searchParams.append(`${field}__groupby`, '');
      }
    }

    // Agregations
    if (params.aggregate) {
      const aggregates = params.aggregate.split(',').map(a => a.trim());
      for (const agg of aggregates) {
        const parts = agg.split(':');
        if (parts.length >= 2) {
          const field = parts[0];
          const func = parts[1];
          url.searchParams.append(`${field}__${func}`, '');
        }
      }
    }

    // Tri
    if (params.orderBy) {
      const parts = params.orderBy.split(':');
      const field = parts[0];
      const direction = parts[1] || 'asc';
      url.searchParams.set(`${field}__sort`, direction);
    }

    // Pagination
    if (pageSizeOverride) {
      url.searchParams.set('page_size', String(pageSizeOverride));
    } else if (params.limit > 0) {
      url.searchParams.set('page_size', String(params.limit));
    }

    if (pageOverride) {
      url.searchParams.set('page', String(pageOverride));
    }

    return url.toString();
  }

  /**
   * Construit l'URL Tabular en mode server-side (une seule page).
   */
  buildServerSideUrl(params: AdapterParams, overlay: ServerSideOverlay): string {
    const base = this._getBaseUrl(params);
    const origin = typeof window !== 'undefined' && window.location.origin !== 'null'
      ? window.location.origin
      : undefined;
    const url = new URL(`${base}/api/resources/${params.resource}/data/`, origin);

    // Filtres : effectiveWhere (statique + dynamique fusionne) ou fallback statique
    const filterExpr = overlay.effectiveWhere || params.filter || params.where;
    if (filterExpr) {
      this._applyColonFilters(url, filterExpr);
    }

    // ORDER BY: overlay prioritaire, fallback statique
    const effectiveOrderBy = overlay.orderBy;
    if (effectiveOrderBy) {
      const parts = effectiveOrderBy.split(':');
      const field = parts[0];
      const direction = parts[1] || 'asc';
      url.searchParams.set(`${field}__sort`, direction);
    }

    // PAGINATION: une seule page
    url.searchParams.set('page_size', String(params.pageSize));
    url.searchParams.set('page', String(overlay.page));

    return url.toString();
  }

  /**
   * Applique des filtres colon-syntax (field:op:value, ...) comme query params.
   */
  private _applyColonFilters(url: URL, filterExpr: string): void {
    const filters = filterExpr.split(',').map(f => f.trim());
    for (const filter of filters) {
      const parts = filter.split(':');
      if (parts.length >= 3) {
        const field = parts[0];
        const op = this._mapOperator(parts[1]);
        const value = parts.slice(2).join(':');
        url.searchParams.set(`${field}__${op}`, value);
      }
    }
  }

  /**
   * Mappe les operateurs generiques vers la syntaxe Tabular.
   */
  private _mapOperator(op: string): string {
    const mapping: Record<string, string> = {
      'eq': 'exact',
      'neq': 'differs',
      'gt': 'strictly_greater',
      'gte': 'greater',
      'lt': 'strictly_less',
      'lte': 'less',
      'contains': 'contains',
      'notcontains': 'notcontains',
      'in': 'in',
      'notin': 'notin',
      'isnull': 'isnull',
      'isnotnull': 'isnotnull',
    };
    return mapping[op] || op;
  }

  getDefaultSearchTemplate(): null {
    return null;
  }

  getProviderConfig(): ProviderConfig {
    return TABULAR_CONFIG;
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

  /**
   * Determine le base URL, avec fallback sur le proxy CORS.
   */
  private _getBaseUrl(params: AdapterParams): string {
    if (params.baseUrl) {
      return params.baseUrl;
    }
    const config = getProxyConfig();
    return `${config.baseUrl}${config.endpoints.tabular}`;
  }
}
