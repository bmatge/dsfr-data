import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests traversants #299 (EPIC F) — world-map alignée sur la famille carte.
 *
 * Bugs d'origine : attribut `zoom: 'continent' | 'none'` quand dsfr-data-map
 * a un zoom NUMÉRIQUE Leaflet (même nom, types opposés, même famille) ;
 * interaction 100 % souris (aucun pays focusable, pas de clavier, tooltip
 * hover-only) ; loadTopology() sans garde de concurrence (2 world-maps =
 * 2 fetches du TopoJSON ~140 Ko) ; branche morte dans le render ; pas de
 * config-error si code-field/value-field manquants (carte grise silencieuse).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataWorldMap } from '@/components/dsfr-data-world-map.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

const TOPO = {
  type: 'Topology',
  objects: {
    countries: {
      type: 'GeometryCollection',
      geometries: [
        {
          type: 'Polygon',
          id: '250',
          properties: { name: 'France' },
          arcs: [[0]],
        },
      ],
    },
  },
  arcs: [
    [
      [0, 0],
      [10, 0],
      [0, 10],
      [-10, 0],
      [0, -10],
    ],
  ],
  transform: { scale: [0.5, 0.5], translate: [-2, 40] },
};

function topoResponse() {
  return { ok: true, json: async () => JSON.parse(JSON.stringify(TOPO)) };
}

describe('#299 — AC : un seul fetch TopoJSON par page', () => {
  it('deux world-maps simultanées partagent la même promesse de chargement', async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(topoResponse());

    const a = new DsfrDataWorldMap();
    const b = new DsfrDataWorldMap();
    // _loadMap simultanés (le cache de promesse doit dédupliquer)
    await Promise.all([(a as any)._loadMap(), (b as any)._loadMap()]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((a as any)._topology).toBeTruthy();
    expect((b as any)._topology).toBeTruthy();
  });
});

describe('#299 — zoom-mode remplace zoom (alias déprécié)', () => {
  it('zoom-mode est la propriété, zoom n’existe plus comme prop Lit', () => {
    const el = new DsfrDataWorldMap();
    expect(el.zoomMode).toBe('continent');
    const props = (DsfrDataWorldMap as any).elementProperties as Map<string, unknown>;
    expect([...props.keys()]).toContain('zoomMode');
    expect([...props.keys()]).not.toContain('zoom');
  });

  it('l’ancien attribut zoom est lu avec un warn de dépréciation', () => {
    mockFetch.mockResolvedValue(topoResponse());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = new DsfrDataWorldMap();
    el.setAttribute('zoom', 'none');
    document.body.appendChild(el);

    expect(el.zoomMode).toBe('none');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('zoom-mode'));

    el.remove();
    warnSpy.mockRestore();
  });
});

describe('#299 — config-error si code-field/value-field manquants avec une source', () => {
  beforeEach(() => clearDataCache('wm-src'));

  it('source sans code-field → data-dsfr-config-error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = new DsfrDataWorldMap();
    el.source = 'wm-src';
    el.valueField = 'total';
    (el as any)._validateFields();

    expect(el.getAttribute('data-dsfr-config-error')).toMatch(/code-field/);
    errorSpy.mockRestore();
  });

  it('config complète : aucun signalement', () => {
    const el = new DsfrDataWorldMap();
    el.source = 'wm-src';
    el.codeField = 'code';
    el.valueField = 'total';
    (el as any)._validateFields();

    expect(el.hasAttribute('data-dsfr-config-error')).toBe(false);
  });

  it('sans source (carte décorative) : aucun signalement', () => {
    const el = new DsfrDataWorldMap();
    (el as any)._validateFields();
    expect(el.hasAttribute('data-dsfr-config-error')).toBe(false);
  });
});

describe('#299 — AC : parcours clavier avec annonce de la valeur', () => {
  it('chaque pays est focusable avec un aria-label nom + valeur', async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(topoResponse());
    clearDataCache('wm-kb');

    const el = new DsfrDataWorldMap();
    el.source = 'wm-kb';
    el.codeField = 'code';
    el.valueField = 'total';
    document.body.appendChild(el);
    await (el as any)._loadMap();
    dispatchDataLoaded('wm-kb', [{ code: 'FR', total: 67000000 }]);
    await el.updateComplete;

    const country = el.querySelector('.dsfr-data-world-map__country') as SVGPathElement | null;
    expect(country).not.toBeNull();
    expect(country!.getAttribute('tabindex')).toBe('0');
    expect(country!.getAttribute('role')).toBe('button');
    const label = country!.getAttribute('aria-label') || '';
    expect(label).toContain('France');
    expect(label).toMatch(/67[\s ]?000[\s ]?000/);

    el.remove();
  });
});
