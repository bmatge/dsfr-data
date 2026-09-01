/**
 * Studio IA - Rendu du chat (messages, etapes de raisonnement).
 * Meme facture visuelle que le builder-IA, en version compacte.
 */

import { escapeHtml } from '@dsfr-data/shared';
import { state } from '../state.js';

function messagesEl(): HTMLElement | null {
  return document.getElementById('chat-messages');
}

/** Rendu minimal : paragraphes + gras/italique/code inline, tout echappe. */
function renderText(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function addMessage(role: 'user' | 'assistant', content: string): void {
  state.messages.push({ role, content });
  const container = messagesEl();
  if (!container) return;
  const div = document.createElement('div');
  div.className = `chat-message chat-message--${role}`;
  div.innerHTML = renderText(content);
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
