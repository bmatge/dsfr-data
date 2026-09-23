/**
 * Studio IA - Rendu du chat (messages, suggestions, etapes de raisonnement).
 *
 * Meme facture que l'ancien Assistant IA, qu'il remplace comme entree usager
 * (#1081) : Markdown sur (tableaux, listes, code — `renderMarkdown` partage,
 * qui echappe TOUT avant de formater), suggestions cliquables, et raisonnement
 * de l'assistant conserve sous la reponse, replie.
 */

import { escapeHtml, renderMarkdown } from '@dsfr-data/shared';
import { state } from '../state.js';

function messagesEl(): HTMLElement | null {
  return document.getElementById('chat-messages');
}

/** Options d'un message de l'assistant. */
export interface MessageOptions {
  /** Relances proposees sous la reponse : un clic les envoie. */
  suggestions?: string[];
  /** Etapes franchies par la boucle agentique, gardees sous la reponse. */
  etapes?: string[];
}

/** Envoi declenche par une suggestion (pose par main.ts). */
let envoyerSuggestion: ((texte: string) => void) | null = null;

export function definirEnvoiSuggestion(envoi: (texte: string) => void): void {
  envoyerSuggestion = envoi;
}

function blocSuggestions(suggestions: string[]): HTMLElement {
  const bloc = document.createElement('div');
  bloc.className = 'chat-suggestions';
  for (const s of suggestions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fr-tag fr-tag--sm chat-suggestion';
    btn.textContent = s;
    btn.addEventListener('click', () => envoyerSuggestion?.(s));
    bloc.appendChild(btn);
  }
  return bloc;
}

function blocRaisonnement(etapes: string[]): HTMLElement {
  const details = document.createElement('details');
  details.className = 'chat-reasoning';
  const summary = document.createElement('summary');
  const n = etapes.length;
  summary.textContent = `Raisonnement de l’assistant (${n} étape${n > 1 ? 's' : ''})`;
  const ul = document.createElement('ul');
  for (const e of etapes) {
    const li = document.createElement('li');
    li.textContent = e;
    ul.appendChild(li);
  }
  details.append(summary, ul);
  return details;
}

export function addMessage(
  role: 'user' | 'assistant',
  content: string,
  options: MessageOptions = {}
): void {
  state.messages.push({ role, content });
  const container = messagesEl();
  if (!container) return;
  const div = document.createElement('div');
  div.className = `chat-message chat-message--${role}`;
  div.innerHTML = renderMarkdown(content);
  if (role === 'assistant') {
    if (options.suggestions?.length) div.appendChild(blocSuggestions(options.suggestions));
    if (options.etapes?.length) div.appendChild(blocRaisonnement(options.etapes));
  }
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

const THINKING_ID = 'thinking-message';

export function showThinking(): void {
  const container = messagesEl();
  if (!container || document.getElementById(THINKING_ID)) return;
  const div = document.createElement('div');
  div.id = THINKING_ID;
  div.className = 'chat-message chat-message--assistant chat-message--thinking';
  div.innerHTML = '<span class="thinking-dots"><span></span><span></span><span></span></span>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

export function updateThinkingSteps(steps: string[]): void {
  const el = document.getElementById(THINKING_ID);
  if (!el) return;
  el.innerHTML = `${steps.map((s) => `<div class="thinking-step">${escapeHtml(s)}</div>`).join('')}
    <span class="thinking-dots"><span></span><span></span><span></span></span>`;
  const container = messagesEl();
  if (container) container.scrollTop = container.scrollHeight;
}

export function removeThinking(): void {
  document.getElementById(THINKING_ID)?.remove();
}

export function clearChat(): void {
  state.messages = [];
  const container = messagesEl();
  if (container) container.innerHTML = '';
}
