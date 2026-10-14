/**
 * #1288, proposition B — le dernier relevé, daté et marqué, quand l'intégrateur
 * le demande (`stale-if-error="<secondes>"` sur la source).
 *
 * Lot 7 — la carte : les formes restent tracées, toute la carte est atténuée et
 * une ligne d'état la date. Leaflet est simulé ici ; les formes réelles, le
 * filtre et les bulles sont dans `e2e/dernier-releve.spec.ts`. La règle
 * elle-même est dans `dernier-releve.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMap } from '@/components/dsfr-data-map.js';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';
import { DsfrDataMapPopup } from '@/components/dsfr-data-map-popup.js';
import { dispatchDataLoading } from '@/utils/data-bridge.js';
import { READING_ZONES } from '@/utils/stale-reading.js';
import {
  MINUTE,
  RELEVE,
  charge,
  horlogeDuReleve,
  panne,
  source,
  texte,
} from './helpers/dernier-releve.js';

horlogeDuReleve(mockFetch);

interface LayerInternals {
  _L: unknown;
  _leafletMap: unknown;
  _layerGroup: unknown;
  _mapParent: unknown;
  _visible: boolean;
  _data: unknown[];
}

interface MapInternals {
  _container: HTMLDivElement | null;
  _srDescription: HTMLParagraphElement | null;
}

function leafletFactice() {
  const added: unknown[] = [];
  const marker = {
    bindPopup: () => marker,
    bindTooltip: () => marker,
    on: () => marker,
    getElement: () => null,
  };
  return {
    added,
    L: {
      marker: () => ({ ...marker }),
      circleMarker: () => ({ ...marker }),
      divIcon: () => ({}),
      point: (x: number, y: number) => ({ x, y }),
    },
    map: { getZoom: () => 10, hasLayer: () => false, on: () => {} },
    layerGroup: {
      clearLayers: () => {
        added.length = 0;
      },
      addLayer: (l: unknown) => {
        added.push(l);
      },
      addTo: () => {},
      removeFrom: () => {},
      getBounds: () => ({ isValid: () => false }),
    },
  };
}

const POINTS = [
  { lat: 48.8, lon: 2.3 },
  { lat: 45.7, lon: 4.8 },
  { lat: 43.3, lon: 5.4 },
];

function mountLayer(src: string, parent: HTMLElement, attrs: Record<string, string> = {}) {
  const mock = leafletFactice();
  const layer = new DsfrDataMapLayer();
  layer.source = src;
  layer.type = 'marker';
  layer.latField = 'lat';
  layer.lonField = 'lon';
  for (const [k, v] of Object.entries(attrs)) layer.setAttribute(k, v);
  parent.appendChild(layer);
  const internals = layer as unknown as LayerInternals;
  internals._L = mock.L;
  internals._leafletMap = mock.map;
  internals._layerGroup = mock.layerGroup;
  internals._mapParent = null;
  internals._visible = true;
  return { layer, mock };
}

function mountMap(): { map: DsfrDataMap; internals: MapInternals } {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  const map = new DsfrDataMap();
  const internals = map as unknown as MapInternals;
  internals._container = document.createElement('div');
  internals._container.tabIndex = 0;
  internals._srDescription = document.createElement('p');
  map.appendChild(internals._container);
  document.body.appendChild(map);
  return { map, internals };
}

describe('#1288 B — carte : le relevé reste tracé, atténué, daté', () => {
  const ligne = (map: Element) => map.querySelector('.dsfr-data-map__layer-status');

  it('sans la consigne : la couche est vidée (proposition A)', async () => {
    const src = source('carte-sans');
    const { layer, mock } = mountLayer(src, document.body);
    charge(src, POINTS);
    await layer.updateComplete;
    panne(src, { consigne: null });
    await layer.updateComplete;
    expect(mock.added).toHaveLength(0);
    expect(layer.getSourceStale()).toBeNull();
    expect(layer.getSourceFailure()?.sourceId).toBe(src);
  });

  it('avec la consigne : les formes restent, sans retracé ; la couche ne se dit plus en panne', async () => {
    const src = source('carte');
    const { layer, mock } = mountLayer(src, document.body);
    charge(src, POINTS);
    await layer.updateComplete;
    const traces = [...mock.added];
    panne(src);
    await layer.updateComplete;

    expect(mock.added).toEqual(traces);
    expect(layer.getRenderedCount()).toBe(3);
    expect(layer.getSourceFailure()).toBeNull();
    expect(layer.getSourceStale()?.reading.loadedAt).toBe(RELEVE);
  });

  it('une seule couche : « Points relevés aujourd’hui à 14 h 32. », carte atténuée, pas de bloc central', async () => {
    const src = source('carte-une');
    const { map, internals } = mountMap();
    const { layer } = mountLayer(src, map);
    await map.updateComplete;
    charge(src, POINTS);
    await layer.updateComplete;
    panne(src);
    await layer.updateComplete;

    expect(map.classList.contains('dsfr-data-map--stale')).toBe(true);
    expect(map.querySelector('.dsfr-data-map__error-host')).toBeNull();
    expect(texte(ligne(map)!.querySelector('.dsfr-data-status__stale-badge'))).toBe(
      'Non actualisé'
    );
    expect(texte(ligne(map)!.querySelector('.dsfr-data-map__layer-status-text'))).toBe(
      'Points relevés aujourd’hui à 14 h 32.'
    );
    expect(ligne(map)!.getAttribute('role')).toBe('status');
    expect(texte(ligne(map)!.querySelector('.dsfr-data-status__retry'))).toBe('Réessayer');
    // La description lue porte la date avec le compte de marqueurs
    expect(internals._srDescription!.textContent).toContain(
      'Points relevés aujourd’hui à 14 h 32, non actualisés.'
    );
  });

  it('deux couches : toute la carte est atténuée, la ligne NOMME la couche périmée', async () => {
    const bornes = source('carte-bornes');
    const stations = source('carte-stations');
    const { map, internals } = mountMap();
    const a = mountLayer(bornes, map, { label: 'Bornes de recharge' });
    const b = mountLayer(stations, map, { label: 'Stations' });
    await map.updateComplete;
    charge(bornes, POINTS);
    charge(stations, POINTS.slice(0, 2));
    await a.layer.updateComplete;
    await b.layer.updateComplete;
    panne(bornes);
    await a.layer.updateComplete;

    expect(map.classList.contains('dsfr-data-map--stale')).toBe(true);
    expect(texte(ligne(map)!.querySelector('.dsfr-data-map__layer-status-text'))).toBe(
      'Couche « Bornes de recharge » : points relevés aujourd’hui à 14 h 32.'
    );
    expect(internals._srDescription!.textContent).toContain(
      'Couche « Bornes de recharge » : points relevés aujourd’hui à 14 h 32, non actualisés.'
    );
    expect(b.layer.getSourceStale()).toBeNull();
  });

  it('passé la durée : la couche est vidée, le message de panne revient ; au retour, plus de marque', async () => {
    const src = source('carte-echeance');
    const { map } = mountMap();
    const { layer, mock } = mountLayer(src, map);
    await map.updateComplete;
    charge(src, POINTS);
    await layer.updateComplete;
    panne(src, { consigne: 900 });
    await layer.updateComplete;
    expect(mock.added).toHaveLength(3);

    vi.advanceTimersByTime(16 * MINUTE);
    await layer.updateComplete;
    expect(mock.added).toHaveLength(0);
    expect(map.classList.contains('dsfr-data-map--stale')).toBe(false);
    expect(ligne(map)).toBeNull();
    expect(map.querySelector('.dsfr-data-map__error-host')).not.toBeNull();

    charge(src, POINTS);
    await layer.updateComplete;
    expect(mock.added).toHaveLength(3);
    expect(map.querySelector('.dsfr-data-map__error-host')).toBeNull();
    expect(map.classList.contains('dsfr-data-map--stale')).toBe(false);
  });

  it('emprise déplacée puis échec (autre requête) : la couche est vidée', async () => {
    const src = source('carte-emprise');
    const { map } = mountMap();
    const { layer, mock } = mountLayer(src, map);
    await map.updateComplete;
    charge(src, POINTS, 'bbox=A');
    await layer.updateComplete;
    panne(src, { key: 'bbox=B' });
    await layer.updateComplete;
    expect(mock.added).toHaveLength(0);
    expect(map.classList.contains('dsfr-data-map--stale')).toBe(false);
    expect(map.querySelector('.dsfr-data-map__error-host')).not.toBeNull();
  });

  it('pendant un nouvel essai : les formes restent, le bouton attend', async () => {
    const src = source('carte-essai');
    const { map } = mountMap();
    const { layer, mock } = mountLayer(src, map);
    await map.updateComplete;
    charge(src, POINTS);
    await layer.updateComplete;
    panne(src);
    await layer.updateComplete;
    dispatchDataLoading(src);
    await layer.updateComplete;
    expect(mock.added).toHaveLength(3);
    const bouton = ligne(map)!.querySelector('.dsfr-data-status__retry') as HTMLButtonElement;
    expect(texte(bouton)).toBe('Nouvel essai en cours…');
    expect(bouton.getAttribute('aria-disabled')).toBe('true');
  });

  it('carte verrouillée : la ligne datée reste due, sans bouton', async () => {
    const src = source('carte-verrou');
    const { map } = mountMap();
    map.locked = true;
    const { layer } = mountLayer(src, map);
    await map.updateComplete;
    charge(src, POINTS);
    await layer.updateComplete;
    panne(src);
    await layer.updateComplete;
    expect(texte(ligne(map)!.querySelector('.dsfr-data-map__layer-status-text'))).toBe(
      'Points relevés aujourd’hui à 14 h 32.'
    );
    expect(ligne(map)!.querySelector('button')).toBeNull();
  });

  it('zones : l’accord suit (« Zones relevées »)', async () => {
    const src = source('carte-zones');
    const { layer } = mountLayer(src, document.body);
    layer.type = 'geoshape';
    charge(src, POINTS);
    panne(src);
    await layer.updateComplete;
    expect(layer.getSourceStale()?.subject).toBe(READING_ZONES);
  });
});

describe('#1288 B — bulles : la même note que la carte', () => {
  /** Vue interne de la couche : la note posée à l'ouverture d'une bulle. */
  interface PopupInternals {
    _markPopupStale(popup: { getElement(): HTMLElement | null }): string;
  }

  /** Une bulle Leaflet réduite à ce que la couche en lit. */
  function bulle(): { popup: { getElement(): HTMLElement }; contenu: HTMLElement } {
    const racine = document.createElement('div');
    racine.innerHTML = '<div class="leaflet-popup-content"><p class="donnee">Paris</p></div>';
    document.body.appendChild(racine);
    return {
      popup: { getElement: () => racine },
      contenu: racine.querySelector('.leaflet-popup-content') as HTMLElement,
    };
  }

  it('une bulle ouverte sur un point relevé porte l’étiquette et l’heure, en tête', async () => {
    const src = source('bulle');
    const { layer } = mountLayer(src, document.body);
    charge(src, POINTS);
    await layer.updateComplete;
    const { popup, contenu } = bulle();
    const interne = layer as unknown as PopupInternals;

    // Source à jour : aucune note
    expect(interne._markPopupStale(popup)).toBe('');
    expect(contenu.querySelector('.dsfr-data-map__popup-stale')).toBeNull();

    panne(src);
    await layer.updateComplete;
    expect(interne._markPopupStale(popup)).toBe('Non actualisé, relevé aujourd’hui à 14 h 32. ');
    const note = contenu.firstElementChild as HTMLElement;
    expect(note.className).toBe('dsfr-data-map__popup-stale');
    expect(texte(note)).toBe('Non actualisé Relevé aujourd’hui à 14 h 32.');
    expect(note.querySelector('time')!.getAttribute('datetime')).toBe(
      new Date(RELEVE).toISOString()
    );
    // Rouverte, la bulle n'empile pas les notes ; au retour, elle la perd
    interne._markPopupStale(popup);
    expect(contenu.querySelectorAll('.dsfr-data-map__popup-stale')).toHaveLength(1);
    charge(src, POINTS);
    await layer.updateComplete;
    expect(interne._markPopupStale(popup)).toBe('');
    expect(contenu.querySelector('.dsfr-data-map__popup-stale')).toBeNull();
    expect(contenu.querySelector('.donnee')).not.toBeNull();
  });

  it.each([
    ['panel-right', 'volet'],
    ['modal', 'modale'],
  ] as const)(
    '%s : le %s s’ouvre sur la note quand la couche donne la date du relevé',
    (mode, _nom) => {
      const carte = document.createElement('dsfr-data-map');
      document.body.appendChild(carte);
      const popup = new DsfrDataMapPopup();
      popup.mode = mode;
      carte.appendChild(popup);
      const rendu = (): HTMLElement => {
        const interne = popup as unknown as {
          _panelEl: HTMLElement | null;
          _modalEl: HTMLElement | null;
        };
        return (interne._panelEl ?? interne._modalEl) as HTMLElement;
      };

      popup.showForRecord({ nom: 'Paris' }, RELEVE);
      expect(texte(rendu().querySelector('.dsfr-data-map__popup-stale'))).toBe(
        'Non actualisé Relevé aujourd’hui à 14 h 32.'
      );
      expect(rendu().textContent).toContain('Paris');

      // Sans date (couche à jour), ou avec autre chose qu'un instant : aucune note
      popup.showForRecord({ nom: 'Paris' });
      expect(rendu().querySelector('.dsfr-data-map__popup-stale')).toBeNull();
      popup.showForRecord({ nom: 'Paris' }, Number.NaN);
      expect(rendu().querySelector('.dsfr-data-map__popup-stale')).toBeNull();
      document.querySelectorAll('.dsfr-data-map-popup__modal-overlay').forEach((el) => el.remove());
    }
  );
});
