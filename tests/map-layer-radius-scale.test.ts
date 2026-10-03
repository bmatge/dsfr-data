import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * AM-107 (banc d'essai open-data-viz, #1229) — `radius-field` fait croître le
 * RAYON, pas l'aire : une valeur dix fois plus grande a un cercle jusqu'à cent
 * fois plus grand, et la plus petite valeur prend `radius-min`.
 *
 * Arbitrage du 2026-10-03 : l'échelle en aire arrive comme une OPTION,
 * `radius-scale="sqrt"`, ancrée à zéro ; le défaut ne change pas.
 *
 * AC : en `sqrt`, une valeur quatre fois plus grande a un rayon double, une
 * valeur nulle a un rayon nul ; sans l'attribut, les rayons sont ceux d'avant.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';

/** Vue interne de la couche : ce que `_onMapReady` pose, et le rendu. */
interface LayerInternals {
  _L: unknown;
  _leafletMap: unknown;
  _layerGroup: unknown;
  _mapParent: unknown;
  _visible: boolean;
  _data: Record<string, unknown>[];
  _renderLayer(): Promise<void>;
}

/** Leaflet réduit au nécessaire : chaque cercle créé garde le rayon demandé. */
function setup(layer: DsfrDataMapLayer): { rayons: number[]; internals: LayerInternals } {
  const rayons: number[] = [];
  const forme = {
    bindPopup: () => forme,
    bindTooltip: () => forme,
    on: () => forme,
    getElement: () => null,
  };
  const groupe = {
    clearLayers: () => {
      rayons.length = 0;
    },
    addLayer: () => {},
    addTo: () => {},
    removeFrom: () => {},
    getBounds: () => ({ isValid: () => false }),
  };
  const internals = layer as unknown as LayerInternals;
  internals._L = {
    circleMarker: (_pos: unknown, opts: { radius: number }) => {
      rayons.push(opts.radius);
      return { ...forme };
    },
    circle: (_pos: unknown, opts: { radius: number }) => {
      rayons.push(opts.radius);
      return { ...forme };
    },
  };
  internals._leafletMap = { getZoom: () => 10, hasLayer: () => false, on: () => {} };
  internals._layerGroup = groupe;
  internals._mapParent = null;
  internals._visible = true;
  return { rayons, internals };
}

function couche(valeurs: unknown[], attrs: Partial<DsfrDataMapLayer> = {}) {
  const layer = new DsfrDataMapLayer();
  layer.type = 'circle';
  layer.latField = 'lat';
  layer.lonField = 'lon';
  layer.radiusField = 'v';
  Object.assign(layer, attrs);
  const { rayons, internals } = setup(layer);
  internals._data = valeurs.map((v, i) => ({ lat: 45 + i, lon: 2, v }));
  return { layer, rayons, internals };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AM-107 — radius-scale="sqrt" : l’aire suit la valeur, ancrée à zéro', () => {
  it('valeurs 0, 1, 4, 100 : rayons 0, 3, 6, 30 (radius-max 30)', async () => {
    const { rayons, internals } = couche([0, 1, 4, 100], { radiusScale: 'sqrt' });
    await internals._renderLayer();
    expect(rayons.map((r) => Math.round(r * 1e9) / 1e9)).toEqual([0, 3, 6, 30]);
  });

  it('une valeur quatre fois plus grande a un rayon double, cent fois : décuple', async () => {
    const { rayons, internals } = couche([1, 4, 100], { radiusScale: 'sqrt', radiusMax: 50 });
    await internals._renderLayer();
    expect(rayons[1] / rayons[0]).toBeCloseTo(2, 9);
    expect(rayons[2] / rayons[0]).toBeCloseTo(10, 9);
    expect(rayons[2]).toBe(50);
  });

  it('radius-min est sans effet : la plus petite valeur ne prend pas un plancher', async () => {
    const { rayons, internals } = couche([1, 100], { radiusScale: 'sqrt', radiusMin: 12 });
    await internals._renderLayer();
    expect(rayons[0]).toBeCloseTo(3, 9);
  });

  it('une valeur négative ou absente a un rayon nul, et les négatives sont dites une fois', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rayons, internals } = couche([-25, null, 100], { radiusScale: 'sqrt' });
    await internals._renderLayer();
    await internals._renderLayer();
    expect(rayons).toEqual([0, 0, 30]);
    const dits = warn.mock.calls.filter((c) => String(c[0]).includes('rayon nul'));
    expect(dits).toHaveLength(1);
    expect(String(dits[0][0])).toContain('1 valeur(s)');
  });

  it('toutes les valeurs nulles : tous les rayons sont nuls, sans division par zéro', async () => {
    const { rayons, internals } = couche([0, 0], { radiusScale: 'sqrt' });
    await internals._renderLayer();
    expect(rayons).toEqual([0, 0]);
  });

  it('radius-unit="m" : le champ reste un rayon en mètres, l’échelle ne s’applique pas', async () => {
    const { rayons, internals } = couche([100, 400], { radiusScale: 'sqrt', radiusUnit: 'm' });
    await internals._renderLayer();
    expect(rayons).toEqual([100, 400]);
  });
});

describe('AM-107 — le défaut ne change pas', () => {
  it('sans radius-scale : échelle linéaire entre radius-min et radius-max', async () => {
    const { layer, rayons, internals } = couche([0, 1, 4, 100]);
    expect(layer.radiusScale).toBe('linear');
    await internals._renderLayer();
    expect(rayons.map((r) => Math.round(r * 100) / 100)).toEqual([4, 4.26, 5.04, 30]);
  });

  it('valeurs toutes égales : le milieu de radius-min et radius-max, comme avant', async () => {
    const { rayons, internals } = couche([7, 7]);
    await internals._renderLayer();
    expect(rayons).toEqual([17, 17]);
  });

  it('une valeur inconnue de radius-scale est dite, et retombe sur l’échelle linéaire', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rayons, internals } = couche([0, 100], {
      radiusScale: 'log' as DsfrDataMapLayer['radiusScale'],
    });
    await internals._renderLayer();
    await internals._renderLayer();
    expect(rayons).toEqual([4, 30]);
    const dits = warn.mock.calls.filter((c) => String(c[0]).includes('radius-scale="log"'));
    expect(dits).toHaveLength(1);
  });

  it('un grand jeu ne déborde pas la pile (bornes relevées en boucle)', async () => {
    const valeurs = Array.from({ length: 200_000 }, (_, i) => i);
    const { rayons, internals } = couche(valeurs, { maxItems: 0 });
    await internals._renderLayer();
    expect(rayons).toHaveLength(200_000);
    expect(rayons[0]).toBe(4);
    expect(rayons.at(-1)).toBe(30);
  });
});
