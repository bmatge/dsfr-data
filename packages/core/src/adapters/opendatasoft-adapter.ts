/**
 * Adapter pour l'API OpenDataSoft (ODS).
 *
 * Gere : construction d'URL ODSQL, pagination offset, parsing results/total_count,
 * facettes serveur (/facets endpoint), search template.
 *
 * Deux chemins de chargement complet (#689, ADR-106) : `/records` pagine
 * (defaut) et `/exports/json` en une requete (`fetchMode: 'export'`), qui
 * partagent la construction des clauses ODSQL. Le second retombe une fois sur
 * le premier en cas d'erreur HTTP, et memorise ce repli.
 */

import type {
  ApiAdapter,
  AdapterCapabilities,
  AdapterParams,
  FetchResult,
  FetchCaveat,
  ServerSideOverlay,
  FacetResult,
  FacetDescriptor,
  FacetWhereOptions,
  FieldKind,
  BboxBounds,
  BboxTarget,
} from './api-adapter.js';
import { ODSQL_WHERE_DIALECT } from './where-dialect.js';
import type { QueryAggregate } from '../components/dsfr-data-query.js';
import { parseAggregates } from '../utils/aggregates.js';
import { parseOrderBy } from '../utils/where.js';
import type { ProviderConfig } from '@dsfr-data/shared/lib';
import {
  ODS_CONFIG,
  resolveTransportUrl,
  transportFetch,
  normalizeProviderAuthHeaders,
  serverComputesClause,
} from '@dsfr-data/shared/lib';
import { httpError, releaseBody } from '../utils/http-error.js';

/**
 * Échappe une chaîne destinée à être interpolée dans une string ODSQL (`"…"`).
 * Ordre crucial : backslashes d'abord (sinon les `\"` qu'on ajoute seraient
 * ré-échappés), puis les doubles quotes.
 */
function escapeOdsqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Type declare d'un champ Opendatasoft (`fields[].type` des metadonnees du
 * jeu) → type normalise de `describeFieldTypes` (#1138). Les composants ne
 * voient que le type normalise.
 */
const ODS_FIELD_KINDS: Readonly<Record<string, FieldKind>> = {
  int: 'number',
  integer: 'number',
  long: 'number',
  double: 'number',
  float: 'number',
  decimal: 'number',
  text: 'text',
  date: 'date',
  datetime: 'date',
  boolean: 'bool',
  geo_point_2d: 'geo',
  geo_shape: 'geo',
};

export function odsFieldKind(odsType: string): FieldKind {
  return ODS_FIELD_KINDS[odsType.toLowerCase()] ?? 'other';
}

/**
 * Clause de facette sur un champ date (#676) : une annee `YYYY` devient
 * l'intervalle `[1er janvier, 1er janvier suivant)` en litteraux ODSQL
 * `date'…'` ; toute autre valeur retombe sur l'egalite historique.
 */
function odsDateFacetClause(field: string, value: string): string {
  if (/^\d{4}$/.test(value)) {
    const year = Number(value);
    return `${field} >= date'${value}-01-01' AND ${field} < date'${year + 1}-01-01'`;
  }
  return `${field} = "${escapeOdsqlString(value)}"`;
}

/** `"a:desc, b:asc"` → `"a DESC, b ASC"` — multi-champs via la grammaire commune (#273) */
function toOdsOrderBy(orderBy: string): string {
  return parseOrderBy(orderBy)
    .map((p) => `${p.field} ${p.direction.toUpperCase()}`)
    .join(', ');
}

/**
 * Construit les options fetch avec headers optionnels. Les en-têtes d'auth
 * sont normalisés au format ODS (#655) : `apikey: K` (et variantes) devient
 * `Authorization: Apikey K` — ODS n'autorise que `Authorization` en preflight
 * CORS et ignore un en-tête `apikey` nu. `apiUrl` est l'URL ODS avant proxy,
 * sur laquelle le provider est détecté.
 */
function buildFetchOptions(
  params: Pick<AdapterParams, 'headers'>,
  apiUrl: string,
  signal?: AbortSignal
): RequestInit {
  const opts: RequestInit = {};
  if (signal) opts.signal = signal;
  if (params.headers && Object.keys(params.headers).length > 0) {
    opts.headers = normalizeProviderAuthHeaders(apiUrl, params.headers).headers;
  }
  return opts;
}

/**
 * Types normalises sur lesquels l'API sait trier (#1274) — voir
 * `_sortableColumns`. `geo` et `other` (geometrie, fichier, JSON) en sont
 * exclus : l'API refuse d'y trier.
 */
const SORTABLE_KINDS: ReadonlySet<FieldKind> = new Set<FieldKind>([
  'text',
  'number',
  'date',
  'bool',
]);

/** L'API a refuse la premiere requete portant un ordre total compose (#1274). */
class TotalOrderRefused extends Error {}

/** Une annulation (changement de page, source retiree) n'est pas un refus. */
function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (err instanceof Error && err.name === 'AbortError');
}

/** Nombre max de records par requête ODS */
const ODS_PAGE_SIZE = 100;

/** Nombre max de pages a fetcher (limite de securite : 1 000 records) */
const ODS_MAX_PAGES = 10;

/**
 * Identifiant ODSQL utilisable nu (#767). L'ANCRAGE et l'initiale non
 * numerique ne sont pas cosmetiques : un identifiant peut contenir un chiffre
 * mais pas COMMENCER par un chiffre. Mesure par le banc d'essai sur le jeu
 * `fr-en-cnr-base-nefle` : `select=1_uai` rend HTTP 400 « unexpected _uai at
 * position 1 », `` select=`1_uai` `` rend 200. L'ancienne classe
 * `[A-Za-z0-9_]+` laissait ce nom nu (PG-027) — ne pas la « simplifier ».
 */
const ODSQL_BARE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Echappe un identifiant ODSQL (#289) : les noms simples passent tels quels
 * (lisibilite des URLs), les champs avec espaces/ponctuation sont entoures
 * de backquotes — "Date - Journee gaziere" cassait l'ODSQL (Grist echappe
 * systematiquement). Les backquotes internes sont retirees (interdites dans
 * les noms de champs ODS).
 */
function escapeOdsqlIdentifier(field: string): string {
  if (ODSQL_BARE_IDENTIFIER.test(field)) return field;
  return '`' + field.replace(/`/g, '') + '`';
}

/**
 * Un element de liste `select` / `group_by` est soit un nom de champ, soit une
 * expression ODSQL a transmettre telle quelle — la backquoter en ferait un nom
 * de champ inconnu (HTTP 400). Est une expression (#641, #767) :
 * - `*` (`select="*"`) ou un litteral numerique ;
 * - un element portant une parenthese (`year(d) as annee`, `count(*)`), une
 *   quote ou une backquote (deja echappe par l'auteur : `` `1_uai` ``) ;
 * - un alias ` as `, AVEC OU SANS fonction (`periode as an`, BUG-010 : le
 *   correctif #641 ne voyait que les parentheses) ;
 * - un chemin pointe (`geo.lat`) ;
 * - un operateur `+ * / % < > =`. PAS le tiret : « Date - Journee gaziere »
 *   est un vrai nom de champ a espaces (#289), qui doit rester echappe.
 *
 * Tout le reste qui n'est pas un identifiant nu est backquote : champ a
 * espaces, a accents, a chiffre initial.
 *
 * Cas de bascule assume : un nom de champ contenant lui-meme une parenthese
 * ("Date (jour)") est traite comme une expression et n'est pas echappe. Les
 * noms techniques ODS sont en `[a-z0-9_]` (les libelles a parentheses sont des
 * labels, pas des identifiants ODSQL) ; l'auteur peut backquoter lui-meme.
 */
function isOdsqlExpression(item: string): boolean {
  return (
    item === '*' ||
    isNumberLiteral(item) ||
    /[()'"`]/.test(item) ||
    /\sas\s/i.test(item) ||
    isDottedIdentifier(item) ||
    /[+*/%<>=]/.test(item)
  );
}

/**
 * Litteral numerique nu : `12`, `12.5`.
 *
 * Decoupage plutot que `/^\d+(\.\d+)?$/` : un quantificateur imbrique dans le
 * groupe decimal suffit a faire declarer le motif « unsafe » (#843). Les deux
 * sous-motifs employes ici sont lineaires.
 */
function isNumberLiteral(item: string): boolean {
  const dot = item.indexOf('.');
  if (dot === -1) return /^\d+$/.test(item);
  if (item.indexOf('.', dot + 1) !== -1) return false; // un seul point
  return /^\d+$/.test(item.slice(0, dot)) && /^\d+$/.test(item.slice(dot + 1));
}

/**
 * Chemin pointe d'identifiants : `table.champ`, `a.b.c` (au moins un point).
 *
 * Meme motivation que `isNumberLiteral` : `/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)+$/`
 * imbrique deux quantificateurs (#843).
 */
function isDottedIdentifier(item: string): boolean {
  const parts = item.split('.');
  return parts.length > 1 && parts.every((p) => /^[A-Za-z_]\w*$/.test(p));
}

/** Echappe un element de liste : identifiant nu ou expression brute, sinon backquote */
function escapeOdsqlListItem(item: string): string {
  if (ODSQL_BARE_IDENTIFIER.test(item) || isOdsqlExpression(item)) return item;
  return escapeOdsqlIdentifier(item);
}

/**
 * Decoupe une liste ODSQL `select` / `group_by` en elements de premier niveau
 * (#767) : une virgule ne separe que HORS parentheses et HORS quotes.
 * `date_format(d, 'yyyy-MM') as m, region` donne deux elements, pas trois — le
 * `split(',')` brut coupait la fonction en deux et backquotait sa seconde
 * moitie (BUG-011). Une parenthese fermante orpheline ne fait pas descendre
 * la profondeur sous zero : l'element reste d'un tenant et part tel quel a
 * l'API, qui en dira l'erreur.
 */
function splitOdsqlList(list: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const char of list) {
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"' || char === '`') {
      quote = char;
    } else if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth = Math.max(0, depth - 1);
    } else if (char === ',' && depth === 0) {
      items.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  items.push(current);
  return items.map((item) => item.trim()).filter(Boolean);
}

/** Echappe chaque element d'un `group_by` "a, b c" → "a,`b c`" */
function escapeOdsqlGroupBy(groupBy: string): string {
  return splitOdsqlList(groupBy).map(escapeOdsqlListItem).join(',');
}

/**
 * Echappe chaque element d'un `select` explicite (PG-027 : il n'etait jamais
 * echappe, a la difference du `group_by`). Les expressions — `count(*) as
 * total`, genere par les deux builders et ecrit dans la documentation — passent
 * intactes : seul un nom de champ non nu est backquote.
 */
function escapeOdsqlSelect(select: string): string {
  return splitOdsqlList(select).map(escapeOdsqlListItem).join(', ');
}

/**
 * Decoupe `expression as alias` sur le DERNIER ` as ` d'un element de liste
 * ODSQL. Rend null quand l'element n'est pas aliase.
 */
function splitOdsqlAlias(item: string): { expr: string; alias: string } | null {
  const idx = item.toLowerCase().lastIndexOf(' as ');
  if (idx < 0) return null;
  const expr = item.slice(0, idx).trim();
  const alias = item
    .slice(idx + 4)
    .trim()
    .replace(/`/g, '');
  if (!expr || !alias) return null;
  return { expr, alias };
}

/**
 * Nom sous lequel une cle de `group_by` se trie (#1274) : l'alias d'une
 * expression aliasee (`year(date) as annee` → `annee`), le champ lui-meme
 * pour un nom simple — nus, l'appelant echappe. `null` pour une expression
 * sans alias, qui n'a pas de nom dans la reponse.
 */
function odsqlGroupKey(item: string): string | null {
  const aliased = splitOdsqlAlias(item);
  if (aliased) return aliased.alias;
  const bare = item.replace(/`/g, '').trim();
  if (!bare || isOdsqlExpression(bare)) return null;
  return bare;
}

/**
 * Colonnes que SEUL le `select` de la source sait produire (#859) : un alias
 * pose sur une expression (`year(date) as annee`, `count(*) as total`), qui
 * n'existe pas comme champ du jeu de donnees. Un `periode as an` compte aussi :
 * `an` n'est pas un champ.
 *
 * Un simple renommage a l'identique (`` `annee` as annee ``) n'en est pas un.
 */
function odsqlDerivedAliases(select: string): Set<string> {
  const derived = new Set<string>();
  for (const item of splitOdsqlList(select)) {
    const parsed = splitOdsqlAlias(item);
    if (parsed && parsed.expr.replace(/`/g, '') !== parsed.alias) derived.add(parsed.alias);
  }
  return derived;
}

/** Colonne d'agrégat d'un `select` : fonction et alias rendu par l'API. */
interface AggregateAlias {
  fn: string;
  alias: string;
}

/**
 * Le `select` n'est-il QUE des agrégats, sans `group_by` (#810) ? Rend les
 * colonnes (fonction + alias), ou null. Chaque élément doit être de la forme
 * `fn(…) as alias` avec fn ∈ count, sum, avg, min, max : un seul champ nu
 * suffit à en faire une requête de lignes ordinaire.
 */
function aggregateOnlySelect(params: AdapterParams): AggregateAlias[] | null {
  if (!params.select || params.groupBy) return null;
  const aliases: AggregateAlias[] = [];
  for (const item of splitOdsqlList(params.select)) {
    // Découpage sans expression régulière (entrée venue de la page) :
    // `fn(` en tête, puis le DERNIER ` as ` après la parenthèse fermante.
    const lower = item.toLowerCase();
    const open = lower.indexOf('(');
    const fn = open > 0 ? lower.slice(0, open).trim() : '';
    const asAt = lower.lastIndexOf(' as ');
    if (!['count', 'sum', 'avg', 'min', 'max'].includes(fn)) return null;
    if (asAt === -1 || lower.lastIndexOf(')', asAt) < open) return null;
    const alias = item
      .slice(asAt + 4)
      .trim()
      .replace(/^`|`$/g, '');
    if (!alias) return null;
    aliases.push({ fn, alias });
  }
  return aliases.length > 0 ? aliases : null;
}

export class OpenDataSoftAdapter implements ApiAdapter {
  readonly type = 'opendatasoft';

  /**
   * Jeux dont `/exports/json` a repondu en erreur HTTP (#689) : le repli sur
   * `/records` est memorise par couple base + dataset, pour ne pas retenter
   * l'export a chaque rafraichissement d'une source qui tourne en boucle.
   * Cle volontairement grossiere : un portail sans endpoint d'export n'en a
   * pour aucune de ses requetes.
   */
  private readonly _exportUnavailable = new Set<string>();

  /** Types declares des champs, par jeu (#980) — une requete par jeu, au plus. */
  private readonly _fieldTypes = new Map<string, Promise<Record<string, FieldKind>>>();

  /** Oublie les types memorises (tests). */
  resetFieldTypesCache(): void {
    this._fieldTypes.clear();
  }

  readonly capabilities: AdapterCapabilities = {
    serverFetch: true,
    serverFacets: true,
    serverSearch: true,
    serverGroupBy: true,
    serverOrderBy: true,
    serverGeo: true,
    whereFormat: 'odsql',
  };

  /**
   * Clés que l'adaptateur construit lui-même (#726, #1137) : les clauses
   * ODSQL posées par `_applyOdsqlClauses` (`select`, `where`, `group_by`,
   * `order_by`), la pagination (`limit`, `offset`) et `facet` (facettes).
   */
  readonly reservedParamKeys: ReadonlySet<string> = new Set([
    'select',
    'where',
    'group_by',
    'order_by',
    'limit',
    'offset',
    'facet',
  ]);

  validate(params: AdapterParams): string | null {
    if (!params.datasetId) {
      return 'attribut "dataset-id" requis pour les requêtes OpenDataSoft';
    }
    return null;
  }

  /**
   * Fetch toutes les données avec pagination automatique via offset.
   * ODS limite a 100 records par requête.
   *
   * - limit > 0 : fetch exactement ce nombre de records
   * - limit = 0 : fetch TOUS les records disponibles (via total_count)
   *
   * Sur une requete avec `group_by`, ODS renvoie `total_count` = taille de
   * page, pas le nombre de groupes (#641) : la valeur est ignoree, on boucle
   * jusqu'a une page incomplete et `totalCount` reste inconnu.
   *
   * `fetch-mode="export"` (#689, ADR-106) court-circuite cette pagination :
   * une seule requete sur `/exports/json`, memes clauses ODSQL. Un echec HTTP
   * de l'export retombe une fois sur la pagination `/records` ci-dessous.
   */
  async fetchAll(params: AdapterParams, signal: AbortSignal): Promise<FetchResult> {
    // Un `select` purement agrégé se lit en UNE ligne : il passe AVANT le
    // chemin export, qui telechargerait `cap + 1` copies de la meme valeur
    // et signalerait une troncature a tort (revue du 2026-09-13).
    const aggregateOnly = aggregateOnlySelect(params);
    if (aggregateOnly) return this._fetchAggregateOnly(params, aggregateOnly, signal);

    // Delegation du regroupement refusee (#859) : le `select` de la source
    // definit une colonne que la recomposition perdrait. Les lignes arrivent
    // BRUTES et `needsClientProcessing` le dit — l'aval regroupe lui-meme.
    const delegationRefusee = this._warnSelectConflict(params);

    if (params.fetchMode === 'export' && !this._exportUnavailable.has(this._datasetKey(params))) {
      const exported = await this._fetchViaExport(params, signal);
      if (exported) return { ...exported, needsClientProcessing: delegationRefusee };
    }

    return this._fetchRecords(params, signal, delegationRefusee, null);
  }

  /**
   * La pagination `/records` elle-meme (voir `fetchAll`).
   *
   * `totalOrder` : l'`order_by` compose par `_totalOrder` quand cet appel est
   * la relecture qui le porte ; `null` pour le chargement ordinaire, dont la
   * premiere page — emise comme avant, sans rien ajouter — sert de sonde
   * (#1274). Une seule page : rien ne change. Plusieurs : la pagination par
   * `offset` n'est sure que sur un ordre TOTAL, et la lecture repart du debut
   * avec lui (une requete de plus, la sonde, et une lecture des metadonnees du
   * jeu, memorisee). Si l'API refuse cet ordre, ou s'il ne peut pas s'ecrire,
   * la pagination historique continue depuis la sonde, et c'est DIT : en
   * console et par la reserve `unstable-pagination`.
   */
  private async _fetchRecords(
    params: AdapterParams,
    signal: AbortSignal,
    delegationRefusee: boolean,
    totalOrder: string | null
  ): Promise<FetchResult> {
    const fetchAllRecords = params.limit <= 0;
    const isGrouped = Boolean(params.groupBy) && !delegationRefusee;
    // Pagination par offset gardee sans ordre total (#1274)
    let unstable = false;
    // max-records (#233) : plafond configurable — le 1000 historique n'est
    // PAS une limite de l'API ODS, defaut conserve en garde-fou
    const maxRecords =
      params.maxRecords && params.maxRecords > 0
        ? params.maxRecords
        : ODS_MAX_PAGES * ODS_PAGE_SIZE;
    const maxPages = Math.ceil(maxRecords / ODS_PAGE_SIZE);
    const requestedLimit = fetchAllRecords ? maxRecords : params.limit;
    const pageSize = ODS_PAGE_SIZE;
    const datasetKey = this._datasetKey(params);
    let allResults: unknown[] = [];
    let offset = 0;
    let totalCount = -1;
    let lastPageFull = false;

    for (let page = 0; page < maxPages; page++) {
      const remaining = requestedLimit - allResults.length;
      if (remaining <= 0) break;

      const apiUrl = this.buildUrl(
        params,
        Math.min(pageSize, remaining),
        offset,
        totalOrder ?? undefined
      );
      const url = resolveTransportUrl(apiUrl, params);

      // La PREMIERE requete qui porte l'ordre total dit si l'API l'accepte :
      // un refus (400, ou erreur reseau quand l'erreur part sans en-tete CORS)
      // rend la main a l'appelant, qui replie. Une fois l'ordre accepte pour
      // ce jeu, une panne est une panne et remonte.
      const probesTotalOrder =
        page === 0 && totalOrder !== null && !this._totalOrderAccepted.has(datasetKey);
      let response: Response;
      try {
        response = await transportFetch(url, buildFetchOptions(params, apiUrl, signal), params);
      } catch (err) {
        if (probesTotalOrder && !isAbortError(err, signal)) throw new TotalOrderRefused();
        throw err;
      }
      if (!response.ok) {
        releaseBody(response);
        if (probesTotalOrder) throw new TotalOrderRefused();
        throw httpError(response);
      }
      if (totalOrder !== null) this._totalOrderAccepted.add(datasetKey);

      const json = await response.json();
      const pageResults = json.results || [];
      allResults = allResults.concat(pageResults);
      lastPageFull = pageResults.length >= pageSize;

      if (!isGrouped && typeof json.total_count === 'number') {
        totalCount = json.total_count;
      }

      if ((totalCount >= 0 && allResults.length >= totalCount) || pageResults.length < pageSize) {
        break;
      }

      // Une page de plus va etre lue (#1274) : la sonde ne suffit pas. L'API
      // ne garantit aucun ordre sans `order_by`, et ne departage pas les
      // ex-aequo d'un tri non total : d'une page a l'autre des lignes
      // reviennent deux fois et d'autres jamais, a compte juste (mesure de
      // l'issue : 321 lignes recues, 297 distinctes). La lecture repart donc
      // du debut sur un ordre total.
      if (
        page === 0 &&
        totalOrder === null &&
        page + 1 < maxPages &&
        requestedLimit > allResults.length
      ) {
        const order = await this._totalOrder(params, params.orderBy, isGrouped);
        if (order === null || this._totalOrderRefused.has(datasetKey)) {
          unstable = true;
          this._warnUnstablePagination(params, order === null ? 'sans-cle' : 'refus');
        } else if (order !== '') {
          try {
            return await this._fetchRecords(params, signal, delegationRefusee, order);
          } catch (err) {
            if (!(err instanceof TotalOrderRefused)) throw err;
            this._totalOrderRefused.add(datasetKey);
            unstable = true;
            this._warnUnstablePagination(params, 'refus');
          }
        }
      }

      offset += pageResults.length;
    }

    // Avertir si la recuperation est incomplete : short-read sous un limit
    // explicite (anomalie serveur, comportement historique) OU troncature
    // par le plafond en fetch-all (#233 — l'ancienne condition ne se
    // declenchait jamais quand le cap etait atteint pile). Un limit
    // explicite atteint = troncature voulue, pas de warn.
    const incomplete =
      totalCount >= 0 &&
      allResults.length < totalCount &&
      (fetchAllRecords || allResults.length < requestedLimit);
    // Groupes : total inconnu, mais un plafond atteint sur une page pleine
    // laisse probablement des groupes derriere (#641). C'est le seul signal
    // de troncature disponible dans ce cas : il est expose dans le resultat
    // pour la meta de la source (#658), en plus du warn.
    const groupedAtCap =
      isGrouped && fetchAllRecords && lastPageFull && allResults.length >= maxRecords;
    if (incomplete) {
      console.warn(
        `[dsfr-data] opendatasoft: pagination incomplete - ${allResults.length}/${totalCount} resultats recuperes ` +
          `(plafond max-records: ${maxRecords} — relevable via l'attribut max-records de dsfr-data-source, #233)`
      );
    } else if (groupedAtCap) {
      console.warn(
        `[dsfr-data] opendatasoft: plafond max-records (${maxRecords}) atteint sur une requete group-by, ` +
          `des groupes peuvent manquer (total inconnu — relevable via l'attribut max-records de dsfr-data-source, #233)`
      );
    }

    return {
      data: allResults,
      totalCount: isGrouped ? undefined : totalCount >= 0 ? totalCount : allResults.length,
      needsClientProcessing: delegationRefusee,
      ...(groupedAtCap ? { truncated: true } : {}),
      ...(unstable ? { caveats: ['unstable-pagination'] as FetchCaveat[] } : {}),
    };
  }

  /**
   * Jeux pour lesquels l'API a refuse (`_totalOrderRefused`) ou accepte
   * (`_totalOrderAccepted`) un ordre total compose (#1274). Un refus est
   * retenu : l'ordre n'est plus redemande pour ce jeu, la pagination reste
   * celle d'avant, avec sa reserve. Une acceptation l'est aussi : une panne
   * ulterieure n'est alors plus prise pour un refus.
   */
  private readonly _totalOrderRefused = new Set<string>();
  private readonly _totalOrderAccepted = new Set<string>();

  /** Colonnes triables deja lues, par jeu — pour `buildServerSideUrl`, synchrone. */
  private readonly _sortableFields = new Map<string, string[]>();

  /** Jeux deja signales en console pour leur pagination sans ordre total. */
  private readonly _unstableWarned = new Set<string>();

  /** Oublie ce que l'adaptateur a retenu de l'ordre total (tests). */
  resetTotalOrderState(): void {
    this._totalOrderRefused.clear();
    this._totalOrderAccepted.clear();
    this._sortableFields.clear();
    this._unstableWarned.clear();
  }

  /**
   * Colonnes du jeu sur lesquelles l'API sait trier (#1274), dans l'ordre de
   * ses champs : celles dont le type declare est un texte, un nombre, une
   * date ou un booleen. Liste BLANCHE : un tri sur une geometrie est refuse
   * (mesure du 2026-10-12, `order_by=geo_point_2d` et `order_by=geom` →
   * 400 « Invalid field to sort on »), et un seul champ refuse fait tomber
   * toute la requete. Lues dans les metadonnees du jeu, la meme requete
   * memorisee que `describeFieldTypes`.
   */
  private async _sortableColumns(
    params: Pick<AdapterParams, 'baseUrl' | 'datasetId' | 'headers' | 'proxyUrl' | 'relayUrl'>
  ): Promise<string[]> {
    const key = this._datasetKey(params);
    const known = this._sortableFields.get(key);
    if (known) return known;
    const types = await this.describeFieldTypes(params);
    const fields = Object.entries(types)
      .filter(([, kind]) => SORTABLE_KINDS.has(kind))
      .map(([name]) => name);
    this._sortableFields.set(key, fields);
    return fields;
  }

  /**
   * `order_by` qui rend l'ordre TOTAL (#1274) : le tri demande, inchange et
   * en tete, puis une cle de departage. `''` quand il n'y a rien a ajouter,
   * `null` quand la cle ne peut pas s'ecrire.
   *
   * Cle de departage :
   * - lignes brutes : toutes les colonnes triables du jeu que le tri ne nomme
   *   pas deja (`_sortableColumns`). L'API n'a pas d'identifiant de ligne
   *   DOCUMENTE. Un champ `_record_id` existe bien et se trie (mesure du
   *   2026-10-12, data.economie.gouv.fr et data.opendatasoft.com), mais il
   *   n'est dans aucune documentation, et son tri coute le parcours de toutes
   *   les lignes retenues : 29,7 s a froid sur 1,7 million de lignes
   *   (`signalconso`), contre 5,5 s pour un tri sur ses quinze colonnes et
   *   0,2 s sans tri. Deux lignes egales sur TOUTES les colonnes triables
   *   restent indiscernables : leur permutation ne change rien, sauf si elles
   *   ne different que par une colonne non triable (geometrie, fichier) ;
   * - groupes tries : les cles du `group_by` que le tri ne nomme pas — la cle
   *   de groupe est unique. Sans tri, des groupes sortent deja ordonnes par
   *   leur cle (mesure : 262 groupes sur trois pages, tous distincts, deja
   *   tries) : rien n'est ajoute.
   */
  private async _totalOrder(
    params: AdapterParams,
    orderBy: string,
    grouped: boolean
  ): Promise<string | null> {
    // Des groupes n'ont pas besoin des colonnes du jeu : pas de requete.
    const columns = grouped ? [] : await this._sortableColumns(params);
    return this._composeTotalOrder(params, orderBy, grouped, columns);
  }

  /**
   * L'ordre total d'une page, SANS requete : `''` tant que les colonnes du
   * jeu n'ont pas ete lues (lignes brutes) ou que l'API a refuse l'ordre.
   */
  private _knownTotalOrder(params: AdapterParams, orderBy: string): string {
    const key = this._datasetKey(params);
    if (this._totalOrderRefused.has(key)) return '';
    const grouped = Boolean(params.groupBy) && this._delegatesGroupBy(params);
    const columns = this._sortableFields.get(key);
    if (!grouped && !columns) return '';
    return this._composeTotalOrder(params, orderBy, grouped, columns ?? []) ?? '';
  }

  /** `_totalOrder`, les colonnes triables du jeu etant deja connues. */
  private _composeTotalOrder(
    params: AdapterParams,
    orderBy: string,
    grouped: boolean,
    columns: string[]
  ): string | null {
    const parts = parseOrderBy(orderBy || '');
    const sorted = new Set(parts.map((p) => p.field.replace(/`/g, '').trim()));
    let tie: string[];
    if (grouped) {
      if (parts.length === 0) return '';
      const keys = splitOdsqlList(params.groupBy).map(odsqlGroupKey);
      if (keys.some((k) => k === null)) return null;
      tie = (keys as string[]).filter((k) => !sorted.has(k));
      if (tie.length === 0) return '';
    } else {
      // Aucune colonne lue (metadonnees illisibles, jeu sans colonne triable) :
      // pas de cle.
      if (columns.length === 0) return null;
      tie = columns.filter((f) => !sorted.has(f));
      // Le tri nomme deja toutes les colonnes triables : il est aussi total
      // qu'il peut l'etre.
      if (tie.length === 0) return '';
    }
    return [
      ...parts.map((p) => `${p.field} ${p.direction.toUpperCase()}`),
      ...tie.map(escapeOdsqlIdentifier),
    ].join(', ');
  }

  /**
   * Pagination par offset gardee sans ordre total (#1274) : dit une fois par
   * jeu, en nommant la cause et l'issue.
   */
  private _warnUnstablePagination(
    params: Pick<AdapterParams, 'baseUrl' | 'datasetId'>,
    cause: 'refus' | 'sans-cle'
  ): void {
    const key = this._datasetKey(params);
    if (this._unstableWarned.has(key)) return;
    this._unstableWarned.add(key);
    console.warn(
      `[dsfr-data] opendatasoft: pagination de "${params.datasetId}" sans ordre total — ` +
        (cause === 'refus'
          ? `l'API a refusé le tri de départage ajouté par l'adaptateur`
          : `aucune clé de départage n'a pu être écrite (colonnes du jeu illisibles, ou clé de regroupement sans alias)`) +
        ` : l'API pagine par offset sans garantir l'ordre, des lignes peuvent manquer ou revenir ` +
        `deux fois d'une page à l'autre, à compte juste. Posez un order-by sur une colonne ` +
        `unique, ou chargez le jeu en une requête avec fetch-mode="export" (#1274).`
    );
  }

  /**
   * `select` purement agrégé, sans `group_by` (#810) : UNE requête d'une
   * ligne. Opendatasoft renvoie la valeur agrégée RÉPÉTÉE sur chaque ligne du
   * jeu (`select=count(*)` : 3 080 lignes valant 3 080) avec `total_count` =
   * nombre de lignes — la pagination courait donc jusqu'au plafond pour des
   * copies. Et un filtre qui ne garde rien renvoie `results: []` au lieu
   * d'une ligne à zéro : la ligne est alors synthétisée, `count` à 0, les
   * autres fonctions à `null` (une somme ou une moyenne d'aucune ligne n'est
   * pas un nombre). `totalCount` reste inconnu : ce n'est pas un nombre de
   * lignes, et un « tronqué » serait une fausse alerte.
   */
  private async _fetchAggregateOnly(
    params: AdapterParams,
    aliases: AggregateAlias[],
    signal: AbortSignal
  ): Promise<FetchResult> {
    const apiUrl = this.buildUrl(params, 1, 0);
    const response = await transportFetch(
      resolveTransportUrl(apiUrl, params),
      buildFetchOptions(params, apiUrl, signal),
      params
    );
    if (!response.ok) throw httpError(response);
    const json = await response.json();
    const first = Array.isArray(json.results) ? json.results[0] : undefined;
    const row =
      first ?? Object.fromEntries(aliases.map((a) => [a.alias, a.fn === 'count' ? 0 : null]));
    return { data: [row], totalCount: undefined, needsClientProcessing: false };
  }

  /**
   * Fetch une seule page en mode server-side. Avec `group_by`, `total_count`
   * n'est pas fiable (taille de page, #641) : `totalCount` reste inconnu.
   *
   * Chaque page est demandee sur un ordre TOTAL (#1274) : le tri de l'overlay
   * puis la cle de departage de `_totalOrder`. Les pages sont servies une a
   * une, le jeu n'est jamais relu : seul le serveur peut tenir l'ordre d'une
   * page a l'autre (mesure de l'issue : 321 lignes feuilletees par 10 sans
   * tri, 237 a 254 distinctes). Si l'API refuse cet ordre, la page est
   * redemandee comme avant, et la reserve `unstable-pagination` le dit.
   */
  async fetchPage(
    params: AdapterParams,
    overlay: ServerSideOverlay,
    signal: AbortSignal
  ): Promise<FetchResult> {
    // Meme refus qu'en fetch complet (#859) : sans `group_by` dans l'URL, la
    // page est faite de lignes brutes et `total_count` redevient fiable.
    const delegationRefusee = this._warnSelectConflict(params);
    const grouped = Boolean(params.groupBy) && !delegationRefusee;
    const datasetKey = this._datasetKey(params);

    const order = await this._totalOrder(params, overlay.orderBy, grouped);
    const request = async (totalOrder: string): Promise<Response> => {
      const apiUrl = this.buildServerSideUrl(params, overlay, totalOrder);
      const res = await transportFetch(
        resolveTransportUrl(apiUrl, params),
        buildFetchOptions(params, apiUrl, signal),
        params
      );
      if (!res.ok) throw httpError(res);
      return res;
    };

    let response: Response | null = null;
    if (order && !this._totalOrderRefused.has(datasetKey)) {
      try {
        response = await request(order);
        this._totalOrderAccepted.add(datasetKey);
      } catch (err) {
        // Une annulation n'est pas un refus ; un ordre deja accepte non plus.
        if (isAbortError(err, signal) || this._totalOrderAccepted.has(datasetKey)) throw err;
      }
    }
    // Sans ordre total : la page d'avant. Si elle echoue aussi, la panne ne
    // venait pas du tri ajoute — elle remonte, et rien n'est retenu.
    let unstable = order === null;
    if (!response) {
      response = await request('');
      if (order) {
        this._totalOrderRefused.add(datasetKey);
        unstable = true;
      }
    }
    if (unstable) this._warnUnstablePagination(params, order === null ? 'sans-cle' : 'refus');

    const json = await response.json();
    const data = json.results || [];
    const totalCount =
      params.groupBy && !delegationRefusee
        ? undefined
        : typeof json.total_count === 'number'
          ? json.total_count
          : 0;

    return {
      data,
      totalCount,
      needsClientProcessing: delegationRefusee,
      rawJson: json,
      ...(unstable ? { caveats: ['unstable-pagination'] as FetchCaveat[] } : {}),
    };
  }

  /**
   * Construit une URL ODS pour le fetch complet (avec pagination).
   * limitOverride et pageOrOffsetOverride controlent la pagination per-page.
   */
  buildUrl(
    params: AdapterParams,
    limitOverride?: number,
    pageOrOffsetOverride?: number,
    totalOrder?: string
  ): string {
    const url = new URL(`${this._datasetUrl(params)}/records`);
    this._applyOdsqlClauses(url, params);
    // Ordre total (#1274) : compose par `_totalOrder`, il remplace le tri
    // demande, qu'il reprend en tete.
    if (totalOrder) url.searchParams.set('order_by', totalOrder);

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
   * Construit l'URL de l'endpoint d'export JSON (#689) : memes clauses ODSQL
   * que `/records` (meme echappement, meme traduction du tri), un seul
   * `limit` qui porte sur la requete entiere et non sur une page.
   */
  buildExportUrl(params: AdapterParams, limitOverride?: number): string {
    const url = new URL(`${this._datasetUrl(params)}/exports/json`);
    this._applyOdsqlClauses(url, params);
    if (limitOverride !== undefined) {
      url.searchParams.set('limit', String(limitOverride));
    }
    return url.toString();
  }

  /**
   * Construit l'URL ODS en mode server-side (une seule page).
   *
   * Ne partage pas `_applyOdsqlClauses` (l'overlay porte son propre `where` et
   * son propre tri), mais pose les memes parametres de passe-plat (#726) : un
   * `timezone` doit valoir sur un tableau pagine comme sur un chargement
   * complet, sinon activer `server-side` decalerait les dates en silence.
   *
   * `totalOrder` (#1274) : l'`order_by` compose par `_totalOrder`, pose par
   * `fetchPage` ; `''` pour le tri de l'overlay seul (le repli). Absent
   * (appel de diagnostic, hors chargement) : l'ordre total est recompose si
   * les colonnes du jeu ont deja ete lues et que l'API ne l'a pas refuse —
   * l'URL montree est alors celle qui part.
   */
  buildServerSideUrl(
    params: AdapterParams,
    overlay: ServerSideOverlay,
    totalOrder?: string
  ): string {
    const base = params.baseUrl || 'https://data.opendatasoft.com';
    const url = new URL(`${base}/api/explore/v2.1/catalog/datasets/${params.datasetId}/records`);

    this._applyExtraParams(url, params);

    // SELECT
    const select = this._effectiveSelect(params);
    if (select) {
      url.searchParams.set('select', select);
    }

    // WHERE: merge statique + dynamique
    if (overlay.effectiveWhere) {
      url.searchParams.set('where', overlay.effectiveWhere);
    }

    // GROUP BY
    if (params.groupBy && this._delegatesGroupBy(params)) {
      url.searchParams.set('group_by', escapeOdsqlGroupBy(params.groupBy));
    }

    // ORDER BY: overlay prioritaire, fallback statique
    const effectiveOrderBy = overlay.orderBy;
    const composed = totalOrder ?? this._knownTotalOrder(params, effectiveOrderBy);
    if (composed) {
      url.searchParams.set('order_by', composed);
    } else if (effectiveOrderBy) {
      url.searchParams.set('order_by', toOdsOrderBy(effectiveOrderBy));
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
    params: Pick<AdapterParams, 'baseUrl' | 'datasetId' | 'headers' | 'proxyUrl' | 'relayUrl'>,
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

    const response = await transportFetch(
      resolveTransportUrl(url.toString(), params),
      buildFetchOptions(params, url.toString(), signal),
      params
    );
    if (!response.ok) {
      throw httpError(response);
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

  /**
   * Decouverte des facettes declarees par le jeu (#680). Source principale :
   * les metadonnees du jeu (`/datasets/ID`), dont `fields[]` porte
   * `annotations.facet` ET le `type` — c'est le seul endroit qui dit qu'un
   * champ est une date (l'endpoint /facets ne renvoie ni type ni forme
   * hierarchique sans refine, verifie sur data.economie.gouv.fr). Repli sur
   * `/facets` sans parametre (noms seuls, sans type) si les metadonnees
   * n'exposent aucune facette.
   */
  async discoverFacets(
    params: Pick<AdapterParams, 'baseUrl' | 'datasetId' | 'headers' | 'proxyUrl' | 'relayUrl'>,
    signal?: AbortSignal
  ): Promise<FacetDescriptor[]> {
    const base = params.baseUrl || 'https://data.opendatasoft.com';
    const datasetUrl = `${base}/api/explore/v2.1/catalog/datasets/${params.datasetId}`;

    const metaResponse = await transportFetch(
      resolveTransportUrl(datasetUrl, params),
      buildFetchOptions(params, datasetUrl, signal),
      params
    );
    if (metaResponse.ok) {
      const meta = (await metaResponse.json()) as {
        fields?: Array<{
          name: string;
          label?: string;
          type?: string;
          annotations?: { facet?: boolean };
        }>;
      };
      const declared = (meta.fields ?? []).filter((f) => f.annotations?.facet === true);
      if (declared.length > 0) {
        return declared.map((f) => ({
          field: f.name,
          label: f.label || undefined,
          isDate: f.type === 'date' || f.type === 'datetime',
        }));
      }
    } else {
      releaseBody(metaResponse);
    }

    // Repli : /facets sans parametre liste les facettes servies (noms seuls)
    const facetsUrl = `${datasetUrl}/facets`;
    const response = await transportFetch(
      resolveTransportUrl(facetsUrl, params),
      buildFetchOptions(params, facetsUrl, signal),
      params
    );
    if (!response.ok) {
      throw httpError(response);
    }
    const json = (await response.json()) as { facets?: Array<{ name: string }> };
    return (json.facets ?? []).map((f) => ({ field: f.name }));
  }

  /**
   * Types declares des champs, lus dans les metadonnees du jeu
   * (`/datasets/ID`, `fields[].type`) — memorises par portail + jeu (#980).
   *
   * Seul consommateur : l'avertissement « comparee en TEXTE » (#924), et
   * seulement quand une valeur a zero de tete vise un champ que les lignes
   * de la source ne montrent pas. Un echec (reseau, 403, JSON inattendu)
   * rend un objet vide : ne rien savoir, c'est se taire. Le resultat vide
   * est memorise lui aussi, pour ne pas retenter a chaque geste.
   */
  describeFieldTypes(
    params: Pick<AdapterParams, 'baseUrl' | 'datasetId' | 'headers' | 'proxyUrl' | 'relayUrl'>
  ): Promise<Record<string, FieldKind>> {
    const key = this._datasetKey(params);
    const known = this._fieldTypes.get(key);
    if (known) return known;
    const datasetUrl = this._datasetUrl(params);
    const pending = (async (): Promise<Record<string, FieldKind>> => {
      try {
        const response = await transportFetch(
          resolveTransportUrl(datasetUrl, params),
          buildFetchOptions(params, datasetUrl),
          params
        );
        if (!response.ok) {
          releaseBody(response);
          return {};
        }
        const meta = (await response.json()) as {
          fields?: Array<{ name?: unknown; type?: unknown }>;
        };
        const types: Record<string, FieldKind> = {};
        for (const f of Array.isArray(meta?.fields) ? meta.fields : []) {
          if (typeof f?.name === 'string' && typeof f.type === 'string') {
            types[f.name] = odsFieldKind(f.type);
          }
        }
        return types;
      } catch {
        return {};
      }
    })();
    this._fieldTypes.set(key, pending);
    return pending;
  }

  /**
   * Dialecte ODSQL (#1135) : la clause colon des composants traduite par
   * `filterToOdsql` — le même traducteur, lib-safe, que l'export HTML.
   */
  translateWhere(colonWhere: string): string {
    return ODSQL_WHERE_DIALECT.translate(colonWhere);
  }

  /**
   * Ce que le portail calcule COMME le client (#1285). Son `like` compare des
   * MOTS : `categorie_produit like "%aliment%"` rend 0 ligne là où 14 366
   * valent « alimentation » (mesuré le 2026-10-12). `contains` et
   * `notcontains`, recherches de sous-chaîne, n'ont donc aucun équivalent
   * ODSQL et restent au client ; `wordstart` part en `like "mot*"`, sauf
   * quand un mot de la saisie porte un signe entre deux chiffres. Table de vérité partagée avec
   * les exports : `serverComputesClause` de `@dsfr-data/shared`.
   */
  supportsServerClause(clause: string): boolean {
    return serverComputesClause(this.type, clause);
  }

  /** Clauses ODSQL jointes par ` AND ` (#271, #1135). */
  joinWhere(clauses: string[]): string {
    return ODSQL_WHERE_DIALECT.join(clauses);
  }

  /** Terme libre inséré entre guillemets : `\` et `"` échappés (#271, #1135). */
  escapeSearchTerm(term: string): string {
    return ODSQL_WHERE_DIALECT.escape(term);
  }

  /**
   * Zone visible d'une carte (#1149) : `in_bbox(champ, sud, ouest, nord, est)`
   * sur une colonne géographique (`geo_point_2d`, `geo_shape`…). Deux colonnes
   * latitude / longitude séparées n'ont pas d'équivalent ici : `null`, la
   * couche filtre dans le navigateur.
   */
  buildBboxWhere(target: BboxTarget, bounds: BboxBounds): string | null {
    if (!('field' in target) || !target.field) return null;
    return `in_bbox(${target.field}, ${bounds.south}, ${bounds.west}, ${bounds.north}, ${bounds.east})`;
  }

  /** Source de verite : OPENDATASOFT_CONFIG.query.searchTemplate (#285) */
  getDefaultSearchTemplate(): string | null {
    return this.getProviderConfig().query.searchTemplate ?? null;
  }

  getProviderConfig(): ProviderConfig {
    return ODS_CONFIG;
  }

  /**
   * Where de facettes en ODSQL. Sur un champ date (`options.dateFields`),
   * une valeur annuelle `YYYY` — forme servie par /facets sur ce type —
   * devient l'intervalle `champ >= date'YYYY-01-01' AND champ < date'YYYY+1-01-01'` :
   * l'egalite `champ = "2022"` est refusee (400 IncompatibleTypesInComparisonFilter, #676).
   */
  buildFacetWhere(
    selections: Record<string, Set<string>>,
    excludeField?: string,
    options?: FacetWhereOptions
  ): string {
    const parts: string[] = [];
    for (const [field, values] of Object.entries(selections)) {
      if (field === excludeField || values.size === 0) continue;
      if (options?.dateFields?.has(field)) {
        const dateParts = [...values].map((v) => odsDateFacetClause(field, v));
        parts.push(dateParts.length === 1 ? dateParts[0] : `(${dateParts.join(' OR ')})`);
        continue;
      }
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

  /** Delegue au parseur partage (convention d'alias unique field__fn, #269) */
  parseAggregates(aggExpr: string): QueryAggregate[] {
    return parseAggregates(aggExpr);
  }

  /** Racine du jeu de donnees : `{base}/api/explore/v2.1/catalog/datasets/{id}` */
  private _datasetUrl(params: Pick<AdapterParams, 'baseUrl' | 'datasetId'>): string {
    const base = params.baseUrl || 'https://data.opendatasoft.com';
    return `${base}/api/explore/v2.1/catalog/datasets/${params.datasetId}`;
  }

  /** Cle de memorisation du repli export (#689) : un jeu sur un portail */
  private _datasetKey(params: Pick<AdapterParams, 'baseUrl' | 'datasetId'>): string {
    return this._datasetUrl(params);
  }

  /**
   * Pose les clauses ODSQL communes a `/records` et `/exports/json` (#689) :
   * `select` (explicite ou derive de l'agregat), `where`, `group_by` echappe
   * (#641/#289) et `order_by` traduit. La pagination reste a l'appelant, elle
   * n'a pas le meme sens sur les deux endpoints.
   *
   * Les parametres de passe-plat (#726) sont poses EN PREMIER : une clause
   * construite par la bibliotheque doit toujours gagner, meme si la liste
   * noire de la source laissait passer une cle reservee.
   */
  private _applyOdsqlClauses(url: URL, params: AdapterParams): void {
    this._applyExtraParams(url, params);

    const select = this._effectiveSelect(params);
    if (select) {
      url.searchParams.set('select', select);
    }

    const whereClause = params.where || params.filter;
    if (whereClause) {
      url.searchParams.set('where', whereClause);
    }

    if (params.groupBy && this._delegatesGroupBy(params)) {
      url.searchParams.set('group_by', escapeOdsqlGroupBy(params.groupBy));
    }

    if (params.orderBy) {
      url.searchParams.set('order_by', toOdsOrderBy(params.orderBy));
    }
  }

  /**
   * Pose les parametres de requete que la bibliotheque ne modelise pas (#726),
   * tels que l'attribut `params` de la source les a transmis : `timezone`,
   * `lang`, `pretty`... Les cles reservees ont deja ete ecartees en amont
   * (`dsfr-data-source`), ou elles produisent une erreur de configuration.
   */
  private _applyExtraParams(url: URL, params: AdapterParams): void {
    if (!params.extraParams) return;
    for (const [key, value] of Object.entries(params.extraParams)) {
      url.searchParams.set(key, value);
    }
  }

  /**
   * Plafond de lignes effectif d'un `fetchAll`, memes regles qu'en mode
   * `records` : `max-records` s'il est pose (sinon le garde-fou historique de
   * 1 000), rabote par un `limit` explicite plus petit.
   */
  private _effectiveCap(params: AdapterParams): number {
    const maxRecords =
      params.maxRecords && params.maxRecords > 0
        ? params.maxRecords
        : ODS_MAX_PAGES * ODS_PAGE_SIZE;
    return params.limit > 0 ? Math.min(params.limit, maxRecords) : maxRecords;
  }

  /**
   * Charge le jeu en une requete via `/exports/json` (#689, ADR-106).
   *
   * La reponse est un **tableau nu** : pas de `total_count`, donc la garde
   * `max-records` (#233) et le signal `truncated` (#658) reposent sur le
   * `limit = plafond + 1` — une ligne de trop signe une troncature.
   *
   * Retourne `null` quand l'export a repondu en erreur HTTP (portail sans
   * endpoint d'export, clause refusee) : l'appelant repasse par `/records`,
   * et le repli est memorise pour ce jeu. Une erreur reseau (abandon, hors
   * ligne) n'est pas un repli et remonte telle quelle.
   */
  private async _fetchViaExport(
    params: AdapterParams,
    signal: AbortSignal
  ): Promise<FetchResult | null> {
    const cap = this._effectiveCap(params);
    const apiUrl = this.buildExportUrl(params, cap + 1);
    const url = resolveTransportUrl(apiUrl, params);

    const response = await transportFetch(url, buildFetchOptions(params, apiUrl, signal), params);
    if (!response.ok) {
      releaseBody(response);
      // Seul un 404 dit que l'export n'existe pas pour ce JEU (#1199, BUG-027).
      // Un 400 vise la CLAUSE (un `where` sur un alias d'agrégat, refusé par
      // le portail) : le memoriser condamnait l'export du jeu entier pour
      // toutes les sources de la page, et la clause suivante, valide, n'y
      // aurait plus eu droit. Un 429 ou un 5xx est transitoire. Dans tous ces
      // cas on replie cette fois-ci, sans condamner l'export.
      const definitive = response.status === 404;
      if (definitive) this._exportUnavailable.add(this._datasetKey(params));
      console.warn(
        `[dsfr-data] opendatasoft: export JSON indisponible pour "${params.datasetId}" ` +
          `(HTTP ${response.status} ${response.statusText}) — repli sur /records pour cette source` +
          (definitive
            ? `, l'export ne sera plus retente (fetch-mode="export", #689)`
            : `, l'export sera retente au prochain chargement`)
      );
      return null;
    }

    const json = await response.json();
    const rows: unknown[] = Array.isArray(json) ? json : json?.results || [];

    const truncated = rows.length > cap;
    if (truncated) {
      console.warn(
        `[dsfr-data] opendatasoft: export JSON tronque a ${cap} lignes pour "${params.datasetId}" ` +
          `(total inconnu — plafond relevable via l'attribut max-records de dsfr-data-source, #233)`
      );
    }

    return {
      data: truncated ? rows.slice(0, cap) : rows,
      // L'export ne renvoie pas de total : inconnu, jamais une sentinelle (#270)
      totalCount: undefined,
      needsClientProcessing: false,
      ...(truncated ? { truncated: true } : {}),
    };
  }

  /**
   * Le `select` explicite de la source empeche-t-il la delegation du
   * regroupement (#859) ? Rend la colonne fautive, ou null.
   *
   * Un `group-by` delegue recompose le `select` depuis l'agregat : les
   * colonnes declarees par la source disparaissent de la requete. C'est sans
   * consequence tant que le regroupement et l'agregat ne portent que sur des
   * CHAMPS du jeu de donnees. Mais si l'un d'eux vise une colonne que seul le
   * `select` de la source sait produire (`year(date) as annee` + un
   * `group-by="annee"`), la recomposition perdrait sa definition et l'API
   * repondrait sur un champ inconnu : la delegation est alors refusee.
   */
  private _selectConflict(params: AdapterParams): string | null {
    if (!params.select || !params.groupBy || !params.aggregate) return null;
    const derived = odsqlDerivedAliases(params.select);
    if (derived.size === 0) return null;

    const referenced: string[] = [];
    for (const item of splitOdsqlList(params.groupBy)) {
      const bare = item.replace(/`/g, '').trim();
      // Un element de group-by qui porte lui-meme sa definition
      // (`year(date) as annee`) n'a rien a emprunter au select de la source.
      if (bare && !isOdsqlExpression(bare)) referenced.push(bare);
    }
    for (const agg of this.parseAggregates(params.aggregate)) {
      // `count` devient `count(*)` : il ne lit aucune colonne.
      if (agg.function !== 'count' && agg.field)
        referenced.push(agg.field.replace(/`/g, '').trim());
    }

    return referenced.find((f) => derived.has(f)) ?? null;
  }

  /** True quand le `group_by` part au serveur (#859). */
  private _delegatesGroupBy(params: AdapterParams): boolean {
    return this._selectConflict(params) === null;
  }

  /**
   * `select` reellement emis (#859).
   *
   * Sur un regroupement avec agregat, il est COMPOSE depuis l'agregat — le
   * `select` de la source ne doit pas l'ecraser, sans quoi la requete part
   * sans `count(champ) as nb`, la colonne d'alias n'existe pas, et la query,
   * qui a marque la delegation et saute son calcul client, affiche 0.
   * (Mesure du banc : `nb:sum` et `nb:max` a 0 pour 3 458 et 224.)
   * La composition emporte deja les colonnes du `group-by`.
   *
   * Quand le `select` explicite est INCOMPATIBLE (`_selectConflict`), il est
   * conserve tel quel : la delegation est refusee et le regroupement revient
   * au client.
   */
  private _effectiveSelect(params: AdapterParams): string | undefined {
    if (params.aggregate && params.groupBy && this._delegatesGroupBy(params)) {
      return this._buildSelectFromAggregate(params);
    }
    if (params.select) return escapeOdsqlSelect(params.select);
    return undefined;
  }

  /**
   * Avertit, en le nommant, du refus de delegation du regroupement (#859).
   * Rend true quand la delegation est refusee — l'appelant pose alors
   * `needsClientProcessing`, et l'aval recalcule sur les lignes brutes.
   */
  private _warnSelectConflict(params: AdapterParams): boolean {
    const conflit = this._selectConflict(params);
    if (!conflit) return false;
    console.warn(
      `[dsfr-data] opendatasoft: group-by non délégué — la colonne "${conflit}" n'est définie que ` +
        `par le select de la source (select="${params.select}") et ne survivrait pas à la ` +
        `recomposition du select depuis l'agrégat (group-by="${params.groupBy}", ` +
        `aggregate="${params.aggregate}") — lignes brutes renvoyées, regroupement calculé côté client`
    );
    return true;
  }

  /**
   * Convertit aggregate="field:func" + group-by en syntaxe ODS select.
   */
  private _buildSelectFromAggregate(params: AdapterParams): string {
    const aggregates = this.parseAggregates(params.aggregate);
    const selectParts: string[] = [];

    for (const agg of aggregates) {
      // Identifiants echappes (#289) : un champ a espaces rend aussi son
      // alias par defaut (field__fn) non sur — echapper les deux
      // `distinct` (#672) : ODSQL `count(distinct champ)`, alias champ__distinct
      const odsFunc =
        agg.function === 'count'
          ? 'count(*)'
          : agg.function === 'distinct'
            ? `count(distinct ${escapeOdsqlIdentifier(agg.field)})`
            : `${agg.function}(${escapeOdsqlIdentifier(agg.field)})`;
      const alias = agg.alias || `${agg.field}__${agg.function}`;
      selectParts.push(`${odsFunc} as ${escapeOdsqlIdentifier(alias)}`);
    }

    // Une expression (`year(d) as annee`, `periode as an`) est reprise telle
    // quelle dans le select : ODS accepte l'expression aliasee des deux cotes
    // (#641). Meme decoupe et meme classement que le group_by (#767).
    for (const gf of splitOdsqlList(params.groupBy)) {
      selectParts.push(escapeOdsqlListItem(gf));
    }

    return selectParts.join(', ');
  }
}
