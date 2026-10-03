/**
 * Cardinalité RÉELLE d'un champ, demandée à l'API de la source (#1172).
 *
 * Pour une source d'API, le Builder ne charge qu'un échantillon (10 lignes
 * d'un jeu Opendatasoft de 101 lignes, par exemple). Le garde-fou de
 * cardinalité et le badge « Données déjà groupées » calculés sur cet
 * échantillon se trompaient dans les deux sens : 101 départements passaient
 * pour 10 catégories, et 10 lignes distinctes pour un jeu déjà groupé.
 *
 * Quand le fournisseur sait regrouper côté serveur, on lui demande donc le
 * nombre de modalités du champ : UNE requête de regroupement, plafonnée — on
 * veut savoir si l'axe déborde, pas lister les modalités.
 *
 * Garde-fous contre la rafale (une IP a été bloquée 58 min par data.gouv après
 * ~250 requêtes en 15 s) :
 * - une seule requête par (source, champ), mémorisée — échecs compris ;
 * - une requête en cours pour un autre champ est annulée ;
 * - aucune requête quand l'échantillon EST le jeu entier.
 *
 * Tout ce qui empêche de répondre (fournisseur sans regroupement serveur,
 * requête en échec ou en attente) rend un état de repli : l'appelant affiche
 * alors que son chiffre est « calculé sur un échantillon de N lignes ».
 */

import {
  buildProxiedRequest,
  detectProvider,
  fetchWithTimeout,
  getProvider,
  type ProviderConfig,
  type Source,
} from '@dsfr-data/shared';

/** Plafond du nombre de groupes demandés : au-delà, « au moins N ». */
export const CARDINALITY_REQUEST_CAP = 1000;

/** Évènement émis sur `document` quand une cardinalité réelle arrive (ou échoue). */
export const CARDINALITY_EVENT = 'builder:cardinality-updated';

export type RealCardinality =
  /** L'API a répondu. `capped` : le plafond est atteint, `groups` est un minimum. */
  | { status: 'ok'; distinct: number; groups: number; capped: boolean }
  /** Requête partie, réponse pas encore reçue. */
  | { status: 'pending' }
  /** Requête en échec (réseau, HTTP, réponse illisible). */
  | { status: 'failed' }
  /** Le fournisseur ne sait pas regrouper côté serveur, ou l'URL ne s'y prête pas. */
  | { status: 'unsupported' };

const ODSQL_BARE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function escapeOdsqlIdentifier(field: string): string {
  if (ODSQL_BARE_IDENTIFIER.test(field)) return field;
  return '`' + field.replace(/`/g, '') + '`';
}

interface CardinalityPlan {
  url: string;
  /** Chemin du tableau de groupes dans la réponse. */
  dataPath: string;
  /** Nombre de groupes demandés : autant de groupes reçus = plafond atteint. */
  cap: number;
}

function providerOf(source: Source): ProviderConfig | null {
  if (!source.apiUrl) return null;
  return source.provider ? getProvider(source.provider) : detectProvider(source.apiUrl);
}

/**
 * Construit la requête de regroupement pour la source, ou `null` quand on ne
 * sait pas la poser. Le choix se fait sur les CAPACITÉS déclarées par le
 * fournisseur (`serverGroupBy`, syntaxe d'agrégation), pas sur son nom. Les
 * filtres déjà présents dans l'URL de la source sont conservés : la
 * cardinalité est celle des lignes que la source rend.
 */
export function planCardinalityRequest(source: Source, field: string): CardinalityPlan | null {
  const provider = providerOf(source);
  if (!provider || !provider.capabilities.serverGroupBy || !field || !source.apiUrl) return null;

  let url: URL;
  try {
    url = new URL(source.apiUrl, window.location.href);
  } catch {
    return null;
  }

  const paging = provider.pagination.params;
  for (const key of [paging.page, paging.pageSize, paging.offset, paging.limit]) {
    if (key) url.searchParams.delete(key);
  }

  switch (provider.query.aggregationSyntax) {
    case 'odsql-select': {
      // Le regroupement n'existe que sur la route de pagination (`/records`),
      // pas sur les exports.
      if (!/\/records\/?$/.test(url.pathname)) return null;
      for (const key of ['select', 'group_by', 'order_by']) url.searchParams.delete(key);
      url.searchParams.set('select', 'count(*) as n');
      url.searchParams.set('group_by', escapeOdsqlIdentifier(field));
      url.searchParams.set('limit', String(CARDINALITY_REQUEST_CAP));
      return {
        url: url.toString(),
        dataPath: provider.response.dataPath,
        cap: CARDINALITY_REQUEST_CAP,
      };
    }
    case 'colon-attr': {
      const cap = Math.min(CARDINALITY_REQUEST_CAP, provider.pagination.pageSize);
      if (paging.pageSize) url.searchParams.set(paging.pageSize, String(cap));
      // Clés NUES : cette syntaxe refuse `champ__groupby=` (HTTP 400, « could
      // not be parsed »), que `URLSearchParams` écrirait pour une valeur vide.
      const name = encodeURIComponent(field);
      const base = url.toString();
      const glue = base.includes('?') ? '&' : '?';
      return {
        url: `${base}${glue}${name}__groupby&${name}__count`,
        dataPath: provider.response.dataPath,
        cap,
      };
    }
    default:
      return null;
  }
}

function parseHeaders(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') headers[key] = value;
    }
    return headers;
  } catch {
    return {};
  }
}

/**
 * Lit `a.b.c` dans la réponse. Propriétés PROPRES seulement : un chemin ne
 * remonte jamais dans le prototype (`__proto__`, `constructor`).
 */
function readOwn(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.prototype.hasOwnProperty.call(value, key) ? Reflect.get(value, key) : undefined;
}

function readPath(json: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(readOwn, json);
}

const cache = new Map<string, RealCardinality>();
let inFlight: { key: string; controller: AbortController } | null = null;

function cacheKey(source: Source, field: string): string {
  return `${source.id}\u0000${source.apiUrl ?? ''}\u0000${field}`;
}

function publish(): void {
  document.dispatchEvent(new CustomEvent(CARDINALITY_EVENT));
}

async function run(key: string, plan: CardinalityPlan, source: Source, field: string) {
  const controller = new AbortController();
  inFlight = { key, controller };
  let result: RealCardinality = { status: 'failed' };
  try {
    const request = buildProxiedRequest(plan.url, parseHeaders(source.headers));
    const response = await fetchWithTimeout(request.url, {
      headers: request.headers,
      signal: controller.signal,
    });
    if (response.ok) {
      const rows = readPath(await response.json(), plan.dataPath);
      if (Array.isArray(rows)) {
        const distinct = rows.filter((row) => {
          const value = (row as Record<string, unknown> | null)?.[field];
          return value !== null && value !== undefined && value !== '';
        }).length;
        result = {
          status: 'ok',
          distinct,
          groups: rows.length,
          capped: rows.length >= plan.cap,
        };
      }
    }
  } catch {
    result = { status: 'failed' };
  }

  if (controller.signal.aborted) {
    // Annulée parce qu'un autre champ a été choisi : rien n'est mémorisé, la
    // question sera reposée si l'on revient sur ce champ.
    cache.delete(key);
    return;
  }
  if (inFlight?.key === key) inFlight = null;
  cache.set(key, result);
  publish();
}

/**
 * Cardinalité réelle du champ pour la source. Lance la requête au premier
 * appel pour ce couple (source, champ) et rend `pending` ; les appels suivants
 * lisent la mémoire. Émet `CARDINALITY_EVENT` quand la réponse arrive.
 */
export function lookupRealCardinality(source: Source | null, field: string): RealCardinality {
  if (!source || !field) return { status: 'unsupported' };
  const key = cacheKey(source, field);
  const known = cache.get(key);
  if (known) return known;

  const plan = planCardinalityRequest(source, field);
  if (!plan) {
    const unsupported: RealCardinality = { status: 'unsupported' };
    cache.set(key, unsupported);
    return unsupported;
  }

  if (inFlight && inFlight.key !== key) {
    inFlight.controller.abort();
    inFlight = null;
  }
  const pending: RealCardinality = { status: 'pending' };
  cache.set(key, pending);
  void run(key, plan, source, field);
  return pending;
}

/** Vide la mémoire (tests, et rechargement explicite d'une source). */
export function resetRealCardinality(): void {
  inFlight?.controller.abort();
  inFlight = null;
  cache.clear();
}
