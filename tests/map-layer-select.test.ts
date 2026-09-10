import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #681 (épic #697, ADR-104 §5) — la carte comme filtre du contexte.
 *
 * 1. `dsfr-data-map-select { record, layerId, selected }` au clic sur un
 *    marqueur, un cercle ou une forme (jamais en no-interactive).
 * 2. `refine-on-click="champ"` + `context="id"` : la couche s'enregistre
 *    comme filtre `eq` du contexte — les autres vues se filtrent, un tag est
 *    visible via activeFilters(), second clic = retrait, URL du contexte
 *    synchronisée. Sans `context` : commande directe à `source`
 *    (whereKey `map-select-<id>`, chemin dégradé).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import '@/components/dsfr-data-context.js';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';
import { subscribeToSourceCommands, clearDataCache } from '@/utils/data-bridge.js';
import type { DsfrDataContext } from '@/components/dsfr-data-context.js';

type Row = Record<string, unknown>;

interface Captured {
  where?: string;
  whereKey?: string;
  origin?: string;
}

interface SelectDetail {
  record: Row;
  layerId: string;
  selected: boolean;
}

/** Vue interne de la couche : les points d'entrée du rendu Leaflet */
interface LayerInternals {
  _addMarker(record: Row, Leaf: unknown, group: { addLayer: (l: unknown) => void }): void;
  _addCircle(record: Row, Leaf: unknown, group: { addLayer: (l: unknown) => void }): void;
  _addGeoshape(
    record: Row,
    Leaf: unknown,
    group: { addLayer: (l: unknown) => void },
    breaks: number[],
    palette: readonly string[]
  ): void;
}

const PARIS: Row = { commune: 'Paris', lat: 48.85, lon: 2.35 };
const LYON: Row = { commune: 'Lyon', lat: 45.76, lon: 4.83 };

const POLY = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
};

type ClickHandler = () => void;

/** Faux objet Leaflet : capture le handler `click` posé par la couche */
function fakeLeafletLayer(clicks: ClickHandler[]) {
  return {
    on: vi.fn((name: string, handler: ClickHandler) => {
      if (name === 'click') clicks.push(handler);
    }),
    bindPopup: vi.fn(),
    bindTooltip: vi.fn(),
  };
}

function fakeLeaf(clicks: ClickHandler[]) {
  return {
    divIcon: () => ({}),
    marker: () => fakeLeafletLayer(clicks),
    circleMarker: () => fakeLeafletLayer(clicks),
    circle: () => fakeLeafletLayer(clicks),
    geoJSON: () => fakeLeafletLayer(clicks),
  };
}

/** Fausse source cible : capture les commandes reçues (whereKey → where) */
function fakeSource(id: string, whereFormat: 'colon' | 'odsql' = 'colon') {
  clearDataCache(id);
  const el = document.createElement('div');
  el.id = id;
  const commands: Captured[] = [];
  Object.assign(el, {
    getAdapter: () => ({ capabilities: { whereFormat } }),
  });
  const unsub = subscribeToSourceCommands(id, (cmd) => {
    commands.push(cmd as Captured);
  });
  document.body.appendChild(el);
  return { el, commands, unsub };
}

function mount(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper;
}

async function settle() {
  await new Promise((r) => setTimeout(r, 0));
}

function last(commands: Captured[]): Captured | undefined {
  return commands[commands.length - 1];
}

function urlParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

const unsubs: Array<() => void> = [];
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const u of unsubs.splice(0)) u();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', window.location.pathname);
  errorSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Étape 1 — événement dsfr-data-map-select
// ---------------------------------------------------------------------------

describe('dsfr-data-map-select — événement au clic (#681)', () => {
  function layerWithListener(setup: (layer: DsfrDataMapLayer) => void) {
    const layer = new DsfrDataMapLayer();
    layer.id = 'couche';
    layer.latField = 'lat';
    layer.lonField = 'lon';
    layer.geoField = 'geom';
    setup(layer);
    document.body.appendChild(layer);
    const events: SelectDetail[] = [];
    document.body.addEventListener('dsfr-data-map-select', (e) => {
      events.push((e as CustomEvent<SelectDetail>).detail);
    });
    return { layer, internals: layer as unknown as LayerInternals, events };
  }

  it('marqueur : émis au clic, bubbles + composed, selected bascule au second clic', () => {
    const { internals, events } = layerWithListener(() => {});
    const clicks: ClickHandler[] = [];
    internals._addMarker(PARIS, fakeLeaf(clicks), { addLayer: vi.fn() });
    expect(clicks).toHaveLength(1);

    clicks[0]();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ record: PARIS, layerId: 'couche', selected: true });

    // Second clic sur le même objet : la sélection est retirée
    clicks[0]();
    expect(events[1]).toEqual({ record: PARIS, layerId: 'couche', selected: false });
  });

  it("l'événement traverse le shadow DOM (composed)", () => {
    const { layer, internals } = layerWithListener(() => {});
    let composed = false;
    layer.addEventListener('dsfr-data-map-select', (e) => {
      composed = e.composed && e.bubbles;
    });
    const clicks: ClickHandler[] = [];
    internals._addMarker(PARIS, fakeLeaf(clicks), { addLayer: vi.fn() });
    clicks[0]();
    expect(composed).toBe(true);
  });

  it('cercle et forme : même événement', () => {
    const { internals, events } = layerWithListener(() => {});
    const clicks: ClickHandler[] = [];
    internals._addCircle(PARIS, fakeLeaf(clicks), { addLayer: vi.fn() });
    internals._addGeoshape(
      { geom: POLY, commune: 'Zone' },
      fakeLeaf(clicks),
      { addLayer: vi.fn() },
      [],
      []
    );
    expect(clicks).toHaveLength(2);
    clicks[0]();
    clicks[1]();
    expect(events.map((e) => e.record.commune)).toEqual(['Paris', 'Zone']);
    // Deux objets distincts : le second remplace le premier (selected reste true)
    expect(events.map((e) => e.selected)).toEqual([true, true]);
  });

  it('no-interactive : aucun clic branché (marqueur, cercle, forme)', () => {
    const { internals, events } = layerWithListener((l) => {
      l.noInteractive = true;
    });
    const clicks: ClickHandler[] = [];
    internals._addMarker(PARIS, fakeLeaf(clicks), { addLayer: vi.fn() });
    internals._addCircle(PARIS, fakeLeaf(clicks), { addLayer: vi.fn() });
    internals._addGeoshape({ geom: POLY }, fakeLeaf(clicks), { addLayer: vi.fn() }, [], []);
    expect(clicks).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('sans refine-on-click : aucune commande ne part vers la source', () => {
    const src = fakeSource('src-solo');
    unsubs.push(src.unsub);
    const { layer } = layerWithListener((l) => {
      l.source = 'src-solo';
    });
    layer._onFeatureClick(PARIS);
    expect(src.commands).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Étape 2 — refine-on-click + context : la carte filtre les autres vues
// ---------------------------------------------------------------------------

describe('refine-on-click + context — filtre du contexte (#681, ADR-104 §5)', () => {
  function annuaire(extraCtx = '') {
    const a = fakeSource('cible-a');
    const b = fakeSource('cible-b', 'odsql');
    const carte = fakeSource('src-carte');
    unsubs.push(a.unsub, b.unsub, carte.unsub);
    mount(`
      <dsfr-data-context id="ctx" sources="cible-a cible-b" url-sync ${extraCtx}></dsfr-data-context>
      <dsfr-data-map-layer id="couche" source="src-carte" refine-on-click="commune"
        context="ctx" label="Commune"></dsfr-data-map-layer>
    `);
    const ctx = document.getElementById('ctx') as DsfrDataContext;
    const layer = document.getElementById('couche') as DsfrDataMapLayer;
    return { a, b, carte, ctx, layer };
  }

  it('premier clic : les deux cibles se filtrent (au dialecte de chacune), tag visible, URL écrite', async () => {
    const { a, b, carte, ctx, layer } = annuaire();
    await settle();

    layer._onFeatureClick(PARIS);

    expect(last(a.commands)).toMatchObject({ where: 'commune:eq:Paris', origin: 'ctx' });
    expect(last(b.commands)).toMatchObject({ where: 'commune = "Paris"', origin: 'ctx' });
    // whereKey issu du contexte (uid + champ), pas du chemin dégradé
    expect(last(a.commands)?.whereKey).toMatch(/^dsfr-ctx-\d+-commune$/);
    expect(last(a.commands)?.whereKey).toBe(last(b.commands)?.whereKey);
    // La source de la carte n'est pas une cible du contexte : rien ne lui parvient
    expect(carte.commands).toHaveLength(0);

    const active = ctx.activeFilters();
    expect(active).toHaveLength(1);
    expect(active[0].displayLabel()).toBe('Commune');
    expect(active[0].displayValue()).toBe('Paris');
    expect(active[0].field).toBe('commune');
    expect(active[0].operator).toBe('eq');
    expect(urlParam('commune')).toBe('Paris');
  });

  it('second clic sur le même objet : retrait (where vide, tag et URL disparus)', async () => {
    const { a, b, ctx, layer } = annuaire();
    await settle();
    layer._onFeatureClick(PARIS);
    const key = last(a.commands)?.whereKey;

    // Le même objet re-rendu par la source est un NOUVEL objet : l'identité
    // est la valeur du champ, pas la référence
    layer._onFeatureClick({ ...PARIS });

    expect(last(a.commands)).toMatchObject({ where: '', whereKey: key });
    expect(last(b.commands)).toMatchObject({ where: '', whereKey: key });
    expect(ctx.activeFilters()).toHaveLength(0);
    expect(urlParam('commune')).toBeNull();
    expect(layer.getSelectedRecord()).toBeNull();
  });

  it('clic sur un autre objet : remplacement sous le même whereKey', async () => {
    const { a, ctx, layer } = annuaire();
    await settle();
    layer._onFeatureClick(PARIS);
    const key = last(a.commands)?.whereKey;
    const before = a.commands.length;

    layer._onFeatureClick(LYON);

    expect(a.commands).toHaveLength(before + 1);
    expect(last(a.commands)).toMatchObject({ where: 'commune:eq:Lyon', whereKey: key });
    expect(ctx.activeFilters()[0].displayValue()).toBe('Lyon');
    expect(urlParam('commune')).toBe('Lyon');
  });

  it('clear() du filtre (la croix du tag) : même chemin qu un second clic, événement selected=false', async () => {
    const { a, ctx, layer } = annuaire();
    await settle();
    const events: SelectDetail[] = [];
    document.body.addEventListener('dsfr-data-map-select', (e) => {
      events.push((e as CustomEvent<SelectDetail>).detail);
    });
    layer._onFeatureClick(PARIS);

    ctx.activeFilters()[0].clear();

    expect(last(a.commands)).toMatchObject({ where: '' });
    expect(ctx.activeFilters()).toHaveLength(0);
    expect(urlParam('commune')).toBeNull();
    expect(events.map((e) => e.selected)).toEqual([true, false]);
  });

  it('valeur initiale depuis l URL du contexte : filtre actif sans clic', async () => {
    window.history.replaceState(null, '', '?commune=Lyon');
    const { a, ctx } = annuaire();
    await settle();

    expect(last(a.commands)).toMatchObject({ where: 'commune:eq:Lyon' });
    expect(ctx.activeFilters()[0].displayValue()).toBe('Lyon');
  });

  it('displayLabel() retombe sur le champ sans label', async () => {
    const a = fakeSource('cible-a');
    unsubs.push(a.unsub);
    mount(`
      <dsfr-data-context id="ctx" sources="cible-a"></dsfr-data-context>
      <dsfr-data-map-layer id="couche" refine-on-click="commune" context="ctx"></dsfr-data-map-layer>
    `);
    await settle();
    const ctx = document.getElementById('ctx') as DsfrDataContext;
    (document.getElementById('couche') as DsfrDataMapLayer)._onFeatureClick(PARIS);
    expect(ctx.activeFilters()[0].displayLabel()).toBe('commune');
  });

  it('contexte déclaré APRÈS la couche : enregistrement à sa connexion', async () => {
    const a = fakeSource('cible-a');
    unsubs.push(a.unsub);
    mount(
      `<dsfr-data-map-layer id="couche" refine-on-click="commune" context="ctx"></dsfr-data-map-layer>`
    );
    await settle();
    // Contexte introuvable pour l'instant : erreur de config posée
    const layer = document.getElementById('couche') as DsfrDataMapLayer;
    expect(layer.hasAttribute('data-dsfr-config-error')).toBe(true);

    mount(`<dsfr-data-context id="ctx" sources="cible-a"></dsfr-data-context>`);
    await settle();
    expect(layer.hasAttribute('data-dsfr-config-error')).toBe(false);

    layer._onFeatureClick(PARIS);
    expect(last(a.commands)).toMatchObject({ where: 'commune:eq:Paris', origin: 'ctx' });
  });

  it('retrait de la couche du DOM : la clause est libérée sur les cibles', async () => {
    const { a, ctx, layer } = annuaire();
    await settle();
    layer._onFeatureClick(PARIS);
    const key = last(a.commands)?.whereKey;

    layer.remove();

    expect(last(a.commands)).toMatchObject({ where: '', whereKey: key });
    expect(ctx.activeFilters()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Chemin dégradé — refine-on-click sans context
// ---------------------------------------------------------------------------

describe('refine-on-click sans context — commande directe à source (#681)', () => {
  it('pousse un where eq sous le whereKey map-select-<id>, retiré au second clic', () => {
    const src = fakeSource('src-carte');
    unsubs.push(src.unsub);
    mount(
      `<dsfr-data-map-layer id="couche" source="src-carte" refine-on-click="commune"></dsfr-data-map-layer>`
    );
    const layer = document.getElementById('couche') as DsfrDataMapLayer;

    layer._onFeatureClick(PARIS);
    expect(last(src.commands)).toEqual({
      where: 'commune:eq:Paris',
      whereKey: 'map-select-couche',
      origin: 'couche',
    });

    layer._onFeatureClick(LYON);
    expect(last(src.commands)).toMatchObject({ where: 'commune:eq:Lyon' });

    layer._onFeatureClick(LYON);
    expect(last(src.commands)).toMatchObject({ where: '', whereKey: 'map-select-couche' });
  });

  it('traduit en ODSQL quand l adapter de la source l exige', () => {
    const src = fakeSource('src-ods', 'odsql');
    unsubs.push(src.unsub);
    mount(
      `<dsfr-data-map-layer id="couche" source="src-ods" refine-on-click="commune"></dsfr-data-map-layer>`
    );
    (document.getElementById('couche') as DsfrDataMapLayer)._onFeatureClick(PARIS);
    expect(last(src.commands)).toMatchObject({ where: 'commune = "Paris"' });
  });

  it('retrait de la couche : la clause directe est libérée', () => {
    const src = fakeSource('src-carte');
    unsubs.push(src.unsub);
    mount(
      `<dsfr-data-map-layer id="couche" source="src-carte" refine-on-click="commune"></dsfr-data-map-layer>`
    );
    const layer = document.getElementById('couche') as DsfrDataMapLayer;
    layer._onFeatureClick(PARIS);
    layer.remove();
    expect(last(src.commands)).toMatchObject({ where: '', whereKey: 'map-select-couche' });
  });
});
