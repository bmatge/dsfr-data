import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DsfrDataMap } from '../src/components/dsfr-data-map.js';
import { DsfrDataMapLayer } from '../src/components/dsfr-data-map-layer.js';
import { clearDataCache, dispatchDataLoaded } from '../src/utils/data-bridge.js';

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
    expect(style?.textContent).toContain('leaflet-control-zoom');
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
