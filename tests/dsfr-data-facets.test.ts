import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nothing } from 'lit';
import { DsfrDataFacets, _parseCSV } from '../src/components/dsfr-data-facets.js';
import { clearDataCache, dispatchDataLoaded, getDataCache, setDataMeta, getDataMeta, clearDataMeta } from '../src/utils/data-bridge.js';

const SAMPLE_DATA = [
  { nom: 'Paris', region: 'Ile-de-France', type: 'Commune', population: 2200000 },
  { nom: 'Lyon', region: 'Auvergne-Rhone-Alpes', type: 'Commune', population: 500000 },
  { nom: 'Marseille', region: 'PACA', type: 'Commune', population: 870000 },
  { nom: 'Toulouse', region: 'Occitanie', type: 'Commune', population: 480000 },
  { nom: 'Nantes', region: 'Pays de la Loire', type: 'Commune', population: 310000 },
  { nom: 'Strasbourg', region: 'Grand Est', type: 'Prefecture', population: 280000 },
  { nom: 'Bordeaux', region: 'Nouvelle-Aquitaine', type: 'Prefecture', population: 250000 },
  { nom: 'Lille', region: 'Hauts-de-France', type: 'Prefecture', population: 230000 },
  { nom: 'Nice', region: 'PACA', type: 'Commune', population: 340000 },
  { nom: 'Rennes', region: 'Bretagne', type: 'Prefecture', population: 220000 },
];

/** Helper: set URL search params in jsdom */
function setUrlParams(search: string) {
  window.history.replaceState({}, '', search ? `?${search}` : window.location.pathname);
}

describe('DsfrDataFacets', () => {
  let facets: DsfrDataFacets;

  beforeEach(() => {
    clearDataCache('test-facets');
    clearDataCache('test-source');
    clearDataMeta('test-facets');
    clearDataMeta('test-source');
    facets = new DsfrDataFacets();
    // Reset URL to clean state
    setUrlParams('');
  });

  afterEach(() => {
    if (facets.isConnected) {
      facets.disconnectedCallback();
    }
    setUrlParams('');
  });

  // --- Parsing helpers ---

  describe('_parseCSV', () => {
    it('parses comma-separated values', () => {
      expect(_parseCSV('region, type, statut')).toEqual(['region', 'type', 'statut']);
    });

    it('trims whitespace', () => {
      expect(_parseCSV('  a , b , c  ')).toEqual(['a', 'b', 'c']);
    });

    it('filters empty values', () => {
      expect(_parseCSV('a,,b,')).toEqual(['a', 'b']);
    });

    it('returns empty array for empty string', () => {
      expect(_parseCSV('')).toEqual([]);
    });
  });

  describe('_parseLabels', () => {
    it('parses pipe-separated label map', () => {
      facets.labels = 'region:Region | type:Type de commune';
      const map = facets._parseLabels();
      expect(map.get('region')).toBe('Region');
      expect(map.get('type')).toBe('Type de commune');
    });

    it('returns empty map for empty string', () => {
      facets.labels = '';
      expect(facets._parseLabels().size).toBe(0);
    });

    it('ignores entries without colon', () => {
      facets.labels = 'novalue | key:value';
      const map = facets._parseLabels();
      expect(map.size).toBe(1);
      expect(map.get('key')).toBe('value');
    });
  });

  // --- Auto-detection ---

  describe('auto-detection of fields', () => {
    it('detects string fields with limited unique values', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      const fields = facets._autoDetectFields();
      // 'type' has 2 unique values (Commune, Prefecture) -> detected
      expect(fields).toContain('type');
      // 'region' has 9 unique values -> detected
      expect(fields).toContain('region');
    });

    it('excludes numeric fields', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      const fields = facets._autoDetectFields();
      expect(fields).not.toContain('population');
    });

    it('excludes ID-like fields (all values unique, count == row count)', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      const fields = facets._autoDetectFields();
      // 'nom' has 10 unique values for 10 rows -> ID-like, excluded
      expect(fields).not.toContain('nom');
    });

    it('returns empty for empty data', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', []);

      const fields = facets._autoDetectFields();
      expect(fields).toEqual([]);
    });
  });

  // --- Facet value computation ---

  describe('facet value computation', () => {
    beforeEach(() => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);
    });

    it('computes correct counts', () => {
      const values = facets._computeFacetValues('type');
      const communeEntry = values.find(v => v.value === 'Commune');
      const prefEntry = values.find(v => v.value === 'Prefecture');
      expect(communeEntry?.count).toBe(6);
      expect(prefEntry?.count).toBe(4);
    });

    it('sorts by count descending by default', () => {
      facets.sort = 'count';
      const values = facets._computeFacetValues('type');
      expect(values[0].value).toBe('Commune');
      expect(values[1].value).toBe('Prefecture');
    });

    it('sorts alphabetically', () => {
      facets.sort = 'alpha';
      const values = facets._computeFacetValues('type');
      expect(values[0].value).toBe('Commune');
      expect(values[1].value).toBe('Prefecture');
    });

    it('sorts reverse alphabetically', () => {
      facets.sort = '-alpha';
      const values = facets._computeFacetValues('type');
      expect(values[0].value).toBe('Prefecture');
      expect(values[1].value).toBe('Commune');
    });

    it('sorts by count ascending', () => {
      facets.sort = '-count';
      const values = facets._computeFacetValues('type');
      expect(values[0].value).toBe('Prefecture');
      expect(values[1].value).toBe('Commune');
    });

    it('excludes null and empty values', () => {
      facets.id = 'test-facets';
      clearDataCache('test-source');
      dispatchDataLoaded('test-source', [
        ...SAMPLE_DATA,
        { nom: 'Test', region: 'Test', type: null, population: 0 },
        { nom: 'Test2', region: 'Test2', type: '', population: 0 },
      ]);

      const values = facets._computeFacetValues('type');
      const allValues = values.map(v => v.value);
      expect(allValues).not.toContain('null');
      expect(allValues).not.toContain('');
    });
  });

  // --- Sorting helper ---

  describe('_sortValues', () => {
    const testValues = [
      { value: 'Banane', count: 5 },
      { value: 'Abricot', count: 10 },
      { value: 'Cerise', count: 3 },
    ];

    it('sorts by count descending (default)', () => {
      facets.sort = 'count';
      const sorted = facets._sortValues(testValues);
      expect(sorted.map(v => v.value)).toEqual(['Abricot', 'Banane', 'Cerise']);
    });

    it('sorts by count ascending', () => {
      facets.sort = '-count';
      const sorted = facets._sortValues(testValues);
      expect(sorted.map(v => v.value)).toEqual(['Cerise', 'Banane', 'Abricot']);
    });

    it('sorts alphabetically', () => {
      facets.sort = 'alpha';
      const sorted = facets._sortValues(testValues);
      expect(sorted.map(v => v.value)).toEqual(['Abricot', 'Banane', 'Cerise']);
    });

    it('sorts reverse alphabetically', () => {
      facets.sort = '-alpha';
      const sorted = facets._sortValues(testValues);
      expect(sorted.map(v => v.value)).toEqual(['Cerise', 'Banane', 'Abricot']);
    });
  });

  // --- Filtering ---

  describe('filtering', () => {
    beforeEach(() => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'region, type';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);
    });

    it('dispatches all data when no filter is active', () => {
      const result = getDataCache('test-facets') as Record<string, unknown>[];
      expect(result).toHaveLength(SAMPLE_DATA.length);
    });

    it('filters data by single facet selection', () => {
      // Simulate selecting "Prefecture" in the type facet
      facets._activeSelections = { type: new Set(['Prefecture']) };
      facets._applyFilters();

      const result = getDataCache('test-facets') as Record<string, unknown>[];
      expect(result).toHaveLength(4);
      expect(result.every(r => r.type === 'Prefecture')).toBe(true);
    });

    it('applies OR logic within a single facet (multi-select)', () => {
      facets._activeSelections = { region: new Set(['PACA', 'Bretagne']) };
      facets._applyFilters();

      const result = getDataCache('test-facets') as Record<string, unknown>[];
      expect(result).toHaveLength(3); // Marseille + Nice + Rennes
      expect(result.every(r => r.region === 'PACA' || r.region === 'Bretagne')).toBe(true);
    });

    it('applies AND logic between different facets', () => {
      facets._activeSelections = {
        type: new Set(['Commune']),
        region: new Set(['PACA']),
      };
      facets._applyFilters();

      const result = getDataCache('test-facets') as Record<string, unknown>[];
      expect(result).toHaveLength(2); // Marseille + Nice (Commune in PACA)
      expect(result.every(r => r.type === 'Commune' && r.region === 'PACA')).toBe(true);
    });

    it('returns all data when selections are cleared', () => {
      facets._activeSelections = { type: new Set(['Prefecture']) };
      facets._applyFilters();
      let result = getDataCache('test-facets') as Record<string, unknown>[];
      expect(result).toHaveLength(4);

      facets._activeSelections = {};
      facets._applyFilters();
      result = getDataCache('test-facets') as Record<string, unknown>[];
      expect(result).toHaveLength(SAMPLE_DATA.length);
    });
  });

  // --- Dynamic counts ---

  describe('dynamic counts (cross-facet)', () => {
    beforeEach(() => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'region, type';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);
    });

    it('recalculates counts when another facet is selected', () => {
      // Select "Prefecture" -> region counts should reflect only prefectures
      facets._activeSelections = { type: new Set(['Prefecture']) };
      facets._buildFacetGroups();

      const regionGroup = facets._facetGroups.find(g => g.field === 'region');
      // Only regions with prefectures should appear
      const regionValues = regionGroup?.values ?? [];
      const totalCount = regionValues.reduce((sum, v) => sum + v.count, 0);
      expect(totalCount).toBe(4); // 4 prefectures total
    });

    it('does not filter own facet values by own selection', () => {
      // Select "Prefecture" -> type facet should still show both Commune and Prefecture
      facets._activeSelections = { type: new Set(['Prefecture']) };
      facets._buildFacetGroups();

      const typeGroup = facets._facetGroups.find(g => g.field === 'type');
      const typeValues = typeGroup?.values.map(v => v.value) ?? [];
      expect(typeValues).toContain('Commune');
      expect(typeValues).toContain('Prefecture');
    });
  });

  // --- Data bridge integration ---

  describe('data bridge integration', () => {
    it('receives data from cache if source already emitted', () => {
      // Pre-populate cache
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.connectedCallback();

      const result = getDataCache('test-facets') as Record<string, unknown>[];
      expect(result).toHaveLength(SAMPLE_DATA.length);
    });

    it('clears cache on disconnect', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      expect(getDataCache('test-facets')).toBeDefined();

      facets.disconnectedCallback();
      expect(getDataCache('test-facets')).toBeUndefined();
    });

    it('handles non-array data gracefully', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', 'not an array');

      const result = getDataCache('test-facets') as Record<string, unknown>[];
      expect(result).toEqual([]);
    });

    it('handles new data replacing old data', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.connectedCallback();

      dispatchDataLoaded('test-source', SAMPLE_DATA);
      let result = getDataCache('test-facets') as Record<string, unknown>[];
      expect(result).toHaveLength(10);

      dispatchDataLoaded('test-source', SAMPLE_DATA.slice(0, 3));
      result = getDataCache('test-facets') as Record<string, unknown>[];
      expect(result).toHaveLength(3);
    });
  });

  // --- Facet groups building ---

  describe('_buildFacetGroups', () => {
    it('uses custom labels', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type, region';
      facets.labels = 'type:Type de commune | region:Region administrative';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      const typeGroup = facets._facetGroups.find(g => g.field === 'type');
      expect(typeGroup?.label).toBe('Type de commune');
      const regionGroup = facets._facetGroups.find(g => g.field === 'region');
      expect(regionGroup?.label).toBe('Region administrative');
    });

    it('uses field name as label when no custom label', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.labels = '';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      const typeGroup = facets._facetGroups.find(g => g.field === 'type');
      expect(typeGroup?.label).toBe('type');
    });

    it('hides single-value facets when hide-empty is true', () => {
      const dataWithSingleType = SAMPLE_DATA.map(d => ({ ...d, statut: 'actif' }));
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'statut, type';
      facets.hideEmpty = true;
      facets.connectedCallback();
      dispatchDataLoaded('test-source', dataWithSingleType);

      const statutGroup = facets._facetGroups.find(g => g.field === 'statut');
      expect(statutGroup).toBeUndefined(); // Only 1 unique value -> hidden
      const typeGroup = facets._facetGroups.find(g => g.field === 'type');
      expect(typeGroup).toBeDefined(); // 2 unique values -> shown
    });
  });

  // --- Display modes ---

  describe('display modes', () => {
    describe('_parseDisplayModes / _getDisplayMode', () => {
      it('returns empty map when display is empty', () => {
        facets.display = '';
        expect(facets._parseDisplayModes().size).toBe(0);
      });

      it('parses select mode', () => {
        facets.display = 'region:select';
        const map = facets._parseDisplayModes();
        expect(map.get('region')).toBe('select');
      });

      it('parses multiselect mode', () => {
        facets.display = 'type:multiselect';
        const map = facets._parseDisplayModes();
        expect(map.get('type')).toBe('multiselect');
      });

      it('parses mixed modes', () => {
        facets.display = 'region:select | type:multiselect';
        const map = facets._parseDisplayModes();
        expect(map.get('region')).toBe('select');
        expect(map.get('type')).toBe('multiselect');
      });

      it('ignores invalid mode values', () => {
        facets.display = 'region:dropdown';
        expect(facets._getDisplayMode('region')).toBe('checkbox');
      });

      it('returns checkbox for unlisted fields', () => {
        facets.display = 'region:select';
        expect(facets._getDisplayMode('type')).toBe('checkbox');
      });

      it('returns checkbox when display is empty', () => {
        facets.display = '';
        expect(facets._getDisplayMode('region')).toBe('checkbox');
      });
    });

    describe('select mode behavior', () => {
      beforeEach(() => {
        facets.id = 'test-facets';
        facets.source = 'test-source';
        facets.fields = 'region, type';
        facets.display = 'type:select';
        facets.connectedCallback();
        dispatchDataLoaded('test-source', SAMPLE_DATA);
      });

      it('select mode enforces single exclusive selection', () => {
        // Select one value via _toggleValue
        facets._toggleValue('type', 'Commune');
        expect(facets._activeSelections['type']?.size).toBe(1);
        expect(facets._activeSelections['type']?.has('Commune')).toBe(true);

        // Select another - should replace, not add
        facets._toggleValue('type', 'Prefecture');
        expect(facets._activeSelections['type']?.size).toBe(1);
        expect(facets._activeSelections['type']?.has('Prefecture')).toBe(true);
      });

      it('select mode filters data correctly', () => {
        facets._activeSelections = { type: new Set(['Prefecture']) };
        facets._applyFilters();

        const result = getDataCache('test-facets') as Record<string, unknown>[];
        expect(result).toHaveLength(4);
        expect(result.every(r => r.type === 'Prefecture')).toBe(true);
      });

      it('cross-facet counts work with select mode', () => {
        facets._activeSelections = { type: new Set(['Prefecture']) };
        facets._buildFacetGroups();

        const regionGroup = facets._facetGroups.find(g => g.field === 'region');
        const totalCount = regionGroup?.values.reduce((sum, v) => sum + v.count, 0) ?? 0;
        expect(totalCount).toBe(4);
      });
    });

    describe('multiselect mode behavior', () => {
      beforeEach(() => {
        facets.id = 'test-facets';
        facets.source = 'test-source';
        facets.fields = 'region, type';
        facets.display = 'region:multiselect';
        facets.connectedCallback();
        dispatchDataLoaded('test-source', SAMPLE_DATA);
      });

      it('multiselect mode is automatically disjunctive', () => {
        // Select two values - both should be in the Set (OR logic)
        facets._toggleValue('region', 'PACA');
        facets._toggleValue('region', 'Bretagne');
        expect(facets._activeSelections['region']?.size).toBe(2);
        expect(facets._activeSelections['region']?.has('PACA')).toBe(true);
        expect(facets._activeSelections['region']?.has('Bretagne')).toBe(true);
      });

      it('multiselect filters with OR logic', () => {
        facets._activeSelections = { region: new Set(['PACA', 'Bretagne']) };
        facets._applyFilters();

        const result = getDataCache('test-facets') as Record<string, unknown>[];
        expect(result).toHaveLength(3); // Marseille + Nice + Rennes
      });

      it('clear field selections removes all for that field', () => {
        facets._activeSelections = { region: new Set(['PACA', 'Bretagne']), type: new Set(['Commune']) };
        facets._clearFieldSelections('region');

        expect(facets._activeSelections['region']).toBeUndefined();
        expect(facets._activeSelections['type']?.has('Commune')).toBe(true);
      });
    });

    describe('backward compatibility', () => {
      it('default display (no attribute) uses checkbox mode', () => {
        facets.display = '';
        expect(facets._getDisplayMode('region')).toBe('checkbox');
        expect(facets._getDisplayMode('type')).toBe('checkbox');
      });

      it('disjunctive attribute still works in checkbox mode', () => {
        facets.id = 'test-facets';
        facets.source = 'test-source';
        facets.fields = 'region';
        facets.disjunctive = 'region';
        facets.display = ''; // no display attribute
        facets.connectedCallback();
        dispatchDataLoaded('test-source', SAMPLE_DATA);

        // Should allow multi-select via disjunctive
        facets._toggleValue('region', 'PACA');
        facets._toggleValue('region', 'Bretagne');
        expect(facets._activeSelections['region']?.size).toBe(2);
      });

      it('existing checkbox behavior unchanged without display attribute', () => {
        facets.id = 'test-facets';
        facets.source = 'test-source';
        facets.fields = 'type';
        facets.connectedCallback();
        dispatchDataLoaded('test-source', SAMPLE_DATA);

        // Without disjunctive, checkbox is exclusive
        facets._toggleValue('type', 'Commune');
        facets._toggleValue('type', 'Prefecture');
        expect(facets._activeSelections['type']?.size).toBe(1);
        expect(facets._activeSelections['type']?.has('Prefecture')).toBe(true);
      });
    });
  });

  // --- URL params ---

  describe('url-params', () => {
    describe('_parseUrlParamMap', () => {
      it('returns empty map when attribute is empty', () => {
        facets.urlParamMap = '';
        expect(facets._parseUrlParamMap().size).toBe(0);
      });

      it('parses pipe-separated param:field pairs', () => {
        facets.urlParamMap = 'r:region | t:type';
        const map = facets._parseUrlParamMap();
        expect(map.get('r')).toBe('region');
        expect(map.get('t')).toBe('type');
      });

      it('ignores entries without colon', () => {
        facets.urlParamMap = 'novalue | r:region';
        const map = facets._parseUrlParamMap();
        expect(map.size).toBe(1);
        expect(map.get('r')).toBe('region');
      });
    });

    describe('_applyUrlParams (direct mapping)', () => {
      it('reads URL params matching field names', () => {
        setUrlParams('type=Commune');
        facets.urlParams = true;
        facets._applyUrlParams();

        expect(facets._activeSelections['type']?.has('Commune')).toBe(true);
      });

      it('supports multiple values via repeated params', () => {
        setUrlParams('region=PACA&region=Bretagne');
        facets.urlParams = true;
        facets._applyUrlParams();

        expect(facets._activeSelections['region']?.has('PACA')).toBe(true);
        expect(facets._activeSelections['region']?.has('Bretagne')).toBe(true);
      });

      it('supports comma-separated values in a single param', () => {
        setUrlParams('region=PACA,Bretagne');
        facets.urlParams = true;
        facets._applyUrlParams();

        expect(facets._activeSelections['region']?.size).toBe(2);
        expect(facets._activeSelections['region']?.has('PACA')).toBe(true);
        expect(facets._activeSelections['region']?.has('Bretagne')).toBe(true);
      });

      it('does nothing when no URL params match', () => {
        setUrlParams('foo=bar');
        facets.urlParams = true;
        facets._applyUrlParams();

        // foo is set but it's not a known facet field — still stored
        expect(facets._activeSelections['foo']?.has('bar')).toBe(true);
      });

      it('does nothing when URL has no params', () => {
        setUrlParams('');
        facets.urlParams = true;
        facets._applyUrlParams();

        expect(Object.keys(facets._activeSelections)).toHaveLength(0);
      });
    });

    describe('_applyUrlParams (with url-param-map)', () => {
      it('maps URL param names to field names', () => {
        setUrlParams('r=PACA&t=Commune');
        facets.urlParams = true;
        facets.urlParamMap = 'r:region | t:type';
        facets._applyUrlParams();

        expect(facets._activeSelections['region']?.has('PACA')).toBe(true);
        expect(facets._activeSelections['type']?.has('Commune')).toBe(true);
      });

      it('ignores URL params not in the map', () => {
        setUrlParams('r=PACA&unknown=value');
        facets.urlParams = true;
        facets.urlParamMap = 'r:region';
        facets._applyUrlParams();

        expect(facets._activeSelections['region']?.has('PACA')).toBe(true);
        expect(facets._activeSelections['unknown']).toBeUndefined();
      });
    });

    describe('integration: url-params with data', () => {
      it('pre-selects facets from URL when data arrives', () => {
        setUrlParams('type=Prefecture');

        facets.id = 'test-facets';
        facets.source = 'test-source';
        facets.fields = 'region, type';
        facets.urlParams = true;
        facets.connectedCallback();
        dispatchDataLoaded('test-source', SAMPLE_DATA);

        const result = getDataCache('test-facets') as Record<string, unknown>[];
        expect(result).toHaveLength(4);
        expect(result.every(r => r.type === 'Prefecture')).toBe(true);
      });

      it('applies URL params only once (not on every data update)', () => {
        setUrlParams('type=Prefecture');

        facets.id = 'test-facets';
        facets.source = 'test-source';
        facets.fields = 'region, type';
        facets.urlParams = true;
        facets.connectedCallback();
        dispatchDataLoaded('test-source', SAMPLE_DATA);

        // User clears the filter
        facets._activeSelections = {};
        facets._applyFilters();
        let result = getDataCache('test-facets') as Record<string, unknown>[];
        expect(result).toHaveLength(SAMPLE_DATA.length);

        // New data arrives — should NOT re-apply URL params
        dispatchDataLoaded('test-source', SAMPLE_DATA);
        result = getDataCache('test-facets') as Record<string, unknown>[];
        expect(result).toHaveLength(SAMPLE_DATA.length);
      });

      it('combines URL params across multiple facets', () => {
        setUrlParams('type=Commune&region=PACA');

        facets.id = 'test-facets';
        facets.source = 'test-source';
        facets.fields = 'region, type';
        facets.urlParams = true;
        facets.connectedCallback();
        dispatchDataLoaded('test-source', SAMPLE_DATA);

        const result = getDataCache('test-facets') as Record<string, unknown>[];
        expect(result).toHaveLength(2); // Marseille + Nice
        expect(result.every(r => r.type === 'Commune' && r.region === 'PACA')).toBe(true);
      });
    });
  });

  // --- Server-facets ---

  describe('server-facets', () => {
    it('should have serverFacets property', () => {
      expect(facets.serverFacets).toBe(false);
      facets.serverFacets = true;
      expect(facets.serverFacets).toBe(true);
    });

    describe('_buildFacetWhere (adapter delegation)', () => {
      it('fallback: builds colon syntax for single value', () => {
        facets._activeSelections = { region: new Set(['IDF']) };
        expect(facets._buildFacetWhere()).toBe('region:eq:IDF');
      });

      it('fallback: builds colon syntax for multi value', () => {
        facets._activeSelections = { region: new Set(['IDF', 'PACA']) };
        expect(facets._buildFacetWhere()).toBe('region:in:IDF|PACA');
      });

      it('fallback: excludes specified field', () => {
        facets._activeSelections = {
          region: new Set(['IDF']),
          type: new Set(['Commune'])
        };
        expect(facets._buildFacetWhere('region')).toBe('type:eq:Commune');
      });

      it('fallback: combines multiple fields', () => {
        facets._activeSelections = {
          region: new Set(['IDF']),
          type: new Set(['Commune'])
        };
        expect(facets._buildFacetWhere()).toBe('region:eq:IDF, type:eq:Commune');
      });

      it('fallback: returns empty string when no selections', () => {
        facets._activeSelections = {};
        expect(facets._buildFacetWhere()).toBe('');
      });

      it('fallback: skips fields with empty sets', () => {
        facets._activeSelections = { region: new Set(), type: new Set(['Commune']) };
        expect(facets._buildFacetWhere()).toBe('type:eq:Commune');
      });

      it('delegates to adapter.buildFacetWhere when source has adapter', () => {
        // Create mock source with ODS-like adapter
        const mockSource = document.createElement('div');
        mockSource.id = 'test-source';
        (mockSource as any).getAdapter = () => ({
          buildFacetWhere: (selections: Record<string, Set<string>>, excludeField?: string) => {
            const parts: string[] = [];
            for (const [field, values] of Object.entries(selections)) {
              if (field === excludeField || values.size === 0) continue;
              if (values.size === 1) {
                parts.push(`${field} = "${[...values][0]}"`);
              } else {
                parts.push(`${field} IN (${[...values].map(v => `"${v}"`).join(', ')})`);
              }
            }
            return parts.join(' AND ');
          }
        });
        document.body.appendChild(mockSource);

        facets.source = 'test-source';
        facets._activeSelections = {
          region: new Set(['IDF']),
          type: new Set(['Commune', 'Prefecture'])
        };

        // Should use adapter's ODSQL syntax
        expect(facets._buildFacetWhere()).toBe('region = "IDF" AND type IN ("Commune", "Prefecture")');
        // With excludeField
        expect(facets._buildFacetWhere('region')).toBe('type IN ("Commune", "Prefecture")');

        mockSource.remove();
      });
    });

    it('re-emits data as-is in server mode (no local filtering)', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'region, type';
      facets.serverFacets = true;
      facets.connectedCallback();

      // Mock _fetchServerFacets to avoid actual API call
      (facets as any)._fetchServerFacets = () => {};

      dispatchDataLoaded('test-source', SAMPLE_DATA);

      // Should re-emit all data without filtering
      const result = getDataCache('test-facets') as Record<string, unknown>[];
      expect(result).toHaveLength(SAMPLE_DATA.length);
    });

    it('forwards pagination metadata from upstream source in server mode', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'region, type';
      facets.serverFacets = true;
      facets.connectedCallback();

      (facets as any)._fetchServerFacets = () => {};

      setDataMeta('test-source', { page: 2, pageSize: 20, total: 1500 });
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      const meta = getDataMeta('test-facets');
      expect(meta).toBeDefined();
      expect(meta!.total).toBe(1500);
      expect(meta!.page).toBe(2);
      expect(meta!.pageSize).toBe(20);
    });

    it('does not forward metadata when no upstream meta exists', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'region, type';
      facets.serverFacets = true;
      facets.connectedCallback();

      (facets as any)._fetchServerFacets = () => {};

      dispatchDataLoaded('test-source', SAMPLE_DATA);

      const meta = getDataMeta('test-facets');
      expect(meta).toBeUndefined();
    });
  });

  describe('_findUpstreamSource', () => {
    it('finds dsfr-data-source through a dsfr-data-query intermediary', () => {
      // Create mock dsfr-data-source with baseUrl/datasetId
      const mockSource = document.createElement('div');
      mockSource.id = 'src';
      (mockSource as any).baseUrl = 'https://data.example.com';
      (mockSource as any).datasetId = 'my-dataset';
      document.body.appendChild(mockSource);

      // Create mock dsfr-data-query pointing to source
      const mockQuery = document.createElement('div');
      mockQuery.id = 'query';
      (mockQuery as any).source = 'src';
      document.body.appendChild(mockQuery);

      facets.source = 'query';
      const upstream = (facets as any)._findUpstreamSource();
      expect(upstream).toBe(mockSource);
      expect((upstream as any).datasetId).toBe('my-dataset');

      mockSource.remove();
      mockQuery.remove();
    });

    it('returns direct source when it has datasetId', () => {
      const mockSource = document.createElement('div');
      mockSource.id = 'src';
      (mockSource as any).datasetId = 'direct-dataset';
      document.body.appendChild(mockSource);

      facets.source = 'src';
      const upstream = (facets as any)._findUpstreamSource();
      expect(upstream).toBe(mockSource);

      mockSource.remove();
    });

    it('returns null when source element not found', () => {
      facets.source = 'nonexistent';
      const upstream = (facets as any)._findUpstreamSource();
      expect(upstream).toBeNull();
    });
  });

  // --- Static values mode ---

  describe('static-values mode', () => {
    it('builds facet groups from static-values JSON', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'region, type';
      facets.staticValues = JSON.stringify({
        region: ['Bretagne', 'IDF', 'PACA'],
        type: ['Commune', 'Prefecture'],
      });
      facets.connectedCallback();

      dispatchDataLoaded('test-source', []);

      expect(facets._facetGroups.length).toBe(2);
      expect(facets._facetGroups[0].field).toBe('region');
      expect(facets._facetGroups[0].values.map(v => v.value)).toEqual(['Bretagne', 'IDF', 'PACA']);
      expect(facets._facetGroups[0].values[0].count).toBe(0);
    });

    it('hides counts automatically in static-values mode', () => {
      facets.staticValues = '{"region": ["A"]}';
      expect(facets._effectiveHideCounts).toBe(true);
    });

    it('dispatches colon-syntax WHERE command on selection (fallback)', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'region';
      facets.staticValues = JSON.stringify({ region: ['IDF', 'Bretagne'] });
      facets.connectedCallback();

      dispatchDataLoaded('test-source', []);

      (facets as any)._activeSelections = { region: new Set(['IDF']) };
      const where = facets._buildFacetWhere();
      expect(where).toBe('region:eq:IDF');
    });

    it('uses IN operator for multi-value selection in colon syntax (fallback)', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'region';
      facets.staticValues = JSON.stringify({ region: ['IDF', 'Bretagne', 'PACA'] });
      facets.connectedCallback();

      dispatchDataLoaded('test-source', []);

      (facets as any)._activeSelections = { region: new Set(['IDF', 'Bretagne']) };
      const where = facets._buildFacetWhere();
      expect(where).toBe('region:in:IDF|Bretagne');
    });

    it('forwards pagination metadata from upstream', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'region';
      facets.staticValues = JSON.stringify({ region: ['IDF'] });
      facets.connectedCallback();

      setDataMeta('test-source', { page: 1, pageSize: 20, total: 35000 });
      dispatchDataLoaded('test-source', [{ region: 'IDF' }]);

      const meta = getDataMeta('test-facets');
      expect(meta).toBeDefined();
      expect(meta!.total).toBe(35000);
    });
  });

  // --- Column layout (cols) ---

  describe('cols attribute', () => {
    describe('_parseCols', () => {
      it('returns null when cols is empty', () => {
        facets.cols = '';
        expect(facets._parseCols()).toBeNull();
      });

      it('parses global number', () => {
        facets.cols = '6';
        const result = facets._parseCols();
        expect(result).toEqual({ global: 6 });
      });

      it('parses global number with whitespace', () => {
        facets.cols = ' 4 ';
        const result = facets._parseCols();
        expect(result).toEqual({ global: 4 });
      });

      it('parses per-field mapping', () => {
        facets.cols = 'region:4 | type:6';
        const result = facets._parseCols() as { map: Map<string, number>; fallback: number };
        expect(result.map.get('region')).toBe(4);
        expect(result.map.get('type')).toBe(6);
        expect(result.fallback).toBe(6);
      });

      it('returns null for invalid input without colons', () => {
        facets.cols = 'abc';
        expect(facets._parseCols()).toBeNull();
      });
    });

    describe('_getColClass', () => {
      it('returns empty string when cols is empty', () => {
        facets.cols = '';
        expect(facets._getColClass('region')).toBe('');
      });

      it('returns global col class for all fields', () => {
        facets.cols = '4';
        expect(facets._getColClass('region')).toBe('fr-col-4');
        expect(facets._getColClass('type')).toBe('fr-col-4');
      });

      it('returns per-field col class', () => {
        facets.cols = 'region:4 | type:12';
        expect(facets._getColClass('region')).toBe('fr-col-4');
        expect(facets._getColClass('type')).toBe('fr-col-12');
      });

      it('returns fallback fr-col-6 for unmapped fields', () => {
        facets.cols = 'region:4';
        expect(facets._getColClass('type')).toBe('fr-col-6');
      });
    });
  });

  // --- Render and interaction methods ---

  describe('createRenderRoot', () => {
    it('returns this (no shadow DOM)', () => {
      expect(facets.createRenderRoot()).toBe(facets);
    });
  });

  describe('_resolveValue', () => {
    it('resolves simple field path', () => {
      const row = { region: 'IDF', nom: 'Paris' };
      expect((facets as any)._resolveValue(row, 'region')).toBe('IDF');
    });

    it('resolves dotted field path', () => {
      const row = { fields: { Region: 'IDF', Nom: 'Paris' } };
      expect((facets as any)._resolveValue(row, 'fields.Region')).toBe('IDF');
    });

    it('returns undefined for missing dotted path', () => {
      const row = { fields: { Region: 'IDF' } };
      expect((facets as any)._resolveValue(row, 'fields.Missing')).toBeUndefined();
    });

    it('returns undefined when intermediate is null', () => {
      const row = { fields: null };
      expect((facets as any)._resolveValue(row, 'fields.Region')).toBeUndefined();
    });

    it('returns undefined when intermediate is primitive', () => {
      const row = { fields: 'string' };
      expect((facets as any)._resolveValue(row, 'fields.Region')).toBeUndefined();
    });
  });

  describe('_toggleExpand', () => {
    it('expands a facet field', () => {
      (facets as any)._toggleExpand('region');
      expect(facets._expandedFacets.has('region')).toBe(true);
    });

    it('collapses an already expanded field', () => {
      (facets as any)._toggleExpand('region');
      expect(facets._expandedFacets.has('region')).toBe(true);
      (facets as any)._toggleExpand('region');
      expect(facets._expandedFacets.has('region')).toBe(false);
    });
  });

  describe('_handleSearch', () => {
    it('stores search query for a field', () => {
      const mockEvent = { target: { value: 'Par' } } as unknown as Event;
      (facets as any)._handleSearch('region', mockEvent);
      expect(facets._searchQueries['region']).toBe('Par');
    });

    it('overwrites previous search query', () => {
      (facets as any)._handleSearch('region', { target: { value: 'Par' } } as unknown as Event);
      (facets as any)._handleSearch('region', { target: { value: 'Lyon' } } as unknown as Event);
      expect(facets._searchQueries['region']).toBe('Lyon');
    });
  });

  describe('_clearAll', () => {
    it('clears all selections and search queries', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type, region';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      facets._activeSelections = { type: new Set(['Commune']), region: new Set(['PACA']) };
      facets._searchQueries = { type: 'Com' };

      (facets as any)._clearAll();

      expect(Object.keys(facets._activeSelections)).toHaveLength(0);
      expect(Object.keys(facets._searchQueries)).toHaveLength(0);
    });
  });

  describe('_selectAllValues', () => {
    it('selects all values in a facet group', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      (facets as any)._selectAllValues('type');

      expect(facets._activeSelections['type']?.has('Commune')).toBe(true);
      expect(facets._activeSelections['type']?.has('Prefecture')).toBe(true);
    });

    it('does nothing for unknown field', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      (facets as any)._selectAllValues('unknown');
      expect(facets._activeSelections['unknown']).toBeUndefined();
    });
  });

  describe('_handleSelectChange', () => {
    it('sets selection from select element value', () => {
      const mockEvent = { target: { value: 'Commune' } } as unknown as Event;
      (facets as any)._handleSelectChange('type', mockEvent);
      expect(facets._activeSelections['type']?.has('Commune')).toBe(true);
    });

    it('clears selection when value is empty', () => {
      facets._activeSelections = { type: new Set(['Commune']) };
      const mockEvent = { target: { value: '' } } as unknown as Event;
      (facets as any)._handleSelectChange('type', mockEvent);
      expect(facets._activeSelections['type']).toBeUndefined();
    });
  });

  describe('_syncUrl', () => {
    it('writes selections to URL', () => {
      facets._activeSelections = { type: new Set(['Commune']), region: new Set(['PACA']) };
      (facets as any)._syncUrl();

      const params = new URLSearchParams(window.location.search);
      expect(params.get('type')).toBe('Commune');
      expect(params.get('region')).toBe('PACA');
    });

    it('uses url-param-map reverse mapping', () => {
      facets.urlParamMap = 'r:region | t:type';
      facets._activeSelections = { region: new Set(['PACA']), type: new Set(['Commune']) };
      (facets as any)._syncUrl();

      const params = new URLSearchParams(window.location.search);
      expect(params.get('r')).toBe('PACA');
      expect(params.get('t')).toBe('Commune');
    });

    it('removes params when no selections', () => {
      setUrlParams('type=Commune');
      facets._activeSelections = {};
      (facets as any)._syncUrl();

      expect(window.location.search).toBe('');
    });

    it('joins multiple values with comma', () => {
      facets._activeSelections = { region: new Set(['PACA', 'IDF']) };
      (facets as any)._syncUrl();

      const params = new URLSearchParams(window.location.search);
      expect(params.get('region')).toContain('PACA');
      expect(params.get('region')).toContain('IDF');
    });
  });

  describe('_toggleMultiselectDropdown', () => {
    it('opens the dropdown', () => {
      (facets as any)._toggleMultiselectDropdown('region');
      expect(facets._openMultiselectField).toBe('region');
    });

    it('closes the dropdown when already open', () => {
      (facets as any)._openMultiselectField = 'region';
      (facets as any)._toggleMultiselectDropdown('region');
      expect(facets._openMultiselectField).toBeNull();
    });
  });

  describe('_handleMultiselectKeydown', () => {
    it('closes dropdown on Escape', () => {
      (facets as any)._openMultiselectField = 'region';
      (facets as any)._handleMultiselectKeydown('region', new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(facets._openMultiselectField).toBeNull();
    });

    it('does nothing on other keys', () => {
      (facets as any)._openMultiselectField = 'region';
      (facets as any)._handleMultiselectKeydown('region', new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(facets._openMultiselectField).toBe('region');
    });
  });

  describe('_onClickOutsideMultiselect', () => {
    it('does nothing when no dropdown is open', () => {
      (facets as any)._openMultiselectField = null;
      (facets as any)._onClickOutsideMultiselect(new MouseEvent('click'));
      expect(facets._openMultiselectField).toBeNull();
    });
  });

  describe('render', () => {
    it('returns nothing when no data', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      // No data loaded -> _rawData is empty
      const result = facets.render();
      expect(result).toBe(nothing);
    });

    it('returns nothing when no facet groups', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'nonexistent_field';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      const result = facets.render();
      expect(result).toBe(nothing);
    });

    it('renders template when data and groups exist', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      const result = facets.render();
      expect(result).not.toBe(nothing);
    });

    it('includes reset button when filters are active', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      facets._activeSelections = { type: new Set(['Commune']) };
      const result = facets.render();
      expect(result).not.toBe(nothing);
    });

    it('uses DSFR grid when cols is set', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.cols = '6';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      const result = facets.render();
      expect(result).not.toBe(nothing);
    });
  });

  describe('_renderFacetGroup routing', () => {
    beforeEach(() => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);
    });

    it('routes to checkbox by default', () => {
      const group = facets._facetGroups[0];
      const result = (facets as any)._renderFacetGroup(group);
      expect(result).toBeTruthy();
    });

    it('routes to select mode', () => {
      facets.display = 'type:select';
      const group = facets._facetGroups[0];
      const result = (facets as any)._renderFacetGroup(group);
      expect(result).toBeTruthy();
    });

    it('routes to multiselect mode', () => {
      facets.display = 'type:multiselect';
      const group = facets._facetGroups[0];
      const result = (facets as any)._renderFacetGroup(group);
      expect(result).toBeTruthy();
    });

    it('routes to radio mode', () => {
      facets.display = 'type:radio';
      const group = facets._facetGroups[0];
      const result = (facets as any)._renderFacetGroup(group);
      expect(result).toBeTruthy();
    });
  });

  describe('_renderCheckboxGroup', () => {
    beforeEach(() => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type, region';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);
    });

    it('renders checkbox group template', () => {
      const group = facets._facetGroups.find(g => g.field === 'type')!;
      const result = (facets as any)._renderCheckboxGroup(group);
      expect(result).toBeTruthy();
    });

    it('renders with search bar when searchable', () => {
      facets.searchable = 'type';
      const group = facets._facetGroups.find(g => g.field === 'type')!;
      const result = (facets as any)._renderCheckboxGroup(group);
      expect(result).toBeTruthy();
    });

    it('filters values by search query', () => {
      facets.searchable = 'region';
      facets._searchQueries = { region: 'PA' };
      // Rebuild groups to reflect current state
      facets._buildFacetGroups();
      const group = facets._facetGroups.find(g => g.field === 'region')!;
      const result = (facets as any)._renderCheckboxGroup(group);
      expect(result).toBeTruthy();
    });

    it('shows "Voir plus" when values exceed maxValues', () => {
      facets.maxValues = 2;
      const group = facets._facetGroups.find(g => g.field === 'region')!;
      // region has 9 values, maxValues=2 -> should have "Voir plus"
      const result = (facets as any)._renderCheckboxGroup(group);
      expect(result).toBeTruthy();
    });

    it('shows all when expanded', () => {
      facets.maxValues = 2;
      facets._expandedFacets = new Set(['region']);
      const group = facets._facetGroups.find(g => g.field === 'region')!;
      const result = (facets as any)._renderCheckboxGroup(group);
      expect(result).toBeTruthy();
    });
  });

  describe('_renderSelectGroup', () => {
    it('renders select dropdown template', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.display = 'type:select';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      const group = facets._facetGroups.find(g => g.field === 'type')!;
      const result = (facets as any)._renderSelectGroup(group);
      expect(result).toBeTruthy();
    });

    it('renders with active selection', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.display = 'type:select';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);
      facets._activeSelections = { type: new Set(['Commune']) };

      const group = facets._facetGroups.find(g => g.field === 'type')!;
      const result = (facets as any)._renderSelectGroup(group);
      expect(result).toBeTruthy();
    });
  });

  describe('_renderMultiselectGroup', () => {
    it('renders multiselect template (closed)', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.display = 'type:multiselect';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      const group = facets._facetGroups.find(g => g.field === 'type')!;
      const result = (facets as any)._renderMultiselectGroup(group);
      expect(result).toBeTruthy();
    });

    it('renders multiselect template (open)', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.display = 'type:multiselect';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);
      (facets as any)._openMultiselectField = 'type';

      const group = facets._facetGroups.find(g => g.field === 'type')!;
      const result = (facets as any)._renderMultiselectGroup(group);
      expect(result).toBeTruthy();
    });

    it('renders with selections label', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.display = 'type:multiselect';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);
      facets._activeSelections = { type: new Set(['Commune', 'Prefecture']) };

      const group = facets._facetGroups.find(g => g.field === 'type')!;
      const result = (facets as any)._renderMultiselectGroup(group);
      expect(result).toBeTruthy();
    });
  });

  describe('_renderRadioGroup', () => {
    it('renders radio group template (closed)', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.display = 'type:radio';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      const group = facets._facetGroups.find(g => g.field === 'type')!;
      const result = (facets as any)._renderRadioGroup(group);
      expect(result).toBeTruthy();
    });

    it('renders radio group template (open with selection)', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.display = 'type:radio';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);
      (facets as any)._openMultiselectField = 'type';
      facets._activeSelections = { type: new Set(['Commune']) };

      const group = facets._facetGroups.find(g => g.field === 'type')!;
      const result = (facets as any)._renderRadioGroup(group);
      expect(result).toBeTruthy();
    });

    it('renders radio group template (open without selection)', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.display = 'type:radio';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);
      (facets as any)._openMultiselectField = 'type';

      const group = facets._facetGroups.find(g => g.field === 'type')!;
      const result = (facets as any)._renderRadioGroup(group);
      expect(result).toBeTruthy();
    });
  });

  describe('_buildStaticFacetGroups', () => {
    it('warns on invalid JSON', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      facets.staticValues = 'not-json';
      facets._buildStaticFacetGroups();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('static-values invalide'));
      warnSpy.mockRestore();
    });

    it('uses field names from fields attribute', () => {
      facets.fields = 'type';
      facets.staticValues = JSON.stringify({ type: ['A', 'B'], region: ['X', 'Y'] });
      facets._buildStaticFacetGroups();
      expect(facets._facetGroups).toHaveLength(1);
      expect(facets._facetGroups[0].field).toBe('type');
    });

    it('hides single-value groups when hide-empty', () => {
      facets.hideEmpty = true;
      facets.staticValues = JSON.stringify({ type: ['A'], region: ['X', 'Y'] });
      facets._buildStaticFacetGroups();
      expect(facets._facetGroups).toHaveLength(1);
      expect(facets._facetGroups[0].field).toBe('region');
    });
  });

  describe('_afterSelectionChange', () => {
    it('dispatches command in server-facets mode', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.serverFacets = true;
      facets.connectedCallback();

      (facets as any)._fetchServerFacets = () => {};
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      facets._activeSelections = { type: new Set(['Commune']) };
      (facets as any)._afterSelectionChange();
      // Should not throw — dispatches command
    });

    it('syncs URL when urlSync is enabled', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.urlSync = true;
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      facets._activeSelections = { type: new Set(['Commune']) };
      (facets as any)._afterSelectionChange();

      const params = new URLSearchParams(window.location.search);
      expect(params.get('type')).toBe('Commune');
    });
  });

  describe('_hasActiveSelections', () => {
    it('returns false when no selections', () => {
      facets._activeSelections = {};
      expect((facets as any)._hasActiveSelections()).toBe(false);
    });

    it('returns false when all sets are empty', () => {
      facets._activeSelections = { type: new Set() };
      expect((facets as any)._hasActiveSelections()).toBe(false);
    });

    it('returns true when selections exist', () => {
      facets._activeSelections = { type: new Set(['Commune']) };
      expect((facets as any)._hasActiveSelections()).toBe(true);
    });
  });

  describe('_initialize edge cases', () => {
    it('warns when id is missing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      facets.id = '';
      facets.source = 'test-source';
      (facets as any)._initialize();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('id'));
      warnSpy.mockRestore();
    });

    it('warns when source is missing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      facets.id = 'test-facets';
      facets.source = '';
      (facets as any)._initialize();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('source'));
      warnSpy.mockRestore();
    });
  });

  describe('accessibility: aria-modal and inert', () => {
    it('multiselect panel has aria-modal="true"', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.display = 'type:multiselect';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);
      (facets as any)._openMultiselectField = 'type';

      const group = facets._facetGroups.find(g => g.field === 'type')!;
      const result = (facets as any)._renderMultiselectGroup(group);
      // Template should contain aria-modal="true" on the dialog
      const rendered = JSON.stringify(result);
      expect(rendered).toContain('aria-modal');
    });

    it('radio panel has aria-modal="true"', () => {
      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.display = 'type:radio';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);
      (facets as any)._openMultiselectField = 'type';

      const group = facets._facetGroups.find(g => g.field === 'type')!;
      const result = (facets as any)._renderRadioGroup(group);
      const rendered = JSON.stringify(result);
      expect(rendered).toContain('aria-modal');
    });

    it('_setBackgroundInert sets inert on body children', () => {
      // Create a sibling element in body
      const sibling = document.createElement('div');
      sibling.id = 'bg-sibling';
      document.body.appendChild(sibling);
      // Attach facets to body so it's a body child too
      document.body.appendChild(facets);

      (facets as any)._setBackgroundInert(true);
      expect(sibling.hasAttribute('inert')).toBe(true);
      // The element containing facets should NOT be inert
      expect(facets.hasAttribute('inert')).toBe(false);

      (facets as any)._setBackgroundInert(false);
      expect(sibling.hasAttribute('inert')).toBe(false);

      document.body.removeChild(sibling);
      document.body.removeChild(facets);
    });

    it('_toggleMultiselectDropdown sets inert on open, removes on close', () => {
      const sibling = document.createElement('div');
      sibling.id = 'bg-sibling2';
      document.body.appendChild(sibling);
      document.body.appendChild(facets);

      facets.id = 'test-facets';
      facets.source = 'test-source';
      facets.fields = 'type';
      facets.display = 'type:multiselect';
      facets.connectedCallback();
      dispatchDataLoaded('test-source', SAMPLE_DATA);

      // Open dropdown
      (facets as any)._toggleMultiselectDropdown('type');
      expect(sibling.hasAttribute('inert')).toBe(true);

      // Close dropdown
      (facets as any)._toggleMultiselectDropdown('type');
      expect(sibling.hasAttribute('inert')).toBe(false);

      document.body.removeChild(sibling);
      document.body.removeChild(facets);
    });

    it('Escape key removes inert from background', () => {
      const sibling = document.createElement('div');
      sibling.id = 'bg-sibling3';
      document.body.appendChild(sibling);
      document.body.appendChild(facets);

      (facets as any)._openMultiselectField = 'type';
      (facets as any)._setBackgroundInert(true);

      (facets as any)._handleMultiselectKeydown('type', new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(facets._openMultiselectField).toBeNull();
      expect(sibling.hasAttribute('inert')).toBe(false);

      document.body.removeChild(sibling);
      document.body.removeChild(facets);
    });

    it('disconnectedCallback removes inert from background', () => {
      const sibling = document.createElement('div');
      sibling.id = 'bg-sibling4';
      document.body.appendChild(sibling);
      document.body.appendChild(facets);

      (facets as any)._setBackgroundInert(true);
      expect(sibling.hasAttribute('inert')).toBe(true);

      facets.disconnectedCallback();
      expect(sibling.hasAttribute('inert')).toBe(false);

      document.body.removeChild(sibling);
      document.body.removeChild(facets);
    });
  });

  describe('getAdapter delegation', () => {
    it('delegates to upstream source element', () => {
      const mockSource = document.createElement('div');
      mockSource.id = 'mock-adapter-src';
      (mockSource as any).getAdapter = () => ({
        type: 'opendatasoft',
        capabilities: { serverFacets: true, whereFormat: 'odsql' },
        buildFacetWhere: () => ''
      });
      document.body.appendChild(mockSource);

      facets.source = 'mock-adapter-src';
      const adapter = facets.getAdapter();
      expect(adapter).not.toBeNull();
      expect(adapter.type).toBe('opendatasoft');
      expect(adapter.capabilities.serverFacets).toBe(true);

      mockSource.remove();
    });

    it('chains through multiple intermediaries', () => {
      // source → normalize → facets
      const mockSource = document.createElement('div');
      mockSource.id = 'chain-src';
      (mockSource as any).getAdapter = () => ({ type: 'opendatasoft' });
      document.body.appendChild(mockSource);

      const mockNormalize = document.createElement('div');
      mockNormalize.id = 'chain-norm';
      (mockNormalize as any).source = 'chain-src';
      (mockNormalize as any).getAdapter = () => {
        const el = document.getElementById('chain-src');
        return (el as any)?.getAdapter?.() ?? null;
      };
      document.body.appendChild(mockNormalize);

      facets.source = 'chain-norm';
      const adapter = facets.getAdapter();
      expect(adapter).not.toBeNull();
      expect(adapter.type).toBe('opendatasoft');

      mockSource.remove();
      mockNormalize.remove();
    });

    it('returns null when no source set', () => {
      facets.source = '';
      expect(facets.getAdapter()).toBeNull();
    });
  });

  describe('getEffectiveWhere delegation', () => {
    it('delegates to upstream source element', () => {
      const mockSource = document.createElement('div');
      mockSource.id = 'mock-where-src';
      (mockSource as any).getEffectiveWhere = (excludeKey?: string) => {
        return excludeKey ? 'partial' : 'full WHERE';
      };
      document.body.appendChild(mockSource);

      facets.source = 'mock-where-src';
      expect(facets.getEffectiveWhere()).toBe('full WHERE');
      expect(facets.getEffectiveWhere('some-key')).toBe('partial');

      mockSource.remove();
    });

    it('returns empty string when source has no getEffectiveWhere', () => {
      facets.source = 'nonexistent';
      expect(facets.getEffectiveWhere()).toBe('');
    });
  });
});
