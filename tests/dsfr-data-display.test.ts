import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DsfrDataDisplay } from '@/components/dsfr-data-display.js';
import {
  clearDataCache,
  dispatchDataLoaded,
  dispatchDataLoading,
  dispatchDataError,
  setDataMeta,
  clearDataMeta,
} from '@/utils/data-bridge.js';

describe('DsfrDataDisplay', () => {
  let display: DsfrDataDisplay;

  beforeEach(() => {
    clearDataCache('test-display-src');
    clearDataMeta('test-display-src');
    display = new DsfrDataDisplay();
  });

  afterEach(() => {
    if (display.isConnected) {
      display.disconnectedCallback();
    }
  });

  describe('_resolveExpression', () => {
    const item = { nom: 'Test', score: 42, nested: { val: 'deep' } };

    it('resolves simple field', () => {
      expect((display as any)._resolveExpression(item, 'nom', 0)).toBe('Test');
    });

    it('resolves numeric field as string', () => {
      expect((display as any)._resolveExpression(item, 'score', 0)).toBe('42');
    });

    it('resolves nested field via dot notation', () => {
      expect((display as any)._resolveExpression(item, 'nested.val', 0)).toBe('deep');
    });

    it('resolves $index', () => {
      expect((display as any)._resolveExpression(item, '$index', 5)).toBe('5');
    });

    it('returns default when field is missing', () => {
      expect((display as any)._resolveExpression(item, 'missing|N/A', 0)).toBe('N/A');
    });

    it('returns empty string when field is missing and no default', () => {
      expect((display as any)._resolveExpression(item, 'missing', 0)).toBe('');
    });

    it('returns field value over default when field exists', () => {
      expect((display as any)._resolveExpression(item, 'nom|fallback', 0)).toBe('Test');
    });

    it('returns default when field is null', () => {
      const itemWithNull = { val: null };
      expect((display as any)._resolveExpression(itemWithNull, 'val|defaut', 0)).toBe('defaut');
    });
  });

  describe('_formatValue', () => {
    it('formats integer with thousand separators', () => {
      const result = (display as any)._formatValue(32073247, 'number');
      // French locale uses narrow no-break space (U+202F) or non-breaking space as group separator
      expect(result.replace(/\s/g, ' ')).toBe('32 073 247');
    });

    it('formats float with thousand separators and decimal', () => {
      const result = (display as any)._formatValue(1234567.89, 'number');
      expect(result.replace(/\s/g, ' ')).toMatch(/1 234 567/);
    });

    it('formats string that looks like a number', () => {
      const result = (display as any)._formatValue('5000', 'number');
      expect(result.replace(/\s/g, ' ')).toBe('5 000');
    });

    it('returns string as-is for non-numeric value', () => {
      expect((display as any)._formatValue('hello', 'number')).toBe('hello');
    });

    it('returns string for unknown format', () => {
      expect((display as any)._formatValue(42, 'unknown')).toBe('42');
    });

    it('formats zero', () => {
      expect((display as any)._formatValue(0, 'number')).toBe('0');
    });

    it('formats negative number', () => {
      const result = (display as any)._formatValue(-12345, 'number');
      // Normalize all whitespace to regular space for comparison
      const normalized = result.replace(/\s/g, ' ');
      expect(normalized).toContain('12 345');
      expect(normalized.startsWith('-')).toBe(true);
    });
  });

  describe('_resolveExpression with format', () => {
    const item = { montant: 32073247, nom: 'Test', empty: null };

    it('formats field with :number', () => {
      const result = (display as any)._resolveExpression(item, 'montant:number', 0);
      expect(result.replace(/\s/g, ' ')).toBe('32 073 247');
    });

    it('returns default when field is null with format', () => {
      expect((display as any)._resolveExpression(item, 'empty:number|0', 0)).toBe('0');
    });

    it('returns default when field is missing with format', () => {
      expect((display as any)._resolveExpression(item, 'absent:number|N/A', 0)).toBe('N/A');
    });

    it('does not apply format to non-format fields', () => {
      expect((display as any)._resolveExpression(item, 'nom', 0)).toBe('Test');
    });
  });

  describe('_renderItem', () => {
    const item = { nom: 'Site A', score: 85 };

    it('returns empty string when no template', () => {
      expect((display as any)._renderItem(item, 0)).toBe('');
    });

    it('replaces double-brace placeholders with escaped values', () => {
      (display as any)._templateContent = '<p>{{nom}}: {{score}}</p>';
      const result = (display as any)._renderItem(item, 0);
      expect(result).toBe('<p>Site A: 85</p>');
    });

    it('escapes HTML in double-brace placeholders', () => {
      const dangerousItem = { nom: '<script>alert("xss")</script>' };
      (display as any)._templateContent = '<p>{{nom}}</p>';
      const result = (display as any)._renderItem(dangerousItem, 0);
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('does NOT escape HTML in triple-brace placeholders', () => {
      const htmlItem = { content: '<strong>bold</strong>' };
      (display as any)._templateContent = '<p>{{{content}}}</p>';
      const result = (display as any)._renderItem(htmlItem, 0);
      expect(result).toContain('<strong>bold</strong>');
    });

    it('replaces $index placeholder', () => {
      (display as any)._templateContent = '<p>#{{$index}}</p>';
      const result = (display as any)._renderItem(item, 3);
      expect(result).toBe('<p>#3</p>');
    });

    it('uses default value when field is missing', () => {
      (display as any)._templateContent = '<p>{{missing|N/A}}</p>';
      const result = (display as any)._renderItem(item, 0);
      expect(result).toBe('<p>N/A</p>');
    });

    it('formats number with :number in template', () => {
      const numItem = { montant: 1234567 };
      (display as any)._templateContent = '<p>{{montant:number}} EUR</p>';
      const result = (display as any)._renderItem(numItem, 0);
      expect(result.replace(/\s/g, ' ')).toContain('1 234 567 EUR');
    });
  });

  describe('onSourceData', () => {
    it('stores array data', () => {
      display.onSourceData([{ a: 1 }, { b: 2 }]);
      expect((display as any)._data).toEqual([{ a: 1 }, { b: 2 }]);
    });

    it('stores empty array for non-array data', () => {
      display.onSourceData({ a: 1 });
      expect((display as any)._data).toEqual([]);
    });

    it('resets page to 1 (no server meta)', () => {
      (display as any)._currentPage = 3;
      display.source = '';
      display.onSourceData([{ a: 1 }]);
      expect((display as any)._currentPage).toBe(1);
    });
  });

  describe('pagination', () => {
    beforeEach(() => {
      const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      display.onSourceData(items);
    });

    it('returns all data when pagination is 0', () => {
      display.pagination = 0;
      expect((display as any)._getPaginatedData()).toHaveLength(25);
    });

    it('returns first page with correct size', () => {
      display.pagination = 10;
      expect((display as any)._getPaginatedData()).toHaveLength(10);
      expect((display as any)._getPaginatedData()[0]).toEqual({ id: 0 });
    });

    it('returns second page', () => {
      display.pagination = 10;
      (display as any)._currentPage = 2;
      const page = (display as any)._getPaginatedData();
      expect(page).toHaveLength(10);
      expect(page[0]).toEqual({ id: 10 });
    });

    it('returns last page with remainder', () => {
      display.pagination = 10;
      (display as any)._currentPage = 3;
      const page = (display as any)._getPaginatedData();
      expect(page).toHaveLength(5);
      expect(page[0]).toEqual({ id: 20 });
    });

    it('computes total pages correctly', () => {
      display.pagination = 10;
      expect((display as any)._getTotalPages()).toBe(3);
    });

    it('returns 1 total page when pagination disabled', () => {
      display.pagination = 0;
      expect((display as any)._getTotalPages()).toBe(1);
    });
  });

  describe('_getColClass', () => {
    it('returns fr-col-12 for cols=1', () => {
      display.cols = 1;
      expect((display as any)._getColClass()).toBe('fr-col-12 fr-col-md-12');
    });

    it('returns fr-col-md-4 for cols=3', () => {
      display.cols = 3;
      expect((display as any)._getColClass()).toBe('fr-col-12 fr-col-md-4');
    });

    it('returns fr-col-md-2 for cols=6', () => {
      display.cols = 6;
      expect((display as any)._getColClass()).toBe('fr-col-12 fr-col-md-2');
    });

    it('clamps cols to 1 minimum', () => {
      display.cols = 0;
      expect((display as any)._getColClass()).toBe('fr-col-12 fr-col-md-12');
    });

    it('clamps cols to 6 maximum', () => {
      display.cols = 12;
      expect((display as any)._getColClass()).toBe('fr-col-12 fr-col-md-2');
    });
  });

  describe('_getItemUid', () => {
    it('returns item-{index} when no uid-field set', () => {
      display.uidField = '';
      const uid = (display as any)._getItemUid({ id: 42 }, 3);
      expect(uid).toBe('item-3');
    });

    it('uses uid-field value when set', () => {
      display.uidField = 'id';
      const uid = (display as any)._getItemUid({ id: 42 }, 3);
      expect(uid).toBe('item-42');
    });

    it('falls back to index when uid-field value is null', () => {
      display.uidField = 'id';
      const uid = (display as any)._getItemUid({ id: null }, 3);
      expect(uid).toBe('item-3');
    });

    it('falls back to index when uid-field value is empty', () => {
      display.uidField = 'id';
      const uid = (display as any)._getItemUid({ id: '' }, 3);
      expect(uid).toBe('item-3');
    });

    it('sanitizes special characters in uid value', () => {
      display.uidField = 'code';
      const uid = (display as any)._getItemUid({ code: 'FR/IDF 75' }, 0);
      expect(uid).toBe('item-FR_IDF_75');
    });

    it('supports nested field paths', () => {
      display.uidField = 'meta.uid';
      const uid = (display as any)._getItemUid({ meta: { uid: 'abc123' } }, 0);
      expect(uid).toBe('item-abc123');
    });

    it('preserves hyphens and underscores', () => {
      display.uidField = 'slug';
      const uid = (display as any)._getItemUid({ slug: 'my-item_01' }, 0);
      expect(uid).toBe('item-my-item_01');
    });
  });

  describe('$uid template variable', () => {
    it('resolves $uid in template', () => {
      display.uidField = 'id';
      (display as any)._templateContent = '<a href="#{{$uid}}">Link</a>';
      const result = (display as any)._renderItem({ id: 42, nom: 'Test' }, 0);
      expect(result).toContain('href="#item-42"');
    });

    it('resolves $uid with index fallback', () => {
      display.uidField = '';
      (display as any)._templateContent = '<span>{{$uid}}</span>';
      const result = (display as any)._renderItem({ nom: 'Test' }, 5);
      expect(result).toContain('item-5');
    });
  });

  describe('server pagination', () => {
    it('detects server pagination when meta is present', () => {
      display.source = 'test-display-src';
      setDataMeta('test-display-src', { page: 1, pageSize: 20, total: 100 });
      display.onSourceData(Array.from({ length: 20 }, (_, i) => ({ id: i })));

      expect((display as any)._serverPagination).toBe(true);
      expect((display as any)._serverTotal).toBe(100);
      expect((display as any)._serverPageSize).toBe(20);
    });

    it('uses meta.page as current page (does not reset to 1)', () => {
      display.source = 'test-display-src';
      setDataMeta('test-display-src', { page: 3, pageSize: 20, total: 100 });
      display.onSourceData(Array.from({ length: 20 }, (_, i) => ({ id: i })));

      expect((display as any)._currentPage).toBe(3);
    });

    it('returns all data (no client slicing) in server mode', () => {
      display.source = 'test-display-src';
      display.pagination = 10;
      setDataMeta('test-display-src', { page: 1, pageSize: 20, total: 100 });
      display.onSourceData(Array.from({ length: 20 }, (_, i) => ({ id: i })));

      // In server mode, should return all 20 items (the full page from server)
      expect((display as any)._getPaginatedData()).toHaveLength(20);
    });

    it('computes total pages from server meta', () => {
      display.source = 'test-display-src';
      display.pagination = 10;
      setDataMeta('test-display-src', { page: 1, pageSize: 20, total: 100 });
      display.onSourceData(Array.from({ length: 20 }, (_, i) => ({ id: i })));

      expect((display as any)._getTotalPages()).toBe(5);
    });

    it('falls back to client mode when no meta', () => {
      display.source = 'test-display-src';
      display.pagination = 10;
      display.onSourceData(Array.from({ length: 25 }, (_, i) => ({ id: i })));

      expect((display as any)._serverPagination).toBe(false);
      expect((display as any)._getTotalPages()).toBe(3);
      expect((display as any)._getPaginatedData()).toHaveLength(10);
    });
  });

  describe('Data integration via data-bridge', () => {
    it('receives data from source via subscription', () => {
      display.source = 'test-display-src';
      display.connectedCallback();

      dispatchDataLoaded('test-display-src', [{ nom: 'A' }, { nom: 'B' }]);

      expect((display as any)._sourceData).toEqual([{ nom: 'A' }, { nom: 'B' }]);
      expect((display as any)._data).toEqual([{ nom: 'A' }, { nom: 'B' }]);
    });

    it('picks up cached data on connect', () => {
      dispatchDataLoaded('test-display-src', [{ nom: 'cached' }]);

      display.source = 'test-display-src';
      display.connectedCallback();

      expect((display as any)._data).toEqual([{ nom: 'cached' }]);
    });

    it('tracks loading state', () => {
      display.source = 'test-display-src';
      display.connectedCallback();

      dispatchDataLoading('test-display-src');
      expect((display as any)._sourceLoading).toBe(true);

      dispatchDataLoaded('test-display-src', [{ nom: 'done' }]);
      expect((display as any)._sourceLoading).toBe(false);
    });

    it('tracks error state', () => {
      display.source = 'test-display-src';
      display.connectedCallback();

      const error = new Error('Network failure');
      dispatchDataError('test-display-src', error);
      expect((display as any)._sourceError).toEqual(error);
      expect((display as any)._sourceLoading).toBe(false);
    });
  });

  describe('URL sync for pagination', () => {
    let urlDisplay: DsfrDataDisplay;

    beforeEach(() => {
      clearDataCache('test-url-disp');
      clearDataMeta('test-url-disp');
      window.history.replaceState(null, '', window.location.pathname);
      urlDisplay = new DsfrDataDisplay();
      urlDisplay.urlSync = true;
      urlDisplay.urlPageParam = 'page';
      urlDisplay.source = 'test-url-disp';
      urlDisplay.pagination = 10;
    });

    afterEach(() => {
      if ((urlDisplay as any)._popstateHandler) {
        urlDisplay.disconnectedCallback();
      }
      window.history.replaceState(null, '', window.location.pathname);
    });

    it('reads page from URL on connectedCallback', () => {
      window.history.replaceState(null, '', '?page=3');
      urlDisplay.connectedCallback();
      expect((urlDisplay as any)._currentPage).toBe(3);
    });

    it('syncs page to URL on _handlePageChange', () => {
      urlDisplay.connectedCallback();
      urlDisplay.onSourceData(Array.from({ length: 50 }, (_, i) => ({ id: i })));
      (urlDisplay as any)._handlePageChange(4);
      const params = new URLSearchParams(window.location.search);
      expect(params.get('page')).toBe('4');
    });

    it('removes page param when page is 1', () => {
      window.history.replaceState(null, '', '?page=3');
      urlDisplay.connectedCallback();
      (urlDisplay as any)._handlePageChange(1);
      const params = new URLSearchParams(window.location.search);
      expect(params.has('page')).toBe(false);
    });

    it('preserves other URL params', () => {
      window.history.replaceState(null, '', '?region=IDF&page=2');
      urlDisplay.connectedCallback();
      (urlDisplay as any)._handlePageChange(5);
      const params = new URLSearchParams(window.location.search);
      expect(params.get('region')).toBe('IDF');
      expect(params.get('page')).toBe('5');
    });

    it('uses custom url-page-param', () => {
      urlDisplay.urlPageParam = 'p';
      window.history.replaceState(null, '', '?p=7');
      urlDisplay.connectedCallback();
      expect((urlDisplay as any)._currentPage).toBe(7);
    });

    it('does not sync URL when urlSync is false', () => {
      urlDisplay.urlSync = false;
      urlDisplay.connectedCallback();
      urlDisplay.onSourceData(Array.from({ length: 50 }, (_, i) => ({ id: i })));
      (urlDisplay as any)._handlePageChange(3);
      const params = new URLSearchParams(window.location.search);
      expect(params.has('page')).toBe(false);
    });

    it('handles popstate event', () => {
      urlDisplay.connectedCallback();
      urlDisplay.onSourceData(Array.from({ length: 50 }, (_, i) => ({ id: i })));
      window.history.replaceState(null, '', '?page=4');
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect((urlDisplay as any)._currentPage).toBe(4);
    });

    it('cleans up popstate listener on disconnect', () => {
      urlDisplay.connectedCallback();
      expect((urlDisplay as any)._popstateHandler).not.toBeNull();
      urlDisplay.disconnectedCallback();
      expect((urlDisplay as any)._popstateHandler).toBeNull();
    });

    it('ignores invalid page values in URL', () => {
      window.history.replaceState(null, '', '?page=abc');
      urlDisplay.connectedCallback();
      expect((urlDisplay as any)._currentPage).toBe(1);
    });
  });
});
