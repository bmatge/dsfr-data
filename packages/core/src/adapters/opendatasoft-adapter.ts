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
  ServerSideOverlay,
  FacetResult,
  FacetDescriptor,
  FacetWhereOptions,
} from './api-adapter.js';
import type { QueryAggregate } from '../components/dsfr-data-query.js';
import { parseAggregates } from '../utils/aggregates.js';
import { parseOrderBy } from '../utils/where.js';
import type { ProviderConfig } from '@dsfr-data/shared/lib';
import { ODS_CONFIG, getProxiedUrl, normalizeProviderAuthHeaders } from '@dsfr-data/shared/lib';

/**
 * Échappe une chaîne destinée à être interpolée dans une string ODSQL (`"…"`).
 * Ordre crucial : backslashes d'abord (sinon les `\"` qu'on ajoute seraient
 * ré-échappés), puis les doubles quotes.
 */
function escapeOdsqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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

    const fetchAllRecords = params.limit <= 0;
    const isGrouped = Boolean(params.groupBy) && !delegationRefusee;
    // max-records (#233) : plafond configurable — le 1000 historique n'est
    // PAS une limite de l'API ODS, defaut conserve en garde-fou
    const maxRecords =
      params.maxRecords && params.maxRecords > 0
        ? params.maxRecords
        : ODS_MAX_PAGES * ODS_PAGE_SIZE;
    const maxPages = Math.ceil(maxRecords / ODS_PAGE_SIZE);
    const requestedLimit = fetchAllRecords ? maxRecords : params.limit;
    const pageSize = ODS_PAGE_SIZE;
    let allResults: unknown[] = [];
    let offset = 0;
    let totalCount = -1;
    let lastPageFull = false;

    for (let page = 0; page < maxPages; page++) {
      const remaining = requestedLimit - allResults.length;
      if (remaining <= 0) break;

      const apiUrl = this.buildUrl(params, Math.min(pageSize, remaining), offset);
      const url = getProxiedUrl(apiUrl, params.proxyUrl);

      const response = await fetch(url, buildFetchOptions(params, apiUrl, signal));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

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
    };
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
    const response = await fetch(
      getProxiedUrl(apiUrl, params.proxyUrl),
      buildFetchOptions(params, apiUrl, signal)
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const json = await response.json();
    const first = Array.isArray(json.results) ? json.results[0] : undefined;
    const row =
      first ?? Object.fromEntries(aliases.map((a) => [a.alias, a.fn === 'count' ? 0 : null]));
    return { data: [row], totalCount: undefined, needsClientProcessing: false };
  }

  /**
   * Fetch une seule page en mode server-side. Avec `group_by`, `total_count`
   * n'est pas fiable (taille de page, #641) : `totalCount` reste inconnu.
   */
  async fetchPage(
    params: AdapterParams,
    overlay: ServerSideOverlay,
    signal: AbortSignal
  ): Promise<FetchResult> {
    const apiUrl = this.buildServerSideUrl(params, overlay);
    const url = getProxiedUrl(apiUrl, params.proxyUrl);
    // Meme refus qu'en fetch complet (#859) : sans `group_by` dans l'URL, la
    // page est faite de lignes brutes et `total_count` redevient fiable.
    const delegationRefusee = this._warnSelectConflict(params);

    const response = await fetch(url, buildFetchOptions(params, apiUrl, signal));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

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
    };
  }

  /**
   * Construit une URL ODS pour le fetch complet (avec pagination).
   * limitOverride et pageOrOffsetOverride controlent la pagination per-page.
   */
  buildUrl(params: AdapterParams, limitOverride?: number, pageOrOffsetOverride?: number): string {
    const url = new URL(`${this._datasetUrl(params)}/records`);
    this._applyOdsqlClauses(url, params);

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
   */
  buildServerSideUrl(params: AdapterParams, overlay: ServerSideOverlay): string {
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
    if (effectiveOrderBy) {
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
    params: Pick<AdapterParams, 'baseUrl' | 'datasetId' | 'headers' | 'proxyUrl'>,
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

    const response = await fetch(
      getProxiedUrl(url.toString(), params.proxyUrl),
      buildFetchOptions(params, url.toString(), signal)
    );
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
    params: Pick<AdapterParams, 'baseUrl' | 'datasetId' | 'headers' | 'proxyUrl'>,
    signal?: AbortSignal
  ): Promise<FacetDescriptor[]> {
    const base = params.baseUrl || 'https://data.opendatasoft.com';
    const datasetUrl = `${base}/api/explore/v2.1/catalog/datasets/${params.datasetId}`;

    const metaResponse = await fetch(
      getProxiedUrl(datasetUrl, params.proxyUrl),
      buildFetchOptions(params, datasetUrl, signal)
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
    }

    // Repli : /facets sans parametre liste les facettes servies (noms seuls)
    const facetsUrl = `${datasetUrl}/facets`;
    const response = await fetch(
      getProxiedUrl(facetsUrl, params.proxyUrl),
      buildFetchOptions(params, facetsUrl, signal)
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const json = (await response.json()) as { facets?: Array<{ name: string }> };
    return (json.facets ?? []).map((f) => ({ field: f.name }));
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
    const url = getProxiedUrl(apiUrl, params.proxyUrl);

    const response = await fetch(url, buildFetchOptions(params, apiUrl, signal));
    if (!response.ok) {
      // Seule une reponse 4xx (hors 429) dit que l'export n'existe pas pour ce
      // jeu : un 429 ou un 5xx est transitoire, on replie cette fois-ci sans
      // condamner l'export pour la session (revue du 2026-09-13).
      const definitive = response.status >= 400 && response.status < 500 && response.status !== 429;
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
