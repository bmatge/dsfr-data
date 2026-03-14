import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_PROXY_CONFIG,
  isViteDevMode,
  isTauriMode,
  getProxyConfig,
} from '../../packages/shared/src/api/proxy-config';

/** Helper: stub window.location for the duration of a callback */
function withLocation(overrides: Partial<Location>, fn: () => void) {
  const original = window.location;
  Object.defineProperty(window, 'location', {
    value: { ...original, ...overrides },
    writable: true,
    configurable: true,
  });
  try { fn(); } finally {
    Object.defineProperty(window, 'location', {
      value: original,
      writable: true,
      configurable: true,
    });
  }
}

describe('proxy-config', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DEFAULT_PROXY_CONFIG', () => {
    it('should have the production base URL', () => {
      expect(DEFAULT_PROXY_CONFIG.baseUrl).toBe('https://chartsbuilder.matge.com');
    });

    it('should have all endpoint paths', () => {
      expect(DEFAULT_PROXY_CONFIG.endpoints.grist).toBe('/grist-proxy');
      expect(DEFAULT_PROXY_CONFIG.endpoints.gristGouv).toBe('/grist-gouv-proxy');
      expect(DEFAULT_PROXY_CONFIG.endpoints.albert).toBe('/albert-proxy');
      expect(DEFAULT_PROXY_CONFIG.endpoints.tabular).toBe('/tabular-proxy');
    });
  });

  describe('isViteDevMode', () => {
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
    it('should return dev config (empty baseUrl) on localhost', () => {
      withLocation({ hostname: 'localhost', port: '5173' }, () => {
        const config = getProxyConfig();
        expect(config.baseUrl).toBe('');
        expect(config.endpoints).toEqual(DEFAULT_PROXY_CONFIG.endpoints);
      });
    });

    it('should return production config on non-localhost', () => {
      withLocation({ hostname: 'chartsbuilder.matge.com', port: '' }, () => {
        const config = getProxyConfig();
        expect(config.baseUrl).toBe(DEFAULT_PROXY_CONFIG.baseUrl);
        expect(config.endpoints).toEqual(DEFAULT_PROXY_CONFIG.endpoints);
      });
    });

    it('should return Tauri config when __TAURI__ is set', () => {
      withLocation({ hostname: 'tauri.localhost', port: '' }, () => {
        (window as Record<string, unknown>).__TAURI__ = {};
        const config = getProxyConfig();
        expect(config.baseUrl).toBe(DEFAULT_PROXY_CONFIG.baseUrl);
        delete (window as Record<string, unknown>).__TAURI__;
      });
    });
  });
});
