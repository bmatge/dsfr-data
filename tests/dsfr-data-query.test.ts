import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for DsfrDataQuery component logic.
 *
 * Tests the client-side filtering, grouping, and aggregation logic,
 * as well as source subscription and command forwarding.
 */

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// We need to import after setting up fetch mock
import { DsfrDataQuery } from '../src/components/dsfr-data-query.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  dispatchDataLoading,
  dispatchDataError,
  dispatchSourceCommand,
  getDataCache,
  subscribeToSourceCommands
} from '../src/utils/data-bridge.js';

describe('DsfrDataQuery', () => {
  let query: DsfrDataQuery;

  beforeEach(() => {
    clearDataCache('test-query');
    clearDataCache('test-source');
    mockFetch.mockReset();
    query = new DsfrDataQuery();
  });

  afterEach(() => {
    // Always clean up listeners (even if query is not connected to DOM)
    (query as any)._cleanup?.();
    if (query.isConnected) {
      query.disconnectedCallback();
    }
  });

  describe('Filter parsing', () => {
    it('parses simple equality filter', () => {
      const filters = (query as any)._parseFilters('status:eq:active');
      expect(filters).toHaveLength(1);
      expect(filters[0]).toEqual({
        field: 'status',
        operator: 'eq',
        value: 'active'
      });
    });

    it('parses numeric filter values', () => {
      const filters = (query as any)._parseFilters('score:gte:80');
      expect(filters[0].value).toBe(80);
    });

    it('parses boolean filter values', () => {
      const filters = (query as any)._parseFilters('isActive:eq:true');
      expect(filters[0].value).toBe(true);
    });

    it('parses multiple filters', () => {
      const filters = (query as any)._parseFilters('status:eq:active, score:gte:80');
      expect(filters).toHaveLength(2);
      expect(filters[0].field).toBe('status');
      expect(filters[1].field).toBe('score');
    });

    it('parses in operator with multiple values', () => {
      const filters = (query as any)._parseFilters('region:in:IDF|PACA|ARA');
      expect(filters[0].operator).toBe('in');
      expect(filters[0].value).toEqual(['IDF', 'PACA', 'ARA']);
    });

    it('handles values containing colons', () => {
      const filters = (query as any)._parseFilters('time:eq:12:30:00');
      expect(filters[0].value).toBe('12:30:00');
    });
  });

  describe('Filter matching', () => {
    const testItem = {
      name: 'Paris',
      population: 2200000,
      region: 'IDF',
      isCapital: true,
      description: 'Capitale de la France'
    };

    it('matches equality filter', () => {
      const filter = { field: 'region', operator: 'eq' as const, value: 'IDF' };
      expect((query as any)._matchesFilter(testItem, filter)).toBe(true);
    });

    it('matches inequality filter', () => {
      const filter = { field: 'region', operator: 'neq' as const, value: 'PACA' };
      expect((query as any)._matchesFilter(testItem, filter)).toBe(true);
    });

    it('matches greater than filter', () => {
      const filter = { field: 'population', operator: 'gt' as const, value: 1000000 };
      expect((query as any)._matchesFilter(testItem, filter)).toBe(true);
    });

    it('matches less than or equal filter', () => {
      const filter = { field: 'population', operator: 'lte' as const, value: 2200000 };
      expect((query as any)._matchesFilter(testItem, filter)).toBe(true);
    });

    it('matches contains filter (case insensitive)', () => {
      const filter = { field: 'description', operator: 'contains' as const, value: 'capitale' };
      expect((query as any)._matchesFilter(testItem, filter)).toBe(true);
    });

    it('matches in filter', () => {
      const filter = { field: 'region', operator: 'in' as const, value: ['IDF', 'PACA'] };
      expect((query as any)._matchesFilter(testItem, filter)).toBe(true);
    });

    it('matches isnotnull filter', () => {
      const filter = { field: 'name', operator: 'isnotnull' as const };
      expect((query as any)._matchesFilter(testItem, filter)).toBe(true);
    });

    it('eq matches with type coercion (string "84" == number 84)', () => {
      const item = { code_region: '84', name: 'Auvergne-Rhone-Alpes' };
      const filter = { field: 'code_region', operator: 'eq' as const, value: 84 };
      expect((query as any)._matchesFilter(item, filter)).toBe(true);
    });

    it('eq matches with type coercion (number 84 == string "84")', () => {
      const item = { code_region: 84, name: 'Auvergne-Rhone-Alpes' };
      const filter = { field: 'code_region', operator: 'eq' as const, value: '84' };
      expect((query as any)._matchesFilter(item, filter)).toBe(true);
    });

    it('neq rejects with type coercion (string "84" == number 84)', () => {
      const item = { code_region: '84', name: 'Auvergne-Rhone-Alpes' };
      const filter = { field: 'code_region', operator: 'neq' as const, value: 84 };
      expect((query as any)._matchesFilter(item, filter)).toBe(false);
    });
  });

  describe('Aggregation parsing', () => {
    it('parses single aggregation', () => {
      const aggregates = (query as any)._parseAggregates('population:sum');
      expect(aggregates).toHaveLength(1);
      expect(aggregates[0]).toEqual({
        field: 'population',
        function: 'sum',
        alias: undefined
      });
    });

    it('parses aggregation with alias', () => {
      const aggregates = (query as any)._parseAggregates('population:sum:total_pop');
      expect(aggregates[0].alias).toBe('total_pop');
    });

    it('parses multiple aggregations', () => {
      const aggregates = (query as any)._parseAggregates('population:sum, score:avg, count:count');
      expect(aggregates).toHaveLength(3);
      expect(aggregates[0].function).toBe('sum');
      expect(aggregates[1].function).toBe('avg');
      expect(aggregates[2].function).toBe('count');
    });
  });

  describe('Aggregation computation', () => {
    const testItems = [
      { region: 'IDF', population: 1000, score: 80 },
      { region: 'IDF', population: 2000, score: 90 },
      { region: 'PACA', population: 500, score: 70 }
    ];

    it('computes sum aggregation', () => {
      const agg = { field: 'population', function: 'sum' as const };
      const result = (query as any)._computeAggregate(testItems, agg);
      expect(result).toBe(3500);
    });

    it('computes avg aggregation', () => {
      const agg = { field: 'score', function: 'avg' as const };
      const result = (query as any)._computeAggregate(testItems, agg);
      expect(result).toBe(80);
    });

    it('computes count aggregation', () => {
      const agg = { field: 'population', function: 'count' as const };
      const result = (query as any)._computeAggregate(testItems, agg);
      expect(result).toBe(3);
    });

    it('computes min aggregation', () => {
      const agg = { field: 'population', function: 'min' as const };
      const result = (query as any)._computeAggregate(testItems, agg);
      expect(result).toBe(500);
    });

    it('computes max aggregation', () => {
      const agg = { field: 'population', function: 'max' as const };
      const result = (query as any)._computeAggregate(testItems, agg);
      expect(result).toBe(2000);
    });
  });

  describe('Group by and aggregate', () => {
    beforeEach(() => {
      query.groupBy = 'region';
      query.aggregate = 'population:sum';
      (query as any)._rawData = [
        { region: 'IDF', population: 1000 },
        { region: 'IDF', population: 2000 },
        { region: 'PACA', population: 500 },
        { region: 'PACA', population: 300 }
      ];
    });

    it('groups data by field', () => {
      const result = (query as any)._applyGroupByAndAggregate((query as any)._rawData);
      expect(result).toHaveLength(2);
      expect(result.find((r: any) => r.region === 'IDF')).toBeDefined();
      expect(result.find((r: any) => r.region === 'PACA')).toBeDefined();
    });

    it('computes aggregation per group', () => {
      const result = (query as any)._applyGroupByAndAggregate((query as any)._rawData);
      const idf = result.find((r: any) => r.region === 'IDF');
      const paca = result.find((r: any) => r.region === 'PACA');

      expect(idf['population__sum']).toBe(3000);
      expect(paca['population__sum']).toBe(800);
    });

    it('handles multiple group by fields', () => {
      query.groupBy = 'region, year';
      (query as any)._rawData = [
        { region: 'IDF', year: 2023, population: 1000 },
        { region: 'IDF', year: 2024, population: 1100 },
        { region: 'PACA', year: 2023, population: 500 }
      ];

      const result = (query as any)._applyGroupByAndAggregate((query as any)._rawData);
      expect(result).toHaveLength(3);
    });
  });

  describe('Sorting', () => {
    const testData = [
      { name: 'Paris', value: 100 },
      { name: 'Lyon', value: 300 },
      { name: 'Marseille', value: 200 }
    ];

    it('sorts ascending by numeric field', () => {
      query.orderBy = 'value:asc';
      const result = (query as any)._applySort(testData);
      expect(result[0].name).toBe('Paris');
      expect(result[2].name).toBe('Lyon');
    });

    it('sorts descending by numeric field', () => {
      query.orderBy = 'value:desc';
      const result = (query as any)._applySort(testData);
      expect(result[0].name).toBe('Lyon');
      expect(result[2].name).toBe('Paris');
    });

    it('sorts by string field', () => {
      query.orderBy = 'name:asc';
      const result = (query as any)._applySort(testData);
      expect(result[0].name).toBe('Lyon');
      expect(result[2].name).toBe('Paris');
    });
  });

  describe('Full processing pipeline', () => {
    beforeEach(() => {
      query.id = 'test-query';
      query.source = 'test-source';
      query.filter = 'population:gte:500';
      query.groupBy = 'region';
      query.aggregate = 'population:sum';
      query.orderBy = 'population__sum:desc';
      query.limit = 5;

      (query as any)._rawData = [
        { region: 'IDF', population: 1000 },
        { region: 'IDF', population: 2000 },
        { region: 'PACA', population: 500 },
        { region: 'ARA', population: 100 }, // Should be filtered out
        { region: 'PACA', population: 800 }
      ];
    });

    it('applies filter -> group -> aggregate -> sort -> limit', () => {
      (query as any)._processClientSide();

      const result = query.getData() as any[];
      expect(result).toHaveLength(2); // IDF and PACA (ARA filtered out)
      expect(result[0].region).toBe('IDF'); // Highest sum
      expect(result[0]['population__sum']).toBe(3000);
      expect(result[1].region).toBe('PACA');
      expect(result[1]['population__sum']).toBe(1300);
    });
  });

  describe('Source subscription', () => {
    it('subscribes to source and processes data on event', () => {
      query.id = 'test-query';
      query.source = 'test-source';
      query.groupBy = 'region';
      query.aggregate = 'value:sum';

      (query as any)._subscribeToSourceData('test-source');

      // Simulate source emitting data
      dispatchDataLoaded('test-source', [
        { region: 'A', value: 10 },
        { region: 'B', value: 20 },
        { region: 'A', value: 30 },
      ]);

      const data = query.getData() as Record<string, unknown>[];
      expect(data).toHaveLength(2);
      const regionA = data.find(d => d.region === 'A');
      expect(regionA?.value__sum).toBe(40);
    });

    it('reads cached data on subscription', () => {
      query.id = 'test-query';
      query.source = 'test-source';
      query.orderBy = 'value:desc';

      // Pre-populate cache
      dispatchDataLoaded('test-source', [
        { name: 'A', value: 10 },
        { name: 'B', value: 30 },
      ]);

      (query as any)._subscribeToSourceData('test-source');

      const data = query.getData() as Record<string, unknown>[];
      expect(data).toHaveLength(2);
      expect(data[0].name).toBe('B'); // Sorted desc
    });
  });

  describe('Command forwarding', () => {
    it('forwards commands to upstream source in server-side mode', () => {
      query.id = 'test-query';
      query.source = 'upstream-source';
      query.serverSide = true;

      const received: any[] = [];
      const unsub = subscribeToSourceCommands('upstream-source', (cmd) => {
        received.push(cmd);
      });

      (query as any)._setupCommandForwarding();

      dispatchSourceCommand('test-query', { page: 3 });
      expect(received).toHaveLength(1);
      expect(received[0].page).toBe(3);

      dispatchSourceCommand('test-query', { where: 'search("test")', whereKey: 'search-1' });
      expect(received).toHaveLength(2);
      expect(received[1].where).toBe('search("test")');
      expect(received[1].whereKey).toBe('search-1');

      unsub();
    });

    it('does not forward when server-side is false', () => {
      query.id = 'test-query';
      query.source = 'upstream-source';
      query.serverSide = false;

      (query as any)._setupCommandForwarding();
      expect((query as any)._unsubscribeCommands).toBeNull();
    });

    it('cleans up command listener on cleanup', () => {
      query.id = 'test-query';
      query.source = 'upstream-source';
      query.serverSide = true;

      (query as any)._setupCommandForwarding();
      expect((query as any)._unsubscribeCommands).toBeTypeOf('function');

      (query as any)._cleanup();
      expect((query as any)._unsubscribeCommands).toBeNull();
    });
  });

  describe('getEffectiveWhere delegation', () => {
    it('delegates to source element when available', () => {
      // Create mock source element
      const mockSource = document.createElement('div');
      mockSource.id = 'mock-source';
      (mockSource as any).getEffectiveWhere = (excludeKey?: string) => {
        if (excludeKey === 'facets') return 'search("test")';
        return 'search("test") AND region = "IDF"';
      };
      document.body.appendChild(mockSource);

      query.source = 'mock-source';

      expect(query.getEffectiveWhere()).toBe('search("test") AND region = "IDF"');
      expect(query.getEffectiveWhere('facets')).toBe('search("test")');

      mockSource.remove();
    });

    it('returns static where as fallback', () => {
      query.where = 'status:eq:active';
      expect(query.getEffectiveWhere()).toBe('status:eq:active');
    });

    it('uses filter attribute as fallback', () => {
      query.filter = 'DEP:eq:75';
      expect(query.getEffectiveWhere()).toBe('DEP:eq:75');
    });

    it('returns empty string when nothing set', () => {
      expect(query.getEffectiveWhere()).toBe('');
    });
  });

  describe('getAdapter delegation', () => {
    it('delegates to source element when available', () => {
      const mockSource = document.createElement('div');
      mockSource.id = 'mock-source';
      (mockSource as any).getAdapter = () => ({
        type: 'opendatasoft',
        capabilities: { serverGroupBy: true, whereFormat: 'odsql' }
      });
      document.body.appendChild(mockSource);

      query.source = 'mock-source';

      const adapter = query.getAdapter();
      expect(adapter.type).toBe('opendatasoft');
      expect(adapter.capabilities.serverGroupBy).toBe(true);

      mockSource.remove();
    });

    it('returns null when no source element', () => {
      expect(query.getAdapter()).toBeNull();
    });
  });

  describe('Public API', () => {
    it('getData returns current data', () => {
      (query as any)._data = [{ test: 1 }];
      expect(query.getData()).toEqual([{ test: 1 }]);
    });

    it('isLoading returns loading state', () => {
      (query as any)._loading = true;
      expect(query.isLoading()).toBe(true);
    });

    it('getError returns error state', () => {
      const error = new Error('Test error');
      (query as any)._error = error;
      expect(query.getError()).toBe(error);
    });
  });

  describe('createRenderRoot and render', () => {
    it('createRenderRoot returns this (no shadow DOM)', () => {
      expect(query.createRenderRoot()).toBe(query);
    });

    it('render returns empty template', () => {
      const result = query.render();
      expect(result).toBeDefined();
    });
  });

  describe('Lifecycle', () => {
    it('connectedCallback initializes the component', () => {
      query.id = 'test-query';
      query.source = 'test-source';
      query.connectedCallback();
      expect((query as any)._unsubscribe).toBeTypeOf('function');
    });

    it('disconnectedCallback cleans up', () => {
      query.id = 'test-query';
      query.source = 'test-source';
      query.connectedCallback();

      expect((query as any)._unsubscribe).toBeTypeOf('function');
      query.disconnectedCallback();
      expect((query as any)._unsubscribe).toBeNull();
    });

    it('disconnectedCallback clears data cache', () => {
      query.id = 'test-query';
      query.source = 'test-source';
      query.connectedCallback();

      dispatchDataLoaded('test-source', [{ a: 1 }]);
      expect(query.getData()).toHaveLength(1);

      query.disconnectedCallback();
      // Cache should be cleared
      expect(getDataCache('test-query')).toBeUndefined();
    });

    it('updated re-initializes when source changes', () => {
      query.id = 'test-query';
      query.source = 'test-source';
      query.connectedCallback();

      const initSpy = vi.spyOn(query as any, '_initialize');
      const changedProps = new Map([['source', 'old-source']]);
      query.willUpdate(changedProps);
      expect(initSpy).toHaveBeenCalled();
      initSpy.mockRestore();
    });

    it('updated re-initializes when query props change', () => {
      query.id = 'test-query';
      query.source = 'test-source';
      query.connectedCallback();

      const initSpy = vi.spyOn(query as any, '_initialize');
      const changedProps = new Map([['groupBy', '']]);
      query.willUpdate(changedProps);
      expect(initSpy).toHaveBeenCalled();
      initSpy.mockRestore();
    });

    it('updated calls _setupRefresh when refresh changes', () => {
      query.id = 'test-query';
      query.source = 'test-source';

      const refreshSpy = vi.spyOn(query as any, '_setupRefresh');
      const changedProps = new Map([['refresh', 0]]);
      query.willUpdate(changedProps);
      expect(refreshSpy).toHaveBeenCalled();
      refreshSpy.mockRestore();
    });
  });

  describe('_setupRefresh', () => {
    afterEach(() => {
      if ((query as any)._refreshInterval) {
        clearInterval((query as any)._refreshInterval);
        (query as any)._refreshInterval = null;
      }
    });

    it('sets up interval when refresh > 0', () => {
      vi.useFakeTimers();
      query.id = 'test-query';
      query.source = 'test-source';
      query.refresh = 5;
      query.connectedCallback();

      (query as any)._setupRefresh();
      expect((query as any)._refreshInterval).not.toBeNull();

      vi.useRealTimers();
    });

    it('clears previous interval before setting new one', () => {
      vi.useFakeTimers();
      query.refresh = 10;
      (query as any)._setupRefresh();
      const firstInterval = (query as any)._refreshInterval;

      query.refresh = 5;
      (query as any)._setupRefresh();
      expect((query as any)._refreshInterval).not.toBe(firstInterval);

      vi.useRealTimers();
    });

    it('clears interval when refresh is 0', () => {
      vi.useFakeTimers();
      query.refresh = 5;
      (query as any)._setupRefresh();
      expect((query as any)._refreshInterval).not.toBeNull();

      query.refresh = 0;
      (query as any)._setupRefresh();
      expect((query as any)._refreshInterval).toBeNull();

      vi.useRealTimers();
    });

    it('calls _initialize on interval tick', () => {
      vi.useFakeTimers();
      query.id = 'test-query';
      query.source = 'test-source';
      query.refresh = 2;

      const initSpy = vi.spyOn(query as any, '_initialize');
      (query as any)._setupRefresh();

      vi.advanceTimersByTime(2000);
      expect(initSpy).toHaveBeenCalled();

      initSpy.mockRestore();
      vi.useRealTimers();
    });
  });

  describe('onLoading and onError callbacks', () => {
    it('forwards loading from source subscription', () => {
      query.id = 'test-query';
      query.source = 'test-source';
      (query as any)._subscribeToSourceData('test-source');

      // Simulate source emitting loading
      dispatchDataLoading('test-source');

      expect(query.isLoading()).toBe(true);
    });

    it('forwards error from source subscription', () => {
      query.id = 'test-query';
      query.source = 'test-source';
      (query as any)._subscribeToSourceData('test-source');

      // Simulate source emitting error
      dispatchDataError('test-source', new Error('test error'));

      expect(query.getError()).toBeInstanceOf(Error);
      expect(query.getError()!.message).toBe('test error');
      expect(query.isLoading()).toBe(false);
    });
  });

  describe('reload', () => {
    it('reloads from cached data when in source mode', () => {
      query.id = 'test-query';
      query.source = 'test-source';
      query.orderBy = 'value:desc';

      // Pre-populate cache
      dispatchDataLoaded('test-source', [
        { name: 'A', value: 10 },
        { name: 'B', value: 30 },
      ]);

      (query as any)._subscribeToSourceData('test-source');
      const data1 = query.getData() as Record<string, unknown>[];
      expect(data1[0].name).toBe('B');

      // Change data in cache and reload
      dispatchDataLoaded('test-source', [
        { name: 'C', value: 50 },
        { name: 'D', value: 5 },
      ]);

      query.reload();

      const data2 = query.getData() as Record<string, unknown>[];
      expect(data2[0].name).toBe('C');
      expect(data2[0].value).toBe(50);
    });

    it('does nothing when no cached data', () => {
      query.id = 'test-query';
      query.source = 'non-existent-source';
      clearDataCache('non-existent-source');

      // Should not throw
      query.reload();
      expect(query.getData()).toEqual([]);
    });

  });

  describe('_handleSourceData error handling', () => {
    it('catches errors in processing and dispatches error event', () => {
      query.id = 'test-query';
      query.source = 'test-source';

      // Force an error by setting invalid groupBy with bad data
      query.groupBy = 'field';
      query.aggregate = 'bad:invalid';
      (query as any)._rawData = [{ field: 'A' }];

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Even with bad aggregate function, it should catch gracefully
      (query as any)._handleSourceData();
      expect(query.isLoading()).toBe(false);

      errorSpy.mockRestore();
    });
  });

  describe('_initialize edge cases', () => {
    it('warns when no id', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      query.source = 'test-source';
      (query as any)._initialize();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('attribut "id" requis'));
      warnSpy.mockRestore();
    });

    it('warns when no source attribute', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      query.id = 'test-query';
      query.source = '';
      (query as any)._initialize();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('attribut "source" requis'));
      warnSpy.mockRestore();
    });

    it('does not initialize without source', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      query.id = 'test-query';
      query.source = '';
      (query as any)._initialize();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('attribut "source" requis'));
      expect((query as any)._unsubscribe).toBeNull();
      warnSpy.mockRestore();
    });

    it('deprecated properties (apiType, baseUrl, etc.) do not exist on element', () => {
      expect('apiType' in query).toBe(false);
      expect('baseUrl' in query).toBe(false);
      expect('datasetId' in query).toBe(false);
      expect('resource' in query).toBe(false);
      expect('select' in query).toBe(false);
      expect('headers' in query).toBe(false);
    });

    it('unsubscribes commands on re-initialization', () => {
      query.id = 'test-query';
      query.source = 'test-source';
      query.serverSide = true;
      (query as any)._initialize();
      const oldCmdUnsub = (query as any)._unsubscribeCommands;
      expect(oldCmdUnsub).toBeTypeOf('function');

      // Re-initialize
      (query as any)._initialize();
      // Should have new command listener
      expect((query as any)._unsubscribeCommands).toBeTypeOf('function');
    });
  });

  describe('Additional filter operators', () => {
    it('matches gte (greater than or equal)', () => {
      const filter = { field: 'score', operator: 'gte', value: 80 };
      expect((query as any)._matchesFilter({ score: 80 }, filter)).toBe(true);
      expect((query as any)._matchesFilter({ score: 79 }, filter)).toBe(false);
    });

    it('matches lt (less than)', () => {
      const filter = { field: 'score', operator: 'lt', value: 50 };
      expect((query as any)._matchesFilter({ score: 49 }, filter)).toBe(true);
      expect((query as any)._matchesFilter({ score: 50 }, filter)).toBe(false);
    });

    it('matches notcontains', () => {
      const filter = { field: 'desc', operator: 'notcontains', value: 'test' };
      expect((query as any)._matchesFilter({ desc: 'hello world' }, filter)).toBe(true);
      expect((query as any)._matchesFilter({ desc: 'hello test world' }, filter)).toBe(false);
    });

    it('matches notin', () => {
      const filter = { field: 'region', operator: 'notin', value: ['IDF', 'PACA'] };
      expect((query as any)._matchesFilter({ region: 'ARA' }, filter)).toBe(true);
      expect((query as any)._matchesFilter({ region: 'IDF' }, filter)).toBe(false);
    });

    it('matches isnull', () => {
      const filter = { field: 'name', operator: 'isnull' };
      expect((query as any)._matchesFilter({ name: null }, filter)).toBe(true);
      expect((query as any)._matchesFilter({}, filter)).toBe(true);
      expect((query as any)._matchesFilter({ name: 'hello' }, filter)).toBe(false);
    });

    it('unknown operator returns true', () => {
      const filter = { field: 'x', operator: 'unknown', value: 1 };
      expect((query as any)._matchesFilter({ x: 999 }, filter)).toBe(true);
    });
  });

  describe('Aggregation edge cases', () => {
    it('returns 0 for avg of empty values', () => {
      const agg = { field: 'val', function: 'avg' };
      expect((query as any)._computeAggregate([], agg)).toBe(0);
    });

    it('returns 0 for min of empty values', () => {
      const agg = { field: 'val', function: 'min' };
      expect((query as any)._computeAggregate([], agg)).toBe(0);
    });

    it('returns 0 for max of empty values', () => {
      const agg = { field: 'val', function: 'max' };
      expect((query as any)._computeAggregate([], agg)).toBe(0);
    });

    it('returns 0 for unknown function', () => {
      const agg = { field: 'val', function: 'median' };
      expect((query as any)._computeAggregate([{ val: 10 }], agg)).toBe(0);
    });

    it('returns empty for empty aggregate expression', () => {
      expect((query as any)._parseAggregates('')).toEqual([]);
    });
  });
});
