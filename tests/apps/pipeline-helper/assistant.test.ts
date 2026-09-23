/**
 * Assistant contextuel du Pipeline (#1018, ADR-143), sur le vrai `index.html`
 * et un vrai éditeur Rete, avec le vrai adaptateur et le vrai panneau
 * `<app-assistant>` : phrase → repère (prérequis compris), constat → « Me
 * montrer », Albert branché (post mocké) ou absent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../../packages/app-ui/src/app-assistant';
import '../../../packages/app-ui/src/app-menu';
import {
  effacerSurbrillance,
  SOUS_TITRE_AVEC_MODELE,
  SOUS_TITRE_SANS_MODELE,
  trouverRepere,
  type Constat,
  type MountedAssistant,
  type MountedDiagnostic,
} from '@dsfr-data/shared';
import { PipelineEditor } from '../../../apps/pipeline-helper/src/editor';
import { creerAdaptateurPipeline } from '../../../apps/pipeline-helper/src/assistant/adaptateur';
import {
  monterAssistantPipeline,
  suggestionsPipeline,
} from '../../../apps/pipeline-helper/src/assistant/index';
import { REGISTRE } from '../../../apps/pipeline-helper/src/assistant/reperes.generated';
import {
  appelMontrer,
  cliquerMeMontrer,
  constatSur,
  corpsIndex,
  poser,
  repereDe,
  surligne,
  transportAlbert,
  transportAucun,
} from '../assistant-commun';

let editeur: PipelineEditor;
let assistant: MountedAssistant | null = null;
let constats: Constat[] = [];

const diagnostic = {
  panel: { toggle: () => {} },
  constats: () => constats,
  text: () => 'Diagnostic du pipeline',
} as unknown as MountedDiagnostic;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = corpsIndex('pipeline-helper');
  editeur = new PipelineEditor(document.getElementById('rete-container')!);
  constats = [];
});

afterEach(() => {
  effacerSurbrillance();
  assistant?.destroy();
  assistant = null;
  editeur.destroy();
  document.body.innerHTML = '';
});

function monter(transport = transportAucun): MountedAssistant {
  assistant = monterAssistantPipeline({
    adaptateur: creerAdaptateurPipeline(editeur),
    diagnostic,
    transport,
  });
  return assistant;
}

describe('assistant contextuel du Pipeline (#1018)', () => {
  it('sans modèle : guidage local, bouton de la barre relié au panneau', () => {
    const a = monter();
    expect(a.panel.sousTitre).toBe(SOUS_TITRE_SANS_MODELE);
    const bouton = document.getElementById('assistant-btn')!;
    expect(bouton.getAttribute('data-repere')).toBe('pipeline.actions.assistant');
    expect(bouton.getAttribute('aria-controls')).toBe(a.panel.panneauId);
  });

  it('« Grouper par » sans étape Requêter : le prérequis montre le bouton qui l’ajoute', async () => {
    await editeur.addNode('source');
    const a = monter();
    await poser(a.panel, 'Grouper par');
    expect(a.panel.messages.find((m) => m.role === 'assistant')?.reperes).toEqual([
      'pipeline.query.group-by',
    ]);
    await vi.waitFor(() => expect(repereDe(surligne())).toBe('pipeline.actions.ajouter-requete'));
    expect(a.panel.messages.at(-1)?.continuer).toBe('pipeline.query.group-by');
  });

  it('« Ajouter une source » montre le bouton de la barre', async () => {
    const a = monter();
    await poser(a.panel, 'Ajouter une source');
    await vi.waitFor(() => expect(repereDe(surligne())).toBe('pipeline.actions.ajouter-source'));
  });

  it('constat : pastille sur le bouton, puis « Me montrer » désigne le réglage', async () => {
    const a = monter();
    constats = [constatSur('pipeline.actions.executer')];
    a.rafraichirConstats();
    expect(document.getElementById('assistant-btn')!.dataset.count).toBe('1');
    await cliquerMeMontrer(a.panel);
    await vi.waitFor(() => expect(repereDe(surligne())).toBe('pipeline.actions.executer'));
  });

  it('Albert branché (post mocké) : une question hors registre montre le repère choisi', async () => {
    const post = vi.fn(async () => appelMontrer('pipeline.actions.reorganiser'));
    const a = monter(transportAlbert(post));
    await vi.waitFor(() => expect(a.panel.sousTitre).toBe(SOUS_TITRE_AVEC_MODELE));
    await a.poser('bonjour, par où commencer ?');
    expect(post).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(repereDe(surligne())).toBe('pipeline.actions.reorganiser'));
  });

  it('les suggestions de l’état vide mènent chacune à un repère, sans modèle', () => {
    for (const types of [[], ['source'], ['source', 'query']]) {
      const suggestions = suggestionsPipeline({ types });
      expect(suggestions.length).toBeLessThanOrEqual(3);
      for (const s of suggestions) {
        expect(trouverRepere(REGISTRE, s.texte).statut, s.texte).toBe('trouve');
      }
    }
  });
});
