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
import type { OrderByPart } from '../utils/where.js';
import { sortRows } from '../utils/sort.js';

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
 * Caracteres qu'un nom de colonne ne peut pas porter dans une delegation
 * Tabular : ce sont les separateurs de la grammaire colon (`utils/where.ts`)
 * — `,` entre les clauses, `:` entre champ, operateur et valeur, `|` entre
 * les valeurs d'une liste. Un nom qui en contient un ne survivrait pas au
 * decoupage d'un `where`, d'un `group-by` ou d'un `aggregate`.
 *
 * Tout le reste est delegable (#985) : le parseur de l'API accepte espaces,
 * accents et ponctuation, percent-encodes (mesure du 2026-09-22 :
 * `Libellé du département__groupby&Code sexe__count` → 200 ; `Foo - Bar`,
 * `Foo (m3)`, `Foo.Bar`, `Foo'Bar` → 42703 « column does not exist », donc
 * parses). L'ancien garde-fou (#244, #289) refusait tout nom hors
 * `[\p{L}\p{N}_]` et forcait un telechargement complet pour agreger cote
 * client — jusqu'a 25 000 lignes pour un resultat que l'API rend en une
 * requete.
 */
const TABULAR_RESERVED_FIELD_CHARS = /[,:|]/;

/**
 * Un element de `select` qui releve de la grammaire ODSQL (fonction, alias
 * `as`, `*`, identifiant backquote) et non d'un nom de colonne : Tabular n'a
 * pas d'expression, seulement une liste de colonnes (`columns=`, #985).
 * Une fonction se reconnait a sa parenthese COLLEE au nom (`count(*)`) : un
 * nom de colonne a parenthese en porte une espace avant (`Inventaire LNG
 * (m3 LNG)`).
 */
function isSelectExpression(item: string): boolean {
  return (
    item === '*' ||
    item.includes('`') ||
    /\sas\s/i.test(item) ||
    /^[\p{L}_][\p{L}\p{N}_.]*\(/u.test(item)
  );
}

/**
 * Reponse de `GET /api/resources/{id}/profile/` (#985), reduite a ce que la
 * bibliotheque sait lire. Mesure du 2026-09-22 : `application/json`, CORS `*`.
 *
 * - `columns[col].format` : format detecte (`latitude_wgs`, `longitude_wgs`,
 *   `date`, `int`, `float`, `sexe`, `code_departement`…), et
 *   `columns[col].python_type` (`int`, `float`, `string`, `date`…) ;
 * - `profile[col]` : `tops` (modalites les plus frequentes), `nb_distinct`,
 *   `nb_missing_values` ;
 * - `categorical` : colonnes a peu de modalites ;
 * - `total_lines` : nombre de lignes de la ressource.
 *
 * Les autres cles de l'API sont conservees telles quelles (index ouvert).
 */
export interface TabularProfile {
  columns?: Record<string, { format?: string; python_type?: string; score?: number }>;
  profile?: Record<
    string,
    {
      tops?: Array<{ value: unknown; count: number }> | unknown[];
      nb_distinct?: number;
      nb_missing_values?: number;
      [key: string]: unknown;
    }
  >;
  categorical?: string[];
  total_lines?: number;
  [key: string]: unknown;
}

/** Parametres de `fetchProfile` : la ressource et son acheminement. */
export type TabularProfileParams = Pick<AdapterParams, 'resource'> &
  Partial<Pick<AdapterParams, 'baseUrl' | 'headers' | 'proxyUrl'>>;

/** Une lecture de profil partagee entre ses demandeurs (memoisation, #985). */
interface ProfileEntry {
  promise: Promise<TabularProfile>;
  controller: AbortController;
  /** Demandeurs encore en attente : a zero, la requete est annulee. */
  waiting: number;
  settled: boolean;
}

/** Erreur d'annulation, de la meme forme que celle de `fetch`. */
function abortError(): Error {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
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

/**
 * Duree de vie des groupes complets gardes pour un tri local en pagination
 * serveur (#1045) : les pages suivantes d'une meme liste les relisent au lieu
 * de refaire toutes les requetes, sans servir indefiniment une donnee
 * perimee.
 */
const TABULAR_GROUPS_TTL_MS = 60_000;

/**
 * Repartition d'un `order-by` entre l'API et l'adaptateur (#1045).
 *
 * - `server` : parties emises en `champ__sort` ;
 * - `local` : parties que l'adaptateur applique lui-meme, sur les groupes
 *   COMPLETS (jamais sur une page de groupes : ce ne serait pas un tri
 *   global, et un « top 10 » pris sur la premiere page serait faux).
 */
interface SortPlan {
  server: OrderByPart[];
  local: OrderByPart[];
}

export class TabularAdapter implements ApiAdapter {
  readonly type = 'tabular';

  /** Avertissement « page-size borne » deja emis (une fois par adaptateur). */
  private _pageSizeClampWarned = false;

  /** Avertissement « select ignore » deja emis (une fois par adaptateur). */
  private _selectIgnoredWarned = false;

  /** Profils lus, par `base|ressource` (#985) : un seul appel par ressource. */
  private readonly _profiles = new Map<string, ProfileEntry>();

  /**
   * Derniers groupes complets lus pour un tri local en pagination serveur
   * (#1045), par URL de premiere page : une seule entree, `TABULAR_GROUPS_TTL_MS`.
   */
  private _completeGroups: { key: string; at: number; result: FetchResult } | null = null;

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
   * Tabular delegue group-by/aggregate/order-by/where via une syntaxe a
   * suffixe (`colonne__op`) dont le parseur accepte espaces, accents et
   * ponctuation percent-encodes (#985). Seuls les separateurs de la grammaire
   * colon (`,` `:` `|`) rendent un nom non delegable : dsfr-data-query
   * calcule alors cote client (resultat identique, sur toutes les lignes).
   */
  supportsServerFields(fields: string[]): boolean {
    return fields.every((f) => !TABULAR_RESERVED_FIELD_CHARS.test(f));
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
   * (aucun nom portant un separateur colon, #289, #985).
   *
   * Un `group-by` SANS agregat ne l'est pas (#1025) : `champ__groupby` seul
   * ne regroupe pas, l'API rend une ligne par ligne brute reduite au champ
   * (`Code sexe__groupby&page_size=5` → F, M, M, F, M, mesure du
   * 2026-09-22, api-tabular#119). Delegue, il faisait passer des modalites
   * REPETEES pour des groupes. Lignes brutes + `needsClientProcessing`,
   * comme pour `distinct` : l'aval regroupe.
   */
  private _canServerProcessGroupBy(params: AdapterParams): boolean {
    if (!params.groupBy && !params.aggregate) return true;
    const aggregates = parseAggregates(params.aggregate || '');
    if (this._isGroupByWithoutAggregate(params, aggregates.length)) return false;
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
   * Group by + agregations : seulement si `_canServerProcessGroupBy` l'admet
   * (pas de `distinct`, pas de group-by sans agregat, aucun nom portant un
   * separateur colon). Sinon lignes brutes (needsClientProcessing signale
   * par fetchAll / fetchPage). Les noms a espaces, accents ou ponctuation
   * sont delegues, percent-encodes (#985).
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
   * Ce que l'API sait trier dans une requete regroupee (#1045).
   *
   * Mesure du 2026-09-23 (ressource 90e0d717…, `EPCI__groupby&NB_VP__sum`) :
   * - `EPCI__sort=desc` → 200 : la colonne de REGROUPEMENT se trie ;
   * - `NB_VP__sum__sort=desc` → 400, 42703 « column …NB_VP__sum does not
   *   exist » (aussi sans le flag `NB_VP__sum`) : une colonne d'agregat n'est
   *   pas une colonne de la table, le tri ne la voit pas ;
   * - `NB_VP__sort=desc` → 400, 42803 « must appear in the GROUP BY clause ».
   * Le 400 part sans en-tete CORS : le navigateur n'en voit qu'une erreur
   * reseau opaque (#598). Tout graphique regroupe et trie sur sa valeur
   * (« top 10 ») echouait ainsi.
   *
   * Donc, quand un regroupement ou un agregat est demande :
   * - tri sur les seules colonnes de regroupement → delegue ;
   * - sinon, regroupement delegue → le tri ENTIER est applique ici, sur les
   *   groupes complets (un tri mixte serveur puis local ne serait pas stable
   *   sur la premiere cle) ;
   * - sinon (regroupement non delegable, lignes brutes) → rien n'est emis :
   *   l'aval regroupe puis trie, et le champ trie n'existe pas encore.
   */
  private _sortPlan(params: AdapterParams, orderBy: string | undefined): SortPlan {
    const parts = parseOrderBy(orderBy || '');
    const asked = !!(params.groupBy?.trim() || params.aggregate?.trim());
    if (parts.length === 0 || !asked) return { server: parts, local: [] };
    const groupFields = new Set(
      (params.groupBy || '')
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean)
    );
    if (parts.every((p) => groupFields.has(p.field))) return { server: parts, local: [] };
    if (this._canServerProcessGroupBy(params)) return { server: [], local: parts };
    return { server: [], local: [] };
  }

  /**
   * Projection `columns=` depuis l'attribut `select` de la source (#985).
   *
   * L'API ne rend alors que les colonnes nommees : 34 721 → 3 098 octets
   * pour 50 lignes d'elus a deux colonnes, 366 892 → 22 383 octets pour
   * 200 bornes IRVE a trois colonnes (mesures du 2026-09-22). Le chiffre
   * affiche ne change pas : la projection retire des colonnes, jamais des
   * lignes.
   *
   * Pas de projection quand :
   * - un `group-by` ou un `aggregate` est pose (sur la source ou delegue par
   *   une query) : l'API refuse `columns` a cote d'un agregateur (400
   *   « the argument `columns` cannot be set alongside aggregators »), et un
   *   regroupement non delegable (`distinct`, #1025) a besoin des lignes
   *   brutes completes ;
   * - un element du `select` est une expression ODSQL (`count(*) as n`,
   *   `*`) : Tabular n'a pas d'expression, le `select` est ignore avec un
   *   avertissement unique.
   *
   * Aucune inference : la liste est celle de l'auteur (ou du builder qui l'a
   * ecrite). Une colonne absente du `select` est absente des lignes.
   * Separateur `,` nu, chaque nom percent-encode : l'API decoupe sur la
   * virgule, qui ne peut donc pas figurer dans un nom.
   */
  private _columnsFlag(params: AdapterParams): string | null {
    const select = params.select?.trim();
    if (!select) return null;
    if (params.groupBy?.trim() || params.aggregate?.trim()) return null;
    const columns = [
      ...new Set(
        select
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
      ),
    ];
    if (columns.length === 0) return null;
    if (columns.some(isSelectExpression)) {
      if (!this._selectIgnoredWarned) {
        this._selectIgnoredWarned = true;
        console.warn(
          `[dsfr-data] tabular: select="${select}" ignoré — l'API Tabular ne sélectionne que des ` +
            `colonnes nommées (columns=), sans fonction, alias ni « * » ; toutes les colonnes ` +
            `sont chargées`
        );
      }
      return null;
    }
    return `columns=${columns.map(encodeURIComponent).join(',')}`;
  }

  /**
   * Profil d'une ressource (#985) : `GET /api/resources/{id}/profile/`,
   * format detecte et type de chaque colonne, modalites frequentes, nombre
   * de valeurs distinctes et manquantes.
   *
   * Memorise par ressource (et hote) : un seul appel, quel que soit le nombre
   * de demandeurs. Annulable : `signal` retire le demandeur, et la requete
   * elle-meme est annulee quand plus personne ne l'attend. Une lecture en
   * echec ou annulee n'est pas memorisee — la suivante reessaie.
   *
   * Jamais appele par `fetchAll` ni `fetchPage` : une requete de plus par
   * source n'est pas gratuite. Consommateurs : l'activation du filtrage par
   * emprise d'une couche (format `latitude_wgs` / `longitude_wgs`, #1023) et
   * l'application Sources.
   */
  fetchProfile(params: TabularProfileParams, signal?: AbortSignal): Promise<TabularProfile> {
    if (signal?.aborted) return Promise.reject(abortError());
    const base = this._getBaseUrl(params);
    const key = `${base}|${params.resource}`;

    let entry = this._profiles.get(key);
    if (!entry) {
      const controller = new AbortController();
      const url = getProxiedUrl(
        `${base}/api/resources/${encodeURIComponent(params.resource)}/profile/`,
        params.proxyUrl
      );
      const created: ProfileEntry = {
        controller,
        waiting: 0,
        settled: false,
        promise: fetch(url, buildFetchOptions(params, controller.signal)).then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          const json = (await response.json()) as { profile?: TabularProfile };
          return json.profile ?? {};
        }),
      };
      created.promise.then(
        () => {
          created.settled = true;
        },
        () => {
          created.settled = true;
          if (this._profiles.get(key) === created) this._profiles.delete(key);
        }
      );
      this._profiles.set(key, created);
      entry = created;
    }

    const shared = entry;
    shared.waiting++;
    return new Promise<TabularProfile>((resolve, reject) => {
      let done = false;
      const release = () => {
        if (done) return false;
        done = true;
        shared.waiting--;
        signal?.removeEventListener('abort', onAbort);
        return true;
      };
      const onAbort = () => {
        if (!release()) return;
        if (shared.waiting === 0 && !shared.settled) {
          if (this._profiles.get(key) === shared) this._profiles.delete(key);
          shared.controller.abort();
        }
        reject(abortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      shared.promise.then(
        (profile) => {
          if (release()) resolve(profile);
        },
        (err: unknown) => {
          if (release()) reject(err);
        }
      );
    });
  }

  /**
   * Avertit une fois quand un group-by/aggregate demande n'est PAS delegable
   * (#289, #672) : les lignes brutes reviennent et l'aval retraite.
   * Rend `true` quand la delegation a bien eu lieu.
   */
  private _warnUndelegable(params: AdapterParams, canServerProcess: boolean): boolean {
    const asked = !!(params.groupBy || params.aggregate);
    if (!asked || canServerProcess) return asked;
    if (this._isGroupByWithoutAggregate(params)) {
      console.warn(
        `[dsfr-data] tabular: group-by sans agrégat non délégable (group-by="${params.groupBy}") — ` +
          `l'API Tabular répète les lignes au lieu de les regrouper ; lignes brutes renvoyées, ` +
          `regroupement calculé côté client`
      );
    } else if (this._hasDistinct(params)) {
      console.warn(
        `[dsfr-data] tabular: "distinct" n'est pas délégable à l'API Tabular (aggregate="${params.aggregate}") — ` +
          `lignes brutes renvoyées, comptage distinct calculé côté client`
      );
    } else {
      // Seule cause restante (#985) : un nom de colonne portant un
      // separateur de la grammaire colon.
      console.warn(
        `[dsfr-data] tabular: group-by/aggregate non délégables (nom de colonne contenant ` +
          `« , », « : » ou « | » : "${params.groupBy || params.aggregate}") — lignes brutes ` +
          `renvoyées, traitement client requis`
      );
    }
    return false;
  }

  /** `group-by` pose sans aucun agregat : non delegable a Tabular (#1025). */
  private _isGroupByWithoutAggregate(params: AdapterParams, aggregateCount?: number): boolean {
    const count = aggregateCount ?? parseAggregates(params.aggregate || '').length;
    return !!params.groupBy?.trim() && count === 0;
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
    // Tri sur une colonne d'agregat (#1045) : groupes complets, puis tri ici
    const localSort = this._sortPlan(params, params.orderBy).local;
    if (localSort.length > 0) return this._fetchAllSortedLocally(params, localSort, signal);

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
   * Fetch complet trie ICI (#1045) : l'API ne trie pas une colonne d'agregat.
   *
   * Tous les groupes sont lus SANS `limit` — un `limit="10"` borne sinon la
   * lecture aux dix premiers groupes dans l'ordre de l'API, et le tri en
   * ferait un faux « top 10 » —, puis tries, puis coupes au `limit`.
   * Quand le plafond `max-records` a coupe la lecture, le tri ne porte que
   * sur les groupes lus : on le dit.
   */
  private async _fetchAllSortedLocally(
    params: AdapterParams,
    parts: OrderByPart[],
    signal: AbortSignal
  ): Promise<FetchResult> {
    const complete = await this.fetchAll({ ...params, orderBy: '', limit: 0 }, signal);
    this._warnPartialSort(params, complete);
    let data = sortRows(complete.data, parts);
    if (params.limit > 0) data = data.slice(0, params.limit);
    return { ...complete, data };
  }

  /**
   * Page trie ICI en pagination serveur (#1045) : l'API pagine les groupes
   * dans SON ordre, et un tri applique a une page n'est pas un tri global —
   * la premiere page triee ne serait pas le « top » du jeu. Les groupes
   * complets sont donc lus (et gardes `TABULAR_GROUPS_TTL_MS` pour les pages
   * suivantes), tries, puis la page demandee y est decoupee. Le nombre de
   * groupes est alors connu : il devient le total de la pagination.
   */
  private async _fetchPageSortedLocally(
    params: AdapterParams,
    overlay: ServerSideOverlay,
    parts: OrderByPart[],
    signal: AbortSignal
  ): Promise<FetchResult> {
    const completeParams: AdapterParams = {
      ...params,
      where: overlay.effectiveWhere || params.filter || params.where,
      filter: '',
      orderBy: '',
      limit: 0,
    };
    const key = [
      this.buildUrl(completeParams, TABULAR_PAGE_SIZE, 1),
      params.proxyUrl ?? '',
      JSON.stringify(params.headers ?? {}),
      params.maxRecords ?? '',
    ].join('|');
    const cached = this._completeGroups;
    let complete: FetchResult;
    if (cached && cached.key === key && Date.now() - cached.at < TABULAR_GROUPS_TTL_MS) {
      complete = cached.result;
    } else {
      complete = await this.fetchAll(completeParams, signal);
      this._completeGroups = { key, at: Date.now(), result: complete };
      this._warnPartialSort(params, complete);
    }

    const sorted = sortRows(complete.data, parts);
    const size = params.pageSize > 0 ? this._clampPageSize(params.pageSize) : TABULAR_PAGE_SIZE;
    const start = (Math.max(1, overlay.page) - 1) * size;
    return {
      data: sorted.slice(start, start + size),
      // Groupes tous lus : le total est connu. Plafond atteint : il ne l'est pas.
      totalCount: complete.truncated ? undefined : sorted.length,
      needsClientProcessing: false,
      ...(complete.truncated ? { truncated: true } : {}),
    };
  }

  /** Tri local sur des groupes TRONQUES par le plafond : global, il ne l'est pas (#1045). */
  private _warnPartialSort(params: AdapterParams, complete: FetchResult): void {
    if (!complete.truncated) return;
    console.warn(
      `[dsfr-data] tabular: tri sur "${params.orderBy}" calculé sur les ${complete.data.length} ` +
        `premiers groupes seulement — l'API Tabular ne trie pas une colonne d'agrégat, et le ` +
        `plafond max-records a coupé la lecture ; relevez max-records pour un tri sur tous les groupes`
    );
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
    // Tri sur une colonne d'agregat (#1045) : jamais sur une page de groupes
    const localSort = this._sortPlan(params, overlay.orderBy).local;
    if (localSort.length > 0) {
      return this._fetchPageSortedLocally(params, overlay, localSort, signal);
    }

    const url = getProxiedUrl(this.buildServerSideUrl(params, overlay), params.proxyUrl);
    const asked = !!(params.groupBy || params.aggregate);
    const serverHandled = this._warnUndelegable(params, this._canServerProcessGroupBy(params));

    const response = await fetch(url, buildFetchOptions(params, signal));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    const data = json.data || [];
    // Total ABSENT = total INCONNU (contrat #270), jamais 0 (#1025) : une
    // reponse agregee ne porte pas de `meta.total` (`{page, page_size}`
    // seulement, `links.next` pagine les groupes). Lu comme 0, il masquait la
    // pagination de la liste (une seule page) et un KPI `meta:total` affichait 0.
    const totalCount: number | undefined =
      typeof json.meta?.total === 'number' ? json.meta.total : undefined;

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
    // `columns=` passe par le meme canal : sa virgule doit rester nue (#985).
    const bareFlags = this._groupByFlags(params);
    const columns = this._columnsFlag(params);
    if (columns) bareFlags.push(columns);

    // Tri — grammaire commune "field:dir, field2:dir2" (#273). Seules les
    // parties que l'API sait trier partent (#1045) : jamais une colonne
    // d'agregat, que `fetchAll` trie lui-meme.
    for (const part of this._sortPlan(params, params.orderBy).server) {
      url.searchParams.set(`${part.field}__sort`, part.direction);
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
    // Projection `columns=` depuis `select`, comme en fetch complet (#985).
    const columns = this._columnsFlag(params);
    if (columns) bareFlags.push(columns);

    // ORDER BY de l'overlay — grammaire commune "field:dir, field2:dir2"
    // (#273). Jamais une colonne d'agregat (#1045) : `fetchPage` la trie
    // lui-meme, sur les groupes complets.
    for (const part of this._sortPlan(params, overlay.orderBy).server) {
      url.searchParams.set(`${part.field}__sort`, part.direction);
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
  private _getBaseUrl(params: Partial<Pick<AdapterParams, 'baseUrl'>>): string {
    return params.baseUrl || TABULAR_CONFIG.defaultBaseUrl || 'https://tabular-api.data.gouv.fr';
  }
}
