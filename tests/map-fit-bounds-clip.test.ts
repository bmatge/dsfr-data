import { describe, it, expect, vi } from 'vitest';

/**
 * Tests fit-bounds + max-bounds (#294 suite) — zoom automatique sur les
 * donnees filtrees sans dezoomer au monde entier quand le jeu contient des
 * territoires lointains (DROM).
 *
 * - clipBoundsForFit : intersection donnees ∩ max-bounds avant le fit
 *   (null = intersection vide, la vue ne bouge pas)
 * - unregisterLayerBounds : une couche videe par un filtre libere ses bounds
 *   (sinon l'ancienne emprise fausse les fits suivants)
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMap, clipBoundsForFit } from '@/components/dsfr-data-map.js';

function bounds(south: number, west: number, north: number, east: number) {
  return {
    getSouth: () => south,
    getWest: () => west,
    getNorth: () => north,
    getEast: () => east,
    isValid: () => true,
  } as unknown as import('leaflet').LatLngBounds;
}

const fakeLeaflet = {
  latLngBounds: (sw: [number, number], ne: [number, number]) => bounds(sw[0], sw[1], ne[0], ne[1]),
} as unknown as typeof import('leaflet');

const METRO = '40.5,-6.5,52,10.5';

describe('clipBoundsForFit', () => {
  it('sans max-bounds : bounds inchangees', () => {
    const b = bounds(41, -5, 51, 9);
    expect(clipBoundsForFit(b, '', fakeLeaflet)).toBe(b);
  });

  it('max-bounds invalide : bounds inchangees', () => {
    const b = bounds(41, -5, 51, 9);
    expect(clipBoundsForFit(b, 'nawak', fakeLeaflet)).toBe(b);
    expect(clipBoundsForFit(b, '1,2,3', fakeLeaflet)).toBe(b);
  });

  it('jeu France entiere (DROM inclus) clippe a la metropole', () => {
    // Bounds combinees de la Reunion (-21) a Lille (51)
    const world = bounds(-21.4, -61.8, 51.1, 55.8);
    const clipped = clipBoundsForFit(world, METRO, fakeLeaflet)!;
    expect(clipped.getSouth()).toBe(40.5);
    expect(clipped.getWest()).toBe(-6.5);
    expect(clipped.getNorth()).toBe(51.1);
    expect(clipped.getEast()).toBe(10.5);
  });

  it('region metropolitaine : intersection = la region elle-meme', () => {
    const bretagne = bounds(47.2, -5.2, 48.9, -1.0);
    const clipped = clipBoundsForFit(bretagne, METRO, fakeLeaflet)!;
    expect(clipped.getSouth()).toBe(47.2);
    expect(clipped.getWest()).toBe(-5.2);
    expect(clipped.getNorth()).toBe(48.9);
    expect(clipped.getEast()).toBe(-1.0);
  });

  it('donnees entierement hors zone (DROM seul) : null, la vue ne bouge pas', () => {
    const martinique = bounds(14.3, -61.3, 14.9, -60.8);
    expect(clipBoundsForFit(martinique, METRO, fakeLeaflet)).toBe(null);
  });
});

describe('bounds liberees par une couche videe (filtrage amont)', () => {
  it('unregisterLayerBounds retire la cle sans refit quand tout est vide', () => {
    const map = new DsfrDataMap();
    map.registerLayerBounds('communes', bounds(43, 1, 44, 2));
    expect((map as unknown as { _layerBounds: Map<string, unknown> })._layerBounds.size).toBe(1);
    map.unregisterLayerBounds('communes');
    expect((map as unknown as { _layerBounds: Map<string, unknown> })._layerBounds.size).toBe(0);
    // Idempotent
    map.unregisterLayerBounds('communes');
    expect((map as unknown as { _layerBounds: Map<string, unknown> })._layerBounds.size).toBe(0);
  });
});
