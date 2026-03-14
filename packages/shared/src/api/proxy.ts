/**
 * Proxy URL helpers for Grist, Albert, and other external APIs
 */

import { getProxyConfig, PROXY_BASE_URL } from './proxy-config.js';

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
 * Handles known APIs (tabular, grist, albert) by routing through the CORS proxy.
 * Works in all environments: dev (Vite proxy), production, CodePen embeds, etc.
 */
export function getProxiedUrl(url: string): string {
  if (!url) {
    throw new Error('getProxiedUrl: url is required');
  }
  const config = getProxyConfig();

  if (url.includes('tabular-api.data.gouv.fr')) {
    return url.replace('https://tabular-api.data.gouv.fr', `${config.baseUrl}${config.endpoints.tabular}`);
  }

  if (url.includes('docs.getgrist.com')) {
    return url.replace('https://docs.getgrist.com', `${config.baseUrl}${config.endpoints.grist}`);
  }

  if (url.includes('grist.numerique.gouv.fr')) {
    return url.replace('https://grist.numerique.gouv.fr', `${config.baseUrl}${config.endpoints.gristGouv}`);
  }

  if (url.includes('albert.api.etalab.gouv.fr')) {
    return url.replace('https://albert.api.etalab.gouv.fr', `${config.baseUrl}${config.endpoints.albert}`);
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

/**
 * Get the external proxy base URL
 */
export function getExternalProxyUrl(): string {
  return PROXY_BASE_URL;
}
