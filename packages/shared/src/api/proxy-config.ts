/**
 * Proxy configuration for CORS handling of external APIs
 * Supports dev (Vite proxy), production (external proxy), and Tauri modes
 */

export interface ProxyConfig {
  baseUrl: string;
  endpoints: {
    grist: string;
    gristGouv: string;
    albert: string;
    tabular: string;
    insee: string;
    corsProxy: string;
  };
}

/** Default production proxy base URL (overridable via VITE_PROXY_URL at build time) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _meta = import.meta as any;
export const PROXY_BASE_URL: string = _meta.env?.VITE_PROXY_URL || 'https://chartsbuilder.matge.com';

/**
 * Base URL for the dsfr-data JS library in generated code.
 * Configurable via VITE_LIB_URL at build time.
 *
 * Supported values:
 *   - "unpkg"    → https://unpkg.com/dsfr-data@{version}/dist
 *   - "jsdelivr" → https://cdn.jsdelivr.net/npm/dsfr-data@{version}/dist
 *   - Custom URL → used as-is (e.g. "https://my-cdn.example.com/dist")
 *   - unset      → defaults to ${PROXY_BASE_URL}/dist
 */
function resolveLibUrl(): string {
  const raw: string = _meta.env?.VITE_LIB_URL || '';
  if (!raw) return `${PROXY_BASE_URL}/dist`;
  if (raw === 'unpkg') return 'https://unpkg.com/dsfr-data/dist';
  if (raw === 'jsdelivr') return 'https://cdn.jsdelivr.net/npm/dsfr-data/dist';
  return raw;
}
export const LIB_URL: string = resolveLibUrl();

/** Default production proxy configuration */
export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  baseUrl: PROXY_BASE_URL,
  endpoints: {
    grist: '/grist-proxy',
    gristGouv: '/grist-gouv-proxy',
    albert: '/albert-proxy',
    tabular: '/tabular-proxy',
    insee: '/insee-proxy',
    corsProxy: '/cors-proxy',
  }
};

/** Detect if running in Vite dev server */
export function isViteDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname, port } = window.location;
  return (hostname === 'localhost' || hostname === '127.0.0.1')
    && !!port && port !== '80' && port !== '443';
}

/** Detect if running inside Tauri desktop app */
export function isTauriMode(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Get the proxy configuration based on the current environment
 * - Dev mode: relative URLs (handled by Vite proxy)
 * - Tauri mode: full URLs to the production proxy
 * - Production web: configurable via VITE_PROXY_URL or defaults to production proxy
 */
export function getProxyConfig(): ProxyConfig {
  const endpoints = { ...DEFAULT_PROXY_CONFIG.endpoints };

  // Vite dev: relative URLs, proxy handled by vite.config.ts
  if (isViteDevMode()) {
    return { baseUrl: '', endpoints };
  }

  // Tauri: always use the remote proxy
  if (isTauriMode()) {
    return { baseUrl: DEFAULT_PROXY_CONFIG.baseUrl, endpoints };
  }

  // Production web: uses PROXY_BASE_URL (already respects VITE_PROXY_URL)
  return {
    baseUrl: PROXY_BASE_URL,
    endpoints
  };
}
