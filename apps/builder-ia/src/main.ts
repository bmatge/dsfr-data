/**
 * Builder IA - Entry point
 * Registers all event listeners and initializes the application
 */

import './styles/builder-ia.css';
import { initAuth, injectTourStyles, startTourIfFirstVisit, BUILDER_IA_TOUR } from '@dsfr-data/shared';

import { loadSavedSources, handleSourceChange, loadSavedSourceData, initDataPreviewModal } from './sources.js';
import { loadIAConfig, saveIAConfig, addExtraParam, fetchServerConfig, updateIAModeBadge, resetIAConfig } from './ia/ia-config.js';
import { addMessage, sendMessage } from './chat/chat.js';
import { switchTab, toggleSection, copyCode, openInPlayground, saveFavorite } from './ui/ui-helpers.js';
import { state } from './state.js';

// Expose functions that are called from inline onclick attributes in HTML
(window as unknown as Record<string, unknown>).toggleSection = toggleSection;
(window as unknown as Record<string, unknown>).saveIAConfig = () => { saveIAConfig(); updateIAModeBadge(); };
(window as unknown as Record<string, unknown>).resetIAConfig = resetIAConfig;
(window as unknown as Record<string, unknown>).addExtraParam = addExtraParam;
(window as unknown as Record<string, unknown>).loadSavedSourceData = loadSavedSourceData;
(window as unknown as Record<string, unknown>).sendMessage = sendMessage;
(window as unknown as Record<string, unknown>).copyCode = copyCode;
(window as unknown as Record<string, unknown>).switchTab = switchTab;

document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();

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
        messages.forEach((m: { role: string; content: string }) => addMessage(m.role as 'user' | 'assistant', m.content));
        state.messages = messages;
      }
    }
  } catch { /* ignore */ }

  // Welcome message (only if no restored conversation)
  if (state.messages.length === 0) {
    addMessage('assistant', 'Bonjour ! Pour commencer :\n1. **Selectionnez une source de donnees** dans le panneau de gauche\n2. **Decrivez le graphique souhaite** en francais\n\nJe peux creer des barres, courbes, camemberts, KPIs, cartes, tableaux... et aussi nettoyer vos donnees ou ajouter des filtres interactifs.', [
      'Quels types de graphiques ?',
      'Comment fonctionne le pipeline ?',
    ]);
  }

  // Clear conversation button
  document.getElementById('clear-chat')?.addEventListener('click', () => {
    sessionStorage.removeItem('builder-ia-messages');
    state.messages = [];
    const container = document.getElementById('chat-messages');
    if (container) container.innerHTML = '';
    addMessage('assistant', 'Conversation effacee. Comment puis-je vous aider ?');
  });

  // Listen for save-favorite and open-playground events from preview panel
  const previewPanel = document.querySelector('app-preview-panel');
  if (previewPanel) {
    previewPanel.addEventListener('save-favorite', saveFavorite);
    previewPanel.addEventListener('open-playground', openInPlayground);
  }

  // Product tour
  injectTourStyles();
  startTourIfFirstVisit(BUILDER_IA_TOUR);
});
