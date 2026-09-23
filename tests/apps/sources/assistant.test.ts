/**
 * Assistant contextuel des Sources (#1018, ADR-143) : GUIDAGE SEUL. La page
 * n'a pas de volet Diagnostic (ARCHITECTURE §3.8) : ni constats, ni pastille,
 * ni lien vers le Diagnostic, ni passation vers le Studio. Sur le vrai
 * `index.html`, avec le vrai adaptateur : phrase → repère (prérequis compris),
 * Albert branché (post mocké) ou absent.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../../packages/app-ui/src/app-assistant';
import {
  effacerSurbrillance,
  SOUS_TITRE_AVEC_MODELE,
  SOUS_TITRE_SANS_MODELE,
  trouverRepere,
  type MountedAssistant,
  type Source,
} from '@dsfr-data/shared';
import { creerAdaptateurSources } from '../../../apps/sources/src/assistant/adaptateur';
import {
  monterAssistantSources,
  suggestionsSources,
} from '../../../apps/sources/src/assistant/index';
import { REGISTRE } from '../../../apps/sources/src/assistant/reperes.generated';
import { createInitialState, state } from '../../../apps/sources/src/state';
import {
  appelMontrer,
  corpsIndex,
  poser,
  repereDe,
  surligne,
  transportAlbert,
  transportAucun,
} from '../assistant-commun';

vi.mock('@dsfr-data/shared', async (importOriginal) => {
  const reel = await importOriginal<Record<string, unknown>>();
  return { ...reel, toastWarning: vi.fn() };
});

const source = (id: string): Source =>
  ({ id, name: id, type: 'manual', data: [{ a: 1 }], recordCount: 1 }) as Source;

let etatInitial: string;
let assistant: MountedAssistant | null = null;

beforeAll(() => {
  etatInitial = JSON.stringify(createInitialState());
});

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = corpsIndex('sources');
  Object.assign(state, JSON.parse(etatInitial));
});

afterEach(() => {
  effacerSurbrillance();
  assistant?.destroy();
  assistant = null;
  document.body.innerHTML = '';
});

describe('assistant contextuel des Sources (#1018)', () => {
  it('guidage seul : ni Diagnostic, ni constats, ni Studio ; bouton relié au panneau', () => {
    assistant = monterAssistantSources({
      adaptateur: creerAdaptateurSources(),
      transport: transportAucun,
    });
    expect(assistant.panel.sousTitre).toBe(SOUS_TITRE_SANS_MODELE);
    expect(assistant.panel.diagnostic).toBe(false);
    expect(assistant.panel.construire).toBe(false);
    expect(assistant.panel.constats).toEqual([]);
    const bouton = document.getElementById('assistant-btn')!;
    expect(bouton.getAttribute('data-repere')).toBe('sources.actions.assistant');
    expect(bouton.getAttribute('aria-controls')).toBe(assistant.panel.panneauId);
    expect(bouton.dataset.count).toBeUndefined();
    bouton.click();
    expect(assistant.panel.open).toBe(true);
  });

  it('« Connecter une API » montre « Nouvelle connexion »', async () => {
    assistant = monterAssistantSources({
      adaptateur: creerAdaptateurSources(),
      transport: transportAucun,
    });
    await poser(assistant.panel, 'Connecter une API');
    await vi.waitFor(() => expect(repereDe(surligne())).toBe('sources.actions.nouvelle-connexion'));
  });

  it('« Saisir des données » montre la création d’une source manuelle', async () => {
    state.sources = [source('a'), source('b')];
    assistant = monterAssistantSources({
      adaptateur: creerAdaptateurSources(),
      transport: transportAucun,
    });
    await poser(assistant.panel, 'Saisir des données');
    await vi.waitFor(() => expect(repereDe(surligne())).toBe('sources.locaux.creer'));
  });

  it('Albert branché (post mocké) : une question hors registre montre le repère choisi', async () => {
    const post = vi.fn(async () => appelMontrer('sources.actions.exporter'));
    assistant = monterAssistantSources({
      adaptateur: creerAdaptateurSources(),
      transport: transportAlbert(post),
    });
    await vi.waitFor(() => expect(assistant!.panel.sousTitre).toBe(SOUS_TITRE_AVEC_MODELE));
    await assistant.poser('bonjour, par où commencer ?');
    expect(post).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(repereDe(surligne())).toBe('sources.actions.exporter'));
  });

  it('les suggestions de l’état vide mènent chacune à un repère, sans modèle', () => {
    for (const sources of [[], [source('a'), source('b')]]) {
      const suggestions = suggestionsSources({
        app: { ...state, sources },
        apercuOuvert: false,
      });
      expect(suggestions.length).toBeLessThanOrEqual(3);
      for (const s of suggestions) {
        expect(trouverRepere(REGISTRE, s.texte).statut, s.texte).toBe('trouve');
      }
    }
  });
});
