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

  // #642 — emprises degenerees : un marqueur unique (sud = nord, ouest = est)
  // ou un segment. L'ancienne condition `>=` les prenait pour une
  // intersection vide et le fit ne bougeait pas.
  it('un point dans la zone (sud = nord, ouest = est) : bounds d aire nulle, pas null', () => {
    const paris = bounds(48.8566, 2.3522, 48.8566, 2.3522);
    const clipped = clipBoundsForFit(paris, METRO, fakeLeaflet);
    expect(clipped).not.toBeNull();
    expect(clipped!.getSouth()).toBe(48.8566);
    expect(clipped!.getNorth()).toBe(48.8566);
    expect(clipped!.getWest()).toBe(2.3522);
    expect(clipped!.getEast()).toBe(2.3522);
  });

  it('un segment nord-sud dans la zone (ouest = est) : conserve', () => {
    const meridien = bounds(43.0, 2.35, 49.0, 2.35);
    const clipped = clipBoundsForFit(meridien, METRO, fakeLeaflet);
    expect(clipped).not.toBeNull();
    expect(clipped!.getWest()).toBe(2.35);
    expect(clipped!.getEast()).toBe(2.35);
    expect(clipped!.getSouth()).toBe(43.0);
    expect(clipped!.getNorth()).toBe(49.0);
  });

  it('un segment est-ouest partiellement hors zone : clippe a la zone', () => {
    const parallele = bounds(45.0, -10.0, 45.0, 3.0);
    const clipped = clipBoundsForFit(parallele, METRO, fakeLeaflet)!;
    expect(clipped.getSouth()).toBe(45.0);
    expect(clipped.getNorth()).toBe(45.0);
    expect(clipped.getWest()).toBe(-6.5);
    expect(clipped.getEast()).toBe(3.0);
  });

  it('un point hors zone (Fort-de-France) : null, la vue ne bouge pas', () => {
    const fdf = bounds(14.6, -61.07, 14.6, -61.07);
    expect(clipBoundsForFit(fdf, METRO, fakeLeaflet)).toBe(null);
  });

  it('un point exactement sur la frontiere de la zone : conserve', () => {
    const coin = bounds(40.5, -6.5, 40.5, -6.5);
    expect(clipBoundsForFit(coin, METRO, fakeLeaflet)).not.toBeNull();
  });
});

describe('fit-max-zoom (#642) — plafond du zoom de fit', () => {
  /** Vue interne de la carte : ce que _applyFitBounds touche. */
  interface MapInternals {
    _leafletMap: { fitBounds: ReturnType<typeof vi.fn> } | null;
    _initMap: () => Promise<void>;
  }

  /**
   * Charge le module Leaflet interne (cache de module) sans creer de carte :
   * _initMap sur un element DECONNECTE s'abandonne juste apres loadLeaflet
   * (init posthume, #298). On pose ensuite une fausse carte qui espionne
   * fitBounds.
   */
  async function fitSpyMap(attrs: { fitMaxZoom?: number } = {}) {
    const map = new DsfrDataMap();
    await (map as unknown as MapInternals)._initMap();
    const leaflet = map.getLeafletLib()!;
    map.fitBounds = true;
    map.maxBounds = METRO;
    if (attrs.fitMaxZoom !== undefined) map.fitMaxZoom = attrs.fitMaxZoom;
    const fitBounds = vi.fn();
    (map as unknown as MapInternals)._leafletMap = { fitBounds };
    // Bounds Leaflet reelles : _combineBounds les copie via getSouthWest()
    const point = (lat: number, lon: number) => leaflet.latLngBounds([lat, lon], [lat, lon]);
    return { map, fitBounds, point };
  }

  it('un point dans la zone declenche bien un fit (plus de null)', async () => {
    const { map, fitBounds, point } = await fitSpyMap();
    map.registerLayerBounds('commune', point(48.85, 2.35));
    expect(fitBounds).toHaveBeenCalledTimes(1);
    const opts = fitBounds.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.maxZoom).toBeUndefined();
  });

  it('fit-max-zoom="12" est transmis a fitBounds comme maxZoom', async () => {
    const { map, fitBounds, point } = await fitSpyMap({ fitMaxZoom: 12 });
    map.registerLayerBounds('commune', point(48.85, 2.35));
    expect(fitBounds).toHaveBeenCalledTimes(1);
    const opts = fitBounds.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.maxZoom).toBe(12);
  });

  it('un point hors zone ne fitte pas (la vue ne bouge pas)', async () => {
    const { map, fitBounds, point } = await fitSpyMap({ fitMaxZoom: 12 });
    map.registerLayerBounds('fdf', point(14.6, -61.07));
    expect(fitBounds).not.toHaveBeenCalled();
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
