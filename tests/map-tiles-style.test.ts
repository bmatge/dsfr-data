import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * tiles-style="muted|grey" (#686) — fond de carte attenue pour les cartes
 * thematiques, sans CSS de page : filtre CSS sur le volet des tuiles, dans
 * la feuille injectee par la carte, scope a l'instance par son attribut.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMap } from '@/components/dsfr-data-map.js';
import { DsfrDataMapInset } from '@/components/dsfr-data-map-inset.js';
import '@/components/dsfr-data-map-layer.js';

if (!customElements.get('dsfr-data-map')) customElements.define('dsfr-data-map', DsfrDataMap);
if (!customElements.get('dsfr-data-map-inset')) {
  customElements.define('dsfr-data-map-inset', DsfrDataMapInset);
}

interface MapInternals {
  _injectStyles: () => void;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('tiles-style (#686)', () => {
  it('défaut vide : fond tel quel', () => {
    expect(new DsfrDataMap().tilesStyle).toBe('');
  });

  it('la feuille injectee porte les deux filtres, scopes par attribut sur la carte', () => {
    (new DsfrDataMap() as unknown as MapInternals)._injectStyles();
    const css = document.head.querySelector('style[data-dsfr-data-map]')?.textContent ?? '';
    expect(css).toMatch(
      /dsfr-data-map\[tiles-style="muted"\] > \.dsfr-data-map__container \.leaflet-tile-pane \{\s*filter: grayscale\(1\) opacity\(0\.55\);/
    );
    expect(css).toMatch(
      /dsfr-data-map\[tiles-style="grey"\] > \.dsfr-data-map__container \.leaflet-tile-pane \{\s*filter: grayscale\(1\);/
    );
  });

  it('la propriete est reflechie en attribut (le selecteur CSS la voit)', async () => {
    const map = document.createElement('dsfr-data-map') as DsfrDataMap;
    document.body.appendChild(map);
    map.tilesStyle = 'muted';
    await map.updateComplete;
    expect(map.getAttribute('tiles-style')).toBe('muted');
  });

  it('un encart reprend le tiles-style de la carte hote', async () => {
    const host = document.createElement('dsfr-data-map') as DsfrDataMap;
    host.setAttribute('tiles', 'ign-plan');
    host.setAttribute('tiles-style', 'grey');
    const layer = document.createElement('dsfr-data-map-layer');
    layer.setAttribute('source', 'x');
    host.appendChild(layer);
    const inset = document.createElement('dsfr-data-map-inset') as DsfrDataMapInset;
    inset.setAttribute('territory', 'guadeloupe');
    host.appendChild(inset);
    document.body.appendChild(host);
    await nextFrame();
    const inner = inset.querySelector('dsfr-data-map');
    expect(inner).not.toBeNull();
    expect(inner?.getAttribute('tiles-style')).toBe('grey');
  });

  it('sans tiles-style sur la carte hote, l encart n en pose pas', async () => {
    const host = document.createElement('dsfr-data-map') as DsfrDataMap;
    const layer = document.createElement('dsfr-data-map-layer');
    layer.setAttribute('source', 'x');
    host.appendChild(layer);
    const inset = document.createElement('dsfr-data-map-inset') as DsfrDataMapInset;
    inset.setAttribute('territory', 'corse');
    host.appendChild(inset);
    document.body.appendChild(host);
    await nextFrame();
    expect(inset.querySelector('dsfr-data-map')?.hasAttribute('tiles-style')).toBe(false);
  });
});
