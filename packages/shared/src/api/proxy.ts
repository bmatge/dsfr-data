/**
 * Proxy URL helpers for Grist, Albert, and other external APIs
 */

import { getProxyConfig, isViteDevMode, PROXY_BASE_URL } from './proxy-config.js';

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

  if (url.includes('api.insee.fr')) {
    return url.replace('https://api.insee.fr', `${config.baseUrl}${config.endpoints.insee}`);
  }

  return url;
}

/**
 * Check if a URL needs CORS proxying (cross-origin and not already proxied).
 * Returns null if no proxying needed, or { url, headers } for the CORS proxy.
 */
export function getCorsProxyIfNeeded(url: string): { url: string; headers: Record<string, string> } | null {
  if (!url) return null;
  // In Vite dev mode, the Vite proxy handles CORS — no need for the generic proxy
  if (isViteDevMode()) return null;
  // Already a relative URL (already proxied)
  if (!url.startsWith('https://') && !url.startsWith('http://')) return null;
  // Same origin — no CORS issue
  try {
    if (typeof window !== 'undefined' && new URL(url).origin === window.location.origin) return null;
  } catch { /* not a valid URL, skip */ }
  // Known proxies already handled by getProxiedUrl — check if url was rewritten
  const proxied = getProxiedUrl(url);
  if (proxied !== url) return null;
  // Cross-origin URL not handled by a dedicated proxy: use generic CORS proxy
  return buildCorsProxyRequest(url);
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
