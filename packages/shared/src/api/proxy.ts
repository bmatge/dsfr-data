/**
 * Proxy URL helpers for Grist, Albert, and other external APIs
 */

import { getProxyConfig } from './proxy-config.js';
import type { ProxyConfig, RuntimeProxyConfig } from './proxy-config.js';

/** Override proxy explicite (attribut `proxy-url` d'une source, #340). */
type ProxyOverride = string | RuntimeProxyConfig | undefined;

/**
 * Get proxied URL for a Grist API endpoint
 * Handles both docs.getgrist.com and grist.numerique.gouv.fr
 *
 * @param proxyOverride Override proxy par source (attribut `proxy-url`, #340),
 *   prioritaire sur `window.DSFR_DATA_PROXY` et la config build-time.
 */
export function getProxyUrl(
  gristUrl: string,
  endpoint: string,
  proxyOverride?: ProxyOverride
): string {
  if (!gristUrl) {
    throw new Error('getProxyUrl: gristUrl is required');
  }
  const config = getProxyConfig(proxyOverride);
  const url = new URL(gristUrl);

  // Aucun proxy configuré : acces direct a l'instance Grist
  if (config.mode === 'direct') {
    return `${gristUrl}/api${endpoint}`;
  }

  if (url.hostname === 'docs.getgrist.com') {
    return `${config.baseUrl}${config.endpoints.grist}/api${endpoint}`;
  }

  if (url.hostname === 'grist.numerique.gouv.fr') {
    return `${config.baseUrl}${config.endpoints.gristGouv}/api${endpoint}`;
  }

  // Self-hosted instances with CORS configured
  return `${gristUrl}/api${endpoint}`;
}

/**
 * Les hôtes que le proxy RELAIE par un endpoint dédié — et eux seuls. Tout
 * autre hôte (un portail Opendatasoft, une API quelconque) est appelé en
 * direct par `getProxiedUrl`, qu'un proxy soit configuré ou non : c'est ce que
 * `dsfr-data-source` signale quand `proxy-url` est posé sur un tel hôte
 * (AM-114 du banc d'essai, #1232).
 */
const RELAYED_HOST_ENDPOINTS: ReadonlyArray<[string, keyof ProxyConfig['endpoints']]> = [
  ['tabular-api.data.gouv.fr', 'tabular'],
  ['docs.getgrist.com', 'grist'],
  ['grist.numerique.gouv.fr', 'gristGouv'],
  ['albert.api.etalab.gouv.fr', 'albert'],
  ['api.insee.fr', 'insee'],
];

/** Noms des hôtes relayés par un endpoint dédié, dans l'ordre de la table. */
export const RELAYED_HOSTS: readonly string[] = RELAYED_HOST_ENDPOINTS.map(([host]) => host);

/**
 * L'hôte de `url` est-il relayé par un endpoint dédié ? Indépendant de la
 * configuration : la question est « le proxy SAIT-il relayer cet hôte », pas
 * « un proxy est-il configuré ». Une URL relative ou illisible n'a pas d'hôte
 * à relayer : `false`.
 */
export function isRelayedHost(url: string): boolean {
  try {
    return RELAYED_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * If `parsed` matches a known API host, return the URL rewritten to its
 * dedicated (CORS-enabled) proxy endpoint. Otherwise return `null`.
 */
function rewriteKnownHost(parsed: URL, config: ProxyConfig): string | null {
  // Mode direct (aucun proxy configuré) : jamais de réécriture
  if (config.mode === 'direct') return null;

  for (const [host, endpoint] of RELAYED_HOST_ENDPOINTS) {
    if (parsed.hostname === host) {
      return `${config.baseUrl}${config.endpoints[endpoint]}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  }

  return null;
}

/**
 * Get proxied URL for any external API URL
 * Handles known APIs (tabular, grist, albert) by routing through dedicated proxies.
 * Unknown hosts are returned unchanged (direct fetch).
 * Works in all environments: dev (Vite proxy), production, CodePen embeds, etc.
 *
 * Note : pour router *aussi* les hôtes inconnus via le proxy CORS générique
 * (nécessaire dès qu'on envoie un en-tête custom comme `Apikey` qui déclenche
 * un preflight), utiliser `buildProxiedRequest` qui renvoie url + en-têtes.
 *
 * @param proxyOverride Override proxy par source (attribut `proxy-url`, #340),
 *   prioritaire sur `window.DSFR_DATA_PROXY` et la config build-time.
 */
export function getProxiedUrl(url: string, proxyOverride?: ProxyOverride): string {
  if (!url) {
    throw new Error('getProxiedUrl: url is required');
  }
  const config = getProxyConfig(proxyOverride);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  return rewriteKnownHost(parsed, config) ?? url;
}

/**
 * Construit la requête (url + en-têtes) pour atteindre n'importe quelle API
 * externe sans buter sur CORS :
 *   - hôte connu (tabular, grist, albert, insee) → proxy dédié, en-têtes inchangés ;
 *   - même origine que l'app → URL inchangée, en-têtes inchangés ;
 *   - hôte inconnu cross-origin → proxy CORS générique via l'en-tête `X-Target-URL`.
 *
 * Indispensable quand la requête porte un en-tête custom (ex. `Apikey`), qui
 * rend la requête "non-simple" et déclenche un preflight OPTIONS que les API
 * tierces (OpenDataSoft, etc.) ne savent pas honorer. En passant par le proxy,
 * c'est nginx (côté serveur) qui transmet l'en-tête à la cible.
 */
export function buildProxiedRequest(
  url: string,
  extraHeaders: Record<string, string> = {},
  proxyOverride?: ProxyOverride
): { url: string; headers: Record<string, string> } {
  if (!url) {
    throw new Error('buildProxiedRequest: url is required');
  }
  const headers: Record<string, string> = { ...extraHeaders };
  const config = getProxyConfig(proxyOverride);

  let parsed: URL;
  try {
    parsed = new URL(url, typeof window !== 'undefined' ? window.location.href : undefined);
  } catch {
    // URL relative ou invalide → on laisse tel quel (same-origin)
    return { url, headers };
  }

  // Hôtes connus : proxies dédiés déjà configurés pour CORS
  const known = rewriteKnownHost(parsed, config);
  if (known) {
    return { url: known, headers };
  }

  // Même origine que l'app : aucun problème de CORS, fetch direct
  if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
    return { url, headers };
  }

  // Aucun proxy configuré : fetch direct (l'API cible doit accepter le CORS,
  // sinon le déployeur fournit son proxy via window.DSFR_DATA_PROXY)
  if (config.mode === 'direct') {
    return { url, headers };
  }

  // Hôte inconnu cross-origin : proxy CORS générique (X-Target-URL)
  return {
    url: `${config.baseUrl}${config.endpoints.corsProxy}`,
    headers: { ...headers, 'X-Target-URL': parsed.href },
  };
}

/**
 * Build a CORS-proxied fetch request for any external URL.
 * Routes the request through the generic CORS proxy endpoint
 * (X-Target-URL header pattern).
 *
 * Usage:
 *   const { url, headers } = buildCorsProxyRequest('https://api.example.com/data');
 *   fetch(url, { headers });
 */
export function buildCorsProxyRequest(
  targetUrl: string,
  extraHeaders?: Record<string, string>,
  proxyOverride?: ProxyOverride
): { url: string; headers: Record<string, string> } {
  const config = getProxyConfig(proxyOverride);

  // Aucun proxy configuré : requête directe vers la cible
  if (config.mode === 'direct') {
    return { url: targetUrl, headers: { ...(extraHeaders || {}) } };
  }

  return {
    url: `${config.baseUrl}${config.endpoints.corsProxy}`,
    headers: {
      ...(extraHeaders || {}),
      'X-Target-URL': targetUrl,
    },
  };
}
