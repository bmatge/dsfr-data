import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { OpenDataSoftAdapter } from '../../src/adapters/opendatasoft-adapter.js';
import type { AdapterParams, ServerSideOverlay } from '../../src/adapters/api-adapter.js';

function makeParams(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: 'https://data.example.com',
    datasetId: 'communes-france',
    resource: '',
    select: '',
    where: '',
    filter: '',
    groupBy: '',
    aggregate: '',
    orderBy: '',
    limit: 0,
    transform: '',
    pageSize: 20,
    ...overrides,
  };
}

describe('OpenDataSoftAdapter', () => {
  const adapter = new OpenDataSoftAdapter();

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('validate', () => {
    it('returns error when datasetId is missing', () => {
      expect(adapter.validate(makeParams({ datasetId: '' }))).toBe(
        'attribut "dataset-id" requis pour les requetes OpenDataSoft'
      );
    });

    it('returns null when datasetId is present', () => {
      expect(adapter.validate(makeParams())).toBeNull();
    });
  });

  describe('URL building', () => {
    it('builds base URL correctly', () => {
      const url = adapter.buildUrl(makeParams());
      expect(url).toContain('https://data.example.com/api/explore/v2.1/catalog/datasets/communes-france/records');
    });

    it('uses default base URL when not specified', () => {
      const url = adapter.buildUrl(makeParams({ baseUrl: '' }));
      expect(url).toContain('https://data.opendatasoft.com/api/explore/v2.1/catalog/datasets/');
    });

    it('adds select clause', () => {
      const url = adapter.buildUrl(makeParams({ select: 'sum(population) as total, region' }));
      expect(url).toContain('select=');
      expect(url).toContain('population');
    });

    it('adds where clause', () => {
      const url = adapter.buildUrl(makeParams({ where: 'population > 5000' }));
      expect(url).toContain('where=population');
    });

    it('uses filter as fallback for where', () => {
      const url = adapter.buildUrl(makeParams({ filter: 'status = "active"' }));
      expect(url).toContain('where=');
    });

    it('adds group_by clause', () => {
      const url = adapter.buildUrl(makeParams({ groupBy: 'region' }));
      expect(url).toContain('group_by=region');
    });

    it('adds order_by clause with DESC', () => {
      const url = adapter.buildUrl(makeParams({ orderBy: 'total:desc' }));
      expect(url).toContain('order_by=total');
      expect(url).toContain('DESC');
    });

    it('adds limit', () => {
      const url = adapter.buildUrl(makeParams({ limit: 20 }));
      expect(url).toContain('limit=20');
    });

    it('caps limit at 100 (ODS max) when no override', () => {
      const url = adapter.buildUrl(makeParams({ limit: 200 }));
      expect(url).toContain('limit=100');
      expect(url).not.toContain('limit=200');
    });

    it('uses limitOverride when provided', () => {
      const url = adapter.buildUrl(makeParams({ limit: 200 }), 8);
      expect(url).toContain('limit=8');
    });

    it('adds offset when provided and > 0', () => {
      const url = adapter.buildUrl(makeParams(), 100, 100);
      expect(url).toContain('offset=100');
    });

    it('does not add offset when 0', () => {
      const url = adapter.buildUrl(makeParams(), 100, 0);
      expect(url).not.toContain('offset');
    });

    it('auto-converts aggregate + groupBy to ODS select', () => {
      const url = adapter.buildUrl(makeParams({
        aggregate: 'population:sum, count:count',
        groupBy: 'region',
      }));
      const params = new URL(url).searchParams;
      const select = params.get('select')!;
      expect(select).toContain('sum(population)');
      expect(select).toContain('population__sum');
      expect(select).toContain('count(*)');
      expect(select).toContain('region');
    });
  });

  describe('Server-side URL building', () => {
    const overlay = (overrides: Partial<ServerSideOverlay> = {}): ServerSideOverlay => ({
      page: 1,
      effectiveWhere: '',
      orderBy: '',
      ...overrides,
    });

    it('builds URL with limit=pageSize and offset for current page', () => {
      const url = adapter.buildServerSideUrl(makeParams(), overlay({ page: 3 }));
      expect(url).toContain('limit=20');
      expect(url).toContain('offset=40');
    });

    it('does not include offset for page 1', () => {
      const url = adapter.buildServerSideUrl(makeParams(), overlay({ page: 1 }));
      expect(url).toContain('limit=20');
      expect(url).not.toContain('offset');
    });

    it('includes effectiveWhere in URL', () => {
      const url = adapter.buildServerSideUrl(
        makeParams(),
        overlay({ effectiveWhere: 'status="active" AND search("test")' })
      );
      const params = new URL(url).searchParams;
      expect(params.get('where')).toBe('status="active" AND search("test")');
    });

    it('uses overlay orderBy', () => {
      const url = adapter.buildServerSideUrl(
        makeParams({ orderBy: 'date:desc' }),
        overlay({ orderBy: 'nom:asc' })
      );
      expect(url).toContain('order_by=nom');
      expect(url).toContain('ASC');
      expect(url).not.toContain('date');
    });

    it('includes select when specified', () => {
      const url = adapter.buildServerSideUrl(
        makeParams({ select: 'nom, date, categorie' }),
        overlay()
      );
      const params = new URL(url).searchParams;
      expect(params.get('select')).toBe('nom, date, categorie');
    });

    it('includes group_by when specified', () => {
      const url = adapter.buildServerSideUrl(
        makeParams({ groupBy: 'categorie' }),
        overlay()
      );
      expect(url).toContain('group_by=categorie');
    });

    it('auto-converts aggregate + groupBy to select in server-side', () => {
      const url = adapter.buildServerSideUrl(
        makeParams({ aggregate: 'population:sum', groupBy: 'region' }),
        overlay()
      );
      const params = new URL(url).searchParams;
      const select = params.get('select')!;
      expect(select).toContain('sum(population) as population__sum');
      expect(select).toContain('region');
    });
  });

  describe('Pagination (fetchAll)', () => {
    it('fetches single page when limit <= 100', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: Array.from({ length: 50 }, (_, i) => ({ dep: String(i), value: i })),
          total_count: 50,
        }),
      });

      const result = await adapter.fetchAll(
        makeParams({ limit: 50, groupBy: 'dep', select: 'dep, avg(taux) as value' }),
        new AbortController().signal
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.data).toHaveLength(50);
      expect(result.needsClientProcessing).toBe(false);
    });

    it('fetches multiple pages when limit > 100', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: Array.from({ length: 100 }, (_, i) => ({ dep: String(i).padStart(2, '0'), value: i })),
          total_count: 108,
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: Array.from({ length: 8 }, (_, i) => ({ dep: String(100 + i), value: 100 + i })),
          total_count: 108,
        }),
      });

      const result = await adapter.fetchAll(
        makeParams({ limit: 108 }),
        new AbortController().signal
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.data).toHaveLength(108);
      expect(result.totalCount).toBe(108);
    });

    it('stops when page returns fewer results than page size', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: Array.from({ length: 75 }, (_, i) => ({ dep: String(i), value: i })),
          total_count: 75,
        }),
      });

      const result = await adapter.fetchAll(
        makeParams({ limit: 200 }),
        new AbortController().signal
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.data).toHaveLength(75);
    });

    it('sends correct offset in second page URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: Array.from({ length: 100 }, (_, i) => ({ dep: String(i), value: i })),
          total_count: 110,
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: Array.from({ length: 10 }, (_, i) => ({ dep: String(100 + i), value: 100 + i })),
          total_count: 110,
        }),
      });

      await adapter.fetchAll(makeParams({ limit: 110 }), new AbortController().signal);

      const secondCallUrl = mockFetch.mock.calls[1][0] as string;
      expect(secondCallUrl).toContain('offset=100');
      expect(secondCallUrl).toContain('limit=10');
    });

    it('fetches all records when limit=0, using total_count', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: Array.from({ length: 100 }, (_, i) => ({ dep: String(i), value: i })),
          total_count: 108,
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: Array.from({ length: 8 }, (_, i) => ({ dep: String(100 + i), value: 100 + i })),
          total_count: 108,
        }),
      });

      const result = await adapter.fetchAll(
        makeParams({ limit: 0 }),
        new AbortController().signal
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.data).toHaveLength(108);
    });

    it('does not warn when intentional limit is less than total_count', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: Array.from({ length: 50 }, (_, i) => ({ dep: String(i), value: i })),
          total_count: 80,
        }),
      });

      await adapter.fetchAll(makeParams({ limit: 50 }), new AbortController().signal);

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('Server-side fetch (fetchPage)', () => {
    it('fetches one page and returns data with totalCount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: Array.from({ length: 20 }, (_, i) => ({ id: i, nom: `item-${i}` })),
          total_count: 500,
        }),
      });

      const result = await adapter.fetchPage(
        makeParams({ datasetId: 'rappelconso' }),
        { page: 1, effectiveWhere: '', orderBy: '' },
        new AbortController().signal
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.data).toHaveLength(20);
      expect(result.totalCount).toBe(500);
      expect(result.needsClientProcessing).toBe(false);
      expect(result.rawJson).toBeDefined();
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        adapter.fetchPage(
          makeParams(),
          { page: 1, effectiveWhere: '', orderBy: '' },
          new AbortController().signal
        )
      ).rejects.toThrow('HTTP 404');
    });
  });

  describe('fetchFacets', () => {
    it('fetches facet values from ODS /facets endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          facets: [
            {
              name: 'region',
              facets: [
                { value: 'IDF', count: 100 },
                { value: 'PACA', count: 50 },
              ],
            },
            {
              name: 'type',
              facets: [
                { value: 'A', count: 80 },
              ],
            },
          ],
        }),
      });

      const results = await adapter.fetchFacets!(
        { baseUrl: 'https://data.example.com', datasetId: 'test-dataset' },
        ['region', 'type'],
        'status = "active"'
      );

      expect(results).toHaveLength(2);
      expect(results[0].field).toBe('region');
      expect(results[0].values).toHaveLength(2);
      expect(results[0].values[0]).toEqual({ value: 'IDF', count: 100 });
      expect(results[1].field).toBe('type');

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('/facets');
      expect(callUrl).toContain('facet=region');
      expect(callUrl).toContain('facet=type');
      expect(callUrl).toContain('where=');
    });

    it('uses default base URL when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ facets: [] }),
      });

      await adapter.fetchFacets!(
        { baseUrl: '', datasetId: 'test' },
        ['field1'],
        ''
      );

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('https://data.opendatasoft.com');
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(
        adapter.fetchFacets!(
          { baseUrl: 'https://data.example.com', datasetId: 'test' },
          ['field1'],
          ''
        )
      ).rejects.toThrow('HTTP 500');
    });

    it('fetches without where clause when empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ facets: [] }),
      });

      await adapter.fetchFacets!(
        { baseUrl: 'https://data.example.com', datasetId: 'test' },
        ['region'],
        ''
      );

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).not.toContain('where=');
    });

    it('handles empty facets array in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ facets: [] }),
      });

      const results = await adapter.fetchFacets!(
        { baseUrl: 'https://data.example.com', datasetId: 'test' },
        ['field1'],
        ''
      );

      expect(results).toEqual([]);
    });
  });

  describe('Headers propagation', () => {
    it('passes headers to fetch in fetchAll', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 1 }], total_count: 1 }),
      });

      await adapter.fetchAll(
        makeParams({ headers: { apikey: 'secret123' } }),
        new AbortController().signal
      );

      const fetchOpts = mockFetch.mock.calls[0][1] as RequestInit;
      expect(fetchOpts.headers).toEqual({ apikey: 'secret123' });
    });

    it('passes headers to fetch in fetchPage', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 1 }], total_count: 1 }),
      });

      await adapter.fetchPage(
        makeParams({ headers: { Authorization: 'Bearer xyz' } }),
        { page: 1, effectiveWhere: '', orderBy: '' },
        new AbortController().signal
      );

      const fetchOpts = mockFetch.mock.calls[0][1] as RequestInit;
      expect(fetchOpts.headers).toEqual({ Authorization: 'Bearer xyz' });
    });

    it('passes headers to fetch in fetchFacets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ facets: [] }),
      });

      await adapter.fetchFacets!(
        { baseUrl: 'https://data.example.com', datasetId: 'test', headers: { apikey: 'key' } },
        ['field1'],
        ''
      );

      const fetchOpts = mockFetch.mock.calls[0][1] as RequestInit;
      expect(fetchOpts.headers).toEqual({ apikey: 'key' });
    });

    it('does not set headers when empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [], total_count: 0 }),
      });

      await adapter.fetchAll(makeParams(), new AbortController().signal);

      const fetchOpts = mockFetch.mock.calls[0][1] as RequestInit;
      expect(fetchOpts.headers).toBeUndefined();
    });
  });

  describe('getDefaultSearchTemplate', () => {
    it('returns ODS search function', () => {
      expect(adapter.getDefaultSearchTemplate!()).toBe('search("{q}")');
    });
  });

  describe('parseAggregates', () => {
    it('parses single aggregation', () => {
      const aggs = adapter.parseAggregates!('population:sum');
      expect(aggs).toHaveLength(1);
      expect(aggs[0]).toEqual({ field: 'population', function: 'sum', alias: undefined });
    });

    it('parses aggregation with alias', () => {
      const aggs = adapter.parseAggregates!('population:sum:total_pop');
      expect(aggs).toHaveLength(1);
      expect(aggs[0]).toEqual({ field: 'population', function: 'sum', alias: 'total_pop' });
    });

    it('parses multiple aggregations', () => {
      const aggs = adapter.parseAggregates!('population:sum, count:count');
      expect(aggs).toHaveLength(2);
    });

    it('returns empty array for empty string', () => {
      expect(adapter.parseAggregates!('')).toEqual([]);
    });
  });

  describe('buildFacetWhere', () => {
    it('builds ODSQL for single value', () => {
      expect(adapter.buildFacetWhere!({ region: new Set(['IDF']) }))
        .toBe('region = "IDF"');
    });

    it('builds ODSQL IN for multiple values', () => {
      expect(adapter.buildFacetWhere!({ region: new Set(['IDF', 'PACA']) }))
        .toBe('region IN ("IDF", "PACA")');
    });

    it('joins multiple fields with AND', () => {
      const result = adapter.buildFacetWhere!({
        region: new Set(['IDF']),
        type: new Set(['A']),
      });
      expect(result).toBe('region = "IDF" AND type = "A"');
    });

    it('excludes specified field', () => {
      expect(adapter.buildFacetWhere!(
        { region: new Set(['IDF']), type: new Set(['A']) },
        'region'
      )).toBe('type = "A"');
    });

    it('escapes double quotes in values', () => {
      expect(adapter.buildFacetWhere!({ name: new Set(['value with "quotes"']) }))
        .toBe('name = "value with \\"quotes\\""');
    });

    it('returns empty string for empty selections', () => {
      expect(adapter.buildFacetWhere!({})).toBe('');
    });

    it('skips fields with empty sets', () => {
      expect(adapter.buildFacetWhere!({ region: new Set() })).toBe('');
    });
  });

  describe('getProviderConfig', () => {
    it('returns ODS config', () => {
      const config = adapter.getProviderConfig!();
      expect(config.id).toBe('opendatasoft');
    });
  });

  describe('fetchAll HTTP error', () => {
    it('throws on HTTP error in pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      await expect(
        adapter.fetchAll(makeParams({ limit: 50 }), new AbortController().signal)
      ).rejects.toThrow('HTTP 429');
    });
  });

  describe('fetchPage (server-side)', () => {
    it('fetches one page and returns data with totalCount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: Array.from({ length: 20 }, (_, i) => ({ id: i })),
          total_count: 500,
        }),
      });

      const result = await adapter.fetchPage(
        makeParams({ pageSize: 20 }),
        { page: 1, effectiveWhere: '', orderBy: '' },
        new AbortController().signal
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.data).toHaveLength(20);
      expect(result.totalCount).toBe(500);
      expect(result.needsClientProcessing).toBe(false);
      expect(result.rawJson).toBeDefined();
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      await expect(
        adapter.fetchPage(
          makeParams(),
          { page: 1, effectiveWhere: '', orderBy: '' },
          new AbortController().signal
        )
      ).rejects.toThrow('HTTP 503');
    });

    it('handles page 3 with offset', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: [{ id: 1 }],
          total_count: 50,
        }),
      });

      await adapter.fetchPage(
        makeParams({ pageSize: 20 }),
        { page: 3, effectiveWhere: '', orderBy: '' },
        new AbortController().signal
      );

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('limit=20');
      expect(callUrl).toContain('offset=40');
    });
  });

  describe('buildServerSideUrl', () => {
    it('builds URL with page and offset', () => {
      const url = adapter.buildServerSideUrl(
        makeParams({ pageSize: 20 }),
        { page: 3, effectiveWhere: '', orderBy: '' }
      );
      expect(url).toContain('limit=20');
      expect(url).toContain('offset=40');
    });

    it('does not include offset for page 1', () => {
      const url = adapter.buildServerSideUrl(
        makeParams({ pageSize: 20 }),
        { page: 1, effectiveWhere: '', orderBy: '' }
      );
      expect(url).toContain('limit=20');
      expect(url).not.toContain('offset=');
    });

    it('includes effectiveWhere as where param', () => {
      const url = adapter.buildServerSideUrl(
        makeParams(),
        { page: 1, effectiveWhere: 'region = "IDF"', orderBy: '' }
      );
      expect(url).toContain('where=');
    });

    it('includes orderBy from overlay', () => {
      const url = adapter.buildServerSideUrl(
        makeParams(),
        { page: 1, effectiveWhere: '', orderBy: 'population:desc' }
      );
      expect(url).toContain('order_by=');
    });

    it('includes select from params', () => {
      const url = adapter.buildServerSideUrl(
        makeParams({ select: 'nom, count(*) as total' }),
        { page: 1, effectiveWhere: '', orderBy: '' }
      );
      expect(url).toContain('select=');
    });

    it('includes groupBy from params', () => {
      const url = adapter.buildServerSideUrl(
        makeParams({ groupBy: 'region' }),
        { page: 1, effectiveWhere: '', orderBy: '' }
      );
      expect(url).toContain('group_by=region');
    });

    it('builds select from aggregate when no explicit select', () => {
      const url = adapter.buildServerSideUrl(
        makeParams({ groupBy: 'region', aggregate: 'population:sum:total' }),
        { page: 1, effectiveWhere: '', orderBy: '' }
      );
      expect(url).toContain('select=');
      expect(url).toContain('group_by=region');
    });
  });

  describe('fetchAll pagination', () => {
    it('fetches multiple pages via offset', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: Array.from({ length: 100 }, (_, i) => ({ id: i })),
          total_count: 150,
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: Array.from({ length: 50 }, (_, i) => ({ id: 100 + i })),
          total_count: 150,
        }),
      });

      const result = await adapter.fetchAll(
        makeParams({ limit: 0 }),
        new AbortController().signal
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.data).toHaveLength(150);
      expect(result.totalCount).toBe(150);
    });

    it('stops at requested limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: Array.from({ length: 50 }, (_, i) => ({ id: i })),
          total_count: 200,
        }),
      });

      const result = await adapter.fetchAll(
        makeParams({ limit: 50 }),
        new AbortController().signal
      );

      expect(result.data).toHaveLength(50);
    });

    it('warns on incomplete pagination', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          results: Array.from({ length: 50 }, (_, i) => ({ id: i })),
          total_count: 2000,
        }),
      });

      await adapter.fetchAll(
        makeParams({ limit: 200 }),
        new AbortController().signal
      );

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('pagination incomplete'));
      warnSpy.mockRestore();
    });
  });
});
