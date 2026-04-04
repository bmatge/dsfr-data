import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as shared from '@dsfr-data/shared';

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
import { DsfrDataSource } from '../src/components/dsfr-data-source.js';
import { getDataCache, clearDataCache, getDataMeta, clearDataMeta } from '../src/utils/data-bridge.js';

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

    it('warns when id is not set', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      source.url = 'https://api.example.com/data';
      // id is empty
      await (source as any)._fetchData();
      expect(warnSpy).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
      warnSpy.mockRestore();
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
        meta: { page: 1, page_size: 20, total: 100 }
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
        links: {}
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
        meta: { page: 1, page_size: 20, total: 1 }
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
    it('warns and skips when id is not set in adapter mode', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      source.apiType = 'opendatasoft';
      source.id = '';
      source.datasetId = 'test-dataset';

      await (source as any)._fetchViaAdapter();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('id'));
      expect(mockFetch).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('warns and skips when adapter validation fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      source.apiType = 'opendatasoft';
      source.id = 'test-source';
      source.datasetId = ''; // Missing required dataset-id

      await (source as any)._fetchViaAdapter();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dataset-id'));
      expect(mockFetch).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('fetches data via adapter fetchAll', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
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
        json: () => Promise.resolve({
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

      const params = (source as any)._getAdapterParams();

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

      const params = (source as any)._getAdapterParams();
      expect(params.headers).toBeUndefined();
    });

    it('uses orderBy overlay when set', () => {
      source.apiType = 'opendatasoft';
      source.datasetId = 'test';
      source.orderBy = 'nom:asc';
      (source as any)._orderByOverlay = 'population:desc';

      const params = (source as any)._getAdapterParams();
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

    it('warns when id is not set for inline data', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      source.data = '[1, 2, 3]';

      (source as any)._dispatchInlineData();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('id'));
      warnSpy.mockRestore();
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

  describe('server cache (_putCache / _getCache)', () => {
    it('_putCache sends PUT request with data and TTL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      source.id = 'test-source';
      source.cacheTtl = 7200;
      const data = [{ id: 1 }, { id: 2 }];

      await (source as any)._putCache(data);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/cache/test-source',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.data).toEqual(data);
      expect(body.recordCount).toBe(2);
      expect(body.ttlSeconds).toBe(7200);
    });

    it('_putCache sends recordCount=1 for non-array data', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      source.id = 'test-source';
      source.cacheTtl = 3600;

      await (source as any)._putCache({ key: 'value' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.recordCount).toBe(1);
    });

    it('_putCache encodes source ID in URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      source.id = 'source with spaces';
      source.cacheTtl = 3600;

      await (source as any)._putCache([]);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/cache/source%20with%20spaces',
        expect.anything()
      );
    });

    it('_getCache returns cached data on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1 }] }),
      });

      source.id = 'test-source';
      const result = await (source as any)._getCache();

      expect(result).toEqual([{ id: 1 }]);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/cache/test-source',
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('_getCache returns null on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      source.id = 'test-source';
      const result = await (source as any)._getCache();

      expect(result).toBeNull();
    });

    it('_getCache returns null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      source.id = 'test-source';
      const result = await (source as any)._getCache();

      expect(result).toBeNull();
    });

    it('_getCache returns null when response has no data field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      source.id = 'test-source';
      const result = await (source as any)._getCache();

      expect(result).toBeNull();
    });
  });

  describe('cache integration with fetch', () => {
    let isAuthSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      isAuthSpy = vi.spyOn(shared, 'isAuthenticated').mockReturnValue(true);
    });

    afterEach(() => {
      isAuthSpy.mockRestore();
    });

    it('saves to cache after successful URL fetch when authenticated', async () => {
      const testData = { results: [1, 2, 3] };
      // First call: fetch data; Second call: put cache
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(testData),
        })
        .mockResolvedValueOnce({ ok: true });

      source.url = 'https://api.example.com/data';
      source.id = 'test-source';
      source.cacheTtl = 3600;
      source.transform = '';

      await (source as any)._fetchViaUrl();

      // Second call should be cache PUT
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][0]).toBe('/api/cache/test-source');
      expect(mockFetch.mock.calls[1][1].method).toBe('PUT');
    });

    it('falls back to cache on URL fetch error when authenticated', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const cachedData = [{ id: 'cached' }];

      // First call: fetch fails; Second call: cache GET succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Server down'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: cachedData }),
        });

      source.url = 'https://api.example.com/data';
      source.id = 'test-source';
      source.cacheTtl = 3600;

      await (source as any)._fetchViaUrl();

      expect(source.getData()).toEqual(cachedData);
      expect(getDataCache('test-source')).toEqual(cachedData);
      errorSpy.mockRestore();
    });

    it('dispatches cache-fallback event on cache hit', async () => {
      const cachedData = [{ id: 'cached' }];
      const eventSpy = vi.fn();
      source.addEventListener('cache-fallback', eventSpy);

      mockFetch
        .mockRejectedValueOnce(new Error('Server down'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: cachedData }),
        });

      source.url = 'https://api.example.com/data';
      source.id = 'test-source';
      source.cacheTtl = 3600;

      await (source as any)._fetchViaUrl();

      expect(eventSpy).toHaveBeenCalled();
      source.removeEventListener('cache-fallback', eventSpy);
    });

    it('sets error when both fetch and cache fail', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockFetch
        .mockRejectedValueOnce(new Error('Server down'))
        .mockResolvedValueOnce({ ok: false, status: 404 });

      source.url = 'https://api.example.com/data';
      source.id = 'test-source';
      source.cacheTtl = 3600;

      await (source as any)._fetchViaUrl();

      expect(source.getError()?.message).toBe('Server down');
      errorSpy.mockRestore();
    });

    it('saves to cache after successful adapter fetch when authenticated', async () => {
      const testData = {
        results: [{ dep: '75', value: 100 }],
        total_count: 1,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(testData),
        })
        .mockResolvedValueOnce({ ok: true });

      source.apiType = 'opendatasoft';
      source.id = 'test-source';
      source.baseUrl = 'https://data.example.com';
      source.datasetId = 'test-dataset';
      source.cacheTtl = 3600;

      await (source as any)._fetchViaAdapter();

      // Second call should be cache PUT
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][0]).toBe('/api/cache/test-source');
    });

    it('falls back to cache on adapter fetch error when authenticated', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const cachedData = [{ id: 'cached' }];

      mockFetch
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: cachedData }),
        });

      source.apiType = 'opendatasoft';
      source.id = 'test-source';
      source.baseUrl = 'https://data.example.com';
      source.datasetId = 'test-dataset';
      source.cacheTtl = 3600;

      await (source as any)._fetchViaAdapter();

      expect(source.getData()).toEqual(cachedData);
      errorSpy.mockRestore();
    });

    it('skips cache when cacheTtl is 0', async () => {
      const testData = { results: [1, 2, 3] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(testData),
      });

      source.url = 'https://api.example.com/data';
      source.id = 'test-source';
      source.cacheTtl = 0;
      source.transform = '';

      await (source as any)._fetchViaUrl();

      // Only one fetch call (no cache PUT)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('skips cache when not authenticated', async () => {
      isAuthSpy.mockReturnValue(false);
      const testData = { results: [1, 2, 3] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(testData),
      });

      source.url = 'https://api.example.com/data';
      source.id = 'test-source';
      source.cacheTtl = 3600;
      source.transform = '';

      await (source as any)._fetchViaUrl();

      // Only one fetch call (no cache PUT)
      expect(mockFetch).toHaveBeenCalledTimes(1);
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
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('non defini'));
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

    it('injects api-key-ref into _getAdapterParams (adapter mode)', () => {
      (window as any).DSFR_DATA_KEYS = { myapi: 'Bearer adapterToken' };
      source.apiKeyRef = 'myapi';
      source.apiType = 'opendatasoft';
      source.baseUrl = 'https://data.example.com';
      source.datasetId = 'test';

      const params = (source as any)._getAdapterParams();
      expect(params.headers).toEqual({ Authorization: 'Bearer adapterToken' });
    });

    it('merges api-key-ref with existing adapter headers', () => {
      (window as any).DSFR_DATA_KEYS = { myapi: 'Bearer adapterToken' };
      source.apiKeyRef = 'myapi';
      source.apiType = 'opendatasoft';
      source.baseUrl = 'https://data.example.com';
      source.datasetId = 'test';
      source.headers = '{"apikey": "secret"}';

      const params = (source as any)._getAdapterParams();
      expect(params.headers).toEqual({ apikey: 'secret', Authorization: 'Bearer adapterToken' });
    });
  });

  describe('createRenderRoot', () => {
    it('returns this (no shadow DOM)', () => {
      expect(source.createRenderRoot()).toBe(source);
    });
  });
});
