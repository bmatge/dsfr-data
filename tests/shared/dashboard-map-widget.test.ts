/**
 * Widget carte Leaflet multi-couches (#531) : normalisation du modele partage
 * et export deterministe en <dsfr-data-map> + <dsfr-data-map-layer>.
 */
import { describe, it, expect } from 'vitest';
import {
  createEmptyDashboard,
  normalizeWidget,
  getDefaultConfig,
  getDefaultTitle,
} from '../../packages/shared/src/dashboard/model';
import type { DashboardData, Widget } from '../../packages/shared/src/dashboard/model';
import {
  generateDashboardHTML,
  generateWidgetHTML,
} from '../../packages/shared/src/dashboard/export-html';

const mapWidget = (config: Record<string, unknown>): Widget =>
  ({
    id: 'm1',
    type: 'map',
    title: 'Carte des établissements',
    position: { row: 0, col: 0 },
    config,
  }) as unknown as Widget;

function dashboardWith(widgets: Widget[], sources: DashboardData['sources'] = []): DashboardData {
  return { ...createEmptyDashboard(), name: 'Test', widgets, sources };
}

const SRC_A = { id: 'src-a', name: 'Points', data: [{ lat: 48.85, lon: 2.35, effectif: 120 }] };
const SRC_B = { id: 'src-b', name: 'Contours', data: [{ geo: '{}', valeur: 3 }] };

describe('modele — widget map (#531)', () => {
  it('normalise un widget map (couches valides gardees, invalides ecartees)', () => {
    const w = normalizeWidget({
      id: 'm1',
      type: 'map',
      title: 'Carte',
      position: { row: 0, col: 0 },
      config: {
        layers: [
          {
            sourceId: 'src-a',
            type: 'circle',
            latField: 'lat',
            lonField: 'lon',
            valueField: 'effectif',
          },
          { type: 'marker' }, // invalide : pas de sourceId
          { sourceId: 'src-b', type: 'geoshape', geoField: 'geo' },
          { sourceId: 'src-a', type: 'inconnu', latField: 'lat', lonField: 'lon' }, // type ramene a marker
        ],
        insets: 'drom',
        fitBounds: true,
      },
    });
    if (w?.type !== 'map') throw new Error('type attendu: map');
    expect(w.config.layers).toHaveLength(3);
    expect(w.config.layers[0].type).toBe('circle');
    expect(w.config.layers[1].type).toBe('geoshape');
    expect(w.config.layers[2].type).toBe('marker');
    expect(w.config.insets).toBe('drom');
  });

  it('defauts : titre Carte, config sans couche', () => {
    expect(getDefaultTitle('map')).toBe('Carte');
    expect(getDefaultConfig('map')).toEqual({ layers: [] });
  });
});

describe('export — widget map (#531)', () => {
  const twoLayers = mapWidget({
    layers: [
      {
        sourceId: 'src-a',
        type: 'circle',
        label: 'Effectifs',
        latField: 'lat',
        lonField: 'lon',
        valueField: 'effectif',
        popupFields: 'nom,effectif',
        tooltipField: 'nom',
      },
      { sourceId: 'src-b', type: 'geoshape', geoField: 'geo', valueField: 'valeur' },
    ],
    fitBounds: true,
    insets: 'drom',
  });

  it('emet dsfr-data-map + une balise par couche, au bon vocabulaire', () => {
    const html = generateWidgetHTML(twoLayers, dashboardWith([twoLayers], [SRC_A, SRC_B]));
    expect(html).toContain('<h3 class="fr-h6">Carte des établissements</h3>');
    expect(html).toContain('<dsfr-data-map id="map-m1" height="500px" fit-bounds insets="drom">');
    expect(html).toContain(
      '<dsfr-data-map-layer source="src-a" type="circle" lat-field="lat" lon-field="lon" radius-field="effectif" popup-fields="nom,effectif" tooltip-field="nom">'
    );
    expect(html).toContain(
      '<dsfr-data-map-layer source="src-b" type="geoshape" geo-field="geo" fill-field="valeur">'
    );
  });

  it('heatmap : valueField devient heat-field', () => {
    const heat = mapWidget({
      layers: [
        {
          sourceId: 'src-a',
          type: 'heatmap',
          latField: 'lat',
          lonField: 'lon',
          valueField: 'effectif',
        },
      ],
    });
    const html = generateWidgetHTML(heat, dashboardWith([heat], [SRC_A]));
    expect(html).toContain('heat-field="effectif"');
    expect(html).not.toContain('radius-field');
  });

  it('les sources des couches sont emises (multi-sources) et le bundle complet est choisi', () => {
    const html = generateDashboardHTML(dashboardWith([twoLayers], [SRC_A, SRC_B]));
    expect(html).toContain('<dsfr-data-source id="src-a"');
    expect(html).toContain('<dsfr-data-source id="src-b"');
    expect(html).toContain('/dsfr-data.esm.js');
    expect(html).not.toContain('dsfr-data.core.esm.js');
  });

  it('sans couche, emet un commentaire plutot qu’une carte vide', () => {
    const empty = mapWidget({ layers: [] });
    const html = generateWidgetHTML(empty, dashboardWith([empty], []));
    expect(html).toContain('aucune couche configuree');
    expect(html).not.toContain('<dsfr-data-map ');
  });
});
