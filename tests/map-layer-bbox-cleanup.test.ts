import { describe, it, expect, vi } from 'vitest';

/**
 * Tests traversants #297 (EPIC F) — bbox client vs géométries, cleanup au
 * disconnect, et annexes (compagnon par rendu, radius m, attribut filter).
 *
 * Bugs d'origine :
 * - le fallback bbox client (adapters sans serverGeo) filtrait via
 *   _extractCoords qui ne sait extraire que des POINTS : un Polygon
 *   retournait null → tous les polygones disparaissaient au premier pan ;
 * - disconnectedCallback n'annulait pas le filtre whereKey "map-bbox"
 *   poussé sur la source → un layer retiré laissait la source filtrée sur
 *   le dernier viewport pour tous les autres consommateurs ;
 * - _findPopupCompanion appelé PAR RECORD (jusqu'à 5000 querySelector par
 *   rendu) ; radius-unit="m" + radius-field → échelle px interprétée en
 *   mètres (cercles invisibles) ; attribut `filter` déclaré jamais lu.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';
import { clearDataCache, subscribeToSourceCommands } from '@/utils/data-bridge.js';

function fakeBounds(swLat: number, swLng: number, neLat: number, neLng: number) {
  return {
    getSouthWest: () => ({ lat: swLat, lng: swLng }),
    getNorthEast: () => ({ lat: neLat, lng: neLng }),
    contains: ([lat, lng]: [number, number]) =>
      lat >= swLat && lat <= neLat && lng >= swLng && lng <= neLng,
  };
}

const POLYGON_IDF = {
  nom: 'IDF',
  geo_shape: {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [2.0, 48.5],
          [3.0, 48.5],
          [3.0, 49.0],
          [2.0, 49.0],
          [2.0, 48.5],
        ],
      ],
    },
  },
};

const POLYGON_CORSE = {
  nom: 'Corse',
  geo_shape: {
    type: 'Polygon',
    coordinates: [
      [
        [8.5, 41.5],
        [9.5, 41.5],
        [9.5, 43.0],
        [8.5, 43.0],
        [8.5, 41.5],
      ],
    ],
  },
};

describe('#297 — AC : geoshapes + bbox client — les polygones restent', () => {
  it('un Polygon intersectant le viewport est conservé, un Polygon hors champ est filtré', () => {
    const layer = new DsfrDataMapLayer();
    layer.geoField = 'geo_shape';

    // Viewport autour de Paris
    const bounds = fakeBounds(48.0, 1.5, 49.5, 3.5);

    expect((layer as any)._recordIntersectsBounds(POLYGON_IDF, bounds)).toBe(true);
    expect((layer as any)._recordIntersectsBounds(POLYGON_CORSE, bounds)).toBe(false);
  });

  it('un point reste filtré comme avant', () => {
    const layer = new DsfrDataMapLayer();
    layer.latField = 'lat';
    layer.lonField = 'lon';
    const bounds = fakeBounds(48.0, 1.5, 49.5, 3.5);

    expect((layer as any)._recordIntersectsBounds({ lat: 48.8, lon: 2.3 }, bounds)).toBe(true);
    expect((layer as any)._recordIntersectsBounds({ lat: 43.3, lon: 5.4 }, bounds)).toBe(false);
  });

  it('une géométrie inextractible est CONSERVÉE (ne pas faire disparaître l’inconnu)', () => {
    const layer = new DsfrDataMapLayer();
    layer.geoField = 'geo_shape';
    const bounds = fakeBounds(48.0, 1.5, 49.5, 3.5);

    expect((layer as any)._recordIntersectsBounds({ nom: 'sans-geo' }, bounds)).toBe(true);
  });

  it('_geometryBbox gère Feature, Polygon, MultiPolygon et rejette le reste', () => {
    const layer = new DsfrDataMapLayer();
    expect((layer as any)._geometryBbox(POLYGON_IDF.geo_shape)).toEqual({
      minLat: 48.5,
      minLon: 2.0,
      maxLat: 49.0,
      maxLon: 3.0,
    });
    expect(
      (layer as any)._geometryBbox({
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [1, 10],
              [2, 11],
            ],
          ],
          [
            [
              [5, 14],
              [6, 15],
            ],
          ],
        ],
      })
    ).toEqual({ minLat: 10, minLon: 1, maxLat: 15, maxLon: 6 });
    expect((layer as any)._geometryBbox('texte')).toBeNull();
    expect((layer as any)._geometryBbox(null)).toBeNull();
    expect((layer as any)._geometryBbox({ type: 'Polygon' })).toBeNull();
  });
});

describe('#297 — AC : retirer un layer libère le filtre bbox de la source', () => {
  it('disconnectedCallback envoie where vide sur la clé map-bbox', () => {
    clearDataCache('f4-src');
    const commands: Array<Record<string, unknown>> = [];
    const unsub = subscribeToSourceCommands('f4-src', (cmd) =>
      commands.push(cmd as Record<string, unknown>)
    );

    const layer = new DsfrDataMapLayer();
    layer.source = 'f4-src';
    layer.bbox = true;
    document.body.appendChild(layer);
    layer.remove();

    const release = commands.find((c) => c.whereKey === 'map-bbox');
    expect(release).toBeDefined();
    expect(release!.where).toBe('');

    unsub();
  });

  it('sans bbox actif, aucun ordre parasite au disconnect', () => {
    clearDataCache('f4-src2');
    const commands: unknown[] = [];
    const unsub = subscribeToSourceCommands('f4-src2', (cmd) => commands.push(cmd));

    const layer = new DsfrDataMapLayer();
    layer.source = 'f4-src2';
    document.body.appendChild(layer);
    layer.remove();

    expect(commands).toHaveLength(0);
    unsub();
  });
});

describe('#297 — annexes', () => {
  it('le compagnon popup est résolu UNE fois par rendu (pas par record)', async () => {
    const layer = new DsfrDataMapLayer();
    const spy = vi.spyOn(layer as any, '_findPopupCompanion').mockReturnValue(null);

    (layer as any)._L = {
      layerGroup: () => ({
        clearLayers: () => {},
        addLayer: () => {},
        addTo: () => {},
        getBounds: () => ({ isValid: () => false }),
      }),
      // divIcon manquait : _addMarker rejetait en async hors du test
      // (Unhandled Rejection attrapee par la CI, race en local)
      divIcon: () => ({}),
      marker: () => ({ bindPopup: () => {}, bindTooltip: () => {}, on: () => {} }),
    };
    (layer as any)._leafletMap = { getZoom: () => 10, hasLayer: () => false, on: () => {} };
    (layer as any)._layerGroup = (layer as any)._L.layerGroup();
    (layer as any)._mapParent = null;
    (layer as any)._visible = true;
    layer.type = 'marker';
    layer.latField = 'lat';
    layer.lonField = 'lon';
    (layer as any)._data = Array.from({ length: 25 }, (_, i) => ({ lat: 48 + i / 100, lon: 2 }));

    await (layer as any)._renderLayer();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('radius-unit="m" + radius-field : la valeur brute (mètres) est utilisée, pas l’échelle px', () => {
    const layer = new DsfrDataMapLayer();
    layer.type = 'circle';
    layer.radiusUnit = 'm';
    layer.radiusField = 'rayon';
    layer.latField = 'lat';
    layer.lonField = 'lon';
    // Échelle px active (radius-min/max) — elle NE doit PAS s'appliquer en mètres
    (layer as any)._radiusScale = () => 12;

    const circles: Array<{ radius: number }> = [];
    const Leaf = {
      circle: (_c: unknown, opts: { radius: number }) => {
        circles.push(opts);
        return { bindPopup: () => {}, bindTooltip: () => {}, on: () => {} };
      },
      circleMarker: () => ({ bindPopup: () => {}, bindTooltip: () => {}, on: () => {} }),
    };
    const group = { addLayer: () => {} };

    (layer as any)._addCircle({ lat: 48.8, lon: 2.3, rayon: 5000 }, Leaf, group);

    expect(circles[0].radius).toBe(5000);
  });

  it("l'attribut filter est supprimé (no-op) avec warn de migration", () => {
    const layer = new DsfrDataMapLayer();
    expect('filter' in layer).toBe(false);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    layer.setAttribute('filter', 'x:eq:1');
    document.body.appendChild(layer);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('filter'));
    layer.remove();
    warnSpy.mockRestore();
  });
});
