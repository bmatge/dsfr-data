/**
 * Assistant contextuel de la carto (#1016, ADR-143), sur le vrai `index.html`
 * et le vrai `main.ts`, avec le vrai panneau `<app-assistant>` :
 *
 * - « afficher les POI dans une fiche » sans couche active : le prérequis est
 *   montré, puis « Continuer » révèle « Comportement au clic » — par la seule
 *   correspondance locale, sans AUCUNE requête réseau ;
 * - un constat « lat/lon inversées » : pastille sur le bouton, « Me montrer »
 *   dans le panneau, `carto.couches.lat` surligné ;
 * - « Demander à l'assistant » du volet Diagnostic ouvre le panneau, sans
 *   quitter l'app ; « Me montrer » du volet passe par le même `montrer()` ;
 * - passation « Construire pour moi » vers le Studio ;
 * - les suggestions de l'état vide mènent chacune à un repère.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import '../../../packages/app-ui/src/app-assistant.js';
import {
  CLASSE_REPERE_MONTRE,
  DIAGNOSTIC_HANDOFF_KEY,
  effacerSurbrillance,
  trouverRepere,
  type AssistantPanelElement,
  type Constat,
  type MountDiagnosticOptions,
  type MountedDiagnostic,
} from '@dsfr-data/shared';
import type { CartoState, LayerConfig } from '../../../apps/builder-carto/src/state';

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
        text: () => 'Diagnostic du pipeline\n  couche-1 → 12 lignes',
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

const LAT_LON_INVERSEES: Constat = {
  id: 'carte/lat-lon-inverses@layer-1',
  regle: 'carte/lat-lon-inverses',
  gravite: 'erreur',
  titre: 'layer-1 : latitude et longitude semblent inversées',
  explication: 'Les valeurs lues comme latitude ressemblent à des longitudes, et inversement.',
  reperes: ['carto.couches.lat', 'carto.couches.lon'],
  preuve: 'lat-field="lat" : 2.35, lon-field="lon" : 48.85',
  etape: 'layer-1',
};

describe('assistant contextuel de la carto (#1016)', () => {
  let state: CartoState;
  let createLayer: () => LayerConfig;
  let renderAll: () => void;
  let panel: AssistantPanelElement;
  const fetchEspion = vi.fn(async () => new Response('{}'));

  beforeAll(async () => {
    vi.stubGlobal('fetch', fetchEspion);
    localStorage.clear();
    sessionStorage.clear();
    document.body.className = 'carto-app';
    document.body.innerHTML = corpsIndex();
    const main = await import('../../../apps/builder-carto/src/main');
    renderAll = main.renderAll;
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.waitFor(() => {
      expect(document.querySelector('app-assistant')).not.toBeNull();
      expect(document.querySelector('#layers-list [data-layer-id]')).not.toBeNull();
    });
    createLayer = (await import('../../../apps/builder-carto/src/state')).createLayer;
    state = (window as Window & { __BUILDER_CARTO_STATE__?: CartoState }).__BUILDER_CARTO_STATE__!;
    panel = document.querySelector('app-assistant') as AssistantPanelElement;
    fetchEspion.mockClear();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    effacerSurbrillance();
    panel.toggle(false);
    panel.dispatchEvent(new CustomEvent('assistant-nouvelle'));
    panel.toggle(false);
  });

  function coucheDePoints(extra: Partial<LayerConfig> = {}): LayerConfig {
    const l = createLayer();
    Object.assign(l, {
      id: 'layer-1',
      name: 'Écoles',
      source: { id: 's', name: 'Écoles', type: 'api', apiUrl: 'https://exemple.fr/data' },
      latField: 'lat',
      lonField: 'lon',
      ...extra,
    });
    state.layers = [l];
    state.activeLayerId = l.id;
    renderAll();
    return l;
  }

  async function poser(question: string): Promise<void> {
    const avant = panel.messages.length;
    panel.dispatchEvent(new CustomEvent('assistant-envoyer', { detail: { question } }));
    await vi.waitFor(() => expect(panel.messages.length).toBeGreaterThan(avant + 1));
  }

  const surligne = (): HTMLElement | null =>
    document.querySelector<HTMLElement>(`.${CLASSE_REPERE_MONTRE}`);

  it('sans modèle : le panneau ne se présente pas comme Albert', () => {
    expect(panel.app).toBe('builder-carto');
    expect(panel.sousTitre).toBe('Guidage dans l’interface');
    expect(panel.pied).toBe('Réponses tirées de l’interface, sans IA');
    expect(panel.construire).toBe(true);
    expect(panel.diagnostic).toBe(true);
  });

  it('le bouton « Assistant » de la barre porte son repère et pilote le panneau', () => {
    const bouton = document.getElementById('assistant-btn')!;
    expect(bouton.getAttribute('data-repere')).toBe('carto.actions.assistant');
    expect(bouton.getAttribute('aria-controls')).toBe(panel.panneauId);
    bouton.click();
    expect(panel.open).toBe(true);
    expect(bouton.getAttribute('aria-expanded')).toBe('true');
  });

  it('« afficher les POI dans une fiche » sans couche : prérequis montré, puis popup-mode révélé, zéro requête', async () => {
    coucheDePoints();
    state.activeLayerId = 'aucune';
    renderAll();

    await poser('afficher les POI dans une fiche');
    const reponse = panel.messages.find((m) => m.role === 'assistant');
    expect(reponse?.source).toBe('correspondance');
    expect(reponse?.reperes).toEqual(['carto.elements.clic.popup-mode']);
    // Le prérequis : la liste des couches est montrée, avec un « Continuer ».
    await vi.waitFor(() => expect(surligne()?.id).toBe('layers-list'));
    const prerequis = panel.messages.find((m) => m.continuer);
    expect(prerequis?.continuer).toBe('carto.elements.clic.popup-mode');
    expect(prerequis?.texte).toContain('sélectionnez une couche');

    // L'usager sélectionne la couche, puis « Continuer ».
    document.querySelector<HTMLElement>('#layers-list [data-layer-id="layer-1"]')!.click();
    panel.dispatchEvent(
      new CustomEvent('assistant-montrer', { detail: { repere: prerequis!.continuer } })
    );
    await vi.waitFor(() => expect(surligne()?.id).toBe('layer-popup-mode'));

    expect(fetchEspion).not.toHaveBeenCalled();
  });

  it('constat « lat/lon inversées » : pastille, puis « Me montrer » désigne la latitude', async () => {
    coucheDePoints();
    volet.constats = [LAT_LON_INVERSEES];
    volet.options!.onConstats!(volet.constats);

    const bouton = document.getElementById('assistant-btn')!;
    expect(bouton.dataset.count).toBe('1');
    expect(bouton.getAttribute('aria-label')).toBe('Assistant, 1 constat à corriger');

    panel.toggle(true);
    await (panel as AssistantPanelElement & { updateComplete: Promise<boolean> }).updateComplete;
    const meMontrer = [
      ...panel.querySelectorAll<HTMLButtonElement>('.assistant-constats button'),
    ].find((b) => b.textContent?.trim() === 'Me montrer')!;
    meMontrer.click();
    await vi.waitFor(() =>
      expect(surligne()?.getAttribute('data-repere')).toBe('carto.couches.lat')
    );

    volet.constats = [];
    volet.options!.onConstats!(volet.constats);
    expect(bouton.dataset.count).toBeUndefined();
    expect(fetchEspion).not.toHaveBeenCalled();
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
    coucheDePoints();
    volet.options!.onMontrer!('carto.couches.lon', LAT_LON_INVERSEES);
    await vi.waitFor(() =>
      expect(surligne()?.getAttribute('data-repere')).toBe('carto.couches.lon')
    );
  });

  it('« Voir le détail dans le Diagnostic » ouvre le volet', () => {
    const avant = volet.ouvertures;
    panel.dispatchEvent(new CustomEvent('assistant-diagnostic'));
    expect(volet.ouvertures).toBe(avant + 1);
  });

  it('les suggestions de l’état vide mènent chacune à un repère, sans modèle', async () => {
    const { suggestionsCarto } = await import('../../../apps/builder-carto/src/assistant/index');
    const { REGISTRE } =
      await import('../../../apps/builder-carto/src/assistant/reperes.generated');
    const etats: Partial<LayerConfig>[] = [{ source: null }, { type: 'geoshape' }, {}];
    for (const extra of etats) {
      coucheDePoints(extra);
      const suggestions = suggestionsCarto(state);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.length).toBeLessThanOrEqual(3);
      for (const s of suggestions) {
        expect(trouverRepere(REGISTRE, s.texte).statut, s.texte).toBe('trouve');
      }
    }
  });
});

describe('passation « Construire pour moi » vers le Studio (#1016)', () => {
  it('dépose le diagnostic sous un en-tête, puis ouvre le Studio', async () => {
    const { construireDansLeStudio, ENTETE_PASSATION_STUDIO } =
      await import('../../../apps/builder-carto/src/assistant/index');
    sessionStorage.clear();
    const cibles: string[] = [];
    construireDansLeStudio('Diagnostic du pipeline', (href) => cibles.push(href));
    expect(sessionStorage.getItem(DIAGNOSTIC_HANDOFF_KEY)).toBe(
      `${ENTETE_PASSATION_STUDIO}\n\nDiagnostic du pipeline`
    );
    expect(cibles).toHaveLength(1);
    expect(cibles[0]).toContain('apps/studio/index.html');
    expect(cibles[0]).toContain('from=builder-carto');
    sessionStorage.clear();
  });
});
