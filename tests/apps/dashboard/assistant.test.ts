/**
 * Assistant contextuel du tableau de bord (#1018, ADR-143), sur le vrai
 * `index.html`, avec le vrai adaptateur et le vrai panneau `<app-assistant>` :
 * phrase → repère (prérequis compris), constat → « Me montrer », Albert
 * branché (post mocké) ou absent (guidage local).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../../packages/app-ui/src/app-assistant';
import {
  effacerSurbrillance,
  SOUS_TITRE_AVEC_MODELE,
  SOUS_TITRE_SANS_MODELE,
  trouverRepere,
  type Constat,
  type MountedAssistant,
  type MountedDiagnostic,
} from '@dsfr-data/shared';
import { creerAdaptateurDashboard } from '../../../apps/dashboard/src/assistant/adaptateur';
import {
  monterAssistantDashboard,
  suggestionsDashboard,
} from '../../../apps/dashboard/src/assistant/index';
import { REGISTRE } from '../../../apps/dashboard/src/assistant/reperes.generated';
import { createEmptyDashboard, createWidget, state } from '../../../apps/dashboard/src/state';
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

let assistant: MountedAssistant | null = null;
let constats: Constat[] = [];
let ouvertures = 0;

const diagnostic = {
  panel: {
    toggle: () => {
      ouvertures++;
    },
  },
  constats: () => constats,
  text: () => 'Diagnostic du pipeline',
} as unknown as MountedDiagnostic;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = corpsIndex('dashboard');
  state.dashboard = createEmptyDashboard();
  state.selectedWidget = null;
  constats = [];
});

afterEach(() => {
  effacerSurbrillance();
  assistant?.destroy();
  assistant = null;
  document.body.innerHTML = '';
});

describe('assistant contextuel du tableau de bord (#1018)', () => {
  it('sans modèle : guidage local, bouton de la barre relié au panneau', async () => {
    assistant = monterAssistantDashboard({
      adaptateur: creerAdaptateurDashboard(),
      diagnostic,
      transport: transportAucun,
    });
    await Promise.resolve();
    expect(assistant.panel.sousTitre).toBe(SOUS_TITRE_SANS_MODELE);
    const bouton = document.getElementById('assistant-btn')!;
    expect(bouton.getAttribute('data-repere')).toBe('dashboard.actions.assistant');
    expect(bouton.getAttribute('aria-controls')).toBe(assistant.panel.panneauId);
  });

  it('« Format du KPI » sans widget KPI : le prérequis montre la bibliothèque', async () => {
    assistant = monterAssistantDashboard({
      adaptateur: creerAdaptateurDashboard(),
      diagnostic,
      transport: transportAucun,
    });
    await poser(assistant.panel, 'Format du KPI');
    expect(assistant.panel.messages.find((m) => m.role === 'assistant')?.reperes).toEqual([
      'dashboard.widget.kpi.format',
    ]);
    await vi.waitFor(() => expect(repereDe(surligne())).toBe('dashboard.bibliotheque.kpi'));
    expect(assistant.panel.messages.at(-1)?.continuer).toBe('dashboard.widget.kpi.format');
  });

  it('« Ajouter une ligne » : le contrôle du canevas est montré', async () => {
    assistant = monterAssistantDashboard({
      adaptateur: creerAdaptateurDashboard(),
      diagnostic,
      transport: transportAucun,
    });
    await poser(assistant.panel, 'Ajouter une ligne');
    await vi.waitFor(() => expect(repereDe(surligne())).toBe('dashboard.canevas.ajouter-ligne'));
  });

  it('constat : pastille sur le bouton, puis « Me montrer » désigne le réglage', async () => {
    assistant = monterAssistantDashboard({
      adaptateur: creerAdaptateurDashboard(),
      diagnostic,
      transport: transportAucun,
    });
    constats = [constatSur('dashboard.grille.colonnes')];
    assistant.rafraichirConstats();
    expect(document.getElementById('assistant-btn')!.dataset.count).toBe('1');
    await cliquerMeMontrer(assistant.panel);
    await vi.waitFor(() => expect(repereDe(surligne())).toBe('dashboard.grille.colonnes'));
    assistant.panel.dispatchEvent(new CustomEvent('assistant-diagnostic'));
    expect(ouvertures).toBeGreaterThan(0);
  });

  it('Albert branché (post mocké) : une question hors registre montre le repère choisi', async () => {
    const post = vi.fn(async () => appelMontrer('dashboard.canevas.titre'));
    assistant = monterAssistantDashboard({
      adaptateur: creerAdaptateurDashboard(),
      diagnostic,
      transport: transportAlbert(post),
    });
    await vi.waitFor(() => expect(assistant!.panel.sousTitre).toBe(SOUS_TITRE_AVEC_MODELE));
    await assistant.poser('bonjour, par où commencer ?');
    expect(post).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(repereDe(surligne())).toBe('dashboard.canevas.titre'));
  });

  it('les suggestions de l’état vide mènent chacune à un repère, sans modèle', () => {
    const etats = [[], [createWidget('kpi', 0, 0)], [createWidget('text', 0, 0)]];
    for (const widgets of etats) {
      const suggestions = suggestionsDashboard({
        ...state,
        dashboard: { ...state.dashboard, widgets },
      });
      expect(suggestions.length).toBeLessThanOrEqual(3);
      for (const s of suggestions) {
        expect(trouverRepere(REGISTRE, s.texte).statut, s.texte).toBe('trouve');
      }
    }
  });
});
