/**
 * Adapter pour l'API Tabular (data.gouv.fr).
 *
 * Gere : construction d'URL avec operateurs mappes, pagination page/links.next,
 * parsing data/meta.total, proxy CORS.
 */

import type {
  ApiAdapter,
  AdapterCapabilities,
  AdapterParams,
  FetchResult,
  ServerSideOverlay,
} from './api-adapter.js';
import type { ProviderConfig } from '@dsfr-data/shared/lib';
import { getProxyConfig, TABULAR_CONFIG } from '@dsfr-data/shared/lib';
import { parseAggregates } from '../utils/aggregates.js';
import { buildColonFacetWhere, unescapeColonValue, parseOrderBy } from '../utils/where.js';

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
 * Un nom de colonne est utilisable dans la syntaxe a suffixe Tabular
 * (`colonne__op`) seulement s'il ne contient que des lettres, chiffres et
 * underscores. Les espaces, tirets et parentheses (ex. "Date - Journee
 * gaziere", "Inventaire LNG (m3 LNG)") cassent le parser de l'API et
 * provoquent un "Malformed query". Les noms d'agregats post-traitement
 * (`population__sum`) restent valides (seulement lettres/chiffres/underscores).
 */
function isTabularServerFieldSafe(field: string): boolean {
  return /^[\p{L}\p{N}_]+$/u.test(field);
}

/** Nombre max de records par requête Tabular (API max = 50) */
const TABULAR_PAGE_SIZE = 50;

/** Nombre max de pages a fetcher (limite de securite : 500 x 50 = 25 000 records, #286) */
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
      return 'attribut "resource" requis pour les requêtes Tabular';
    }
    return null;
  }

  /**
   * Tabular delegue group-by/aggregate/order-by via une syntaxe a suffixe
   * (`colonne__op`) qui ne tolere pas les noms de colonnes avec espaces ou
   * ponctuation. On ne delegue cote serveur que si TOUS les champs sont "safe" ;
   * sinon dsfr-data-query agrege client-side (resultat identique, sur toutes
   * les lignes).
   */
  supportsServerFields(fields: string[]): boolean {
    return fields.every((f) => isTabularServerFieldSafe(f));
  }

  /**
   * True si le group-by/aggregate de params est entierement delegable
   * (tous les champs surs pour la syntaxe a suffixe `colonne__op`, #289).
   */
  private _canServerProcessGroupBy(params: AdapterParams): boolean {
    if (!params.groupBy && !params.aggregate) return true;
    const fields = [
      ...(params.groupBy
        ? params.groupBy
            .split(',')
            .map((f) => f.trim())
            .filter(Boolean)
        : []),
      ...parseAggregates(params.aggregate || '').map((a) => a.field),
    ];
    return this.supportsServerFields(fields);
  }

  /**
   * Fetch toutes les données avec pagination automatique via links.next.
   * Quand groupBy/aggregate sont presents, l'API Tabular les execute
   * cote serveur et retourne les données déjà agregees (needsClientProcessing=false).
   */
  async fetchAll(params: AdapterParams, signal: AbortSignal): Promise<FetchResult> {
    const fetchAllRecords = params.limit <= 0;
    const requestedLimit = fetchAllRecords ? TABULAR_MAX_PAGES * TABULAR_PAGE_SIZE : params.limit;

    // Champs non delegables (#289) : prevenu une fois, lignes brutes +
    // needsClientProcessing — l'aval (query) retraite client-side
    const canServerProcess = this._canServerProcessGroupBy(params);
    if (!canServerProcess && (params.groupBy || params.aggregate)) {
      console.warn(
        `[dsfr-data] tabular: group-by/aggregate non delegables (champ avec espaces/ponctuation : ` +
          `"${params.groupBy || params.aggregate}") — lignes brutes renvoyees, traitement client requis`
      );
    }
    let allResults: unknown[] = [];
    let totalCount = -1;
    let currentPage = 1;

    for (let i = 0; i < TABULAR_MAX_PAGES; i++) {
      const remaining = requestedLimit - allResults.length;
      if (remaining <= 0) break;

      // Derniere page bornee a remaining : plus d'over-fetch de 50 (#289)
      const url = this.buildUrl(params, Math.min(TABULAR_PAGE_SIZE, remaining), currentPage);

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
        `[dsfr-data] tabular: pagination incomplete - ${allResults.length}/${totalCount} resultats recuperes ` +
          `(limite de securite: ${TABULAR_MAX_PAGES} pages de ${TABULAR_PAGE_SIZE})`
      );
    }

    // Quand l'API a reellement execute groupBy/aggregate, les données sont
    // déjà traitees — pas quand le garde-fou #289 a retire les parametres
    const serverHandled = !!(params.groupBy || params.aggregate) && canServerProcess;

    return {
      data: allResults,
      totalCount: totalCount >= 0 ? totalCount : allResults.length,
      needsClientProcessing: !serverHandled,
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
    const origin =
      typeof window !== 'undefined' && window.location.origin !== 'null'
        ? window.location.origin
        : undefined;
    const url = new URL(`${base}/api/resources/${params.resource}/data/`, origin);

    // Filtres (format: "field:operator:value")
    const filterExpr = params.filter || params.where;
    if (filterExpr) {
      this._applyColonFilters(url, filterExpr);
    }

    // Group by + agregations : seulement si TOUS les champs sont surs (#289).
    // Le garde-fou isTabularServerFieldSafe n'etait consulte que par la
    // delegation query (#275) — un group-by pose directement sur la source
    // (mode documente) avec un champ a espaces produisait le "Malformed
    // query" que la fonction pretend eviter. Champs non surs → lignes brutes
    // (needsClientProcessing signale par fetchAll).
    if (this._canServerProcessGroupBy(params)) {
      if (params.groupBy) {
        const groupFields = params.groupBy
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean);
        for (const field of groupFields) {
          url.searchParams.append(`${field}__groupby`, '');
        }
      }

      // Agrégations — l'API Tabular nomme la colonne retournee `field__func`,
      // ce qui correspond a la convention d'alias unique du pipeline (#269).
      // Les alias personnalises (3e segment) ne sont pas supportes server-side.
      if (params.aggregate) {
        for (const agg of parseAggregates(params.aggregate)) {
          url.searchParams.append(`${agg.field}__${agg.function}`, '');
        }
      }
    }

    // Tri
    if (params.orderBy) {
      // Grammaire commune "field:dir, field2:dir2" (#273) — le split(':')
      // global produisait un tri malforme en multi-champs
      for (const part of parseOrderBy(params.orderBy)) {
        url.searchParams.set(`${part.field}__sort`, part.direction);
      }
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
    const origin =
      typeof window !== 'undefined' && window.location.origin !== 'null'
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
      // Grammaire commune "field:dir, field2:dir2" (#273)
      for (const part of parseOrderBy(effectiveOrderBy)) {
        url.searchParams.set(`${part.field}__sort`, part.direction);
      }
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
    const filters = filterExpr.split(',').map((f) => f.trim());
    for (const filter of filters) {
      const parts = filter.split(':');
      if (parts.length >= 3) {
        const field = parts[0];
        const op = this._mapOperator(parts[1]);
        const raw = parts.slice(2).join(':');
        // in/notin : decoder chaque token apres decoupage sur |, puis
        // traduire vers la liste a virgules attendue par l'API Tabular (#273)
        const value =
          op === 'in' || op === 'notin'
            ? raw.split('|').map(unescapeColonValue).join(',')
            : unescapeColonValue(raw);
        // append : deux filtres meme champ+op sont AND-es comme Grist/ODS (#289)
        url.searchParams.append(`${field}__${op}`, value);
      }
    }
  }

  /**
   * Mappe les operateurs generiques vers la syntaxe Tabular.
   * Source de verite : TABULAR_CONFIG.query.operatorMapping (#285) —
   * l'adapter dupliquait le mapping mot pour mot.
   */
  private _mapOperator(op: string): string {
    return this.getProviderConfig().query.operatorMapping?.[op] || op;
  }

  getDefaultSearchTemplate(): string | null {
    return this.getProviderConfig().query.searchTemplate ?? null;
  }

  getProviderConfig(): ProviderConfig {
    return TABULAR_CONFIG;
  }

  buildFacetWhere(selections: Record<string, Set<string>>, excludeField?: string): string {
    return buildColonFacetWhere(selections, excludeField);
  }

  /**
   * Determine le base URL, avec fallback sur le proxy CORS.
   */
  private _getBaseUrl(params: AdapterParams): string {
    if (params.baseUrl) {
      return params.baseUrl;
    }
    const config = getProxyConfig();
    // Aucun proxy configuré : appel direct de l'API Tabular (CORS ouvert)
    if (config.mode === 'direct') {
      return TABULAR_CONFIG.defaultBaseUrl || 'https://tabular-api.data.gouv.fr';
    }
    return `${config.baseUrl}${config.endpoints.tabular}`;
  }
}
