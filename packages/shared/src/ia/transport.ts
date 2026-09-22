/**
 * Transport IA commun (#998, ADR-143) — seule implementation des appels au
 * modele pour le Studio et le builder-IA :
 *
 *   - mode serveur : POST /ia-proxy-default (jeton injecte cote serveur,
 *     jamais expose au navigateur), configuration via GET /ia-server-config ;
 *   - mode utilisateur : cle dans localStorage (`dsfr-data-ia-config`, la MEME
 *     cle pour toutes les apps : l'utilisateur configure une fois),
 *     POST /ia-proxy + X-Target-URL.
 *
 * Retry automatique sur 429 uniquement (jeton Albert partage, et une boucle
 * agentique tire plusieurs requetes par message) : Retry-After s'il est
 * fourni, plafonne a 10 s ; sinon 1 s, 2 s, 4 s. Trois nouvelles tentatives au
 * plus, puis l'erreur remonte.
 *
 * App-side (fetch, localStorage) : exporte depuis `index.ts` seulement, jamais
 * depuis `lib.ts` (frontiere lib/app #319).
 */

import { fetchWithTimeout, httpErrorMessage } from '../api/fetch-helpers.js';
import { effectiveCapabilities, type AlbertCapabilities } from './albert-capabilities.js';
import type { OpenAIResponse, PostChat } from './chat-types.js';

/** Route serveur : le proxy injecte lui-meme le jeton. */
export const IA_PROXY_DEFAULT_ENDPOINT = '/ia-proxy-default';
/** Route utilisateur : le proxy relaie vers `X-Target-URL`. */
export const IA_PROXY_ENDPOINT = '/ia-proxy';

/** Cle localStorage partagee par toutes les apps (ne pas renommer). */
export const IA_CONFIG_KEY = 'dsfr-data-ia-config';
const DEFAULT_MODEL = 'openweight-large';

/** Nombre de nouvelles tentatives sur 429 (soit 4 requetes au plus). */
const MAX_429_RETRIES = 3;
/** Plafond d'attente quand le serveur donne un Retry-After. */
const RETRY_AFTER_CAP_MS = 10000;
/** Plafond du backoff exponentiel quand l'en-tete manque. */
const BACKOFF_CAP_MS = 4000;

export interface UserIAConfig {
  apiUrl: string;
  model: string;
  token: string;
}

export interface ServerIAConfig {
  available: boolean;
  apiUrl?: string;
  model?: string;
}

/** En-tetes du mode utilisateur OpenAI-compatible (Albert, OpenAI, Mistral...). */
export function userProxyHeaders(apiUrl: string, token: string): Record<string, string> {
  return { 'X-Target-URL': apiUrl, Authorization: `Bearer ${token}` };
}

export interface ProxyFetchInit {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
}

/**
 * Requete brute a travers un proxy : UNE tentative, la `Response` telle quelle.
 * Pour les appelants qui interpretent eux-memes le statut (sonde de capacites :
 * un retry sur 429 fausserait son verdict). Les appels de chat passent par
 * `postProxy`. Sans `timeout`, aucun delai n'est impose.
 */
export function proxyFetch(
  endpoint: string,
  headers: Record<string, string>,
  init: ProxyFetchInit = {},
  timeout?: number
): Promise<Response> {
  const hasBody = init.body !== undefined;
  const request: RequestInit = {
    method: init.method ?? 'POST',
    headers: hasBody ? { 'Content-Type': 'application/json', ...headers } : headers,
    ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
  };
  return timeout !== undefined
    ? fetchWithTimeout(endpoint, request, timeout)
    : fetch(endpoint, request);
}

/** Attente avant la tentative suivante apres un 429. */
function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get('retry-after'));
  return Number.isFinite(retryAfter) && retryAfter > 0
    ? Math.min(retryAfter * 1000, RETRY_AFTER_CAP_MS)
    : Math.min(1000 * 2 ** attempt, BACKOFF_CAP_MS);
}

/**
 * POST JSON a travers un proxy (`/ia-proxy-default` ou `/ia-proxy`), avec retry
 * sur 429 uniquement. Rend le corps JSON ; sur tout autre statut non 2xx, leve
 * `httpErrorMessage(status)` suivi du `error.message` du fournisseur.
 */
export async function postProxy<T = Record<string, unknown>>(
  endpoint: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeout?: number
): Promise<T> {
  let response!: Response;
  for (let attempt = 0; ; attempt++) {
    response = await proxyFetch(endpoint, headers, { method: 'POST', body }, timeout);
    if (response.status !== 429 || attempt >= MAX_429_RETRIES) break;
    const waitMs = retryDelayMs(response, attempt);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  if (!response.ok) {
    let detail = '';
    try {
      const errBody = (await response.json()) as {
        error?: { message?: string; type?: string };
      };
      detail =
        errBody?.error?.message || errBody?.error?.type || JSON.stringify(errBody?.error) || '';
    } catch {
      // corps non JSON
    }
    throw new Error(
      detail
        ? `${httpErrorMessage(response.status)} (${detail})`
        : httpErrorMessage(response.status)
    );
  }
  return (await response.json()) as T;
}

let serverConfig: ServerIAConfig | null = null;

/** Config serveur (jeton cote serveur), sondee une fois par session. */
export async function fetchServerConfig(): Promise<ServerIAConfig> {
  if (serverConfig) return serverConfig;
  try {
    const res = await fetch('/ia-server-config');
    serverConfig = res.ok ? ((await res.json()) as ServerIAConfig) : { available: false };
  } catch {
    serverConfig = { available: false };
  }
  return serverConfig;
}

/** Config serveur deja sondee (null tant que fetchServerConfig n'a pas repondu). */
export function getServerConfig(): ServerIAConfig | null {
  return serverConfig;
}

/** Pour les tests : reinitialise le cache de config serveur. */
export function resetServerConfigCache(): void {
  serverConfig = null;
}

/** Config utilisateur (localStorage, partagee entre les apps). */
export function loadUserConfig(): UserIAConfig {
  try {
    const raw = localStorage.getItem(IA_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserIAConfig>;
      return {
        apiUrl: parsed.apiUrl ?? '',
        model: parsed.model ?? DEFAULT_MODEL,
        token: parsed.token ?? '',
      };
    }
  } catch {
    // localStorage inaccessible ou JSON invalide : config vide.
  }
  return { apiUrl: '', model: DEFAULT_MODEL, token: '' };
}

/**
 * Mode serveur : aucun jeton utilisateur memorise et un jeton serveur
 * disponible. Synchrone : suppose fetchServerConfig() deja appele.
 */
export function isServerMode(): boolean {
  return !loadUserConfig().token && serverConfig?.available === true;
}

/** Vrai si l'URL vise le gateway Albert (etalab). */
export function isAlbertUrl(apiUrl: string): boolean {
  try {
    return new URL(apiUrl).hostname.endsWith('etalab.gouv.fr');
  } catch {
    return false;
  }
}

/** Etat resolu du transport : quel chemin, quel modele, quelles capacites. */
export interface ResolvedTransport {
  mode: 'server' | 'user' | 'none';
  model: string;
  post: PostChat;
  capacites: AlbertCapabilities;
}

export interface ResolveTransportOptions {
  /**
   * Config utilisateur a utiliser plutot que celle de localStorage (le
   * builder-IA passe celle du formulaire, qui peut ne pas etre sauvegardee).
   */
  user?: UserIAConfig;
  /** Delai maximal par requete, en ms (fetchWithTimeout) ; aucun si absent. */
  timeout?: number;
}

/**
 * Resout le transport : mode serveur si disponible et pas de jeton utilisateur,
 * sinon mode utilisateur, sinon 'none' (l'UI explique quoi configurer).
 *
 * `capacites` : isAlbert = mode serveur (toujours Albert) ou hote etalab.gouv.fr,
 * puis `effectiveCapabilities({ isAlbert })` — les capacites sondees font foi.
 */
export async function resolveTransport(
  opts: ResolveTransportOptions = {}
): Promise<ResolvedTransport> {
  const user = opts.user ?? loadUserConfig();
  const server = await fetchServerConfig();
  const { timeout } = opts;

  if (!user.token && server.available) {
    return {
      mode: 'server',
      model: server.model ?? 'albert-large',
      post: (body) => postProxy<OpenAIResponse>(IA_PROXY_DEFAULT_ENDPOINT, {}, body, timeout),
      capacites: effectiveCapabilities({ isAlbert: true }),
    };
  }
  if (user.token && user.apiUrl) {
    const headers = userProxyHeaders(user.apiUrl, user.token);
    return {
      mode: 'user',
      model: user.model,
      post: (body) => postProxy<OpenAIResponse>(IA_PROXY_ENDPOINT, headers, body, timeout),
      capacites: effectiveCapabilities({ isAlbert: isAlbertUrl(user.apiUrl) }),
    };
  }
  return {
    mode: 'none',
    model: '',
    post: async () => {
      throw new Error(
        "Aucune configuration IA : renseigne une clé API dans l'Assistant IA, ou déploie avec un jeton serveur."
      );
    },
    capacites: effectiveCapabilities(),
  };
}
