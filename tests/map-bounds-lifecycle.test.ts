import { describe, it, expect, vi } from 'vitest';

/**
 * Tests traversants #294 (EPIC F) — bounds des layers par cle, sans fuite.
 *
 * Bugs d'origine : registerLayerBounds pushait sans jamais reset — chaque
 * rendu de layer (refresh, frame de timeline, pan en bbox client) ajoutait
 * une entrée : croissance mémoire indéfinie et fit-bounds combinant les
 * bounds HISTORIQUES (la carte ne pouvait jamais rétrécir sa vue). En bonus,
 * `combined.extend(...)` mutait la première entrée stockée (extend Leaflet
 * modifie en place).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMap } from '@/components/dsfr-data-map.js';

function fakeBounds(label: string) {
  return {
    label,
    extended: [] as string[],
    getSouthWest: () => ({ lat: 0, lng: 0, label }),
    getNorthEast: () => ({ lat: 1, lng: 1, label }),
    extend(other: any) {
      this.extended.push(other.label);
      return this;
    },
    isValid: () => true,
  };
}

/** Faux module Leaflet : latLngBounds crée une COPIE traçable */
const fakeLeaflet = {
  latLngBounds: (sw: any, ne: any) => {
    const copy = fakeBounds(`copy-of-${sw.label}`);
    copy.getSouthWest = () => sw;
    copy.getNorthEast = () => ne;
    return copy;
  },
} as any;

describe('#294 — AC : les bounds sont remplacés par layer, pas cumulés', () => {
  it('re-rendre le même layer remplace son entrée (pas de croissance mémoire)', () => {
    const map = new DsfrDataMap();
    // Simule 50 frames de timeline sur le même layer
    for (let i = 0; i < 50; i++) {
      map.registerLayerBounds('layer-a', fakeBounds(`frame-${i}`) as any);
    }
    expect((map as any)._layerBounds.size).toBe(1);
    expect((map as any)._layerBounds.get('layer-a').label).toBe('frame-49');
  });

  it('AC : après réduction des données, le fit-bounds suit (les bounds historiques ont disparu)', () => {
    const map = new DsfrDataMap();
    const big = fakeBounds('big');
    const small = fakeBounds('small');

    map.registerLayerBounds('layer-a', big as any);
    map.registerLayerBounds('layer-a', small as any);

    const combined = (map as any)._combineBounds(
      [...(map as any)._layerBounds.values()],
      fakeLeaflet
    );
    // La combinaison part de `small` (seule entrée restante), pas de `big`
    expect(combined.label).toBe('copy-of-small');
  });

  it('unregisterLayerBounds libère l’entrée du layer retiré', () => {
    const map = new DsfrDataMap();
    map.registerLayerBounds('layer-a', fakeBounds('a') as any);
    map.registerLayerBounds('layer-b', fakeBounds('b') as any);

    map.unregisterLayerBounds('layer-a');

    expect((map as any)._layerBounds.size).toBe(1);
    expect((map as any)._layerBounds.has('layer-b')).toBe(true);
  });

  it('la combinaison N’ALTÈRE PAS les bounds stockés (copie avant extend)', () => {
    const map = new DsfrDataMap();
    const a = fakeBounds('a');
    const b = fakeBounds('b');
    map.registerLayerBounds('layer-a', a as any);
    map.registerLayerBounds('layer-b', b as any);

    const combined = (map as any)._combineBounds(
      [...(map as any)._layerBounds.values()],
      fakeLeaflet
    );

    // extend appelé sur la COPIE, jamais sur les entrées stockées
    expect(a.extended).toEqual([]);
    expect(b.extended).toEqual([]);
    expect(combined.extended).toEqual(['b']);
  });
});
