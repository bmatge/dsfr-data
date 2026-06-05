/**
 * Provider registry and detection.
 *
 * detectProvider(url) tests each registered provider's urlPatterns and
 * returns the first match, or GENERIC_CONFIG as fallback.
 */

export type { ProviderConfig, ProviderId } from './provider-config.js';
export { ODS_CONFIG } from './opendatasoft.js';
export { TABULAR_CONFIG } from './tabular.js';
export { GRIST_CONFIG } from './grist.js';
export { GENERIC_CONFIG } from './generic.js';
export { INSEE_CONFIG } from './insee.js';
export type { DataGouvResource } from './datagouv-dataset.js';
export {
  parseDataGouvDataset,
  dataGouvDatasetApiUrl,
  extractDataGouvResources,
} from './datagouv-dataset.js';

import type { ProviderConfig, ProviderId } from './provider-config.js';
import { ODS_CONFIG } from './opendatasoft.js';
import { TABULAR_CONFIG } from './tabular.js';
import { GRIST_CONFIG } from './grist.js';
import { GENERIC_CONFIG } from './generic.js';
import { INSEE_CONFIG } from './insee.js';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const PROVIDER_REGISTRY = new Map<ProviderId, ProviderConfig>();

export function registerProvider(config: ProviderConfig): void {
  PROVIDER_REGISTRY.set(config.id, config);
}

export function getProvider(id: ProviderId): ProviderConfig {
  return PROVIDER_REGISTRY.get(id) ?? GENERIC_CONFIG;
}

export function getAllProviders(): ProviderConfig[] {
  return Array.from(PROVIDER_REGISTRY.values());
}

// Register built-in providers (order matters: first match wins in detectProvider)
registerProvider(ODS_CONFIG);
registerProvider(TABULAR_CONFIG);
registerProvider(GRIST_CONFIG);
registerProvider(INSEE_CONFIG);
registerProvider(GENERIC_CONFIG);

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detect the provider from an API URL by testing each registered
 * provider's urlPatterns. Returns GENERIC_CONFIG if no match.
 */
export function detectProvider(url: string): ProviderConfig {
  for (const provider of PROVIDER_REGISTRY.values()) {
    if (provider.id === 'generic') continue; // fallback, tested last
    for (const pattern of provider.urlPatterns) {
      if (pattern.test(url)) return provider;
    }
  }
  return GENERIC_CONFIG;
}

/**
 * Extract resource IDs from a URL for a given provider.
 * If no provider is specified, detects it first.
 */
export function extractResourceIds(
  url: string,
  provider?: ProviderConfig
): Record<string, string> | null {
  const p = provider ?? detectProvider(url);
  return p.resource.extractIds(url);
}

// ---------------------------------------------------------------------------
// URL resolution (page URL → API URL)
// ---------------------------------------------------------------------------

/**
 * Providers whose data API is served on the SAME origin as the human-facing
 * page (so the page's origin can be reused to build the API URL). For the
 * others (e.g. Tabular: page on data.gouv.fr, API on tabular-api.data.gouv.fr),
 * we fall back to the provider's `defaultBaseUrl`.
 */
const API_SAME_ORIGIN_AS_PAGE = new Set<ProviderId>(['opendatasoft', 'grist', 'generic']);

export interface ResolvedSourceUrl {
  /** Detected provider (GENERIC_CONFIG if none matched). */
  provider: ProviderConfig;
  /** Origin (scheme + host) of the pasted URL, or null if unparseable. */
  baseUrl: string | null;
  /** Resource IDs extracted from the URL, or null. */
  ids: Record<string, string> | null;
  /** Canonical API URL (records endpoint), or null if not derivable. */
  apiUrl: string | null;
  /** True when the pasted URL was a human page URL we rewrote into an API URL. */
  normalized: boolean;
}

/**
 * Resolve any pasted URL (a human explorer/page URL OR an already-built API
 * URL) into the canonical data API URL for its provider, without any network
 * call. Foundation of the "paste a URL, we figure out the rest" UX in the
 * sources app.
 *
 * Returns a GENERIC result (apiUrl=null) when the URL isn't recognised.
 */
export function resolveSourceUrl(rawUrl: string): ResolvedSourceUrl {
  const url = rawUrl.trim();
  const provider = detectProvider(url);

  let baseUrl: string | null;
  try {
    baseUrl = new URL(url).origin;
  } catch {
    baseUrl = null;
  }

  const ids = provider.resource.extractIds(url);

  let apiUrl: string | null = null;
  let canonical: string | null = null;
  if (ids && provider.resource.apiPathTemplate) {
    const apiBase =
      API_SAME_ORIGIN_AS_PAGE.has(provider.id) && baseUrl ? baseUrl : provider.defaultBaseUrl;
    if (apiBase) {
      let path = provider.resource.apiPathTemplate;
      for (const [key, value] of Object.entries(ids)) {
        path = path.replace(`{${key}}`, encodeURIComponent(value));
      }
      canonical = `${apiBase}${path}`;
      apiUrl = canonical;
      // Conserver UNIQUEMENT le param d'authentification `apikey` collé dans
      // l'URL : les autres params (limit/offset/where…) sont gérés par
      // l'adapter et seraient redondants/conflictuels. Sans ça, coller une URL
      // type `.../records?apikey=KEY` perdait la clé lors de la normalisation.
      try {
        const apikey = new URL(url).searchParams.get('apikey');
        if (apikey) apiUrl = `${canonical}?apikey=${encodeURIComponent(apikey)}`;
      } catch {
        /* url non parseable → pas de query à préserver */
      }
    }
  }

  const stripped = url.split(/[?#]/)[0].replace(/\/$/, '');
  // `normalized` reste calculé sur le chemin canonique (sans la query apikey)
  // pour ne pas signaler une réécriture quand seul un `?apikey=` est présent.
  const normalized = canonical !== null && stripped !== canonical.replace(/\/$/, '');

  return { provider, baseUrl, ids, apiUrl, normalized };
}

// ---------------------------------------------------------------------------
// Normalisation des en-têtes d'authentification par provider
// ---------------------------------------------------------------------------

/** Noms d'en-tête (insensible à la casse) couramment mal employés pour une clé. */
const APIKEY_HEADER_NAMES = new Set(['apikey', 'api-key', 'api_key', 'x-api-key']);

/**
 * Adapte les en-têtes d'authentification au format réellement attendu par le
 * provider détecté à partir de `apiUrl`.
 *
 * Cas OpenDataSoft (`apikey-header`) : ODS n'authentifie PAS un en-tête nommé
 * `Apikey` (ou `api-key`, `x-api-key`). La clé doit être envoyée via
 * `Authorization: Apikey <clé>`. Une clé fournie sous un mauvais nom d'en-tête
 * est donc silencieusement ignorée → ODS renvoie 404 (datasets privés masqués).
 * Cette fonction détecte ce cas et réécrit l'en-tête au bon format.
 *
 * Renvoie les en-têtes ajustés et un flag `changed` pour permettre à l'UI de
 * persister la correction et d'en informer l'utilisateur. Idempotente :
 * ne touche à rien si un en-tête `Authorization` est déjà présent.
 */
export function normalizeProviderAuthHeaders(
  apiUrl: string,
  headers: Record<string, string>
): { headers: Record<string, string>; changed: boolean } {
  const provider = detectProvider(apiUrl);
  if (provider.defaultAuthType !== 'apikey-header' || provider.id !== 'opendatasoft') {
    return { headers, changed: false };
  }

  // Déjà un Authorization → l'utilisateur sait ce qu'il fait, on n'écrase pas.
  const hasAuthorization = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
  if (hasAuthorization) return { headers, changed: false };

  let apikey: string | null = null;
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (apikey === null && APIKEY_HEADER_NAMES.has(name.toLowerCase()) && value) {
      apikey = value;
      continue; // on retire l'en-tête mal nommé
    }
    out[name] = value;
  }

  if (apikey === null) return { headers, changed: false };
  out['Authorization'] = `Apikey ${apikey}`;
  return { headers: out, changed: true };
}
