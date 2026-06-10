/**
 * Hook de cache externe pour dsfr-data-source (#307).
 *
 * La lib publiée ne parle à AUCUNE API applicative : l'ancien
 * _putCache/_getCache appelait l'endpoint applicatif de cache en relatif dès que
 * `isAuthenticated()` (logique du mode DB dans le composant central), avec
 * une clé réduite à `this.id` — le fallback pouvait resservir la page 3
 * filtrée d'hier pour une requête page 1 sans filtre.
 *
 * Le site déployeur (ou l'app) enregistre un provider via
 * `window.DSFR_DATA_CACHE_PROVIDER` AVANT le chargement des composants :
 *
 * ```js
 * window.DSFR_DATA_CACHE_PROVIDER = {
 *   async get(key) { ... },          // -> données ou null
 *   async put(key, data, ttl) { ... }
 * };
 * ```
 *
 * Sans provider, `cache-ttl` est un no-op (embed anonyme) — la sémantique
 * est documentée dans CLAUDE.md.
 */

export interface DsfrDataCacheProvider {
  /** Retourne les données mises en cache pour cette clé, ou null. */
  get(key: string): Promise<unknown | null>;
  /** Enregistre les données (fire-and-forget côté source). */
  put(key: string, data: unknown, ttlSeconds: number): Promise<void>;
}

declare global {
  interface Window {
    DSFR_DATA_CACHE_PROVIDER?: DsfrDataCacheProvider;
  }
}

/** Provider enregistré par la page hôte, ou null. */
export function getCacheProvider(): DsfrDataCacheProvider | null {
  if (typeof window === 'undefined') return null;
  const p = window.DSFR_DATA_CACHE_PROVIDER;
  if (p && typeof p.get === 'function' && typeof p.put === 'function') {
    return p;
  }
  return null;
}

/** Hash djb2 — stable, court, suffisant pour discriminer des fingerprints. */
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/**
 * Clé de cache : id de la source + hash du fingerprint de la requête
 * (URL/params/where/page...). Deux requêtes différentes de la même source
 * ne partagent plus jamais une entrée (#307).
 */
export function cacheKeyFor(sourceId: string, fingerprint: unknown): string {
  return `${sourceId}:${djb2(JSON.stringify(fingerprint ?? null))}`;
}
