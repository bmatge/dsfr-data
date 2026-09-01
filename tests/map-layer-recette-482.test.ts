import { describe, it, expect, vi } from 'vitest';

/**
 * Tests #482 — fixes recette carto côté dsfr-data-map-layer.
 *
 * - bug 3 : une géométrie invalide jetait « Invalid GeoJSON object » non
 *   intercepté (rendu de couche interrompu en silence) → try/catch, ligne
 *   ignorée + comptage.
 * - bug 4 : leaflet.heat recevait maxZoom = max-zoom d'affichage (18) —
 *   l'intensité y est divisée par 2^(maxZoom - zoom) : couche invisible
 *   (alpha ≈ 5 % à zoom 6) → max normalisé + maxZoom = zoom courant.
 * - bug 6 : clustering désactivé (changement de représentation) mais
 *   l'ancien MarkerClusterGroup restait sur la carte et capturait les
 *   rendus suivants (bulles résiduelles par-dessus les cercles).
 * - bug 7 : getRenderedCount() expose le compte réel d'éléments dessinés
 *   (le comptage DOM incluait les bulles de cluster et voyait « 1 » pour
 *   une heatmap de 13 points).
 */

import * as L from 'leaflet';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';

/** Fausse carte Leaflet minimale pour _renderLayer en jsdom. */
function fakeMap() {
  return {
    hasLayer: vi.fn(() => true),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    getZoom: vi.fn(() => 6),
  };
}

/** Couche prête à rendre : carte + module + groupe injectés. */
function readyLayer() {
  const layer = new DsfrDataMapLayer();
  const map = fakeMap();
  (layer as any)._leafletMap = map;
  (layer as any)._L = L;
  (layer as any)._layerGroup = L.featureGroup();
  return { layer, map };
}

describe('#482 bug 3 — géométrie invalide ignorée sans casser le rendu', () => {
  it('un objet avec type non-GeoJSON ne jette plus, la ligne est comptée', () => {
    const { layer } = readyLayer();
    layer.geoField = 'geo';
    const group = L.featureGroup();

    // { type: … } passe la garde `'type' in geoData` mais L.geoJSON le rejette
    expect(() =>
      (layer as any)._addGeoshape({ geo: { type: 'PasDuGeoJson' } }, L, group, [], [])
    ).not.toThrow();
    expect((layer as any)._skippedGeoCount).toBe(1);
    expect(group.getLayers().length).toBe(0);
  });

  it('les valeurs absentes ou non-objet sont comptées comme ignorées', () => {
    const { layer } = readyLayer();
    layer.geoField = 'geo';
    const group = L.featureGroup();

    (layer as any)._addGeoshape({ geo: null }, L, group, [], []);
    (layer as any)._addGeoshape({ geo: 42 }, L, group, [], []);
    expect((layer as any)._skippedGeoCount).toBe(2);
  });

  it('une géométrie valide est toujours rendue', () => {
    const { layer } = readyLayer();
    layer.geoField = 'geo';
    const group = L.featureGroup();

    (layer as any)._addGeoshape(
      { geo: { type: 'Point', coordinates: [2.35, 48.85] } },
      L,
      group,
      [],
      []
    );
    expect((layer as any)._skippedGeoCount).toBe(0);
    expect(group.getLayers().length).toBe(1);
  });

  it('un rendu geoshape avec lignes ignorées émet un résumé console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { layer } = readyLayer();
    layer.type = 'geoshape';
    layer.geoField = 'geo';
    (layer as any)._data = [
      { geo: { type: 'Point', coordinates: [2.35, 48.85] } },
      { geo: { type: 'Invalide' } },
    ];

    await (layer as any)._renderLayer();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('géométrie valide'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"geo"'));
    expect(layer.getRenderedCount()).toBe(1);
    warnSpy.mockRestore();
  });
});

describe('#482 bug 4 — heatmap : intensité normalisée et visible', () => {
  it('passe max = intensité maximale et maxZoom = zoom courant à leaflet.heat', () => {
    const { layer } = readyLayer();
    layer.type = 'heatmap';
    layer.latField = 'lat';
    layer.lonField = 'lon';
    layer.heatField = 'poids';

    // Signature declaree : sans elle, `factory.mock.calls[0][1]` ne compile
    // pas (tuple vide) — ce que vitest ne signalait pas, faute de typecheck.
    const factory = vi.fn((_points: unknown, _opts: Record<string, unknown>) => ({
      addTo: vi.fn(),
      remove: vi.fn(),
    }));
    (layer as any)._heatLoaded = true;
    (layer as any)._heatLayerFactory = factory;
    (layer as any)._visible = false; // évite addTo sur la fausse carte

    const count = (layer as any)._renderHeatmap(
      [
        { lat: 48.8, lon: 2.35, poids: 10 },
        { lat: 45.7, lon: 4.8, poids: 250 },
      ],
      L
    );

    expect(count).toBe(2);
    const opts = factory.mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(opts.max).toBe(250);
    expect(opts.maxZoom).toBe(6); // zoom courant, PAS le max-zoom d'affichage (18)
  });

  it('sans heat-field, max vaut 1 (chaque point compte 1)', () => {
    const { layer } = readyLayer();
    layer.type = 'heatmap';
    layer.latField = 'lat';
    layer.lonField = 'lon';

    // Signature declaree : sans elle, `factory.mock.calls[0][1]` ne compile
    // pas (tuple vide) — ce que vitest ne signalait pas, faute de typecheck.
    const factory = vi.fn((_points: unknown, _opts: Record<string, unknown>) => ({
      addTo: vi.fn(),
      remove: vi.fn(),
    }));
    (layer as any)._heatLoaded = true;
    (layer as any)._heatLayerFactory = factory;
    (layer as any)._visible = false;

    (layer as any)._renderHeatmap([{ lat: 48.8, lon: 2.35 }], L);

    const opts = factory.mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(opts.max).toBe(1);
  });
});

describe('#482 bug 6 — le groupe de clusters est retiré quand cluster est désactivé', () => {
  it('_renderLayer sans cluster détruit le _clusterGroup résiduel', async () => {
    const { layer, map } = readyLayer();
    layer.type = 'circle';
    layer.latField = 'lat';
    layer.lonField = 'lon';
    layer.cluster = false;

    const staleCluster = L.featureGroup();
    (layer as any)._clusterGroup = staleCluster;
    (layer as any)._data = [{ lat: 48.8, lon: 2.35 }];

    await (layer as any)._renderLayer();

    expect((layer as any)._clusterGroup).toBeNull();
    expect(map.removeLayer).toHaveBeenCalledWith(staleCluster);
    // Les cercles atterrissent dans le layerGroup, plus dans le cluster
    expect((layer as any)._layerGroup.getLayers().length).toBe(1);
    expect(staleCluster.getLayers().length).toBe(0);
  });
});

describe('#482 bug 7 — getRenderedCount', () => {
  it('compte les marqueurs effectivement dessinés (coordonnées invalides exclues)', async () => {
    const { layer } = readyLayer();
    layer.type = 'marker';
    layer.latField = 'lat';
    layer.lonField = 'lon';
    (layer as any)._data = [
      { lat: 48.8, lon: 2.35 },
      { lat: 45.7, lon: 4.8 },
      { lat: 'pas-un-nombre', lon: 4.8 },
    ];

    await (layer as any)._renderLayer();

    expect(layer.getRenderedCount()).toBe(2);
  });
});

describe('#482 bug 6 — updated() redessine sur changement de propriété visuelle', () => {
  it('un changement de type déclenche _renderLayer une fois la carte prête', () => {
    const { layer } = readyLayer();
    const renderSpy = vi.spyOn(layer as any, '_renderLayer').mockResolvedValue(undefined);

    layer.updated(new Map([['type', 'marker']]));
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it('une propriété non visuelle (source) ne redessine pas', () => {
    const { layer } = readyLayer();
    const renderSpy = vi.spyOn(layer as any, '_renderLayer').mockResolvedValue(undefined);

    layer.updated(new Map([['source', 'ancienne']]));
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it('carte non prête : aucun rendu (cycle de montage)', () => {
    const layer = new DsfrDataMapLayer();
    const renderSpy = vi.spyOn(layer as any, '_renderLayer').mockResolvedValue(undefined);

    layer.updated(new Map([['type', 'marker']]));
    expect(renderSpy).not.toHaveBeenCalled();
  });
});
