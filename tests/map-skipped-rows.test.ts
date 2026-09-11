import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Tests #648 — compteur unifié des lignes exclues des cartes.
 *
 * Le geoshape comptait et journalisait déjà ses géométries invalides (#482) ;
 * marqueurs, cercles, heatmap et les cartes `map*` de dsfr-data-chart
 * écartaient leurs lignes en silence (`return` / `continue` nus). Désormais :
 * - chaque afficheur compte, journalise UN warn par cycle, expose
 *   `getSkippedCount()` ;
 * - le collecteur du volet Diagnostic (#604) lit cette méthode et la trace
 *   rend « N lignes ignorées (…) ».
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import * as L from 'leaflet';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';
import { DsfrDataChart } from '@/components/dsfr-data-chart.js';
import { DataflowRecorder, formatTrace, summarizeTrace } from '@dsfr-data/shared';

/** Vue interne de la couche : ce que les tests injectent ou lisent. */
interface LayerInternals {
  _leafletMap: unknown;
  _L: unknown;
  _layerGroup: unknown;
  _data: Record<string, unknown>[];
  _renderLayer: () => Promise<void>;
  _visible: boolean;
  _heatLoaded: boolean;
  _heatLayerFactory: unknown;
}

/** Vue interne du graphique. */
interface ChartInternals {
  _data: unknown[];
  _processMapData: () => string;
}

function fakeMap() {
  return {
    hasLayer: vi.fn(() => true),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    getZoom: vi.fn(() => 6),
  };
}

/** Couche prête à rendre : carte + module + groupe injectés (cf. recette #482). */
function readyLayer(type: DsfrDataMapLayer['type']): DsfrDataMapLayer {
  const layer = new DsfrDataMapLayer();
  layer.type = type;
  layer.latField = 'lat';
  layer.lonField = 'lon';
  const internals = layer as unknown as LayerInternals;
  internals._leafletMap = fakeMap();
  internals._L = L;
  internals._layerGroup = L.featureGroup();
  return layer;
}

/** 2 lignes valides + 3 sans coordonnées (absentes, nulles, non numériques). */
const MIXED_ROWS: Record<string, unknown>[] = [
  { nom: 'Paris', lat: 48.86, lon: 2.35 },
  { nom: 'Sans rien' },
  { nom: 'Lyon', lat: 45.76, lon: 4.83 },
  { nom: 'Nul', lat: null, lon: null },
  { nom: 'Texte', lat: 'abc', lon: 'def' },
];

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('#648 — dsfr-data-map-layer : marqueurs, cercles, heatmap comptent', () => {
  it.each(['marker', 'circle'] as const)(
    'type=%s : 3 lignes sans coordonnées → getSkippedCount() === 3, un seul warn',
    async (type) => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const layer = readyLayer(type);
      const internals = layer as unknown as LayerInternals;
      internals._data = MIXED_ROWS;

      await internals._renderLayer();

      expect(layer.getSkippedCount()).toBe(3);
      expect(layer.getRenderedCount()).toBe(2);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('3 ligne(s) sur 5');
      expect(warnSpy.mock.calls[0][0]).toContain('lat-field="lat"');
    }
  );

  it('type=heatmap : les points sans coordonnées sont comptés', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layer = readyLayer('heatmap');
    const internals = layer as unknown as LayerInternals;
    internals._heatLoaded = true;
    internals._heatLayerFactory = vi.fn(() => ({ addTo: vi.fn(), remove: vi.fn() }));
    internals._visible = false;
    internals._data = MIXED_ROWS;

    await internals._renderLayer();

    expect(layer.getSkippedCount()).toBe(3);
    expect(layer.getRenderedCount()).toBe(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('le warn ne se répète pas tant que le compte ne change pas (re-rendus bbox)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layer = readyLayer('marker');
    const internals = layer as unknown as LayerInternals;
    internals._data = MIXED_ROWS;

    await internals._renderLayer();
    await internals._renderLayer();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Nouveau jeu, compte différent : nouveau warn
    internals._data = [...MIXED_ROWS, { nom: 'Encore' }];
    await internals._renderLayer();
    expect(layer.getSkippedCount()).toBe(4);
    expect(warnSpy).toHaveBeenCalledTimes(2);

    // Tout redevient valide : compteur à zéro, pas de warn supplémentaire
    internals._data = [{ lat: 1, lon: 1 }];
    await internals._renderLayer();
    expect(layer.getSkippedCount()).toBe(0);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('sans ligne ignorée : compteur à zéro et aucun warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layer = readyLayer('marker');
    const internals = layer as unknown as LayerInternals;
    internals._data = [{ lat: 48.86, lon: 2.35 }];

    await internals._renderLayer();

    expect(layer.getSkippedCount()).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('geoshape : le libellé historique (#482) est conservé', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layer = readyLayer('geoshape');
    layer.geoField = 'geo';
    const internals = layer as unknown as LayerInternals;
    internals._data = [{ geo: { type: 'Point', coordinates: [2.35, 48.85] } }, { geo: null }];

    await internals._renderLayer();

    expect(layer.getSkippedCount()).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('géométrie valide'));
  });
});

describe('#648 — dsfr-data-chart : cartes map* comptent les codes invalides', () => {
  function mapChart(type: DsfrDataChart['type'], rows: unknown[]): DsfrDataChart {
    const chart = new DsfrDataChart();
    chart.id = 'carte';
    chart.type = type;
    chart.codeField = 'code';
    chart.valueField = 'val';
    (chart as unknown as ChartInternals)._data = rows;
    return chart;
  }

  it('type=map : 3 lignes sans code valide → getSkippedCount() === 3, un warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = mapChart('map', [
      { code: '75', val: 1 },
      { code: '', val: 2 },
      { val: 3 },
      { code: 'XYZ', val: 4 },
      { code: '13', val: 5 },
    ]);

    const data = JSON.parse((chart as unknown as ChartInternals)._processMapData());

    expect(Object.keys(data).sort()).toEqual(['13', '75']);
    expect(chart.getSkippedCount()).toBe(3);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('3 ligne(s) sur 5');
    expect(warnSpy.mock.calls[0][0]).toContain('"code"');
  });

  it('un seul warn par jeu de données, même si le rendu est recalculé', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = mapChart('map-reg', [{ code: '11', val: 1 }, { val: 2 }]);
    const internals = chart as unknown as ChartInternals;

    internals._processMapData();
    internals._processMapData();
    expect(chart.getSkippedCount()).toBe(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Nouvelle émission de la source : nouveau warn
    internals._data = [{ val: 1 }, { val: 2 }];
    internals._processMapData();
    expect(chart.getSkippedCount()).toBe(2);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('type=map-monde : codes pays inconnus comptés', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = mapChart('map-monde', [
      { code: 'FRA', val: 1 },
      { code: 'NOPE', val: 2 },
      { code: '', val: 3 },
    ]);
    (chart as unknown as ChartInternals)._processMapData();
    expect(chart.getSkippedCount()).toBe(2);
  });

  it('type=map-aca : code vide compté', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = mapChart('map-aca', [{ code: 'paris', val: 1 }, { val: 2 }]);
    (chart as unknown as ChartInternals)._processMapData();
    expect(chart.getSkippedCount()).toBe(1);
  });

  it('#766 — des codes à zéro de tête en trop sont dessinés, pas comptés', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Un jeu qui publie ses départements sur trois caractères vidait la carte.
    const chart = mapChart('map', [
      { code: '059', val: 1 },
      { code: '02A', val: 2 },
      { code: '0971', val: 3 },
      { code: '075', val: 4 },
    ]);

    const data = JSON.parse((chart as unknown as ChartInternals)._processMapData());

    expect(Object.keys(data).sort()).toEqual(['2A', '59', '75', '971']);
    expect(chart.getSkippedCount()).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('tout valide : zéro et aucun warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = mapChart('map', [{ code: '75', val: 1 }]);
    (chart as unknown as ChartInternals)._processMapData();
    expect(chart.getSkippedCount()).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('#648 — remontée dans la trace du volet Diagnostic (#604)', () => {
  it('les composants sont enregistrés (le collecteur lit un élément rehaussé)', () => {
    expect(customElements.get('dsfr-data-map-layer')).toBe(DsfrDataMapLayer);
    expect(customElements.get('dsfr-data-chart')).toBe(DsfrDataChart);
  });

  it('une couche avec 3 lignes ignorées : skippedRows dans le graphe et ligne « ignorées » dans la trace', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const host = document.createElement('div');
    host.innerHTML = `<dsfr-data-map-layer id="couche" source="src" type="marker" lat-field="lat" lon-field="lon"></dsfr-data-map-layer>`;
    document.body.appendChild(host);

    const layer = document.getElementById('couche') as DsfrDataMapLayer;
    const internals = layer as unknown as LayerInternals;
    internals._leafletMap = fakeMap();
    internals._L = L;
    internals._layerGroup = L.featureGroup();
    internals._data = MIXED_ROWS;
    await internals._renderLayer();
    expect(layer.getSkippedCount()).toBe(3);

    const recorder = new DataflowRecorder({ root: document.body });
    recorder.start();
    const trace = recorder.snapshot();
    recorder.stop();

    const node = trace.graph.nodes.find((n) => n.id === 'couche');
    expect(node?.skippedRows).toBe(3);

    const text = formatTrace(trace);
    expect(text).toContain('3 lignes ignorées');
    expect(text).toContain('coordonnées ou géométrie');
    expect(summarizeTrace(trace).alerts).toBeGreaterThanOrEqual(1);
  });

  it('un graphique carte avec codes invalides : cause « code géographique » dans la trace', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const host = document.createElement('div');
    host.innerHTML = `<dsfr-data-chart id="carte" source="src" type="map" code-field="code" value-field="val"></dsfr-data-chart>`;
    document.body.appendChild(host);

    const chart = document.getElementById('carte') as DsfrDataChart;
    const internals = chart as unknown as ChartInternals;
    internals._data = [{ code: '75', val: 1 }, { val: 2 }];
    internals._processMapData();

    const recorder = new DataflowRecorder({ root: document.body });
    const trace = recorder.snapshot();

    expect(trace.graph.nodes.find((n) => n.id === 'carte')?.skippedRows).toBe(1);
    const text = formatTrace(trace);
    expect(text).toContain('1 ligne ignorée (code géographique absent ou invalide)');
  });

  it('sans ligne ignorée, aucun champ skippedRows ni ligne dans la trace', () => {
    const host = document.createElement('div');
    host.innerHTML = `<dsfr-data-chart id="carte2" source="src" type="map"></dsfr-data-chart>`;
    document.body.appendChild(host);

    const trace = new DataflowRecorder({ root: document.body }).snapshot();
    const node = trace.graph.nodes.find((n) => n.id === 'carte2');
    expect(node).toBeDefined();
    expect('skippedRows' in node!).toBe(false);
    expect(formatTrace(trace)).not.toContain('ignorée');
  });
});

describe('#770 — une couche dont tous les points sont confondus', () => {
  const same = (n: number, lat = 48.8566, lon = 2.3522) =>
    Array.from({ length: n }, (_, i) => ({ nom: `P${i}`, lat, lon }));

  it('une couche à position unique le signale : getStackedPositions et un warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layer = readyLayer('marker');
    const internals = layer as unknown as LayerInternals;
    internals._data = same(43);

    await internals._renderLayer();
    await internals._renderLayer();

    expect(layer.getSkippedCount()).toBe(0);
    expect(layer.getStackedPositions()).toEqual({ positions: 1, items: 43 });
    const stackedWarns = warnSpy.mock.calls.filter((c) => String(c[0]).includes('position'));
    expect(stackedWarns).toHaveLength(1);
    expect(stackedWarns[0][0]).toContain('43 point(s) sur 1 seule(s) position(s)');
  });

  it('deux immeubles à la même adresse ne déclenchent rien', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layer = readyLayer('marker');
    const internals = layer as unknown as LayerInternals;
    internals._data = [...same(2), { lat: 45.76, lon: 4.83 }, { lat: 43.3, lon: 5.37 }];

    await internals._renderLayer();

    expect(layer.getStackedPositions()).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('peu de points empilés sur une position : sous le seuil, rien', async () => {
    const layer = readyLayer('circle');
    const internals = layer as unknown as LayerInternals;
    internals._data = same(9);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await internals._renderLayer();
    expect(layer.getStackedPositions()).toBeNull();
  });

  it('deux positions pour vingt points : signalé ; trois positions : non', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layer = readyLayer('circle');
    const internals = layer as unknown as LayerInternals;
    internals._data = [...same(10), ...same(10, 45.76, 4.83)];
    await internals._renderLayer();
    expect(layer.getStackedPositions()).toEqual({ positions: 2, items: 20 });

    internals._data = [...same(10), ...same(10, 45.76, 4.83), ...same(10, 43.3, 5.37)];
    await internals._renderLayer();
    expect(layer.getStackedPositions()).toBeNull();
  });

  it('la trace du volet Diagnostic le dit, et compte une alerte', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const host = document.createElement('div');
    host.innerHTML = `<dsfr-data-map-layer id="empile" source="src" type="marker" lat-field="lat" lon-field="lon"></dsfr-data-map-layer>`;
    document.body.appendChild(host);
    const layer = document.getElementById('empile') as DsfrDataMapLayer;
    const internals = layer as unknown as LayerInternals;
    internals._leafletMap = fakeMap();
    internals._L = L;
    internals._layerGroup = L.featureGroup();
    internals._data = same(30);
    await internals._renderLayer();

    const trace = new DataflowRecorder({ root: document.body }).snapshot();
    expect(trace.graph.nodes.find((n) => n.id === 'empile')?.stackedPositions).toEqual({
      positions: 1,
      items: 30,
    });
    expect(formatTrace(trace)).toContain('30 points sur 1 position distincte');
    expect(summarizeTrace(trace).alerts).toBeGreaterThanOrEqual(1);
  });
});
