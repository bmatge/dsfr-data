/**
 * #1288, proposition A — pendant une panne de source, dire la panne PARTOUT et
 * ne montrer aucun ancien chiffre.
 *
 * Depuis #1272 (ADR-158) les lignes d'une source en panne ne sont plus au
 * cache. Trois afficheurs gardaient pourtant LEUR copie à l'écran, sans date
 * et sans message : le tableau équivalent (export CSV compris), la couche de
 * carte, la liste et les fiches en pagination serveur. Et les filtres d'une
 * source en panne restaient actifs, sans effet.
 *
 * Ces tests portent le balisage et les textes, cause par cause. Les boîtes,
 * le focus et le vrai Leaflet sont dans `e2e/panne-partout.spec.ts` ; les
 * chiffres, dans `tests/verif-donnees/affichages.ts`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataA11y } from '@/components/dsfr-data-a11y.js';
import { DsfrDataMap } from '@/components/dsfr-data-map.js';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';
import { DsfrDataList } from '@/components/dsfr-data-list.js';
import { DsfrDataDisplay } from '@/components/dsfr-data-display.js';
import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataError,
  dispatchDataLoaded,
  dispatchDataLoading,
  registerStatusBanner,
  setDataMeta,
  subscribeToSourceCommands,
  type SourceCommandEvent,
} from '@/utils/data-bridge.js';
import {
  describeSourceCause,
  filtersDisabledBy,
  inlineCauseTitle,
  unavailablePhrase,
  type SourceErrorCause,
} from '@/utils/source-errors.js';
import { pageLoadErrorText } from '@/utils/status-templates.js';

void DsfrDataA11y;
void DsfrDataMap;
void DsfrDataMapLayer;
void DsfrDataList;
void DsfrDataDisplay;
void DsfrDataFacets;
void DsfrDataSearch;

/** Une commande telle que la reçoit un abonné : sans l'id de la source visée. */
type Commande = Omit<SourceCommandEvent, 'sourceId'>;

const E503 = (): Error => new Error('HTTP 503: Service Unavailable');
const E404 = (): Error => new Error('HTTP 404: Not Found');
const E400 = (): Error => new Error('HTTP 400: Bad Request');

/** Texte rendu d'un nœud, espaces ramenés à un seul, hors `<style>`. */
function texte(el: Element | null): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('style').forEach((s) => s.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const SOURCES: string[] = [];
/** Un id de source par test : le registre d'erreur est global. */
function source(nom: string): string {
  const id = `p1288-${nom}-${SOURCES.length}`;
  SOURCES.push(id);
  return id;
}

afterEach(() => {
  document.body.replaceChildren();
  for (const id of SOURCES.splice(0)) {
    clearDataCache(id);
    clearDataMeta(id);
  }
  window.history.replaceState(null, '', window.location.pathname);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Les phrases
// ---------------------------------------------------------------------------

describe('#1288 — les phrases suivent la cause du barème', () => {
  const CAUSES: SourceErrorCause[] = [
    'service-indisponible',
    'reponse-bloquee',
    'hors-connexion',
    'service-sollicite',
    'donnees-introuvables',
    'acces-restreint',
    'page-mal-reglee',
  ];

  it('« momentanément » pour un service qui ne répond pas, le titre de la cause sinon', () => {
    const dit = (cause: SourceErrorCause) =>
      unavailablePhrase('Filtres', describeSourceCause(cause));
    expect(dit('service-indisponible')).toBe('Filtres momentanément indisponibles.');
    expect(dit('reponse-bloquee')).toBe('Filtres momentanément indisponibles.');
    expect(dit('hors-connexion')).toBe('Filtres indisponibles. Vous semblez hors connexion.');
    expect(dit('service-sollicite')).toBe('Filtres indisponibles. Le service est très sollicité.');
    expect(dit('donnees-introuvables')).toBe(
      'Filtres indisponibles. Ces données ne sont plus publiées à cette adresse.'
    );
    expect(dit('acces-restreint')).toBe(
      'Filtres indisponibles. Ces données ne sont pas accessibles publiquement.'
    );
  });

  it('ne réécrit aucune phrase : chaque titre vient du barème', () => {
    for (const cause of CAUSES) {
      const desc = describeSourceCause(cause);
      const phrase = unavailablePhrase('Données du graphique', desc);
      expect(
        phrase === 'Données du graphique momentanément indisponibles.' ||
          phrase.endsWith(`${desc.title}.`)
      ).toBe(true);
      expect(inlineCauseTitle(desc).toLowerCase()).toBe(`${desc.title.toLowerCase()}.`);
    }
    expect(inlineCauseTitle(describeSourceCause('service-indisponible'))).toBe(
      'données momentanément indisponibles.'
    );
  });

  it('les filtres restent actifs quand le refus vient de la page', () => {
    for (const cause of CAUSES) {
      expect(filtersDisabledBy(cause)).toBe(cause !== 'page-mal-reglee');
    }
  });

  it('la phrase d’une page refusée porte les deux numéros', () => {
    expect(pageLoadErrorText(4, 3)).toBe(
      'La page 4 n’a pas pu être chargée. Vous consultez toujours la page 3.'
    );
  });
});

// ---------------------------------------------------------------------------
// Tableau équivalent
// ---------------------------------------------------------------------------

describe('#1288 — dsfr-data-a11y : ni tableau ni export pendant une panne', () => {
  const ROWS = [
    { region: 'Occitanie', n: 1640 },
    { region: 'Bretagne', n: 902 },
  ];

  async function mountA11y(src: string, attrs: Record<string, string> = {}): Promise<DsfrDataA11y> {
    const el = document.createElement('dsfr-data-a11y') as DsfrDataA11y;
    for (const [k, v] of Object.entries({ source: src, table: '', download: '', ...attrs })) {
      el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  const bouton = (el: Element) => el.querySelector('button') as HTMLButtonElement;
  const raison = (el: Element) => el.querySelector('.dsfr-data-a11y__unavailable');

  /** Un export a-t-il produit un fichier ? */
  function espionExport() {
    const created = vi.fn(() => 'blob:x');
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() })
    );
    return created;
  }

  it('retire le tableau, désactive le bouton et écrit la raison à côté', async () => {
    const src = source('a11y');
    const el = await mountA11y(src);
    dispatchDataLoaded(src, ROWS);
    await el.updateComplete;
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(bouton(el).hasAttribute('aria-disabled')).toBe(false);

    dispatchDataError(src, E503());
    await el.updateComplete;

    expect(el.querySelector('table')).toBeNull();
    expect(texte(raison(el))).toBe(
      'Données momentanément indisponibles. Le tableau et le téléchargement reviendront avec les données.'
    );
    // Désactivé SANS perdre le focus : aria-disabled, pas disabled
    expect(bouton(el).getAttribute('aria-disabled')).toBe('true');
    expect(bouton(el).disabled).toBe(false);
    expect(bouton(el).getAttribute('aria-describedby')).toBe(raison(el)!.id);
    expect(texte(el.querySelector(`#${el.id}-desc`))).toBe(
      'Données du graphique momentanément indisponibles.'
    );
    // Aucun chiffre de l'ancien jeu nulle part
    expect(texte(el)).not.toMatch(/\d/);
  });

  it('ne produit aucun fichier, et en produit de nouveau au retour', async () => {
    const src = source('a11y-export');
    const created = espionExport();
    const el = await mountA11y(src);
    dispatchDataLoaded(src, ROWS);
    await el.updateComplete;
    bouton(el).click();
    expect(created).toHaveBeenCalledTimes(1);

    dispatchDataError(src, E503());
    await el.updateComplete;
    bouton(el).click();
    expect(created).toHaveBeenCalledTimes(1);

    dispatchDataLoaded(src, ROWS);
    await el.updateComplete;
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(raison(el)).toBeNull();
    expect(bouton(el).hasAttribute('aria-disabled')).toBe(false);
    bouton(el).click();
    expect(created).toHaveBeenCalledTimes(2);
  });

  it('garde le même rendu pendant un nouvel essai, phrase de l’intégrateur comprise', async () => {
    const src = source('a11y-essai');
    const el = await mountA11y(src);
    dispatchDataLoaded(src, ROWS);
    dispatchDataError(src, E503(), undefined, { userMessage: 'Chiffres en cours de mise à jour.' });
    await el.updateComplete;
    const avant = texte(raison(el));
    expect(avant).toBe(
      'Chiffres en cours de mise à jour. Le tableau et le téléchargement reviendront avec les données.'
    );

    // « Réessayer » : le registre d'erreur est effacé le temps de l'essai
    dispatchDataLoading(src);
    await el.updateComplete;
    expect(texte(raison(el))).toBe(avant);
    expect(el.querySelector('table')).toBeNull();
    expect(bouton(el).getAttribute('aria-disabled')).toBe('true');
    expect(bouton(el).disabled).toBe(false);
  });

  it('suit la cause : données retirées, rien ne « reviendra »', async () => {
    const src = source('a11y-404');
    const el = await mountA11y(src);
    dispatchDataLoaded(src, ROWS);
    dispatchDataError(src, E404());
    await el.updateComplete;
    expect(texte(raison(el))).toBe(
      'Ces données ne sont plus publiées à cette adresse. Le tableau et le téléchargement ne sont pas disponibles.'
    );
    expect(texte(el.querySelector(`#${el.id}-desc`))).toBe(
      'Données du graphique indisponibles. Ces données ne sont plus publiées à cette adresse.'
    );
  });

  it('ne nomme que ce que la section montre', async () => {
    const src = source('a11y-table');
    const el = await mountA11y(src, { download: null as unknown as string });
    el.removeAttribute('download');
    dispatchDataLoaded(src, ROWS);
    dispatchDataError(src, E503());
    await el.updateComplete;
    expect(texte(raison(el))).toBe(
      'Données momentanément indisponibles. Le tableau reviendra avec les données.'
    );
  });

  it('n’annonce rien quand il accompagne un graphique ; s’annonce quand il est seul', async () => {
    const cible = document.createElement('div');
    cible.id = 'p1288-cible';
    document.body.appendChild(cible);
    const src = source('a11y-role');
    const accompagne = await mountA11y(src, { for: 'p1288-cible' });
    const seul = await mountA11y(src);
    dispatchDataLoaded(src, ROWS);
    dispatchDataError(src, E503());
    await accompagne.updateComplete;
    await seul.updateComplete;
    expect(raison(accompagne)!.hasAttribute('role')).toBe(false);
    expect(raison(seul)!.getAttribute('role')).toBe('status');

    // Un bandeau dit déjà la panne : plus aucune annonce
    const release = registerStatusBanner(src);
    await seul.updateComplete;
    expect(raison(seul)!.hasAttribute('role')).toBe(false);
    release();
  });

  it('une source qui n’a jamais livré dit la panne, pas « aucune donnée »', async () => {
    const src = source('a11y-jamais');
    const el = await mountA11y(src);
    dispatchDataError(src, E503());
    await el.updateComplete;
    expect(texte(el.querySelector(`#${el.id}-desc`))).toBe(
      'Données du graphique momentanément indisponibles.'
    );
    expect(bouton(el).getAttribute('aria-disabled')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// Carte
// ---------------------------------------------------------------------------

/** Vue interne de la couche : ce que `_onMapReady` pose quand la carte est prête. */
interface LayerInternals {
  _L: unknown;
  _leafletMap: unknown;
  _layerGroup: unknown;
  _clusterGroup: unknown;
  _mapParent: unknown;
  _visible: boolean;
  _data: unknown[];
}

/** Vue interne de la carte : le conteneur Leaflet et sa description. */
interface MapInternals {
  _container: HTMLDivElement | null;
  _srDescription: HTMLParagraphElement | null;
}

function leafletFactice() {
  const added: unknown[] = [];
  const clustered: unknown[] = [];
  const group = (bag: unknown[]) => ({
    clearLayers: () => {
      bag.length = 0;
    },
    addLayer: (l: unknown) => {
      bag.push(l);
    },
    addTo: () => {},
    removeFrom: () => {},
    getBounds: () => ({ isValid: () => false }),
  });
  const marker = {
    bindPopup: () => marker,
    bindTooltip: () => marker,
    on: () => marker,
    getElement: () => null,
  };
  const L = {
    marker: () => ({ ...marker }),
    circleMarker: () => ({ ...marker }),
    divIcon: () => ({}),
    point: (x: number, y: number) => ({ x, y }),
  };
  const map = { getZoom: () => 10, hasLayer: () => false, on: () => {} };
  return { L, added, clustered, layerGroup: group(added), clusterGroup: group(clustered), map };
}

const POINTS = [
  { lat: 48.8, lon: 2.3 },
  { lat: 45.7, lon: 4.8 },
  { lat: 43.3, lon: 5.4 },
];

function mountLayer(
  src: string,
  parent: HTMLElement,
  attrs: Record<string, string> = {}
): { layer: DsfrDataMapLayer; mock: ReturnType<typeof leafletFactice> } {
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

/**
 * Carte montée SANS Leaflet : un IntersectionObserver muet diffère l'init pour
 * toujours, et l'on pose ce que `_initMap` aurait créé (voir map-layer-idle).
 */
function mountMap(parent: HTMLElement = document.body): {
  map: DsfrDataMap;
  internals: MapInternals;
} {
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
  parent.appendChild(map);
  return { map, internals };
}

describe('#1288 — dsfr-data-map-layer : la couche en panne est vidée', () => {
  it('rend formes, grappes et légende, lâche ses lignes, et le dit par un événement de rendu', async () => {
    const src = source('couche');
    const { layer, mock } = mountLayer(src, document.body);
    dispatchDataLoaded(src, POINTS);
    await layer.updateComplete;
    expect(layer.getRenderedCount()).toBe(3);
    (layer as unknown as LayerInternals)._clusterGroup = mock.clusterGroup;
    mock.clustered.push({});

    const renders: Array<{ rendered: number }> = [];
    layer.addEventListener('dsfr-data-map-layer-render', (e) =>
      renders.push((e as CustomEvent).detail)
    );
    dispatchDataError(src, E503());
    await layer.updateComplete;

    expect(mock.added).toHaveLength(0);
    expect(mock.clustered).toHaveLength(0);
    expect(layer.getRenderedCount()).toBe(0);
    expect(layer.getLegendEntries()).toEqual([]);
    expect((layer as unknown as LayerInternals)._data).toEqual([]);
    expect(renders).toEqual([{ rendered: 0, skipped: 0, total: 0, legend: [] }]);
    expect(layer.getSourceFailure()?.sourceId).toBe(src);
  });

  it('reste vide pendant un nouvel essai, retrace au chargement réussi', async () => {
    const src = source('couche-retour');
    const { layer, mock } = mountLayer(src, document.body);
    dispatchDataLoaded(src, POINTS);
    dispatchDataError(src, E503());
    dispatchDataLoading(src);
    await layer.updateComplete;
    expect(mock.added).toHaveLength(0);
    expect(layer.getSourceFailure()).not.toBeNull();

    dispatchDataLoaded(src, POINTS.slice(0, 2));
    await layer.updateComplete;
    expect(mock.added).toHaveLength(2);
    expect(layer.getSourceFailure()).toBeNull();
  });
});

describe('#1288 — dsfr-data-map : message centré, ou ligne d’état si une autre couche trace', () => {
  const centre = (i: MapInternals) => i._container!.querySelector('.dsfr-data-map__error');
  const ligne = (map: Element) => map.querySelector(':scope > .dsfr-data-map__layer-status');

  it('une seule couche en panne : le gabarit commun, centré, et la description sans compte', async () => {
    const src = source('carte');
    const { map, internals } = mountMap();
    const { layer } = mountLayer(src, map);
    dispatchDataLoaded(src, POINTS);
    dispatchDataError(src, E503());
    await layer.updateComplete;

    const bloc = centre(internals)!;
    expect(bloc.classList.contains('dsfr-data-status--source-error')).toBe(true);
    expect(texte(bloc.querySelector('.dsfr-data-status__title'))).toBe(
      'Données momentanément indisponibles'
    );
    expect(bloc.getAttribute('role')).toBe('status');
    expect(texte(bloc.querySelector('button.dsfr-data-status__retry'))).toBe('Réessayer');
    expect(ligne(map)).toBeNull();
    expect(internals._srDescription!.textContent).toContain(
      'Données momentanément indisponibles. Le service qui publie ces chiffres ne répond pas pour l’instant.'
    );
    // Ni « Couches : 3 marqueurs », ni aucun autre chiffre
    expect(internals._srDescription!.textContent).not.toMatch(/Couches|\d/);
  });

  it('« Réessayer » relance la source, le message tient pendant l’essai et part au retour', async () => {
    const src = source('carte-essai');
    const { map, internals } = mountMap();
    const { layer } = mountLayer(src, map);
    const commandes: Commande[] = [];
    const unsub = subscribeToSourceCommands(src, (cmd) => commandes.push(cmd));
    dispatchDataLoaded(src, POINTS);
    dispatchDataError(src, E503());
    await layer.updateComplete;

    const retry = centre(internals)!.querySelector('button') as HTMLButtonElement;
    retry.focus();
    retry.click();
    expect(commandes.some((c) => c.reload)).toBe(true);

    dispatchDataLoading(src);
    await layer.updateComplete;
    expect(centre(internals)).not.toBeNull();

    dispatchDataLoaded(src, POINTS);
    await layer.updateComplete;
    expect(centre(internals)).toBeNull();
    // Le bouton qui portait le focus a disparu : le focus passe à la carte
    expect(document.activeElement).toBe(internals._container);
    unsub();
  });

  it('une autre couche trace encore : pas de bloc central, une ligne qui nomme la couche', async () => {
    const a = source('carte-a');
    const b = source('carte-b');
    const { map, internals } = mountMap();
    const { layer: enPanne } = mountLayer(a, map, { label: 'Bornes de recharge' });
    const { layer: trace } = mountLayer(b, map, { label: 'Stations' });
    dispatchDataLoaded(a, POINTS);
    dispatchDataLoaded(b, POINTS.slice(0, 2));
    await trace.updateComplete;
    dispatchDataError(a, E503());
    await enPanne.updateComplete;

    expect(centre(internals)).toBeNull();
    const status = ligne(map)!;
    expect(texte(status.querySelector('.dsfr-data-map__layer-status-text'))).toBe(
      'Couche « Bornes de recharge » : données momentanément indisponibles.'
    );
    expect(status.getAttribute('role')).toBe('status');
    expect(texte(status.querySelector('button'))).toBe('Réessayer');
    expect(internals._srDescription!.textContent).toContain(
      'Couche « Bornes de recharge » : données momentanément indisponibles.'
    );
    expect(trace.getRenderedCount()).toBe(2);

    dispatchDataLoaded(a, POINTS);
    await enPanne.updateComplete;
    expect(ligne(map)).toBeNull();
  });

  it('la couche qui traçait tombe à son tour : la ligne laisse place au bloc central', async () => {
    const a = source('carte-c');
    const b = source('carte-d');
    const { map, internals } = mountMap();
    const { layer: l1 } = mountLayer(a, map, { label: 'A' });
    const { layer: l2 } = mountLayer(b, map, { label: 'B' });
    dispatchDataLoaded(a, POINTS);
    dispatchDataLoaded(b, POINTS);
    dispatchDataError(a, E503());
    await l1.updateComplete;
    expect(ligne(map)).not.toBeNull();
    dispatchDataError(b, E503());
    await l2.updateComplete;
    expect(ligne(map)).toBeNull();
    expect(centre(internals)).not.toBeNull();
  });

  it('nomme la couche par sa légende, sinon ne la nomme pas ; suit la cause', async () => {
    const a = source('carte-e');
    const b = source('carte-f');
    const c = source('carte-g');
    const { map } = mountMap();
    const { layer: sansNom } = mountLayer(a, map);
    const { layer: parLegende } = mountLayer(b, map, { id: 'p1288-couche' });
    const legende = document.createElement('dsfr-data-map-legend');
    legende.setAttribute('for', 'p1288-couche');
    legende.setAttribute('label', 'Densité');
    map.appendChild(legende);
    const { layer: trace } = mountLayer(c, map);
    dispatchDataLoaded(c, POINTS);
    await trace.updateComplete;
    dispatchDataError(a, E404());
    dispatchDataError(b, new Error('HTTP 429: Too Many Requests'));
    await sansNom.updateComplete;
    await parLegende.updateComplete;

    const textes = [...ligne(map)!.querySelectorAll('.dsfr-data-map__layer-status-text')].map((n) =>
      texte(n)
    );
    expect(textes).toEqual([
      'Une couche de cette carte : ces données ne sont plus publiées à cette adresse.',
      'Couche « Densité » : le service est très sollicité.',
    ]);
    // 404 : réessayer n'a pas de sens ; 429 : si
    const boutons = [...ligne(map)!.querySelectorAll('p')].map((p) => !!p.querySelector('button'));
    expect(boutons).toEqual([false, true]);
  });

  it('avec un bandeau : ni « Réessayer » ni annonce dans la carte', async () => {
    const a = source('carte-h');
    const b = source('carte-i');
    const release = registerStatusBanner();
    const { map, internals } = mountMap();
    const { layer: enPanne } = mountLayer(a, map, { label: 'Bornes' });
    dispatchDataLoaded(a, POINTS);
    dispatchDataError(a, E503());
    await enPanne.updateComplete;
    expect(centre(internals)!.hasAttribute('role')).toBe(false);
    expect(centre(internals)!.querySelector('button')).toBeNull();

    const { layer: trace } = mountLayer(b, map);
    dispatchDataLoaded(b, POINTS);
    await trace.updateComplete;
    expect(centre(internals)).toBeNull();
    expect(ligne(map)!.hasAttribute('role')).toBe(false);
    expect(ligne(map)!.querySelector('button')).toBeNull();
    release();
  });

  it('error-message de la source remplace la phrase, dans le bloc comme dans la ligne', async () => {
    const a = source('carte-j');
    const b = source('carte-k');
    const { map, internals } = mountMap();
    const { layer: enPanne } = mountLayer(a, map, { label: 'Bornes' });
    dispatchDataLoaded(a, POINTS);
    dispatchDataError(a, E503(), undefined, { userMessage: 'Relevé en cours.' });
    await enPanne.updateComplete;
    expect(texte(centre(internals)!.querySelector('.dsfr-data-status__title'))).toBe(
      'Relevé en cours.'
    );
    const { layer: trace } = mountLayer(b, map);
    dispatchDataLoaded(b, POINTS);
    await trace.updateComplete;
    expect(texte(ligne(map)!.querySelector('.dsfr-data-map__layer-status-text'))).toBe(
      'Couche « Bornes » : Relevé en cours.'
    );
  });

  it('un encart vide ses clones sans répéter le message', async () => {
    const src = source('carte-encart');
    const encart = document.createElement('dsfr-data-map-inset');
    document.body.appendChild(encart);
    const { map, internals } = mountMap(encart);
    const { layer, mock } = mountLayer(src, map);
    dispatchDataLoaded(src, POINTS);
    dispatchDataError(src, E503());
    await layer.updateComplete;
    expect(mock.added).toHaveLength(0);
    expect(centre(internals)).toBeNull();
    expect(ligne(map)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Liste et fiches en pagination serveur
// ---------------------------------------------------------------------------

/** Vue interne commune à la liste et aux fiches. */
interface PagedInternals {
  _currentPage: number;
  _data: unknown[];
  _handlePageChange(page: number): void;
  _exportCsv(): void;
}

describe('#1288 — pagination serveur : une page refusée ne se fait pas passer pour la page demandée', () => {
  const PAGE = (n: number) =>
    Array.from({ length: 3 }, (_, i) => ({ nom: `ligne-${(n - 1) * 3 + i + 1}` }));

  /** Sert une page comme le ferait la source : meta posée avant l'émission. */
  function servir(src: string, page: number): void {
    setDataMeta(src, { page, pageSize: 3, total: 15, serverSide: true });
    dispatchDataLoaded(src, PAGE(page));
  }

  async function mountList(src: string, urlSync = false): Promise<DsfrDataList> {
    const list = new DsfrDataList();
    list.source = src;
    list.colonnes = 'nom:Nom';
    list.urlSync = urlSync;
    document.body.appendChild(list);
    await list.updateComplete;
    return list;
  }

  const lignes = (el: Element) => [...el.querySelectorAll('tbody tr')].map((r) => texte(r));
  const encart = (el: Element) => el.querySelector('.dsfr-data-status--page-error');

  let commandes: Commande[] = [];
  let unsub: () => void = () => {};
  beforeEach(() => {
    commandes = [];
  });
  afterEach(() => unsub());

  it('garde la page précédente, le dit avec les deux numéros, et la pagination y revient', async () => {
    const src = source('liste');
    unsub = subscribeToSourceCommands(src, (cmd) => commandes.push(cmd));
    const list = await mountList(src, true);
    servir(src, 3);
    await list.updateComplete;
    const interne = list as unknown as PagedInternals;
    // L'adresse écrite par la liste (`url-sync`), dernière en date
    const ecrites: string[] = [];
    vi.spyOn(window.history, 'replaceState').mockImplementation((_s, _t, url) => {
      ecrites.push(String(url));
    });

    interne._handlePageChange(4);
    expect(commandes.at(-1)).toMatchObject({ page: 4 });
    expect(ecrites.at(-1)).toContain('page=4');
    dispatchDataError(src, E503());
    await list.updateComplete;

    expect(lignes(list)).toEqual(['ligne-7', 'ligne-8', 'ligne-9']);
    expect(texte(encart(list)!.querySelector('.dsfr-data-status__title'))).toBe(
      'La page 4 n’a pas pu être chargée. Vous consultez toujours la page 3.'
    );
    expect(interne._currentPage).toBe(3);
    expect(texte(list.querySelector('[aria-current="page"]'))).toBe('3');
    // L'adresse de la page ne garde pas une page qui n'est pas affichée
    expect(ecrites.at(-1)).toContain('page=3');
    // L'encart n'est pas une région live : la liste l'annonce par la sienne
    expect(encart(list)!.hasAttribute('role')).toBe(false);
  });

  it('annonce l’échec par la région live de la liste', async () => {
    vi.useFakeTimers();
    try {
      const src = source('liste-annonce');
      const list = await mountList(src);
      servir(src, 3);
      (list as unknown as PagedInternals)._handlePageChange(4);
      dispatchDataError(src, E503());
      await vi.runAllTimersAsync();
      await list.updateComplete;
      expect(texte(list.querySelector('.fr-sr-only[aria-live]'))).toBe(
        'La page 4 n’a pas pu être chargée. Vous consultez toujours la page 3.'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('redemander la page refusée est un nouvel essai, pas une commande sans effet', async () => {
    const src = source('liste-encore');
    unsub = subscribeToSourceCommands(src, (cmd) => commandes.push(cmd));
    const list = await mountList(src);
    servir(src, 3);
    const interne = list as unknown as PagedInternals;
    interne._handlePageChange(4);
    dispatchDataError(src, E503());
    await list.updateComplete;

    commandes.length = 0;
    interne._handlePageChange(4);
    expect(commandes).toHaveLength(1);
    expect(commandes[0].reload).toBe(true);

    // … qui échoue encore : même phrase, même page affichée
    dispatchDataLoading(src);
    dispatchDataError(src, E503());
    await list.updateComplete;
    expect(texte(encart(list)!.querySelector('.dsfr-data-status__title'))).toContain(
      'La page 4 n’a pas pu être chargée. Vous consultez toujours la page 3.'
    );
    expect(interne._currentPage).toBe(3);

    // … puis réussit : la page 4, sans encart
    servir(src, 4);
    await list.updateComplete;
    expect(encart(list)).toBeNull();
    expect(lignes(list)).toEqual(['ligne-10', 'ligne-11', 'ligne-12']);
    expect(interne._currentPage).toBe(4);
  });

  it('une autre page demandée après le refus part comme une commande ordinaire', async () => {
    const src = source('liste-autre');
    unsub = subscribeToSourceCommands(src, (cmd) => commandes.push(cmd));
    const list = await mountList(src);
    servir(src, 3);
    const interne = list as unknown as PagedInternals;
    interne._handlePageChange(4);
    dispatchDataError(src, E503());
    commandes.length = 0;
    interne._handlePageChange(2);
    expect(commandes).toHaveLength(1);
    expect(commandes[0]).toMatchObject({ page: 2 });
    expect(commandes[0].reload).toBeUndefined();
  });

  it('un échec qui n’est PAS un changement de page ne laisse aucune ligne', async () => {
    const src = source('liste-panne');
    const list = await mountList(src);
    servir(src, 2);
    await list.updateComplete;
    const interne = list as unknown as PagedInternals;
    // Un changement de page ANCIEN, réussi : il ne doit plus compter
    interne._handlePageChange(3);
    servir(src, 3);
    await list.updateComplete;

    dispatchDataError(src, E503());
    await list.updateComplete;
    expect(list.querySelector('table')).toBeNull();
    expect(encart(list)).toBeNull();
    expect(
      texte(list.querySelector('.dsfr-data-status--source-error .dsfr-data-status__title'))
    ).toBe('Données momentanément indisponibles');
    expect(interne._data).toEqual([]);
    // La page n'a pas bougé : c'est celle que la source rechargera
    expect(interne._currentPage).toBe(3);
  });

  it('en panne, l’export de la liste ne produit aucun fichier', async () => {
    const created = vi.fn(() => 'blob:x');
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() })
    );
    const src = source('liste-export');
    const list = await mountList(src);
    list.export = 'csv';
    dispatchDataLoaded(src, PAGE(1));
    await list.updateComplete;
    dispatchDataError(src, E503());
    await list.updateComplete;
    (list as unknown as PagedInternals)._exportCsv();
    expect(created).not.toHaveBeenCalled();
    expect(
      list.querySelector('.dsfr-data-list__export-buttons button')!.getAttribute('aria-disabled')
    ).toBe('true');
  });

  it('avec un bandeau : la phrase reste, « Réessayer » passe au bandeau', async () => {
    const src = source('liste-bandeau');
    const list = await mountList(src);
    servir(src, 3);
    (list as unknown as PagedInternals)._handlePageChange(4);
    dispatchDataError(src, E503());
    await list.updateComplete;
    expect(encart(list)!.querySelector('button')).not.toBeNull();
    const release = registerStatusBanner(src);
    await list.updateComplete;
    expect(encart(list)!.querySelector('button')).toBeNull();
    expect(texte(encart(list))).toContain('La page 4 n’a pas pu être chargée.');
    release();
  });

  it('dsfr-data-display : même contrat', async () => {
    const src = source('fiches');
    const display = new DsfrDataDisplay();
    display.source = src;
    display.innerHTML = '<template><p class="fiche">{{nom}}</p></template>';
    document.body.appendChild(display);
    await display.updateComplete;
    servir(src, 3);
    await display.updateComplete;
    const interne = display as unknown as PagedInternals;

    interne._handlePageChange(4);
    dispatchDataError(src, E503());
    await display.updateComplete;
    expect([...display.querySelectorAll('.fiche')].map((f) => texte(f))).toEqual([
      'ligne-7',
      'ligne-8',
      'ligne-9',
    ]);
    expect(
      texte(display.querySelector('.dsfr-data-display__page-error .dsfr-data-status__title'))
    ).toBe('La page 4 n’a pas pu être chargée. Vous consultez toujours la page 3.');
    expect(interne._currentPage).toBe(3);

    // Panne hors changement de page : plus aucune fiche
    servir(src, 3);
    dispatchDataError(src, E503());
    await display.updateComplete;
    expect(display.querySelector('.fiche')).toBeNull();
    expect(display.querySelector('.dsfr-data-status--source-error')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Facettes et recherche
// ---------------------------------------------------------------------------

describe('#1288 — facettes et recherche d’une source en panne : désactivées, sélection gardée', () => {
  const ROWS = [
    { nom: 'Atelier du Nord', type: 'PME' },
    { nom: 'Forge de Lyon', type: 'PME' },
    { nom: 'Acier Atlantique', type: 'ETI' },
  ];

  async function mountFacets(src: string): Promise<DsfrDataFacets> {
    const el = document.createElement('dsfr-data-facets') as DsfrDataFacets;
    el.id = `${src}-f`;
    el.setAttribute('source', src);
    el.setAttribute('fields', 'type');
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  async function mountSearch(
    src: string,
    attrs: Record<string, string> = {}
  ): Promise<DsfrDataSearch> {
    const el = document.createElement('dsfr-data-search') as DsfrDataSearch;
    el.id = `${src}-r`;
    for (const [k, v] of Object.entries({ source: src, fields: 'nom', count: '', ...attrs })) {
      el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  const cases = (el: Element) => [...el.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
  const raison = (el: Element) => el.querySelector('.dsfr-data-filters-unavailable');

  it('facettes : contrôles aria-disabled, raison écrite, compteurs masqués', async () => {
    const src = source('facettes');
    const f = await mountFacets(src);
    dispatchDataLoaded(src, ROWS);
    await f.updateComplete;
    expect(texte(f)).toMatch(/PME\s*\(?2\)?/);

    dispatchDataError(src, E503());
    await f.updateComplete;
    expect(texte(raison(f))).toBe('Filtres momentanément indisponibles.');
    for (const c of cases(f)) {
      expect(c.getAttribute('aria-disabled')).toBe('true');
      expect(c.disabled).toBe(false);
      expect(c.getAttribute('aria-describedby')).toContain(raison(f)!.id);
    }
    // Les compteurs datent du dernier chargement : plus aucun chiffre
    expect(texte(f)).not.toMatch(/\d/);
    // La raison n'est pas une annonce de plus
    expect(raison(f)!.hasAttribute('role')).toBe(false);
  });

  it('facettes : un geste ne change rien, la sélection posée revient avec les données', async () => {
    const src = source('facettes-geste');
    const f = await mountFacets(src);
    dispatchDataLoaded(src, ROWS);
    await f.updateComplete;
    cases(f)[0].click();
    await f.updateComplete;
    const coche = () => cases(f).map((c) => c.checked);
    const avant = coche();
    expect(avant.filter(Boolean)).toHaveLength(1);

    dispatchDataError(src, E503());
    await f.updateComplete;
    for (const c of cases(f)) c.click();
    await f.updateComplete;
    expect(coche()).toEqual(avant);

    dispatchDataLoading(src);
    await f.updateComplete;
    expect(raison(f)).not.toBeNull();

    dispatchDataLoaded(src, ROWS);
    await f.updateComplete;
    expect(raison(f)).toBeNull();
    expect(coche()).toEqual(avant);
    for (const c of cases(f)) {
      expect(c.hasAttribute('aria-disabled')).toBe(false);
      expect(c.hasAttribute('aria-describedby')).toBe(false);
    }
    // … et les filtres répondent de nouveau
    cases(f)[1].click();
    await f.updateComplete;
    expect(coche()).not.toEqual(avant);
  });

  it('facettes : « Réinitialiser les filtres » reste actif', async () => {
    const src = source('facettes-reset');
    const f = await mountFacets(src);
    dispatchDataLoaded(src, ROWS);
    await f.updateComplete;
    cases(f)[0].click();
    await f.updateComplete;
    dispatchDataError(src, E503());
    await f.updateComplete;
    const reset = f.querySelector('.dsfr-data-facets__header button') as HTMLButtonElement;
    expect(reset.hasAttribute('aria-disabled')).toBe(false);
    reset.click();
    await f.updateComplete;
    expect(cases(f).some((c) => c.checked)).toBe(false);
  });

  it('facettes : actives quand la requête est refusée (400), désactivées sur un 404', async () => {
    const src = source('facettes-causes');
    const f = await mountFacets(src);
    dispatchDataLoaded(src, ROWS);
    dispatchDataError(src, E400());
    await f.updateComplete;
    expect(raison(f)).toBeNull();
    expect(cases(f)[0].hasAttribute('aria-disabled')).toBe(false);

    dispatchDataLoaded(src, ROWS);
    dispatchDataError(src, E404());
    await f.updateComplete;
    expect(texte(raison(f))).toBe(
      'Filtres indisponibles. Ces données ne sont plus publiées à cette adresse.'
    );
  });

  it('recherche : champ en lecture seule, terme gardé, compte retiré', async () => {
    const src = source('recherche');
    const r = await mountSearch(src);
    dispatchDataLoaded(src, ROWS);
    await r.updateComplete;
    r.search('Forge');
    await r.updateComplete;
    expect(texte(r.querySelector('.dsfr-data-search-count'))).toBe('1 résultat');

    dispatchDataError(src, E503());
    await r.updateComplete;
    const input = r.querySelector('input') as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    expect(input.disabled).toBe(false);
    expect(input.getAttribute('aria-disabled')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(raison(r)!.id);
    expect(input.value).toBe('Forge');
    expect(r.querySelector('button')!.getAttribute('aria-disabled')).toBe('true');
    expect(texte(raison(r))).toBe('Filtres momentanément indisponibles.');
    expect(r.querySelector('.dsfr-data-search-count')).toBeNull();
    expect(r.querySelector('[role="status"]')).toBeNull();

    dispatchDataLoaded(src, ROWS);
    await r.updateComplete;
    expect((r.querySelector('input') as HTMLInputElement).readOnly).toBe(false);
    expect(raison(r)).toBeNull();
    expect(texte(r.querySelector('.dsfr-data-search-count'))).toBe('1 résultat');
  });

  it('recherche : error-message de la source suit la phrase', async () => {
    const src = source('recherche-message');
    const r = await mountSearch(src);
    dispatchDataLoaded(src, ROWS);
    dispatchDataError(src, E503(), undefined, { userMessage: 'Maintenance jusqu’à 18 h.' });
    await r.updateComplete;
    expect(texte(raison(r))).toBe('Filtres momentanément indisponibles. Maintenance jusqu’à 18 h.');
  });
});
