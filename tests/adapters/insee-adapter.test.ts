import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { InseeAdapter } from '../../src/adapters/insee-adapter.js';
import type { AdapterParams, ServerSideOverlay } from '../../src/adapters/api-adapter.js';

function makeParams(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: '',
    datasetId: 'DECES-2023',
    resource: '',
    select: '',
    where: '',
    filter: '',
    groupBy: '',
    aggregate: '',
    orderBy: '',
    limit: 0,
    transform: '',
    pageSize: 0,
    ...overrides,
  };
}

/** Helper: build a mock INSEE API response */
function inseeResponse(
  observations: unknown[],
  paging: { count?: number; isLast?: boolean; page?: number } = {}
) {
  return {
    ok: true,
    json: () => Promise.resolve({ observations, paging }),
  };
}

/** Helper: build a single observation */
function obs(
  dims: Record<string, string>,
  measures: Record<string, { value: unknown }>,
  attrs: Record<string, unknown> = {}
) {
  return { dimensions: dims, measures, attributes: attrs };
}

describe('InseeAdapter', () => {
  const adapter = new InseeAdapter();

  // ==========================================================================
  // type & capabilities
  // ==========================================================================

  it('has type "insee"', () => {
    expect(adapter.type).toBe('insee');
  });

  it('declares correct capabilities', () => {
    expect(adapter.capabilities).toEqual({
      serverFetch: true,
      serverFacets: false,
      serverSearch: false,
      serverGroupBy: false,
      serverOrderBy: false,
      whereFormat: 'colon',
    });
  });

  // ==========================================================================
  // validate
  // ==========================================================================

  describe('validate', () => {
    it('returns null when datasetId is provided', () => {
      expect(adapter.validate(makeParams())).toBeNull();
    });

    it('returns error when datasetId is missing', () => {
      expect(adapter.validate(makeParams({ datasetId: '' }))).toContain('dataset-id');
    });
  });

  // ==========================================================================
  // buildUrl
  // ==========================================================================

  describe('buildUrl', () => {
    it('builds default URL with dataset-id', () => {
      const url = new URL(adapter.buildUrl(makeParams()));
      expect(url.pathname).toBe('/melodi/data/DECES-2023');
      expect(url.searchParams.get('maxResult')).toBe('1000');
      expect(url.searchParams.get('totalCount')).toBe('TRUE');
    });

    it('uses custom baseUrl when provided', () => {
      const url = new URL(adapter.buildUrl(makeParams({ baseUrl: 'https://custom.api.fr/melodi' })));
      expect(url.origin).toBe('https://custom.api.fr');
      expect(url.pathname).toBe('/melodi/data/DECES-2023');
    });

    it('sets maxResult from limitOverride', () => {
      const url = new URL(adapter.buildUrl(makeParams(), 50));
      expect(url.searchParams.get('maxResult')).toBe('50');
    });

    it('sets maxResult from params.limit when no override', () => {
      const url = new URL(adapter.buildUrl(makeParams({ limit: 200 })));
      expect(url.searchParams.get('maxResult')).toBe('200');
    });

    it('sets page from pageOrOffsetOverride', () => {
      const url = new URL(adapter.buildUrl(makeParams(), undefined, 3));
      expect(url.searchParams.get('page')).toBe('3');
    });

    it('omits page when pageOrOffsetOverride is 0 or undefined', () => {
      const url = new URL(adapter.buildUrl(makeParams()));
      expect(url.searchParams.has('page')).toBe(false);
    });

    it('applies eq dimension filter from where', () => {
      const url = new URL(adapter.buildUrl(makeParams({ where: 'TIME_PERIOD:eq:2023' })));
      expect(url.searchParams.get('TIME_PERIOD')).toBe('2023');
    });

    it('applies in dimension filter (multiple values)', () => {
      const url = adapter.buildUrl(makeParams({ where: 'GEO:in:FRANCE-F|FRANCE-M' }));
      const parsed = new URL(url);
      expect(parsed.searchParams.getAll('GEO')).toEqual(['FRANCE-F', 'FRANCE-M']);
    });

    it('applies multiple dimension filters', () => {
      const url = new URL(adapter.buildUrl(makeParams({
        where: 'TIME_PERIOD:eq:2023, GEO:eq:FRANCE-F',
      })));
      expect(url.searchParams.get('TIME_PERIOD')).toBe('2023');
      expect(url.searchParams.get('GEO')).toBe('FRANCE-F');
    });

    it('ignores unsupported operators (gt, lt, contains)', () => {
      const url = new URL(adapter.buildUrl(makeParams({ where: 'age:gt:18' })));
      expect(url.searchParams.has('age')).toBe(false);
    });

    it('falls back to filter attribute when where is empty', () => {
      const url = new URL(adapter.buildUrl(makeParams({ filter: 'FREQ:eq:A' })));
      expect(url.searchParams.get('FREQ')).toBe('A');
    });

    it('handles values containing colons', () => {
      const url = new URL(adapter.buildUrl(makeParams({ where: 'url:eq:https://example.com' })));
      expect(url.searchParams.get('url')).toBe('https://example.com');
    });

    it('handles simple DIMENSION=VALUE format (no operator)', () => {
      const url = new URL(adapter.buildUrl(makeParams({ where: 'FREQ:A' })));
      expect(url.searchParams.get('FREQ')).toBe('A');
    });
  });

  // ==========================================================================
  // buildServerSideUrl
  // ==========================================================================

  describe('buildServerSideUrl', () => {
    it('sets pageSize and page from overlay', () => {
      const overlay: ServerSideOverlay = { page: 2, effectiveWhere: '', orderBy: '' };
      const url = new URL(adapter.buildServerSideUrl(makeParams({ pageSize: 50 }), overlay));
      expect(url.searchParams.get('maxResult')).toBe('50');
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('totalCount')).toBe('TRUE');
    });

    it('applies effectiveWhere as dimension filters', () => {
      const overlay: ServerSideOverlay = {
        page: 1,
        effectiveWhere: 'TIME_PERIOD:eq:2023, GEO:eq:FRANCE-F',
        orderBy: '',
      };
      const url = new URL(adapter.buildServerSideUrl(makeParams({ pageSize: 20 }), overlay));
      expect(url.searchParams.get('TIME_PERIOD')).toBe('2023');
      expect(url.searchParams.get('GEO')).toBe('FRANCE-F');
    });

    it('does not apply dimension filters when effectiveWhere is empty', () => {
      const overlay: ServerSideOverlay = { page: 1, effectiveWhere: '', orderBy: '' };
      const url = new URL(adapter.buildServerSideUrl(makeParams({ pageSize: 20 }), overlay));
      // Only maxResult, totalCount, page should be present
      expect([...url.searchParams.keys()].sort()).toEqual(['maxResult', 'page', 'totalCount']);
    });
  });

  // ==========================================================================
  // buildFacetWhere
  // ==========================================================================

  describe('buildFacetWhere', () => {
    it('builds eq for single value', () => {
      expect(adapter.buildFacetWhere({ GEO: new Set(['FRANCE-F']) }))
        .toBe('GEO:eq:FRANCE-F');
    });

    it('builds in for multiple values', () => {
      expect(adapter.buildFacetWhere({ GEO: new Set(['FRANCE-F', 'FRANCE-M']) }))
        .toBe('GEO:in:FRANCE-F|FRANCE-M');
    });

    it('joins multiple fields with comma', () => {
      const result = adapter.buildFacetWhere({
        GEO: new Set(['FRANCE-F']),
        FREQ: new Set(['A']),
      });
      expect(result).toContain('GEO:eq:FRANCE-F');
      expect(result).toContain('FREQ:eq:A');
      expect(result).toContain(', ');
    });

    it('excludes specified field', () => {
      expect(adapter.buildFacetWhere(
        { GEO: new Set(['FRANCE-F']), FREQ: new Set(['A']) },
        'GEO'
      )).toBe('FREQ:eq:A');
    });

    it('skips empty value sets', () => {
      expect(adapter.buildFacetWhere({ GEO: new Set() })).toBe('');
    });

    it('returns empty string for empty selections', () => {
      expect(adapter.buildFacetWhere({})).toBe('');
    });
  });

  // ==========================================================================
  // getDefaultSearchTemplate & getProviderConfig
  // ==========================================================================

  it('returns null for getDefaultSearchTemplate', () => {
    expect(adapter.getDefaultSearchTemplate()).toBeNull();
  });

  it('returns a ProviderConfig from getProviderConfig', () => {
    const config = adapter.getProviderConfig();
    expect(config).toBeDefined();
    expect(config.displayName).toBeDefined();
  });
});

// =============================================================================
// Fetch-based tests
// =============================================================================

describe('InseeAdapter — fetchAll', () => {
  const adapter = new InseeAdapter();

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('fetches and flattens observations', async () => {
    mockFetch.mockResolvedValueOnce(inseeResponse(
      [
        obs({ GEO: 'FRANCE-F', FREQ: 'A' }, { OBS_VALUE_NIVEAU: { value: 123 } }, { OBS_STATUS: 'A' }),
        obs({ GEO: 'FRANCE-M', FREQ: 'A' }, { OBS_VALUE_NIVEAU: { value: 456 } }),
      ],
      { count: 2, isLast: true }
    ));

    const result = await adapter.fetchAll(makeParams(), new AbortController().signal);

    expect(result.data).toEqual([
      { GEO: 'FRANCE-F', FREQ: 'A', OBS_VALUE: 123, OBS_STATUS: 'A' },
      { GEO: 'FRANCE-M', FREQ: 'A', OBS_VALUE: 456 },
    ]);
    expect(result.totalCount).toBe(2);
    expect(result.needsClientProcessing).toBe(true);
  });

  it('strips _NIVEAU suffix from measure keys', async () => {
    mockFetch.mockResolvedValueOnce(inseeResponse(
      [obs({}, { OBS_VALUE_NIVEAU: { value: 42 } })],
      { isLast: true }
    ));

    const result = await adapter.fetchAll(makeParams(), new AbortController().signal);
    expect(result.data[0]).toHaveProperty('OBS_VALUE', 42);
    expect(result.data[0]).not.toHaveProperty('OBS_VALUE_NIVEAU');
  });

  it('keeps measure keys without _NIVEAU suffix as-is', async () => {
    mockFetch.mockResolvedValueOnce(inseeResponse(
      [obs({}, { TAUX: { value: 3.14 } })],
      { isLast: true }
    ));

    const result = await adapter.fetchAll(makeParams(), new AbortController().signal);
    expect(result.data[0]).toHaveProperty('TAUX', 3.14);
  });

  it('handles observations without dimensions or attributes', async () => {
    mockFetch.mockResolvedValueOnce(inseeResponse(
      [{ measures: { OBS_VALUE_NIVEAU: { value: 99 } } }],
      { isLast: true }
    ));

    const result = await adapter.fetchAll(makeParams(), new AbortController().signal);
    expect(result.data).toEqual([{ OBS_VALUE: 99 }]);
  });

  it('handles measures without value property', async () => {
    mockFetch.mockResolvedValueOnce(inseeResponse(
      [obs({}, { OBS_VALUE_NIVEAU: { label: 'no value' } as any })],
      { isLast: true }
    ));

    const result = await adapter.fetchAll(makeParams(), new AbortController().signal);
    // Measure without 'value' key is skipped
    expect(result.data[0]).not.toHaveProperty('OBS_VALUE');
  });

  it('handles null measure object', async () => {
    mockFetch.mockResolvedValueOnce(inseeResponse(
      [{ dimensions: { GEO: 'FR' }, measures: { OBS_VALUE_NIVEAU: null } }],
      { isLast: true }
    ));

    const result = await adapter.fetchAll(makeParams(), new AbortController().signal);
    expect(result.data[0]).toEqual({ GEO: 'FR' });
  });

  it('paginates across multiple pages', async () => {
    // Page 1
    mockFetch.mockResolvedValueOnce(inseeResponse(
      Array.from({ length: 10 }, (_, i) => obs({ id: String(i) }, { V: { value: i } })),
      { count: 25, isLast: false, page: 1 }
    ));
    // Page 2
    mockFetch.mockResolvedValueOnce(inseeResponse(
      Array.from({ length: 10 }, (_, i) => obs({ id: String(i + 10) }, { V: { value: i + 10 } })),
      { count: 25, isLast: false, page: 2 }
    ));
    // Page 3 (last)
    mockFetch.mockResolvedValueOnce(inseeResponse(
      Array.from({ length: 5 }, (_, i) => obs({ id: String(i + 20) }, { V: { value: i + 20 } })),
      { count: 25, isLast: true, page: 3 }
    ));

    const result = await adapter.fetchAll(
      makeParams({ pageSize: 10 }),
      new AbortController().signal
    );

    expect(result.data).toHaveLength(25);
    expect(result.totalCount).toBe(25);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('stops when totalCount is reached', async () => {
    // Page 1: 10 items, totalCount = 10
    mockFetch.mockResolvedValueOnce(inseeResponse(
      Array.from({ length: 10 }, (_, i) => obs({ id: String(i) }, {})),
      { count: 10, isLast: false }
    ));

    const result = await adapter.fetchAll(
      makeParams({ pageSize: 10 }),
      new AbortController().signal
    );

    expect(result.data).toHaveLength(10);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('stops when fewer results than pageSize', async () => {
    mockFetch.mockResolvedValueOnce(inseeResponse(
      Array.from({ length: 7 }, (_, i) => obs({ id: String(i) }, {})),
      { count: -1 }  // no total count available
    ));

    const result = await adapter.fetchAll(
      makeParams({ pageSize: 10 }),
      new AbortController().signal
    );

    expect(result.data).toHaveLength(7);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('respects params.limit', async () => {
    mockFetch.mockResolvedValueOnce(inseeResponse(
      Array.from({ length: 5 }, (_, i) => obs({ id: String(i) }, {})),
      { isLast: true }
    ));

    const result = await adapter.fetchAll(
      makeParams({ limit: 5 }),
      new AbortController().signal
    );

    // URL should have maxResult=5
    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('maxResult')).toBe('5');
    expect(result.data).toHaveLength(5);
  });

  it('uses params.pageSize as effective page size', async () => {
    mockFetch.mockResolvedValueOnce(inseeResponse([], { isLast: true }));

    await adapter.fetchAll(
      makeParams({ pageSize: 500 }),
      new AbortController().signal
    );

    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('maxResult')).toBe('500');
  });

  it('handles empty observations array', async () => {
    mockFetch.mockResolvedValueOnce(inseeResponse([], { count: 0, isLast: true }));

    const result = await adapter.fetchAll(makeParams(), new AbortController().signal);
    expect(result.data).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it('handles response without observations key', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ paging: { count: 0, isLast: true } }),
    });

    const result = await adapter.fetchAll(makeParams(), new AbortController().signal);
    expect(result.data).toEqual([]);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(
      adapter.fetchAll(makeParams(), new AbortController().signal)
    ).rejects.toThrow('HTTP 500');
  });

  it('throws on 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(
      adapter.fetchAll(makeParams(), new AbortController().signal)
    ).rejects.toThrow('HTTP 404');
  });

  it('passes headers to fetch', async () => {
    mockFetch.mockResolvedValueOnce(inseeResponse([], { isLast: true }));

    await adapter.fetchAll(
      makeParams({ headers: { 'X-Api-Key': 'secret' } }),
      new AbortController().signal
    );

    const fetchOpts = mockFetch.mock.calls[0][1] as RequestInit;
    expect(fetchOpts.headers).toEqual({ 'X-Api-Key': 'secret' });
  });

  it('passes signal to fetch', async () => {
    mockFetch.mockResolvedValueOnce(inseeResponse([], { isLast: true }));

    const controller = new AbortController();
    await adapter.fetchAll(makeParams(), controller.signal);

    const fetchOpts = mockFetch.mock.calls[0][1] as RequestInit;
    expect(fetchOpts.signal).toBe(controller.signal);
  });

  it('does not pass headers when empty', async () => {
    mockFetch.mockResolvedValueOnce(inseeResponse([], { isLast: true }));

    await adapter.fetchAll(makeParams({ headers: {} }), new AbortController().signal);

    const fetchOpts = mockFetch.mock.calls[0][1] as RequestInit;
    expect(fetchOpts.headers).toBeUndefined();
  });

  it('warns on incomplete pagination', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Single page returns 10 items but totalCount is 5000
    mockFetch.mockResolvedValueOnce(inseeResponse(
      Array.from({ length: 10 }, (_, i) => obs({ id: String(i) }, {})),
      { count: 5000, isLast: false }
    ));
    // Second page returns fewer items than page size (stops pagination)
    mockFetch.mockResolvedValueOnce(inseeResponse(
      Array.from({ length: 5 }, (_, i) => obs({ id: String(i + 10) }, {})),
      { count: 5000, isLast: false }
    ));

    const result = await adapter.fetchAll(
      makeParams({ pageSize: 10 }),
      new AbortController().signal
    );

    expect(result.data).toHaveLength(15);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('pagination incomplete'));
    warnSpy.mockRestore();
  });

  it('returns totalCount from allResults.length when paging.count is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        observations: [obs({ GEO: 'FR' }, {})],
        // no paging at all
      }),
    });

    const result = await adapter.fetchAll(makeParams(), new AbortController().signal);
    expect(result.totalCount).toBe(1);
  });

  it('uses 1-based page numbering', async () => {
    // Page 1
    mockFetch.mockResolvedValueOnce(inseeResponse(
      Array.from({ length: 5 }, () => obs({}, {})),
      { count: 10, isLast: false }
    ));
    // Page 2
    mockFetch.mockResolvedValueOnce(inseeResponse(
      Array.from({ length: 5 }, () => obs({}, {})),
      { count: 10, isLast: true }
    ));

    await adapter.fetchAll(makeParams({ pageSize: 5 }), new AbortController().signal);

    const page1Url = new URL(mockFetch.mock.calls[0][0]);
    const page2Url = new URL(mockFetch.mock.calls[1][0]);
    expect(page1Url.searchParams.get('page')).toBe('1');
    expect(page2Url.searchParams.get('page')).toBe('2');
  });
});

// =============================================================================
// fetchPage
// =============================================================================

describe('InseeAdapter — fetchPage', () => {
  const adapter = new InseeAdapter();

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('fetches a single page and flattens observations', async () => {
    mockFetch.mockResolvedValueOnce(inseeResponse(
      [obs({ GEO: 'FR' }, { OBS_VALUE_NIVEAU: { value: 100 } })],
      { count: 50 }
    ));

    const overlay: ServerSideOverlay = { page: 3, effectiveWhere: '', orderBy: '' };
    const result = await adapter.fetchPage(
      makeParams({ pageSize: 20 }),
      overlay,
      new AbortController().signal
    );

    expect(result.data).toEqual([{ GEO: 'FR', OBS_VALUE: 100 }]);
    expect(result.totalCount).toBe(50);
    expect(result.needsClientProcessing).toBe(true);
    expect(result.rawJson).toBeDefined();
  });

  it('uses buildServerSideUrl for the fetch', async () => {
    mockFetch.mockResolvedValueOnce(inseeResponse([], { count: 0 }));

    const overlay: ServerSideOverlay = {
      page: 2,
      effectiveWhere: 'FREQ:eq:A',
      orderBy: '',
    };
    await adapter.fetchPage(makeParams({ pageSize: 10 }), overlay, new AbortController().signal);

    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('page')).toBe('2');
    expect(calledUrl.searchParams.get('maxResult')).toBe('10');
    expect(calledUrl.searchParams.get('FREQ')).toBe('A');
  });

  it('returns totalCount 0 when paging.count is absent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ observations: [] }),
    });

    const overlay: ServerSideOverlay = { page: 1, effectiveWhere: '', orderBy: '' };
    const result = await adapter.fetchPage(
      makeParams({ pageSize: 20 }),
      overlay,
      new AbortController().signal
    );

    expect(result.totalCount).toBe(0);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    const overlay: ServerSideOverlay = { page: 1, effectiveWhere: '', orderBy: '' };
    await expect(
      adapter.fetchPage(makeParams({ pageSize: 20 }), overlay, new AbortController().signal)
    ).rejects.toThrow('HTTP 403');
  });

  it('passes headers through', async () => {
    mockFetch.mockResolvedValueOnce(inseeResponse([], { count: 0 }));

    const overlay: ServerSideOverlay = { page: 1, effectiveWhere: '', orderBy: '' };
    await adapter.fetchPage(
      makeParams({ pageSize: 20, headers: { Authorization: 'Bearer tok' } }),
      overlay,
      new AbortController().signal
    );

    const fetchOpts = mockFetch.mock.calls[0][1] as RequestInit;
    expect(fetchOpts.headers).toEqual({ Authorization: 'Bearer tok' });
  });
});
