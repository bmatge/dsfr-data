import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Tests dsfr-data-map-legend + classes parametrables de la choroplethe (#685).
 *
 * - utilitaires de classification (shared) : quantile / equal / manual,
 *   sous-echantillonnage de l'echelle, entrees de legende chiffrees fr-FR ;
 * - dsfr-data-map-layer : classes/method/breaks, getLegendEntries(), evenement
 *   dsfr-data-map-layer-render ;
 * - dsfr-data-map-legend : liste DSFR sous la carte pour une couche color-map
 *   et pour une choroplethe a 5 classes (criteres d'acceptation), pastilles
 *   aria-hidden + texte, rafraichissement a chaque rendu de la couche.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import {
  classifyValues,
  equalIntervalBreaks,
  parseManualBreaks,
  samplePalette,
  choroplethLegendEntries,
  CHOROPLETH_SCALES,
} from '@dsfr-data/shared/lib';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';
import { DsfrDataMapLegend } from '@/components/dsfr-data-map-legend.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

// Quirk happy-dom/vitest : selon l'ordre du graphe de modules, le decorateur
// @customElement peut ne pas s'executer dans la fenetre de test (voir
// dsfr-data-map-inset.test.ts). On garantit la definition.
if (!customElements.get('dsfr-data-map-legend')) {
  customElements.define('dsfr-data-map-legend', DsfrDataMapLegend);
}

/** fr-FR separe les milliers par une espace fine insecable (U+202F) : on compare en espaces simples. */
const plain = (s: string | null | undefined) => (s ?? '').replace(/[\u202f\u00a0]/g, ' ');

/** Vue interne de la couche : ce que les tests posent a la place de Leaflet. */
interface LayerInternals {
  _L: unknown;
  _leafletMap: unknown;
  _layerGroup: unknown;
  _mapParent: unknown;
  _visible: boolean;
  _data: Record<string, unknown>[];
  _renderLayer: () => Promise<void>;
}

const asInternals = (layer: DsfrDataMapLayer) => layer as unknown as LayerInternals;

/** Leaflet minimal : on ne teste que la classification et la legende. */
function mockLeaflet() {
  const styles: Array<Record<string, unknown>> = [];
  const shape = { bindPopup: () => shape, bindTooltip: () => shape, on: () => shape };
  const group = {
    clearLayers: () => {},
    addLayer: () => {},
    addTo: () => {},
    removeFrom: () => {},
    getBounds: () => ({ isValid: () => true }),
  };
  const L = {
    featureGroup: () => group,
    geoJSON: (_data: unknown, opts: { style: Record<string, unknown> }) => {
      styles.push(opts.style);
      return shape;
    },
    marker: () => shape,
    circleMarker: () => shape,
    circle: () => shape,
    divIcon: () => ({}),
    point: (x: number, y: number) => ({ x, y }),
  };
  const map = { getZoom: () => 6, hasLayer: () => false, on: () => {} };
  return { L, map, group, styles };
}

const POLY = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
};

function makeLayer(attrs: Partial<DsfrDataMapLayer> = {}) {
  const layer = new DsfrDataMapLayer();
  const mock = mockLeaflet();
  const internals = asInternals(layer);
  internals._L = mock.L;
  internals._leafletMap = mock.map;
  internals._layerGroup = mock.group;
  internals._mapParent = null;
  internals._visible = true;
  layer.type = 'geoshape';
  layer.geoField = 'geo';
  Object.assign(layer, attrs);
  return { layer, mock, internals };
}

afterEach(() => {
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Utilitaires de classification (shared)
// ---------------------------------------------------------------------------

describe('classification (shared)', () => {
  it('equalIntervalBreaks : intervalles de meme largeur, steps - 1 bornes', () => {
    expect(equalIntervalBreaks([0, 100], 4)).toEqual([25, 50, 75]);
    expect(equalIntervalBreaks([], 4)).toEqual([]);
    expect(equalIntervalBreaks([5, 10], 1)).toEqual([]);
  });

  it('parseManualBreaks : trie, dedoublonne, ignore le non numerique', () => {
    expect(parseManualBreaks('100, 10,50,abc,50')).toEqual([10, 50, 100]);
    expect(parseManualBreaks('')).toEqual([]);
  });

  it('samplePalette : extremites conservees, repartition uniforme', () => {
    const scale = CHOROPLETH_SCALES.sequentialAscending;
    const five = samplePalette(scale, 5);
    expect(five).toEqual([scale[0], scale[2], scale[4], scale[6], scale[8]]);
    expect(samplePalette(scale, 9)).toBe(scale);
    expect(samplePalette(scale, 12)).toBe(scale);
    expect(samplePalette(scale, 1)).toEqual([scale[8]]);
  });

  it('classifyValues par défaut : quantiles sur toute l echelle (comportement historique)', () => {
    const scale = CHOROPLETH_SCALES.sequentialAscending;
    const { breaks, palette } = classifyValues([1, 2, 3, 4, 5, 6, 7, 8, 9], scale);
    expect(breaks).toHaveLength(8);
    expect(palette).toBe(scale);
  });

  it('classifyValues classes=5 : 4 bornes et 5 couleurs', () => {
    const scale = CHOROPLETH_SCALES.sequentialAscending;
    const { breaks, palette } = classifyValues([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], scale, {
      classes: 5,
    });
    expect(breaks).toHaveLength(4);
    expect(palette).toHaveLength(5);
  });

  it('classifyValues method=equal : bornes regulieres', () => {
    const scale = CHOROPLETH_SCALES.neutral;
    const { breaks } = classifyValues([0, 37, 100], scale, { method: 'equal', classes: 4 });
    expect(breaks).toEqual([25, 50, 75]);
  });

  it('classifyValues breaks manuels : bornes telles quelles, classes = bornes + 1', () => {
    const scale = CHOROPLETH_SCALES.sequentialAscending;
    const { breaks, palette } = classifyValues([1, 500], scale, {
      breaks: '10,50,100',
      classes: 7,
    });
    expect(breaks).toEqual([10, 50, 100]);
    expect(palette).toHaveLength(4);
  });

  it('classifyValues method=manual sans bornes, ou sans valeur : pas de classes', () => {
    const scale = CHOROPLETH_SCALES.sequentialAscending;
    expect(classifyValues([1, 2], scale, { method: 'manual' }).breaks).toEqual([]);
    expect(classifyValues([], scale, { classes: 5 }).breaks).toEqual([]);
  });

  it('classifyValues plafonne classes a la taille de l echelle', () => {
    const scale = CHOROPLETH_SCALES.sequentialAscending;
    const { breaks } = classifyValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], scale, {
      classes: 20,
    });
    expect(breaks).toHaveLength(8);
  });

  it('choroplethLegendEntries : bornes chiffrees fr-FR, extremites depuis l etendue', () => {
    const entries = choroplethLegendEntries([1000, 5000], ['#a', '#b', '#c'], {
      min: 120,
      max: 12345.678,
    });
    expect(entries.map((e) => plain(e.label))).toEqual([
      'De 120 à 1 000',
      'De 1 000 à 5 000',
      'De 5 000 à 12 345,68',
    ]);
    expect(entries.map((e) => e.color)).toEqual(['#a', '#b', '#c']);
    expect(entries[0]).toMatchObject({ from: 120, to: 1000 });
  });

  it('choroplethLegendEntries sans etendue : « Jusqu à » / « Plus de »', () => {
    const entries = choroplethLegendEntries([10, 50], ['#a', '#b', '#c']);
    expect(entries.map((e) => e.label)).toEqual(["Jusqu'à 10", 'De 10 à 50', 'Plus de 50']);
  });

  it('choroplethLegendEntries omet une classe vide (bornes egales)', () => {
    // Quantiles sur [0,0,0,0,1,2,3] a 5 classes -> breaks [0,0,1,2]
    const entries = choroplethLegendEntries([0, 0, 1, 2], ['#1', '#2', '#3', '#4', '#5'], {
      min: 0,
      max: 3,
    });
    expect(entries.map((e) => e.label)).toEqual(['0', 'De 0 à 1', 'De 1 à 2', 'De 2 à 3']);
    expect(entries.map((e) => e.color)).toEqual(['#1', '#3', '#4', '#5']);
  });

  it('choroplethLegendEntries : rien sans bornes', () => {
    expect(choroplethLegendEntries([], ['#a'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// dsfr-data-map-layer : classes/method/breaks + getLegendEntries()
// ---------------------------------------------------------------------------

describe('dsfr-data-map-layer — classes et legende', () => {
  it('expose classes / method / breaks avec le défaut historique', () => {
    const layer = new DsfrDataMapLayer();
    expect(layer.classes).toBe(0);
    expect(layer.method).toBe('quantile');
    expect(layer.breaks).toBe('');
  });

  it('choroplethe 5 classes : 5 couleurs distinctes tirees de l echelle, legende a 5 entrees', async () => {
    const { layer, mock, internals } = makeLayer({
      fillField: 'val',
      selectedPalette: 'sequentialAscending',
      classes: 5,
    });
    internals._data = Array.from({ length: 10 }, (_, i) => ({ geo: POLY, val: (i + 1) * 10 }));
    await internals._renderLayer();

    const scale = CHOROPLETH_SCALES.sequentialAscending;
    const used = new Set(mock.styles.map((s) => s.fillColor));
    expect(used.size).toBe(5);
    for (const c of used) expect(scale).toContain(c);

    const entries = layer.getLegendEntries();
    expect(entries).toHaveLength(5);
    expect(plain(entries[0].label)).toBe('De 10 à 30');
    expect(entries[4].label).toBe('De 90 à 100');
    expect(entries.map((e) => e.color)).toEqual(samplePalette(scale, 5));
  });

  it('breaks manuels : classes fixees par les bornes', async () => {
    const { layer, mock, internals } = makeLayer({
      fillField: 'val',
      selectedPalette: 'neutral',
      breaks: '10,50,100',
    });
    internals._data = [5, 20, 75, 500].map((val) => ({ geo: POLY, val }));
    await internals._renderLayer();
    const palette = samplePalette(CHOROPLETH_SCALES.neutral, 4);
    expect(mock.styles.map((s) => s.fillColor)).toEqual(palette);
    expect(layer.getLegendEntries().map((e) => e.label)).toEqual([
      'De 5 à 10',
      'De 10 à 50',
      'De 50 à 100',
      'De 100 à 500',
    ]);
  });

  it('fill-field sans selected-palette : echelle sequentielle par défaut', async () => {
    const { layer, internals } = makeLayer({ fillField: 'val', classes: 3 });
    internals._data = [1, 2, 3, 4, 5, 6].map((val) => ({ geo: POLY, val }));
    await internals._renderLayer();
    expect(layer.getLegendEntries()).toHaveLength(3);
  });

  it('couche color-map : paires dans l ordre + repli seulement s il a servi', async () => {
    const { layer, internals } = makeLayer({
      colorField: 'statut',
      colorMap: 'ok:#00A95F,ko:#E1000F',
      color: '#123456',
    });
    internals._data = [{ geo: POLY, statut: 'ok' }];
    await internals._renderLayer();
    expect(layer.getLegendEntries()).toEqual([
      { color: '#00A95F', label: 'ok' },
      { color: '#E1000F', label: 'ko' },
    ]);

    internals._data = [
      { geo: POLY, statut: 'ok' },
      { geo: POLY, statut: 'inconnu' },
    ];
    await internals._renderLayer();
    expect(layer.getLegendEntries().at(-1)).toEqual({
      color: '#123456',
      label: 'Autres valeurs',
    });
  });

  it('couche monochrome : une entree, libelle vide', async () => {
    const { layer, internals } = makeLayer({ color: '#000091' });
    internals._data = [{ geo: POLY }];
    await internals._renderLayer();
    expect(layer.getLegendEntries()).toEqual([{ color: '#000091', label: '' }]);
  });

  it('getLegendEntries() retourne une copie', async () => {
    const { layer, internals } = makeLayer({ color: '#000091' });
    internals._data = [{ geo: POLY }];
    await internals._renderLayer();
    layer.getLegendEntries()[0].label = 'mutation';
    expect(layer.getLegendEntries()[0].label).toBe('');
  });

  it('emet dsfr-data-map-layer-render (bubbles) avec compteurs et legende', async () => {
    const { layer, internals } = makeLayer({ colorField: 's', colorMap: 'a:#111' });
    document.body.appendChild(layer);
    // Le premier cycle Lit (proprietes de rendu posees) redessine deja la couche
    await layer.updateComplete;
    const seen: CustomEvent[] = [];
    document.addEventListener('dsfr-data-map-layer-render', (e) => seen.push(e as CustomEvent));
    internals._data = [
      { geo: POLY, s: 'a' },
      { geo: null, s: 'a' },
    ];
    await internals._renderLayer();
    expect(seen).toHaveLength(1);
    expect(seen[0].target).toBe(layer);
    expect(seen[0].detail).toEqual({
      rendered: 1,
      skipped: 1,
      total: 2,
      legend: [{ color: '#111', label: 'a' }],
    });
  });

  it('changer classes / method / breaks redessine la couche', () => {
    const { layer } = makeLayer();
    const props = (layer.constructor as unknown as { RENDER_PROPS: Set<string> }).RENDER_PROPS;
    for (const p of ['classes', 'method', 'breaks']) expect(props.has(p), p).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dsfr-data-map-legend
// ---------------------------------------------------------------------------

describe('dsfr-data-map-legend', () => {
  /** Carte hote factice (un div : pas d'init Leaflet) + couche + legende. */
  function mount(layerAttrs: Partial<DsfrDataMapLayer>, legendAttrs: Record<string, string>) {
    const host = document.createElement('div');
    const { layer, internals } = makeLayer(layerAttrs);
    layer.id = 'couche';
    host.appendChild(layer);
    const legend = document.createElement('dsfr-data-map-legend') as DsfrDataMapLegend;
    for (const [k, v] of Object.entries(legendAttrs)) legend.setAttribute(k, v);
    host.appendChild(legend);
    document.body.appendChild(host);
    return { host, layer, internals, legend };
  }

  const items = (legend: DsfrDataMapLegend) =>
    [...legend.querySelectorAll('li')].map((li) => ({
      text: plain(li.querySelector('.dsfr-data-map-legend__label')?.textContent),
      color: (li.querySelector('.dsfr-data-map-legend__swatch') as HTMLElement).style
        .backgroundColor,
      hidden: li.querySelector('.dsfr-data-map-legend__swatch')?.getAttribute('aria-hidden'),
    }));

  it('rend une liste pour une couche color-map (critere d acceptation)', async () => {
    const { internals, legend } = mount(
      { colorField: 'statut', colorMap: 'ok:#00A95F,ko:#E1000F' },
      { for: 'couche', label: 'Statut' }
    );
    internals._data = [
      { geo: POLY, statut: 'ok' },
      { geo: POLY, statut: 'ko' },
    ];
    await internals._renderLayer();
    await nextFrame();

    const list = legend.querySelector('ul');
    expect(list?.className).toContain('fr-raw-list');
    expect(legend.querySelector('.dsfr-data-map-legend__title')?.textContent).toBe('Statut');
    expect(legend.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
      'Légende : Statut'
    );
    expect(items(legend)).toEqual([
      { text: 'ok', color: '#00A95F', hidden: 'true' },
      { text: 'ko', color: '#E1000F', hidden: 'true' },
    ]);
  });

  it('rend 5 classes chiffrees pour une choroplethe classes="5" (critere d acceptation)', async () => {
    const { internals, legend } = mount(
      { fillField: 'val', selectedPalette: 'sequentialAscending', classes: 5 },
      { for: 'couche' }
    );
    internals._data = Array.from({ length: 10 }, (_, i) => ({ geo: POLY, val: (i + 1) * 1000 }));
    await internals._renderLayer();
    await nextFrame();
    const rendered = items(legend);
    expect(rendered).toHaveLength(5);
    expect(rendered[0].text).toBe('De 1 000 à 3 000');
    expect(rendered[4].text).toBe('De 9 000 à 10 000');
    expect(legend.querySelector('.dsfr-data-map-legend__title')).toBeNull();
  });

  it('se rafraichit a chaque rendu de la couche (filtre amont, timeline)', async () => {
    const { internals, legend } = mount(
      { colorField: 's', colorMap: 'a:#111,b:#222', color: '#999' },
      { for: 'couche' }
    );
    internals._data = [{ geo: POLY, s: 'a' }];
    await internals._renderLayer();
    await nextFrame();
    expect(items(legend)).toHaveLength(2);

    internals._data = [{ geo: POLY, s: 'zzz' }];
    await internals._renderLayer();
    expect(items(legend).map((i) => i.text)).toEqual(['a', 'b', 'Autres valeurs']);
  });

  it('couche monochrome : le libelle de la legende sert d entree', async () => {
    const { internals, legend } = mount({ color: '#000091' }, { for: 'couche', label: 'Bornes' });
    internals._data = [{ geo: POLY }];
    await internals._renderLayer();
    await nextFrame();
    expect(items(legend).map((i) => i.text)).toEqual(['Bornes']);
  });

  it('for inconnu ou couche sans rendu : conteneur masque, pas de liste', async () => {
    const { legend } = mount({ color: '#000091' }, { for: 'nexiste-pas' });
    await nextFrame();
    expect(legend.querySelector('ul')).toBeNull();
    expect((legend.querySelector('[role="group"]') as HTMLElement).hidden).toBe(true);
  });

  it('for vide dans une dsfr-data-map : toutes les couches directes', async () => {
    const host = document.createElement('dsfr-data-map');
    // Pas d'init : IntersectionObserver absent de happy-dom -> init immediate,
    // on neutralise en detachant apres creation. Ici on ne teste que la
    // resolution des couches, la carte reste sans Leaflet.
    const a = makeLayer({ color: '#111' });
    const b = makeLayer({ color: '#222' });
    host.appendChild(a.layer);
    host.appendChild(b.layer);
    const legend = document.createElement('dsfr-data-map-legend') as DsfrDataMapLegend;
    host.appendChild(legend);
    document.body.appendChild(host);
    a.internals._data = [{ geo: POLY }];
    b.internals._data = [{ geo: POLY }];
    await a.internals._renderLayer();
    await b.internals._renderLayer();
    await nextFrame();
    expect(legend.getEntries().map((e) => e.color)).toEqual(['#111', '#222']);
  });

  it('ignore les rendus des autres couches', async () => {
    const { internals, legend } = mount({ color: '#000091' }, { for: 'couche', label: 'A' });
    internals._data = [{ geo: POLY }];
    await internals._renderLayer();
    await nextFrame();
    const spy = vi.spyOn(legend, 'refresh');
    const other = makeLayer({ color: '#333' });
    document.body.appendChild(other.layer);
    other.internals._data = [{ geo: POLY }];
    await other.internals._renderLayer();
    expect(spy).not.toHaveBeenCalled();
  });

  it('se detache proprement : plus de rafraichissement apres retrait', async () => {
    const { internals, legend } = mount({ color: '#000091' }, { for: 'couche' });
    await nextFrame();
    legend.remove();
    const spy = vi.spyOn(legend, 'refresh');
    internals._data = [{ geo: POLY }];
    await internals._renderLayer();
    expect(spy).not.toHaveBeenCalled();
    expect(legend.querySelector('[role="group"]')).toBeNull();
  });

  it('injecte une feuille de style unique qui passe la legende sous les encarts flottants', () => {
    mount({ color: '#000091' }, { for: 'couche' });
    mount({ color: '#000091' }, { for: 'couche' });
    const sheets = document.head.querySelectorAll('style[data-dsfr-data-map-legend]');
    expect(sheets).toHaveLength(1);
    expect(sheets[0].textContent).toContain('clear: both');
  });
});
