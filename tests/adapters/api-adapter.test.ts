import { describe, it, expect } from 'vitest';
import { getAdapter, registerAdapter } from '@/adapters/api-adapter.js';
import type { ApiAdapter, AdapterParams, ServerSideOverlay } from '@/adapters/api-adapter.js';

describe('API Adapter Factory', () => {
  it('returns opendatasoft adapter', () => {
    const adapter = getAdapter('opendatasoft');
    expect(adapter.type).toBe('opendatasoft');
  });

  it('returns tabular adapter', () => {
    const adapter = getAdapter('tabular');
    expect(adapter.type).toBe('tabular');
  });

  it('returns grist adapter', () => {
    const adapter = getAdapter('grist');
    expect(adapter.type).toBe('grist');
  });

  it('returns generic adapter', () => {
    const adapter = getAdapter('generic');
    expect(adapter.type).toBe('generic');
  });

  it('throws for unknown api type', () => {
    expect(() => getAdapter('unknown')).toThrow("Type d'API non supporte: unknown");
  });

  it('allows registering custom adapters', () => {
    const customAdapter: ApiAdapter = {
      type: 'custom',
      capabilities: {
        serverFetch: true,
        serverFacets: false,
        serverSearch: false,
        serverGroupBy: false,
        serverOrderBy: false,
        whereFormat: 'colon',
      },
      validate: () => null,
      fetchAll: () => Promise.resolve({ data: [], totalCount: 0, needsClientProcessing: false }),
      fetchPage: () => Promise.resolve({ data: [], totalCount: 0, needsClientProcessing: false }),
      buildUrl: () => '',
      buildServerSideUrl: () => '',
    };

    registerAdapter(customAdapter);
    expect(getAdapter('custom').type).toBe('custom');
  });
});

describe('Adapter Capabilities', () => {
  it('opendatasoft has full server capabilities', () => {
    const caps = getAdapter('opendatasoft').capabilities;
    expect(caps.serverFetch).toBe(true);
    expect(caps.serverFacets).toBe(true);
    expect(caps.serverSearch).toBe(true);
    expect(caps.serverGroupBy).toBe(true);
    expect(caps.serverOrderBy).toBe(true);
    expect(caps.whereFormat).toBe('odsql');
  });

  it('tabular has server groupBy/aggregation and ordering', () => {
    const caps = getAdapter('tabular').capabilities;
    expect(caps.serverFetch).toBe(true);
    expect(caps.serverFacets).toBe(false);
    expect(caps.serverSearch).toBe(false);
    expect(caps.serverGroupBy).toBe(true);
    expect(caps.serverOrderBy).toBe(true);
    expect(caps.whereFormat).toBe('colon');
  });

  it('grist has server capabilities (Records + SQL)', () => {
    const caps = getAdapter('grist').capabilities;
    expect(caps.serverFetch).toBe(true);
    expect(caps.serverFacets).toBe(true);
    expect(caps.serverSearch).toBe(false);
    expect(caps.serverGroupBy).toBe(true);
    expect(caps.serverOrderBy).toBe(true);
    expect(caps.whereFormat).toBe('colon');
  });

  it('generic has no server capabilities', () => {
    const caps = getAdapter('generic').capabilities;
    expect(caps.serverFetch).toBe(false);
    expect(caps.serverFacets).toBe(false);
    expect(caps.serverSearch).toBe(false);
    expect(caps.serverGroupBy).toBe(false);
    expect(caps.serverOrderBy).toBe(false);
    expect(caps.whereFormat).toBe('odsql');
  });
});

describe('GenericAdapter', () => {
  const adapter = getAdapter('generic');

  it('validate returns null (no requirements)', () => {
    expect(adapter.validate({} as AdapterParams)).toBeNull();
  });

  it('fetchAll throws', () => {
    expect(() => adapter.fetchAll({} as AdapterParams, new AbortController().signal)).toThrow();
  });

  it('fetchPage throws', () => {
    expect(() =>
      adapter.fetchPage({} as AdapterParams, {} as ServerSideOverlay, new AbortController().signal)
    ).toThrow();
  });

  it('buildUrl throws', () => {
    expect(() => adapter.buildUrl({} as AdapterParams)).toThrow();
  });

  it('buildServerSideUrl throws', () => {
    expect(() =>
      adapter.buildServerSideUrl({} as AdapterParams, {} as ServerSideOverlay)
    ).toThrow();
  });
});

describe('GristAdapter', () => {
  const adapter = getAdapter('grist');

  it('validate requires base-url', () => {
    expect(adapter.validate({ baseUrl: '' } as AdapterParams)).toBe(
      'attribut "base-url" requis pour les requetes Grist'
    );
    expect(
      adapter.validate({
        baseUrl: 'https://example.com/api/docs/x/tables/y/records',
      } as AdapterParams)
    ).toBeNull();
  });

  it('buildUrl returns base-url when no params', () => {
    const url = adapter.buildUrl({
      baseUrl: 'https://proxy.example.com/grist-proxy/api/docs/x/tables/y/records',
    } as AdapterParams);
    expect(url).toBe('https://proxy.example.com/grist-proxy/api/docs/x/tables/y/records');
  });

  it('buildUrl adds filter param for where eq', () => {
    const url = adapter.buildUrl({
      baseUrl: 'https://proxy.example.com/grist-proxy/api/docs/x/tables/y/records',
      where: 'region:eq:Bretagne',
    } as AdapterParams);
    const parsed = new URL(url);
    expect(JSON.parse(parsed.searchParams.get('filter')!)).toEqual({ region: ['Bretagne'] });
  });

  it('buildUrl adds filter param for where in', () => {
    const url = adapter.buildUrl({
      baseUrl: 'https://proxy.example.com/grist-proxy/api/docs/x/tables/y/records',
      where: 'region:in:Bretagne|Normandie',
    } as AdapterParams);
    const parsed = new URL(url);
    expect(JSON.parse(parsed.searchParams.get('filter')!)).toEqual({
      region: ['Bretagne', 'Normandie'],
    });
  });

  it('buildUrl adds sort param for orderBy', () => {
    const url = adapter.buildUrl({
      baseUrl: 'https://proxy.example.com/grist-proxy/api/docs/x/tables/y/records',
      orderBy: 'population:desc',
    } as AdapterParams);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('sort')).toBe('-population');
  });

  it('buildUrl adds limit param', () => {
    const url = adapter.buildUrl({
      baseUrl: 'https://proxy.example.com/grist-proxy/api/docs/x/tables/y/records',
      limit: 20,
    } as AdapterParams);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('limit')).toBe('20');
  });

  it('buildServerSideUrl adds pagination params', () => {
    const params = {
      baseUrl: 'https://proxy.example.com/grist-proxy/api/docs/x/tables/y/records',
      pageSize: 20,
    } as AdapterParams;
    const overlay = { page: 3, effectiveWhere: '', orderBy: '' } as ServerSideOverlay;
    const url = adapter.buildServerSideUrl(params, overlay);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('limit')).toBe('20');
    expect(parsed.searchParams.get('offset')).toBe('40');
  });
});

describe('getDefaultSearchTemplate', () => {
  it('ODS returns search template', () => {
    expect(getAdapter('opendatasoft').getDefaultSearchTemplate!()).toBe('search("{q}")');
  });

  it('Tabular returns null', () => {
    expect(getAdapter('tabular').getDefaultSearchTemplate!()).toBeNull();
  });

  it('Grist returns null', () => {
    expect(getAdapter('grist').getDefaultSearchTemplate!()).toBeNull();
  });

  it('Generic returns null', () => {
    expect(getAdapter('generic').getDefaultSearchTemplate!()).toBeNull();
  });
});

describe('getProviderConfig', () => {
  it('each adapter returns its ProviderConfig', () => {
    expect(getAdapter('opendatasoft').getProviderConfig!().id).toBe('opendatasoft');
    expect(getAdapter('tabular').getProviderConfig!().id).toBe('tabular');
    expect(getAdapter('grist').getProviderConfig!().id).toBe('grist');
    expect(getAdapter('generic').getProviderConfig!().id).toBe('generic');
  });
});

describe('buildFacetWhere is implemented on all adapters', () => {
  for (const type of ['opendatasoft', 'tabular', 'grist', 'generic']) {
    it(`${type} adapter has buildFacetWhere`, () => {
      const adapter = getAdapter(type);
      expect(typeof adapter.buildFacetWhere).toBe('function');
    });
  }
});

describe('ProviderConfig.codeGen.sourceApiType', () => {
  for (const type of ['opendatasoft', 'tabular', 'grist', 'generic'] as const) {
    it(`${type} config has codeGen.sourceApiType matching provider`, () => {
      const config = getAdapter(type).getProviderConfig!();
      expect(config.codeGen.usesDsfrDataSource).toBe(true);
      expect(config.codeGen.usesDsfrDataQuery).toBe(true);
      expect(config.codeGen.sourceApiType).toBe(type);
    });
  }
});

describe('GenericAdapter — buildFacetWhere', () => {
  const adapter = getAdapter('generic');

  it('builds colon syntax for single value', () => {
    expect(adapter.buildFacetWhere!({ region: new Set(['IDF']) })).toBe('region:eq:IDF');
  });

  it('builds colon syntax IN for multiple values', () => {
    expect(adapter.buildFacetWhere!({ region: new Set(['IDF', 'PACA']) })).toBe(
      'region:in:IDF|PACA'
    );
  });

  it('joins multiple fields with comma', () => {
    const result = adapter.buildFacetWhere!({
      region: new Set(['IDF']),
      type: new Set(['A']),
    });
    expect(result).toBe('region:eq:IDF, type:eq:A');
  });

  it('excludes specified field', () => {
    expect(
      adapter.buildFacetWhere!({ region: new Set(['IDF']), type: new Set(['A']) }, 'region')
    ).toBe('type:eq:A');
  });

  it('returns empty string for empty selections', () => {
    expect(adapter.buildFacetWhere!({})).toBe('');
  });

  it('skips fields with empty sets', () => {
    expect(adapter.buildFacetWhere!({ region: new Set() })).toBe('');
  });
});
