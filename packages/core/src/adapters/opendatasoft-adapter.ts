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
 * Echappe un identifiant ODSQL (#289) : les noms simples passent tels quels
 * (lisibilite des URLs), les champs avec espaces/ponctuation sont entoures
 * de backquotes — "Date - Journee gaziere" cassait l'ODSQL (Grist echappe
 * systematiquement). Les backquotes internes sont retirees (interdites dans
 * les noms de champs ODS).
 */
function escapeOdsqlIdentifier(field: string): string {
  if (/^[A-Za-z0-9_]+$/.test(field)) return field;
  return '`' + field.replace(/`/g, '') + '`';
}

/**
 * Un element de group-by est soit un nom de champ, soit une expression ODSQL
 * (`year(d) as annee`, #641). Une expression contient une parenthese ouvrante
 * et passe telle quelle : la backquoter en ferait un nom de champ inconnu
 * (HTTP 400 "Unknown field"). Un nom de champ a espaces (#289) reste echappe.
 *
 * Cas de bascule assume : un nom de champ contenant lui-meme une parenthese
 * ("Date (jour)") est traite comme une expression et n'est plus echappe. ODS
 * impose des noms techniques de champ en `[a-z0-9_]` (les libelles a espaces
 * ou parentheses sont des labels, pas des identifiants ODSQL) — un tel cas
 * ne se rencontre pas en pratique, et une expression avec `(` est le cas
 * reel a servir.
 */
function isOdsqlExpression(field: string): boolean {
  return field.includes('(');
}

/** Echappe un element de group-by : identifiant echappe, expression brute */
function escapeOdsqlGroupField(field: string): string {
  return isOdsqlExpression(field) ? field : escapeOdsqlIdentifier(field);
}

/** Decoupe une liste group-by "a, b" en elements non vides */
function splitGroupBy(groupBy: string): string[] {
  return groupBy
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
}

/** Echappe chaque champ d'une liste group-by "a, b" → "a,`b c`" */
function escapeOdsqlGroupBy(groupBy: string): string {
  return splitGroupBy(groupBy).map(escapeOdsqlGroupField).join(',');
}

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
   */
  async fetchAll(params: AdapterParams, signal: AbortSignal): Promise<FetchResult> {
    const fetchAllRecords = params.limit <= 0;
    const isGrouped = Boolean(params.groupBy);
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
          `(plafond max-records: ${maxRecords} — relevable via l'attribut max-records, #233)`
      );
    } else if (groupedAtCap) {
      console.warn(
        `[dsfr-data] opendatasoft: plafond max-records (${maxRecords}) atteint sur une requete group-by, ` +
          `des groupes peuvent manquer (total inconnu — relevable via l'attribut max-records, #233)`
      );
    }

    return {
      data: allResults,
      totalCount: isGrouped ? undefined : totalCount >= 0 ? totalCount : allResults.length,
      needsClientProcessing: false,
      ...(groupedAtCap ? { truncated: true } : {}),
    };
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

    const response = await fetch(url, buildFetchOptions(params, apiUrl, signal));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    const data = json.results || [];
    const totalCount = params.groupBy
      ? undefined
      : typeof json.total_count === 'number'
        ? json.total_count
        : 0;

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
      url.searchParams.set('group_by', escapeOdsqlGroupBy(params.groupBy));
    }

    if (params.orderBy) {
      url.searchParams.set('order_by', toOdsOrderBy(params.orderBy));
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

  /**
   * Convertit aggregate="field:func" + group-by en syntaxe ODS select.
   */
  private _buildSelectFromAggregate(params: AdapterParams): string {
    const aggregates = this.parseAggregates(params.aggregate);
    const selectParts: string[] = [];

    for (const agg of aggregates) {
      // Identifiants echappes (#289) : un champ a espaces rend aussi son
      // alias par defaut (field__fn) non sur — echapper les deux
      const odsFunc =
        agg.function === 'count'
          ? 'count(*)'
          : `${agg.function}(${escapeOdsqlIdentifier(agg.field)})`;
      const alias = agg.alias || `${agg.field}__${agg.function}`;
      selectParts.push(`${odsFunc} as ${escapeOdsqlIdentifier(alias)}`);
    }

    // Une expression (`year(d) as annee`) est reprise telle quelle dans le
    // select : ODS accepte l'expression aliasee des deux cotes (#641)
    for (const gf of splitGroupBy(params.groupBy)) {
      selectParts.push(escapeOdsqlGroupField(gf));
    }

    return selectParts.join(', ');
  }
}
