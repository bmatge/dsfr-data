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
import {
  buildColonFacetWhere,
  unescapeColonValue,
  parseOrderBy,
  splitColonFields,
  isMultiFieldClause,
} from '../utils/where.js';
import type { OrderByPart } from '../utils/where.js';
import { sortRows } from '../utils/sort.js';
import {
  DATAGOUV_RESOURCE_API,
  parquetExportFromResource,
  readParquetRows,
} from './tabular-parquet.js';
import type { ParquetExport } from './tabular-parquet.js';

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
 * Caracteres qu'une VALEUR ne peut pas porter dans un groupe `or=(…)` (#1026,
 * mesures dans `_orGroup`) : le parseur de l'API decoupe le groupe sur `,`
 * hors parentheses, chaque membre sur `.`, et la query string sur `&`, apres
 * decodage ; un `"` y est passe tel quel a PostgREST.
 */
const TABULAR_OR_UNSAFE_VALUE = /[,.()"&]/;

/** Parentheses equilibrees : le groupe `or=(…)` est decoupe par profondeur. */
function parenthesesBalanced(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    if (char === '(') depth++;
    else if (char === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

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

/**
 * Une lecture partagee entre ses demandeurs (memoisation) : le profil d'une
 * ressource (#985), son export Parquet (#1055).
 */
interface SharedEntry<T> {
  promise: Promise<T>;
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

/** Une annulation (le signal de la source, ou une `AbortError`) — jamais un repli. */
function isAbort(err: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (err instanceof Error && err.name === 'AbortError');
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

  /** Clauses multi-champs deja signalees comme non transmissibles (#1026). */
  private readonly _orRefusedWarned = new Set<string>();

  /** Profils lus, par `base|ressource` (#985) : un seul appel par ressource. */
  private readonly _profiles = new Map<string, SharedEntry<TabularProfile>>();

  /** Exports Parquet resolus, par ressource (#1055) : un seul appel par ressource. */
  private readonly _parquetExports = new Map<string, SharedEntry<ParquetExport | null>>();

  /** Avertissements `fetch-mode="export"` deja emis (une fois par cause, #1055). */
  private readonly _exportWarned = new Set<string>();

  /**
   * Derniers groupes complets lus pour un tri local en pagination serveur
   * (#1045), par URL de premiere page : une seule entree, `TABULAR_GROUPS_TTL_MS`.
   */
  private _completeGroups: { key: string; at: number; result: FetchResult } | null = null;

  readonly capabilities: AdapterCapabilities = {
    serverFetch: true,
    serverFacets: false,
    serverSearch: true,
    serverGroupBy: true,
    serverOrderBy: true,
    serverGeo: false,
    whereFormat: 'colon',
  };

  /**
   * Clés que l'adaptateur construit lui-même (#1137) : pagination (`page`,
   * `page_size`), projection (`columns`, #985), OU multi-champs (`or`, #1026),
   * et les suffixes de colonne — tri, regroupement, agrégats et opérateurs
   * de filtre (`champ__sort`, `champ__groupby`, `champ__sum`, `champ__exact`…).
   */
  readonly reservedParamKeys: ReadonlySet<string> = new Set([
    'page',
    'page_size',
    'columns',
    'or',
    ...[
      'sort',
      'groupby',
      'count',
      'sum',
      'avg',
      'min',
      'max',
      'exact',
      'differs',
      'strictly_greater',
      'greater',
      'strictly_less',
      'less',
      'contains',
      'notcontains',
      'in',
      'notin',
      'isnull',
      'isnotnull',
    ].map((suffix) => `*__${suffix}`),
  ]);

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
    if (params.groupBy?.trim() || params.aggregate?.trim()) return null;
    const columns = this._selectColumns(params);
    return columns ? `columns=${columns.map(encodeURIComponent).join(',')}` : null;
  }

  /**
   * Colonnes nommees par le `select` de la source, ou null (pas de `select`,
   * ou une expression ODSQL, ignoree avec un avertissement unique). Partage
   * par la projection `columns=` de l'API (#985) et celle de l'export Parquet
   * (#1055).
   */
  private _selectColumns(params: AdapterParams): string[] | null {
    const select = params.select?.trim();
    if (!select) return null;
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
    return columns;
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
    const base = this._getBaseUrl(params);
    const url = getProxiedUrl(
      `${base}/api/resources/${encodeURIComponent(params.resource)}/profile/`,
      params.proxyUrl
    );
    return this._shared(
      this._profiles,
      `${base}|${params.resource}`,
      async (ownSignal) => {
        const response = await fetch(url, buildFetchOptions(params, ownSignal));
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const json = (await response.json()) as { profile?: TabularProfile };
        return json.profile ?? {};
      },
      signal
    );
  }

  /**
   * Export Parquet d'une ressource (#1055) : `parquet_url` et sa taille, lus
   * sur `GET https://www.data.gouv.fr/api/2/datasets/resources/{rid}/`, ou
   * `null` quand la ressource n'en a pas.
   *
   * Memes regles que `fetchProfile` : un seul appel par ressource, quel que
   * soit le nombre de demandeurs ; annulable, la requete l'est quand plus
   * personne ne l'attend ; un echec n'est pas memorise. L'API repond
   * `Access-Control-Allow-Origin: *` : pas de proxy, pas de credentials, et
   * JAMAIS les en-tetes de la source (ils visent l'API tabulaire).
   */
  resolveParquetExport(
    params: Pick<AdapterParams, 'resource'>,
    signal?: AbortSignal
  ): Promise<ParquetExport | null> {
    const url = `${DATAGOUV_RESOURCE_API}${encodeURIComponent(params.resource)}/`;
    return this._shared(
      this._parquetExports,
      params.resource,
      async (ownSignal) => {
        const response = await fetch(url, { credentials: 'omit', signal: ownSignal });
        // 404 : ressource inconnue de data.gouv (hote tabulaire tiers) — pas d'export
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        return parquetExportFromResource(await response.json());
      },
      signal
    );
  }

  /**
   * Partage une lecture entre ses demandeurs, par cle (#985, #1055).
   *
   * Une lecture reussie reste memorisee ; une lecture en echec ou annulee ne
   * l'est pas — la suivante reessaie. `signal` retire le demandeur, et la
   * requete elle-meme est annulee quand plus personne ne l'attend.
   */
  private _shared<T>(
    cache: Map<string, SharedEntry<T>>,
    key: string,
    start: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());

    let entry = cache.get(key);
    if (!entry) {
      const controller = new AbortController();
      const created: SharedEntry<T> = {
        controller,
        waiting: 0,
        settled: false,
        promise: start(controller.signal),
      };
      created.promise.then(
        () => {
          created.settled = true;
        },
        () => {
          created.settled = true;
          if (cache.get(key) === created) cache.delete(key);
        }
      );
      cache.set(key, created);
      entry = created;
    }

    const shared = entry;
    shared.waiting++;
    return new Promise<T>((resolve, reject) => {
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
          if (cache.get(key) === shared) cache.delete(key);
          shared.controller.abort();
        }
        reject(abortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      shared.promise.then(
        (value) => {
          if (release()) resolve(value);
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
   *
   * `fetch-mode="export"` (#1055) lit le jeu dans l'export Parquet de
   * data.gouv quand rien n'est delegue ; sinon, ou sans export, retour a la
   * pagination ci-dessous (voir `_fetchViaParquet`).
   */
  async fetchAll(params: AdapterParams, signal: AbortSignal): Promise<FetchResult> {
    if (params.fetchMode === 'export') {
      const exported = await this._fetchViaParquet(params, signal);
      if (exported) return exported;
    }

    // Tri sur une colonne d'agregat (#1045) : groupes complets, puis tri ici
    const localSort = this._sortPlan(params, params.orderBy).local;
    if (localSort.length > 0) return this._fetchAllSortedLocally(params, localSort, signal);

    const fetchAllRecords = params.limit <= 0;
    const maxRecords = this._maxRecords(params);
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
   * Charge le jeu par son export Parquet (#1055, etude #1022).
   *
   * Conditions :
   * - aucun `where`, `group-by`, `aggregate` ni `order-by` delegue (pose sur
   *   la source ou transmis par une query) : le Parquet ne porte que les
   *   lignes BRUTES, dans l'ordre du fichier. Sinon la pagination les
   *   execute cote serveur, et on le dit une fois ;
   * - la ressource a un export (`parquet_url`) : sinon pagination, et on le
   *   dit une fois par ressource (meme repli que l'export ODS, #689).
   *
   * Le `select` projette les colonnes lues (#985) ; `max-records` (defaut :
   * 25 000, comme la pagination) et un `limit` plus petit bornent les lignes
   * LUES, pas seulement gardees — 703 k lignes occupent 39 Mo en objets.
   * Le fichier annonce son nombre de lignes : le total serveur est connu,
   * la troncature se deduit et se dit comme en pagination.
   *
   * Retourne `null` pour revenir a la pagination ; une annulation remonte
   * telle quelle. Un echec de resolution, de chargement du lecteur (reseau,
   * CSP) ou de lecture n'est jamais fatal : pagination, avec un avertissement.
   */
  private async _fetchViaParquet(
    params: AdapterParams,
    signal: AbortSignal
  ): Promise<FetchResult | null> {
    const delegated = this._delegatedClauses(params);
    if (delegated.length > 0) {
      this._warnExportOnce(
        `delegated:${delegated.join('|')}`,
        `[dsfr-data] tabular: fetch-mode="export" ignoré sur dsfr-data-source ` +
          `(${delegated.join(', ')}) — l'export Parquet ne porte que des lignes brutes, ` +
          `la clause est exécutée par l'API paginée. Pour lire tout le jeu en une fois, ` +
          `retirez la clause de dsfr-data-source et calculez-la avec dsfr-data-query`
      );
      return null;
    }

    let exported: ParquetExport | null;
    try {
      exported = await this.resolveParquetExport(params, signal);
    } catch (err) {
      if (isAbort(err, signal)) throw err;
      this._warnExportFailure(params, 'résolution de l’export impossible', err);
      return null;
    }
    if (!exported) {
      this._warnExportOnce(
        `absent:${params.resource}`,
        `[dsfr-data] tabular: pas d'export Parquet pour la ressource "${params.resource}" — ` +
          `fetch-mode="export" de dsfr-data-source retombe sur le chargement paginé`
      );
      return null;
    }

    const maxRecords = this._maxRecords(params);
    const fetchAllRecords = params.limit <= 0;
    const cap = fetchAllRecords ? maxRecords : Math.min(params.limit, maxRecords);
    const columns = this._selectColumns(params);

    let read: Awaited<ReturnType<typeof readParquetRows>>;
    try {
      read = await readParquetRows({
        url: exported.url,
        size: exported.size,
        ...(columns ? { columns } : {}),
        maxRows: cap,
        signal,
      });
    } catch (err) {
      if (isAbort(err, signal)) throw err;
      this._warnExportFailure(params, 'lecture de l’export impossible', err);
      return null;
    }

    if (read.missingColumns.length > 0) {
      this._warnExportOnce(
        `missing:${params.resource}|${read.missingColumns.join('|')}`,
        `[dsfr-data] tabular: select de dsfr-data-source — colonne(s) absente(s) de l'export ` +
          `Parquet : ${read.missingColumns.map((c) => `"${c}"`).join(', ')}`
      );
    }

    // Plafond max-records (et non un limit plus petit) atteint alors que le
    // fichier porte plus de lignes : dit comme en pagination (#1027).
    const capBinding = fetchAllRecords || params.limit >= maxRecords;
    const truncated = capBinding && read.numRows > read.rows.length;
    if (truncated) {
      console.warn(
        `[dsfr-data] tabular: export Parquet lu jusqu'à ${read.rows.length}/${read.numRows} lignes ` +
          `(plafond max-records : ${maxRecords} lignes — relevable via l'attribut max-records ` +
          `de dsfr-data-source, #1027)`
      );
    }

    return {
      data: read.rows,
      totalCount: read.numRows,
      needsClientProcessing: false,
      ...(truncated ? { truncated: true } : {}),
    };
  }

  /** Clauses deleguees qui interdisent l'export Parquet (#1055), nommees pour le message. */
  private _delegatedClauses(params: AdapterParams): string[] {
    const clauses: string[] = [];
    const where = (params.filter || params.where || '').trim();
    if (where) clauses.push(`where="${where}"`);
    if (params.groupBy?.trim()) clauses.push(`group-by="${params.groupBy.trim()}"`);
    if (params.aggregate?.trim()) clauses.push(`aggregate="${params.aggregate.trim()}"`);
    if (params.orderBy?.trim()) clauses.push(`order-by="${params.orderBy.trim()}"`);
    return clauses;
  }

  /** Un avertissement `fetch-mode="export"` par cause et par adaptateur (#1055). */
  private _warnExportOnce(key: string, message: string): void {
    if (this._exportWarned.has(key)) return;
    this._exportWarned.add(key);
    console.warn(message);
  }

  /** Echec transitoire de l'export : dit a chaque fois, jamais memorise. */
  private _warnExportFailure(params: AdapterParams, what: string, err: unknown): void {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(
      `[dsfr-data] tabular: ${what} pour la ressource "${params.resource}" (${detail}) — ` +
        `fetch-mode="export" de dsfr-data-source retombe sur le chargement paginé`
    );
  }

  /** Plafond `max-records` effectif (#1027) : l'attribut, ou 25 000 lignes. */
  private _maxRecords(params: AdapterParams): number {
    return params.maxRecords && params.maxRecords > 0
      ? params.maxRecords
      : TABULAR_MAX_PAGES * TABULAR_PAGE_SIZE;
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
    let orEmitted = false;
    for (const filter of filters) {
      const parts = filter.split(':');
      if (isMultiFieldClause(filter)) {
        // Champs multiples (#1026) : un OU entre champs, `or=(a__op.v,b__op.v)`
        // — un seul groupe par requete (voir `supportsServerWhere`)
        const group = orEmitted ? null : this._orGroup(parts);
        if (group !== null) {
          orEmitted = true;
          url.searchParams.append('or', group);
        } else {
          this._warnOrRefused(filter);
        }
        continue;
      }
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
   * Une clause multi-champs du `where` colon traduite en groupe `or=(…)`
   * (#1026), ou null quand l'API ne saurait pas le lire.
   *
   * Mesures du 2026-09-23 sur la ressource des elus (2876a346…) :
   * `or=(Nom de l'élu__contains.MARTIN,Prénom de l'élu__contains.MARTIN)` →
   * `total 351` = 189 + 164 − 2, l'union vraie ; compose en ET avec un autre
   * filtre (`&Code sexe__exact=F` → 194) ; espace et apostrophe passent
   * (`DE LA` → 33 comme le filtre simple, `D'` → 41 idem). Le parseur de l'API
   * (`api_tabular/core/query.py`) decoupe le groupe sur les virgules hors
   * parentheses et chaque membre sur le point, APRES decodage de la query
   * string : une valeur a virgule (`A%2CB`) ou a point (`J.`) rend 400, et la
   * forme citee (`"J."`) passe les guillemets TELS QUELS a PostgREST, qui
   * rend 0 sans erreur. D'ou les refus :
   * - valeur portant `,` `.` `(` `)` `"` ou `&` (la query string est coupee
   *   sur `&` apres decodage) ;
   * - `in` / `notin` : leur liste s'ecrit avec des virgules ;
   * - colonne portant `"`, ou des parentheses desequilibrees ; une colonne a
   *   point est citee (`"col.umn"__op.v`, forme prevue par l'API).
   *
   * `contains` y garde sa semantique : insensible a la casse, SENSIBLE aux
   * accents (`ilike`) — « ecole » ne trouve pas « École » cote serveur.
   */
  private _orGroup(parts: string[]): string | null {
    const [fieldPart, op = ''] = parts;
    if (op === 'in' || op === 'notin') return null;
    const native = this._mapOperator(op);
    const noValue = op === 'isnull' || op === 'isnotnull';
    if (!noValue && parts.length < 3) return null;
    const value = unescapeColonValue(parts.slice(2).join(':'));
    if (!noValue && TABULAR_OR_UNSAFE_VALUE.test(value)) return null;
    const members: string[] = [];
    for (const field of splitColonFields(fieldPart)) {
      if (field.includes('"') || !parenthesesBalanced(field)) return null;
      const column = field.includes('.') ? `"${field}"` : field;
      members.push(noValue ? `${column}__${native}` : `${column}__${native}.${value}`);
    }
    return `(${members.join(',')})`;
  }

  /**
   * Le `where` est-il traduisible tel quel (#1026) ? Les clauses a un champ le
   * sont toujours ; une clause multi-champs l'est si `_orGroup` sait l'ecrire,
   * et une SEULE par requete — deux groupes `or=` repetes n'ont pas ete
   * mesures, la seconde clause retombe donc sur le filtre client.
   */
  supportsServerWhere(where: string): boolean {
    const multi = where
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c && isMultiFieldClause(c));
    if (multi.length === 0) return true;
    if (multi.length > 1) return false;
    return this._orGroup(multi[0].split(':')) !== null;
  }

  /** Une clause multi-champs non traduisible : ignoree cote serveur, et dit (#1026). */
  private _warnOrRefused(clause: string): void {
    if (this._orRefusedWarned.has(clause)) return;
    this._orRefusedWarned.add(clause);
    console.warn(
      `dsfr-data: Tabular ne sait pas transmettre la clause "${clause}" dans or=(…) ` +
        `(valeur portant , . ( ) " ou &, liste in/notin, ou plus d'une clause multi-champs) — ` +
        `elle n'est PAS appliquee par le serveur. Filtrez-la avec dsfr-data-query, qui ` +
        `l'applique alors sur les lignes chargees.`
    );
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
