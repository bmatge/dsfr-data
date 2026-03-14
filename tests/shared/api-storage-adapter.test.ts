import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ApiStorageAdapter } from '../../packages/shared/src/storage/api-storage-adapter';
import { STORAGE_KEYS } from '../../packages/shared/src/storage/local-storage';

describe('ApiStorageAdapter', () => {
  let adapter: ApiStorageAdapter;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    adapter = new ApiStorageAdapter('');
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('load', () => {
    it('fetches from API and caches to localStorage', async () => {
      const apiData = [{ id: 'src-1', name: 'Source A' }];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(apiData),
      });

      const result = await adapter.load(STORAGE_KEYS.SOURCES, []);

      expect(result).toEqual(apiData);
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/sources', { credentials: 'include' });

      // Verify localStorage cache was updated
      const cached = JSON.parse(localStorage.getItem(STORAGE_KEYS.SOURCES)!);
      expect(cached).toEqual(apiData);
    });

    it('falls back to localStorage on network error', async () => {
      localStorage.setItem(STORAGE_KEYS.SOURCES, JSON.stringify([{ id: 'cached' }]));

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await adapter.load(STORAGE_KEYS.SOURCES, []);

      expect(result).toEqual([{ id: 'cached' }]);
    });

    it('falls back to localStorage on non-ok response', async () => {
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify([{ id: 'fav-1' }]));

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await adapter.load(STORAGE_KEYS.FAVORITES, []);

      expect(result).toEqual([{ id: 'fav-1' }]);
    });

    it('returns default when no API and no localStorage', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));

      const result = await adapter.load(STORAGE_KEYS.SOURCES, []);

      expect(result).toEqual([]);
    });

    it('uses localStorage directly for keys without API endpoint', async () => {
      localStorage.setItem(STORAGE_KEYS.SELECTED_SOURCE, JSON.stringify({ id: 'sel-1' }));

      globalThis.fetch = vi.fn();

      const result = await adapter.load(STORAGE_KEYS.SELECTED_SOURCE, null);

      expect(result).toEqual({ id: 'sel-1' });
      // Should NOT call fetch for non-API keys
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('save', () => {
    it('saves to localStorage immediately', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const data = [{ id: 'src-1', name: 'New' }];
      const result = await adapter.save(STORAGE_KEYS.SOURCES, data);

      expect(result).toBe(true);

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.SOURCES)!);
      expect(stored).toEqual(data);
    });

    it('saves non-API keys to localStorage only', async () => {
      globalThis.fetch = vi.fn();

      await adapter.save(STORAGE_KEYS.SELECTED_SOURCE, { id: 'x' });

      expect(globalThis.fetch).not.toHaveBeenCalled();
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.SELECTED_SOURCE)!);
      expect(stored).toEqual({ id: 'x' });
    });

    it('does not fail if API sync fails', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('API down'));

      const data = [{ id: 'src-1' }];
      const result = await adapter.save(STORAGE_KEYS.SOURCES, data);

      // localStorage save still succeeds
      expect(result).toBe(true);
    });
  });

  describe('load — merge server with local', () => {
    it('repairs connection with null config_json using local data', async () => {
      // Local has complete connection data (flat fields)
      const localConn = {
        id: 'conn-1', name: 'My Grist', type: 'grist',
        url: 'https://grist.numerique.gouv.fr', apiKey: null, isPublic: true,
        status: 'connected', statusText: '6 documents',
      };
      localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify([localConn]));

      // Server returns connection with null config_json (pre-fix data)
      const serverConn = {
        id: 'conn-1', name: 'My Grist', type: 'grist',
        config_json: null, status: 'unknown',
        owner_id: 'user-1', _owned: true,
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([serverConn]),
      });

      const result = await adapter.load(STORAGE_KEYS.CONNECTIONS, []);

      // Should use local data (has url field)
      expect(result).toHaveLength(1);
      expect((result as Record<string, unknown>[])[0].url).toBe('https://grist.numerique.gouv.fr');
      expect((result as Record<string, unknown>[])[0].status).toBe('connected');
    });

    it('repairs source with null config_json using local data', async () => {
      const localSource = {
        id: 'src-1', name: 'ODS Data', type: 'api',
        apiUrl: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/...',
        provider: 'opendatasoft', recordCount: 42,
      };
      localStorage.setItem(STORAGE_KEYS.SOURCES, JSON.stringify([localSource]));

      const serverSource = {
        id: 'src-1', name: 'ODS Data', type: 'api',
        config_json: null, data_json: null, record_count: 0,
        owner_id: 'user-1',
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([serverSource]),
      });

      const result = await adapter.load(STORAGE_KEYS.SOURCES, []);

      expect(result).toHaveLength(1);
      expect((result as Record<string, unknown>[])[0].apiUrl).toContain('data.economie.gouv.fr');
      expect((result as Record<string, unknown>[])[0].recordCount).toBe(42);
    });

    it('flattens server config_json to top-level fields (prevents double-nesting)', async () => {
      const localConn = {
        id: 'conn-1', name: 'Old Name', type: 'grist',
        url: 'https://old.url', status: 'connected',
      };
      localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify([localConn]));

      // Server has complete config_json (post-fix data)
      const serverConn = {
        id: 'conn-1', name: 'New Name', type: 'grist',
        config_json: { url: 'https://grist.numerique.gouv.fr', apiKey: null, isPublic: true },
        status: 'connected',
        owner_id: 'user-1', _owned: true,
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([serverConn]),
      });

      const result = await adapter.load(STORAGE_KEYS.CONNECTIONS, []);
      const conn = (result as Record<string, unknown>[])[0];

      // Server data should be flattened to client format
      expect(conn.name).toBe('New Name');
      expect(conn.url).toBe('https://grist.numerique.gouv.fr');
      expect(conn.apiKey).toBeNull();
      expect(conn.isPublic).toBe(true);
      // Server-only fields must be stripped (prevent re-packing into configJson)
      expect(conn.config_json).toBeUndefined();
      expect(conn.owner_id).toBeUndefined();
      expect(conn._owned).toBeUndefined();
    });

    it('flattens server source with data_json and record_count', async () => {
      localStorage.removeItem(STORAGE_KEYS.SOURCES);

      const serverSource = {
        id: 'src-1', name: 'My Source', type: 'api',
        config_json: { apiUrl: 'https://example.com/api', method: 'GET' },
        data_json: [{ a: 1 }, { a: 2 }],
        record_count: 42,
        owner_id: 'user-1',
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([serverSource]),
      });

      const result = await adapter.load(STORAGE_KEYS.SOURCES, []);
      const src = (result as Record<string, unknown>[])[0];

      // Flattened fields
      expect(src.apiUrl).toBe('https://example.com/api');
      expect(src.method).toBe('GET');
      expect(src.data).toEqual([{ a: 1 }, { a: 2 }]);
      expect(src.recordCount).toBe(42);
      // Server-only fields stripped
      expect(src.config_json).toBeUndefined();
      expect(src.data_json).toBeUndefined();
      expect(src.record_count).toBeUndefined();
      expect(src.owner_id).toBeUndefined();
    });

    it('keeps server data when no local counterpart exists (still flattened)', async () => {
      // Empty local storage
      localStorage.removeItem(STORAGE_KEYS.CONNECTIONS);

      const serverConn = {
        id: 'conn-1', name: 'Server Only', type: 'api',
        config_json: null, status: 'unknown',
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([serverConn]),
      });

      const result = await adapter.load(STORAGE_KEYS.CONNECTIONS, []);

      // No local data to repair from — still flattened (server-only fields removed)
      expect(result).toHaveLength(1);
      expect((result as Record<string, unknown>[])[0].config_json).toBeUndefined();
      expect((result as Record<string, unknown>[])[0].owner_id).toBeUndefined();
    });

    it('does not merge for favorites (non-config resources)', async () => {
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify([{ id: 'fav-1', code: 'local' }]));

      const serverFav = { id: 'fav-1', code: 'server' };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([serverFav]),
      });

      const result = await adapter.load(STORAGE_KEYS.FAVORITES, []);

      // Favorites should use server data directly (no merge)
      expect((result as Record<string, unknown>[])[0].code).toBe('server');
    });
  });

  describe('remove', () => {
    it('removes from localStorage', async () => {
      localStorage.setItem(STORAGE_KEYS.SOURCES, '"data"');

      await adapter.remove(STORAGE_KEYS.SOURCES);

      expect(localStorage.getItem(STORAGE_KEYS.SOURCES)).toBeNull();
    });
  });
});
