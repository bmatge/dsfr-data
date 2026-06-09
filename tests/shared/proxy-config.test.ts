import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_PROXY_CONFIG,
  isViteDevMode,
  isTauriMode,
  getProxyConfig,
} from '../../packages/shared/src/api/proxy-config';

/**
 * Recharge le module proxy-config avec des variables VITE_* contrôlées.
 * Nécessaire car PROXY_BASE_URL* sont des constantes module-level lues au
 * chargement, et le .env local du repo peut définir VITE_PROXY_URL.
 */
async function loadProxyConfigWithEnv(env: Record<string, string>) {
  vi.resetModules();
  for (const key of ['VITE_PROXY_URL', 'VITE_PROXY_URL_EMBED', 'VITE_BEACON_URL']) {
    vi.stubEnv(key, env[key] ?? '');
  }
  return await import('../../packages/shared/src/api/proxy-config');
}

/** Helper: stub window.location for the duration of a callback */
function withLocation(overrides: Partial<Location>, fn: () => void) {
  const original = window.location;
  Object.defineProperty(window, 'location', {
    value: { ...original, ...overrides },
    writable: true,
    configurable: true,
  });
  try {
    fn();
  } finally {
    Object.defineProperty(window, 'location', {
      value: original,
      writable: true,
      configurable: true,
    });
  }
}

/** Helper: set window.DSFR_DATA_PROXY for the duration of a callback */
function withRuntimeProxy(value: unknown, fn: () => void) {
  const w = window as Record<string, unknown>;
  w.DSFR_DATA_PROXY = value;
  try {
    fn();
  } finally {
    delete w.DSFR_DATA_PROXY;
  }
}

describe('proxy-config', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('PROXY_BASE_URL', () => {
    it('has no hardcoded fallback domain (empty without VITE_* at build)', async () => {
      // #319 : plus aucun domaine personnel bake dans les bundles
      const mod = await loadProxyConfigWithEnv({});
      expect(mod.PROXY_BASE_URL).toBe('');
      expect(mod.PROXY_BASE_URL_EMBED).toBe('');
      expect(mod.BEACON_BASE_URL).toBe('');
    });

    it('still honors VITE_PROXY_URL at build time', async () => {
      const mod = await loadProxyConfigWithEnv({ VITE_PROXY_URL: 'https://proxy.example.fr' });
      expect(mod.PROXY_BASE_URL).toBe('https://proxy.example.fr');
      expect(mod.PROXY_BASE_URL_EMBED).toBe('https://proxy.example.fr');
    });
  });

  describe('DEFAULT_PROXY_CONFIG', () => {
    it('should have all endpoint paths', () => {
      expect(DEFAULT_PROXY_CONFIG.endpoints.grist).toBe('/grist-proxy');
      expect(DEFAULT_PROXY_CONFIG.endpoints.gristGouv).toBe('/grist-gouv-proxy');
      expect(DEFAULT_PROXY_CONFIG.endpoints.albert).toBe('/albert-proxy');
      expect(DEFAULT_PROXY_CONFIG.endpoints.tabular).toBe('/tabular-proxy');
    });

    it('defaults to direct mode without build-time configuration', async () => {
      const mod = await loadProxyConfigWithEnv({});
      expect(mod.DEFAULT_PROXY_CONFIG.baseUrl).toBe('');
      expect(mod.DEFAULT_PROXY_CONFIG.mode).toBe('direct');
    });
  });

  describe('isViteDevMode', () => {
    // Sous Vitest, import.meta.env.DEV === true : on teste donc le comportement
    // "dev de CE repo". Dans les bundles construits, DEV est inline a false et
    // la fonction retourne toujours false (un localhost tiers n'est pas notre dev).
    it('should return true on localhost with non-standard port', () => {
      withLocation({ hostname: 'localhost', port: '5173' }, () => {
        expect(isViteDevMode()).toBe(true);
      });
    });

    it('should return true on 127.0.0.1 with non-standard port', () => {
      withLocation({ hostname: '127.0.0.1', port: '3000' }, () => {
        expect(isViteDevMode()).toBe(true);
      });
    });

    it('should return false on production hostname', () => {
      withLocation({ hostname: 'chartsbuilder.matge.com', port: '' }, () => {
        expect(isViteDevMode()).toBe(false);
      });
    });

    it('should return false on localhost with standard port', () => {
      withLocation({ hostname: 'localhost', port: '443' }, () => {
        expect(isViteDevMode()).toBe(false);
      });
    });
  });

  describe('isTauriMode', () => {
    it('should return false when __TAURI__ is not defined', () => {
      expect(isTauriMode()).toBe(false);
    });

    it('should return true when __TAURI__ is defined', () => {
      (window as Record<string, unknown>).__TAURI__ = {};
      expect(isTauriMode()).toBe(true);
      delete (window as Record<string, unknown>).__TAURI__;
    });
  });

  describe('getProxyConfig', () => {
    it('should return dev-relative config (empty baseUrl) on localhost dev', () => {
      withLocation({ hostname: 'localhost', port: '5173' }, () => {
        const config = getProxyConfig();
        expect(config.baseUrl).toBe('');
        expect(config.mode).toBe('dev-relative');
        expect(config.endpoints).toEqual(DEFAULT_PROXY_CONFIG.endpoints);
      });
    });

    it('defaults to direct mode on a third-party site without configuration', async () => {
      const mod = await loadProxyConfigWithEnv({});
      withLocation({ hostname: 'mon-site-tiers.example.fr', port: '' }, () => {
        const config = mod.getProxyConfig();
        expect(config.mode).toBe('direct');
        expect(config.baseUrl).toBe('');
      });
    });

    it('uses the build-time proxy when VITE_PROXY_URL is set (self-hosted app)', async () => {
      const mod = await loadProxyConfigWithEnv({ VITE_PROXY_URL: 'https://proxy.example.fr' });
      withLocation({ hostname: 'proxy.example.fr', port: '' }, () => {
        const config = mod.getProxyConfig();
        expect(config.mode).toBe('remote');
        expect(config.baseUrl).toBe('https://proxy.example.fr');
      });
    });

    it('uses window.DSFR_DATA_PROXY string as remote proxy base URL', () => {
      withLocation({ hostname: 'mon-site-tiers.example.fr', port: '' }, () => {
        withRuntimeProxy('https://mon-proxy.example.fr/', () => {
          const config = getProxyConfig();
          expect(config.mode).toBe('remote');
          expect(config.baseUrl).toBe('https://mon-proxy.example.fr');
        });
      });
    });

    it('merges window.DSFR_DATA_PROXY object (baseUrl + endpoints)', () => {
      withRuntimeProxy({ baseUrl: '', endpoints: { tabular: '/mon-tabular' } }, () => {
        const config = getProxyConfig();
        expect(config.mode).toBe('remote');
        expect(config.baseUrl).toBe('');
        expect(config.endpoints.tabular).toBe('/mon-tabular');
        expect(config.endpoints.grist).toBe('/grist-proxy');
      });
    });

    it('window.DSFR_DATA_PROXY = false forces direct mode (even in dev)', () => {
      withLocation({ hostname: 'localhost', port: '5173' }, () => {
        withRuntimeProxy(false, () => {
          const config = getProxyConfig();
          expect(config.mode).toBe('direct');
        });
      });
    });

    it('runtime override takes precedence over dev mode', () => {
      withLocation({ hostname: 'localhost', port: '5173' }, () => {
        withRuntimeProxy('https://proxy.example.fr', () => {
          expect(getProxyConfig().mode).toBe('remote');
        });
      });
    });
  });
});
