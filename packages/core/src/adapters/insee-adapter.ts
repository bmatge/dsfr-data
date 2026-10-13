/**
 * Adapter pour l'API INSEE Melodi.
 *
 * Gere : construction d'URL avec filtres dimension, pagination page-based,
 * aplatissement des observations (dimensions + measures + attributes).
 *
 * L'API ne supporte ni tri, ni agrégation, ni group-by, ni facettes,
 * ni recherche cote serveur. Tout traitement avance est client-side.
 *
 * PAGINATION SANS TRI (#1279). Melodi pagine par numero de page et n'offre
 * aucun parametre de tri : sa documentation n'en nomme pas, `sort=` et
 * `order_by=` rendent 400 (« La DSD ne possede pas le composant sort »), et
 * `orderBy=`, accepte, ne change rien a l'ordre (mesure le 2026-10-13). Rien
 * ne garantit donc qu'une observation ne revienne pas sur deux pages pendant
 * qu'une autre n'est jamais servie. Mesure le meme jour sur `DS_EC_DECES`
 * (1 678 observations) : l'ordre est arbitraire mais STABLE — 1 678 distinctes
 * sur 1 678, cinq passages, par pages de 1 000 comme de 200. L'adaptateur ne
 * peut pas imposer d'ordre ; il peut CONSTATER le defaut s'il survient : une
 * observation s'identifie par ses dimensions, et celle qui revient d'une page
 * a l'autre se compte (`_repeatedObservations`). Le chargement le dit alors
 * (console, reserve `repeated-rows`). Une seule page : aucun controle.
 */

import type {
  ApiAdapter,
  AdapterCapabilities,
  AdapterParams,
  FetchCaveat,
  FetchResult,
  ServerSideOverlay,
} from './api-adapter.js';
import type { ProviderConfig } from '@dsfr-data/shared/lib';
import {
  INSEE_CONFIG,
  resolveTransportUrl,
  transportFetch,
  flattenInseeObservation,
  fetchInseeLabelIndex,
  applyInseeLabels,
} from '@dsfr-data/shared/lib';
import { buildColonFacetWhere, unescapeColonValue, isMultiFieldClause } from '../utils/where.js';
import { httpError } from '../utils/http-error.js';

/** Default base URL for the Melodi API */
const INSEE_BASE_URL = 'https://api.insee.fr/melodi';

/** Records per page (API supports up to 100 000 in one shot) */
const INSEE_PAGE_SIZE = 1000;

/** Maximum pages to fetch (safety limit: 100 000 records) */
const INSEE_MAX_PAGES = 100;

/** Constructs fetch options with optional headers */
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

export class InseeAdapter implements ApiAdapter {
  readonly type = 'insee';

  readonly capabilities: AdapterCapabilities = {
    serverFetch: true,
    serverFacets: false,
    serverSearch: false,
    serverGroupBy: false,
    serverOrderBy: false,
    serverGeo: false,
    whereFormat: 'colon',
  };

  validate(params: AdapterParams): string | null {
    if (!params.datasetId) {
      return 'attribut "dataset-id" requis pour les requêtes INSEE Melodi';
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
    // Pages de 1000 TOUJOURS (#286) : params.pageSize (defaut 20 venant de
    // la source) ne concerne que la pagination serveur (fetchPage). L'utiliser
    // ici plafonnait fetchAll a INSEE_MAX_PAGES x 20 = 2000 records (au lieu
    // des 100 000 documentes) avec 50x plus de requetes — ODS et Tabular
    // ignorent params.pageSize en fetchAll, INSEE s'aligne.
    const pageSize = INSEE_PAGE_SIZE;
    const fetchAllRecords = params.limit <= 0;
    const requestedLimit = fetchAllRecords ? INSEE_MAX_PAGES * pageSize : params.limit;

    let allResults: unknown[] = [];
    let totalCount = -1;
    // Observations brutes, page par page : relues apres la boucle si le
    // chargement en a compte plus d'une (#1279)
    const pages: unknown[][] = [];

    for (let page = 1; page <= INSEE_MAX_PAGES; page++) {
      const remaining = requestedLimit - allResults.length;
      if (remaining <= 0) break;

      const effectivePageSize = Math.min(pageSize, remaining);
      const url = resolveTransportUrl(this.buildUrl(params, effectivePageSize, page), params);

      const response = await transportFetch(url, buildFetchOptions(params, signal), params);
      if (!response.ok) {
        throw httpError(response);
      }

      const json = await response.json();
      const observations = json.observations || [];
      const flat = this._flattenObservations(observations);
      allResults = allResults.concat(flat);
      pages.push(observations);

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

    // Plusieurs pages sans tri possible (#1279) : une observation revenue
    // d'une page a l'autre signe un ordre qui a bouge pendant le chargement
    // — autant d'autres n'ont jamais ete servies, et le compte reste juste.
    const repeated = pages.length > 1 ? this._repeatedObservations(pages) : 0;
    if (repeated > 0) {
      console.warn(
        `dsfr-data-source[insee]: ${repeated} observation(s) de "${params.datasetId}" sont revenues ` +
          `d'une page a l'autre sur ${pages.length} pages — l'API pagine sans tri et son ordre a change ` +
          `pendant le chargement : autant d'observations manquent, le nombre de lignes reste juste. ` +
          `Resserrer le filtre (where) pour tenir en une page de ${pageSize} observations, ou recharger.`
      );
    }

    return {
      data: await this._withLabels(allResults, params, signal),
      totalCount: totalCount >= 0 ? totalCount : allResults.length,
      needsClientProcessing: true, // all processing is client-side
      ...(repeated > 0 ? { caveats: ['repeated-rows'] as FetchCaveat[] } : {}),
    };
  }

  /**
   * Nombre d'observations deja vues sur une page PRECEDENTE (#1279).
   *
   * Une observation Melodi s'identifie par ses dimensions (la cle SDMX) : deux
   * observations d'un meme jeu n'ont jamais les memes. La meme cle sur deux
   * pages differentes est donc un fait, pas un indice — elle ne se produit
   * que si l'ordre des observations a change entre deux requetes. Une cle
   * repetee DANS une page n'est pas comptee : ce serait un defaut du jeu, pas
   * de la pagination. Une observation sans dimensions lisibles : controle
   * abandonne (0), plutot qu'une alerte sur une forme que l'adaptateur ne
   * connait pas.
   */
  private _repeatedObservations(pages: unknown[][]): number {
    const firstPage = new Map<string, number>();
    let repeated = 0;
    for (let i = 0; i < pages.length; i++) {
      for (const observation of pages[i]) {
        const dimensions = (observation as { dimensions?: unknown } | null)?.dimensions;
        if (!dimensions || typeof dimensions !== 'object') return 0;
        const entries = Object.entries(dimensions as Record<string, unknown>).sort((a, b) =>
          a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
        );
        const key = JSON.stringify(entries);
        const seenOn = firstPage.get(key);
        if (seenOn === undefined) firstPage.set(key, i);
        else if (seenOn !== i) repeated++;
      }
    }
    return repeated;
  }

  /**
   * Fetch a single page in server-side pagination mode.
   */
  async fetchPage(
    params: AdapterParams,
    overlay: ServerSideOverlay,
    signal: AbortSignal
  ): Promise<FetchResult> {
    const url = resolveTransportUrl(this.buildServerSideUrl(params, overlay), params);

    const response = await transportFetch(url, buildFetchOptions(params, signal), params);
    if (!response.ok) {
      throw httpError(response);
    }

    const json = await response.json();
    const observations = json.observations || [];
    const data = await this._withLabels(this._flattenObservations(observations), params, signal);
    const totalCount = json.paging?.count ?? 0;

    return {
      data,
      totalCount,
      // Aligne sur les autres adapters (#270) : true seulement si des
      // transformations demandees restent a appliquer. INSEE ne sait pas
      // faire de group-by/aggregate server-side.
      needsClientProcessing: !!(params.groupBy || params.aggregate),
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

  /**
   * Melodi ne filtre qu'en egalite sur des dimensions, jamais en OU entre deux
   * dimensions : une clause multi-champs (`a|b:op:v`, #1026) est refusee et
   * reste au filtre client de dsfr-data-query.
   */
  supportsServerWhere(where: string): boolean {
    return !where.split(',').some((clause) => isMultiFieldClause(clause.trim()));
  }

  getDefaultSearchTemplate(): null {
    return null;
  }

  getProviderConfig(): ProviderConfig {
    return INSEE_CONFIG;
  }

  buildFacetWhere(selections: Record<string, Set<string>>, excludeField?: string): string {
    return buildColonFacetWhere(selections, excludeField);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Flatten INSEE observations into flat objects.
   *
   * Input:  { dimensions: {GEO: "...", FREQ: "A"}, measures: {OBS_VALUE_NIVEAU: {value: 123}}, attributes: {OBS_STATUS: "A"} }
   * Output: { GEO: "...", FREQ: "A", OBS_VALUE: 123, OBS_STATUS: "A" }
   *
   * Delegue a `flattenInseeObservation` (`@dsfr-data/shared/lib`) : le chemin
   * connexion API applique exactement la meme fonction via
   * `INSEE_CONFIG.response.flattenRecord`, ce qui garantit des noms de colonnes
   * identiques quel que soit le chemin d'import (#586).
   */
  private _flattenObservations(observations: unknown[]): Record<string, unknown>[] {
    return observations.map(flattenInseeObservation);
  }

  /**
   * Traduit les codes SDMX en libelles (#592).
   *
   * Melodi ne renvoie que des codes (`AGE: "Y65T74"`) ; les libelles vivent sur
   * `/range/{datasetId}`, charge une fois par jeu puis mis en cache. L'appel
   * est fait ici, apres l'aplatissement et une seule fois par requete, pas par
   * page : le cache memoire de `fetchInseeLabelIndex` mutualise les pages d'un
   * meme `fetchAll`.
   *
   * Comme le chemin connexion applique exactement le meme index, les deux
   * routes d'import produisent les memes colonnes (#586).
   */
  private async _withLabels(
    records: unknown[],
    params: AdapterParams,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>[]> {
    const rows = records as Record<string, unknown>[];
    if (!params.datasetId || rows.length === 0) return rows;

    const index = await fetchInseeLabelIndex(params.datasetId, {
      baseUrl: params.baseUrl || INSEE_BASE_URL,
      toProxiedUrl: (url) => resolveTransportUrl(url, params),
      fetchImpl: (input, init) => transportFetch(String(input), init, params),
      signal,
    });

    return applyInseeLabels(rows, index);
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
    const parts = whereClause
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    for (const part of parts) {
      // Champs multiples (#1026) : Melodi ne sait pas relier deux dimensions
      // par un OU — la clause n'est jamais traduite (sinon `a|b` deviendrait
      // un parametre de dimension inconnu), et `supportsServerWhere` la laisse
      // a dsfr-data-query, qui la filtre cote client.
      if (isMultiFieldClause(part)) continue;
      const segments = part.split(':');
      if (segments.length < 3) {
        // Simple DIMENSION=VALUE format (no operator)
        if (segments.length === 2) {
          url.searchParams.append(segments[0], unescapeColonValue(segments[1]));
        }
        continue;
      }

      const [field, operator, ...valueParts] = segments;
      const value = valueParts.join(':'); // rejoin in case value contained ':'

      switch (operator) {
        case 'eq':
          url.searchParams.append(field, unescapeColonValue(value));
          break;
        case 'in': {
          // Multi-value: "GEO:in:FRANCE-F|FRANCE-M" → append each value
          const values = value.split('|').map(unescapeColonValue);
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
