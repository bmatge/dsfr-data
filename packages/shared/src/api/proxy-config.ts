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

/**
 * Build-time configuration injectée par Vite via `import.meta.env`.
 *
 * Important : les accès doivent rester **statiques** (`import.meta.env.VITE_*`)
 * pour que Vite remplace par les valeurs littérales au bundle. Toute indirection
 * (`const m = import.meta; m.env...`) casse la substitution → les bundles
 * retombent silencieusement sur les fallbacks ci-dessous.
 *
 * Types déclarés localement plutôt que via `vite/client` pour ne pas coupler
 * `@dsfr-data/shared` à Vite (utilisable hors environnement Vite).
 */
declare global {
  interface ImportMeta {
    readonly env?: {
      readonly VITE_PROXY_URL?: string;
      readonly VITE_LIB_URL?: string;
    };
  }
}

/** Default production proxy base URL (overridable via VITE_PROXY_URL at build time) */
export const PROXY_BASE_URL: string =
  import.meta.env?.VITE_PROXY_URL || 'https://chartsbuilder.matge.com';

/**
 * Base URL for the dsfr-data JS library in generated code.
 * Configurable via VITE_LIB_URL at build time.
 *
 * Supported values:
 *   - unset / "jsdelivr" → https://cdn.jsdelivr.net/npm/dsfr-data@0/dist (default)
 *   - "unpkg"            → https://unpkg.com/dsfr-data@0/dist
 *   - "self"             → ${PROXY_BASE_URL}/dist (self-hosted)
 *   - Custom URL         → used as-is (e.g. "https://my-cdn.example.com/dist")
 */
function resolveLibUrl(): string {
  const raw: string = import.meta.env?.VITE_LIB_URL || '';
  if (!raw || raw === 'jsdelivr') return 'https://cdn.jsdelivr.net/npm/dsfr-data@0/dist';
  if (raw === 'unpkg') return 'https://unpkg.com/dsfr-data@0/dist';
  if (raw === 'self') return `${PROXY_BASE_URL}/dist`;
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
  },
};

/** Detect if running in Vite dev server */
export function isViteDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname, port } = window.location;
  return (
    (hostname === 'localhost' || hostname === '127.0.0.1') &&
    !!port &&
    port !== '80' &&
    port !== '443'
  );
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
    endpoints,
  };
}
