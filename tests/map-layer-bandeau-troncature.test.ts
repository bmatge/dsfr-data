import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Tests #1020 — le bandeau de la couche dit ce que la carte ne montre pas.
 *
 * La couche ne lisait jamais la meta de sa source : avec un `limit` aligné
 * sur `max-items` (défaut de la Carto), les lignes reçues valaient le plafond,
 * rien ne dépassait, et le bandeau disparaissait précisément quand la carte
 * ne montrait que les 1 000 premiers enregistrements sur 34 826. Désormais :
 * - troncature amont (`meta.truncated`, ou `meta.total` > lignes reçues) OU
 *   plafond `max-items` dépassé → bandeau ;
 * - deux chiffres balisés (affichés, total) et le biais d'ordre ;
 * - `role="status"`, mis à jour en place ; jamais sur une carte verrouillée.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import * as L from 'leaflet';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';
import '@/components/dsfr-data-map.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  setDataMeta,
} from '@/utils/data-bridge.js';

/** Vue interne de la couche : ce que les tests injectent. */
interface LayerInternals {
  _leafletMap: unknown;
  _L: unknown;
  _layerGroup: unknown;
  _mapParent: Element | null;
  _visible: boolean;
}

const SOURCE = 'src-1020';

function fakeMap() {
  return {
    hasLayer: vi.fn(() => true),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    getZoom: vi.fn(() => 6),
  };
}

/** n lignes ponctuelles valides. */
function rows(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({ nom: `P${i}`, lat: 43 + i * 0.01, lon: 2 }));
}

/** Carte + couche abonnée à SOURCE, Leaflet injecté (cf. map-skipped-rows). */
async function mountLayer(opts: { maxItems: number; locked?: boolean; bbox?: boolean }) {
  const parent = document.createElement('dsfr-data-map');
  if (opts.locked) parent.setAttribute('locked', '');
  const layer = new DsfrDataMapLayer();
  layer.type = 'marker';
  layer.latField = 'lat';
  layer.lonField = 'lon';
  layer.maxItems = opts.maxItems;
  if (opts.bbox) layer.bbox = true;
  layer.source = SOURCE;
  parent.appendChild(layer);
  document.body.appendChild(parent);
  const internals = layer as unknown as LayerInternals;
  internals._leafletMap = fakeMap();
  internals._L = L;
  internals._layerGroup = L.featureGroup();
  internals._mapParent = parent;
  internals._visible = true;
  await layer.updateComplete;
  return { parent, layer };
}

/** La source publie sa meta AVANT ses données (contrat #282), puis on laisse le rendu finir. */
async function emit(data: Record<string, unknown>[], meta?: Parameters<typeof setDataMeta>[1]) {
  if (meta) setDataMeta(SOURCE, meta);
  dispatchDataLoaded(SOURCE, data);
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

function banner(parent: Element): HTMLElement | null {
  return parent.querySelector<HTMLElement>('.dsfr-data-map__max-items-banner');
}

/** Relit un chiffre fr-FR balisé (« 34 826 » avec espace fine insécable). */
function count(parent: Element, which: 'shown' | 'total'): number | null {
  const t = banner(parent)?.querySelector(`.dsfr-data-map__max-items-${which}`)?.textContent;
  return t == null ? null : Number(t.replace(/[\s\u202f\u00a0]/g, ''));
}

afterEach(() => {
  clearDataMeta(SOURCE);
  clearDataCache(SOURCE);
  try {
    document.body.innerHTML = '';
  } catch {
    // happy-dom : deconnexion d'un element Lit rendu
  }
  vi.restoreAllMocks();
});

describe('#1020 — bandeau de troncature amont', () => {
  it('limit = max-items : la source a tronqué, le bandeau donne les deux chiffres et le biais', async () => {
    const { parent, layer } = await mountLayer({ maxItems: 5 });
    await emit(rows(5), { page: 1, pageSize: 0, total: 34826, serverSide: false, truncated: true });

    expect(layer.getRenderedCount()).toBe(5);
    const b = banner(parent);
    expect(b).not.toBeNull();
    expect(count(parent, 'shown')).toBe(5);
    expect(count(parent, 'total')).toBe(34826);
    // Format fr-FR : séparateur de milliers
    expect(b!.querySelector('.dsfr-data-map__max-items-total')!.textContent).toMatch(
      /^34[\s\u202f\u00a0]826$/
    );
    expect(b!.textContent).toContain('premiers enregistrements affichés sur');
    expect(b!.textContent).toContain("dans l'ordre du fichier");
    expect(b!.textContent).toContain("la répartition affichée n'est pas représentative");
    expect(b!.textContent).toContain("La source n'a chargé qu'une partie du jeu.");
    // Plafond non dépassé : ne pas renvoyer vers max-items
    expect(b!.textContent).not.toContain('max-items');
  });

  it('meta.total supérieur aux lignes reçues suffit, même sans drapeau truncated', async () => {
    const { parent } = await mountLayer({ maxItems: 100 });
    await emit(rows(10), { page: 1, pageSize: 0, total: 48, serverSide: false });

    expect(count(parent, 'shown')).toBe(10);
    expect(count(parent, 'total')).toBe(48);
  });

  it('jeu complet (total = lignes reçues, sous le plafond) : aucun bandeau', async () => {
    const { parent } = await mountLayer({ maxItems: 100 });
    await emit(rows(10), { page: 1, pageSize: 0, total: 10, serverSide: false });

    expect(banner(parent)).toBeNull();
  });

  it('plafond de rendu seul (pas de meta) : deux chiffres, et le remède max-items', async () => {
    const { parent } = await mountLayer({ maxItems: 3 });
    await emit(rows(8));

    expect(count(parent, 'shown')).toBe(3);
    expect(count(parent, 'total')).toBe(8);
    expect(banner(parent)!.textContent).toContain('Relevez max-items pour voir le reste.');
    expect(banner(parent)!.textContent).not.toContain('La source');
  });

  it('source tronquée ET plafond dépassé : affichés = plafond, total = celui de la source', async () => {
    const { parent, layer } = await mountLayer({ maxItems: 4 });
    await emit(rows(10), { page: 1, pageSize: 0, total: 500, serverSide: false, truncated: true });

    expect(layer.getRenderedCount()).toBe(4);
    expect(count(parent, 'shown')).toBe(4);
    expect(count(parent, 'total')).toBe(500);
  });

  it('troncature signalée sans total connu (concat) : un seul chiffre, le biais reste dit', async () => {
    const { parent } = await mountLayer({ maxItems: 100 });
    await emit(rows(6), { page: 1, pageSize: 0, serverSide: false, truncated: true });

    expect(count(parent, 'shown')).toBe(6);
    expect(count(parent, 'total')).toBeNull();
    expect(banner(parent)!.textContent).toContain('6 premiers enregistrements affichés');
    expect(banner(parent)!.textContent).toContain("n'est pas représentative");
  });

  it('source triée (order-by) : l’ordre est celui du tri, pas du fichier', async () => {
    const src = document.createElement('div');
    src.id = SOURCE;
    src.setAttribute('order-by', 'population:desc');
    document.body.appendChild(src);
    const { parent } = await mountLayer({ maxItems: 5 });
    await emit(rows(5), { page: 1, pageSize: 0, total: 90, serverSide: false, truncated: true });

    const t = banner(parent)!.textContent!;
    expect(t).toContain("dans l'ordre du tri de la source");
    expect(t).not.toContain('représentative');
  });

  it('accessibilité : role="status", aria-live polite, aucun contrôle interactif', async () => {
    const { parent } = await mountLayer({ maxItems: 5 });
    await emit(rows(5), { page: 1, pageSize: 0, total: 60, serverSide: false, truncated: true });

    const b = banner(parent)!;
    expect(b.getAttribute('role')).toBe('status');
    expect(b.getAttribute('aria-live')).toBe('polite');
    expect(b.getAttribute('aria-atomic')).toBe('true');
    expect(b.querySelector('button, a, input, select, [tabindex]')).toBeNull();
    // Frère du conteneur Leaflet, jamais dedans (ARCHITECTURE §12)
    expect(b.parentElement).toBe(parent);
  });

  it('mis à jour EN PLACE au rendu suivant (région live stable), retiré quand tout tient', async () => {
    const { parent } = await mountLayer({ maxItems: 5 });
    await emit(rows(5), { page: 1, pageSize: 0, total: 60, serverSide: false, truncated: true });
    const first = banner(parent);

    await emit(rows(5), { page: 1, pageSize: 0, total: 70, serverSide: false, truncated: true });
    expect(banner(parent)).toBe(first);
    expect(count(parent, 'total')).toBe(70);
    expect(parent.querySelectorAll('.dsfr-data-map__max-items-banner')).toHaveLength(1);

    await emit(rows(5), { page: 1, pageSize: 0, total: 5, serverSide: false });
    expect(banner(parent)).toBeNull();
  });

  it('#644 carte verrouillée : jamais de bandeau, même tronquée en amont', async () => {
    const { parent, layer } = await mountLayer({ maxItems: 5, locked: true });
    await emit(rows(5), { page: 1, pageSize: 0, total: 999, serverSide: false, truncated: true });

    expect(layer.getRenderedCount()).toBe(5);
    expect(banner(parent)).toBeNull();
  });

  it('l’événement de rendu porte le total de la source', async () => {
    const { layer } = await mountLayer({ maxItems: 5 });
    const seen: Array<{ total: number; rendered: number }> = [];
    layer.addEventListener('dsfr-data-map-layer-render', (e) =>
      seen.push((e as CustomEvent<{ total: number; rendered: number }>).detail)
    );
    await emit(rows(5), { page: 1, pageSize: 0, total: 1234, serverSide: false, truncated: true });

    expect(seen.at(-1)).toMatchObject({ total: 1234, rendered: 5 });
  });
});
