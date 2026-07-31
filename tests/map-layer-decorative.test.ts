import { describe, it, expect, vi } from 'vitest';

/**
 * Tests des attributs de couche decorative (v0.15.0) :
 * - shape-class : classe CSS sur les traces SVG (motifs hachures via <pattern>)
 * - no-interactive : couche sans clic/tooltip/popup (contours administratifs)
 * - dsfr-data-kpi value="=..." : valeur litterale sans source
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';

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

function makeFakeLayer() {
  return { on: vi.fn(), bindPopup: vi.fn(), bindTooltip: vi.fn() };
}

describe('shape-class / no-interactive — geoshape', () => {
  it('propage className et interactive:false, sans binder popup/tooltip', () => {
    const layer = new DsfrDataMapLayer();
    layer.geoField = 'geom';
    layer.shapeClass = 'hachures';
    layer.noInteractive = true;

    const captured: Array<Record<string, unknown>> = [];
    const fakeLeaf = {
      geoJSON: (_g: unknown, opts: Record<string, unknown>) => {
        captured.push(opts);
        return makeFakeLayer();
      },
    };
    const group = { addLayer: vi.fn() };
    const bindPopup = vi.spyOn(
      layer as unknown as { _bindPopup: (...a: unknown[]) => void },
      '_bindPopup' as never
    );

    (layer as unknown as Record<string, CallableFunction>)._addGeoshape.call(
      layer,
      { geom: POLY },
      fakeLeaf,
      group,
      [],
      []
    );

    expect(captured[0].interactive).toBe(false);
    expect((captured[0].style as Record<string, unknown>).className).toBe('hachures');
    expect(bindPopup).not.toHaveBeenCalled();
    expect(group.addLayer).toHaveBeenCalledTimes(1);
  });

  it('par defaut : interactif, pas de className', () => {
    const layer = new DsfrDataMapLayer();
    layer.geoField = 'geom';

    const captured: Array<Record<string, unknown>> = [];
    const fakeLeaf = {
      geoJSON: (_g: unknown, opts: Record<string, unknown>) => {
        captured.push(opts);
        return makeFakeLayer();
      },
    };
    (layer as unknown as Record<string, CallableFunction>)._addGeoshape.call(
      layer,
      { geom: POLY },
      fakeLeaf,
      { addLayer: vi.fn() },
      [],
      []
    );

    expect(captured[0].interactive).toBe(true);
    expect('className' in (captured[0].style as object)).toBe(false);
  });
});

describe('shape-class / no-interactive — circle', () => {
  it('propage les options au circleMarker', () => {
    const layer = new DsfrDataMapLayer();
    layer.latField = 'lat';
    layer.lonField = 'lon';
    layer.shapeClass = 'poi-special';
    layer.noInteractive = true;

    const captured: Array<Record<string, unknown>> = [];
    const fakeLeaf = {
      circleMarker: (_c: unknown, opts: Record<string, unknown>) => {
        captured.push(opts);
        return makeFakeLayer();
      },
    };
    (layer as unknown as Record<string, CallableFunction>)._addCircle.call(
      layer,
      { lat: 46, lon: 2 },
      fakeLeaf,
      { addLayer: vi.fn() }
    );

    expect(captured[0].interactive).toBe(false);
    expect(captured[0].className).toBe('poi-special');
  });
});

describe('dsfr-data-kpi — valeur litterale', () => {
  const compute = (v: string) => {
    const kpi = new DsfrDataKpi();
    kpi.value = v;
    return (kpi as unknown as { _computeValue: () => number | string | null })._computeValue();
  };

  it('value="=667" rend le nombre 667 sans source', () => {
    expect(compute('=667')).toBe(667);
  });

  it('value="=87 %" rend la chaine telle quelle', () => {
    expect(compute('=87 %')).toBe('87 %');
  });

  it('value="=14,8" accepte la virgule decimale', () => {
    expect(compute('=14,8')).toBe(14.8);
  });

  it('sans = : comportement inchange (null sans source)', () => {
    expect(compute('population:sum')).toBe(null);
  });
});
