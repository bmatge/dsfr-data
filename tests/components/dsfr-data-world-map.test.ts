import { describe, it, expect, vi } from 'vitest';
import type { Topology, GeometryCollection } from 'topojson-specification';

// Mock beacon before importing the component
vi.mock('@/utils/beacon.js', () => ({
  sendWidgetBeacon: vi.fn(),
}));

// Mock data-bridge to avoid real subscriptions
vi.mock('@/utils/data-bridge.js', () => ({
  subscribeToSource: vi.fn(() => () => {}),
  getDataCache: vi.fn(() => undefined),
  publishCommand: vi.fn(),
}));

import { DsfrDataWorldMap } from '@/components/dsfr-data-world-map.js';

/**
 * Minimal valid TopoJSON topology with 2 countries (France 250, Germany 276).
 * Uses simple polygon geometries for d3-geo compatibility.
 */
function createMockTopology(): Topology {
  return {
    type: 'Topology',
    arcs: [
      // Arc 0: France-like polygon
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      // Arc 1: Germany-like polygon
      [
        [10, 0],
        [20, 0],
        [20, 10],
        [10, 10],
        [10, 0],
      ],
    ],
    objects: {
      countries: {
        type: 'GeometryCollection',
        geometries: [
          {
            type: 'Polygon',
            arcs: [[0]],
            id: '250',
            properties: { name: 'France' },
          },
          {
            type: 'Polygon',
            arcs: [[1]],
            id: '276',
            properties: { name: 'Germany' },
          },
        ],
      } as GeometryCollection,
    },
  };
}

/**
 * Helper: create a DsfrDataWorldMap instance with sensible defaults.
 * We access private members via (instance as any).
 */
function createInstance(overrides: Partial<DsfrDataWorldMap> = {}): DsfrDataWorldMap {
  const el = new DsfrDataWorldMap();
  Object.assign(el, overrides);
  return el;
}

describe('DsfrDataWorldMap', () => {
  describe('onSourceData', () => {
    it('stores array data', () => {
      const el = createInstance();
      const data = [{ code: 'FR', val: 10 }];
      el.onSourceData(data);
      expect((el as any)._data).toEqual(data);
    });

    it('coerces non-array data to empty array', () => {
      const el = createInstance();
      el.onSourceData({ not: 'an array' });
      expect((el as any)._data).toEqual([]);
    });

    it('handles null data', () => {
      const el = createInstance();
      el.onSourceData(null);
      expect((el as any)._data).toEqual([]);
    });

    it('handles undefined data', () => {
      const el = createInstance();
      el.onSourceData(undefined);
      expect((el as any)._data).toEqual([]);
    });

    it('handles empty array', () => {
      const el = createInstance();
      el.onSourceData([]);
      expect((el as any)._data).toEqual([]);
    });
  });

  describe('_buildValueMap', () => {
    it('builds map from iso-a2 codes', () => {
      const el = createInstance({
        codeField: 'code',
        valueField: 'val',
        codeFormat: 'iso-a2',
      });
      (el as any)._data = [
        { code: 'FR', val: 100 },
        { code: 'DE', val: 200 },
      ];
      const map = (el as any)._buildValueMap() as Map<string, number>;
      expect(map.get('250')).toBe(100); // FR -> 250
      expect(map.get('276')).toBe(200); // DE -> 276
    });

    it('builds map from iso-a3 codes', () => {
      const el = createInstance({
        codeField: 'code',
        valueField: 'population',
        codeFormat: 'iso-a3',
      });
      (el as any)._data = [
        { code: 'FRA', population: 67000000 },
        { code: 'USA', population: 330000000 },
      ];
      const map = (el as any)._buildValueMap() as Map<string, number>;
      expect(map.get('250')).toBe(67000000); // FRA -> 250
      expect(map.get('840')).toBe(330000000); // USA -> 840
    });

    it('builds map from iso-num codes', () => {
      const el = createInstance({
        codeField: 'code',
        valueField: 'val',
        codeFormat: 'iso-num',
      });
      (el as any)._data = [
        { code: '250', val: 42 },
        { code: '4', val: 10 }, // short numeric, should pad to 004
      ];
      const map = (el as any)._buildValueMap() as Map<string, number>;
      expect(map.get('250')).toBe(42);
      expect(map.get('004')).toBe(10);
    });

    it('returns empty map when no data', () => {
      const el = createInstance({ codeField: 'code', valueField: 'val' });
      (el as any)._data = [];
      const map = (el as any)._buildValueMap() as Map<string, number>;
      expect(map.size).toBe(0);
    });

    it('returns empty map when codeField is empty', () => {
      const el = createInstance({ codeField: '', valueField: 'val' });
      (el as any)._data = [{ code: 'FR', val: 10 }];
      const map = (el as any)._buildValueMap() as Map<string, number>;
      expect(map.size).toBe(0);
    });

    it('returns empty map when valueField is empty', () => {
      const el = createInstance({ codeField: 'code', valueField: '' });
      (el as any)._data = [{ code: 'FR', val: 10 }];
      const map = (el as any)._buildValueMap() as Map<string, number>;
      expect(map.size).toBe(0);
    });

    it('skips records with empty code', () => {
      const el = createInstance({
        codeField: 'code',
        valueField: 'val',
        codeFormat: 'iso-a2',
      });
      (el as any)._data = [
        { code: '', val: 10 },
        { code: 'FR', val: 20 },
      ];
      const map = (el as any)._buildValueMap() as Map<string, number>;
      expect(map.size).toBe(1);
      expect(map.get('250')).toBe(20);
    });

    it('skips records with unknown code', () => {
      const el = createInstance({
        codeField: 'code',
        valueField: 'val',
        codeFormat: 'iso-a2',
      });
      (el as any)._data = [
        { code: 'XX', val: 10 }, // unknown country
        { code: 'FR', val: 20 },
      ];
      const map = (el as any)._buildValueMap() as Map<string, number>;
      expect(map.size).toBe(1);
    });

    it('skips records with NaN value', () => {
      const el = createInstance({
        codeField: 'code',
        valueField: 'val',
        codeFormat: 'iso-a2',
      });
      (el as any)._data = [
        { code: 'FR', val: 'not-a-number' },
        { code: 'DE', val: 42 },
      ];
      const map = (el as any)._buildValueMap() as Map<string, number>;
      expect(map.size).toBe(1);
      expect(map.get('276')).toBe(42);
    });

    it('rounds values to 2 decimal places', () => {
      const el = createInstance({
        codeField: 'code',
        valueField: 'val',
        codeFormat: 'iso-a2',
      });
      (el as any)._data = [{ code: 'FR', val: 3.14159 }];
      const map = (el as any)._buildValueMap() as Map<string, number>;
      expect(map.get('250')).toBe(3.14);
    });

    it('handles nested paths with getByPath', () => {
      const el = createInstance({
        codeField: 'country.code',
        valueField: 'stats.population',
        codeFormat: 'iso-a2',
      });
      (el as any)._data = [{ country: { code: 'FR' }, stats: { population: 67000000 } }];
      const map = (el as any)._buildValueMap() as Map<string, number>;
      expect(map.get('250')).toBe(67000000);
    });

    it('handles null/undefined code gracefully', () => {
      const el = createInstance({
        codeField: 'code',
        valueField: 'val',
        codeFormat: 'iso-a2',
      });
      (el as any)._data = [
        { code: null, val: 10 },
        { code: undefined, val: 20 },
      ];
      const map = (el as any)._buildValueMap() as Map<string, number>;
      expect(map.size).toBe(0);
    });
  });

  describe('_getChoroplethPalette', () => {
    it('returns sequentialAscending palette by default', () => {
      const el = createInstance();
      const palette = (el as any)._getChoroplethPalette();
      expect(palette).toHaveLength(9);
      expect(palette[0]).toBe('#F5F5FE');
      expect(palette[8]).toBe('#000091');
    });

    it('returns requested palette', () => {
      const el = createInstance({ selectedPalette: 'neutral' });
      const palette = (el as any)._getChoroplethPalette();
      expect(palette).toHaveLength(9);
      expect(palette[0]).toBe('#F6F6F6');
      expect(palette[8]).toBe('#161616');
    });

    it('returns sequentialDescending palette', () => {
      const el = createInstance({ selectedPalette: 'sequentialDescending' });
      const palette = (el as any)._getChoroplethPalette();
      expect(palette[0]).toBe('#000091');
      expect(palette[8]).toBe('#F5F5FE');
    });

    it('returns divergentAscending palette', () => {
      const el = createInstance({ selectedPalette: 'divergentAscending' });
      const palette = (el as any)._getChoroplethPalette();
      expect(palette[0]).toBe('#000091');
      expect(palette[8]).toBe('#C9191E');
    });

    it('returns categorical palette', () => {
      const el = createInstance({ selectedPalette: 'categorical' });
      const palette = (el as any)._getChoroplethPalette();
      expect(palette[0]).toBe('#000091');
    });

    it('falls back to sequentialAscending for unknown palette', () => {
      const el = createInstance({ selectedPalette: 'nonexistent' });
      const palette = (el as any)._getChoroplethPalette();
      expect(palette[0]).toBe('#F5F5FE');
      expect(palette[8]).toBe('#000091');
    });
  });

  describe('_getColorScale', () => {
    it('returns default color for empty values', () => {
      const el = createInstance();
      const scale = (el as any)._getColorScale([]);
      expect(scale(42)).toBe('#E5E5F4');
    });

    it('returns a function', () => {
      const el = createInstance();
      const scale = (el as any)._getColorScale([10, 20, 30]);
      expect(typeof scale).toBe('function');
    });

    it('maps values to palette colors', () => {
      const el = createInstance({ selectedPalette: 'sequentialAscending' });
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const scale = (el as any)._getColorScale(values);

      // Low value should get an early palette color, high value a late one
      const lowColor = scale(1);
      const highColor = scale(9);
      expect(lowColor).not.toBe(highColor);
    });

    it('handles single value', () => {
      const el = createInstance();
      const scale = (el as any)._getColorScale([42]);
      const color = scale(42);
      // Single value: all breaks are the same, should return a valid palette color
      expect(color).toBeTruthy();
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it('handles identical values', () => {
      const el = createInstance();
      const scale = (el as any)._getColorScale([5, 5, 5, 5]);
      const color = scale(5);
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it('returns valid hex colors for any value', () => {
      const el = createInstance();
      const scale = (el as any)._getColorScale([10, 20, 30, 40, 50]);
      for (const v of [0, 10, 25, 50, 100]) {
        expect(scale(v)).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });

  describe('_onCountryClick', () => {
    it('sets zoomed continent when clicking a country', () => {
      const el = createInstance({ zoom: 'continent' });
      // 250 = France = Europe
      (el as any)._onCountryClick('250');
      expect((el as any)._zoomedContinent).toBe('Europe');
    });

    it('resets zoom when clicking while already zoomed', () => {
      const el = createInstance({ zoom: 'continent' });
      (el as any)._zoomedContinent = 'Europe';
      (el as any)._onCountryClick('250');
      expect((el as any)._zoomedContinent).toBeNull();
    });

    it('does nothing when zoom is "none"', () => {
      const el = createInstance({ zoom: 'none' });
      (el as any)._onCountryClick('250');
      expect((el as any)._zoomedContinent).toBeNull();
    });

    it('does nothing for unknown country code', () => {
      const el = createInstance({ zoom: 'continent' });
      (el as any)._onCountryClick('999');
      expect((el as any)._zoomedContinent).toBeNull();
    });

    it('zooms to different continents', () => {
      const el = createInstance({ zoom: 'continent' });

      // 840 = USA = North America
      (el as any)._onCountryClick('840');
      expect((el as any)._zoomedContinent).toBe('North America');

      // Reset
      (el as any)._onCountryClick('840');
      expect((el as any)._zoomedContinent).toBeNull();

      // 392 = Japan = Asia
      (el as any)._onCountryClick('392');
      expect((el as any)._zoomedContinent).toBe('Asia');
    });
  });

  describe('_onBackClick', () => {
    it('resets zoomed continent to null', () => {
      const el = createInstance();
      (el as any)._zoomedContinent = 'Europe';
      (el as any)._onBackClick();
      expect((el as any)._zoomedContinent).toBeNull();
    });

    it('is safe to call when not zoomed', () => {
      const el = createInstance();
      (el as any)._onBackClick();
      expect((el as any)._zoomedContinent).toBeNull();
    });
  });

  describe('_getAriaLabel', () => {
    it('returns world label with count when not zoomed', () => {
      const el = createInstance();
      (el as any)._data = [1, 2, 3];
      const label = (el as any)._getAriaLabel();
      expect(label).toBe('Carte monde, 3 valeurs');
    });

    it('returns continent label in French when zoomed', () => {
      const el = createInstance();
      (el as any)._data = [1, 2];
      (el as any)._zoomedContinent = 'Europe';
      const label = (el as any)._getAriaLabel();
      expect(label).toBe('Carte Europe, 2 valeurs');
    });

    it('returns French label for Africa', () => {
      const el = createInstance();
      (el as any)._data = [];
      (el as any)._zoomedContinent = 'Africa';
      const label = (el as any)._getAriaLabel();
      expect(label).toBe('Carte Afrique, 0 valeurs');
    });

    it('returns French label for Asia', () => {
      const el = createInstance();
      (el as any)._data = [1];
      (el as any)._zoomedContinent = 'Asia';
      expect((el as any)._getAriaLabel()).toBe('Carte Asie, 1 valeurs');
    });

    it('returns French label for North America', () => {
      const el = createInstance();
      (el as any)._data = [];
      (el as any)._zoomedContinent = 'North America';
      expect((el as any)._getAriaLabel()).toBe('Carte Amerique du Nord, 0 valeurs');
    });

    it('returns French label for South America', () => {
      const el = createInstance();
      (el as any)._data = [];
      (el as any)._zoomedContinent = 'South America';
      expect((el as any)._getAriaLabel()).toBe('Carte Amerique du Sud, 0 valeurs');
    });

    it('returns French label for Oceania', () => {
      const el = createInstance();
      (el as any)._data = [];
      (el as any)._zoomedContinent = 'Oceania';
      expect((el as any)._getAriaLabel()).toBe('Carte Oceanie, 0 valeurs');
    });

    it('handles empty data', () => {
      const el = createInstance();
      (el as any)._data = [];
      const label = (el as any)._getAriaLabel();
      expect(label).toBe('Carte monde, 0 valeurs');
    });
  });

  describe('_getFeatures', () => {
    it('returns empty array when no topology', () => {
      const el = createInstance();
      (el as any)._topology = null;
      const features = (el as any)._getFeatures();
      expect(features).toEqual([]);
    });
  });

  describe('_getBorders', () => {
    it('returns null when no topology', () => {
      const el = createInstance();
      (el as any)._topology = null;
      const borders = (el as any)._getBorders();
      expect(borders).toBeNull();
    });
  });

  describe('createRenderRoot', () => {
    it('returns this (light DOM)', () => {
      const el = createInstance();
      expect(el.createRenderRoot()).toBe(el);
    });
  });

  describe('default property values', () => {
    it('has correct defaults', () => {
      const el = createInstance();
      expect(el.source).toBe('');
      expect(el.codeField).toBe('');
      expect(el.valueField).toBe('');
      expect(el.codeFormat).toBe('iso-a2');
      expect(el.name).toBe('');
      expect(el.selectedPalette).toBe('sequentialAscending');
      expect(el.unitTooltip).toBe('');
      expect(el.zoom).toBe('continent');
      expect((el as any)._data).toEqual([]);
      expect((el as any)._topology).toBeNull();
      expect((el as any)._zoomedContinent).toBeNull();
      expect((el as any)._hoveredCountryId).toBeNull();
    });
  });

  describe('with mock topology', () => {
    function createWithTopology(overrides: Partial<DsfrDataWorldMap> = {}): DsfrDataWorldMap {
      const el = createInstance(overrides);
      (el as any)._topology = createMockTopology();
      return el;
    }

    describe('_getFeatures', () => {
      it('returns feature array from topology', () => {
        const el = createWithTopology();
        const features = (el as any)._getFeatures();
        expect(features).toHaveLength(2);
        expect(features[0].id).toBe('250');
        expect(features[1].id).toBe('276');
      });

      it('features have properties with name', () => {
        const el = createWithTopology();
        const features = (el as any)._getFeatures();
        expect(features[0].properties.name).toBe('France');
        expect(features[1].properties.name).toBe('Germany');
      });
    });

    describe('_getBorders', () => {
      it('returns a GeoJSON object for borders', () => {
        const el = createWithTopology();
        const borders = (el as any)._getBorders();
        expect(borders).not.toBeNull();
        expect(borders.type).toBeDefined();
      });
    });

    describe('_getProjection', () => {
      it('returns a projection function', () => {
        const el = createWithTopology();
        const proj = (el as any)._getProjection();
        expect(typeof proj).toBe('function');
      });

      it('returns a projection when zoomed to a continent', () => {
        const el = createWithTopology();
        (el as any)._zoomedContinent = 'Europe';
        const proj = (el as any)._getProjection();
        expect(typeof proj).toBe('function');
      });

      it('handles zoomed continent with no matching features', () => {
        const el = createWithTopology();
        // Our mock topology only has France and Germany (Europe),
        // so zooming to Africa should find no features
        (el as any)._zoomedContinent = 'Africa';
        const proj = (el as any)._getProjection();
        expect(typeof proj).toBe('function');
      });
    });

    describe('_renderMap', () => {
      it('returns a template result without data', () => {
        const el = createWithTopology({
          codeField: 'code',
          valueField: 'val',
          codeFormat: 'iso-a2',
        });
        (el as any)._data = [];
        const result = (el as any)._renderMap();
        expect(result).toBeDefined();
        // Lit TemplateResult has a strings property
        expect(result.strings).toBeDefined();
      });

      it('returns a template result with data', () => {
        const el = createWithTopology({
          codeField: 'code',
          valueField: 'val',
          codeFormat: 'iso-a2',
        });
        (el as any)._data = [
          { code: 'FR', val: 100 },
          { code: 'DE', val: 200 },
        ];
        const result = (el as any)._renderMap();
        expect(result).toBeDefined();
        expect(result.strings).toBeDefined();
      });

      it('shows back button when zoomed', () => {
        const el = createWithTopology({
          codeField: 'code',
          valueField: 'val',
          codeFormat: 'iso-a2',
        });
        (el as any)._data = [{ code: 'FR', val: 100 }];
        (el as any)._zoomedContinent = 'Europe';
        const result = (el as any)._renderMap();
        expect(result).toBeDefined();
      });
    });

    describe('_renderTooltip', () => {
      it('returns nothing when no country is hovered', () => {
        const el = createWithTopology();
        (el as any)._hoveredCountryId = null;
        const valueMap = new Map<string, number>();
        const result = (el as any)._renderTooltip(valueMap);
        // Lit `nothing` is a special symbol
        expect(result).toBeDefined();
      });

      it('shows tooltip with country name and value', () => {
        const el = createWithTopology({ unitTooltip: 'habitants' });
        (el as any)._hoveredCountryId = '250';
        (el as any)._tooltipX = 100;
        (el as any)._tooltipY = 50;
        const valueMap = new Map<string, number>([['250', 67000000]]);
        const result = (el as any)._renderTooltip(valueMap);
        expect(result).toBeDefined();
        expect(result.strings).toBeDefined();
      });

      it('shows "Pas de donnees" when country has no value', () => {
        const el = createWithTopology();
        (el as any)._hoveredCountryId = '250';
        (el as any)._tooltipX = 100;
        (el as any)._tooltipY = 50;
        const valueMap = new Map<string, number>();
        const result = (el as any)._renderTooltip(valueMap);
        expect(result).toBeDefined();
        expect(result.strings).toBeDefined();
      });

      it('falls back to feature name when country not in COUNTRY_NAMES_FR', () => {
        const el = createWithTopology();
        // Use a code that exists in topology but might not be in COUNTRY_NAMES_FR
        (el as any)._hoveredCountryId = '276';
        (el as any)._tooltipX = 100;
        (el as any)._tooltipY = 50;
        const valueMap = new Map<string, number>([['276', 42]]);
        const result = (el as any)._renderTooltip(valueMap);
        expect(result).toBeDefined();
      });

      it('shows tooltip without unit when unitTooltip is empty', () => {
        const el = createWithTopology({ unitTooltip: '' });
        (el as any)._hoveredCountryId = '250';
        const valueMap = new Map<string, number>([['250', 100]]);
        const result = (el as any)._renderTooltip(valueMap);
        expect(result).toBeDefined();
      });
    });

    describe('_renderLegend', () => {
      it('returns nothing when no values', () => {
        const el = createWithTopology();
        const colorScale = (_v: number) => '#000';
        const result = (el as any)._renderLegend([], colorScale);
        expect(result).toBeDefined();
      });

      it('renders legend with values', () => {
        const el = createWithTopology({ name: 'Population' });
        const colorScale = (_v: number) => '#000';
        const result = (el as any)._renderLegend([10, 50, 100], colorScale);
        expect(result).toBeDefined();
        expect(result.strings).toBeDefined();
      });

      it('renders legend with unit tooltip', () => {
        const el = createWithTopology({ unitTooltip: 'habitants' });
        const colorScale = (_v: number) => '#000';
        const result = (el as any)._renderLegend([10, 20], colorScale);
        expect(result).toBeDefined();
      });

      it('renders legend without name', () => {
        const el = createWithTopology({ name: '' });
        const colorScale = (_v: number) => '#000';
        const result = (el as any)._renderLegend([1, 2, 3], colorScale);
        expect(result).toBeDefined();
      });
    });

    describe('render', () => {
      it('renders loading when _sourceLoading is true', () => {
        const el = createWithTopology();
        (el as any)._sourceLoading = true;
        const result = el.render();
        expect(result).toBeDefined();
      });

      it('renders error when _sourceError is set', () => {
        const el = createWithTopology();
        (el as any)._sourceError = new Error('Test error');
        const result = el.render();
        expect(result).toBeDefined();
      });

      it('renders loading when topology is null', () => {
        const el = createInstance();
        (el as any)._topology = null;
        (el as any)._sourceLoading = false;
        (el as any)._sourceError = null;
        const result = el.render();
        expect(result).toBeDefined();
      });

      it('renders map with empty data', () => {
        const el = createWithTopology({
          codeField: 'code',
          valueField: 'val',
        });
        (el as any)._data = [];
        (el as any)._sourceLoading = false;
        (el as any)._sourceError = null;
        const result = el.render();
        expect(result).toBeDefined();
      });

      it('renders map with data', () => {
        const el = createWithTopology({
          codeField: 'code',
          valueField: 'val',
          codeFormat: 'iso-a2',
        });
        (el as any)._data = [
          { code: 'FR', val: 100 },
          { code: 'DE', val: 200 },
        ];
        (el as any)._sourceLoading = false;
        (el as any)._sourceError = null;
        const result = el.render();
        expect(result).toBeDefined();
      });
    });
  });

  describe('_onCountryHover', () => {
    it('sets hovered country id', () => {
      const el = createInstance();
      // Mock getBoundingClientRect
      (el as any).getBoundingClientRect = () => ({ left: 0, top: 0 });
      const mockEvent = { clientX: 100, clientY: 50 } as MouseEvent;
      (el as any)._onCountryHover(mockEvent, '250');
      expect((el as any)._hoveredCountryId).toBe('250');
      expect((el as any)._tooltipX).toBe(112); // 100 - 0 + 12
      expect((el as any)._tooltipY).toBe(42); // 50 - 0 - 8
    });

    it('clears hovered country on null', () => {
      const el = createInstance();
      (el as any)._hoveredCountryId = '250';
      const mockEvent = { clientX: 0, clientY: 0 } as MouseEvent;
      (el as any)._onCountryHover(mockEvent, null);
      expect((el as any)._hoveredCountryId).toBeNull();
    });
  });
});
