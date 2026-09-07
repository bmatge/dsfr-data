/**
 * Builder IA - Entry point
 * Registers all event listeners and initializes the application
 */

import './styles/builder-ia.css';
import {
  initAuth,
  injectTourStyles,
  startTourIfFirstVisit,
  startTour,
  BUILDER_IA_TOUR,
  exportPreviewImage,
  ImageExportError,
  IMAGE_EXPORT_MESSAGES,
  toastError,
  mountDiagnosticPanel,
  recupererDiagnostic,
} from '@dsfr-data/shared';

import {
  loadSavedSources,
  handleSourceChange,
  loadSavedSourceData,
  initDataPreviewModal,
} from './sources.js';
import {
  loadIAConfig,
  saveIAConfig,
  addExtraParam,
  fetchServerConfig,
  updateIAModeBadge,
  resetIAConfig,
  onModelSelectChange,
} from './ia/ia-config.js';
import { probeCapabilitiesUI } from './ia/capability-probe-ui.js';
import { addMessage, sendMessage } from './chat/chat.js';
import {
  switchTab,
  toggleSection,
  copyCode,
  openInPlayground,
  saveFavorite,
} from './ui/ui-helpers.js';
import { state } from './state.js';

// Expose functions that are called from inline onclick attributes in HTML
(window as unknown as Record<string, unknown>).toggleSection = toggleSection;
(window as unknown as Record<string, unknown>).saveIAConfig = () => {
  saveIAConfig();
  updateIAModeBadge();
};
(window as unknown as Record<string, unknown>).resetIAConfig = resetIAConfig;
(window as unknown as Record<string, unknown>).probeCapabilities = () => void probeCapabilitiesUI();
(window as unknown as Record<string, unknown>).addExtraParam = addExtraParam;
(window as unknown as Record<string, unknown>).onModelSelectChange = onModelSelectChange;
(window as unknown as Record<string, unknown>).loadSavedSourceData = loadSavedSourceData;
(window as unknown as Record<string, unknown>).sendMessage = sendMessage;

/**
 * Injecte un diagnostic dans le champ du chat plutôt que de l'envoyer
 * directement : l'utilisateur relit ce qui part vers un service externe —
 * la trace contient des échantillons de données réelles — et peut
 * l'accompagner de sa question.
 */
function injecterDiagnostic(texte: string): void {
  const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
  if (!input) return;
  const question = 'Voici le diagnostic du pipeline. Qu’est-ce qui ne va pas ?';
  input.value = `${question}\n\n${texte}`;
  input.focus();
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Récupère un diagnostic transmis par une autre app et le pose dans le chat.
 *
 * Le mode rapporté n'a d'intérêt que si quelque chose peut y arriver : sans
 * ce chemin, le volet resterait un écran vide avec une explication.
 */
function recupererDiagnosticTransmis(): void {
  const texte = recupererDiagnostic();
  if (texte) injecterDiagnostic(texte);
}

(window as unknown as Record<string, unknown>).copyCode = copyCode;
(window as unknown as Record<string, unknown>).switchTab = switchTab;

document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();

  // Volet Diagnostic (#606) en mode RAPPORTÉ, et c'est un constat, pas un
  // repli : l'aperçu de cette app passe par chart-renderer.ts, qui dessine
  // avec @gouvfr/dsfr-chart en direct — aucun composant dsfr-data, donc
  // aucun trafic sur le bus à observer. L'app peut en revanche LIRE un
  // diagnostic produit ailleurs et le passer à l'assistant. #609 propose
  // d'aligner l'aperçu sur le code généré, ce qui ferait passer ce volet en
  // mode live et supprimerait le rendu parallèle.
  mountDiagnosticPanel({
    toggleButtonId: 'diagnostic-btn',
    canSend: true,
    onSend: injecterDiagnostic,
    emptyHint:
      'Cette app rend son aperçu sans composant dsfr-data : collez ici un diagnostic produit par le Playground, le Builder ou le Studio.',
  });
  recupererDiagnosticTransmis();

  // Source selection
  const savedSourceEl = document.getElementById('saved-source');
  if (savedSourceEl) {
    savedSourceEl.addEventListener('change', handleSourceChange);
  }

  // Chat input - Enter to send
  const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement | null;
  if (chatInput) {
    chatInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-resize textarea
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    });
  }

  // Load sources and IA config
  loadSavedSources();
  loadIAConfig();
  initDataPreviewModal();

  // Fetch server-side default IA config (non-blocking)
  fetchServerConfig().then(() => updateIAModeBadge());

  // Restore previous conversation if any
  try {
    const savedMessages = sessionStorage.getItem('builder-ia-messages');
    if (savedMessages) {
      const messages = JSON.parse(savedMessages);
      if (Array.isArray(messages) && messages.length > 0) {
        messages.forEach((m: { role: string; content: string }) =>
          addMessage(m.role as 'user' | 'assistant', m.content)
        );
        state.messages = messages;
      }
    }
  } catch {
    /* ignore */
  }

  // Welcome message (only if no restored conversation)
  if (state.messages.length === 0) {
    addMessage(
      'assistant',
      'Bonjour ! Pour commencer :\n1. **Sélectionnez une source de données** dans le panneau de gauche\n2. **Decrivez le graphique souhaite** en francais\n\nJe peux créer des barres, courbes, camemberts, KPIs, cartes, tableaux... et aussi nettoyer vos données ou ajouter des filtres interactifs.',
      ['Quels types de graphiques ?', 'Comment fonctionne le pipeline ?']
    );
  }

  // Clear conversation button
  document.getElementById('clear-chat')?.addEventListener('click', () => {
    sessionStorage.removeItem('builder-ia-messages');
    state.messages = [];
    const container = document.getElementById('chat-messages');
    if (container) container.innerHTML = '';
    addMessage('assistant', 'Conversation effacee. Comment puis-je vous aider ?');
  });

  // Actions sur l'artefact, portées par <app-action-bar> (lot UX 2, #539)
  const exportImage = (format: 'png' | 'jpg') =>
    void (async () => {
      try {
        if (!state.chartConfig) throw new ImageExportError('empty');
        // Bloc complet titre + sous-titre + graphique (light DOM du panneau).
        const root = (document.querySelector('.preview-chart') ??
          document.getElementById('tab-preview') ??
          document.body) as HTMLElement;
        await exportPreviewImage(root, format, state.chartConfig.title || 'graphique');
      } catch (err) {
        if (err instanceof ImageExportError) toastError(IMAGE_EXPORT_MESSAGES[err.reason]);
        else throw err;
      }
    })();
  document.getElementById('export-png-btn')?.addEventListener('click', () => exportImage('png'));
  document.getElementById('export-jpg-btn')?.addEventListener('click', () => exportImage('jpg'));
  document.getElementById('save-favorite-btn')?.addEventListener('click', saveFavorite);
  document.getElementById('open-playground-btn')?.addEventListener('click', openInPlayground);
  document.getElementById('copy-code-btn')?.addEventListener('click', copyCode);
  document.getElementById('tour-btn')?.addEventListener('click', () => startTour(BUILDER_IA_TOUR));

  // Product tour
  injectTourStyles();
  startTourIfFirstVisit(BUILDER_IA_TOUR);
});
