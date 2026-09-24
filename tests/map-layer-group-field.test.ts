import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Tests #1108 — `group-field` sur dsfr-data-map-layer.
 *
 * Données au format LONG (une ligne par couple ville × aide, coordonnées
 * répétées) : un seul élément tracé par valeur distincte du champ, et au
 * clic la popup / le volet / la modale listent TOUTES les lignes du groupe.
 * Sans `group-field`, rien ne change (non-régression).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import * as L from 'leaflet';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';
import { DsfrDataMapPopup } from '@/components/dsfr-data-map-popup.js';
import { GROUP_ROWS_MAX } from '@/utils/map-group.js';

type Row = Record<string, unknown>;

/** Vue interne de la couche : ce que les tests injectent ou lisent. */
interface LayerInternals {
  _leafletMap: unknown;
  _L: unknown;
  _layerGroup: L.FeatureGroup;
  _data: Row[];
  _renderLayer: () => Promise<void>;
  _visible: boolean;
  _heatLoaded: boolean;
  _heatLayerFactory: unknown;
  _totalCount: number;
}

function fakeMap() {
  return {
    hasLayer: vi.fn(() => true),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    getZoom: vi.fn(() => 6),
  };
}

/** Jeu « Aides nationales » réduit : 8 lignes, 3 villes. */
const AIDES: Row[] = [
  { Ville: 'Lille', Action: 'Action cœur de ville', Domaine: 'Urbanisme', lat: 50.63, lon: 3.06 },
  { Ville: 'Amiens', Action: 'Petites villes', Domaine: 'Territoires', lat: 49.89, lon: 2.3 },
  { Ville: 'Lille', Action: 'France services', Domaine: 'Services', lat: 50.63, lon: 3.06 },
  { Ville: 'Rouen', Action: 'Territoires d’industrie', Domaine: 'Industrie', lat: 49.44, lon: 1.1 },
  { Ville: 'Lille', Action: 'Quartiers', Domaine: 'Politique de la ville', lat: 50.63, lon: 3.06 },
  { Ville: 'Amiens', Action: 'France services', Domaine: 'Services', lat: 49.89, lon: 2.3 },
  { Ville: 'Lille', Action: 'Fonds vert', Domaine: 'Transition', lat: 50.63, lon: 3.06 },
  { Ville: 'Rouen', Action: 'Fonds vert', Domaine: 'Transition', lat: 49.44, lon: 1.1 },
];

interface Setup {
  layer: DsfrDataMapLayer;
  internals: LayerInternals;
  mapEl: HTMLElement;
  container: HTMLDivElement;
}

/** Couche prête à rendre, dans une carte (hors document) avec son conteneur Leaflet. */
function readyLayer(type: DsfrDataMapLayer['type'], rows: Row[] = AIDES): Setup {
  const mapEl = document.createElement('dsfr-data-map');
  const container = document.createElement('div');
  container.className = 'dsfr-data-map__container';
  mapEl.appendChild(container);
  const layer = new DsfrDataMapLayer();
  layer.type = type;
  layer.latField = 'lat';
  layer.lonField = 'lon';
  mapEl.appendChild(layer);
  const internals = layer as unknown as LayerInternals;
  internals._leafletMap = fakeMap();
  internals._L = L;
  internals._layerGroup = L.featureGroup();
  internals._data = rows;
  return { layer, internals, mapEl, container };
}

/** Compagnon posé DANS la couche (résolu en priorité par la couche). */
function withCompanion(layer: DsfrDataMapLayer, mode: DsfrDataMapPopup['mode'], template?: string) {
  const popup = new DsfrDataMapPopup();
  popup.mode = mode;
  if (template) {
    const tpl = document.createElement('template');
    tpl.innerHTML = template;
    popup.appendChild(tpl);
  }
  layer.appendChild(popup);
  return popup;
}

/** Éléments tracés, dans l'ordre d'ajout. */
function drawn(internals: LayerInternals): L.Layer[] {
  return internals._layerGroup.getLayers();
}

/** L'élément tracé d'une ville (sa position vaut celle du jeu). */
function markerOf(internals: LayerInternals, lat: number): L.Marker {
  const found = drawn(internals).find((l) => (l as L.Marker).getLatLng().lat === lat);
  if (!found) throw new Error(`aucun élément à la latitude ${lat}`);
  return found as L.Marker;
}

/** Contenu HTML d'une bulle Leaflet liée. */
function popupHtml(layer: L.Layer): string {
  return String((layer as L.Marker).getPopup()?.getContent() ?? '');
}

function parse(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('#1108 — un élément par groupe', () => {
  it.each(['marker', 'circle'] as const)(
    'type=%s : 8 lignes, 3 villes → 3 éléments tracés, getRenderedCount() === 3',
    async (type) => {
      const { layer, internals } = readyLayer(type);
      layer.groupField = 'Ville';
      await internals._renderLayer();
      expect(drawn(internals)).toHaveLength(3);
      expect(layer.getRenderedCount()).toBe(3);
    }
  );

  it('geoshape : une forme par groupe (celle du premier enregistrement)', async () => {
    const carre = (x: number) => ({
      type: 'Polygon',
      coordinates: [
        [
          [x, 0],
          [x + 1, 0],
          [x + 1, 1],
          [x, 0],
        ],
      ],
    });
    const rows: Row[] = [
      { dep: '59', aide: 'a', geo: carre(0) },
      { dep: '59', aide: 'b', geo: carre(0) },
      { dep: '80', aide: 'c', geo: carre(2) },
    ];
    const { layer, internals } = readyLayer('geoshape', rows);
    layer.geoField = 'geo';
    layer.groupField = 'dep';
    await internals._renderLayer();
    expect(layer.getRenderedCount()).toBe(2);
  });

  it('max-items compte des GROUPES, et le total annoncé aussi', async () => {
    const { layer, internals } = readyLayer('marker');
    layer.groupField = 'Ville';
    layer.maxItems = 2;
    await internals._renderLayer();
    expect(layer.getRenderedCount()).toBe(2);
    expect(internals._totalCount).toBe(3);
  });

  it('une ligne sans valeur de regroupement reste un élément à part', async () => {
    const rows: Row[] = [...AIDES, { Ville: '', Action: 'Orpheline', lat: 43.6, lon: 1.44 }];
    const { layer, internals } = readyLayer('marker', rows);
    layer.groupField = 'Ville';
    await internals._renderLayer();
    expect(layer.getRenderedCount()).toBe(4);
  });

  it('heatmap : sans effet, avertissement nommant group-field, chaque ligne comptée', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { layer, internals } = readyLayer('heatmap');
    internals._heatLoaded = true;
    internals._heatLayerFactory = vi.fn(() => ({ addTo: vi.fn(), remove: vi.fn() }));
    internals._visible = false;
    layer.groupField = 'Ville';
    await internals._renderLayer();
    await internals._renderLayer();
    expect(layer.getRenderedCount()).toBe(8);
    const avertissements = warnSpy.mock.calls.filter((c) => String(c[0]).includes('group-field'));
    expect(avertissements).toHaveLength(1);
    expect(String(avertissements[0][0])).toContain('heatmap');
  });
});

describe('#1108 — le volet liste toutes les lignes du groupe', () => {
  it('panel-right + popup-fields : titre = la ville, une ligne de tableau par aide', async () => {
    const { layer, internals, container } = readyLayer('marker');
    layer.groupField = 'Ville';
    layer.popupFields = 'Action,Domaine';
    const popup = withCompanion(layer, 'panel-right');
    await internals._renderLayer();

    markerOf(internals, 50.63).fire('click');

    const panel = container.querySelector('.dsfr-data-map-popup__panel')!;
    expect(panel.querySelector('.dsfr-data-map-popup__panel-title')?.textContent).toBe('Lille');
    const heads = [...panel.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(heads).toEqual(['Action', 'Domaine']);
    const rows = [...panel.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(4);
    expect(rows.map((tr) => tr.querySelector('td')?.textContent)).toEqual([
      'Action cœur de ville',
      'France services',
      'Quartiers',
      'Fonds vert',
    ]);
    popup.close();
  });

  it('title-field du compagnon l’emporte sur la valeur du groupe', async () => {
    const { layer, internals, container } = readyLayer('marker');
    layer.groupField = 'Ville';
    layer.popupFields = 'Action';
    const popup = withCompanion(layer, 'panel-left');
    popup.titleField = 'Domaine';
    await internals._renderLayer();
    markerOf(internals, 49.89).fire('click');
    expect(container.querySelector('.dsfr-data-map-popup__panel-title')?.textContent).toBe(
      'Territoires'
    );
    popup.close();
  });

  it('sans popup-fields : colonnes scalaires du jeu, hors géo et hors champ de regroupement', async () => {
    const { layer, internals, container } = readyLayer('marker');
    layer.groupField = 'Ville';
    const popup = withCompanion(layer, 'panel-right');
    await internals._renderLayer();
    markerOf(internals, 49.44).fire('click');
    const heads = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(heads).toEqual(['Action', 'Domaine', 'lat', 'lon']);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    popup.close();
  });

  it('modale : même corps, titre = la ville', async () => {
    const { layer, internals } = readyLayer('circle');
    layer.groupField = 'Ville';
    layer.popupFields = 'Action';
    const popup = withCompanion(layer, 'modal');
    await internals._renderLayer();
    markerOf(internals, 50.63).fire('click');
    const modal = document.querySelector('.dsfr-data-map-popup__modal')!;
    expect(modal.querySelector('.dsfr-data-map-popup__modal-title')?.textContent).toBe('Lille');
    expect(modal.querySelectorAll('tbody tr')).toHaveLength(4);
    popup.close();
  });

  it('<template> du compagnon appliqué à CHAQUE ligne, en liste', async () => {
    const { layer, internals, container } = readyLayer('marker');
    layer.groupField = 'Ville';
    const popup = withCompanion(layer, 'panel-right', '<strong>{{Action}}</strong> ({{Domaine}})');
    await internals._renderLayer();
    markerOf(internals, 49.89).fire('click');
    const items = [...container.querySelectorAll('.dsfr-data-map__group-list li')];
    expect(items.map((li) => li.textContent)).toEqual([
      'Petites villes (Territoires)',
      'France services (Services)',
    ]);
    popup.close();
  });

  it('mode popup du compagnon : bulle Leaflet avec titre et tableau', async () => {
    const { layer, internals } = readyLayer('marker');
    layer.groupField = 'Ville';
    layer.popupFields = 'Action';
    withCompanion(layer, 'popup');
    await internals._renderLayer();
    const html = parse(popupHtml(markerOf(internals, 50.63)));
    expect(html.querySelector('.dsfr-data-map__group-title')?.textContent).toBe('Lille');
    expect(html.querySelectorAll('tbody tr')).toHaveLength(4);
  });

  it('sans compagnon, popup-template de la couche appliqué par ligne', async () => {
    const { layer, internals } = readyLayer('marker');
    layer.groupField = 'Ville';
    layer.popupTemplate = '{Action} — {Domaine}';
    await internals._renderLayer();
    const html = parse(popupHtml(markerOf(internals, 49.44)));
    expect(html.querySelector('.dsfr-data-map__group-title')?.textContent).toBe('Rouen');
    expect([...html.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Territoires d’industrie — Industrie',
      'Fonds vert — Transition',
    ]);
  });

  it('sans compagnon, popup-fields de la couche : tableau une ligne par enregistrement', async () => {
    const { layer, internals } = readyLayer('marker');
    layer.groupField = 'Ville';
    layer.popupFields = 'Action';
    await internals._renderLayer();
    const html = parse(popupHtml(markerOf(internals, 50.63)));
    expect(html.querySelectorAll('tbody tr')).toHaveLength(4);
  });

  it(`borne : au plus ${GROUP_ROWS_MAX} lignes, puis « … et N autres »`, async () => {
    const rows: Row[] = Array.from({ length: GROUP_ROWS_MAX + 50 }, (_, i) => ({
      Ville: 'Lille',
      Action: `aide ${i}`,
      lat: 50.63,
      lon: 3.06,
    }));
    const { layer, internals, container } = readyLayer('marker', rows);
    layer.groupField = 'Ville';
    layer.popupFields = 'Action';
    const popup = withCompanion(layer, 'panel-right');
    await internals._renderLayer();
    markerOf(internals, 50.63).fire('click');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(GROUP_ROWS_MAX);
    expect(container.querySelector('.dsfr-data-map__group-more')?.textContent).toBe(
      '… et 50 autres'
    );
    popup.close();
  });
});

describe('#1108 — échappement', () => {
  const CHARGE = '<img src=x onerror=alert(1)>';
  const rows: Row[] = [
    { Ville: '<b>Lille</b>', Action: CHARGE, [`<i>col</i>`]: 'x', lat: 50.63, lon: 3.06 },
    { Ville: '<b>Lille</b>', Action: '"><svg onload=alert(1)>', lat: 50.63, lon: 3.06 },
  ];

  it('volet (tableau auto) : aucune balise née d’une donnée, titre compris', async () => {
    const { layer, internals, container } = readyLayer('marker', rows);
    layer.groupField = 'Ville';
    const popup = withCompanion(layer, 'panel-right');
    await internals._renderLayer();
    markerOf(internals, 50.63).fire('click');
    const panel = container.querySelector('.dsfr-data-map-popup__panel')!;
    expect(panel.querySelector('img, svg, b, i')).toBeNull();
    expect(panel.textContent).toContain(CHARGE);
    expect(panel.querySelector('.dsfr-data-map-popup__panel-title')?.textContent).toBe(
      '<b>Lille</b>'
    );
    popup.close();
  });

  it('volet (gabarit par ligne) et bulle sans compagnon : échappés', async () => {
    const a = readyLayer('marker', rows);
    a.layer.groupField = 'Ville';
    const popup = withCompanion(a.layer, 'panel-right', '<span>{{Action}}</span>');
    await a.internals._renderLayer();
    markerOf(a.internals, 50.63).fire('click');
    expect(a.container.querySelector('.dsfr-data-map-popup__panel img, svg')).toBeNull();
    popup.close();

    const b = readyLayer('marker', rows);
    b.layer.groupField = 'Ville';
    b.layer.popupTemplate = '{Action}';
    await b.internals._renderLayer();
    const html = parse(popupHtml(markerOf(b.internals, 50.63)));
    expect(html.querySelector('img, svg, b')).toBeNull();
    expect(html.textContent).toContain(CHARGE);
  });
});

describe('#1108 — coordonnées divergentes au sein d’un groupe', () => {
  it('un avertissement, une seule fois ; position = premier enregistrement positionné', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rows: Row[] = [
      { Ville: 'Lille', Action: 'sans position' },
      { Ville: 'Lille', Action: 'a', lat: 50.63, lon: 3.06 },
      { Ville: 'Lille', Action: 'b', lat: 50.7, lon: 3.1 },
      { Ville: 'Rouen', Action: 'c', lat: 49.44, lon: 1.1 },
    ];
    const { layer, internals } = readyLayer('marker', rows);
    layer.groupField = 'Ville';
    await internals._renderLayer();
    await internals._renderLayer();

    expect(layer.getRenderedCount()).toBe(2);
    expect(layer.getSkippedCount()).toBe(0);
    expect(drawn(internals).map((l) => (l as L.Marker).getLatLng().lat)).toEqual([50.63, 49.44]);
    const avertissements = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes('coordonnées divergentes')
    );
    expect(avertissements).toHaveLength(1);
    // Valeurs externes passées en ARGUMENTS du format, jamais dans la chaîne
    expect(avertissements[0]).toContain('Ville');
    expect(avertissements[0]).toContain('Lille');
  });
});

describe('#1108 — sélection au clic', () => {
  it('dsfr-data-map-select porte la valeur du groupe et toutes ses lignes', async () => {
    const { layer, internals } = readyLayer('marker');
    layer.groupField = 'Ville';
    layer.refineOnClick = 'Ville';
    await internals._renderLayer();
    const details: Array<Record<string, unknown>> = [];
    layer.addEventListener('dsfr-data-map-select', (e) =>
      details.push((e as CustomEvent<Record<string, unknown>>).detail)
    );
    markerOf(internals, 49.89).fire('click');
    expect(details).toHaveLength(1);
    expect(details[0].group).toBe('Amiens');
    expect((details[0].records as Row[]).map((r) => r.Action)).toEqual([
      'Petites villes',
      'France services',
    ]);
    expect(layer.selectionValueOf(details[0].record as Row)).toBe('Amiens');
  });
});

describe('#1108 — sans group-field, rien ne change', () => {
  it('8 lignes → 8 marqueurs, bulle d’un seul enregistrement, format inchangé', async () => {
    const { layer, internals } = readyLayer('marker');
    layer.popupFields = 'Ville,Action';
    await internals._renderLayer();
    expect(layer.getRenderedCount()).toBe(8);
    expect(popupHtml(drawn(internals)[0])).toBe(
      '<div class="dsfr-data-map__popup"><table class="fr-table fr-table--sm">' +
        '<tr><th>Ville</th><td>Lille</td></tr><tr><th>Action</th><td>Action cœur de ville</td></tr>' +
        '</table></div>'
    );
  });

  it('volet : un enregistrement, titre par title-field seulement', async () => {
    const { layer, internals, container } = readyLayer('marker');
    const popup = withCompanion(layer, 'panel-right');
    await internals._renderLayer();
    (drawn(internals)[0] as L.Marker).fire('click');
    expect(container.querySelector('.dsfr-data-map-popup__panel-title')).toBeNull();
    expect(container.querySelectorAll('.dsfr-data-map-popup__panel-body tr')).toHaveLength(5);
    popup.close();
  });

  it('dsfr-data-map-select : détail historique, sans group ni records', async () => {
    const { layer, internals } = readyLayer('marker');
    await internals._renderLayer();
    const details: Array<Record<string, unknown>> = [];
    layer.addEventListener('dsfr-data-map-select', (e) =>
      details.push((e as CustomEvent<Record<string, unknown>>).detail)
    );
    (drawn(internals)[0] as L.Marker).fire('click');
    expect(Object.keys(details[0]).sort()).toEqual(['layerId', 'record', 'selected']);
  });
});
