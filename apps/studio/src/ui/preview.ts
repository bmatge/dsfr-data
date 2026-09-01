/**
 * Studio IA - Apercu vivant : l'apercu EST l'export.
 *
 * L'iframe srcdoc recoit la page COMPLETE generee par generateDashboardHTML
 * (modele partage #515) — vrais composants dsfr-data-*, memes balises que le
 * code copie par l'utilisateur. Aucun rendu parallele a maintenir.
 */

import { generateDashboardHTML } from '@dsfr-data/shared';
import { state } from '../state.js';

let renderTimer: ReturnType<typeof setTimeout> | null = null;

/** Rafraichit apercu + code + JSON (debounce court : la boucle peut enchainer). */
export function schedulePreviewRender(): void {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 150);
}

export function renderPreview(): void {
  renderTimer = null;
  const html = generateDashboardHTML(state.document);

  const codeEl = document.getElementById('generated-code');
  if (codeEl) codeEl.textContent = html;
  const jsonEl = document.getElementById('generated-json');
  if (jsonEl) jsonEl.textContent = JSON.stringify(state.document, null, 2);

  const frame = document.getElementById('preview-frame') as HTMLIFrameElement | null;
  const empty = document.getElementById('empty-state');
  const hasContent = state.document.widgets.length > 0;
  if (empty) empty.hidden = hasContent;
  if (frame) {
    frame.hidden = !hasContent;
    if (hasContent) frame.srcdoc = html;
  }
}
