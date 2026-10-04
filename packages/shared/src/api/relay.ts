/**
 * Relais cachable par le site hôte (ADR-155, #1232, constat AM-114 du banc
 * d'essai) — côté bibliothèque.
 *
 * Un site qui a du cache veut que les données d'une dataviz passent par SON
 * domaine, sous une URL qui identifie la donnée. Avec un relais résolu
 * (attribut `relay-url` de `dsfr-data-source`, sinon `window.DSFR_DATA_RELAY`),
 * toute requête GET vers une autre origine devient
 *
 *     <relais>/<hôte>/<chemin>?<requête>
 *
 * Le contrat du relais est `docs/RELAY.md` : il fait foi sur ce que le relais
 * accepte et refuse. Ce module en applique la part « bibliothèque » (R1 à R5),
 * à l'unique point où passent tous les adaptateurs.
 *
 * AUCUNE variable de build : le relais n'est connu qu'au runtime, il n'y a pas
 * de quatrième dimension d'URL et rien à faire fuir dans un bundle.
 *
 * Sans relais résolu, `resolveTransportUrl` rend EXACTEMENT ce que rend
 * `getProxiedUrl`, et `transportFetch` appelle `fetch(url, init)` tel quel :
 * pas un octet ne change.
 */

import { getProxiedUrl } from './proxy.js';
import type { RuntimeProxyConfig } from './proxy-config.js';

declare global {
  interface Window {
    /**
     * Préfixe du relais du site hôte, posé AVANT le chargement des composants :
     * `window.DSFR_DATA_RELAY = '/donnees-relais'`. L'attribut `relay-url` d'une
     * source prime sur lui.
     */
    DSFR_DATA_RELAY?: string;
  }
}

/** Ce qu'une requête sait de son transport : le proxy (`proxy-url`) et le relais (`relay-url`). */
export interface TransportOptions {
  /** Override du proxy CORS (attribut `proxy-url`, #340). */
  proxyUrl?: string | RuntimeProxyConfig;
  /** Préfixe du relais (attribut `relay-url`). Absent : `window.DSFR_DATA_RELAY`. */
  relayUrl?: string;
}

/**
 * Pourquoi une cible n'a pas été réécrite alors qu'un relais est résolu :
 * - `schema`, `port`, `identifiants` : règle R1 ;
 * - `chemin`, `requete` : le relais refuserait cette forme (400, C-SSRF-4 et
 *   C-INJ-1 du contrat) — la requête ne part pas vers un refus certain.
 */
export type RelaySkipReason = 'schema' | 'port' | 'identifiants' | 'chemin' | 'requete';

export interface TransportResolution {
  /** URL à appeler. */
  url: string;
  /** La requête part-elle au relais ? */
  relayed: boolean;
  /** Relais résolu mais cible non réécrite : la raison (un avertissement a été écrit). */
  skipped?: RelaySkipReason;
}

/** Longueur d'URL de relais (chemin et requête) au-delà de laquelle le relais répond 414 (C-URL-3). */
export const RELAY_MAX_URL_LENGTH = 8000;

/** Nouveaux essais automatiques sur un 503 du relais (place momentanément prise). */
export const RELAY_BUSY_MAX_RETRIES = 3;
/** Attente quand `Retry-After` est illisible (relais d'une autre origine : en-tête non exposé). */
export const RELAY_BUSY_DEFAULT_WAIT_MS = 1000;
/** Au-delà de ce `Retry-After`, ce n'est plus une place prise mais une panne : aucun nouvel essai. */
export const RELAY_BUSY_MAX_WAIT_MS = 3000;
/** Décalage aléatoire ajouté à l'attente : N sources refusées ensemble ne reviennent pas ensemble. */
export const RELAY_BUSY_JITTER_MS = 250;

// ---------------------------------------------------------------------------
// Avertissements : une fois par cause
// ---------------------------------------------------------------------------

const warned = new Set<string>();
const WARNED_MAX = 500;

function warnOnce(key: string, message: string): void {
  if (warned.has(key) || warned.size >= WARNED_MAX) return;
  warned.add(key);
  console.warn(message);
}

/** Oublie les avertissements déjà écrits (tests). */
export function resetRelayWarnings(): void {
  warned.clear();
}

// ---------------------------------------------------------------------------
// Résolution du relais
// ---------------------------------------------------------------------------

/**
 * Préfixe du relais, sans barre finale, ou `''` quand aucun relais n'est
 * configuré. Ordre : `override` (attribut `relay-url`), puis
 * `window.DSFR_DATA_RELAY`, puis rien.
 *
 * Relatif (`/donnees-relais`) ou absolu (`https://site.example/donnees-relais`).
 * Un préfixe qui porte une requête, un fragment ou une espace, ou qui se
 * réduit à `/`, ne peut pas précéder `/<hôte>/<chemin>` : il est écarté, avec
 * un avertissement — la requête suit alors le chemin habituel.
 */
export function resolveRelayUrl(override?: string): string {
  let raw = typeof override === 'string' ? override.trim() : '';
  if (!raw && typeof window !== 'undefined' && typeof window.DSFR_DATA_RELAY === 'string') {
    raw = window.DSFR_DATA_RELAY.trim();
  }
  if (!raw) return '';
  const prefix = raw.replace(/\/+$/, '');
  if (!prefix || /[?#\s]/.test(prefix)) {
    warnOnce(
      `relais-invalide|${raw}`,
      `[dsfr-data] relay-url="${raw}" n'est pas un préfixe de relais : un chemin du site ` +
        `ou une URL absolue est attendu, sans requête ni fragment. Le relais est ignoré, la ` +
        `requête suit le chemin habituel (#1232).`
    );
    return '';
  }
  return prefix;
}

// ---------------------------------------------------------------------------
// Ce que le relais refuserait (miroir de proxy/relay/node/target.mjs)
// ---------------------------------------------------------------------------
//
// Le relais ne décode rien et ne normalise rien : une forme piégée est refusée
// (400). Ces contrôles sont les SIENS, recopiés — `tests/relay/` les garde
// égaux à ceux du relais de référence sur un corpus de chemins.

/** Alphabet d'un chemin (RFC 3986 `pchar`, `/` et `%`). */
const PATH_CHARS_RE = /^[A-Za-z0-9\-._~!$&'()*+,;=:@/%]*$/;
/** Un `%` qui n'ouvre pas un échappement complet. */
const BROKEN_ESCAPE_RE = /%(?![0-9A-Fa-f]{2})/;
/** Échappements refusés dans un chemin : point, barres, double encodage, `;`, contrôle, UTF-8 surlong, pleine chasse. */
const PATH_FORBIDDEN_ESCAPE_RE =
  /%(?:2e|2f|5c|25|3b|[01][0-9a-f]|7f|c0|c1|e0%[89][0-9a-f]|f0%8[0-9a-f]|f8%8[0-7]|fc%8[0-3]|ef%bc%(?:8e|8f|bc))/i;
/** ASCII imprimable, sans espace. */
const PRINTABLE_RE = /^[\x21-\x7e]*$/;
/** Échappements refusés dans une requête : NUL, LF, CR. */
const QUERY_FORBIDDEN_ESCAPE_RE = /%(?:00|0a|0d)/i;

/** Le relais accepterait-il ce chemin (il commence par `/`) ? */
export function isRelaySafePath(path: string): boolean {
  if (!path.startsWith('/') || !PATH_CHARS_RE.test(path)) return false;
  if (BROKEN_ESCAPE_RE.test(path)) return false;
  if (PATH_FORBIDDEN_ESCAPE_RE.test(path)) return false;
  const segments = path.split('/');
  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index];
    const name = segment.split(';', 1)[0];
    if (name === '.' || name === '..') return false;
    if (segment === '' && index !== segments.length - 1) return false;
  }
  return true;
}

/** Le relais accepterait-il cette requête (`?` initial compris, ou chaîne vide) ? */
export function isRelaySafeSearch(search: string): boolean {
  if (search === '') return true;
  if (!search.startsWith('?') || !PRINTABLE_RE.test(search)) return false;
  if (search.includes('#')) return false;
  return !QUERY_FORBIDDEN_ESCAPE_RE.test(search);
}

// ---------------------------------------------------------------------------
// Réécriture
// ---------------------------------------------------------------------------

const SKIP_TEXT: Record<RelaySkipReason, string> = {
  schema: 'le relais ne joint que des cibles en https (règle R1)',
  port: 'le relais ne joint que le port par défaut (règle R1)',
  identifiants: "la cible porte des identifiants dans l'URL (règle R1)",
  chemin:
    'le relais refuserait ce chemin (400) : caractère encodé piégé (%2e, %2f, %5c, %25, %3b…), ' +
    'segment vide ou « . », ou caractère hors alphabet',
  requete: 'le relais refuserait cette requête (400) : %00, %0a ou %0d',
};

/** Chemin et requête de l'URL de relais, tels que le relais les compte (C-URL-3). */
function relayRequestLength(relayUrl: string): number {
  try {
    const parsed = new URL(relayUrl);
    return relayUrl.length - parsed.origin.length;
  } catch {
    return relayUrl.length;
  }
}

/**
 * Décide du transport d'une requête : relais, ou chemin actuel (`getProxiedUrl`).
 *
 * Règles de réécriture (ADR-155 §1, `docs/RELAY.md` §2) :
 * - **R1** cible `https`, port par défaut, sans identifiants — sinon pas de
 *   réécriture, un avertissement ;
 * - **R2** hôte en minuscules (ce que rend l'API `URL`) ;
 * - **R3** chemin et requête repris tels que sérialisés : ni réencodage, ni tri
 *   des paramètres ; le fragment est retiré ;
 * - **R4** même origine ou URL relative : jamais réécrite ;
 * - **R5** GET seulement : toute autre méthode suit le chemin actuel.
 *
 * Un chemin ou une requête que le relais refuserait (400) n'est pas réécrit
 * non plus, avec un avertissement : la requête ne part pas vers un refus
 * certain. Une URL de relais de plus de 8 000 caractères part QUAND MÊME au
 * relais (qui répond 414), et c'est écrit une fois en console : la
 * bibliothèque ne contourne jamais le relais en silence.
 *
 * Déterministe : même cible, même URL au caractère près ; deux cibles, deux URL.
 */
export function resolveDataTransport(
  url: string,
  options: TransportOptions = {},
  method = 'GET'
): TransportResolution {
  const current = (): TransportResolution => ({
    url: getProxiedUrl(url, options.proxyUrl),
    relayed: false,
  });

  if (!url) return current();
  if (method.toUpperCase() !== 'GET') return current(); // R5
  const relay = resolveRelayUrl(options.relayUrl);
  if (!relay) return current();

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return current(); // R4 : URL relative
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return current();
  if (typeof window !== 'undefined' && parsed.origin === window.location.origin) return current(); // R4

  // `href` = origine + chemin + requête + fragment dès que la cible est sans
  // identifiants : on reprend la chaîne sérialisée, pas `pathname + search`
  // (qui perdrait un `?` nu). C'est ce que le navigateur enverrait en direct.
  let rest = parsed.href.slice(parsed.origin.length);
  const hashAt = rest.indexOf('#');
  if (hashAt >= 0) rest = rest.slice(0, hashAt);
  const queryAt = rest.indexOf('?');
  const path = queryAt === -1 ? rest : rest.slice(0, queryAt);
  const search = queryAt === -1 ? '' : rest.slice(queryAt);

  let skipped: RelaySkipReason | undefined;
  if (parsed.protocol !== 'https:') skipped = 'schema';
  else if (parsed.port !== '') skipped = 'port';
  else if (parsed.username !== '' || parsed.password !== '') skipped = 'identifiants';
  else if (!isRelaySafePath(path)) skipped = 'chemin';
  else if (!isRelaySafeSearch(search)) skipped = 'requete';

  if (skipped) {
    warnOnce(
      `non-relaye|${relay}|${skipped}|${parsed.host}|${skipped === 'chemin' ? parsed.pathname : ''}`,
      `[dsfr-data] relay-url : la requête vers "${parsed.hostname}" ne passe PAS par le relais ` +
        `"${relay}" — ${SKIP_TEXT[skipped]}. Elle suit le chemin habituel ` +
        `(en direct, ou par proxy-url), avec ses en-têtes (#1232).`
    );
    return { ...current(), skipped };
  }

  const relayed = `${relay}/${parsed.hostname}${rest}`;
  const length = relayRequestLength(relayed);
  if (length > RELAY_MAX_URL_LENGTH) {
    warnOnce(
      `trop-longue|${relay}|${parsed.hostname}${parsed.pathname}`,
      `[dsfr-data] relay-url : l'URL de relais vers "${parsed.hostname}${parsed.pathname}" fait ` +
        `${length} caractères, au-delà des ${RELAY_MAX_URL_LENGTH} qu'un relais accepte. La ` +
        `requête part quand même au relais, qui répond 414 : réduire les filtres ou la ` +
        `sélection de colonnes (#1232).`
    );
  }
  return { url: relayed, relayed: true };
}

/**
 * L'URL à appeler pour atteindre `url` : celle du relais si un relais est
 * résolu et que R1 à R5 tiennent, sinon celle de `getProxiedUrl`, comme avant.
 * C'est le SEUL point de passage des adaptateurs (test-garde statique).
 */
export function resolveTransportUrl(
  url: string,
  options: TransportOptions = {},
  method = 'GET'
): string {
  return resolveDataTransport(url, options, method).url;
}

/**
 * `url` est-elle une URL du relais résolu (`<relais>/…`) ? C'est ce que rend
 * `resolveTransportUrl` pour une requête relayée ; une URL de proxy, une URL
 * directe ou une requête restée hors relais (R1, R4, R5) n'en a pas la forme.
 */
export function isRelayRequestUrl(url: string, relayUrl?: string): boolean {
  const relay = resolveRelayUrl(relayUrl);
  return relay !== '' && url.startsWith(`${relay}/`);
}

// ---------------------------------------------------------------------------
// Requête
// ---------------------------------------------------------------------------

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

/** Attend `ms`, ou rejette à l'annulation — comme le ferait le `fetch` suivant. */
function wait(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError(signal as AbortSignal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Attente avant un nouvel essai sur un 503 du relais, ou `null` s'il ne faut
 * pas réessayer. `Retry-After` en secondes est respecté jusqu'à
 * `RELAY_BUSY_MAX_WAIT_MS` ; au-delà, ou sous forme de date, le relais annonce
 * une panne, pas une place prise. Illisible (relais d'une autre origine) : 1 s.
 */
function relayBusyWaitMs(response: Response): number | null {
  const header = response.headers?.get?.('retry-after') ?? null;
  let base = RELAY_BUSY_DEFAULT_WAIT_MS;
  if (header !== null && header.trim() !== '') {
    if (!/^\d+$/.test(header.trim())) return null;
    base = Number(header.trim()) * 1000;
    if (base > RELAY_BUSY_MAX_WAIT_MS) return null;
  }
  return Math.max(base, 100) + Math.floor(Math.random() * RELAY_BUSY_JITTER_MS);
}

/**
 * Le `fetch` des adaptateurs.
 *
 * Hors relais : `fetch(url, init)`, tel quel.
 *
 * Sur une requête relayée (ADR-155 §4, `docs/RELAY.md` §3) :
 * - AUCUN en-tête n'est envoyé (ni `headers`, ni `api-key-ref` : la clé
 *   appartient au relais) et `credentials: 'omit'` — la requête reste
 *   « simple » au sens CORS, sans pré-vérification, que le relais n'autorise pas ;
 * - un **503** est réessayé, parce que le relais de référence n'a pas de file
 *   d'attente : au-delà de sa part des places amont (huit par défaut), un
 *   client reçoit 503 avec `Retry-After: 1`. Une page qui charge d'un coup plus
 *   de dataviz que cela verrait les suivantes en erreur. Bornes :
 *   `RELAY_BUSY_MAX_RETRIES` nouveaux essais, attente de `Retry-After`
 *   (1 s s'il est illisible) plus un décalage aléatoire, aucun essai si le
 *   relais annonce plus de `RELAY_BUSY_MAX_WAIT_MS`. Le dernier 503 est rendu
 *   tel quel : une vraie panne s'affiche, avec son bouton « Réessayer ».
 *   JAMAIS de nouvel essai sur un 429 (#1203), ni sur un 502 ou un 504.
 *
 * Aucun `HEAD` n'est émis : il coûte un GET au relais (C-MET-3).
 */
export async function transportFetch(
  url: string,
  init: RequestInit | undefined,
  options: TransportOptions = {}
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET' || !isRelayRequestUrl(url, options.relayUrl)) {
    return fetch(url, init);
  }

  const signal = init?.signal ?? undefined;
  const relayInit: RequestInit = { credentials: 'omit' };
  if (signal) relayInit.signal = signal;

  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, relayInit);
    if (response.status !== 503 || attempt >= RELAY_BUSY_MAX_RETRIES) return response;
    const delay = relayBusyWaitMs(response);
    if (delay === null) return response;
    // Le corps du refus n'est pas lu : le libérer rend la connexion.
    response.body?.cancel?.().catch(() => {});
    await wait(delay, signal);
  }
}
