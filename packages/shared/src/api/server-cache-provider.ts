/**
 * Provider de cache serveur (mode DB) pour dsfr-data-source (#307).
 *
 * Implemente le hook `window.DSFR_DATA_CACHE_PROVIDER` cote APP : la lib
 * publiee ne connait plus /api/cache ni l'authentification — c'est ce
 * module (app-side, jamais dans les bundles npm) qui branche le fallback
 * offline du mode DB. Enregistre par @dsfr-data/app-ui (chrome commun).
 */
import { isAuthenticated } from '../auth/auth-service.js';

interface CacheProviderLike {
  get(key: string): Promise<unknown | null>;
  put(key: string, data: unknown, ttlSeconds: number): Promise<void>;
}

declare global {
  interface Window {
    DSFR_DATA_CACHE_PROVIDER?: CacheProviderLike;
  }
}

/**
 * Enregistre le provider /api/cache si aucun n'est deja pose par la page.
 * Les appels sont gates par isAuthenticated() au moment de l'appel (pas a
 * l'enregistrement) : un login en cours de session active le cache.
 */
export function registerServerCacheProvider(): void {
  if (typeof window === 'undefined') return;
  if (window.DSFR_DATA_CACHE_PROVIDER) return;

  window.DSFR_DATA_CACHE_PROVIDER = {
    async get(key: string): Promise<unknown | null> {
      if (!isAuthenticated()) return null;
      try {
        const res = await fetch(`/api/cache/${encodeURIComponent(key)}`, {
          credentials: 'include',
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json.data ?? null;
      } catch {
        return null;
      }
    },
    async put(key: string, data: unknown, ttlSeconds: number): Promise<void> {
      if (!isAuthenticated()) return;
      const recordCount = Array.isArray(data) ? data.length : 1;
      await fetch(`/api/cache/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ data, recordCount, ttlSeconds }),
      });
    },
  };
}
