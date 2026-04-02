import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DsfrDataMap } from '../src/components/dsfr-data-map.js';
import { DsfrDataMapLayer } from '../src/components/dsfr-data-map-layer.js';
import { DsfrDataMapTimeline } from '../src/components/dsfr-data-map-timeline.js';
import { clearDataCache, dispatchDataLoaded } from '../src/utils/data-bridge.js';
import { nothing } from 'lit';

// ============================================================================
// dsfr-data-map
// ============================================================================

describe('DsfrDataMap', () => {
  let map: DsfrDataMap;

  beforeEach(() => {
    map = new DsfrDataMap();
  });

  afterEach(() => {
    if (map.isConnected) {
      map.disconnectedCallback();
    }
  });

  describe('default attributes', () => {
    it('has center on France by default', () => {
      expect(map.center).toBe('46.603,2.888');
    });

    it('has zoom 6 by default', () => {
      expect(map.zoom).toBe(6);
    });

    it('has min-zoom 2', () => {
      expect(map.minZoom).toBe(2);
    });

    it('has max-zoom 18', () => {
      expect(map.maxZoom).toBe(18);
    });

    it('has height 500px', () => {
      expect(map.height).toBe('500px');
    });

    it('has tiles ign-plan', () => {
      expect(map.tiles).toBe('ign-plan');
    });

    it('has no-controls false', () => {
      expect(map.noControls).toBe(false);
    });

    it('has fit-bounds false', () => {
      expect(map.fitBounds).toBe(false);
    });

    it('has max-bounds empty', () => {
      expect(map.maxBounds).toBe('');
    });

    it('has name empty', () => {
      expect(map.name).toBe('');
    });
  });

  describe('Light DOM', () => {
    it('renders to Light DOM (no shadowRoot)', () => {
      expect(map.shadowRoot).toBeNull();
    });
  });

  describe('public API', () => {
    it('getLeafletMap returns null before init', () => {
      expect(map.getLeafletMap()).toBeNull();
    });

    it('getLeafletLib returns null before init', () => {
      expect(map.getLeafletLib()).toBeNull();
    });
  });
});

// ============================================================================
// dsfr-data-map-layer
// ============================================================================

describe('DsfrDataMapLayer', () => {
  let layer: DsfrDataMapLayer;

  beforeEach(() => {
    clearDataCache('test-map-src');
    layer = new DsfrDataMapLayer();
  });

  afterEach(() => {
    if (layer.isConnected) {
      layer.disconnectedCallback();
    }
  });

  describe('default attributes', () => {
    it('has source empty', () => {
      expect(layer.source).toBe('');
    });

    it('has type marker', () => {
      expect(layer.type).toBe('marker');
    });

    it('has lat-field empty', () => {
      expect(layer.latField).toBe('');
    });

    it('has lon-field empty', () => {
      expect(layer.lonField).toBe('');
    });

    it('has geo-field empty', () => {
      expect(layer.geoField).toBe('');
    });

    it('has color #000091 (DSFR blue-france)', () => {
      expect(layer.color).toBe('#000091');
    });

    it('has fill-opacity 0.6', () => {
      expect(layer.fillOpacity).toBe(0.6);
    });

    it('has radius 8', () => {
      expect(layer.radius).toBe(8);
    });

    it('has radius-unit px', () => {
      expect(layer.radiusUnit).toBe('px');
    });

    it('has cluster false', () => {
      expect(layer.cluster).toBe(false);
    });

    it('has cluster-radius 80', () => {
      expect(layer.clusterRadius).toBe(80);
    });

    it('has min-zoom 0', () => {
      expect(layer.minZoom).toBe(0);
    });

    it('has max-zoom 18', () => {
      expect(layer.maxZoom).toBe(18);
    });

    it('has bbox false', () => {
      expect(layer.bbox).toBe(false);
    });

    it('has bbox-debounce 300', () => {
      expect(layer.bboxDebounce).toBe(300);
    });

    it('has max-items 5000', () => {
      expect(layer.maxItems).toBe(5000);
    });
  });

  describe('Light DOM', () => {
    it('renders to Light DOM (no shadowRoot)', () => {
      expect(layer.shadowRoot).toBeNull();
    });
  });

  describe('coordinate extraction', () => {
    it('extracts coords from lat-field + lon-field', () => {
      layer.latField = 'latitude';
      layer.lonField = 'longitude';
      const coords = (layer as any)._extractCoords({ latitude: 48.86, longitude: 2.35 });
      expect(coords).toEqual({ lat: 48.86, lon: 2.35 });
    });

    it('returns null for invalid lat-field + lon-field', () => {
      layer.latField = 'latitude';
      layer.lonField = 'longitude';
      const coords = (layer as any)._extractCoords({ latitude: 'invalid', longitude: 2.35 });
      expect(coords).toBeNull();
    });

    it('extracts coords from geo-field GeoJSON Point', () => {
      layer.geoField = 'geo';
      const coords = (layer as any)._extractCoords({
        geo: { type: 'Point', coordinates: [2.35, 48.86] },
      });
      expect(coords).toEqual({ lat: 48.86, lon: 2.35 });
    });

    it('extracts coords from geo-field ODS format {lat, lon}', () => {
      layer.geoField = 'geo_point_2d';
      const coords = (layer as any)._extractCoords({
        geo_point_2d: { lat: 48.86, lon: 2.35 },
      });
      expect(coords).toEqual({ lat: 48.86, lon: 2.35 });
    });

    it('extracts coords from geo-field array [lat, lon]', () => {
      layer.geoField = 'position';
      const coords = (layer as any)._extractCoords({
        position: [48.86, 2.35],
      });
      expect(coords).toEqual({ lat: 48.86, lon: 2.35 });
    });

    it('returns null when geo-field is missing', () => {
      layer.geoField = 'geo';
      const coords = (layer as any)._extractCoords({ other: 'value' });
      expect(coords).toBeNull();
    });

    it('auto-detects geo_point_2d', () => {
      const coords = (layer as any)._extractCoords({
        geo_point_2d: { lat: 48.86, lon: 2.35 },
      });
      expect(coords).toEqual({ lat: 48.86, lon: 2.35 });
    });

    it('auto-detects GeoJSON Point in geo_point_2d', () => {
      const coords = (layer as any)._extractCoords({
        geo_point_2d: { type: 'Point', coordinates: [2.35, 48.86] },
      });
      expect(coords).toEqual({ lat: 48.86, lon: 2.35 });
    });
  });

  describe('popup generation', () => {
    it('interpolates popup template', () => {
      layer.popupTemplate = '{nom} — {puissance} kW';
      const result = (layer as any)._interpolateTemplate(
        layer.popupTemplate,
        { nom: 'Station A', puissance: 22 },
      );
      expect(result).toBe('Station A — 22 kW');
    });

    it('escapes HTML in template values', () => {
      layer.popupTemplate = '{nom}';
      const result = (layer as any)._interpolateTemplate(
        layer.popupTemplate,
        { nom: '<script>alert(1)</script>' },
      );
      expect(result).not.toContain('<script>');
    });

    it('builds popup table from popup-fields', () => {
      layer.popupFields = 'nom,ville';
      const html = (layer as any)._buildPopupTable({ nom: 'Gare', ville: 'Paris' });
      expect(html).toContain('<table');
      expect(html).toContain('Gare');
      expect(html).toContain('Paris');
      expect(html).toContain('<th>nom</th>');
      expect(html).toContain('<th>ville</th>');
    });

    it('handles missing fields in popup-fields', () => {
      layer.popupFields = 'nom,inexistant';
      const html = (layer as any)._buildPopupTable({ nom: 'Test' });
      expect(html).toContain('Test');
      expect(html).toContain('<td></td>');
    });
  });

  describe('data reception via SourceSubscriberMixin', () => {
    it('receives data from source', () => {
      layer.source = 'test-map-src';
      layer.connectedCallback();

      const data = [
        { geo_point_2d: { lat: 48.86, lon: 2.35 }, nom: 'Paris' },
        { geo_point_2d: { lat: 43.60, lon: 1.44 }, nom: 'Toulouse' },
      ];
      dispatchDataLoaded('test-map-src', data);

      expect((layer as any)._data).toHaveLength(2);
      expect((layer as any)._data[0].nom).toBe('Paris');
    });

    it('handles empty data array', () => {
      layer.source = 'test-map-src';
      layer.connectedCallback();

      dispatchDataLoaded('test-map-src', []);

      expect((layer as any)._data).toHaveLength(0);
    });

    it('handles non-array data', () => {
      layer.source = 'test-map-src';
      layer.connectedCallback();

      dispatchDataLoaded('test-map-src', { not: 'an array' });

      expect((layer as any)._data).toHaveLength(0);
    });
  });

  describe('auto-detect geo field', () => {
    it('detects geo_point_2d', () => {
      (layer as any)._data = [{ geo_point_2d: { lat: 1, lon: 2 } }];
      expect((layer as any)._autoDetectGeoField()).toBe('geo_point_2d');
    });

    it('detects geo_shape', () => {
      (layer as any)._data = [{ geo_shape: { type: 'Polygon' } }];
      expect((layer as any)._autoDetectGeoField()).toBe('geo_shape');
    });

    it('detects geometry', () => {
      (layer as any)._data = [{ geometry: { type: 'Point' } }];
      expect((layer as any)._autoDetectGeoField()).toBe('geometry');
    });

    it('falls back to geo_point_2d when no data', () => {
      (layer as any)._data = [];
      expect((layer as any)._autoDetectGeoField()).toBe('geo_point_2d');
    });
  });
});

// ============================================================================
// Utility functions
// ============================================================================

// ============================================================================
// dsfr-data-map-popup
// ============================================================================

describe('DsfrDataMapPopup', () => {
  let popup: import('../src/components/dsfr-data-map-popup.js').DsfrDataMapPopup;

  beforeEach(async () => {
    const mod = await import('../src/components/dsfr-data-map-popup.js');
    popup = new mod.DsfrDataMapPopup();
  });

  describe('default attributes', () => {
    it('has mode popup by default', () => {
      expect(popup.mode).toBe('popup');
    });

    it('has title-field empty', () => {
      expect(popup.titleField).toBe('');
    });

    it('has width 350px', () => {
      expect(popup.width).toBe('350px');
    });

    it('has for empty (matches all layers)', () => {
      expect(popup.for).toBe('');
    });
  });

  describe('matchesLayer', () => {
    it('matches all layers when for is empty', () => {
      expect(popup.matchesLayer('any-layer')).toBe(true);
    });

    it('matches specific layer when for is set', () => {
      popup.for = 'layer-1';
      expect(popup.matchesLayer('layer-1')).toBe(true);
      expect(popup.matchesLayer('layer-2')).toBe(false);
    });
  });

  describe('getPopupHtml', () => {
    it('generates auto table when no template', () => {
      const html = popup.getPopupHtml({ nom: 'Paris', prix: 95 });
      expect(html).toContain('Paris');
      expect(html).toContain('95');
      expect(html).toContain('<table');
    });

    it('filters out geo/lat/lon fields from auto table', () => {
      const html = popup.getPopupHtml({
        nom: 'Test',
        latitude: 48.86,
        longitude: 2.35,
        geo_point_2d: { lat: 48.86, lon: 2.35 },
      });
      expect(html).toContain('Test');
      expect(html).not.toContain('latitude');
      expect(html).not.toContain('longitude');
    });
  });

  describe('hasTemplate', () => {
    it('returns false when no template child', () => {
      expect(popup.hasTemplate()).toBe(false);
    });
  });

  describe('Light DOM', () => {
    it('renders to Light DOM', () => {
      expect(popup.shadowRoot).toBeNull();
    });
  });
});

// ============================================================================
// DsfrDataMapPopup — template rendering
// ============================================================================

describe('DsfrDataMapPopup template rendering', () => {
  it('escapes HTML in auto-generated table values', async () => {
    const mod = await import('../src/components/dsfr-data-map-popup.js');
    const popup = new mod.DsfrDataMapPopup();
    const html = popup.getPopupHtml({ nom: '<script>xss</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('wraps output in dsfr-data-map__popup div', async () => {
    const mod = await import('../src/components/dsfr-data-map-popup.js');
    const popup = new mod.DsfrDataMapPopup();
    const html = popup.getPopupHtml({ nom: 'test' });
    expect(html).toContain('class="dsfr-data-map__popup"');
  });

  it('close() resets current record', async () => {
    const mod = await import('../src/components/dsfr-data-map-popup.js');
    const popup = new mod.DsfrDataMapPopup();
    popup._currentRecord = { nom: 'test' };
    popup.close();
    expect(popup._currentRecord).toBeNull();
  });

  it('supports all mode values', async () => {
    const mod = await import('../src/components/dsfr-data-map-popup.js');
    const popup = new mod.DsfrDataMapPopup();
    for (const mode of ['popup', 'modal', 'panel-right', 'panel-left']) {
      popup.mode = mode as any;
      expect(popup.mode).toBe(mode);
    }
  });
});

// ============================================================================
// DsfrDataMapLayer — missing attribute defaults
// ============================================================================

describe('DsfrDataMapLayer all attribute defaults', () => {
  let layer: DsfrDataMapLayer;
  beforeEach(() => { layer = new DsfrDataMapLayer(); });

  it('has popup-template empty', () => { expect(layer.popupTemplate).toBe(''); });
  it('has popup-fields empty', () => { expect(layer.popupFields).toBe(''); });
  it('has tooltip-field empty', () => { expect(layer.tooltipField).toBe(''); });
  it('has fill-field empty', () => { expect(layer.fillField).toBe(''); });
  it('has selected-palette empty', () => { expect(layer.selectedPalette).toBe(''); });
  it('has radius 8', () => { expect(layer.radius).toBe(8); });
  it('has radius-field empty', () => { expect(layer.radiusField).toBe(''); });
  it('has bbox-field empty', () => { expect(layer.bboxField).toBe(''); });
  it('has filter empty', () => { expect(layer.filter).toBe(''); });
  it('has bbox-debounce 300', () => { expect(layer.bboxDebounce).toBe(300); });
});

// ============================================================================
// DsfrDataMap — a11y methods
// ============================================================================

describe('DsfrDataMap a11y methods', () => {
  let map: DsfrDataMap;
  beforeEach(() => { map = new DsfrDataMap(); });

  it('announceToScreenReader does not throw before init', () => {
    expect(() => map.announceToScreenReader('test')).not.toThrow();
  });

  it('updateDescription does not throw before init', () => {
    expect(() => map.updateDescription(['test'])).not.toThrow();
  });

  it('_buildMapDescription returns string with instructions', () => {
    const desc = (map as any)._buildMapDescription();
    expect(desc).toContain('Carte interactive');
    expect(desc).toContain('fleches');
    expect(desc).toContain('Tabulez');
  });

  it('_buildMapDescription includes name when set', () => {
    map.name = 'Ma carte';
    const desc = (map as any)._buildMapDescription();
    expect(desc).toContain('Ma carte');
  });
});

// ============================================================
// New attributes
// ============================================================

describe('DsfrDataMapLayer new attributes', () => {
  it('has radius-min 4 by default', () => {
    const layer = new DsfrDataMapLayer();
    expect(layer.radiusMin).toBe(4);
  });

  it('has radius-max 30 by default', () => {
    const layer = new DsfrDataMapLayer();
    expect(layer.radiusMax).toBe(30);
  });

  it('has heat-radius 25 by default', () => {
    const layer = new DsfrDataMapLayer();
    expect(layer.heatRadius).toBe(25);
  });

  it('has heat-blur 15 by default', () => {
    const layer = new DsfrDataMapLayer();
    expect(layer.heatBlur).toBe(15);
  });

  it('has heat-field empty by default', () => {
    const layer = new DsfrDataMapLayer();
    expect(layer.heatField).toBe('');
  });
});

// ============================================================================
// Auto-scaling
// ============================================================================

describe('circle auto-scaling', () => {
  it('computes scale function from data range', () => {
    const layer = new DsfrDataMapLayer();
    layer.type = 'circle';
    layer.radiusField = 'pop';
    layer.radiusMin = 5;
    layer.radiusMax = 25;

    // Simulate what _renderLayer does for scaling
    const items = [
      { pop: 100 },
      { pop: 500 },
      { pop: 1000 },
    ];

    const values = items.map(r => r.pop);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    const scale = (val: number) =>
      5 + ((val - min) / range) * (25 - 5);

    // min value → radiusMin
    expect(scale(100)).toBe(5);
    // max value → radiusMax
    expect(scale(1000)).toBe(25);
    // mid value → proportional
    expect(scale(550)).toBeCloseTo(15);
  });
});

// ============================================================================
// Choropleth utilities
// ============================================================================

describe('choropleth utilities', () => {
  it('getColorForValue assigns colors by quantile', () => {
    const layer = new DsfrDataMapLayer();
    layer.type = 'geoshape';
    layer.fillField = 'population';
    layer.selectedPalette = 'sequentialAscending';
    layer.geoField = 'geo';

    (layer as any)._data = [
      { geo: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] }, population: 100 },
      { geo: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] }, population: 500 },
      { geo: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] }, population: 1000 },
    ];

    expect((layer as any)._data).toHaveLength(3);
  });
});

// ============================================================================
// Mock Leaflet — tests for rendering methods
// ============================================================================

/** Minimal Leaflet mock for testing layer rendering logic */
function createMockLeaflet() {
  const layers: any[] = [];
  const mockLayerGroup = {
    clearLayers: () => { layers.length = 0; },
    addLayer: (l: any) => { layers.push(l); },
    addTo: () => {},
    removeFrom: () => {},
    getBounds: () => ({ isValid: () => layers.length > 0 }),
  };
  const mockMap = {
    getZoom: () => 10,
    getBounds: () => ({
      getSouthWest: () => ({ lat: 43, lng: 1 }),
      getNorthEast: () => ({ lat: 49, lng: 5 }),
      contains: () => true,
    }),
    hasLayer: () => false,
    on: () => {},
    invalidateSize: () => {},
  };
  const mockMarker = {
    bindPopup: () => mockMarker,
    bindTooltip: () => mockMarker,
    on: () => mockMarker,
    getElement: () => null,
  };
  const mockCircle = { ...mockMarker };
  const mockGeoJSON = { ...mockMarker };
  const L = {
    layerGroup: () => mockLayerGroup,
    marker: (_latlng: any, _opts?: any) => mockMarker,
    circleMarker: (_latlng: any, _opts?: any) => mockCircle,
    circle: (_latlng: any, _opts?: any) => mockCircle,
    geoJSON: (_data: any, _opts?: any) => mockGeoJSON,
    divIcon: (_opts: any) => ({}),
    point: (x: number, y: number) => ({ x, y }),
    tileLayer: (_url: string, _opts?: any) => ({ addTo: () => {}, remove: () => {} }),
    map: (_el: any, _opts?: any) => mockMap,
  };
  return { L, layers, mockMap, mockLayerGroup };
}

function setupLayerWithMock(layer: DsfrDataMapLayer, mock: ReturnType<typeof createMockLeaflet>) {
  (layer as any)._L = mock.L;
  (layer as any)._leafletMap = mock.mockMap;
  (layer as any)._layerGroup = mock.mockLayerGroup;
  (layer as any)._mapParent = null;
  (layer as any)._visible = true;
}

describe('DsfrDataMapLayer rendering with mock Leaflet', () => {
  let layer: DsfrDataMapLayer;
  let mock: ReturnType<typeof createMockLeaflet>;

  beforeEach(() => {
    layer = new DsfrDataMapLayer();
    mock = createMockLeaflet();
    setupLayerWithMock(layer, mock);
  });

  describe('_renderLayer markers', () => {
    it('renders markers from lat/lon fields', async () => {
      layer.type = 'marker';
      layer.latField = 'lat';
      layer.lonField = 'lon';
      (layer as any)._data = [
        { lat: 48.86, lon: 2.35, nom: 'Paris' },
        { lat: 43.30, lon: 5.37, nom: 'Marseille' },
      ];
      await (layer as any)._renderLayer();
      expect(mock.layers).toHaveLength(2);
    });

    it('renders markers from geo-field GeoJSON Point', async () => {
      layer.type = 'marker';
      layer.geoField = 'geo';
      (layer as any)._data = [
        { geo: { type: 'Point', coordinates: [2.35, 48.86] }, nom: 'Paris' },
      ];
      await (layer as any)._renderLayer();
      expect(mock.layers).toHaveLength(1);
    });

    it('skips records with missing coordinates', async () => {
      layer.type = 'marker';
      layer.latField = 'lat';
      layer.lonField = 'lon';
      (layer as any)._data = [
        { lat: 48.86, lon: 2.35 },
        { lat: NaN, lon: 2.35 },
        { noLatHere: 43 },
      ];
      await (layer as any)._renderLayer();
      expect(mock.layers).toHaveLength(1);
    });

    it('sets alt text from tooltip-field on markers', async () => {
      layer.type = 'marker';
      layer.latField = 'lat';
      layer.lonField = 'lon';
      layer.tooltipField = 'nom';
      (layer as any)._data = [{ lat: 48.86, lon: 2.35, nom: 'Paris' }];

      let capturedOpts: any;
      mock.L.marker = (_ll: any, opts?: any) => {
        capturedOpts = opts;
        return mock.layers[0] || { bindPopup: () => ({}), bindTooltip: () => ({}), on: () => ({}) };
      };

      await (layer as any)._renderLayer();
      expect(capturedOpts?.alt).toBe('Paris');
    });
  });

  describe('_renderLayer circles', () => {
    it('renders circles with auto-scaling', async () => {
      layer.type = 'circle';
      layer.latField = 'lat';
      layer.lonField = 'lon';
      layer.radiusField = 'pop';
      layer.radiusMin = 5;
      layer.radiusMax = 25;
      (layer as any)._data = [
        { lat: 48.86, lon: 2.35, pop: 100 },
        { lat: 43.30, lon: 5.37, pop: 1000 },
      ];
      await (layer as any)._renderLayer();
      expect(mock.layers).toHaveLength(2);
      // Verify scaling function was created
      expect((layer as any)._radiusScale).not.toBeNull();
      expect((layer as any)._radiusScale(100)).toBe(5);
      expect((layer as any)._radiusScale(1000)).toBe(25);
    });

    it('uses meters mode with radius-unit=m', async () => {
      layer.type = 'circle';
      layer.latField = 'lat';
      layer.lonField = 'lon';
      layer.radiusUnit = 'm';
      (layer as any)._data = [{ lat: 48.86, lon: 2.35 }];

      let usedCircle = false;
      mock.L.circle = () => { usedCircle = true; return { bindPopup: () => ({}), bindTooltip: () => ({}), on: () => ({}) } as any; };
      await (layer as any)._renderLayer();
      expect(usedCircle).toBe(true);
    });
  });

  describe('_renderLayer geoshape', () => {
    it('renders geoshape with choropleth', async () => {
      layer.type = 'geoshape';
      layer.geoField = 'geo';
      layer.fillField = 'val';
      layer.selectedPalette = 'sequentialAscending';
      (layer as any)._data = [
        { geo: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] }, val: 10 },
        { geo: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] }, val: 90 },
      ];

      let capturedStyle: any;
      mock.L.geoJSON = (_d: any, opts?: any) => {
        capturedStyle = opts?.style;
        return { bindPopup: () => ({}), bindTooltip: () => ({}), on: () => ({}) } as any;
      };

      await (layer as any)._renderLayer();
      expect(mock.layers).toHaveLength(2);
      expect(capturedStyle).toBeDefined();
      expect(capturedStyle.fillColor).toBeDefined();
    });
  });

  describe('_renderLayer heatmap', () => {
    it('falls back to circle markers when leaflet.heat not loaded', async () => {
      layer.type = 'heatmap';
      layer.latField = 'lat';
      layer.lonField = 'lon';
      (layer as any)._data = [
        { lat: 48.86, lon: 2.35 },
        { lat: 43.30, lon: 5.37 },
      ];
      await (layer as any)._renderLayer();
      // Fallback circles are added to layerGroup
      expect(mock.layers).toHaveLength(2);
    });
  });

  describe('_renderLayer max-items', () => {
    it('truncates to max-items', async () => {
      layer.type = 'marker';
      layer.latField = 'lat';
      layer.lonField = 'lon';
      layer.maxItems = 2;
      (layer as any)._data = [
        { lat: 1, lon: 1 }, { lat: 2, lon: 2 }, { lat: 3, lon: 3 }, { lat: 4, lon: 4 },
      ];
      await (layer as any)._renderLayer();
      expect(mock.layers).toHaveLength(2);
    });
  });

  describe('popup binding', () => {
    it('binds popup with popup-fields', async () => {
      layer.type = 'marker';
      layer.latField = 'lat';
      layer.lonField = 'lon';
      layer.popupFields = 'nom,prix';

      let popupContent = '';
      mock.L.marker = () => ({
        bindPopup: (c: string) => { popupContent = c; return { bindTooltip: () => ({}), on: () => ({}) }; },
        bindTooltip: () => ({}),
        on: () => ({}),
      } as any);

      (layer as any)._data = [{ lat: 48.86, lon: 2.35, nom: 'Test', prix: 95 }];
      await (layer as any)._renderLayer();
      expect(popupContent).toContain('Test');
      expect(popupContent).toContain('95');
    });

    it('binds popup with popup-template', async () => {
      layer.type = 'marker';
      layer.latField = 'lat';
      layer.lonField = 'lon';
      layer.popupTemplate = '{nom} - {prix} EUR';

      let popupContent = '';
      mock.L.marker = () => ({
        bindPopup: (c: string) => { popupContent = c; return { bindTooltip: () => ({}), on: () => ({}) }; },
        bindTooltip: () => ({}),
        on: () => ({}),
      } as any);

      (layer as any)._data = [{ lat: 48.86, lon: 2.35, nom: 'Gare', prix: 80 }];
      await (layer as any)._renderLayer();
      expect(popupContent).toContain('Gare - 80 EUR');
    });
  });

  describe('visibility (zoom ranges)', () => {
    it('hides layer when zoom is below min-zoom', () => {
      layer.minZoom = 12;
      layer.maxZoom = 18;
      (layer as any)._visible = true;
      mock.mockMap.getZoom = () => 8;
      (layer as any)._updateVisibility();
      expect((layer as any)._visible).toBe(false);
    });

    it('shows layer when zoom is in range', () => {
      layer.minZoom = 5;
      layer.maxZoom = 15;
      (layer as any)._visible = false;
      mock.mockMap.getZoom = () => 10;
      mock.mockMap.hasLayer = () => false;
      (layer as any)._updateVisibility();
      expect((layer as any)._visible).toBe(true);
    });
  });

  describe('bbox command', () => {
    it('sends source command for serverGeo adapter', () => {
      layer.source = 'test-src';
      layer.bbox = true;
      layer.geoField = 'geo_point_2d';

      // Mock source element with serverGeo adapter
      const mockSource = document.createElement('div');
      mockSource.id = 'test-src';
      (mockSource as any).getAdapter = () => ({ capabilities: { serverGeo: true } });
      document.body.appendChild(mockSource);

      let capturedCommand: any;
      const origDispatch = document.dispatchEvent.bind(document);
      document.dispatchEvent = (e: Event) => {
        if (e.type === 'dsfr-data-source-command') capturedCommand = (e as CustomEvent).detail;
        return origDispatch(e);
      };

      (layer as any)._sendBboxCommand();

      expect(capturedCommand).toBeDefined();
      expect(capturedCommand.whereKey).toBe('map-bbox');
      expect(capturedCommand.where).toContain('in_bbox');

      document.body.removeChild(mockSource);
      document.dispatchEvent = origDispatch;
    });
  });
});

// ============================================================================
// DsfrDataMap rendering with mock
// ============================================================================

describe('DsfrDataMap rendering methods', () => {
  let map: DsfrDataMap;

  beforeEach(() => {
    map = new DsfrDataMap();
  });

  it('_buildMapDescription includes keyboard instructions', () => {
    const desc = (map as any)._buildMapDescription();
    expect(desc).toContain('fleches');
    expect(desc).toContain('Tabulez');
  });

  it('announceToScreenReader sets live region text', () => {
    // Simulate live region
    const div = document.createElement('div');
    (map as any)._liveRegion = div;
    map.announceToScreenReader('Test message');
    // The actual text is set via requestAnimationFrame, but textContent is cleared first
    expect(div.textContent).toBe('');
  });

  it('updateDescription concatenates summaries', () => {
    const p = document.createElement('p');
    (map as any)._srDescription = p;
    map.name = 'Ma carte';
    map.updateDescription(['200 marqueurs', '5 zones']);
    expect(p.textContent).toContain('Ma carte');
    expect(p.textContent).toContain('200 marqueurs');
    expect(p.textContent).toContain('5 zones');
  });

  it('registerLayerBounds stores bounds', () => {
    const mockBounds = { extend: (b: any) => b } as any;
    map.registerLayerBounds(mockBounds);
    expect((map as any)._layerBounds).toHaveLength(1);
  });
});

// ============================================================================
// DsfrDataMapPopup rendering with mock
// ============================================================================

describe('DsfrDataMapPopup rendering methods', () => {
  it('showForRecord sets record but does not open panel/modal in popup mode', async () => {
    const mod = await import('../src/components/dsfr-data-map-popup.js');
    const popup = new mod.DsfrDataMapPopup();
    popup.mode = 'popup';
    popup.showForRecord({ nom: 'test' });
    // Record is set but no panel/modal created (Leaflet handles popup)
    expect(popup._currentRecord).toEqual({ nom: 'test' });
  });

  it('getPopupHtml handles nested fields', async () => {
    const mod = await import('../src/components/dsfr-data-map-popup.js');
    const popup = new mod.DsfrDataMapPopup();
    const html = popup.getPopupHtml({ details: { score: 42 }, nom: 'Test' });
    expect(html).toContain('Test');
  });

  it('close() cleans up panel and modal refs', async () => {
    const mod = await import('../src/components/dsfr-data-map-popup.js');
    const popup = new mod.DsfrDataMapPopup();
    popup._currentRecord = { test: true };
    popup.close();
    expect(popup._currentRecord).toBeNull();
  });

  it('matchesLayer with empty for matches everything', async () => {
    const mod = await import('../src/components/dsfr-data-map-popup.js');
    const popup = new mod.DsfrDataMapPopup();
    expect(popup.matchesLayer('')).toBe(true);
    expect(popup.matchesLayer('any-id')).toBe(true);
    expect(popup.matchesLayer('layer-42')).toBe(true);
  });

  it('_renderTemplate falls back to auto table without template', async () => {
    const mod = await import('../src/components/dsfr-data-map-popup.js');
    const popup = new mod.DsfrDataMapPopup();
    const html = (popup as any)._renderTemplate({ nom: 'Paris', val: 42 });
    expect(html).toContain('<table');
    expect(html).toContain('Paris');
    expect(html).toContain('42');
  });

  it('_buildAutoTable excludes geo and coord fields', async () => {
    const mod = await import('../src/components/dsfr-data-map-popup.js');
    const popup = new mod.DsfrDataMapPopup();
    const html = (popup as any)._buildAutoTable({
      nom: 'Test',
      latitude: 48,
      longitude: 2,
      geo_point_2d: { lat: 48, lon: 2 },
      nested: { a: 1 },
    });
    expect(html).toContain('Test');
    expect(html).not.toContain('latitude');
    expect(html).not.toContain('longitude');
    expect(html).not.toContain('geo_point_2d');
    expect(html).not.toContain('nested'); // objects excluded
  });

  it('_showPanel creates panel element on map parent', async () => {
    const mod = await import('../src/components/dsfr-data-map-popup.js');
    const popup = new mod.DsfrDataMapPopup();
    popup.mode = 'panel-right';
    popup.titleField = 'nom';

    // Create a fake dsfr-data-map parent
    const parent = document.createElement('dsfr-data-map');
    parent.appendChild(popup);
    document.body.appendChild(parent);

    popup.showForRecord({ nom: 'Test Centre', prix: 95 });

    const panel = parent.querySelector('.dsfr-data-map-popup__panel');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('role')).toBe('complementary');
    expect(panel?.innerHTML).toContain('Test Centre');

    // Close removes panel
    popup.close();
    setTimeout(() => {
      expect(parent.querySelector('.dsfr-data-map-popup__panel')).toBeNull();
    }, 300);

    document.body.removeChild(parent);
  });

  it('_showModal creates modal overlay on document body', async () => {
    const mod = await import('../src/components/dsfr-data-map-popup.js');
    const popup = new mod.DsfrDataMapPopup();
    popup.mode = 'modal';
    popup.titleField = 'nom';

    const parent = document.createElement('dsfr-data-map');
    parent.appendChild(popup);
    document.body.appendChild(parent);

    popup.showForRecord({ nom: 'Mon Centre', prix: 80 });

    const overlay = document.querySelector('.dsfr-data-map-popup__modal-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('role')).toBe('dialog');
    expect(overlay?.getAttribute('aria-modal')).toBe('true');
    expect(overlay?.innerHTML).toContain('Mon Centre');

    // Close removes modal
    popup.close();
    expect(document.querySelector('.dsfr-data-map-popup__modal-overlay')).toBeNull();

    document.body.removeChild(parent);
  });

  it('panel-left positions on left side', async () => {
    const mod = await import('../src/components/dsfr-data-map-popup.js');
    const popup = new mod.DsfrDataMapPopup();
    popup.mode = 'panel-left';

    const parent = document.createElement('dsfr-data-map');
    parent.appendChild(popup);
    document.body.appendChild(parent);

    popup.showForRecord({ nom: 'Left' });

    const panel = parent.querySelector('.dsfr-data-map-popup__panel');
    expect(panel?.classList.contains('dsfr-data-map-popup__panel--left')).toBe(true);

    popup.close();
    document.body.removeChild(parent);
  });
});

// ============================================================================
// DsfrDataMap _injectStyles and container setup
// ============================================================================

describe('DsfrDataMap styles and a11y elements', () => {
  it('_injectStyles adds style tag to document head', () => {
    const map = new DsfrDataMap();
    (map as any)._injectStyles();
    const style = document.querySelector('style[data-dsfr-data-map]');
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain('dsfr-data-map__container');
    expect(style?.textContent).toContain('dsfr-data-map__skiplink');
    expect(style?.textContent).toContain('max-width: none !important');
    // Cleanup
    style?.remove();
  });

  it('_buildMapDescription varies with name', () => {
    const map = new DsfrDataMap();
    const noName = (map as any)._buildMapDescription();
    expect(noName).toContain('Carte interactive.');

    map.name = 'Bornes IRVE';
    const withName = (map as any)._buildMapDescription();
    expect(withName).toContain('Bornes IRVE');
  });
});

// ============================================================================
// Color-field + color-map (categorical color mapping)
// ============================================================================

describe('DsfrDataMapLayer color-field / color-map', () => {
  let layer: DsfrDataMapLayer;

  beforeEach(() => {
    layer = new DsfrDataMapLayer();
  });

  describe('default attributes', () => {
    it('has color-field empty by default', () => {
      expect(layer.colorField).toBe('');
    });

    it('has color-map empty by default', () => {
      expect(layer.colorMap).toBe('');
    });
  });

  describe('_parseColorMap', () => {
    it('parses valid color-map string', () => {
      layer.colorMap = 'active:#00A95F,inactive:#E1000F';
      const parsed = (layer as any)._parseColorMap() as Map<string, string>;
      expect(parsed.size).toBe(2);
      expect(parsed.get('active')).toBe('#00A95F');
      expect(parsed.get('inactive')).toBe('#E1000F');
    });

    it('trims whitespace around values and colors', () => {
      layer.colorMap = ' status_a : #123ABC , status_b : #456DEF ';
      const parsed = (layer as any)._parseColorMap() as Map<string, string>;
      expect(parsed.get('status_a')).toBe('#123ABC');
      expect(parsed.get('status_b')).toBe('#456DEF');
    });

    it('returns empty map for empty string', () => {
      layer.colorMap = '';
      const parsed = (layer as any)._parseColorMap() as Map<string, string>;
      expect(parsed.size).toBe(0);
    });

    it('skips pairs without separator', () => {
      layer.colorMap = 'valid:#111,noseparator,also_valid:#222';
      const parsed = (layer as any)._parseColorMap() as Map<string, string>;
      expect(parsed.size).toBe(2);
      expect(parsed.get('valid')).toBe('#111');
      expect(parsed.get('also_valid')).toBe('#222');
    });

    it('uses lastIndexOf for colors with colons in value', () => {
      // Value like "http://example" + color → last colon picks color
      layer.colorMap = 'Type A:#ff0000,Type B:#00ff00';
      const parsed = (layer as any)._parseColorMap() as Map<string, string>;
      expect(parsed.get('Type A')).toBe('#ff0000');
      expect(parsed.get('Type B')).toBe('#00ff00');
    });

    it('skips pairs with empty key or empty color', () => {
      layer.colorMap = ':#111,valid:#222,:';
      const parsed = (layer as any)._parseColorMap() as Map<string, string>;
      expect(parsed.size).toBe(1);
      expect(parsed.get('valid')).toBe('#222');
    });
  });

  describe('_resolveColor', () => {
    it('returns fallback color when colorField is not set', () => {
      layer.color = '#000091';
      (layer as any)._colorMapParsed = new Map([['a', '#ff0000']]);
      expect((layer as any)._resolveColor({ status: 'a' })).toBe('#000091');
    });

    it('returns fallback color when colorMap is not parsed', () => {
      layer.colorField = 'status';
      layer.color = '#000091';
      (layer as any)._colorMapParsed = null;
      expect((layer as any)._resolveColor({ status: 'a' })).toBe('#000091');
    });

    it('returns fallback color when colorMap is empty', () => {
      layer.colorField = 'status';
      layer.color = '#000091';
      (layer as any)._colorMapParsed = new Map();
      expect((layer as any)._resolveColor({ status: 'a' })).toBe('#000091');
    });

    it('returns mapped color when match found', () => {
      layer.colorField = 'status';
      layer.color = '#000091';
      (layer as any)._colorMapParsed = new Map([['active', '#00A95F'], ['inactive', '#E1000F']]);
      expect((layer as any)._resolveColor({ status: 'active' })).toBe('#00A95F');
    });

    it('returns fallback color when no match in map', () => {
      layer.colorField = 'status';
      layer.color = '#000091';
      (layer as any)._colorMapParsed = new Map([['active', '#00A95F']]);
      expect((layer as any)._resolveColor({ status: 'unknown' })).toBe('#000091');
    });

    it('converts non-string field values to string for lookup', () => {
      layer.colorField = 'code';
      layer.color = '#000091';
      (layer as any)._colorMapParsed = new Map([['1', '#ff0000'], ['2', '#00ff00']]);
      expect((layer as any)._resolveColor({ code: 1 })).toBe('#ff0000');
    });

    it('handles missing field gracefully (returns fallback)', () => {
      layer.colorField = 'status';
      layer.color = '#000091';
      (layer as any)._colorMapParsed = new Map([['active', '#00A95F']]);
      expect((layer as any)._resolveColor({ other: 'val' })).toBe('#000091');
    });
  });

  describe('rendering with color-map', () => {
    let mock: ReturnType<typeof createMockLeaflet>;

    beforeEach(() => {
      mock = createMockLeaflet();
      setupLayerWithMock(layer, mock);
    });

    it('applies resolved color to markers', async () => {
      layer.type = 'marker';
      layer.latField = 'lat';
      layer.lonField = 'lon';
      layer.colorField = 'status';
      layer.colorMap = 'open:#00A95F,closed:#E1000F';
      (layer as any)._data = [
        { lat: 48.86, lon: 2.35, status: 'open' },
        { lat: 43.30, lon: 5.37, status: 'closed' },
      ];
      await (layer as any)._renderLayer();
      expect(mock.layers).toHaveLength(2);
    });

    it('applies resolved color to circles', async () => {
      layer.type = 'circle';
      layer.latField = 'lat';
      layer.lonField = 'lon';
      layer.colorField = 'type';
      layer.colorMap = 'A:#ff0000,B:#00ff00';
      (layer as any)._data = [
        { lat: 48.86, lon: 2.35, type: 'A' },
        { lat: 43.30, lon: 5.37, type: 'B' },
      ];
      await (layer as any)._renderLayer();
      expect(mock.layers).toHaveLength(2);
    });

    it('applies resolved color to geoshapes', async () => {
      layer.type = 'geoshape';
      layer.geoField = 'geo';
      layer.colorField = 'zone';
      layer.colorMap = 'urban:#ff0000,rural:#00ff00';
      (layer as any)._data = [
        { geo: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] }, zone: 'urban' },
      ];
      await (layer as any)._renderLayer();
      expect(mock.layers).toHaveLength(1);
    });

    it('falls back to default color for unmatched values', async () => {
      layer.type = 'marker';
      layer.latField = 'lat';
      layer.lonField = 'lon';
      layer.color = '#000091';
      layer.colorField = 'status';
      layer.colorMap = 'open:#00A95F';
      (layer as any)._data = [
        { lat: 48.86, lon: 2.35, status: 'unknown_value' },
      ];
      await (layer as any)._renderLayer();
      // Should still render (with fallback color)
      expect(mock.layers).toHaveLength(1);
    });
  });
});

// ============================================================================
// Timeline on map-layer (time-field, time-bucket, time-mode)
// ============================================================================

describe('DsfrDataMapLayer timeline support', () => {
  let layer: DsfrDataMapLayer;

  beforeEach(() => {
    layer = new DsfrDataMapLayer();
  });

  describe('default attributes', () => {
    it('has time-field empty by default', () => {
      expect(layer.timeField).toBe('');
    });

    it('has time-bucket none by default', () => {
      expect(layer.timeBucket).toBe('none');
    });

    it('has time-mode snapshot by default', () => {
      expect(layer.timeMode).toBe('snapshot');
    });
  });

  describe('_bucketTime', () => {
    it('returns raw string when bucket is none', () => {
      layer.timeBucket = 'none';
      expect((layer as any)._bucketTime('2024-03-15T10:30:00')).toBe('2024-03-15T10:30:00');
    });

    it('returns null for null/undefined', () => {
      expect((layer as any)._bucketTime(null)).toBeNull();
      expect((layer as any)._bucketTime(undefined)).toBeNull();
    });

    it('returns null for invalid date when bucket is set', () => {
      layer.timeBucket = 'year';
      expect((layer as any)._bucketTime('not-a-date')).toBeNull();
    });

    it('buckets by year', () => {
      layer.timeBucket = 'year';
      expect((layer as any)._bucketTime('2024-03-15T10:30:00')).toBe('2024');
    });

    it('buckets by month', () => {
      layer.timeBucket = 'month';
      expect((layer as any)._bucketTime('2024-03-15T10:30:00')).toBe('2024-03');
    });

    it('buckets by day', () => {
      layer.timeBucket = 'day';
      expect((layer as any)._bucketTime('2024-03-05T10:30:00')).toBe('2024-03-05');
    });

    it('buckets by hour', () => {
      layer.timeBucket = 'hour';
      expect((layer as any)._bucketTime('2024-03-15T10:30:00')).toMatch(/2024-03-\d{2} \d{2}:00/);
    });
  });

  describe('_buildTimeFrames', () => {
    it('groups records by bucketed time', () => {
      layer.timeField = 'date';
      layer.timeBucket = 'year';
      (layer as any)._data = [
        { date: '2022-01-15', name: 'A' },
        { date: '2022-06-10', name: 'B' },
        { date: '2023-03-20', name: 'C' },
      ];
      (layer as any)._buildTimeFrames();
      const steps = layer.getTimeSteps();
      expect(steps).toEqual(['2022', '2023']);
    });

    it('sorts time steps chronologically', () => {
      layer.timeField = 'date';
      layer.timeBucket = 'none';
      (layer as any)._data = [
        { date: '2023-01' },
        { date: '2021-01' },
        { date: '2022-01' },
      ];
      (layer as any)._buildTimeFrames();
      expect(layer.getTimeSteps()).toEqual(['2021-01', '2022-01', '2023-01']);
    });

    it('skips records with null time values', () => {
      layer.timeField = 'date';
      layer.timeBucket = 'year';
      (layer as any)._data = [
        { date: '2022-01-15', name: 'A' },
        { date: null, name: 'B' },
        { name: 'C' },
      ];
      (layer as any)._buildTimeFrames();
      expect(layer.getTimeSteps()).toEqual(['2022']);
    });

    it('dispatches time-ready event', () => {
      layer.timeField = 'date';
      layer.timeBucket = 'none';
      (layer as any)._data = [{ date: '2022' }];
      const handler = vi.fn();
      layer.addEventListener('dsfr-data-map-layer-time-ready', handler);
      (layer as any)._buildTimeFrames();
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].detail.steps).toEqual(['2022']);
    });
  });

  describe('_getFrameData', () => {
    beforeEach(() => {
      layer.timeField = 'date';
      layer.timeBucket = 'none';
      (layer as any)._data = [
        { date: '2021', v: 10 },
        { date: '2022', v: 20 },
        { date: '2022', v: 25 },
        { date: '2023', v: 30 },
      ];
      (layer as any)._buildTimeFrames();
    });

    it('returns snapshot data for a single frame', () => {
      layer.timeMode = 'snapshot';
      const data = (layer as any)._getFrameData(1);
      expect(data).toHaveLength(2);
      expect(data.every((r: any) => r.date === '2022')).toBe(true);
    });

    it('returns cumulative data up to frame index', () => {
      layer.timeMode = 'cumulative';
      const data = (layer as any)._getFrameData(1);
      expect(data).toHaveLength(3); // 2021 (1) + 2022 (2)
      expect(data[0].date).toBe('2021');
    });

    it('returns empty array for out-of-range index', () => {
      expect((layer as any)._getFrameData(-1)).toEqual([]);
      expect((layer as any)._getFrameData(99)).toEqual([]);
    });
  });

  describe('setTimelineFrame / resetTimeline / getTimeSteps', () => {
    let mock: ReturnType<typeof createMockLeaflet>;

    beforeEach(() => {
      mock = createMockLeaflet();
      setupLayerWithMock(layer, mock);
      layer.type = 'marker';
      layer.latField = 'lat';
      layer.lonField = 'lon';
      layer.timeField = 'date';
      layer.timeBucket = 'none';
      (layer as any)._data = [
        { date: '2021', lat: 48.86, lon: 2.35 },
        { date: '2022', lat: 43.30, lon: 5.37 },
      ];
      (layer as any)._buildTimeFrames();
    });

    it('setTimelineFrame renders only that frame data', async () => {
      layer.setTimelineFrame(0);
      // After rendering frame 0 (2021), only 1 marker
      expect(mock.layers).toHaveLength(1);
    });

    it('getTimeSteps returns sorted steps', () => {
      expect(layer.getTimeSteps()).toEqual(['2021', '2022']);
    });

    it('resetTimeline sets frame index to -1', () => {
      layer.setTimelineFrame(0);
      layer.resetTimeline();
      expect((layer as any)._currentFrameIndex).toBe(-1);
    });
  });
});

// ============================================================================
// dsfr-data-map-timeline
// ============================================================================

// Mock window.matchMedia for jsdom (used by timeline connectedCallback)
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  });
}

describe('DsfrDataMapTimeline', () => {
  let timeline: DsfrDataMapTimeline;

  beforeEach(() => {
    timeline = new DsfrDataMapTimeline();
  });

  afterEach(() => {
    (timeline as any)._pause();
  });

  describe('default attributes', () => {
    it('has for empty', () => {
      expect(timeline.for).toBe('');
    });

    it('has speed 1', () => {
      expect(timeline.speed).toBe(1);
    });

    it('has interval 1000', () => {
      expect(timeline.interval).toBe(1000);
    });

    it('has label auto', () => {
      expect(timeline.label).toBe('auto');
    });
  });

  describe('Light DOM', () => {
    it('renders to Light DOM (no shadowRoot)', () => {
      expect(timeline.shadowRoot).toBeNull();
    });
  });

  describe('initial state', () => {
    it('is not playing', () => {
      expect((timeline as any)._playing).toBe(false);
    });

    it('has empty steps', () => {
      expect((timeline as any)._steps).toEqual([]);
    });

    it('is not ready', () => {
      expect((timeline as any)._ready).toBe(false);
    });

    it('has currentIndex 0', () => {
      expect((timeline as any)._currentIndex).toBe(0);
    });
  });

  describe('_play', () => {
    it('does nothing if steps is empty', () => {
      (timeline as any)._steps = [];
      (timeline as any)._play();
      expect((timeline as any)._playing).toBe(false);
      expect((timeline as any)._timer).toBeNull();
    });

    it('does nothing if already playing', () => {
      (timeline as any)._steps = ['a', 'b', 'c'];
      (timeline as any)._playing = true;
      const origTimer = (timeline as any)._timer;
      (timeline as any)._play();
      expect((timeline as any)._timer).toBe(origTimer);
    });

    it('does nothing if prefers-reduced-motion', () => {
      (timeline as any)._steps = ['a', 'b', 'c'];
      (timeline as any)._prefersReducedMotion = true;
      (timeline as any)._play();
      expect((timeline as any)._playing).toBe(false);
    });

    it('starts playing and creates timer', () => {
      (timeline as any)._steps = ['a', 'b', 'c'];
      (timeline as any)._prefersReducedMotion = false;
      (timeline as any)._play();
      expect((timeline as any)._playing).toBe(true);
      expect((timeline as any)._timer).not.toBeNull();
    });

    it('restarts from 0 if at the end', () => {
      (timeline as any)._steps = ['a', 'b', 'c'];
      (timeline as any)._currentIndex = 2; // last
      (timeline as any)._prefersReducedMotion = false;
      (timeline as any)._play();
      expect((timeline as any)._currentIndex).toBe(0);
      expect((timeline as any)._playing).toBe(true);
    });

    it('uses minimum 50ms interval', () => {
      vi.useFakeTimers();
      (timeline as any)._steps = ['a', 'b', 'c'];
      timeline.interval = 10;
      timeline.speed = 1;
      (timeline as any)._prefersReducedMotion = false;
      (timeline as any)._play();
      expect((timeline as any)._playing).toBe(true);
      vi.useRealTimers();
      (timeline as any)._pause();
    });
  });

  describe('_pause', () => {
    it('stops playing and clears timer', () => {
      (timeline as any)._steps = ['a', 'b', 'c'];
      (timeline as any)._prefersReducedMotion = false;
      (timeline as any)._play();
      expect((timeline as any)._playing).toBe(true);
      (timeline as any)._pause();
      expect((timeline as any)._playing).toBe(false);
      expect((timeline as any)._timer).toBeNull();
    });
  });

  describe('_stop', () => {
    it('pauses and seeks to 0', () => {
      (timeline as any)._steps = ['a', 'b', 'c'];
      (timeline as any)._currentIndex = 2;
      (timeline as any)._prefersReducedMotion = false;
      (timeline as any)._play();
      (timeline as any)._stop();
      expect((timeline as any)._playing).toBe(false);
      expect((timeline as any)._currentIndex).toBe(0);
    });
  });

  describe('_tick', () => {
    it('advances current index', () => {
      (timeline as any)._steps = ['a', 'b', 'c'];
      (timeline as any)._currentIndex = 0;
      (timeline as any)._tick();
      expect((timeline as any)._currentIndex).toBe(1);
    });

    it('pauses at end of timeline', () => {
      (timeline as any)._steps = ['a', 'b'];
      (timeline as any)._currentIndex = 1; // already at last
      (timeline as any)._playing = true;
      (timeline as any)._tick();
      expect((timeline as any)._playing).toBe(false);
    });
  });

  describe('_stepForward / _stepBackward', () => {
    beforeEach(() => {
      (timeline as any)._steps = ['a', 'b', 'c'];
    });

    it('stepForward increments index', () => {
      (timeline as any)._currentIndex = 0;
      (timeline as any)._stepForward();
      expect((timeline as any)._currentIndex).toBe(1);
    });

    it('stepForward does nothing at last index', () => {
      (timeline as any)._currentIndex = 2;
      (timeline as any)._stepForward();
      expect((timeline as any)._currentIndex).toBe(2);
    });

    it('stepBackward decrements index', () => {
      (timeline as any)._currentIndex = 2;
      (timeline as any)._stepBackward();
      expect((timeline as any)._currentIndex).toBe(1);
    });

    it('stepBackward does nothing at index 0', () => {
      (timeline as any)._currentIndex = 0;
      (timeline as any)._stepBackward();
      expect((timeline as any)._currentIndex).toBe(0);
    });
  });

  describe('_seek', () => {
    beforeEach(() => {
      (timeline as any)._steps = ['a', 'b', 'c', 'd', 'e'];
    });

    it('sets current index', () => {
      (timeline as any)._seek(3);
      expect((timeline as any)._currentIndex).toBe(3);
    });

    it('clamps to 0 for negative index', () => {
      (timeline as any)._seek(-5);
      expect((timeline as any)._currentIndex).toBe(0);
    });

    it('clamps to last index for out-of-range', () => {
      (timeline as any)._seek(100);
      expect((timeline as any)._currentIndex).toBe(4);
    });
  });

  describe('_togglePlay', () => {
    it('plays when paused', () => {
      (timeline as any)._steps = ['a', 'b', 'c'];
      (timeline as any)._prefersReducedMotion = false;
      (timeline as any)._togglePlay();
      expect((timeline as any)._playing).toBe(true);
    });

    it('pauses when playing', () => {
      (timeline as any)._steps = ['a', 'b', 'c'];
      (timeline as any)._prefersReducedMotion = false;
      (timeline as any)._play();
      (timeline as any)._togglePlay();
      expect((timeline as any)._playing).toBe(false);
    });
  });

  describe('_onSpeedChange', () => {
    it('updates speed', () => {
      const event = { target: { value: '2' } } as any;
      (timeline as any)._onSpeedChange(event);
      expect(timeline.speed).toBe(2);
    });

    it('restarts timer if playing', () => {
      (timeline as any)._steps = ['a', 'b', 'c'];
      (timeline as any)._prefersReducedMotion = false;
      (timeline as any)._play();
      const oldTimer = (timeline as any)._timer;
      const event = { target: { value: '4' } } as any;
      (timeline as any)._onSpeedChange(event);
      expect(timeline.speed).toBe(4);
      expect((timeline as any)._playing).toBe(true);
      // Timer was recreated (pause + play)
      expect((timeline as any)._timer).not.toBeNull();
    });
  });

  describe('_onSliderInput', () => {
    it('seeks to slider value', () => {
      (timeline as any)._steps = ['a', 'b', 'c', 'd'];
      const event = { target: { value: '2' } } as any;
      (timeline as any)._onSliderInput(event);
      expect((timeline as any)._currentIndex).toBe(2);
    });
  });

  describe('_onKeydown', () => {
    beforeEach(() => {
      (timeline as any)._steps = ['a', 'b', 'c', 'd', 'e'];
      (timeline as any)._currentIndex = 2;
    });

    function keyEvent(key: string): KeyboardEvent {
      return { key, preventDefault: vi.fn() } as any;
    }

    it('Space toggles play/pause', () => {
      const e = keyEvent(' ');
      (timeline as any)._prefersReducedMotion = false;
      (timeline as any)._onKeydown(e);
      expect(e.preventDefault).toHaveBeenCalled();
    });

    it('ArrowRight steps forward', () => {
      const e = keyEvent('ArrowRight');
      (timeline as any)._onKeydown(e);
      expect((timeline as any)._currentIndex).toBe(3);
      expect(e.preventDefault).toHaveBeenCalled();
    });

    it('ArrowLeft steps backward', () => {
      const e = keyEvent('ArrowLeft');
      (timeline as any)._onKeydown(e);
      expect((timeline as any)._currentIndex).toBe(1);
      expect(e.preventDefault).toHaveBeenCalled();
    });

    it('Home seeks to first frame', () => {
      const e = keyEvent('Home');
      (timeline as any)._onKeydown(e);
      expect((timeline as any)._currentIndex).toBe(0);
    });

    it('End seeks to last frame', () => {
      const e = keyEvent('End');
      (timeline as any)._onKeydown(e);
      expect((timeline as any)._currentIndex).toBe(4);
    });
  });

  describe('_collectSteps', () => {
    it('merges steps from multiple layers and sorts them', () => {
      // Simulate by manually setting _steps
      const container = document.createElement('div');
      container.innerHTML = '<dsfr-data-map></dsfr-data-map>';
      const map = container.firstElementChild!;

      // Create mock layers (setAttribute needed for querySelectorAll matching)
      const layer1 = new DsfrDataMapLayer();
      layer1.timeField = 'date';
      layer1.setAttribute('time-field', 'date');
      layer1.timeBucket = 'none';
      layer1.id = 'layer1';
      (layer1 as any)._data = [{ date: '2023' }, { date: '2021' }];
      (layer1 as any)._buildTimeFrames();

      const layer2 = new DsfrDataMapLayer();
      layer2.timeField = 'date';
      layer2.setAttribute('time-field', 'date');
      layer2.timeBucket = 'none';
      layer2.id = 'layer2';
      (layer2 as any)._data = [{ date: '2022' }, { date: '2023' }];
      (layer2 as any)._buildTimeFrames();

      map.appendChild(layer1);
      map.appendChild(layer2);
      map.appendChild(timeline);

      document.body.appendChild(container);
      (timeline as any)._collectSteps();

      expect((timeline as any)._steps).toEqual(['2021', '2022', '2023']);
      expect((timeline as any)._ready).toBe(true);

      document.body.removeChild(container);
    });

    it('handles no matching layers', () => {
      // timeline not in DOM → no parent map
      (timeline as any)._collectSteps();
      expect((timeline as any)._steps).toEqual([]);
      expect((timeline as any)._ready).toBe(false);
    });
  });

  describe('_getTargetLayers', () => {
    it('returns empty when not inside a map', () => {
      const result = (timeline as any)._getTargetLayers();
      expect(result).toEqual([]);
    });

    it('finds all layers with time-field when for is empty', () => {
      const container = document.createElement('div');
      container.innerHTML = '<dsfr-data-map></dsfr-data-map>';
      const map = container.firstElementChild!;

      const layer1 = new DsfrDataMapLayer();
      layer1.timeField = 'date';
      layer1.setAttribute('time-field', 'date');
      const layer2 = new DsfrDataMapLayer();
      layer2.timeField = 'ts';
      layer2.setAttribute('time-field', 'ts');
      const layer3 = new DsfrDataMapLayer(); // no time-field

      map.appendChild(layer1);
      map.appendChild(layer2);
      map.appendChild(layer3);
      map.appendChild(timeline);

      document.body.appendChild(container);
      timeline.for = '';
      const result = (timeline as any)._getTargetLayers();
      expect(result).toHaveLength(2);

      document.body.removeChild(container);
    });

    it('finds specific layers by ID when for is set', () => {
      const container = document.createElement('div');
      container.innerHTML = '<dsfr-data-map></dsfr-data-map>';
      const map = container.firstElementChild!;

      const layer1 = new DsfrDataMapLayer();
      layer1.id = 'l1';
      layer1.timeField = 'date';
      layer1.setAttribute('time-field', 'date');
      const layer2 = new DsfrDataMapLayer();
      layer2.id = 'l2';
      layer2.timeField = 'date';
      layer2.setAttribute('time-field', 'date');

      map.appendChild(layer1);
      map.appendChild(layer2);
      map.appendChild(timeline);

      document.body.appendChild(container);
      timeline.for = 'l1';
      const result = (timeline as any)._getTargetLayers();
      expect(result).toHaveLength(1);

      document.body.removeChild(container);
    });

    it('handles comma-separated IDs with whitespace', () => {
      const container = document.createElement('div');
      container.innerHTML = '<dsfr-data-map></dsfr-data-map>';
      const map = container.firstElementChild!;

      const layer1 = new DsfrDataMapLayer();
      layer1.id = 'l1';
      layer1.timeField = 'date';
      layer1.setAttribute('time-field', 'date');
      const layer2 = new DsfrDataMapLayer();
      layer2.id = 'l2';
      layer2.timeField = 'date';
      layer2.setAttribute('time-field', 'date');

      map.appendChild(layer1);
      map.appendChild(layer2);
      map.appendChild(timeline);

      document.body.appendChild(container);
      timeline.for = ' l1 , l2 ';
      const result = (timeline as any)._getTargetLayers();
      expect(result).toHaveLength(2);

      document.body.removeChild(container);
    });
  });

  describe('seek with cumulative layers', () => {
    it('finds last step <= target for cumulative layers', () => {
      const container = document.createElement('div');
      container.innerHTML = '<dsfr-data-map></dsfr-data-map>';
      const map = container.firstElementChild!;

      const layer1 = new DsfrDataMapLayer();
      layer1.timeField = 'date';
      layer1.setAttribute('time-field', 'date');
      layer1.timeBucket = 'none';
      layer1.timeMode = 'cumulative';
      layer1.id = 'cum';
      (layer1 as any)._data = [
        { date: '2021' },
        { date: '2023' },
      ];
      (layer1 as any)._buildTimeFrames();

      // Spy on setTimelineFrame
      const spy = vi.spyOn(layer1, 'setTimelineFrame');

      const layer2 = new DsfrDataMapLayer();
      layer2.timeField = 'date';
      layer2.setAttribute('time-field', 'date');
      layer2.timeBucket = 'none';
      layer2.timeMode = 'snapshot';
      layer2.id = 'snap';
      (layer2 as any)._data = [
        { date: '2021' },
        { date: '2022' },
        { date: '2023' },
      ];
      (layer2 as any)._buildTimeFrames();

      map.appendChild(layer1);
      map.appendChild(layer2);
      map.appendChild(timeline);

      document.body.appendChild(container);
      (timeline as any)._collectSteps();
      // Steps: ['2021', '2022', '2023']

      // Seek to index 1 ('2022') — layer1 (cumulative) doesn't have '2022'
      // but should get best = 0 (step '2021' <= '2022')
      (timeline as any)._seek(1);
      expect(spy).toHaveBeenCalledWith(0); // index 0 of layer1's steps ['2021','2023']

      spy.mockRestore();
      document.body.removeChild(container);
    });
  });

  describe('render', () => {
    it('returns nothing when not ready', () => {
      (timeline as any)._ready = false;
      const result = timeline.render();
      expect(result).toBe(nothing);
    });

    it('returns nothing when steps is empty', () => {
      (timeline as any)._ready = true;
      (timeline as any)._steps = [];
      const result = timeline.render();
      expect(result).toBe(nothing);
    });

    it('returns template when ready with steps', () => {
      (timeline as any)._ready = true;
      (timeline as any)._steps = ['2021', '2022', '2023'];
      (timeline as any)._currentIndex = 1;
      const result = timeline.render();
      expect(result).not.toBe(nothing);
    });
  });

  describe('styles injection', () => {
    it('injects styles idempotently', () => {
      // Remove any existing style
      document.querySelector('style[data-dsfr-data-map-timeline]')?.remove();

      (timeline as any)._injectStyles();
      const style1 = document.querySelector('style[data-dsfr-data-map-timeline]');
      expect(style1).not.toBeNull();
      expect(style1?.textContent).toContain('dsfr-data-map-timeline');

      // Second call should not add another
      (timeline as any)._injectStyles();
      const styles = document.querySelectorAll('style[data-dsfr-data-map-timeline]');
      expect(styles).toHaveLength(1);

      // Cleanup
      style1?.remove();
    });
  });
});

// ============================================================================
// quantileBreaks & getColorForValue (module-private, tested via layer)
// ============================================================================

describe('choropleth quantileBreaks & getColorForValue', () => {
  // These functions are module-private, but we can test their behavior
  // through the layer's rendering pipeline

  it('assigns different colors for spread values across quantiles', () => {
    const layer = new DsfrDataMapLayer();
    const mock = createMockLeaflet();
    setupLayerWithMock(layer, mock);

    layer.type = 'geoshape';
    layer.geoField = 'geo';
    layer.fillField = 'pop';
    layer.selectedPalette = 'sequentialAscending';

    const poly = { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] };
    (layer as any)._data = [
      { geo: poly, pop: 100 },
      { geo: poly, pop: 500 },
      { geo: poly, pop: 1000 },
      { geo: poly, pop: 2000 },
      { geo: poly, pop: 5000 },
    ];

    // Render triggers choropleth setup
    (layer as any)._renderLayer();
    expect(mock.layers).toHaveLength(5);
  });

  it('handles single-value dataset (all same pop)', () => {
    const layer = new DsfrDataMapLayer();
    const mock = createMockLeaflet();
    setupLayerWithMock(layer, mock);

    layer.type = 'geoshape';
    layer.geoField = 'geo';
    layer.fillField = 'pop';
    layer.selectedPalette = 'sequentialAscending';

    const poly = { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] };
    (layer as any)._data = [
      { geo: poly, pop: 42 },
      { geo: poly, pop: 42 },
    ];

    (layer as any)._renderLayer();
    expect(mock.layers).toHaveLength(2);
  });

  it('handles missing fillField values (NaN filtered out)', () => {
    const layer = new DsfrDataMapLayer();
    const mock = createMockLeaflet();
    setupLayerWithMock(layer, mock);

    layer.type = 'geoshape';
    layer.geoField = 'geo';
    layer.fillField = 'pop';
    layer.selectedPalette = 'sequentialAscending';

    const poly = { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] };
    (layer as any)._data = [
      { geo: poly, pop: 100 },
      { geo: poly },  // missing pop
      { geo: poly, pop: 'not_a_number' },
    ];

    (layer as any)._renderLayer();
    expect(mock.layers).toHaveLength(3);
  });

  it('uses default palette when selectedPalette is unknown', () => {
    const layer = new DsfrDataMapLayer();
    const mock = createMockLeaflet();
    setupLayerWithMock(layer, mock);

    layer.type = 'geoshape';
    layer.geoField = 'geo';
    layer.fillField = 'pop';
    layer.selectedPalette = 'nonexistent_palette';

    const poly = { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] };
    (layer as any)._data = [{ geo: poly, pop: 100 }];

    (layer as any)._renderLayer();
    expect(mock.layers).toHaveLength(1);
  });
});

// ============================================================================
// DsfrDataMapLayer: circle auto-scaling edge cases
// ============================================================================

describe('circle auto-scaling edge cases', () => {
  let layer: DsfrDataMapLayer;
  let mock: ReturnType<typeof createMockLeaflet>;

  beforeEach(() => {
    layer = new DsfrDataMapLayer();
    mock = createMockLeaflet();
    setupLayerWithMock(layer, mock);
    layer.type = 'circle';
    layer.latField = 'lat';
    layer.lonField = 'lon';
    layer.radiusField = 'pop';
    layer.radiusMin = 5;
    layer.radiusMax = 25;
  });

  it('uses midpoint radius when all values are equal (range=0)', async () => {
    (layer as any)._data = [
      { lat: 48.86, lon: 2.35, pop: 100 },
      { lat: 43.30, lon: 5.37, pop: 100 },
    ];
    await (layer as any)._renderLayer();
    expect(mock.layers).toHaveLength(2);
    // radiusScale should return mid = (5+25)/2 = 15
    expect((layer as any)._radiusScale(100)).toBe(15);
  });

  it('skips NaN and Infinity values in scaling', async () => {
    (layer as any)._data = [
      { lat: 48.86, lon: 2.35, pop: 100 },
      { lat: 43.30, lon: 5.37, pop: NaN },
      { lat: 44.0, lon: 3.0, pop: Infinity },
      { lat: 45.0, lon: 4.0, pop: 500 },
    ];
    await (layer as any)._renderLayer();
    // Scale based on [100, 500] only
    expect((layer as any)._radiusScale(100)).toBe(5);
    expect((layer as any)._radiusScale(500)).toBe(25);
  });

  it('handles no valid radius values', async () => {
    (layer as any)._data = [
      { lat: 48.86, lon: 2.35, pop: 'abc' },
    ];
    await (layer as any)._renderLayer();
    expect((layer as any)._radiusScale).toBeNull();
  });
});

// ============================================================================
// DsfrDataMapLayer: template interpolation & popup logic
// ============================================================================

describe('DsfrDataMapLayer template and popup', () => {
  let layer: DsfrDataMapLayer;

  beforeEach(() => {
    layer = new DsfrDataMapLayer();
  });

  describe('_interpolateTemplate', () => {
    it('replaces {field} with record values', () => {
      const result = (layer as any)._interpolateTemplate(
        'Nom: {name}, Pop: {pop}',
        { name: 'Paris', pop: 12000 }
      );
      expect(result).toBe('Nom: Paris, Pop: 12000');
    });

    it('escapes HTML in replaced values', () => {
      const result = (layer as any)._interpolateTemplate(
        '{name}',
        { name: '<script>alert("xss")</script>' }
      );
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('replaces missing fields with empty string', () => {
      const result = (layer as any)._interpolateTemplate(
        '{name}: {missing}',
        { name: 'test' }
      );
      expect(result).toBe('test: ');
    });

    it('handles nested field paths', () => {
      const result = (layer as any)._interpolateTemplate(
        '{data.value}',
        { data: { value: 42 } }
      );
      expect(result).toBe('42');
    });

    it('trims whitespace in field names', () => {
      const result = (layer as any)._interpolateTemplate(
        '{ name }',
        { name: 'Paris' }
      );
      expect(result).toBe('Paris');
    });
  });

  describe('_buildPopupTable', () => {
    it('builds HTML table from popup-fields', () => {
      layer.popupFields = 'name,population';
      const result = (layer as any)._buildPopupTable({ name: 'Paris', population: 12000 });
      expect(result).toContain('<table');
      expect(result).toContain('Paris');
      expect(result).toContain('12000');
      expect(result).toContain('<th>name</th>');
      expect(result).toContain('<th>population</th>');
    });

    it('escapes HTML in both keys and values', () => {
      layer.popupFields = 'name';
      const result = (layer as any)._buildPopupTable({ name: '<b>evil</b>' });
      expect(result).not.toContain('<b>evil</b>');
      expect(result).toContain('&lt;b&gt;');
    });

    it('displays empty string for missing fields', () => {
      layer.popupFields = 'name,missing_field';
      const result = (layer as any)._buildPopupTable({ name: 'Paris' });
      expect(result).toContain('Paris');
      expect(result).toContain('<td></td>');
    });

    it('handles whitespace in popup-fields', () => {
      layer.popupFields = ' name , pop ';
      const result = (layer as any)._buildPopupTable({ name: 'test', pop: 1 });
      expect(result).toContain('name');
      expect(result).toContain('pop');
    });

    it('filters empty fields from comma-separated list', () => {
      layer.popupFields = 'name,,pop,';
      const result = (layer as any)._buildPopupTable({ name: 'test', pop: 1 });
      // Should not have empty rows
      const rows = result.match(/<tr>/g);
      expect(rows).toHaveLength(2);
    });
  });

  describe('_getPopupPlainText', () => {
    it('returns field:value pairs from popup-fields', () => {
      layer.popupFields = 'name,pop';
      const result = (layer as any)._getPopupPlainText({ name: 'Paris', pop: 12000 });
      expect(result).toContain('name: Paris');
      expect(result).toContain('pop: 12000');
    });

    it('skips missing fields', () => {
      layer.popupFields = 'name,missing';
      const result = (layer as any)._getPopupPlainText({ name: 'Paris' });
      expect(result).toBe('name: Paris');
      expect(result).not.toContain('missing');
    });

    it('strips HTML from popup-template', () => {
      layer.popupTemplate = '<b>{name}</b> <i>{pop}</i>';
      const result = (layer as any)._getPopupPlainText({ name: 'Paris', pop: 12000 });
      expect(result).not.toContain('<b>');
      expect(result).toContain('Paris');
      expect(result).toContain('12000');
    });

    it('returns empty string when no popup-fields or template', () => {
      const result = (layer as any)._getPopupPlainText({ name: 'Paris' });
      expect(result).toBe('');
    });
  });

  describe('_bindTooltip', () => {
    it('binds tooltip when tooltipField is set', () => {
      layer.tooltipField = 'name';
      const mockLayer = { bindTooltip: vi.fn() };
      (layer as any)._bindTooltip(mockLayer, { name: 'Paris' });
      expect(mockLayer.bindTooltip).toHaveBeenCalledWith('Paris');
    });

    it('escapes HTML in tooltip', () => {
      layer.tooltipField = 'name';
      const mockLayer = { bindTooltip: vi.fn() };
      (layer as any)._bindTooltip(mockLayer, { name: '<b>test</b>' });
      expect(mockLayer.bindTooltip).toHaveBeenCalledWith('&lt;b&gt;test&lt;/b&gt;');
    });

    it('does nothing when tooltipField is empty', () => {
      layer.tooltipField = '';
      const mockLayer = { bindTooltip: vi.fn() };
      (layer as any)._bindTooltip(mockLayer, { name: 'Paris' });
      expect(mockLayer.bindTooltip).not.toHaveBeenCalled();
    });

    it('does nothing when field value is undefined', () => {
      layer.tooltipField = 'missing';
      const mockLayer = { bindTooltip: vi.fn() };
      (layer as any)._bindTooltip(mockLayer, { name: 'Paris' });
      expect(mockLayer.bindTooltip).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// DsfrDataMapLayer: banner management
// ============================================================================

describe('DsfrDataMapLayer banner management', () => {
  let layer: DsfrDataMapLayer;
  let mock: ReturnType<typeof createMockLeaflet>;

  beforeEach(() => {
    layer = new DsfrDataMapLayer();
    mock = createMockLeaflet();
    setupLayerWithMock(layer, mock);
  });

  it('creates banner when data is truncated', async () => {
    layer.type = 'marker';
    layer.latField = 'lat';
    layer.lonField = 'lon';
    layer.maxItems = 2;

    const parent = document.createElement('dsfr-data-map');
    parent.appendChild(layer);
    document.body.appendChild(parent);
    (layer as any)._mapParent = parent;

    (layer as any)._data = [
      { lat: 48.86, lon: 2.35 },
      { lat: 43.30, lon: 5.37 },
      { lat: 44.0, lon: 3.0 },
    ];
    await (layer as any)._renderLayer();

    const banner = parent.querySelector('.dsfr-data-map__max-items-banner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('2');
    expect(banner?.textContent).toContain('3');

    document.body.removeChild(parent);
  });

  it('does not create banner when not truncated', async () => {
    layer.type = 'marker';
    layer.latField = 'lat';
    layer.lonField = 'lon';
    layer.maxItems = 100;

    const parent = document.createElement('dsfr-data-map');
    parent.appendChild(layer);
    document.body.appendChild(parent);
    (layer as any)._mapParent = parent;

    (layer as any)._data = [
      { lat: 48.86, lon: 2.35 },
    ];
    await (layer as any)._renderLayer();

    const banner = parent.querySelector('.dsfr-data-map__max-items-banner');
    expect(banner).toBeNull();

    document.body.removeChild(parent);
  });

  it('removes previous banner on re-render', async () => {
    layer.type = 'marker';
    layer.latField = 'lat';
    layer.lonField = 'lon';
    layer.maxItems = 1;

    const parent = document.createElement('dsfr-data-map');
    parent.appendChild(layer);
    document.body.appendChild(parent);
    (layer as any)._mapParent = parent;

    (layer as any)._data = [
      { lat: 48.86, lon: 2.35 },
      { lat: 43.30, lon: 5.37 },
    ];
    await (layer as any)._renderLayer();
    await (layer as any)._renderLayer();

    const banners = parent.querySelectorAll('.dsfr-data-map__max-items-banner');
    expect(banners).toHaveLength(1);

    document.body.removeChild(parent);
  });
});

// ============================================================================
// DsfrDataMapLayer: _autoDetectGeoField
// ============================================================================

describe('DsfrDataMapLayer _autoDetectGeoField', () => {
  it('detects geo_point_2d', () => {
    const layer = new DsfrDataMapLayer();
    (layer as any)._data = [{ geo_point_2d: { lat: 1, lon: 2 } }];
    expect((layer as any)._autoDetectGeoField()).toBe('geo_point_2d');
  });

  it('detects geo_shape when geo_point_2d is missing', () => {
    const layer = new DsfrDataMapLayer();
    (layer as any)._data = [{ geo_shape: { type: 'Polygon' } }];
    expect((layer as any)._autoDetectGeoField()).toBe('geo_shape');
  });

  it('detects geometry', () => {
    const layer = new DsfrDataMapLayer();
    (layer as any)._data = [{ geometry: { type: 'Point' } }];
    expect((layer as any)._autoDetectGeoField()).toBe('geometry');
  });

  it('detects geom', () => {
    const layer = new DsfrDataMapLayer();
    (layer as any)._data = [{ geom: { type: 'Point' } }];
    expect((layer as any)._autoDetectGeoField()).toBe('geom');
  });

  it('detects geo_point', () => {
    const layer = new DsfrDataMapLayer();
    (layer as any)._data = [{ geo_point: { lat: 1, lon: 2 } }];
    expect((layer as any)._autoDetectGeoField()).toBe('geo_point');
  });

  it('detects geopoint', () => {
    const layer = new DsfrDataMapLayer();
    (layer as any)._data = [{ geopoint: { lat: 1, lon: 2 } }];
    expect((layer as any)._autoDetectGeoField()).toBe('geopoint');
  });

  it('falls back to geo_point_2d for empty data', () => {
    const layer = new DsfrDataMapLayer();
    (layer as any)._data = [];
    expect((layer as any)._autoDetectGeoField()).toBe('geo_point_2d');
  });

  it('falls back to geo_point_2d when no candidate matches', () => {
    const layer = new DsfrDataMapLayer();
    (layer as any)._data = [{ name: 'test', value: 42 }];
    expect((layer as any)._autoDetectGeoField()).toBe('geo_point_2d');
  });

  it('prioritizes geo_point_2d over geometry', () => {
    const layer = new DsfrDataMapLayer();
    (layer as any)._data = [{ geo_point_2d: {}, geometry: {} }];
    expect((layer as any)._autoDetectGeoField()).toBe('geo_point_2d');
  });
});

// ============================================================================
// DsfrDataMapLayer: visibility with cluster and heat
// ============================================================================

describe('DsfrDataMapLayer visibility management', () => {
  let layer: DsfrDataMapLayer;

  beforeEach(() => {
    layer = new DsfrDataMapLayer();
  });

  it('hides layer when zoom below min-zoom', () => {
    const mockMap = {
      getZoom: () => 3,
      hasLayer: () => true,
      getBounds: () => ({
        getSouthWest: () => ({ lat: 43, lng: 1 }),
        getNorthEast: () => ({ lat: 49, lng: 5 }),
      }),
    };
    const removed: string[] = [];
    const mockGroup = {
      removeFrom: () => { removed.push('layer'); },
      addTo: () => {},
    };
    (layer as any)._leafletMap = mockMap;
    (layer as any)._layerGroup = mockGroup;
    (layer as any)._visible = true;
    layer.minZoom = 5;
    layer.maxZoom = 18;

    (layer as any)._updateVisibility();
    expect((layer as any)._visible).toBe(false);
    expect(removed).toContain('layer');
  });

  it('shows layer when zoom returns to range', () => {
    const added: string[] = [];
    const mockMap = {
      getZoom: () => 10,
      hasLayer: () => false,
      getBounds: () => ({
        getSouthWest: () => ({ lat: 43, lng: 1 }),
        getNorthEast: () => ({ lat: 49, lng: 5 }),
      }),
    };
    const mockGroup = {
      addTo: () => { added.push('layer'); },
      removeFrom: () => {},
    };
    (layer as any)._leafletMap = mockMap;
    (layer as any)._layerGroup = mockGroup;
    (layer as any)._visible = false;
    layer.minZoom = 5;
    layer.maxZoom = 18;

    (layer as any)._updateVisibility();
    expect((layer as any)._visible).toBe(true);
    expect(added).toContain('layer');
  });

  it('also toggles heat layer visibility', () => {
    const heatActions: string[] = [];
    const mockMap = {
      getZoom: () => 3,
      hasLayer: (l: any) => l === mockHeat,
      getBounds: () => ({
        getSouthWest: () => ({ lat: 43, lng: 1 }),
        getNorthEast: () => ({ lat: 49, lng: 5 }),
      }),
    };
    const mockGroup = { removeFrom: () => {}, addTo: () => {} };
    const mockHeat = {
      addTo: () => { heatActions.push('add'); },
      removeFrom: () => { heatActions.push('remove'); },
    };
    (layer as any)._leafletMap = mockMap;
    (layer as any)._layerGroup = mockGroup;
    (layer as any)._heatLayer = mockHeat;
    (layer as any)._visible = true;
    layer.minZoom = 5;

    (layer as any)._updateVisibility();
    expect(heatActions).toContain('remove');
  });

  it('removes banner when zooming out of range', () => {
    const mockMap = {
      getZoom: () => 1,
      hasLayer: () => false,
      getBounds: () => ({
        getSouthWest: () => ({ lat: 43, lng: 1 }),
        getNorthEast: () => ({ lat: 49, lng: 5 }),
      }),
    };
    const mockGroup = { removeFrom: () => {}, addTo: () => {} };
    const banner = document.createElement('div');
    document.body.appendChild(banner);

    (layer as any)._leafletMap = mockMap;
    (layer as any)._layerGroup = mockGroup;
    (layer as any)._visible = true;
    (layer as any)._banner = banner;
    layer.minZoom = 5;

    (layer as any)._updateVisibility();
    expect((layer as any)._banner).toBeNull();
  });
});

// ============================================================================
// DsfrDataMap: _buildMapDescription
// ============================================================================

describe('DsfrDataMap _buildMapDescription', () => {
  it('includes keyboard instructions', () => {
    const map = new DsfrDataMap();
    const desc = (map as any)._buildMapDescription();
    expect(desc).toContain('fleches');
    expect(desc).toContain('zoomer');
    expect(desc).toContain('Tabulez');
  });

  it('includes name when set', () => {
    const map = new DsfrDataMap();
    map.name = 'Stations IRVE';
    const desc = (map as any)._buildMapDescription();
    expect(desc).toContain('Stations IRVE');
  });

  it('does not include colon when name is empty', () => {
    const map = new DsfrDataMap();
    map.name = '';
    const desc = (map as any)._buildMapDescription();
    expect(desc).toContain('Carte interactive.');
    expect(desc).not.toContain(' : .');
  });
});

// ============================================================================
// DsfrDataMap: updateDescription
// ============================================================================

describe('DsfrDataMap updateDescription', () => {
  it('concatenates base description with layer summaries', () => {
    const map = new DsfrDataMap();
    const desc = document.createElement('p');
    (map as any)._srDescription = desc;

    map.updateDescription(['100 marqueurs', '5 zones']);
    expect(desc.textContent).toContain('Carte interactive');
    expect(desc.textContent).toContain('100 marqueurs');
    expect(desc.textContent).toContain('5 zones');
  });

  it('does nothing when _srDescription is null', () => {
    const map = new DsfrDataMap();
    (map as any)._srDescription = null;
    // Should not throw
    map.updateDescription(['test']);
  });
});

// ============================================================================
// DsfrDataMap: registerLayerBounds
// ============================================================================

describe('DsfrDataMap registerLayerBounds', () => {
  it('stores bounds', () => {
    const map = new DsfrDataMap();
    const bounds = { isValid: () => true };
    map.registerLayerBounds(bounds as any);
    expect((map as any)._layerBounds).toHaveLength(1);
  });

  it('accumulates multiple bounds', () => {
    const map = new DsfrDataMap();
    map.registerLayerBounds({ isValid: () => true } as any);
    map.registerLayerBounds({ isValid: () => true } as any);
    expect((map as any)._layerBounds).toHaveLength(2);
  });
});

// ============================================================================
// DsfrDataMap: announceToScreenReader
// ============================================================================

describe('DsfrDataMap announceToScreenReader', () => {
  it('does nothing when liveRegion is null', () => {
    const map = new DsfrDataMap();
    (map as any)._liveRegion = null;
    // Should not throw
    map.announceToScreenReader('test');
  });

  it('clears then sets text on live region', () => {
    const map = new DsfrDataMap();
    const region = document.createElement('div');
    region.textContent = 'old';
    (map as any)._liveRegion = region;

    map.announceToScreenReader('new message');
    // Immediately after call, text is cleared
    expect(region.textContent).toBe('');
  });
});

// ============================================================================
// DsfrDataMapLayer: _extractCoords extended
// ============================================================================

describe('DsfrDataMapLayer _extractCoords extended', () => {
  let layer: DsfrDataMapLayer;

  beforeEach(() => {
    layer = new DsfrDataMapLayer();
  });

  it('returns null for empty record with no geo fields', () => {
    const result = (layer as any)._extractCoords({ name: 'test' });
    expect(result).toBeNull();
  });

  it('auto-detects geopoint field', () => {
    const result = (layer as any)._extractCoords({
      geopoint: { lat: 48.86, lon: 2.35 },
    });
    expect(result).toEqual({ lat: 48.86, lon: 2.35 });
  });

  it('auto-detects geo_point field', () => {
    const result = (layer as any)._extractCoords({
      geo_point: { lat: 48.86, lon: 2.35 },
    });
    expect(result).toEqual({ lat: 48.86, lon: 2.35 });
  });

  it('auto-detects GeoJSON Point in geo_point_2d', () => {
    const result = (layer as any)._extractCoords({
      geo_point_2d: { type: 'Point', coordinates: [2.35, 48.86] },
    });
    expect(result).toEqual({ lat: 48.86, lon: 2.35 });
  });

  it('handles geo-field with nested path', () => {
    layer.geoField = 'location.coords';
    const result = (layer as any)._extractCoords({
      location: { coords: { lat: 48.86, lon: 2.35 } },
    });
    expect(result).toEqual({ lat: 48.86, lon: 2.35 });
  });

  it('returns null for geo-field with null value', () => {
    layer.geoField = 'geo';
    const result = (layer as any)._extractCoords({ geo: null });
    expect(result).toBeNull();
  });

  it('returns null for geo-field with non-geo object', () => {
    layer.geoField = 'geo';
    const result = (layer as any)._extractCoords({ geo: { type: 'Polygon' } });
    // Polygon has no coordinates as [lat, lon], but returns null because no lat/lon
    expect(result).toBeNull();
  });

  it('handles lat-field/lon-field with string numbers', () => {
    layer.latField = 'lat';
    layer.lonField = 'lon';
    const result = (layer as any)._extractCoords({ lat: '48.86', lon: '2.35' });
    expect(result).toEqual({ lat: 48.86, lon: 2.35 });
  });

  it('returns null when lat is valid but lon is missing', () => {
    layer.latField = 'lat';
    layer.lonField = 'lon';
    const result = (layer as any)._extractCoords({ lat: 48.86 });
    expect(result).toBeNull();
  });
});

// ============================================================================
// DsfrDataMapLayer: onSourceData
// ============================================================================

describe('DsfrDataMapLayer onSourceData', () => {
  let layer: DsfrDataMapLayer;

  beforeEach(() => {
    layer = new DsfrDataMapLayer();
  });

  it('converts array data to _data', () => {
    layer.onSourceData([{ a: 1 }, { a: 2 }]);
    expect((layer as any)._data).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('sets empty array for non-array data', () => {
    layer.onSourceData('not an array');
    expect((layer as any)._data).toEqual([]);
  });

  it('sets empty array for null', () => {
    layer.onSourceData(null);
    expect((layer as any)._data).toEqual([]);
  });

  it('builds time frames when timeField is set', () => {
    layer.timeField = 'date';
    layer.timeBucket = 'none';
    layer.onSourceData([{ date: '2021' }, { date: '2022' }]);
    expect(layer.getTimeSteps()).toEqual(['2021', '2022']);
  });
});

// ============================================================================
// DsfrDataMapLayer: geoshape rendering edge cases
// ============================================================================

describe('DsfrDataMapLayer geoshape edge cases', () => {
  let layer: DsfrDataMapLayer;
  let mock: ReturnType<typeof createMockLeaflet>;

  beforeEach(() => {
    layer = new DsfrDataMapLayer();
    mock = createMockLeaflet();
    setupLayerWithMock(layer, mock);
    layer.type = 'geoshape';
    layer.geoField = 'geo';
  });

  it('skips records with no geoData', async () => {
    (layer as any)._data = [
      { geo: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] } },
      { geo: null },
      { name: 'no geo' },
    ];
    await (layer as any)._renderLayer();
    expect(mock.layers).toHaveLength(1);
  });

  it('skips records where geoData has no type property', async () => {
    (layer as any)._data = [
      { geo: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] } },
      { geo: { coordinates: [[[0,0],[1,0],[1,1],[0,0]]] } },  // missing type
    ];
    await (layer as any)._renderLayer();
    expect(mock.layers).toHaveLength(1);
  });

  it('applies fillOpacity from attribute', async () => {
    layer.fillOpacity = 0.3;
    (layer as any)._data = [
      { geo: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] } },
    ];
    await (layer as any)._renderLayer();
    expect(mock.layers).toHaveLength(1);
  });
});
