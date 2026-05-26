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
      readonly VITE_PROXY_URL_EMBED?: string;
      readonly VITE_BEACON_URL?: string;
      readonly VITE_LIB_URL?: string;
    };
  }
}

/**
 * URL de base **runtime de l'app** — utilisée par l'app elle-même pour ses
 * propres appels (monitoring, widgets Grist consommant des données, etc.).
 * Surchargeable via `VITE_PROXY_URL` au build. Cf. #180.
 */
export const PROXY_BASE_URL: string =
  import.meta.env?.VITE_PROXY_URL || 'https://chartsbuilder.matge.com';

/**
 * URL de base **inlinée dans le code généré** par les builders (widgets
 * destinés à être collés sur un site tiers). Permet à un opérateur de
 * self-héberger l'app sur un domaine interne tout en générant des widgets
 * qui pointent vers un domaine public stable.
 * Surchargeable via `VITE_PROXY_URL_EMBED` au build, fallback sur
 * `PROXY_BASE_URL` (= cas du déploiement de référence). Cf. #180.
 */
export const PROXY_BASE_URL_EMBED: string = import.meta.env?.VITE_PROXY_URL_EMBED || PROXY_BASE_URL;

/**
 * URL de collecte du **beacon de télémétrie** baké dans le bundle lib
 * (`packages/core`). Le bundle étant distribué sur npm/CDN et chargé par
 * des sites tiers, l'URL doit pointer vers le domaine qui héberge la
 * collecte (typiquement = domaine d'embed).
 * Surchargeable via `VITE_BEACON_URL` au build, fallback sur
 * `PROXY_BASE_URL_EMBED` (= cas du déploiement de référence). Cf. #180.
 */
export const BEACON_BASE_URL: string = import.meta.env?.VITE_BEACON_URL || PROXY_BASE_URL_EMBED;

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

/**
 * Default production proxy configuration. Utilise `PROXY_BASE_URL_EMBED`
 * (= `PROXY_BASE_URL` par défaut) car les adapters de `packages/core`
 * tournent dans le bundle lib, qui s'exécute aussi bien dans l'app
 * elle-même (preview) que sur des sites tiers embarquant un widget.
 * Dans les deux cas, l'URL doit être celle publiquement accessible.
 * Cf. issue #180.
 */
export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  baseUrl: PROXY_BASE_URL_EMBED,
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
 * Get the proxy configuration based on the current environment.
 * - Dev mode: relative URLs (handled by Vite proxy)
 * - Tauri mode: full URLs to the production proxy (PROXY_BASE_URL_EMBED)
 * - Production web: PROXY_BASE_URL_EMBED
 *
 * Note : utilise `PROXY_BASE_URL_EMBED` (et non `PROXY_BASE_URL` runtime) car
 * cette config est consommée par les adapters de `packages/core` qui tournent
 * dans le bundle lib — chargé indifféremment dans l'app elle-même (preview)
 * ou sur un site tiers embarquant un widget. L'URL doit donc être celle
 * publiquement accessible. Sans `VITE_PROXY_URL_EMBED` défini, la cascade
 * retombe sur `PROXY_BASE_URL` (= déploiement de référence inchangé).
 * Cf. issue #180.
 */
export function getProxyConfig(): ProxyConfig {
  const endpoints = { ...DEFAULT_PROXY_CONFIG.endpoints };

  // Vite dev: relative URLs, proxy handled by vite.config.ts
  if (isViteDevMode()) {
    return { baseUrl: '', endpoints };
  }

  // Tauri: always use the remote proxy (embed URL = publicly accessible)
  if (isTauriMode()) {
    return { baseUrl: PROXY_BASE_URL_EMBED, endpoints };
  }

  // Production web
  return {
    baseUrl: PROXY_BASE_URL_EMBED,
    endpoints,
  };
}
