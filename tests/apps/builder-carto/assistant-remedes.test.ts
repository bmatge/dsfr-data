/**
 * L'assistant propose les remèdes d'un rendu tronqué (#1021, lot 2), sur le
 * vrai `index.html`, le vrai `main.ts` et le vrai panneau `<app-assistant>`.
 *
 * Le constat n'est PAS écrit à la main : il sort de la vraie règle
 * `carte/jeu-tronque`, évaluée sur la trace d'un gros jeu tel que le builder
 * le charge depuis #1020 (source `limit` = `max-items`, `meta.truncated`).
 * Chemin vérifié : constat → trois remèdes en boutons → chacun désigne son
 * repère, « Composer par échelle » l'encart du lot 1 — et, sans champ
 * territoire, le prérequis qui mène à la liste des couches.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import '../../../packages/app-ui/src/app-assistant.js';
import {
  CLASSE_REPERE_MONTRE,
  effacerSurbrillance,
  evaluerConstats,
  REGLES_BUILDER_CARTO,
  type AssistantPanelElement,
  type Constat,
  type MountDiagnosticOptions,
  type MountedDiagnostic,
  type StageNode,
  type Trace,
} from '@dsfr-data/shared';
import type { CartoState, LayerConfig } from '../../../apps/builder-carto/src/state';

const volet = vi.hoisted(() => ({
  options: null as MountDiagnosticOptions | null,
  constats: [] as Constat[],
}));

vi.mock('@dsfr-data/shared/debug/installer-journal', () => ({}));
vi.mock('@dsfr-data/shared', async (importOriginal) => {
  const reel = await importOriginal<Record<string, unknown>>();
  return {
    ...reel,
    initAuth: vi.fn(async () => {}),
    injectTourStyles: vi.fn(),
    startTourIfFirstVisit: vi.fn(),
    startTour: vi.fn(),
    mountDiagnosticPanel: vi.fn((options: MountDiagnosticOptions): Partial<MountedDiagnostic> => {
      volet.options = options;
      return {
        panel: { toggle: () => {} } as unknown as MountedDiagnostic['panel'],
        constats: () => volet.constats,
        text: () => '',
        destroy: () => {},
      };
    }),
  };
});

const RACINE = resolve(import.meta.dirname, '../../..');

function corpsIndex(): string {
  const html = readFileSync(join(RACINE, 'apps/builder-carto/index.html'), 'utf-8');
  const ouverture = html.indexOf('>', html.indexOf('<body')) + 1;
  let corps = html.slice(ouverture, html.indexOf('</body>'));
  for (let debut = corps.indexOf('<script'); debut !== -1; debut = corps.indexOf('<script')) {
    const fin = corps.indexOf('</script>', debut);
    corps = corps.slice(0, debut) + corps.slice(fin + '</script>'.length);
  }
  return corps;
}

/** Trace d'un gros jeu : 1 000 lignes livrées sur 34 826, la source coupe à limit. */
function traceTronquee(): Trace {
  const noeud = (id: string, tag: string, extra: Partial<StageNode>): StageNode => ({
    id,
    tag,
    role: tag === 'dsfr-data-source' ? 'source' : 'display',
    synthetic: false,
    ambiguous: false,
    upstream: [],
    attrs: {},
    ...extra,
  });
  const nodes = [
    noeud('layer-1-src', 'dsfr-data-source', { attrs: { 'api-type': 'tabular', limit: '1000' } }),
    noeud('layer-1', 'dsfr-data-map-layer', {
      upstream: ['layer-1-src'],
      attrs: { type: 'marker', 'lat-field': 'lat', 'lon-field': 'lon', 'max-items': '1000' },
      renderedCount: 1000,
    }),
  ];
  return {
    graph: { nodes, dangling: [] },
    events: [],
    states: {
      'layer-1-src': {
        status: 'loaded',
        rows: 1000,
        fields: [
          { name: 'lat', type: 'number', sample: '48.85' },
          { name: 'lon', type: 'number', sample: '2.35' },
          { name: 'Code du département', type: 'string', sample: '75' },
        ],
        sample: [{ lat: 48.85, lon: 2.35, 'Code du département': '75' }],
        emissions: 1,
        meta: { page: 1, pageSize: 1000, total: 34826, truncated: true },
      },
      'layer-1': { status: 'idle', emissions: 0 },
    },
    order: nodes.map((n) => n.id),
    sinceLastEventMs: null,
    lastEventAt: null,
    quiescent: true,
    delegation: {},
    reseau: [],
    console: [],
  };
}

describe('assistant carto : les remèdes d’un rendu tronqué (#1021)', () => {
  let state: CartoState;
  let createLayer: () => LayerConfig;
  let panel: AssistantPanelElement & { updateComplete: Promise<boolean> };
  const fetchEspion = vi.fn(async () => new Response('{}'));

  beforeAll(async () => {
    vi.stubGlobal('fetch', fetchEspion);
    localStorage.clear();
    sessionStorage.clear();
    document.body.className = 'carto-app';
    document.body.innerHTML = corpsIndex();
    await import('../../../apps/builder-carto/src/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.waitFor(() => {
      expect(document.querySelector('app-assistant')).not.toBeNull();
      expect(document.querySelector('#layers-list [data-layer-id]')).not.toBeNull();
    });
    createLayer = (await import('../../../apps/builder-carto/src/state')).createLayer;
    state = (window as Window & { __BUILDER_CARTO_STATE__?: CartoState }).__BUILDER_CARTO_STATE__!;
    panel = document.querySelector('app-assistant') as typeof panel;
    fetchEspion.mockClear();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    effacerSurbrillance();
    panel.dispatchEvent(new CustomEvent('assistant-nouvelle'));
    panel.toggle(false);
    volet.constats = [];
    volet.options!.onConstats!(volet.constats);
  });

  /** Couche de points Tabular ; `territoire` : le champ détecté par l'analyse. */
  function preparer(territoire: LayerConfig['territoire']): LayerConfig {
    const l = createLayer();
    Object.assign(l, {
      id: 'layer-1',
      name: 'Élus',
      source: {
        id: 's',
        name: 'Élus',
        type: 'api',
        apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc/data/',
      },
      latField: 'lat',
      lonField: 'lon',
      maxItems: 1000,
      territoire,
    });
    state.layers = [l];
    state.activeLayerId = l.id;
    document.querySelector<HTMLElement>('#layers-list [data-layer-id]')!.click();
    document.querySelector<HTMLElement>(`#layers-list [data-layer-id="${l.id}"]`)!.click();
    expect(state.activeLayerId).toBe(l.id);
    return l;
  }

  /** Le total rapporté par la couche rendue dans l'aperçu (#1020) : l'encart en dépend. */
  function rapporterTotal(total: number): void {
    const couche = document.createElement('dsfr-data-map-layer');
    couche.setAttribute('source', 'layer-1');
    document.getElementById('map-canvas')!.appendChild(couche);
    couche.dispatchEvent(
      new CustomEvent('dsfr-data-map-layer-render', { bubbles: true, detail: { total } })
    );
    couche.remove();
  }

  /** Pose les constats de la vraie règle, ouvre le panneau, rend ses boutons de remède. */
  async function remedesAffiches(): Promise<HTMLButtonElement[]> {
    volet.constats = evaluerConstats(
      traceTronquee(),
      { app: 'builder-carto', etat: state },
      REGLES_BUILDER_CARTO
    );
    volet.options!.onConstats!(volet.constats);
    panel.toggle(true);
    await panel.updateComplete;
    return [...panel.querySelectorAll<HTMLButtonElement>('.assistant-constats [data-remede]')];
  }

  const surligne = (): HTMLElement | null =>
    document.querySelector<HTMLElement>(`.${CLASSE_REPERE_MONTRE}`);

  it('le constat de la règle : un seul, « jeu tronqué », qui remplace la générique', () => {
    const constats = evaluerConstats(
      traceTronquee(),
      { app: 'builder-carto' },
      REGLES_BUILDER_CARTO
    );
    expect(constats.map((c) => c.id)).toEqual(['carte/jeu-tronque@layer-1']);
  });

  it('constat → trois remèdes en boutons, décrits par le titre du constat', async () => {
    preparer({ champ: 'Code du département', niveau: 'departement' });
    const boutons = await remedesAffiches();
    expect(boutons.map((b) => b.textContent?.trim())).toEqual([
      'Composer par échelle',
      'Filtrer en amont',
      'Relever le plafond',
    ]);
    expect(boutons.map((b) => b.dataset.remede)).toEqual([
      'carto.couches.composition.composer',
      'carto.elements.avancees.filtre',
      'carto.elements.avancees.max-items',
    ]);
    const titre = document.getElementById(boutons[0].getAttribute('aria-describedby')!);
    expect(titre?.textContent).toContain('la carte ne montre qu’une partie du jeu');
    // Les remèdes remplacent « Me montrer » pour ce constat : pas de doublon.
    const meMontrer = [
      ...panel.querySelectorAll<HTMLButtonElement>('.assistant-constats button'),
    ].filter((b) => b.textContent?.trim() === 'Me montrer');
    expect(meMontrer).toEqual([]);
    expect(document.getElementById('assistant-btn')!.dataset.count).toBe('1');
  });

  it('« Composer par échelle » désigne le bouton de l’encart du lot 1', async () => {
    preparer({ champ: 'Code du département', niveau: 'departement' });
    rapporterTotal(34826);
    const [composer] = await remedesAffiches();
    composer.click();
    await vi.waitFor(() =>
      expect(surligne()?.getAttribute('data-repere')).toBe('carto.couches.composition.composer')
    );
    expect(surligne()?.closest('[data-zone="carto.couches.composition"]')).not.toBeNull();
    // Montrer n'est pas composer : aucune couche ajoutée, aucune requête.
    expect(state.layers).toHaveLength(1);
    expect(fetchEspion).not.toHaveBeenCalled();
  });

  it('« Filtrer en amont » et « Relever le plafond » désignent leurs champs', async () => {
    preparer({ champ: 'Code du département', niveau: 'departement' });
    const [, filtrer, plafond] = await remedesAffiches();
    filtrer.click();
    await vi.waitFor(() => expect(surligne()?.id).toBe('layer-filter'));
    effacerSurbrillance();
    plafond.click();
    await vi.waitFor(() => expect(surligne()?.id).toBe('layer-max-items'));
  });

  it('sans champ territoire : le prérequis mène à la liste des couches, avec « Continuer »', async () => {
    preparer(null);
    rapporterTotal(34826);
    const [composer] = await remedesAffiches();
    composer.click();
    await vi.waitFor(() => expect(surligne()?.id).toBe('layers-list'));
    const prerequis = panel.messages.find((m) => m.continuer);
    expect(prerequis?.continuer).toBe('carto.couches.composition.composer');
    expect(prerequis?.texte).toContain('code département ou région');
  });
});
