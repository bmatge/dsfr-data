import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * BUG-034 (banc d'essai open-data-viz, #1229) — un encart de carte clonait la
 * couche entière. Deux défauts, deux séries de tests :
 *
 *  (a) le DOUBLON : la carte hôte cherchait ses couches par un
 *      `querySelectorAll` nu, qui descend dans les encarts ; elle redisait
 *      donc « la carte est prête » aux couches clonées d'encarts déjà prêts,
 *      et `_onMapReady` refaisait son groupe Leaflet sans retirer le
 *      précédent. Le groupe orphelin gardait ses entités : 8 cercles pour
 *      4 lignes, puis 6 pour 2 après un filtre.
 *  (b) le COÛT : la couche d'un encart traçait toutes les lignes reçues,
 *      quelle que soit son emprise.
 *
 * Ce que seul un navigateur prouve — l'ordre réel d'initialisation des
 * cartes, les formes tracées — est dans `e2e/map-insets.spec.ts`.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMap } from '@/components/dsfr-data-map.js';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';
import { DsfrDataMapInset } from '@/components/dsfr-data-map-inset.js';
import { DsfrDataMapTimeline } from '@/components/dsfr-data-map-timeline.js';
import { INSET_CLONE_OF } from '@/utils/map-inset-clone.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

// Quirk happy-dom/vitest (voir dsfr-data-map-inset.test.ts) : selon l'ordre du
// graphe de modules, un décorateur @customElement peut ne pas s'exécuter dans
// la fenêtre de test. Ces tests dépendent de vrais éléments montés.
for (const [tag, classe] of [
  ['dsfr-data-map', DsfrDataMap],
  ['dsfr-data-map-layer', DsfrDataMapLayer],
  ['dsfr-data-map-inset', DsfrDataMapInset],
  ['dsfr-data-map-timeline', DsfrDataMapTimeline],
] as const) {
  if (!customElements.get(tag)) customElements.define(tag, classe);
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

/** Vue interne de la couche : ce que `_onMapReady` et le rendu posent. */
interface LayerInternals {
  _L: unknown;
  _leafletMap: unknown;
  _layerGroup: unknown;
  _mapParent: unknown;
  _visible: boolean;
  _drawnFrame: unknown;
  _onMapReady(): void;
  _onViewportChange(): void;
  _updateMapDescription(): void;
}

/** Vue interne de la carte : les deux notifications adressées aux couches. */
interface MapInternals {
  _notifyExistingLayers(): void;
  _notifyLayers(): void;
  getLeafletMap(): unknown;
  getLeafletLib(): unknown;
  updateDescription(summaries: string[]): void;
}

/** Vue interne de la timeline : les couches qu'elle pilote. */
interface TimelineInternals {
  _getTargetLayers(): DsfrDataMapLayer[];
}

interface Cadre {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Groupe Leaflet factice : garde ce qu'on y pose, et la carte où il est. */
function fauxGroupe() {
  const formes: unknown[] = [];
  const retraits: unknown[] = [];
  return {
    formes,
    retraits,
    clearLayers: () => {
      formes.length = 0;
    },
    addLayer: (l: unknown) => {
      formes.push(l);
    },
    addTo: () => {},
    removeFrom: (carte: unknown) => {
      retraits.push(carte);
    },
    getBounds: () => ({ isValid: () => false }),
  };
}

/** Leaflet factice : compte les groupes créés et retient les cercles tracés. */
function fauxLeaflet() {
  const groupes: Array<ReturnType<typeof fauxGroupe>> = [];
  const cercles: Array<{ lat: number; lon: number; radius: number }> = [];
  const forme = {
    bindPopup: () => forme,
    bindTooltip: () => forme,
    on: () => forme,
    getElement: () => null,
  };
  const bornes = (c: Cadre) => ({
    getSouthWest: () => ({ lat: c.south, lng: c.west }),
    getNorthEast: () => ({ lat: c.north, lng: c.east }),
    contains: (
      autre: { getSouthWest(): { lat: number; lng: number } } & Record<string, unknown>
    ) => {
      const sw = autre.getSouthWest();
      const ne = (
        autre as unknown as { getNorthEast(): { lat: number; lng: number } }
      ).getNorthEast();
      return sw.lat >= c.south && sw.lng >= c.west && ne.lat <= c.north && ne.lng <= c.east;
    },
  });
  const L = {
    featureGroup: () => {
      const g = fauxGroupe();
      groupes.push(g);
      return g;
    },
    circleMarker: ([lat, lon]: [number, number], options: { radius: number }) => {
      cercles.push({ lat, lon, radius: options.radius });
      return { ...forme };
    },
    marker: () => ({ ...forme }),
    divIcon: () => ({}),
    point: (x: number, y: number) => ({ x, y }),
    latLngBounds: (sw: { lat: number; lng: number }, ne: { lat: number; lng: number }) =>
      bornes({ south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng }),
  };
  return { L, groupes, cercles, bornes };
}

/**
 * Carte Leaflet factice de 100 × 100 px dont le cadre couvre `cadre` : un
 * pixel vaut un centième du cadre, dans les deux sens.
 */
function fauxCarte(cadre: Cadre, bornes: ReturnType<typeof fauxLeaflet>['bornes']) {
  const etat = { cadre };
  return {
    etat,
    getZoom: () => 9,
    hasLayer: () => false,
    on: () => {},
    getSize: () => ({ x: 100, y: 100 }),
    getCenter: () => ({
      lat: (etat.cadre.south + etat.cadre.north) / 2,
      lng: (etat.cadre.west + etat.cadre.east) / 2,
    }),
    getBounds: () => bornes(etat.cadre),
    containerPointToLatLng: ([x, y]: [number, number]) => ({
      lat: etat.cadre.north - (y / 100) * (etat.cadre.north - etat.cadre.south),
      lng: etat.cadre.west + (x / 100) * (etat.cadre.east - etat.cadre.west),
    }),
  };
}

const SRC = 'encarts-src';

/** Deux points en métropole, deux à La Réunion ; `v` pour les rayons. */
const LIGNES = [
  { nom: 'Paris', lat: 48.85, lon: 2.35, v: 100 },
  { nom: 'Lyon', lat: 45.76, lon: 4.83, v: 4 },
  { nom: 'Saint-Denis', lat: -20.88, lon: 55.45, v: 25 },
  { nom: 'Saint-Pierre', lat: -21.34, lon: 55.48, v: 1 },
];

/** Le cadre d'un encart de La Réunion : un degré de côté autour de l'île. */
const REUNION: Cadre = { south: -21.6, west: 55.0, north: -20.6, east: 56.0 };

/** Carte hôte avec une couche de cercles et un encart, construits. */
async function monterCarte(attrsCouche: Record<string, string> = {}) {
  const hote = document.createElement('dsfr-data-map') as DsfrDataMap;
  const couche = document.createElement('dsfr-data-map-layer') as DsfrDataMapLayer;
  couche.id = 'couche';
  couche.setAttribute('source', SRC);
  couche.setAttribute('type', 'circle');
  couche.setAttribute('lat-field', 'lat');
  couche.setAttribute('lon-field', 'lon');
  for (const [k, v] of Object.entries(attrsCouche)) couche.setAttribute(k, v);
  hote.appendChild(couche);
  const encart = document.createElement('dsfr-data-map-inset');
  encart.setAttribute('territory', 'la-reunion');
  hote.appendChild(encart);
  document.body.appendChild(hote);
  await nextFrame();
  const carteEncart = encart.querySelector('dsfr-data-map') as DsfrDataMap;
  const clone = carteEncart.querySelector('dsfr-data-map-layer') as DsfrDataMapLayer;
  return { hote, couche, encart, carteEncart, clone };
}

/** Rend une `dsfr-data-map` « prête » : elle expose une carte et un Leaflet factices. */
function rendrePrete(carte: DsfrDataMap, leafletMap: unknown, L: unknown) {
  const vue = carte as unknown as MapInternals;
  vue.getLeafletMap = () => leafletMap;
  vue.getLeafletLib = () => L;
}

afterEach(() => {
  document.body.replaceChildren();
  dispatchDataLoaded(SRC, []);
  clearDataCache(SRC);
  vi.restoreAllMocks();
});

describe('BUG-034 (a) — le doublon : une couche ne refait pas son groupe Leaflet', () => {
  it('_onMapReady rappelée sur la même carte ne crée pas de second groupe', async () => {
    const { hote, couche } = await monterCarte();
    const faux = fauxLeaflet();
    rendrePrete(hote, fauxCarte(REUNION, faux.bornes), faux.L);
    dispatchDataLoaded(SRC, LIGNES);
    const vue = couche as unknown as LayerInternals;

    vue._onMapReady();
    expect(faux.groupes).toHaveLength(1);
    expect(faux.groupes[0].formes).toHaveLength(4);

    // Le rappel que la carte hôte adressait aux couches des encarts
    vue._onMapReady();
    expect(faux.groupes).toHaveLength(1);
    expect(faux.groupes[0].formes).toHaveLength(4);
    expect(couche.getRenderedCount()).toBe(4);
  });

  it('sur une AUTRE carte, le groupe de l’ancienne est retiré avant d’en créer un', async () => {
    const { hote, couche } = await monterCarte();
    const faux = fauxLeaflet();
    const premiere = fauxCarte(REUNION, faux.bornes);
    rendrePrete(hote, premiere, faux.L);
    dispatchDataLoaded(SRC, LIGNES);
    const vue = couche as unknown as LayerInternals;
    vue._onMapReady();

    const seconde = fauxCarte(REUNION, faux.bornes);
    rendrePrete(hote, seconde, faux.L);
    vue._onMapReady();

    expect(faux.groupes).toHaveLength(2);
    // Rien d'orphelin : l'ancien groupe a quitté l'ancienne carte
    expect(faux.groupes[0].retraits).toEqual([premiere]);
    expect(faux.groupes[1].formes).toHaveLength(4);
  });

  it('une couche retirée oublie sa carte : reconnectée, elle repart d’un groupe neuf', async () => {
    const { hote, couche } = await monterCarte();
    const faux = fauxLeaflet();
    const carte = fauxCarte(REUNION, faux.bornes);
    rendrePrete(hote, carte, faux.L);
    dispatchDataLoaded(SRC, LIGNES);
    const vue = couche as unknown as LayerInternals;
    vue._onMapReady();

    couche.remove();
    expect(faux.groupes[0].retraits).toEqual([carte]);
    expect(vue._layerGroup).toBeNull();
    expect(vue._leafletMap).toBeNull();

    hote.appendChild(couche);
    vue._onMapReady();
    expect(faux.groupes).toHaveLength(2);
    expect(faux.groupes[1].formes).toHaveLength(4);
  });

  it('la carte hôte ne notifie QUE ses couches, jamais celles de ses encarts', async () => {
    const { hote, couche, clone } = await monterCarte();
    const surHote = vi.spyOn(couche as unknown as LayerInternals, '_onMapReady');
    const surClone = vi.spyOn(clone as unknown as LayerInternals, '_onMapReady');
    (hote as unknown as MapInternals)._notifyExistingLayers();
    expect(surHote).toHaveBeenCalledTimes(1);
    expect(surClone).not.toHaveBeenCalled();

    const deplaceHote = vi.spyOn(couche as unknown as LayerInternals, '_onViewportChange');
    const deplaceClone = vi.spyOn(clone as unknown as LayerInternals, '_onViewportChange');
    (hote as unknown as MapInternals)._notifyLayers();
    expect(deplaceHote).toHaveBeenCalledTimes(1);
    expect(deplaceClone).not.toHaveBeenCalled();
  });

  it('la carte d’un encart notifie bien la sienne', async () => {
    const { carteEncart, clone } = await monterCarte();
    const surClone = vi.spyOn(clone as unknown as LayerInternals, '_onMapReady');
    (carteEncart as unknown as MapInternals)._notifyExistingLayers();
    expect(surClone).toHaveBeenCalledTimes(1);
  });
});

describe('BUG-034 (b) — le coût : la couche d’un encart ne trace que son emprise', () => {
  it('trace les seules entités du cadre, et les remplace à chaque nouvelle donnée', async () => {
    const { carteEncart, clone } = await monterCarte();
    const faux = fauxLeaflet();
    rendrePrete(carteEncart, fauxCarte(REUNION, faux.bornes), faux.L);
    dispatchDataLoaded(SRC, LIGNES);
    (clone as unknown as LayerInternals)._onMapReady();

    // Quatre lignes reçues, deux dans le cadre de La Réunion
    expect(clone.getRenderedCount()).toBe(2);
    expect(faux.groupes[0].formes).toHaveLength(2);
    expect(faux.cercles.map((c) => c.lat)).toEqual([-20.88, -21.34]);

    // Un filtre amont : il ne reste qu'un point de l'île, et un de métropole
    dispatchDataLoaded(SRC, [LIGNES[0], LIGNES[3]]);
    expect(clone.getRenderedCount()).toBe(1);
    expect(faux.groupes[0].formes).toHaveLength(1);

    // Plus aucun point dans le cadre : l'encart se vide
    dispatchDataLoaded(SRC, [LIGNES[0], LIGNES[1]]);
    expect(clone.getRenderedCount()).toBe(0);
    expect(faux.groupes[0].formes).toHaveLength(0);
  });

  it('la couche de la carte hôte, elle, trace tout', async () => {
    const { hote, couche } = await monterCarte();
    const faux = fauxLeaflet();
    rendrePrete(hote, fauxCarte(REUNION, faux.bornes), faux.L);
    dispatchDataLoaded(SRC, LIGNES);
    (couche as unknown as LayerInternals)._onMapReady();

    expect(couche.getRenderedCount()).toBe(4);
    expect((couche as unknown as LayerInternals)._drawnFrame).toBeNull();
  });

  it('les rayons restent ceux du jeu ENTIER : même taille dans l’encart et sur la carte', async () => {
    const { carteEncart, clone } = await monterCarte({
      'radius-field': 'v',
      'radius-scale': 'sqrt',
      'radius-max': '20',
    });
    const faux = fauxLeaflet();
    rendrePrete(carteEncart, fauxCarte(REUNION, faux.bornes), faux.L);
    dispatchDataLoaded(SRC, LIGNES);
    (clone as unknown as LayerInternals)._onMapReady();

    // Le maximum du jeu est 100 (Paris, hors cadre) : 25 → 10 px, 1 → 2 px.
    // Calculée sur les seuls points de l'île, l'échelle donnerait 20 et 4.
    expect(faux.cercles.map((c) => c.radius)).toEqual([10, 2]);
  });

  it('garde un symbole à cheval sur le bord, écarte celui qui est hors de portée', async () => {
    const { carteEncart, clone } = await monterCarte({ radius: '10' });
    const faux = fauxLeaflet();
    rendrePrete(carteEncart, fauxCarte(REUNION, faux.bornes), faux.L);
    // Un pixel vaut 0,01° : la portée est de 10 px de rayon + 8 px de marge
    dispatchDataLoaded(SRC, [
      { nom: 'à cheval', lat: -21.0, lon: 56.1 },
      { nom: 'hors de portée', lat: -21.0, lon: 56.3 },
    ]);
    (clone as unknown as LayerInternals)._onMapReady();

    expect(faux.cercles.map((c) => c.lon)).toEqual([56.1]);
  });

  it('retrace quand l’emprise sort du cadre tracé (encart redimensionné), pas avant', async () => {
    const { carteEncart, clone } = await monterCarte();
    const faux = fauxLeaflet();
    const carte = fauxCarte({ south: -21.1, west: 55.3, north: -20.7, east: 55.7 }, faux.bornes);
    rendrePrete(carteEncart, carte, faux.L);
    dispatchDataLoaded(SRC, LIGNES);
    const vue = clone as unknown as LayerInternals;
    vue._onMapReady();
    // Saint-Pierre (-21,34) est sous le cadre : un seul point
    expect(clone.getRenderedCount()).toBe(1);

    // Même emprise : rien à refaire
    faux.cercles.length = 0;
    vue._onViewportChange();
    expect(faux.cercles).toHaveLength(0);

    // L'encart s'agrandit : le cadre couvre toute l'île
    carte.etat.cadre = REUNION;
    vue._onViewportChange();
    expect(clone.getRenderedCount()).toBe(2);
  });
});

describe('BUG-034 — ce que l’encart ne doit pas faire à la page', () => {
  it('le clone ne porte ni id ni `bbox`, et garde la trace de sa couche d’origine', async () => {
    const { clone } = await monterCarte({ bbox: '' });
    expect(clone.id).toBe('');
    // Un clone en `bbox` commandait la source avec SA zone visible, sous la
    // même clé que la couche d'origine
    expect(clone.hasAttribute('bbox')).toBe(false);
    expect(clone.bbox).toBe(false);
    expect(clone.getAttribute(INSET_CLONE_OF)).toBe('couche');
  });

  it('la description de la carte hôte ne compte pas les couches des encarts', async () => {
    const { hote, couche, carteEncart, clone } = await monterCarte();
    const faux = fauxLeaflet();
    rendrePrete(hote, fauxCarte({ south: 41, west: -5, north: 51, east: 10 }, faux.bornes), faux.L);
    rendrePrete(carteEncart, fauxCarte(REUNION, faux.bornes), faux.L);
    const surHote = vi.spyOn(hote as unknown as MapInternals, 'updateDescription');
    const surEncart = vi.spyOn(carteEncart as unknown as MapInternals, 'updateDescription');
    dispatchDataLoaded(SRC, LIGNES);
    (couche as unknown as LayerInternals)._onMapReady();
    (clone as unknown as LayerInternals)._onMapReady();

    // Quatre cercles, une fois — pas « 4 cercles, 4 cercles »
    expect(surHote).toHaveBeenLastCalledWith(['Couches : 4 cercles.']);
    // L'encart décrit ce qu'il montre : ses deux points
    expect(surEncart).toHaveBeenLastCalledWith(['Couches : 2 cercles.']);
  });

  it('une timeline en `for` pilote aussi les clones de la couche désignée', async () => {
    const { hote, couche, clone } = await monterCarte({ 'time-field': 'nom' });
    const timeline = new DsfrDataMapTimeline();
    timeline.for = 'couche';
    hote.appendChild(timeline);

    const cibles = (timeline as unknown as TimelineInternals)._getTargetLayers();
    expect(cibles).toEqual([couche, clone]);
  });
});
