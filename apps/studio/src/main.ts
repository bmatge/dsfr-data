/**
 * Studio IA - Point d'entree : wiring DOM + orchestration d'un tour de chat.
 */

import {
  createEmptyDashboard,
  loadFromStorage,
  normalizeDashboard,
  saveToStorage,
  STORAGE_KEYS,
  toastSuccess,
  toastWarning,
  injectTourStyles,
  startTour,
  startTourIfFirstVisit,
  STUDIO_TOUR,
} from '@dsfr-data/shared';
import type { DashboardData } from '@dsfr-data/shared';
import './styles/studio.css';
import { state } from './state.js';
import { loadSavedSources, handleSourceChange } from './sources.js';
import {
  addMessage,
  clearChat,
  removeThinking,
  showThinking,
  updateThinkingSteps,
} from './ui/chat.js';
import { renderPreview, schedulePreviewRender } from './ui/preview.js';
import { runStudioLoop } from './ia/agent-loop.js';
import { buildSystemPrompt } from './ia/system-prompt.js';
import { resolveTransport } from './ia/transport.js';

const SESSION_KEY = 'studio-messages';
const SESSION_DOC_KEY = 'studio-document';

async function sendMessage(): Promise<void> {
  const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
  const text = input?.value.trim();
  if (!text || state.isThinking) return;
  if (input) input.value = '';

  addMessage('user', text);
  state.isThinking = true;
  showThinking();

  try {
    const transport = await resolveTransport();
    if (transport.mode === 'none') {
      removeThinking();
      addMessage(
        'assistant',
        "Aucune configuration IA disponible : configure une clé API dans l'Assistant IA (elle est partagée), ou utilise un déploiement avec jeton serveur."
      );
      return;
    }

    const result = await runStudioLoop({
      conversation: state.messages.slice(-10),
      systemPrompt: buildSystemPrompt({
        source: state.source,
        fields: state.fields,
        sampleRecord: state.localData?.[0] ?? null,
        document: state.document,
      }),
      document: state.document,
      data: state.localData ?? [],
      fields: state.fields,
      sourceId: state.document.sources[0]?.id ?? '',
      post: transport.post,
      model: transport.model,
      onProgress: updateThinkingSteps,
      onDocumentChange: () => {
        schedulePreviewRender();
        persistSession();
      },
      extra: { max_completion_tokens: 4096 },
    });

    removeThinking();
    addMessage('assistant', result.text || 'Document mis à jour.');
  } catch (err) {
    removeThinking();
    addMessage('assistant', `Erreur : ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    state.isThinking = false;
    persistSession();
  }
}

/** Conversation + document survivants d'un refresh (sessionStorage, comme le builder-IA). */
function persistSession(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.messages));
    sessionStorage.setItem(SESSION_DOC_KEY, JSON.stringify(state.document));
  } catch {
    // quota / navigation privee : tant pis pour la persistance de session
  }
}

function restoreSession(): void {
  try {
    const doc = sessionStorage.getItem(SESSION_DOC_KEY);
    if (doc) {
      state.document = normalizeDashboard(JSON.parse(doc) as DashboardData);
    }
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const messages = JSON.parse(raw) as { role: 'user' | 'assistant'; content: string }[];
      for (const m of messages) addMessage(m.role, m.content);
      state.messages = messages;
    }
  } catch {
    // session illisible : on repart proprement
  }
}

/** Enregistre le document dans les dashboards partages (ouvrables dans l'app dashboard). */
function saveDashboard(): void {
  if (state.document.widgets.length === 0) {
    toastWarning('Rien à enregistrer : le document est vide.');
    return;
  }
  const now = new Date().toISOString();
  if (!state.document.id) state.document.id = crypto.randomUUID();
  if (!state.document.createdAt) state.document.createdAt = now;
  state.document.updatedAt = now;

  const saved = loadFromStorage<DashboardData[]>(STORAGE_KEYS.DASHBOARDS, []);
  const idx = saved.findIndex((d) => d.id === state.document.id);
  if (idx >= 0) saved[idx] = state.document;
  else saved.push(state.document);
  saveToStorage(STORAGE_KEYS.DASHBOARDS, saved);
  toastSuccess(`« ${state.document.name} » enregistré — visible dans l'app Dashboard.`);
}

/**
 * « Effacer » remet le studio a zero : conversation ET document (donc apercu).
 * Le document vit en sessionStorage pour survivre a un refresh en cours de
 * travail — sans ce reset explicite, l'apercu resterait affiche a jamais.
 * La source chargee est conservee (elle reste liee au document vierge).
 */
function resetStudio(): void {
  clearChat();
  const fresh = createEmptyDashboard();
  if (state.document.sources.length > 0) fresh.sources = state.document.sources;
  state.document = fresh;
  renderPreview();
  persistSession();
  addMessage(
    'assistant',
    'Conversation et document réinitialisés. Décrivez le tableau de bord que vous voulez composer.'
  );
}

function copyCode(): void {
  const code = document.getElementById('generated-code')?.textContent ?? '';
  void navigator.clipboard.writeText(code).then(() => toastSuccess('Code copié !'));
}

async function showIAModeBadge(): Promise<void> {
  const badge = document.getElementById('ia-mode-badge');
  if (!badge) return;
  const transport = await resolveTransport();
  if (transport.mode === 'server') {
    badge.textContent = 'IA serveur';
    badge.classList.add('fr-badge--success');
  } else if (transport.mode === 'user') {
    badge.textContent = 'Clé perso';
    badge.classList.add('fr-badge--info');
  } else {
    badge.textContent = 'IA non configurée';
    badge.classList.add('fr-badge--warning');
  }
}

function init(): void {
  loadSavedSources();
  restoreSession();
  renderPreview();
  void showIAModeBadge();

  document.getElementById('saved-source')?.addEventListener('change', () => {
    handleSourceChange((source) => {
      addMessage(
        'assistant',
        `Source « ${source.name} » chargée (${state.localData?.length ?? 0} lignes, ${state.fields.length} champs). Décrivez le tableau de bord souhaité — vous pouvez coller votre texte éditorial.`
      );
      persistSession();
    });
  });

  document.getElementById('chat-send-btn')?.addEventListener('click', () => void sendMessage());
  document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  });
  document.getElementById('clear-chat')?.addEventListener('click', resetStudio);
  document.getElementById('save-dashboard-btn')?.addEventListener('click', saveDashboard);
  // Visite guidée (lot UX 7, #544)
  injectTourStyles();
  document.getElementById('tour-btn')?.addEventListener('click', () => startTour(STUDIO_TOUR));
  startTourIfFirstVisit(STUDIO_TOUR);
  document.getElementById('copy-code-btn')?.addEventListener('click', copyCode);

  if (state.messages.length === 0) {
    addMessage(
      'assistant',
      'Bienvenue dans le **Studio IA**. Choisissez une source de données, puis décrivez le tableau de bord complet que vous voulez : titre, texte éditorial (collez-le), indicateurs, graphiques, filtres. Je le compose bloc par bloc sous vos yeux.'
    );
  }
}

document.addEventListener('DOMContentLoaded', init);
