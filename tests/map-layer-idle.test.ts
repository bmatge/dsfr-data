import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * BUG-039 (banc d'essai open-data-viz, #1229) — la couche d'une carte ignorait
 * le retour en attente d'un amont en `require-where` : le dernier filtre
 * retiré, ses marqueurs restaient tracés sous une page dont les autres
 * afficheurs disaient « Choisissez un filtre ». Et la carte n'avait pas
 * d'`idle-message`.
 *
 * AC : après le retour en attente, la couche compte 0 élément et sa légende
 * est vide ; la carte rend un message d'attente configurable, retiré dès que
 * les données reviennent.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMap } from '@/components/dsfr-data-map.js';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';
import { clearDataCache, dispatchDataIdle, dispatchDataLoaded } from '@/utils/data-bridge.js';
import { IDLE_MESSAGE_DEFAULT } from '@/utils/status-templates.js';

/** Vue interne de la couche : ce que `_onMapReady` pose quand la carte est prête. */
interface LayerInternals {
  _L: unknown;
  _leafletMap: unknown;
  _layerGroup: unknown;
  _clusterGroup: unknown;
  _mapParent: unknown;
  _visible: boolean;
  _loadHeatLayer(): Promise<void>;
}

/** Vue interne de la carte : le conteneur Leaflet et sa description. */
interface MapInternals {
  _container: HTMLDivElement | null;
  _srDescription: HTMLParagraphElement | null;
  _syncIdle(): void;
}

function createMock() {
  const added: unknown[] = [];
  const clustered: unknown[] = [];
  const group = (bag: unknown[]) => ({
    clearLayers: () => {
      bag.length = 0;
    },
    addLayer: (l: unknown) => {
      bag.push(l);
    },
    addTo: () => {},
    removeFrom: () => {},
    getBounds: () => ({ isValid: () => bag.length > 0 }),
  });
  const mockMarker = {
    bindPopup: () => mockMarker,
    bindTooltip: () => mockMarker,
    on: () => mockMarker,
    getElement: () => null,
  };
  const L = {
    marker: () => ({ ...mockMarker }),
    circleMarker: () => ({ ...mockMarker }),
    divIcon: () => ({}),
    point: (x: number, y: number) => ({ x, y }),
  };
  const mockMap = { getZoom: () => 10, hasLayer: () => false, on: () => {} };
  return { L, added, clustered, layerGroup: group(added), clusterGroup: group(clustered), mockMap };
}

const SRC = 'idle-src';
const ROWS = [
  { lat: 48.8, lon: 2.3, cat: 'a' },
  { lat: 45.7, lon: 4.8, cat: 'b' },
  { lat: 43.3, lon: 5.4, cat: 'zzz' },
];

function mountLayer(mock: ReturnType<typeof createMock>, parent: HTMLElement = document.body) {
  const layer = new DsfrDataMapLayer();
  layer.source = SRC;
  layer.type = 'marker';
  layer.latField = 'lat';
  layer.lonField = 'lon';
  layer.colorField = 'cat';
  layer.colorMap = 'a:#00A95F,b:#E1000F';
  parent.appendChild(layer);
  const internals = layer as unknown as LayerInternals;
  internals._L = mock.L;
  internals._leafletMap = mock.mockMap;
  internals._layerGroup = mock.layerGroup;
  internals._mapParent = null;
  internals._visible = true;
  return layer;
}

afterEach(() => {
  document.body.replaceChildren();
  // Le registre d'attente se lève à la première donnée
  dispatchDataLoaded(SRC, []);
  clearDataCache(SRC);
});

describe('BUG-039 — dsfr-data-map-layer rend ce qu’elle avait tracé au retour en attente', () => {
  it('vide les formes, les grappes et la légende, et le dit par un événement de rendu', async () => {
    const mock = createMock();
    const layer = mountLayer(mock);

    dispatchDataLoaded(SRC, ROWS);
    await layer.updateComplete;
    expect(layer.getRenderedCount()).toBe(3);
    expect(mock.added).toHaveLength(3);
    expect(layer.getLegendEntries().map((e) => e.label)).toEqual(['a', 'b', 'Autres valeurs']);

    // Une grappe laissée par un rendu en `cluster`
    (layer as unknown as LayerInternals)._clusterGroup = mock.clusterGroup;
    mock.clustered.push({});

    const renders: Array<{ rendered: number; legend: unknown[] }> = [];
    layer.addEventListener('dsfr-data-map-layer-render', (e) =>
      renders.push((e as CustomEvent).detail)
    );

    dispatchDataIdle(SRC);
    await layer.updateComplete;

    expect(mock.added).toHaveLength(0);
    expect(mock.clustered).toHaveLength(0);
    expect(layer.getRenderedCount()).toBe(0);
    expect(layer.getLegendEntries()).toEqual([]);
    expect(layer.isIdle()).toBe(true);
    expect(renders).toEqual([{ rendered: 0, skipped: 0, total: 0, legend: [] }]);
  });

  it('retrace la couche quand un filtre revient', async () => {
    const mock = createMock();
    const layer = mountLayer(mock);
    dispatchDataLoaded(SRC, ROWS);
    dispatchDataIdle(SRC);
    dispatchDataLoaded(SRC, ROWS.slice(0, 2));
    await layer.updateComplete;
    expect(layer.getRenderedCount()).toBe(2);
    expect(mock.added).toHaveLength(2);
    expect(layer.isIdle()).toBe(false);
  });

  it('abandonne un rendu encore en vol : rien ne revient après la purge', async () => {
    const mock = createMock();
    const layer = mountLayer(mock);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    layer.type = 'heatmap';
    vi.spyOn(layer as unknown as LayerInternals, '_loadHeatLayer').mockImplementation(async () => {
      await gate;
    });
    dispatchDataLoaded(SRC, ROWS);
    layer.type = 'marker';
    dispatchDataIdle(SRC);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(mock.added).toHaveLength(0);
  });
});

describe('BUG-039 — dsfr-data-map : message d’attente (`idle-message`)', () => {
  /**
   * Carte montée dans le document SANS Leaflet : un IntersectionObserver muet
   * diffère l'init pour toujours, et l'on pose ce que `_initMap` aurait créé.
   */
  function mountMap(parent: HTMLElement = document.body): {
    map: DsfrDataMap;
    layer: DsfrDataMapLayer;
    internals: MapInternals;
  } {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    const map = new DsfrDataMap();
    const internals = map as unknown as MapInternals;
    internals._container = document.createElement('div');
    internals._srDescription = document.createElement('p');
    map.appendChild(internals._container);
    parent.appendChild(map);
    const layer = mountLayer(createMock(), map);
    return { map, layer, internals };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const bloc = (internals: MapInternals) =>
    internals._container!.querySelector('.dsfr-data-map__idle');

  it('a le libellé par défaut des autres afficheurs', () => {
    expect(new DsfrDataMap().idleMessage).toBe(IDLE_MESSAGE_DEFAULT);
  });

  it('pose le bloc d’attente dans le conteneur, puis le retire quand les données reviennent', async () => {
    const { map, layer, internals } = mountMap();
    dispatchDataIdle(SRC);
    await layer.updateComplete;

    expect(map.isIdle()).toBe(true);
    expect(bloc(internals)?.textContent?.trim()).toBe(IDLE_MESSAGE_DEFAULT);
    expect(bloc(internals)?.classList.contains('dsfr-data-status--idle')).toBe(true);
    expect(internals._srDescription!.textContent).toContain(IDLE_MESSAGE_DEFAULT);

    dispatchDataLoaded(SRC, ROWS);
    await layer.updateComplete;
    expect(map.isIdle()).toBe(false);
    expect(bloc(internals)).toBeNull();
    expect(internals._srDescription!.textContent).not.toContain(IDLE_MESSAGE_DEFAULT);
  });

  it('rend le texte de idle-message, et le libellé par défaut quand il est vide', async () => {
    const { map, layer, internals } = mountMap();
    map.idleMessage = 'Choisissez un département';
    dispatchDataIdle(SRC);
    await layer.updateComplete;
    expect(bloc(internals)?.textContent?.trim()).toBe('Choisissez un département');
    map.idleMessage = '';
    internals._syncIdle();
    expect(bloc(internals)?.textContent?.trim()).toBe(IDLE_MESSAGE_DEFAULT);
  });

  it('ne répète pas le message dans la carte d’un encart', async () => {
    // Le nom de balise suffit : la carte ne regarde que son ascendance
    const encart = document.createElement('dsfr-data-map-inset');
    document.body.appendChild(encart);
    const { map, layer, internals } = mountMap(encart);
    dispatchDataIdle(SRC);
    await layer.updateComplete;
    internals._syncIdle();
    expect(map.isIdle()).toBe(true);
    expect(bloc(internals)).toBeNull();
  });
});
