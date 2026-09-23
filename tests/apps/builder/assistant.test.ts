/**
 * Assistant contextuel du builder graphique (#1017, ADR-143), sur le vrai
 * `index.html` et le vrai `main.ts`, avec le vrai panneau `<app-assistant>` :
 *
 * - « ajouter une série » sur un camembert (mono-série) : le prérequis
 *   `type-multi-series` est dit, et `builder.type` est montré ; une fois le
 *   type changé, « Continuer » passe au prérequis suivant — sans modèle ;
 * - « source vide » : la règle `builder/source-vide` produit un constat qui
 *   désigne `builder.source` ; pastille sur le bouton, « Me montrer » ouvre la
 *   section Source ;
 * - le volet Diagnostic « Demande à l'assistant » (sans quitter l'app) et
 *   route « Me montrer » vers le même `montrer()` ;
 * - Albert branché par `brancherAlbert` (post mocké, aucun réseau).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import '../../../packages/app-ui/src/app-assistant';
import {
  DIAGNOSTIC_HANDOFF_KEY,
  effacerSurbrillance,
  evaluerConstats,
  ID_REGION_REPERAGE,
  SOUS_TITRE_AVEC_MODELE,
  SOUS_TITRE_SANS_MODELE,
  trouverRepere,
  type AssistantPanelElement,
  type Constat,
  type MountDiagnosticOptions,
  type MountedDiagnostic,
  type Trace,
} from '@dsfr-data/shared';
import type { BuilderState } from '../../../apps/builder/src/state';
import {
  appelMontrer,
  cliquerMeMontrer,
  corpsIndex,
  poser,
  repereDe,
  surligne,
  transportAlbert,
} from '../assistant-commun';

/** Le volet Diagnostic factice : ce que main.ts lui passe, et des constats pilotés. */
const volet = vi.hoisted(() => ({
  options: null as MountDiagnosticOptions | null,
  constats: [] as Constat[],
  ouvertures: 0,
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
        panel: {
          toggle: () => {
            volet.ouvertures++;
          },
        } as unknown as MountedDiagnostic['panel'],
        constats: () => volet.constats,
        text: () => 'Diagnostic du pipeline\n  source → 0 ligne',
        destroy: () => {},
      };
    }),
  };
});

/** Trace d'un aperçu dont la source répond sans ligne. */
function traceSourceVide(): Trace {
  return {
    graph: {
      nodes: [
        {
          id: 'src',
          tag: 'dsfr-data-source',
          role: 'source',
          synthetic: false,
          ambiguous: false,
          upstream: [],
          attrs: {},
        },
      ],
      dangling: [],
    },
    events: [],
    states: { src: { status: 'loaded', rows: 0, emissions: 1 } },
    order: ['src'],
    sinceLastEventMs: null,
    lastEventAt: null,
    quiescent: true,
    delegation: {},
    reseau: [],
    console: [],
  };
}

describe('assistant contextuel du builder (#1017)', () => {
  let state: BuilderState;
  let panel: AssistantPanelElement;
  const fetchEspion = vi.fn(async () => new Response('{}'));

  beforeAll(async () => {
    vi.stubGlobal('fetch', fetchEspion);
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = corpsIndex('builder');
    await import('../../../apps/builder/src/main');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.waitFor(() => expect(document.querySelector('app-assistant')).not.toBeNull());
    state = (window as Window & { __BUILDER_STATE__?: BuilderState }).__BUILDER_STATE__!;
    panel = document.querySelector('app-assistant') as AssistantPanelElement;
    // Sans jeton serveur (`{}`) ni clé : le transport est résolu, rien n'est branché.
    await vi.waitFor(() => expect(fetchEspion).toHaveBeenCalled());
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
  });

  it('sans clé ni jeton serveur : guidage dans l’interface, pas « Albert »', () => {
    expect(panel.app).toBe('builder');
    expect(panel.sousTitre).toBe(SOUS_TITRE_SANS_MODELE);
    expect(panel.construire).toBe(true);
    expect(panel.diagnostic).toBe(true);
  });

  it('le bouton « Assistant » de la barre porte son repère et pilote le panneau', () => {
    const bouton = document.getElementById('assistant-btn')!;
    expect(bouton.getAttribute('data-repere')).toBe('builder.actions.assistant');
    expect(bouton.getAttribute('aria-controls')).toBe(panel.panneauId);
    bouton.click();
    expect(panel.open).toBe(true);
  });

  it('« ajouter une série » sur un camembert : prérequis type-multi-series, puis builder.type', async () => {
    state.chartType = 'pie';
    await poser(panel, 'ajouter une série');
    const reponse = panel.messages.find((m) => m.role === 'assistant');
    expect(reponse?.source).toBe('correspondance');
    expect(reponse?.reperes).toEqual(['builder.donnees.series.ajouter']);

    await vi.waitFor(() => expect(repereDe(surligne())).toBe('builder.type'));
    const prerequis = panel.messages.find((m) => m.continuer);
    expect(prerequis?.continuer).toBe('builder.donnees.series.ajouter');
    expect(prerequis?.texte).toContain("Ce type n'a qu'une série");

    // L'usager passe en barres, puis « Continuer » : le préalable suivant (la
    // source) est dit, le type n'est plus en cause.
    document.querySelector<HTMLElement>('.chart-type-btn[data-type="bar"]')!.click();
    expect(state.chartType).toBe('bar');
    effacerSurbrillance();
    panel.dispatchEvent(
      new CustomEvent('assistant-montrer', { detail: { repere: prerequis!.continuer } })
    );
    await vi.waitFor(() =>
      expect(panel.messages.at(-1)?.texte).toContain("Chargez d'abord une source")
    );
    expect(panel.messages.at(-1)?.continuer).toBe('builder.donnees.series.ajouter');
    expect(fetchEspion).not.toHaveBeenCalled();
  });

  it('sans source enregistrée : le prérequis source-chargee surligne l’état vide, visible', async () => {
    // localStorage vide : le select des sources est masqué, l'état vide le remplace.
    const choix = document.querySelector<HTMLElement>('[data-repere="builder.source.choix"]')!;
    expect(choix.closest<HTMLElement>('.fr-select-group')?.style.display).toBe('none');
    state.chartType = 'bar';
    panel.dispatchEvent(
      new CustomEvent('assistant-montrer', { detail: { repere: 'builder.donnees.champ-x' } })
    );
    await vi.waitFor(() => expect(repereDe(surligne())).toBe('builder.source.vide'));
    const vide = surligne()!;
    expect(vide.closest('#section-source')).not.toBeNull();
    expect(vide.querySelector('a[href*="sources"]')).not.toBeNull();
    expect(panel.messages.at(-1)?.texte).toContain("Chargez d'abord une source");
    // Le chemin annoncé est celui de l'élément montré, pas du select masqué.
    await vi.waitFor(() =>
      expect(document.getElementById(ID_REGION_REPERAGE)?.textContent).toContain(
        'Pas encore de données'
      )
    );
  });

  it('« source vide » : constat builder/source-vide, pastille, puis « Me montrer » ouvre la section Source', async () => {
    const { contexte, regles } = volet.options!.constats!;
    const constats = evaluerConstats(
      traceSourceVide(),
      typeof contexte === 'function' ? contexte() : contexte,
      regles
    );
    const vide = constats.find((c) => c.regle === 'builder/source-vide');
    expect(vide?.reperes).toEqual(['builder.source']);
    // La générique « aucune ligne » est dite mieux par la règle du builder.
    expect(constats.some((c) => c.regle === 'pipeline/zero-ligne')).toBe(false);

    volet.constats = constats;
    volet.options!.onConstats!(constats);
    const bouton = document.getElementById('assistant-btn')!;
    expect(bouton.dataset.count).toBe(String(constats.filter((c) => c.gravite !== 'info').length));

    document.getElementById('section-source')?.classList.add('collapsed');
    await cliquerMeMontrer(panel);
    await vi.waitFor(() => expect(repereDe(surligne())).toBe('builder.source'));
    expect(document.getElementById('section-source')?.classList.contains('collapsed')).toBe(false);

    // La même question, tapée : la correspondance locale mène à la source.
    await poser(panel, 'source vide');
    expect(panel.messages.find((m) => m.role === 'assistant')?.reperes?.[0]).toMatch(
      /^builder\.source/
    );

    volet.constats = [];
    volet.options!.onConstats!([]);
    expect(bouton.dataset.count).toBeUndefined();
  });

  it('volet Diagnostic : « Demander à l’assistant » ouvre le panneau sans quitter l’app', () => {
    expect(volet.options!.canSend).toBe(true);
    expect(volet.options!.envoi).toBe('demander');
    const adresse = window.location.href;
    panel.toggle(false);
    volet.options!.onSend!('texte du diagnostic');
    expect(panel.open).toBe(true);
    expect(window.location.href).toBe(adresse);
    expect(sessionStorage.getItem(DIAGNOSTIC_HANDOFF_KEY)).toBeNull();
  });

  it('volet Diagnostic : « Me montrer » passe par le même montrer()', async () => {
    volet.options!.onMontrer!('builder.apparence.palette', {} as Constat);
    await vi.waitFor(() =>
      expect(surligne()?.getAttribute('data-repere')).toBe('builder.apparence.palette')
    );
  });

  it('les suggestions de l’état vide mènent chacune à un repère, sans modèle', async () => {
    const { suggestionsBuilder } = await import('../../../apps/builder/src/assistant/index');
    const { REGISTRE } = await import('../../../apps/builder/src/assistant/reperes.generated');
    const etats: Partial<BuilderState>[] = [
      { fields: [] },
      { fields: [{ name: 'a', type: 'string', sample: 'x' }], chartType: 'bar' },
      { fields: [{ name: 'a', type: 'string', sample: 'x' }], chartType: 'pie' },
    ];
    for (const extra of etats) {
      const suggestions = suggestionsBuilder({ ...state, ...extra });
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.length).toBeLessThanOrEqual(3);
      for (const s of suggestions) {
        expect(trouverRepere(REGISTRE, s.texte).statut, s.texte).toBe('trouve');
      }
    }
  });

  it('Albert branché (post mocké) : une question hors registre montre le repère choisi', async () => {
    const { monterAssistantBuilder } = await import('../../../apps/builder/src/assistant/index');
    const { creerAdaptateurBuilder } =
      await import('../../../apps/builder/src/assistant/adaptateur');
    const post = vi.fn(async () => appelMontrer('builder.apparence.palette'));
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const albert = monterAssistantBuilder({
      adaptateur: creerAdaptateurBuilder(),
      diagnostic: null,
      transport: transportAlbert(post),
      host: hote,
    });
    await vi.waitFor(() => expect(albert.panel.sousTitre).toBe(SOUS_TITRE_AVEC_MODELE));
    await albert.poser('bonjour, par où commencer ?');
    expect(post).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(surligne()?.getAttribute('data-repere')).toBe('builder.apparence.palette')
    );
    expect(fetchEspion).not.toHaveBeenCalled();
    albert.destroy();
    hote.remove();
  });
});
