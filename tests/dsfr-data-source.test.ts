import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for DsfrDataSource component logic.
 *
 * Since JSDOM doesn't fully support custom elements, we test
 * the core logic (URL building, fetch options) by importing the class
 * and exercising its internal methods via a test instance.
 */

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// We need to import after setting up fetch mock
import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { getDataCache, clearDataCache, getDataMeta, clearDataMeta } from '@/utils/data-bridge.js';

describe('DsfrDataSource', () => {
  let source: DsfrDataSource;

  beforeEach(() => {
    clearDataCache('test-source');
    mockFetch.mockReset();
    // Create instance manually (JSDOM won't upgrade custom elements)
    source = new DsfrDataSource();
  });

  describe('URL building', () => {
    it('builds a URL from the url property', () => {
      source.url = 'https://api.example.com/data';
      source.method = 'GET';
      source.params = '';

      // Access private method via any cast for testing
      const url = (source as any)._buildUrl();
      expect(url).toBe('https://api.example.com/data');
    });

    it('appends query params for GET requests', () => {
      source.url = 'https://api.example.com/data';
      source.method = 'GET';
      source.params = '{"limit": "10", "offset": "0"}';

      const url = (source as any)._buildUrl();
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=0');
    });

    it('does not append params to URL for POST requests', () => {
      source.url = 'https://api.example.com/data';
      source.method = 'POST';
      source.params = '{"query": "test"}';

      const url = (source as any)._buildUrl();
      expect(url).not.toContain('query');
    });

    it('warns on invalid JSON params', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      source.url = 'https://api.example.com/data';
      source.method = 'GET';
      source.params = 'not-json';

      (source as any)._buildUrl();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('fetch options building', () => {
    it('builds GET options by default', () => {
      source.method = 'GET';
      source.headers = '';
      source.params = '';

      const options = (source as any)._buildFetchOptions();
      expect(options.method).toBe('GET');
      expect(options.body).toBeUndefined();
    });

    it('builds POST options with body and content-type', () => {
      source.method = 'POST';
      source.headers = '';
      source.params = '{"key": "value"}';

      const options = (source as any)._buildFetchOptions();
      expect(options.method).toBe('POST');
      expect(options.body).toBe('{"key": "value"}');
      expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('parses custom headers', () => {
      source.method = 'GET';
      source.headers = '{"Authorization": "Bearer token123"}';
      source.params = '';

      const options = (source as any)._buildFetchOptions();
      expect(options.headers.Authorization).toBe('Bearer token123');
    });

    it('merges custom headers with Content-Type for POST', () => {
      source.method = 'POST';
      source.headers = '{"X-Custom": "value"}';
      source.params = '{"data": true}';

      const options = (source as any)._buildFetchOptions();
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['X-Custom']).toBe('value');
    });

    it('warns on invalid JSON headers', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      source.method = 'GET';
      source.headers = 'not-json';
      source.params = '';

      (source as any)._buildFetchOptions();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('data fetching', () => {
    it('does not fetch when url is empty', async () => {
      source.url = '';
      source.id = 'test-source';
      await (source as any)._fetchData();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('reports config error when id is not set (#283)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      source.url = 'https://api.example.com/data';
      // id is empty
      await (source as any)._fetchData();
      expect(errorSpy).toHaveBeenCalled();
      expect(source.getAttribute('data-dsfr-config-error')).toMatch(/id/);
      expect(mockFetch).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('fetches data and dispatches loaded event', async () => {
      const testData = { results: [1, 2, 3] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(testData),
      });

      source.url = 'https://api.example.com/data';
      source.id = 'test-source';
      source.transform = '';

      await (source as any)._fetchData();

      expect(mockFetch).toHaveBeenCalled();
      expect(source.getData()).toEqual(testData);
      expect(getDataCache('test-source')).toEqual(testData);
    });

    it('applies transform path', async () => {
      const testData = { data: { items: [{ id: 1 }] } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(testData),
      });

      source.url = 'https://api.example.com/data';
      source.id = 'test-source';
      source.transform = 'data.items';

      await (source as any)._fetchData();

      expect(source.getData()).toEqual([{ id: 1 }]);
    });

    it('handles HTTP errors', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      source.url = 'https://api.example.com/data';
      source.id = 'test-source';

      await (source as any)._fetchData();

      expect(source.getError()).toBeTruthy();
      expect(source.getError()?.message).toContain('404');
      errorSpy.mockRestore();
    });

    it('handles network errors', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      source.url = 'https://api.example.com/data';
      source.id = 'test-source';

      await (source as any)._fetchData();

      expect(source.getError()?.message).toBe('Network failure');
      errorSpy.mockRestore();
    });

    it('ignores abort errors', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      source.url = 'https://api.example.com/data';
      source.id = 'test-source';

      await (source as any)._fetchData();

      // Should NOT set error state for abort
      expect(source.getError()).toBeNull();
      errorSpy.mockRestore();
    });
  });

  describe('server pagination', () => {
    beforeEach(() => {
      clearDataMeta('test-source');
    });

    it('injects page and page_size in URL when paginate=true', () => {
      source.url = 'https://tabular-api.data.gouv.fr/api/resources/abc/data/';
      source.paginate = true;
      source.pageSize = 20;
      source.method = 'GET';
      source.params = '';

      const url = (source as any)._buildUrl();
      expect(url).toContain('page=1');
      expect(url).toContain('page_size=20');
    });

    it('does not inject pagination params when paginate=false', () => {
      source.url = 'https://api.example.com/data';
      source.paginate = false;
      source.method = 'GET';
      source.params = '';

      const url = (source as any)._buildUrl();
      expect(url).not.toContain('page=');
      expect(url).not.toContain('page_size=');
    });

    it('stores pagination meta from API response', async () => {
      const testData = {
        data: [{ id: 1 }, { id: 2 }],
        meta: { page: 1, page_size: 20, total: 100 },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(testData),
      });

      source.url = 'https://tabular-api.data.gouv.fr/api/resources/abc/data/';
      source.id = 'test-source';
      source.paginate = true;
      source.pageSize = 20;
      source.transform = '';

      await (source as any)._fetchData();

      const meta = getDataMeta('test-source');
      expect(meta).toBeDefined();
      expect(meta!.page).toBe(1);
      expect(meta!.pageSize).toBe(20);
      expect(meta!.total).toBe(100);
    });

    it('auto-extracts json.data when paginate=true and no transform', async () => {
      const testData = {
        data: [{ id: 1 }, { id: 2 }],
        meta: { page: 1, page_size: 20, total: 2 },
        links: {},
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(testData),
      });

      source.url = 'https://tabular-api.data.gouv.fr/api/resources/abc/data/';
      source.id = 'test-source';
      source.paginate = true;
      source.pageSize = 20;
      source.transform = '';

      await (source as any)._fetchData();

      // Should extract json.data, not the whole json
      expect(source.getData()).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('uses transform over auto-extract when both available', async () => {
      const testData = {
        data: [{ id: 1 }],
        results: [{ id: 99 }],
        meta: { page: 1, page_size: 20, total: 1 },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(testData),
      });

      source.url = 'https://tabular-api.data.gouv.fr/api/resources/abc/data/';
      source.id = 'test-source';
      source.paginate = true;
      source.pageSize = 20;
      source.transform = 'results';

      await (source as any)._fetchData();

      expect(source.getData()).toEqual([{ id: 99 }]);
    });

    it('updates currentPage on page request', () => {
      source.url = 'https://tabular-api.data.gouv.fr/api/resources/abc/data/';
      source.paginate = true;
      source.pageSize = 20;
      source.method = 'GET';
      source.params = '';

      (source as any)._currentPage = 3;
      const url = (source as any)._buildUrl();
      expect(url).toContain('page=3');
    });
  });

  describe('public API', () => {
    it('getData() returns null initially', () => {
      expect(source.getData()).toBeNull();
    });

    it('isLoading() returns false initially', () => {
      expect(source.isLoading()).toBe(false);
    });

    it('getError() returns null initially', () => {
      expect(source.getError()).toBeNull();
    });
  });

  describe('adapter mode detection', () => {
    it('is not adapter mode when apiType=generic and url is set', () => {
      source.apiType = 'generic';
      source.url = 'https://api.example.com/data';
      expect((source as any)._isAdapterMode()).toBe(false);
    });

    it('is adapter mode when apiType=opendatasoft', () => {
      source.apiType = 'opendatasoft';
      expect((source as any)._isAdapterMode()).toBe(true);
    });

    it('is adapter mode when apiType=tabular', () => {
      source.apiType = 'tabular';
      expect((source as any)._isAdapterMode()).toBe(true);
    });

    it('is adapter mode when apiType=grist', () => {
      source.apiType = 'grist';
      expect((source as any)._isAdapterMode()).toBe(true);
    });

    it('is adapter mode when generic with baseUrl and no url', () => {
      source.apiType = 'generic';
      source.url = '';
      source.baseUrl = 'https://custom-api.example.com';
      expect((source as any)._isAdapterMode()).toBe(true);
    });
  });

  describe('getAdapter', () => {
    it('returns null in URL mode', () => {
      source.apiType = 'generic';
      source.url = 'https://api.example.com/data';
      expect(source.getAdapter()).toBeNull();
    });

    it('returns adapter in adapter mode', () => {
      source.apiType = 'opendatasoft';
      const adapter = source.getAdapter();
      expect(adapter).toBeTruthy();
      expect(adapter!.type).toBe('opendatasoft');
    });

    it('caches adapter instance', () => {
      source.apiType = 'tabular';
      const adapter1 = source.getAdapter();
      const adapter2 = source.getAdapter();
      expect(adapter1).toBe(adapter2);
    });
  });

  describe('getEffectiveWhere', () => {
    it('returns static where when no overlays', () => {
      source.apiType = 'opendatasoft';
      source.where = 'region = "IDF"';
      expect(source.getEffectiveWhere()).toBe('region = "IDF"');
    });

    it('merges static where with overlays using ODSQL separator', () => {
      source.apiType = 'opendatasoft';
      source.where = 'region = "IDF"';
      // Set overlays via command handling
      (source as any)._whereOverlays.set('facets', 'dept = "75"');
      (source as any)._whereOverlays.set('search', 'search("Paris")');

      const result = source.getEffectiveWhere();
      expect(result).toBe('region = "IDF" AND dept = "75" AND search("Paris")');
    });

    it('merges with colon separator for non-ODS providers', () => {
      source.apiType = 'tabular';
      source.where = 'region:eq:IDF';
      (source as any)._whereOverlays.set('facets', 'dept:eq:75');

      const result = source.getEffectiveWhere();
      expect(result).toBe('region:eq:IDF, dept:eq:75');
    });

    it('excludes specified key from overlays', () => {
      source.apiType = 'opendatasoft';
      source.where = '';
      (source as any)._whereOverlays.set('facets', 'dept = "75"');
      (source as any)._whereOverlays.set('search', 'search("Paris")');

      const result = source.getEffectiveWhere('facets');
      expect(result).toBe('search("Paris")');
    });

    it('returns empty string when no where clauses', () => {
      source.apiType = 'opendatasoft';
      source.where = '';
      expect(source.getEffectiveWhere()).toBe('');
    });
  });

  describe('adapter mode fetching', () => {
    it('reports config error and skips when id is not set in adapter mode (#283)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      source.apiType = 'opendatasoft';
      source.id = '';
      source.datasetId = 'test-dataset';

      await (source as any)._fetchViaAdapter();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('id'));
      expect(mockFetch).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('reports config error and dispatches dsfr-data-error when validation fails (#283)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      source.apiType = 'opendatasoft';
      source.id = 'test-source';
      source.datasetId = ''; // Missing required dataset-id

      await (source as any)._fetchViaAdapter();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('dataset-id'));
      expect(source.getAttribute('data-dsfr-config-error')).toContain('dataset-id');
      expect(mockFetch).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('fetches data via adapter fetchAll', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ dep: '75', value: 100 }],
            total_count: 1,
          }),
      });

      source.apiType = 'opendatasoft';
      source.id = 'test-source';
      source.baseUrl = 'https://data.example.com';
      source.datasetId = 'test-dataset';

      await (source as any)._fetchViaAdapter();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(source.getData()).toBeTruthy();
      expect(source.isLoading()).toBe(false);
    });

    it('handles adapter fetch errors', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error('Server error'));

      source.apiType = 'opendatasoft';
      source.id = 'test-source';
      source.baseUrl = 'https://data.example.com';
      source.datasetId = 'test-dataset';

      await (source as any)._fetchViaAdapter();

      expect(source.getError()?.message).toBe('Server error');
      errorSpy.mockRestore();
    });

    it('ignores abort errors in adapter mode', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      source.apiType = 'opendatasoft';
      source.id = 'test-source';
      source.baseUrl = 'https://data.example.com';
      source.datasetId = 'test-dataset';

      await (source as any)._fetchViaAdapter();

      expect(source.getError()).toBeNull();
    });

    it('uses serverSide mode with fetchPage when serverSide=true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ dep: '75', value: 100 }],
            total_count: 500,
          }),
      });

      source.apiType = 'opendatasoft';
      source.id = 'test-source';
      source.baseUrl = 'https://data.example.com';
      source.datasetId = 'test-dataset';
      source.serverSide = true;
      source.pageSize = 20;

      await (source as any)._fetchViaAdapter();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const meta = getDataMeta('test-source');
      expect(meta).toBeDefined();
      expect(meta!.page).toBe(1);
      expect(meta!.pageSize).toBe(20);
      expect(meta!.total).toBe(500);
    });
  });

  describe('adapter params construction', () => {
    it('builds correct AdapterParams', () => {
      source.apiType = 'opendatasoft';
      source.baseUrl = 'https://data.example.com';
      source.datasetId = 'test-dataset';
      source.select = 'nom, count(*) as total';
      source.where = 'region = "IDF"';
      source.groupBy = 'region';
      source.aggregate = 'population:sum';
      source.orderBy = 'total:desc';
      source.limit = 50;
      source.pageSize = 20;
      source.headers = '{"apikey": "secret"}';

      const params = source.getAdapterParams();

      expect(params.baseUrl).toBe('https://data.example.com');
      expect(params.datasetId).toBe('test-dataset');
      expect(params.select).toBe('nom, count(*) as total');
      expect(params.groupBy).toBe('region');
      expect(params.aggregate).toBe('population:sum');
      expect(params.orderBy).toBe('total:desc');
      expect(params.limit).toBe(50);
      expect(params.pageSize).toBe(20);
      expect(params.headers).toEqual({ apikey: 'secret' });
    });

    it('handles invalid headers JSON gracefully', () => {
      source.apiType = 'tabular';
      source.resource = 'abc-123';
      source.headers = 'not-json';

      const params = source.getAdapterParams();
      expect(params.headers).toBeUndefined();
    });

    it('uses orderBy overlay when set', () => {
      source.apiType = 'opendatasoft';
      source.datasetId = 'test';
      source.orderBy = 'nom:asc';
      (source as any)._orderByOverlay = 'population:desc';

      const params = source.getAdapterParams();
      expect(params.orderBy).toBe('population:desc');
    });
  });

  describe('inline data', () => {
    it('dispatches parsed inline JSON data', () => {
      source.id = 'test-source';
      source.data = '[{"nom": "Paris"}, {"nom": "Lyon"}]';

      (source as any)._dispatchInlineData();

      expect(source.getData()).toEqual([{ nom: 'Paris' }, { nom: 'Lyon' }]);
    });

    it('reports config error when id is not set for inline data (#283)', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      source.data = '[1, 2, 3]';

      (source as any)._dispatchInlineData();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('id'));
      errorSpy.mockRestore();
    });

    it('sets error for invalid inline JSON', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      source.id = 'test-source';
      source.data = 'not-json';

      (source as any)._dispatchInlineData();

      expect(source.getError()).toBeTruthy();
      expect(source.getError()?.message).toContain('JSON');
      errorSpy.mockRestore();
    });
  });

  describe('cleanup', () => {
    it('clears refresh interval', () => {
      source.refresh = 10;
      (source as any)._setupRefresh();
      expect((source as any)._refreshInterval).toBeTruthy();

      (source as any)._cleanup();
      expect((source as any)._refreshInterval).toBeNull();
    });

    it('aborts pending fetch', () => {
      (source as any)._abortController = new AbortController();
      const abortSpy = vi.spyOn((source as any)._abortController, 'abort');

      (source as any)._cleanup();

      expect(abortSpy).toHaveBeenCalled();
      expect((source as any)._abortController).toBeNull();
    });

    it('unsubscribes command listener', () => {
      const unsubFn = vi.fn();
      (source as any)._unsubscribeCommands = unsubFn;

      (source as any)._cleanup();

      expect(unsubFn).toHaveBeenCalled();
      expect((source as any)._unsubscribeCommands).toBeNull();
    });
  });

  describe('refresh setup', () => {
    afterEach(() => {
      (source as any)._cleanup();
    });

    it('sets interval when refresh > 0', () => {
      source.refresh = 60;
      (source as any)._setupRefresh();
      expect((source as any)._refreshInterval).toBeTruthy();
    });

    it('does not set interval when refresh = 0', () => {
      source.refresh = 0;
      (source as any)._setupRefresh();
      expect((source as any)._refreshInterval).toBeNull();
    });

    it('clears previous interval when refresh changes', () => {
      source.refresh = 60;
      (source as any)._setupRefresh();
      const firstInterval = (source as any)._refreshInterval;

      source.refresh = 120;
      (source as any)._setupRefresh();

      expect((source as any)._refreshInterval).not.toBe(firstInterval);
    });
  });

  describe('reload', () => {
    it('calls _fetchData', async () => {
      source.url = 'https://api.example.com/data';
      source.id = 'test-source';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      source.reload();

      // reload triggers _fetchData which calls fetch
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('cache externe via hook (#307)', () => {
    afterEach(() => {
      delete (window as any).DSFR_DATA_CACHE_PROVIDER;
    });

    it('_putCache delegue au provider avec une cle hachee id:fingerprint', async () => {
      const put = vi.fn().mockResolvedValue(undefined);
      (window as any).DSFR_DATA_CACHE_PROVIDER = { get: vi.fn(), put };

      const source = new DsfrDataSource();
      source.id = 'test-source';
      source.cacheTtl = 7200;
      await (source as any)._putCache([{ a: 1 }, { a: 2 }]);

      expect(put).toHaveBeenCalledTimes(1);
      const [key, data, ttl] = put.mock.calls[0];
      expect(key).toMatch(/^test-source:[a-z0-9]+$/);
      expect(data).toEqual([{ a: 1 }, { a: 2 }]);
      expect(ttl).toBe(7200);
    });

    it('la cle change avec la page et le where (fini la page 3 filtree resservie en page 1)', async () => {
      const put = vi.fn().mockResolvedValue(undefined);
      (window as any).DSFR_DATA_CACHE_PROVIDER = { get: vi.fn(), put };

      const source = new DsfrDataSource();
      source.id = 'test-source';
      await (source as any)._putCache([]);
      (source as any)._currentPage = 3;
      source.where = 'statut:eq:actif';
      await (source as any)._putCache([]);

      expect(put.mock.calls[0][0]).not.toBe(put.mock.calls[1][0]);
    });

    it('_getCache lit le provider et retourne ses donnees', async () => {
      const get = vi.fn().mockResolvedValue([{ cached: true }]);
      (window as any).DSFR_DATA_CACHE_PROVIDER = { get, put: vi.fn() };

      const source = new DsfrDataSource();
      source.id = 'test-source';
      const result = await (source as any)._getCache();

      expect(get).toHaveBeenCalledWith(expect.stringMatching(/^test-source:/));
      expect(result).toEqual([{ cached: true }]);
    });

    it('sans provider enregistre, cache-ttl est un no-op (aucun fetch /api/cache)', async () => {
      mockFetch.mockClear();
      const source = new DsfrDataSource();
      source.id = 'test-source';
      await (source as any)._putCache([{ a: 1 }]);
      const result = await (source as any)._getCache();

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('un provider qui jette ne casse pas la lecture (null)', async () => {
      (window as any).DSFR_DATA_CACHE_PROVIDER = {
        get: vi.fn().mockRejectedValue(new Error('down')),
        put: vi.fn(),
      };
      const source = new DsfrDataSource();
      source.id = 'test-source';
      expect(await (source as any)._getCache()).toBeNull();
    });
  });

  describe('cache integration with fetch (hook #307)', () => {
    let provider: { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      provider = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
      };
      (window as any).DSFR_DATA_CACHE_PROVIDER = provider;
    });

    afterEach(() => {
      delete (window as any).DSFR_DATA_CACHE_PROVIDER;
    });

    it('saves to cache after successful URL fetch when a provider is registered', async () => {
      const testData = { results: [1, 2, 3] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(testData),
      });

      const source = new DsfrDataSource();
      source.id = 'cache-url-src';
      source.url = 'https://example.com/data.json';
      source.cacheTtl = 3600;
      await (source as any)._fetchData();

      expect(provider.put).toHaveBeenCalledTimes(1);
      expect(provider.put.mock.calls[0][0]).toMatch(/^cache-url-src:/);
    });

    it('falls back to provider cache on URL fetch error', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      provider.get.mockResolvedValue([{ cached: true }]);
      mockFetch.mockRejectedValueOnce(new Error('network down'));

      const source = new DsfrDataSource();
      source.id = 'cache-fallback-src';
      source.url = 'https://example.com/data.json';
      source.cacheTtl = 3600;
      await (source as any)._fetchData();

      expect(provider.get).toHaveBeenCalled();
      expect(source.getData()).toEqual([{ cached: true }]);
      errorSpy.mockRestore();
    });

    it('dispatches cache-fallback event on cache hit', async () => {
      provider.get.mockResolvedValue([{ cached: true }]);
      mockFetch.mockRejectedValueOnce(new Error('network down'));

      const source = new DsfrDataSource();
      source.id = 'cache-event-src';
      source.url = 'https://example.com/data.json';
      source.cacheTtl = 3600;
      const events: unknown[] = [];
      source.addEventListener('cache-fallback', (e) => events.push(e));
      await (source as any)._fetchData();

      expect(events).toHaveLength(1);
    });

    it('sets error when both fetch and provider cache fail', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      provider.get.mockResolvedValue(null);
      mockFetch.mockRejectedValueOnce(new Error('network down'));

      const source = new DsfrDataSource();
      source.id = 'cache-fail-src';
      source.url = 'https://example.com/data.json';
      source.cacheTtl = 3600;
      await (source as any)._fetchData();

      expect(source.getError()).toBeTruthy();
      errorSpy.mockRestore();
    });

    it('cache-ttl=0 disables the hook entirely', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ a: 1 }]),
      });

      const source = new DsfrDataSource();
      source.id = 'cache-off-src';
      source.url = 'https://example.com/data.json';
      source.cacheTtl = 0;
      await (source as any)._fetchData();

      expect(provider.put).not.toHaveBeenCalled();
    });
  });

  describe('command listener', () => {
    it('does not set up listener when no pagination and not adapter mode', () => {
      source.id = 'test-source';
      source.url = 'https://api.example.com/data';
      source.apiType = 'generic';
      source.paginate = false;
      source.serverSide = false;

      (source as any)._setupCommandListener();
      expect((source as any)._unsubscribeCommands).toBeNull();
    });

    it('sets up listener when paginate=true', () => {
      source.id = 'test-source';
      source.paginate = true;

      (source as any)._setupCommandListener();
      expect((source as any)._unsubscribeCommands).toBeTruthy();
      (source as any)._cleanup();
    });

    it('sets up listener in adapter mode', () => {
      source.id = 'test-source';
      source.apiType = 'opendatasoft';

      (source as any)._setupCommandListener();
      expect((source as any)._unsubscribeCommands).toBeTruthy();
      (source as any)._cleanup();
    });

    it('does not set up listener when id is empty', () => {
      source.id = '';
      source.paginate = true;

      (source as any)._setupCommandListener();
      expect((source as any)._unsubscribeCommands).toBeNull();
    });
  });

  describe('api-key-ref', () => {
    afterEach(() => {
      delete (window as any).DSFR_DATA_KEYS;
    });

    it('resolves Authorization header from window.DSFR_DATA_KEYS', () => {
      (window as any).DSFR_DATA_KEYS = { tmdb: 'Bearer eyJtoken' };
      source.apiKeyRef = 'tmdb';

      const headers = (source as any)._resolveApiKeyHeaders();
      expect(headers).toEqual({ Authorization: 'Bearer eyJtoken' });
    });

    it('returns null and warns when key is missing from registry', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (window as any).DSFR_DATA_KEYS = { other: 'token' };
      source.apiKeyRef = 'tmdb';
      source.id = 'test';

      const headers = (source as any)._resolveApiKeyHeaders();
      expect(headers).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('introuvable'));
      warnSpy.mockRestore();
    });

    it('returns null and warns when DSFR_DATA_KEYS is undefined', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      source.apiKeyRef = 'tmdb';
      source.id = 'test';

      const headers = (source as any)._resolveApiKeyHeaders();
      expect(headers).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('non défini'));
      warnSpy.mockRestore();
    });

    it('returns null when apiKeyRef is empty', () => {
      source.apiKeyRef = '';
      const headers = (source as any)._resolveApiKeyHeaders();
      expect(headers).toBeNull();
    });

    it('injects api-key-ref into _buildFetchOptions (URL mode)', () => {
      (window as any).DSFR_DATA_KEYS = { myapi: 'Token abc123' };
      source.apiKeyRef = 'myapi';
      source.method = 'GET';
      source.headers = '';
      source.params = '';

      const options = (source as any)._buildFetchOptions();
      expect(options.headers.Authorization).toBe('Token abc123');
    });

    it('api-key-ref overrides explicit Authorization header', () => {
      (window as any).DSFR_DATA_KEYS = { myapi: 'Bearer fromRegistry' };
      source.apiKeyRef = 'myapi';
      source.method = 'GET';
      source.headers = '{"Authorization": "Bearer fromAttribute"}';
      source.params = '';

      const options = (source as any)._buildFetchOptions();
      expect(options.headers.Authorization).toBe('Bearer fromRegistry');
    });

    it('preserves other custom headers alongside api-key-ref', () => {
      (window as any).DSFR_DATA_KEYS = { myapi: 'Bearer token' };
      source.apiKeyRef = 'myapi';
      source.method = 'GET';
      source.headers = '{"X-Custom": "value"}';
      source.params = '';

      const options = (source as any)._buildFetchOptions();
      expect(options.headers.Authorization).toBe('Bearer token');
      expect(options.headers['X-Custom']).toBe('value');
    });

    it('injects api-key-ref into getAdapterParams (adapter mode)', () => {
      (window as any).DSFR_DATA_KEYS = { myapi: 'Bearer adapterToken' };
      source.apiKeyRef = 'myapi';
      source.apiType = 'opendatasoft';
      source.baseUrl = 'https://data.example.com';
      source.datasetId = 'test';

      const params = source.getAdapterParams();
      expect(params.headers).toEqual({ Authorization: 'Bearer adapterToken' });
    });

    it('merges api-key-ref with existing adapter headers', () => {
      (window as any).DSFR_DATA_KEYS = { myapi: 'Bearer adapterToken' };
      source.apiKeyRef = 'myapi';
      source.apiType = 'opendatasoft';
      source.baseUrl = 'https://data.example.com';
      source.datasetId = 'test';
      source.headers = '{"apikey": "secret"}';

      const params = source.getAdapterParams();
      expect(params.headers).toEqual({ apikey: 'secret', Authorization: 'Bearer adapterToken' });
    });
  });

  describe('createRenderRoot', () => {
    it('returns this (no shadow DOM)', () => {
      expect(source.createRenderRoot()).toBe(source);
    });
  });
});
