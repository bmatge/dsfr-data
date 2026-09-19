import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Garde-fou de la rampe servie par `dsfr-data-map-layer` (#969).
 *
 * `dsfr-data-podium` avait deja le sien (PR #966) ; `map-layer`, l'autre
 * consommateur des echelles choroplethes, n'en avait AUCUN. Or les deux
 * constantes de palettes portent les memes noms de cles
 * (`sequentialAscending`, `sequentialDescending`, …) pour des rampes
 * differentes — 9 pas pour `CHOROPLETH_SCALES`, 5 tons pour `PALETTE_COLORS`.
 * Rien, dans le rendu, ne distinguerait une couche qui lirait la mauvaise :
 * les deux sont des degrades Bleu France plausibles.
 *
 * Ce test fige les couleurs effectivement posees sur les polygones, en clair,
 * et verifie explicitement qu'elles ne sont pas celles de `PALETTE_COLORS`.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { CHOROPLETH_SCALES, PALETTE_COLORS, samplePalette } from '@dsfr-data/shared/lib';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';

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

/** Leaflet minimal : on ne releve que le `fillColor` de chaque forme. */
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

/** Neuf valeurs distinctes, quantiles sur 9 pas (le défaut de la couche). */
const neufValeurs = () => Array.from({ length: 9 }, (_, i) => ({ geo: POLY, val: (i + 1) * 10 }));

/**
 * Ce que les neuf valeurs ci-dessus donnent : les bornes de quantile sont des
 * maxima INCLUSIFS, donc les deux plus petites valeurs tombent dans la meme
 * classe et le 9e ton n'est jamais atteint : les pas servis sont 0, 0, 1, 2,
 * 3, 4, 5, 6, 7 de l'echelle. C'est le comportement historique, verifie identique avant et
 * apres la separation des fichiers (#969) ; ce test le fige aussi.
 */
const attendu = (cle: string) => {
  const s = CHOROPLETH_SCALES[cle];
  return [s[0], s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7]];
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('#969 — map-layer sert CHOROPLETH_SCALES, pas PALETTE_COLORS', () => {
  it('sequentialAscending par défaut : les 9 pas, dans l ordre, figes en clair', async () => {
    const { mock, internals } = makeLayer({ fillField: 'val' });
    internals._data = neufValeurs();
    await internals._renderLayer();

    const servies = mock.styles.map((s) => s.fillColor);
    expect(servies).toEqual([
      '#F5F5FE',
      '#F5F5FE',
      '#E3E3FD',
      '#C1C1FB',
      '#A1A1F8',
      '#8585F6',
      '#6A6AF4',
      '#4747E5',
      '#2323B4',
    ]);
    expect(servies).toEqual(attendu('sequentialAscending'));
    // Et surtout : chaque couleur vient de la rampe a 9 pas, aucune de la
    // rampe homonyme a 5 tons qui ne partage avec elle que `#6A6AF4`.
    for (const c of servies) expect(CHOROPLETH_SCALES.sequentialAscending).toContain(c);
    expect(servies).not.toEqual(PALETTE_COLORS.sequentialAscending);
  });

  it('sequentialDescending : la rampe a 9 pas, pas celle a 5 tons', async () => {
    const { mock, internals } = makeLayer({
      fillField: 'val',
      selectedPalette: 'sequentialDescending',
    });
    internals._data = neufValeurs();
    await internals._renderLayer();

    const servies = mock.styles.map((s) => s.fillColor);
    expect(servies).toEqual([
      '#000091',
      '#000091',
      '#2323B4',
      '#4747E5',
      '#6A6AF4',
      '#8585F6',
      '#A1A1F8',
      '#C1C1FB',
      '#E3E3FD',
    ]);
    expect(servies).toEqual(attendu('sequentialDescending'));
    expect(servies).not.toEqual(PALETTE_COLORS.sequentialDescending);
  });

  it('divergentAscending, divergentDescending, neutral : meme verdict', async () => {
    for (const cle of ['divergentAscending', 'divergentDescending', 'neutral'] as const) {
      const { mock, internals } = makeLayer({ fillField: 'val', selectedPalette: cle });
      internals._data = neufValeurs();
      await internals._renderLayer();
      const servies = mock.styles.map((s) => s.fillColor);
      expect(servies, cle).toEqual(attendu(cle));
      expect(servies, cle).not.toEqual(PALETTE_COLORS[cle]);
    }
  });

  it('classes=5 : sous-echantillonnage de la rampe a 9 pas, pas la rampe a 5 tons', async () => {
    const { mock, internals } = makeLayer({
      fillField: 'val',
      selectedPalette: 'sequentialDescending',
      classes: 5,
    });
    internals._data = Array.from({ length: 10 }, (_, i) => ({ geo: POLY, val: (i + 1) * 10 }));
    await internals._renderLayer();

    const distinctes = [...new Set(mock.styles.map((s) => s.fillColor))];
    // 5 classes sur une echelle de 9 : pas 1, 3, 5, 7, 9.
    expect(distinctes).toEqual([...samplePalette(CHOROPLETH_SCALES.sequentialDescending, 5)]);
    expect(distinctes).toEqual(['#000091', '#4747E5', '#8585F6', '#C1C1FB', '#F5F5FE']);
    // Une rampe a 5 tons sous-echantillonnee ne donnerait pas ces couleurs.
    expect(distinctes).not.toEqual(PALETTE_COLORS.sequentialDescending);
  });

  it('palette inconnue : repli sur sequentialAscending de CHOROPLETH_SCALES', async () => {
    const { mock, internals } = makeLayer({ fillField: 'val', selectedPalette: 'nexistePas' });
    internals._data = neufValeurs();
    await internals._renderLayer();
    expect(mock.styles.map((s) => s.fillColor)).toEqual(attendu('sequentialAscending'));
  });
});
