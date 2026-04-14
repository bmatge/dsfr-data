/**
 * Proxy URL helpers for Grist, Albert, and other external APIs
 */

import { getProxyConfig } from './proxy-config.js';

/**
 * Get proxied URL for a Grist API endpoint
 * Handles both docs.getgrist.com and grist.numerique.gouv.fr
 */
export function getProxyUrl(gristUrl: string, endpoint: string): string {
  if (!gristUrl) {
    throw new Error('getProxyUrl: gristUrl is required');
  }
  const config = getProxyConfig();
  const url = new URL(gristUrl);

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
 * Get proxied URL for any external API URL
 * Handles known APIs (tabular, grist, albert) by routing through dedicated proxies.
 * Unknown cross-origin URLs are routed through the generic CORS proxy.
 * Works in all environments: dev (Vite proxy), production, CodePen embeds, etc.
 */
export function getProxiedUrl(url: string): string {
  if (!url) {
    throw new Error('getProxiedUrl: url is required');
  }
  const config = getProxyConfig();

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const rewrites: Array<[string, string]> = [
    ['tabular-api.data.gouv.fr', config.endpoints.tabular],
    ['docs.getgrist.com', config.endpoints.grist],
    ['grist.numerique.gouv.fr', config.endpoints.gristGouv],
    ['albert.api.etalab.gouv.fr', config.endpoints.albert],
    ['api.insee.fr', config.endpoints.insee],
  ];

  for (const [host, endpoint] of rewrites) {
    if (parsed.hostname === host) {
      return `${config.baseUrl}${endpoint}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  }

  return url;
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
  extraHeaders?: Record<string, string>
): { url: string; headers: Record<string, string> } {
  const config = getProxyConfig();
  return {
    url: `${config.baseUrl}${config.endpoints.corsProxy}`,
    headers: {
      ...(extraHeaders || {}),
      'X-Target-URL': targetUrl,
    },
  };
}
