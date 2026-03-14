/**
 * Adapter pour l'API INSEE Melodi.
 *
 * Gere : construction d'URL avec filtres dimension, pagination page-based,
 * aplatissement des observations (dimensions + measures + attributes).
 *
 * L'API ne supporte ni tri, ni agregation, ni group-by, ni facettes,
 * ni recherche cote serveur. Tout traitement avance est client-side.
 */

import type {
  ApiAdapter, AdapterCapabilities, AdapterParams,
  FetchResult, ServerSideOverlay
} from './api-adapter.js';
import type { ProviderConfig } from '@dsfr-data/shared';
import { INSEE_CONFIG } from '@dsfr-data/shared';

/** Default base URL for the Melodi API */
const INSEE_BASE_URL = 'https://api.insee.fr/melodi';

/** Records per page (API supports up to 100 000 in one shot) */
const INSEE_PAGE_SIZE = 1000;

/** Maximum pages to fetch (safety limit: 100 000 records) */
const INSEE_MAX_PAGES = 100;

/** Constructs fetch options with optional headers */
function buildFetchOptions(params: Pick<AdapterParams, 'headers'>, signal?: AbortSignal): RequestInit {
  const opts: RequestInit = {};
  if (signal) opts.signal = signal;
  if (params.headers && Object.keys(params.headers).length > 0) {
    opts.headers = params.headers;
  }
  return opts;
}

export class InseeAdapter implements ApiAdapter {
  readonly type = 'insee';

  readonly capabilities: AdapterCapabilities = {
    serverFetch: true,
    serverFacets: false,
    serverSearch: false,
    serverGroupBy: false,
    serverOrderBy: false,
    whereFormat: 'colon',
  };

  validate(params: AdapterParams): string | null {
    if (!params.datasetId) {
      return 'attribut "dataset-id" requis pour les requetes INSEE Melodi';
    }
    return null;
  }

  /**
   * Fetch all data with automatic page-based pagination.
   *
   * INSEE Melodi uses `page=N` (1-based) and `maxResult=N` for pagination.
   * The `paging.count` field gives total records, `paging.isLast` signals the last page.
   */
  async fetchAll(params: AdapterParams, signal: AbortSignal): Promise<FetchResult> {
    const pageSize = params.pageSize > 0 ? params.pageSize : INSEE_PAGE_SIZE;
    const fetchAllRecords = params.limit <= 0;
    const requestedLimit = fetchAllRecords ? INSEE_MAX_PAGES * pageSize : params.limit;

    let allResults: unknown[] = [];
    let totalCount = -1;

    for (let page = 1; page <= INSEE_MAX_PAGES; page++) {
      const remaining = requestedLimit - allResults.length;
      if (remaining <= 0) break;

      const effectivePageSize = Math.min(pageSize, remaining);
      const url = this.buildUrl(params, effectivePageSize, page);

      const response = await fetch(url, buildFetchOptions(params, signal));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      const observations = json.observations || [];
      const flat = this._flattenObservations(observations);
      allResults = allResults.concat(flat);

      // Extract total count from paging
      if (json.paging && typeof json.paging.count === 'number') {
        totalCount = json.paging.count;
      }

      // Stop conditions
      if (
        json.paging?.isLast === true ||
        (totalCount >= 0 && allResults.length >= totalCount) ||
        observations.length < effectivePageSize
      ) {
        break;
      }
    }

    if (totalCount >= 0 && allResults.length < totalCount && allResults.length < requestedLimit) {
      console.warn(
        `dsfr-data-source[insee]: pagination incomplete - ${allResults.length}/${totalCount} resultats ` +
        `(limite: ${INSEE_MAX_PAGES} pages de ${pageSize})`
      );
    }

    return {
      data: allResults,
      totalCount: totalCount >= 0 ? totalCount : allResults.length,
      needsClientProcessing: true, // all processing is client-side
    };
  }

  /**
   * Fetch a single page in server-side pagination mode.
   */
  async fetchPage(params: AdapterParams, overlay: ServerSideOverlay, signal: AbortSignal): Promise<FetchResult> {
    const url = this.buildServerSideUrl(params, overlay);

    const response = await fetch(url, buildFetchOptions(params, signal));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    const observations = json.observations || [];
    const data = this._flattenObservations(observations);
    const totalCount = json.paging?.count ?? 0;

    return {
      data,
      totalCount,
      needsClientProcessing: true,
      rawJson: json,
    };
  }

  /**
   * Build a full-fetch URL for INSEE Melodi.
   *
   * URL pattern: https://api.insee.fr/melodi/data/{datasetId}?maxResult=N&page=P&totalCount=TRUE&DIM=VAL
   *
   * Colon-syntax `where` is converted to dimension query params:
   * "TIME_PERIOD:eq:2023, GEO:eq:FRANCE-F" → &TIME_PERIOD=2023&GEO=FRANCE-F
   */
  buildUrl(params: AdapterParams, limitOverride?: number, pageOrOffsetOverride?: number): string {
    const base = params.baseUrl || INSEE_BASE_URL;
    const url = new URL(`${base}/data/${params.datasetId}`);

    // Page size
    const pageSize = limitOverride ?? (params.limit > 0 ? params.limit : INSEE_PAGE_SIZE);
    url.searchParams.set('maxResult', String(pageSize));

    // Always request total count
    url.searchParams.set('totalCount', 'TRUE');

    // Page number (1-based)
    if (pageOrOffsetOverride && pageOrOffsetOverride > 0) {
      url.searchParams.set('page', String(pageOrOffsetOverride));
    }

    // Convert colon-syntax where to dimension query params
    const whereClause = params.where || params.filter;
    if (whereClause) {
      this._applyDimensionFilters(url, whereClause);
    }

    return url.toString();
  }

  /**
   * Build a server-side URL for a single page.
   */
  buildServerSideUrl(params: AdapterParams, overlay: ServerSideOverlay): string {
    const base = params.baseUrl || INSEE_BASE_URL;
    const url = new URL(`${base}/data/${params.datasetId}`);

    url.searchParams.set('maxResult', String(params.pageSize));
    url.searchParams.set('totalCount', 'TRUE');
    url.searchParams.set('page', String(overlay.page));

    // Apply filters from overlay (static + dynamic merged)
    if (overlay.effectiveWhere) {
      this._applyDimensionFilters(url, overlay.effectiveWhere);
    }

    return url.toString();
  }

  getDefaultSearchTemplate(): null {
    return null;
  }

  getProviderConfig(): ProviderConfig {
    return INSEE_CONFIG;
  }

  buildFacetWhere(
    selections: Record<string, Set<string>>,
    excludeField?: string
  ): string {
    // Colon syntax fallback (same as GenericAdapter)
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Flatten INSEE observations into flat objects.
   *
   * Input:  { dimensions: {GEO: "...", FREQ: "A"}, measures: {OBS_VALUE_NIVEAU: {value: 123}}, attributes: {OBS_STATUS: "A"} }
   * Output: { GEO: "...", FREQ: "A", OBS_VALUE: 123, OBS_STATUS: "A" }
   */
  private _flattenObservations(observations: unknown[]): Record<string, unknown>[] {
    return observations.map((obs: unknown) => {
      const o = obs as Record<string, unknown>;
      const flat: Record<string, unknown> = {};

      // Flatten dimensions
      const dims = o.dimensions as Record<string, unknown> | undefined;
      if (dims) {
        for (const [key, value] of Object.entries(dims)) {
          flat[key] = value;
        }
      }

      // Flatten measures: extract OBS_VALUE_NIVEAU.value as OBS_VALUE
      const measures = o.measures as Record<string, unknown> | undefined;
      if (measures) {
        for (const [measureKey, measureObj] of Object.entries(measures)) {
          const mObj = measureObj as Record<string, unknown> | null;
          if (mObj && 'value' in mObj) {
            // OBS_VALUE_NIVEAU → OBS_VALUE (strip _NIVEAU suffix)
            const flatKey = measureKey.replace(/_NIVEAU$/, '');
            flat[flatKey] = mObj.value;
          }
        }
      }

      // Flatten attributes (optional, present on some datasets)
      const attrs = o.attributes as Record<string, unknown> | undefined;
      if (attrs) {
        for (const [key, value] of Object.entries(attrs)) {
          flat[key] = value;
        }
      }

      return flat;
    });
  }

  /**
   * Convert colon-syntax where clause to INSEE dimension query params.
   *
   * "TIME_PERIOD:eq:2023, GEO:eq:FRANCE-F" → url.searchParams.append('TIME_PERIOD', '2023') + url.searchParams.append('GEO', 'FRANCE-F')
   *
   * For multi-value (in operator): "GEO:in:FRANCE-F|FRANCE-M" → append GEO=FRANCE-F and GEO=FRANCE-M
   *
   * INSEE only supports equality filtering via query params,
   * so only `eq` and `in` operators are mapped. Others are ignored
   * (client-side dsfr-data-query handles advanced filtering).
   */
  private _applyDimensionFilters(url: URL, whereClause: string): void {
    const parts = whereClause.split(',').map(p => p.trim()).filter(Boolean);

    for (const part of parts) {
      const segments = part.split(':');
      if (segments.length < 3) {
        // Simple DIMENSION=VALUE format (no operator)
        if (segments.length === 2) {
          url.searchParams.append(segments[0], segments[1]);
        }
        continue;
      }

      const [field, operator, ...valueParts] = segments;
      const value = valueParts.join(':'); // rejoin in case value contained ':'

      switch (operator) {
        case 'eq':
          url.searchParams.append(field, value);
          break;
        case 'in': {
          // Multi-value: "GEO:in:FRANCE-F|FRANCE-M" → append each value
          const values = value.split('|');
          for (const v of values) {
            url.searchParams.append(field, v);
          }
          break;
        }
        // Other operators (gt, lt, contains, etc.) are not supported by INSEE API
        // They will be handled client-side by dsfr-data-query
        default:
          break;
      }
    }
  }
}
