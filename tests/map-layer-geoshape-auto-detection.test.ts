import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #1053 — une couche `geoshape` sans `geo-field` détecte seule sa colonne
 * géométrique.
 *
 * La documentation (skills : fond administratif, choroplèthe en grille) pose
 * `<dsfr-data-map-layer type="geoshape">` sans `geo-field` et affirme que la
 * géométrie est « détectée automatiquement ». Le calcul d'emprise devinait
 * bien sa colonne, mais `_addGeoshape` ne lisait que `geo-field` : aucune
 * forme ne s'affichait, et le seul mot en console parlait d'une colonne
 * « (geo-field non renseigné) ».
 */

globalThis.fetch = vi.fn();

import * as L from 'leaflet';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';

/** Vue interne de la couche : ce que les tests injectent ou lisent. */
interface LayerInternals {
  _leafletMap: unknown;
  _L: unknown;
  _layerGroup: unknown;
  _data: Record<string, unknown>[];
  _renderLayer: () => Promise<void>;
}

function readyLayer(): { layer: DsfrDataMapLayer; internals: LayerInternals } {
  const layer = new DsfrDataMapLayer();
  layer.id = 'zones';
  layer.type = 'geoshape';
  const internals = layer as unknown as LayerInternals;
  internals._leafletMap = {
    hasLayer: vi.fn(() => true),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    getZoom: vi.fn(() => 6),
  };
  internals._L = L;
  internals._layerGroup = L.featureGroup();
  return { layer, internals };
}

const carre = (x: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, 45],
      [x + 1, 45],
      [x + 1, 46],
      [x, 46],
      [x, 45],
    ],
  ],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('#1053 — geoshape sans geo-field', () => {
  it('Features de `transform="features"` : la colonne `geometry` est lue', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { layer, internals } = readyLayer();
    internals._data = [1, 2, 3].map((x) => ({
      type: 'Feature',
      geometry: carre(x),
      properties: { nom: `Z${x}` },
    }));

    await internals._renderLayer();

    expect(layer.getRenderedCount()).toBe(3);
    expect(layer.getSkippedCount()).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('jeu Opendatasoft (geo_point_2d ET geo_shape) : la forme, pas le point', async () => {
    // Le calcul d'emprise devine `geo_point_2d` en premier : le reprendre tel
    // quel pour les formes ne dessinerait rien (un point {lat, lon} n'a pas de `type`).
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { layer, internals } = readyLayer();
    internals._data = [1, 2].map((x) => ({
      nom: `D${x}`,
      geo_point_2d: { lat: 45.5, lon: x + 0.5 },
      geo_shape: carre(x),
    }));

    await internals._renderLayer();

    expect(layer.getRenderedCount()).toBe(2);
  });

  it('GeoJSON sérialisé en chaîne (Tabular, CSV) : détecté comme l’objet', async () => {
    const { layer, internals } = readyLayer();
    internals._data = [{ geom: JSON.stringify(carre(1)) }, { geom: JSON.stringify(carre(2)) }];

    await internals._renderLayer();

    expect(layer.getRenderedCount()).toBe(2);
  });

  it('première ligne sans géométrie : la colonne est quand même trouvée, la ligne comptée', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { layer, internals } = readyLayer();
    internals._data = [{ geo_shape: null }, { geo_shape: carre(1) }, { geo_shape: carre(2) }];

    await internals._renderLayer();

    expect(layer.getRenderedCount()).toBe(2);
    expect(layer.getSkippedCount()).toBe(1);
    // La colonne détectée est nommée dans l'avertissement des lignes ignorées.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('la colonne "geo_shape" (détectée automatiquement');
    expect(warn.mock.calls[0][0]).toContain('1 enregistrement(s) sur 3');
  });

  it('aucune colonne détectable : rien dessiné, et un message explicite', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { layer, internals } = readyLayer();
    internals._data = [
      { nom: 'A', contour: carre(1) },
      { nom: 'B', contour: carre(2) },
    ];

    await internals._renderLayer();

    expect(layer.getRenderedCount()).toBe(0);
    expect(layer.getSkippedCount()).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('dsfr-data-map-layer[zones]');
    expect(message).toContain('aucune colonne géométrique détectée (geo_shape, geometry, geom)');
    expect(message).toContain('geo-field');
  });

  it('geo-field posé : il prime sur la détection', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { layer, internals } = readyLayer();
    layer.geoField = 'contour';
    internals._data = [{ contour: carre(1), geo_shape: null }];

    await internals._renderLayer();

    expect(layer.getRenderedCount()).toBe(1);
    expect(layer.getSkippedCount()).toBe(0);
  });
});
