import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { GristAdapter } from '../../src/adapters/grist-adapter.js';
import type { AdapterParams, ServerSideOverlay } from '../../src/adapters/api-adapter.js';

const BASE_URL = 'https://proxy.example.com/grist-proxy/api/docs/docABC/tables/Table1/records';

function makeParams(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: BASE_URL,
    datasetId: '',
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

describe('GristAdapter — Records mode conversions', () => {
  const adapter = new GristAdapter();

  // =========================================================================
  // _colonWhereToGristFilter
  // =========================================================================

  describe('_colonWhereToGristFilter', () => {
    it('converts eq to single-value array', () => {
      expect(adapter._colonWhereToGristFilter('region:eq:Bretagne'))
        .toEqual({ region: ['Bretagne'] });
    });

    it('converts in to multi-value array', () => {
      expect(adapter._colonWhereToGristFilter('region:in:Bretagne|Normandie'))
        .toEqual({ region: ['Bretagne', 'Normandie'] });
    });

    it('handles multiple fields', () => {
      expect(adapter._colonWhereToGristFilter('region:eq:Bretagne, annee:eq:2023'))
        .toEqual({ region: ['Bretagne'], annee: ['2023'] });
    });

    it('ignores unsupported operators', () => {
      expect(adapter._colonWhereToGristFilter('age:gt:18')).toBeNull();
    });

    it('handles values with colons', () => {
      expect(adapter._colonWhereToGristFilter('url:eq:https://example.com'))
        .toEqual({ url: ['https://example.com'] });
    });

    it('returns null for empty string', () => {
      expect(adapter._colonWhereToGristFilter('')).toBeNull();
    });
  });

  // =========================================================================
  // _orderByToGristSort
  // =========================================================================

  describe('_orderByToGristSort', () => {
    it('converts asc (implicit)', () => {
      expect(adapter._orderByToGristSort('nom')).toBe('nom');
    });

    it('converts asc (explicit)', () => {
      expect(adapter._orderByToGristSort('nom:asc')).toBe('nom');
    });

    it('converts desc with prefix dash', () => {
      expect(adapter._orderByToGristSort('population:desc')).toBe('-population');
    });

    it('converts multi-column', () => {
      expect(adapter._orderByToGristSort('region:asc, population:desc'))
        .toBe('region,-population');
    });
  });

  // =========================================================================
  // buildUrl
  // =========================================================================

  describe('buildUrl', () => {
    it('returns base URL when no params', () => {
      expect(adapter.buildUrl(makeParams())).toBe(BASE_URL);
    });

    it('adds filter for where eq', () => {
      const url = new URL(adapter.buildUrl(makeParams({ where: 'region:eq:Bretagne' })));
      expect(JSON.parse(url.searchParams.get('filter')!)).toEqual({ region: ['Bretagne'] });
    });

    it('adds sort for orderBy', () => {
      const url = new URL(adapter.buildUrl(makeParams({ orderBy: 'population:desc' })));
      expect(url.searchParams.get('sort')).toBe('-population');
    });

    it('adds limit', () => {
      const url = new URL(adapter.buildUrl(makeParams({ limit: 20 })));
      expect(url.searchParams.get('limit')).toBe('20');
    });

    it('combines filter + sort + limit', () => {
      const url = new URL(adapter.buildUrl(makeParams({
        where: 'region:eq:Bretagne',
        orderBy: 'population:desc',
        limit: 10,
      })));
      expect(JSON.parse(url.searchParams.get('filter')!)).toEqual({ region: ['Bretagne'] });
      expect(url.searchParams.get('sort')).toBe('-population');
      expect(url.searchParams.get('limit')).toBe('10');
    });

    it('ignores unsupported operators in filter (no filter param)', () => {
      const url = new URL(adapter.buildUrl(makeParams({ where: 'age:gt:18' })));
      expect(url.searchParams.get('filter')).toBeNull();
    });
  });

  // =========================================================================
  // buildServerSideUrl
  // =========================================================================

  describe('buildServerSideUrl', () => {
    it('adds pagination params (limit + offset)', () => {
      const overlay: ServerSideOverlay = { page: 3, effectiveWhere: '', orderBy: '' };
      const url = new URL(adapter.buildServerSideUrl(makeParams({ pageSize: 20 }), overlay));
      expect(url.searchParams.get('limit')).toBe('20');
      expect(url.searchParams.get('offset')).toBe('40');
    });

    it('page 1 has offset 0', () => {
      const overlay: ServerSideOverlay = { page: 1, effectiveWhere: '', orderBy: '' };
      const url = new URL(adapter.buildServerSideUrl(makeParams({ pageSize: 20 }), overlay));
      expect(url.searchParams.get('limit')).toBe('20');
      expect(url.searchParams.get('offset')).toBe('0');
    });

    it('uses overlay effectiveWhere over params where', () => {
      const overlay: ServerSideOverlay = { page: 1, effectiveWhere: 'region:eq:IDF', orderBy: '' };
      const url = new URL(adapter.buildServerSideUrl(makeParams({ pageSize: 20, where: 'region:eq:Bretagne' }), overlay));
      expect(JSON.parse(url.searchParams.get('filter')!)).toEqual({ region: ['IDF'] });
    });

    it('uses overlay orderBy over params orderBy', () => {
      const overlay: ServerSideOverlay = { page: 1, effectiveWhere: '', orderBy: 'nom:asc' };
      const url = new URL(adapter.buildServerSideUrl(makeParams({ pageSize: 20, orderBy: 'population:desc' }), overlay));
      expect(url.searchParams.get('sort')).toBe('nom');
    });
  });
});

// ===========================================================================
// SQL mode
// ===========================================================================

describe('GristAdapter — SQL mode utilities', () => {
  const adapter = new GristAdapter();

  // =========================================================================
  // _escapeIdentifier
  // =========================================================================

  describe('_escapeIdentifier', () => {
    it('wraps simple name in double quotes', () => {
      expect(adapter._escapeIdentifier('region')).toBe('"region"');
    });

    it('handles names with spaces', () => {
      expect(adapter._escapeIdentifier('Ma Colonne')).toBe('"Ma Colonne"');
    });

    it('handles names with accents', () => {
      expect(adapter._escapeIdentifier('Departement')).toBe('"Departement"');
    });

    it('double-escapes existing double quotes', () => {
      expect(adapter._escapeIdentifier('col"name')).toBe('"col""name"');
    });

    it('throws for empty name', () => {
      expect(() => adapter._escapeIdentifier('')).toThrow('Empty SQL identifier');
    });

    it('trims whitespace', () => {
      expect(adapter._escapeIdentifier('  region  ')).toBe('"region"');
    });
  });

  // =========================================================================
  // _colonWhereToSql
  // =========================================================================

  describe('_colonWhereToSql', () => {
    it('converts eq', () => {
      const args: (string | number)[] = [];
      expect(adapter._colonWhereToSql('region:eq:Bretagne', args)).toBe('"region" = ?');
      expect(args).toEqual(['Bretagne']);
    });

    it('converts neq', () => {
      const args: (string | number)[] = [];
      expect(adapter._colonWhereToSql('region:neq:Paris', args)).toBe('"region" != ?');
      expect(args).toEqual(['Paris']);
    });

    it('converts gt with numeric value', () => {
      const args: (string | number)[] = [];
      expect(adapter._colonWhereToSql('age:gt:18', args)).toBe('"age" > ?');
      expect(args).toEqual([18]);
    });

    it('converts gte', () => {
      const args: (string | number)[] = [];
      adapter._colonWhereToSql('score:gte:100', args);
      expect(args).toEqual([100]);
    });

    it('converts lt', () => {
      const args: (string | number)[] = [];
      adapter._colonWhereToSql('price:lt:50', args);
      expect(args).toEqual([50]);
    });

    it('converts lte', () => {
      const args: (string | number)[] = [];
      adapter._colonWhereToSql('price:lte:99.9', args);
      expect(args).toEqual([99.9]);
    });

    it('converts contains to LIKE', () => {
      const args: (string | number)[] = [];
      expect(adapter._colonWhereToSql('nom:contains:Paris', args)).toBe('"nom" LIKE ?');
      expect(args).toEqual(['%Paris%']);
    });

    it('converts notcontains to NOT LIKE', () => {
      const args: (string | number)[] = [];
      expect(adapter._colonWhereToSql('nom:notcontains:test', args)).toBe('"nom" NOT LIKE ?');
      expect(args).toEqual(['%test%']);
    });

    it('converts in to IN with multiple placeholders', () => {
      const args: (string | number)[] = [];
      expect(adapter._colonWhereToSql('region:in:IDF|OCC|BRE', args))
        .toBe('"region" IN (?,?,?)');
      expect(args).toEqual(['IDF', 'OCC', 'BRE']);
    });

    it('converts notin to NOT IN', () => {
      const args: (string | number)[] = [];
      expect(adapter._colonWhereToSql('region:notin:IDF|OCC', args))
        .toBe('"region" NOT IN (?,?)');
      expect(args).toEqual(['IDF', 'OCC']);
    });

    it('converts isnull', () => {
      const args: (string | number)[] = [];
      expect(adapter._colonWhereToSql('email:isnull:', args)).toBe('"email" IS NULL');
      expect(args).toEqual([]);
    });

    it('converts isnotnull', () => {
      const args: (string | number)[] = [];
      expect(adapter._colonWhereToSql('email:isnotnull:', args)).toBe('"email" IS NOT NULL');
      expect(args).toEqual([]);
    });

    it('joins multiple clauses with AND', () => {
      const args: (string | number)[] = [];
      const result = adapter._colonWhereToSql('region:eq:IDF, age:gt:18', args);
      expect(result).toBe('"region" = ? AND "age" > ?');
      expect(args).toEqual(['IDF', 18]);
    });

    it('handles value with colons', () => {
      const args: (string | number)[] = [];
      adapter._colonWhereToSql('url:eq:https://example.com', args);
      expect(args).toEqual(['https://example.com']);
    });
  });

  // =========================================================================
  // _sqlResultToObjects
  // =========================================================================

  describe('_sqlResultToObjects', () => {
    it('converts columns + records to objects', () => {
      const result = adapter._sqlResultToObjects({
        columns: ['region', 'total'],
        records: [['Bretagne', 100], ['Normandie', 200]],
      });
      expect(result).toEqual([
        { region: 'Bretagne', total: 100 },
        { region: 'Normandie', total: 200 },
      ]);
    });

    it('handles empty results', () => {
      expect(adapter._sqlResultToObjects({ columns: ['a'], records: [] })).toEqual([]);
    });

    it('handles missing fields gracefully', () => {
      expect(adapter._sqlResultToObjects({})).toEqual([]);
    });
  });

  // =========================================================================
  // _getSqlEndpointUrl
  // =========================================================================

  describe('_getSqlEndpointUrl', () => {
    it('derives /sql from /tables/.../records', () => {
      expect(adapter._getSqlEndpointUrl({ baseUrl: BASE_URL }))
        .toBe('https://proxy.example.com/grist-proxy/api/docs/docABC/sql');
    });

    it('throws for non-Grist URL', () => {
      expect(() => adapter._getSqlEndpointUrl({ baseUrl: 'https://example.com/data' }))
        .toThrow('Cannot derive SQL endpoint');
    });
  });

  // =========================================================================
  // _getTableId
  // =========================================================================

  describe('_getTableId', () => {
    it('extracts table ID from URL', () => {
      expect(adapter._getTableId({ baseUrl: BASE_URL })).toBe('Table1');
    });

    it('throws for URL without table', () => {
      expect(() => adapter._getTableId({ baseUrl: 'https://example.com/api/docs/x/sql' }))
        .toThrow('Cannot extract table ID');
    });
  });

  // =========================================================================
  // parseAggregates
  // =========================================================================

  describe('parseAggregates', () => {
    it('parses single aggregate', () => {
      const result = adapter.parseAggregates('population:sum:total');
      expect(result).toEqual([{ field: 'population', function: 'sum', alias: 'total' }]);
    });

    it('parses multiple aggregates', () => {
      const result = adapter.parseAggregates('population:sum:total, population:avg:moyenne');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ field: 'population', function: 'sum', alias: 'total' });
      expect(result[1]).toEqual({ field: 'population', function: 'avg', alias: 'moyenne' });
    });

    it('generates default alias when missing', () => {
      const result = adapter.parseAggregates('population:sum');
      expect(result[0].alias).toBe('sum_population');
    });
  });
});

// ===========================================================================
// buildFacetWhere (unchanged from previous implementation)
// ===========================================================================

describe('GristAdapter — buildFacetWhere', () => {
  const adapter = new GristAdapter();

  it('builds colon syntax for single value', () => {
    expect(adapter.buildFacetWhere({ region: new Set(['Bretagne']) }))
      .toBe('region:eq:Bretagne');
  });

  it('builds colon syntax for multiple values', () => {
    expect(adapter.buildFacetWhere({ region: new Set(['Bretagne', 'Normandie']) }))
      .toBe('region:in:Bretagne|Normandie');
  });

  it('excludes specified field', () => {
    expect(adapter.buildFacetWhere(
      { region: new Set(['Bretagne']), ville: new Set(['Rennes']) },
      'region'
    )).toBe('ville:eq:Rennes');
  });

  it('returns empty string for empty selections', () => {
    expect(adapter.buildFacetWhere({})).toBe('');
  });
});

// ===========================================================================
// Fetch-based tests (fetchAll, fetchPage, fetchFacets, fetchColumns, fetchTables)
// ===========================================================================

describe('GristAdapter — fetchAll', () => {
  let adapter: GristAdapter;

  beforeEach(() => {
    adapter = new GristAdapter();
    mockFetch.mockReset();
  });

  it('fetches records and flattens fields', async () => {
    mockFetch
      // SQL availability check
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ records: [[1]] }) })
      // SQL not needed (no groupBy), so this won't be called — let's test Records mode
    ;
    // Reset and test Records mode (no groupBy/aggregate)
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        records: [
          { id: 1, fields: { nom: 'Paris', pop: 2000000 } },
          { id: 2, fields: { nom: 'Lyon', pop: 500000 } },
        ],
      }),
    });

    const result = await adapter.fetchAll(makeParams(), new AbortController().signal);

    expect(result.data).toEqual([
      { nom: 'Paris', pop: 2000000 },
      { nom: 'Lyon', pop: 500000 },
    ]);
    expect(result.totalCount).toBe(2);
    expect(result.needsClientProcessing).toBe(true);
  });

  it('returns needsClientProcessing=false when where is set', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        records: [{ id: 1, fields: { nom: 'Paris' } }],
      }),
    });

    const result = await adapter.fetchAll(
      makeParams({ where: 'region:eq:IDF' }),
      new AbortController().signal
    );

    expect(result.needsClientProcessing).toBe(false);
  });

  it('returns needsClientProcessing=false when orderBy is set', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        records: [{ id: 1, fields: { nom: 'Paris' } }],
      }),
    });

    const result = await adapter.fetchAll(
      makeParams({ orderBy: 'nom:asc' }),
      new AbortController().signal
    );

    expect(result.needsClientProcessing).toBe(false);
  });

  it('uses SQL mode when groupBy is set and SQL is available', async () => {
    // SQL availability check
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ records: [[1]] }),
    });
    // SQL query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        columns: ['region', 'count'],
        records: [['Bretagne', 100], ['IDF', 200]],
      }),
    });

    const result = await adapter.fetchAll(
      makeParams({ groupBy: 'region' }),
      new AbortController().signal
    );

    expect(result.data).toEqual([
      { region: 'Bretagne', count: 100 },
      { region: 'IDF', count: 200 },
    ]);
    expect(result.needsClientProcessing).toBe(false);
    // Second call should be POST to /sql
    expect(mockFetch.mock.calls[1][1]?.method).toBe('POST');
  });

  it('uses SQL mode when aggregate is set', async () => {
    // SQL availability check
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ records: [[1]] }),
    });
    // SQL query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        columns: ['region', 'sum_population'],
        records: [['Bretagne', 3000000], ['IDF', 12000000]],
      }),
    });

    const result = await adapter.fetchAll(
      makeParams({ groupBy: 'region', aggregate: 'population:sum' }),
      new AbortController().signal
    );

    expect(result.data).toHaveLength(2);
    expect(result.needsClientProcessing).toBe(false);
  });

  it('falls back to Records mode when SQL check fails', async () => {
    // SQL availability check fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });
    // Records mode fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        records: [{ id: 1, fields: { nom: 'Paris' } }],
      }),
    });

    const warnSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const result = await adapter.fetchAll(
      makeParams({ groupBy: 'region' }),
      new AbortController().signal
    );

    // Should have fetched data via Records mode
    expect(result.data).toEqual([{ nom: 'Paris' }]);
    expect(result.needsClientProcessing).toBe(true);
    warnSpy.mockRestore();
  });

  it('throws on HTTP error in Records mode', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(
      adapter.fetchAll(makeParams(), new AbortController().signal)
    ).rejects.toThrow('HTTP 500');
  });

  it('passes headers to fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ records: [] }),
    });

    await adapter.fetchAll(
      makeParams({ headers: { Authorization: 'Bearer token123' } }),
      new AbortController().signal
    );

    const fetchOpts = mockFetch.mock.calls[0][1] as RequestInit;
    expect(fetchOpts.headers).toEqual({ Authorization: 'Bearer token123' });
  });
});

describe('GristAdapter — fetchPage', () => {
  let adapter: GristAdapter;

  beforeEach(() => {
    adapter = new GristAdapter();
    mockFetch.mockReset();
  });

  it('fetches one page in Records mode', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        records: Array.from({ length: 20 }, (_, i) => ({
          id: i,
          fields: { nom: `item-${i}` },
        })),
      }),
    });

    const result = await adapter.fetchPage(
      makeParams({ pageSize: 20 }),
      { page: 1, effectiveWhere: '', orderBy: '' },
      new AbortController().signal
    );

    expect(result.data).toHaveLength(20);
    expect(result.needsClientProcessing).toBe(false);
  });

  it('calculates totalCount from last page (data < pageSize)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        records: Array.from({ length: 15 }, (_, i) => ({
          id: i,
          fields: { nom: `item-${i}` },
        })),
      }),
    });

    const result = await adapter.fetchPage(
      makeParams({ pageSize: 20 }),
      { page: 3, effectiveWhere: '', orderBy: '' },
      new AbortController().signal
    );

    // (3-1) * 20 + 15 = 55
    expect(result.totalCount).toBe(55);
  });

  it('returns totalCount=-1 when page is full (more pages exist)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        records: Array.from({ length: 20 }, (_, i) => ({
          id: i,
          fields: { nom: `item-${i}` },
        })),
      }),
    });

    const result = await adapter.fetchPage(
      makeParams({ pageSize: 20 }),
      { page: 1, effectiveWhere: '', orderBy: '' },
      new AbortController().signal
    );

    expect(result.totalCount).toBe(-1);
  });

  it('uses SQL mode for fetchPage when groupBy is set', async () => {
    // SQL availability check
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ records: [[1]] }),
    });
    // SQL query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        columns: ['region', 'count'],
        records: [['Bretagne', 100]],
      }),
    });

    const result = await adapter.fetchPage(
      makeParams({ groupBy: 'region', pageSize: 20 }),
      { page: 1, effectiveWhere: '', orderBy: '' },
      new AbortController().signal
    );

    expect(result.data).toEqual([{ region: 'Bretagne', count: 100 }]);
    expect(result.needsClientProcessing).toBe(false);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(
      adapter.fetchPage(
        makeParams({ pageSize: 20 }),
        { page: 1, effectiveWhere: '', orderBy: '' },
        new AbortController().signal
      )
    ).rejects.toThrow('HTTP 404');
  });
});

describe('GristAdapter — fetchFacets', () => {
  let adapter: GristAdapter;

  beforeEach(() => {
    adapter = new GristAdapter();
    mockFetch.mockReset();
  });

  it('fetches facet values via SQL GROUP BY', async () => {
    // SQL availability check
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ records: [[1]] }),
    });
    // Facet query for "region"
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        records: [['Bretagne', 50], ['IDF', 100], ['PACA', 30]],
      }),
    });

    const results = await adapter.fetchFacets!(
      { baseUrl: BASE_URL, datasetId: '', headers: {} },
      ['region'],
      ''
    );

    expect(results).toHaveLength(1);
    expect(results[0].field).toBe('region');
    expect(results[0].values).toHaveLength(3);
    expect(results[0].values[0]).toEqual({ value: 'Bretagne', count: 50 });
  });

  it('includes where clause in facet SQL', async () => {
    // SQL availability check
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ records: [[1]] }),
    });
    // Facet query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ records: [['IDF', 100]] }),
    });

    await adapter.fetchFacets!(
      { baseUrl: BASE_URL, datasetId: '', headers: {} },
      ['region'],
      'annee:eq:2023'
    );

    const body = JSON.parse(mockFetch.mock.calls[1][1]?.body as string);
    expect(body.sql).toContain('WHERE');
    expect(body.args).toContain('2023');
  });

  it('returns empty array when SQL is not available', async () => {
    // SQL availability check fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });

    const warnSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const results = await adapter.fetchFacets!(
      { baseUrl: BASE_URL, datasetId: '', headers: {} },
      ['region'],
      ''
    );

    expect(results).toEqual([]);
    warnSpy.mockRestore();
  });

  it('filters out empty values from facet results', async () => {
    // SQL availability check
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ records: [[1]] }),
    });
    // Facet query returns some empty values
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        records: [['Bretagne', 50], [null, 10], ['', 5]],
      }),
    });

    const results = await adapter.fetchFacets!(
      { baseUrl: BASE_URL, datasetId: '', headers: {} },
      ['region'],
      ''
    );

    // null → "null" which is not empty, but '' should be filtered
    expect(results[0].values.some(v => v.value === '')).toBe(false);
  });

  it('continues on fetch error for individual field', async () => {
    // SQL availability check
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ records: [[1]] }),
    });
    // First field fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' });
    // Second field succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        records: [['A', 10], ['B', 20]],
      }),
    });

    const results = await adapter.fetchFacets!(
      { baseUrl: BASE_URL, datasetId: '', headers: {} },
      ['field1', 'field2'],
      ''
    );

    // field1 was skipped, only field2 returned
    expect(results).toHaveLength(1);
    expect(results[0].field).toBe('field2');
  });
});

describe('GristAdapter — fetchColumns', () => {
  let adapter: GristAdapter;

  beforeEach(() => {
    adapter = new GristAdapter();
    mockFetch.mockReset();
  });

  it('fetches and maps column metadata', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        columns: [
          { id: 'nom', fields: { label: 'Nom', type: 'Text', isFormula: false, formula: '' } },
          { id: 'pop', fields: { label: 'Population', type: 'Numeric', isFormula: true, formula: '$valeur * 1000' } },
        ],
      }),
    });

    const columns = await adapter.fetchColumns(makeParams());

    expect(columns).toHaveLength(2);
    expect(columns[0]).toEqual({
      id: 'nom',
      label: 'Nom',
      type: 'Text',
      isFormula: false,
      formula: '',
    });
    expect(columns[1].isFormula).toBe(true);
    expect(columns[1].formula).toBe('$valeur * 1000');
  });

  it('returns empty array on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const columns = await adapter.fetchColumns(makeParams());
    expect(columns).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const columns = await adapter.fetchColumns(makeParams());
    expect(columns).toEqual([]);
  });

  it('derives columns URL from baseUrl', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ columns: [] }),
    });

    await adapter.fetchColumns(makeParams());

    const callUrl = mockFetch.mock.calls[0][0] as string;
    expect(callUrl).toBe('https://proxy.example.com/grist-proxy/api/docs/docABC/tables/Table1/columns');
  });
});

describe('GristAdapter — fetchTables', () => {
  let adapter: GristAdapter;

  beforeEach(() => {
    adapter = new GristAdapter();
    mockFetch.mockReset();
  });

  it('fetches and maps table list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        tables: [
          { id: 'Table1' },
          { id: 'Table2' },
        ],
      }),
    });

    const tables = await adapter.fetchTables(makeParams());

    expect(tables).toEqual([{ id: 'Table1' }, { id: 'Table2' }]);
  });

  it('returns empty array on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

    const tables = await adapter.fetchTables(makeParams());
    expect(tables).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Timeout'));

    const tables = await adapter.fetchTables(makeParams());
    expect(tables).toEqual([]);
  });

  it('derives tables URL from baseUrl', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ tables: [] }),
    });

    await adapter.fetchTables(makeParams());

    const callUrl = mockFetch.mock.calls[0][0] as string;
    expect(callUrl).toBe('https://proxy.example.com/grist-proxy/api/docs/docABC/tables');
  });
});

describe('GristAdapter — SQL fallback on error', () => {
  let adapter: GristAdapter;

  beforeEach(() => {
    adapter = new GristAdapter();
    mockFetch.mockReset();
  });

  it('falls back to Records mode when SQL returns 404', async () => {
    // SQL availability check → OK
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ records: [[1]] }),
    });
    // SQL query → 404
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
    // Records fallback
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        records: [{ id: 1, fields: { nom: 'Paris' } }],
      }),
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await adapter.fetchAll(
      makeParams({ groupBy: 'region' }),
      new AbortController().signal
    );

    expect(result.data).toEqual([{ nom: 'Paris' }]);
    expect(result.needsClientProcessing).toBe(true);
    warnSpy.mockRestore();
  });

  it('throws on non-404/403 SQL error', async () => {
    // SQL availability check → OK
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ records: [[1]] }),
    });
    // SQL query → 500
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(
      adapter.fetchAll(
        makeParams({ groupBy: 'region' }),
        new AbortController().signal
      )
    ).rejects.toThrow('Grist SQL HTTP 500');
  });
});

describe('GristAdapter — SQL detection utilities', () => {
  const adapter = new GristAdapter();

  describe('_hasAdvancedOperators', () => {
    it('detects gt operator', () => {
      expect((adapter as any)._hasAdvancedOperators('age:gt:18')).toBe(true);
    });

    it('detects contains operator', () => {
      expect((adapter as any)._hasAdvancedOperators('nom:contains:Paris')).toBe(true);
    });

    it('detects isnull operator', () => {
      expect((adapter as any)._hasAdvancedOperators('email:isnull:')).toBe(true);
    });

    it('returns false for eq operator', () => {
      expect((adapter as any)._hasAdvancedOperators('region:eq:IDF')).toBe(false);
    });

    it('returns false for in operator', () => {
      expect((adapter as any)._hasAdvancedOperators('region:in:IDF|OCC')).toBe(false);
    });

    it('detects advanced op among multiple clauses', () => {
      expect((adapter as any)._hasAdvancedOperators('region:eq:IDF, age:gte:18')).toBe(true);
    });

    it('detects lte operator', () => {
      expect((adapter as any)._hasAdvancedOperators('price:lte:100')).toBe(true);
    });

    it('detects notcontains operator', () => {
      expect((adapter as any)._hasAdvancedOperators('nom:notcontains:test')).toBe(true);
    });

    it('detects notin operator', () => {
      expect((adapter as any)._hasAdvancedOperators('region:notin:IDF|OCC')).toBe(true);
    });
  });

  describe('_mergeWhere', () => {
    it('returns overlay when no static where', () => {
      expect((adapter as any)._mergeWhere('', 'dept:eq:75')).toBe('dept:eq:75');
    });

    it('returns static where when no overlay', () => {
      expect((adapter as any)._mergeWhere('region:eq:IDF', '')).toBe('region:eq:IDF');
    });

    it('merges both with comma separator', () => {
      expect((adapter as any)._mergeWhere('region:eq:IDF', 'dept:eq:75'))
        .toBe('region:eq:IDF, dept:eq:75');
    });

    it('returns empty string when both empty', () => {
      expect((adapter as any)._mergeWhere('', '')).toBe('');
    });

    it('returns empty string when both undefined', () => {
      expect((adapter as any)._mergeWhere(undefined, undefined)).toBe('');
    });
  });

  describe('_needsSqlMode', () => {
    it('returns true when groupBy is set', () => {
      expect((adapter as any)._needsSqlMode({ groupBy: 'region' })).toBe(true);
    });

    it('returns true when aggregate is set', () => {
      expect((adapter as any)._needsSqlMode({ aggregate: 'pop:sum' })).toBe(true);
    });

    it('returns true when where has advanced operators', () => {
      expect((adapter as any)._needsSqlMode({ where: 'age:gt:18' })).toBe(true);
    });

    it('returns false for simple eq where', () => {
      expect((adapter as any)._needsSqlMode({ where: 'region:eq:IDF' })).toBe(false);
    });

    it('returns false when no params', () => {
      expect((adapter as any)._needsSqlMode({})).toBe(false);
    });

    it('uses overlay effectiveWhere for detection', () => {
      expect((adapter as any)._needsSqlMode(
        { where: 'region:eq:IDF' },
        { effectiveWhere: 'age:gt:18' }
      )).toBe(true);
    });
  });

  describe('_extractHostname', () => {
    it('extracts hostname from URL', () => {
      expect((adapter as any)._extractHostname('https://grist.example.com/api/docs/x/tables/y/records'))
        .toBe('grist.example.com');
    });

    it('returns input for invalid URL', () => {
      expect((adapter as any)._extractHostname('not-a-url')).toBe('not-a-url');
    });
  });

  describe('_flattenRecords', () => {
    it('flattens records with fields property', () => {
      const result = (adapter as any)._flattenRecords([
        { id: 1, fields: { nom: 'Paris', pop: 2000000 } },
      ]);
      expect(result).toEqual([{ nom: 'Paris', pop: 2000000 }]);
    });

    it('returns record as-is when no fields property', () => {
      const result = (adapter as any)._flattenRecords([
        { nom: 'Paris', pop: 2000000 },
      ]);
      expect(result).toEqual([{ nom: 'Paris', pop: 2000000 }]);
    });

    it('handles empty records array', () => {
      expect((adapter as any)._flattenRecords([])).toEqual([]);
    });
  });

  describe('_toNumberOrString', () => {
    it('converts numeric string to number', () => {
      expect((adapter as any)._toNumberOrString('42')).toBe(42);
    });

    it('converts decimal string to number', () => {
      expect((adapter as any)._toNumberOrString('3.14')).toBe(3.14);
    });

    it('keeps non-numeric string as string', () => {
      expect((adapter as any)._toNumberOrString('Paris')).toBe('Paris');
    });

    it('keeps empty string as string', () => {
      expect((adapter as any)._toNumberOrString('')).toBe('');
    });

    it('converts negative number', () => {
      expect((adapter as any)._toNumberOrString('-5')).toBe(-5);
    });
  });

  describe('_orderByToGristSort', () => {
    it('converts desc to minus prefix', () => {
      expect(adapter._orderByToGristSort('population:desc')).toBe('-population');
    });

    it('converts asc to plain field', () => {
      expect(adapter._orderByToGristSort('nom:asc')).toBe('nom');
    });

    it('handles multiple sort fields', () => {
      expect(adapter._orderByToGristSort('region:asc, population:desc'))
        .toBe('region,-population');
    });

    it('defaults to asc when no direction', () => {
      expect(adapter._orderByToGristSort('nom')).toBe('nom');
    });
  });
});
