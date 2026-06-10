import { describe, it, expect, vi } from 'vitest';

/**
 * Tests traversants #295 (EPIC F) — rendus async concurrents de map-layer.
 *
 * Bugs d'origine :
 * - _renderLayer async appelé sans await depuis onSourceData,
 *   setTimelineFrame et le fallback bbox : deux appels qui se chevauchent
 *   pendant le `await import(...)` (cluster/heatmap) franchissaient chacun
 *   clearLayers() puis ajoutaient CHACUN tous les items → doublons visibles ;
 * - setTimelineFrame échangeait temporairement this._data autour d'un
 *   _renderLayer() non awaité — tenait uniquement parce que la lecture était
 *   dans la portion synchrone.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';

function createMock() {
  const added: unknown[] = [];
  const mockLayerGroup = {
    clearLayers: () => {
      added.length = 0;
    },
    addLayer: (l: unknown) => {
      added.push(l);
    },
    addTo: () => {},
    removeFrom: () => {},
    getBounds: () => ({ isValid: () => added.length > 0 }),
  };
  const mockMarker = {
    bindPopup: () => mockMarker,
    bindTooltip: () => mockMarker,
    on: () => mockMarker,
    getElement: () => null,
  };
  const L = {
    layerGroup: () => mockLayerGroup,
    marker: () => ({ ...mockMarker }),
    circleMarker: () => ({ ...mockMarker }),
    circle: () => ({ ...mockMarker }),
    geoJSON: () => ({ ...mockMarker }),
    divIcon: () => ({}),
    point: (x: number, y: number) => ({ x, y }),
  };
  const mockMap = {
    getZoom: () => 10,
    hasLayer: () => false,
    on: () => {},
  };
  return { L, added, mockLayerGroup, mockMap };
}

function setup(layer: DsfrDataMapLayer, mock: ReturnType<typeof createMock>) {
  (layer as any)._L = mock.L;
  (layer as any)._leafletMap = mock.mockMap;
  (layer as any)._layerGroup = mock.mockLayerGroup;
  (layer as any)._mapParent = null;
  (layer as any)._visible = true;
}

const ROWS = [
  { lat: 48.8, lon: 2.3, t: '2023' },
  { lat: 45.7, lon: 4.8, t: '2023' },
  { lat: 43.3, lon: 5.4, t: '2024' },
];

describe('#295 — AC : pas de doublons quand deux rendus se chevauchent', () => {
  it('le rendu obsolète abandonne après son await (jeton de génération)', async () => {
    const layer = new DsfrDataMapLayer();
    const mock = createMock();
    setup(layer, mock);
    layer.type = 'marker';
    layer.latField = 'lat';
    layer.lonField = 'lon';
    (layer as any)._data = ROWS;

    // Simule l'await import() du heatmap/cluster : les DEUX rendus
    // traversent un point d'attente contrôlé
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    layer.heat = true; // force le passage par _loadHeatLayer
    (layer as any)._heatLoaded = false;
    vi.spyOn(layer as any, '_loadHeatLayer').mockImplementation(async () => {
      (layer as any)._heatLoaded = true;
      await gate;
    });
    // Le chemin heatmap diverge ensuite : neutralise-le pour compter via
    // _layerGroup (les marqueurs passent par addLayer)
    layer.heat = false;
    layer.type = 'heatmap';
    const p1 = (layer as any)._renderLayer();
    layer.type = 'marker';
    const p2 = (layer as any)._renderLayer();

    release();
    await Promise.all([p1, p2]);

    // Avant le fix : les deux rendus ajoutaient chacun les 3 items (6) ;
    // seul le rendu le plus récent doit avoir peuplé le groupe
    expect(mock.added).toHaveLength(3);
  });
});

describe('#295 — timeline : items passés en paramètre (plus de swap _data)', () => {
  it('setTimelineFrame rend la frame sans toucher this._data', () => {
    const layer = new DsfrDataMapLayer();
    const mock = createMock();
    setup(layer, mock);
    layer.type = 'marker';
    layer.latField = 'lat';
    layer.lonField = 'lon';
    layer.timeField = 't';
    (layer as any)._data = ROWS;
    (layer as any)._buildTimeFrames();

    layer.setTimelineFrame(0); // frame '2023' : 2 items

    expect(mock.added).toHaveLength(2);
    // _data n'a jamais été échangé
    expect((layer as any)._data).toBe(ROWS);
  });

  it('resetTimeline ré-affiche tout', () => {
    const layer = new DsfrDataMapLayer();
    const mock = createMock();
    setup(layer, mock);
    layer.type = 'marker';
    layer.latField = 'lat';
    layer.lonField = 'lon';
    layer.timeField = 't';
    (layer as any)._data = ROWS;
    (layer as any)._buildTimeFrames();

    layer.setTimelineFrame(0);
    layer.resetTimeline();

    expect(mock.added).toHaveLength(3);
  });
});
