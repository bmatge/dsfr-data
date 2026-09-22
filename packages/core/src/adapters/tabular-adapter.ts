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
import { getProxiedUrl, TABULAR_CONFIG } from '@dsfr-data/shared/lib';
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

/**
 * Concatene des flags nus (sans `=`) a la query string d'une URL.
 *
 * L'API Tabular exige `colonne__groupby` / `colonne__sum` et rejette la forme
 * valuee `colonne__groupby=` avec un 400 « Malformed query » (#596). Or
 * `URLSearchParams` emet toujours le `=`, meme pour une valeur vide : les
 * flags doivent donc etre assembles a la main, apres les parametres values.
 */
function appendBareFlags(url: URL, flags: string[]): string {
  const serialized = url.toString();
  if (flags.length === 0) return serialized;
  return `${serialized}${url.search ? '&' : '?'}${flags.join('&')}`;
}

/**
 * Nombre max de records par requête Tabular : 200, le maximum réel de l'API
 * (mesuré le 2026-09-22 : `page_size=201` rend une 400 « Page size exceeds
 * allowed maximum: 200 », sans en-tête CORS — illisible en navigateur, #1019).
 */
const TABULAR_PAGE_SIZE = 200;

/**
 * Nombre de pages par defaut (plafond de securite : 125 x 200 = 25 000 records,
 * #286, #1019) — relevable par l'attribut `max-records` de la source (#1027).
 */
const TABULAR_MAX_PAGES = 125;

export class TabularAdapter implements ApiAdapter {
  readonly type = 'tabular';

  /** Avertissement « page-size borne » deja emis (une fois par adaptateur). */
  private _pageSizeClampWarned = false;

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
   * L'API Tabular n'a pas de comptage distinct (#672) : `champ__distinct`
   * repondrait 400. La delegation est refusee, dsfr-data-query calcule
   * `distinct` client-side sur les lignes recues.
   */
  supportsServerAggregate(fn: string): boolean {
    return fn !== 'distinct';
  }

  /**
   * True si le group-by/aggregate de params est entierement delegable
   * (tous les champs surs pour la syntaxe a suffixe `colonne__op`, #289).
   */
  private _canServerProcessGroupBy(params: AdapterParams): boolean {
    if (!params.groupBy && !params.aggregate) return true;
    const aggregates = parseAggregates(params.aggregate || '');
    if (!aggregates.every((a) => this.supportsServerAggregate(a.function))) return false;
    const fields = [
      ...(params.groupBy
        ? params.groupBy
            .split(',')
            .map((f) => f.trim())
            .filter(Boolean)
        : []),
      ...aggregates.map((a) => a.field),
    ];
    return this.supportsServerFields(fields);
  }

  /**
   * Flags nus de delegation (`champ__groupby`, `champ__sum`) d'une requete.
   *
   * Partages par `buildUrl` et `buildServerSideUrl` (#852) : la pagination
   * serveur ne les emettait pas, alors que la query, voyant
   * `capabilities.serverGroupBy = true`, marquait `_serverDelegated.groupBy`
   * et sautait son calcul client — la page rendait des lignes BRUTES comme si
   * c'etaient des groupes (40 lignes pour 8 groupes attendus), et la colonne
   * d'agregat, absente de la reponse, s'affichait « — ». Un seul emetteur
   * pour les deux modes : ils ne peuvent plus diverger.
   *
   * Group by + agregations : seulement si TOUS les champs sont surs (#289).
   * Le garde-fou isTabularServerFieldSafe n'etait consulte que par la
   * delegation query (#275) — un group-by pose directement sur la source
   * (mode documente) avec un champ a espaces produisait le "Malformed
   * query" que la fonction pretend eviter. Champs non surs → lignes brutes
   * (needsClientProcessing signale par fetchAll / fetchPage).
   */
  private _groupByFlags(params: AdapterParams): string[] {
    const flags: string[] = [];
    if (!this._canServerProcessGroupBy(params)) return flags;

    if (params.groupBy) {
      const groupFields = params.groupBy
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean);
      for (const field of groupFields) {
        flags.push(`${encodeURIComponent(field)}__groupby`);
      }
    }

    // Agrégations — l'API Tabular nomme la colonne retournee `field__func`,
    // ce qui correspond a la convention d'alias unique du pipeline (#269).
    // Les alias personnalises (3e segment) ne sont pas supportes server-side.
    if (params.aggregate) {
      for (const agg of parseAggregates(params.aggregate)) {
        flags.push(`${encodeURIComponent(agg.field)}__${encodeURIComponent(agg.function)}`);
      }
    }

    return flags;
  }

  /**
   * Avertit une fois quand un group-by/aggregate demande n'est PAS delegable
   * (#289, #672) : les lignes brutes reviennent et l'aval retraite.
   * Rend `true` quand la delegation a bien eu lieu.
   */
  private _warnUndelegable(params: AdapterParams, canServerProcess: boolean): boolean {
    const asked = !!(params.groupBy || params.aggregate);
    if (!asked || canServerProcess) return asked;
    if (this._hasDistinct(params)) {
      console.warn(
        `[dsfr-data] tabular: "distinct" n'est pas délégable à l'API Tabular (aggregate="${params.aggregate}") — ` +
          `lignes brutes renvoyées, comptage distinct calculé côté client`
      );
    } else {
      console.warn(
        `[dsfr-data] tabular: group-by/aggregate non delegables (champ avec espaces/ponctuation : ` +
          `"${params.groupBy || params.aggregate}") — lignes brutes renvoyees, traitement client requis`
      );
    }
    return false;
  }

  /** True si l'expression d'agrégat contient un `distinct` (#672). */
  private _hasDistinct(params: AdapterParams): boolean {
    return parseAggregates(params.aggregate || '').some((a) => a.function === 'distinct');
  }

  /**
   * Fetch toutes les données avec pagination automatique via links.next.
   * Quand groupBy/aggregate sont presents, l'API Tabular les execute
   * cote serveur et retourne les données déjà agregees (needsClientProcessing=false).
   *
   * Plafond `max-records` (#1027, comme ODS #233) : 25 000 lignes par defaut
   * (`TABULAR_MAX_PAGES` pages de `TABULAR_PAGE_SIZE`), relevable par
   * l'auteur (`max-records="40000"` → 200 pages). Un `limit` explicite plus
   * petit reste prioritaire. Quand le plafond coupe alors qu'il reste des
   * pages, le resultat porte `truncated` (#658) — seul signal disponible sur
   * une requete group-by, dont l'API ne donne pas le total.
   */
  async fetchAll(params: AdapterParams, signal: AbortSignal): Promise<FetchResult> {
    const fetchAllRecords = params.limit <= 0;
    const maxRecords =
      params.maxRecords && params.maxRecords > 0
        ? params.maxRecords
        : TABULAR_MAX_PAGES * TABULAR_PAGE_SIZE;
    const maxPages = Math.ceil(maxRecords / TABULAR_PAGE_SIZE);
    const requestedLimit = fetchAllRecords ? maxRecords : Math.min(params.limit, maxRecords);

    // Champs non delegables (#289) : prevenu une fois, lignes brutes +
    // needsClientProcessing — l'aval (query) retraite client-side
    const canServerProcess = this._canServerProcessGroupBy(params);
    // Quand l'API a reellement execute groupBy/aggregate, les données sont
    // déjà traitees — pas quand le garde-fou #289 a retire les parametres
    const serverHandled = this._warnUndelegable(params, canServerProcess);
    const distinctRefused = !canServerProcess && this._hasDistinct(params);
    let allResults: unknown[] = [];
    let totalCount = -1;
    let currentPage = 1;
    // Il restait une page (links.next) quand la boucle s'est arretee
    let moreAvailable = false;

    for (let i = 0; i < maxPages; i++) {
      const remaining = requestedLimit - allResults.length;
      if (remaining <= 0) break;

      // La premiere page est bornee a remaining (#289) : un petit `limit` ne
      // coute qu'une petite requete. Les suivantes gardent la taille de la
      // premiere page pleine : l'API place une page a `(page - 1) × page_size`,
      // et une derniere page reduite (page=2, page_size=100) relirait les
      // lignes 100 a 199 au lieu de 200 a 299 (#1027). Le surplus eventuel
      // (moins d'une page) est retranche apres la boucle.
      const pageSize =
        currentPage === 1 ? Math.min(TABULAR_PAGE_SIZE, remaining) : TABULAR_PAGE_SIZE;
      const url = getProxiedUrl(this.buildUrl(params, pageSize, currentPage), params.proxyUrl);

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

      // Page pleine + page suivante annoncee + total non atteint : il reste
      // des lignes si la boucle s'arrete ici (plafond ou limit atteint)
      moreAvailable =
        hasNext &&
        pageResults.length >= pageSize &&
        !(totalCount >= 0 && allResults.length >= totalCount);
      if (!moreAvailable || pageResults.length < TABULAR_PAGE_SIZE) {
        break;
      }
    }

    // Trim au limit demande (surplus de la derniere page pleine)
    const overflow = allResults.length > requestedLimit;
    if (overflow) {
      allResults = allResults.slice(0, requestedLimit);
    }

    // Le plafond max-records (et non un limit plus petit) a coupe la
    // pagination alors qu'il restait des lignes : surplus retranche, total
    // connu superieur, ou page suivante annoncee quand le total est inconnu
    // (group-by).
    const capBinding = fetchAllRecords || params.limit >= maxRecords;
    const cappedWithMore =
      capBinding &&
      (overflow ||
        (allResults.length >= maxRecords &&
          (moreAvailable || (totalCount >= 0 && totalCount > allResults.length))));

    // Avertir si la recuperation est incomplete : short-read sous un limit
    // explicite (anomalie serveur) OU troncature par le plafond (qui ne
    // declenchait jamais le warn quand il etait atteint pile, comme ODS #233).
    // Un limit explicite atteint = troncature voulue, pas de warn.
    const incomplete =
      totalCount >= 0 &&
      allResults.length < totalCount &&
      (capBinding || allResults.length < requestedLimit);
    const plafond =
      `plafond max-records : ${maxRecords} lignes, ${maxPages} pages de ${TABULAR_PAGE_SIZE} ` +
      `— relevable via l'attribut max-records de dsfr-data-source, #1027`;
    if (incomplete) {
      console.warn(
        `[dsfr-data] tabular: pagination incomplete - ${allResults.length}/${totalCount} resultats recuperes ` +
          `(${plafond})`
      );
    } else if (cappedWithMore) {
      console.warn(
        `[dsfr-data] tabular: ${allResults.length} lignes recuperees, d'autres restent a charger ` +
          `(total inconnu ; ${plafond})`
      );
    }

    // `distinct` calculé côté client sur des lignes TRONQUÉES (limit,
    // plafond de pages) : le chiffre est partiel, comme `count` derrière un
    // limit (#659) — on le dit, avec le total annoncé par l'API.
    if (distinctRefused && totalCount > allResults.length) {
      console.warn(
        `[dsfr-data] tabular: "distinct" calculé sur ${allResults.length} lignes reçues ` +
          `alors que l'API en détient ${totalCount} (meta.total) — comptage distinct partiel ` +
          `(limit ou plafond max-records de ${maxRecords} lignes)`
      );
    }

    return {
      data: allResults,
      totalCount: totalCount >= 0 ? totalCount : allResults.length,
      needsClientProcessing: !serverHandled,
      ...(cappedWithMore ? { truncated: true } : {}),
    };
  }

  /**
   * Fetch une seule page en mode server-side.
   *
   * Le group-by/aggregate demande est delegue comme en fetch complet (#852) ;
   * quand il ne l'est pas (champ non sur, `distinct`), la page revient en
   * lignes brutes et `needsClientProcessing` le dit — l'aval retraite, au lieu
   * de prendre des lignes brutes pour des groupes.
   */
  async fetchPage(
    params: AdapterParams,
    overlay: ServerSideOverlay,
    signal: AbortSignal
  ): Promise<FetchResult> {
    const url = getProxiedUrl(this.buildServerSideUrl(params, overlay), params.proxyUrl);
    const asked = !!(params.groupBy || params.aggregate);
    const serverHandled = this._warnUndelegable(params, this._canServerProcessGroupBy(params));

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
      needsClientProcessing: asked && !serverHandled,
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

    // Flags nus : emis hors de `url.searchParams`, qui ajouterait un `=` que
    // l'API rejette (#596). L'ordre des parametres est indifferent cote API.
    const bareFlags = this._groupByFlags(params);

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

    return appendBareFlags(url, bareFlags);
  }

  /**
   * Construit l'URL Tabular en mode server-side (une seule page).
   *
   * Emet les MEMES parametres delegues que `buildUrl` (#852) : filtres,
   * `champ__groupby`, `champ__fonction`, `champ__sort`. La difference entre
   * les deux modes tient a la pagination (une page), au `where` effectif de
   * l'overlay et a son tri — pas a ce qui est delegue.
   */
  /**
   * Borne une taille de page demandee au maximum de l'API Tabular (200, #1019),
   * avec un `console.warn` unique : un `page-size="500"` produirait sinon une
   * 400 sans en-tete CORS, illisible dans le navigateur.
   */
  private _clampPageSize(pageSize: number): number {
    if (pageSize <= TABULAR_PAGE_SIZE) return pageSize;
    if (!this._pageSizeClampWarned) {
      this._pageSizeClampWarned = true;
      console.warn(
        `[dsfr-data] tabular: page-size="${pageSize}" dépasse le maximum de l'API ` +
          `(${TABULAR_PAGE_SIZE} lignes par page) — ramené à ${TABULAR_PAGE_SIZE}`
      );
    }
    return TABULAR_PAGE_SIZE;
  }

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

    // Flags nus de delegation (group-by + agregations), comme en fetch
    // complet : la query qui a delegue saute son calcul client, la reponse
    // doit donc porter des GROUPES et la colonne d'agregat (#852).
    const bareFlags = this._groupByFlags(params);

    // ORDER BY: overlay prioritaire, fallback statique
    const effectiveOrderBy = overlay.orderBy;
    if (effectiveOrderBy) {
      // Grammaire commune "field:dir, field2:dir2" (#273)
      for (const part of parseOrderBy(effectiveOrderBy)) {
        url.searchParams.set(`${part.field}__sort`, part.direction);
      }
    }

    // PAGINATION: une seule page, bornee au maximum de l'API (#1019) : au-dela,
    // Tabular rend une 400 sans en-tete CORS, que le navigateur rend muette.
    url.searchParams.set('page_size', String(this._clampPageSize(params.pageSize)));
    url.searchParams.set('page', String(overlay.page));

    return appendBareFlags(url, bareFlags);
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
   * Base URL de l'API CIBLE — jamais celle du proxy.
   *
   * Le proxy est applique au moment du fetch par `getProxiedUrl`, comme dans
   * les adapters grist / insee / ODS. Arbitrer le proxy ici rendait
   * `params.baseUrl` en priorite et court-circuitait toute reecriture : le
   * Builder emettant TOUJOURS `base-url`, les attributs `use-proxy` et
   * `proxy-url` etaient inertes sur ce provider (#597).
   */
  private _getBaseUrl(params: AdapterParams): string {
    return params.baseUrl || TABULAR_CONFIG.defaultBaseUrl || 'https://tabular-api.data.gouv.fr';
  }
}
