import { describe, it, expect } from 'vitest';

/**
 * Tests #426 — dsfr-data-map-layer : geo-field doit accepter les geometries
 * GeoJSON serialisees en chaine (colonnes Text Grist, CSV/Tabular).
 *
 * Bug d'origine : la resolution de geo-field rejetait toute valeur non-objet
 * (`typeof geoData !== 'object'`) → 108 lignes recues, 0 feature rendue.
 */

import { parseGeoValue } from '@/utils/geo-value.js';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';

const POLYGON = {
  type: 'Polygon',
  coordinates: [
    [
      [2.0, 46.0],
      [3.0, 46.0],
      [3.0, 47.0],
      [2.0, 47.0],
      [2.0, 46.0],
    ],
  ],
};

describe('parseGeoValue (#426)', () => {
  it('passe les objets inchanges', () => {
    expect(parseGeoValue(POLYGON)).toBe(POLYGON);
    expect(parseGeoValue(null)).toBe(null);
    expect(parseGeoValue(undefined)).toBe(undefined);
    expect(parseGeoValue(42)).toBe(42);
  });

  it('parse une chaine GeoJSON valide', () => {
    const result = parseGeoValue(JSON.stringify(POLYGON)) as typeof POLYGON;
    expect(result.type).toBe('Polygon');
    expect(result.coordinates).toEqual(POLYGON.coordinates);
  });

  it('parse un tableau JSON serialise', () => {
    expect(parseGeoValue('[46.5, 2.6]')).toEqual([46.5, 2.6]);
  });

  it('tolere les espaces de tete', () => {
    expect(parseGeoValue('  {"type":"Point","coordinates":[2.6,46.5]}')).toMatchObject({
      type: 'Point',
    });
  });

  it('laisse passer les chaines non-JSON inchangees', () => {
    expect(parseGeoValue('Corse')).toBe('Corse');
    expect(parseGeoValue('')).toBe('');
  });

  it('laisse passer les chaines JSON invalides inchangees', () => {
    const broken = '{"type":"Polygon","coordinates":';
    expect(parseGeoValue(broken)).toBe(broken);
  });

  it('memoïse : deux appels sur la meme chaine retournent la meme reference', () => {
    const str = JSON.stringify(POLYGON);
    expect(parseGeoValue(str)).toBe(parseGeoValue(str));
  });
});

describe('#426 — _extractCoords accepte un Point GeoJSON en chaine', () => {
  it('resout lat/lon depuis une colonne Text Grist', () => {
    const layer = new DsfrDataMapLayer();
    layer.geoField = 'geojson';
    const coords = (layer as unknown as Record<string, CallableFunction>)._extractCoords.call(
      layer,
      { geojson: '{"type":"Point","coordinates":[2.6,46.5]}' }
    );
    expect(coords).toEqual({ lat: 46.5, lon: 2.6 });
  });

  it('retourne null si la chaine est invalide', () => {
    const layer = new DsfrDataMapLayer();
    layer.geoField = 'geojson';
    const coords = (layer as unknown as Record<string, CallableFunction>)._extractCoords.call(
      layer,
      { geojson: '{"type":"Point"' }
    );
    expect(coords).toBe(null);
  });
});

describe('#426 — _recordIntersectsBounds accepte un Polygon en chaine', () => {
  const makeBounds = (swLat: number, swLng: number, neLat: number, neLng: number) =>
    ({
      getSouthWest: () => ({ lat: swLat, lng: swLng }),
      getNorthEast: () => ({ lat: neLat, lng: neLng }),
      contains: () => false,
    }) as unknown;

  const callIntersects = (layer: DsfrDataMapLayer, record: unknown, bounds: unknown): boolean =>
    (layer as unknown as Record<string, CallableFunction>)._recordIntersectsBounds.call(
      layer,
      record,
      bounds
    ) as boolean;

  it('filtre par bbox un contour serialise (geo-field explicite)', () => {
    const layer = new DsfrDataMapLayer();
    layer.geoField = 'geojson';
    const record = { geojson: JSON.stringify(POLYGON) };

    // Bounds recouvrant le polygone (France) → visible
    expect(callIntersects(layer, record, makeBounds(41, -5, 51, 10))).toBe(true);
    // Bounds ailleurs (Bretagne) → filtre
    expect(callIntersects(layer, record, makeBounds(47.5, -5, 49, -1))).toBe(false);
  });

  it("filtre aussi via l'auto-detection geo_shape en chaine", () => {
    const layer = new DsfrDataMapLayer();
    const record = { geo_shape: JSON.stringify(POLYGON) };

    expect(callIntersects(layer, record, makeBounds(41, -5, 51, 10))).toBe(true);
    expect(callIntersects(layer, record, makeBounds(47.5, -5, 49, -1))).toBe(false);
  });

  it("chaine invalide → true (on ne filtre pas ce qu'on ne sait pas lire)", () => {
    const layer = new DsfrDataMapLayer();
    layer.geoField = 'geojson';
    const record = { geojson: 'pas du json' };
    expect(callIntersects(layer, record, makeBounds(47.5, -5, 49, -1))).toBe(true);
  });
});
