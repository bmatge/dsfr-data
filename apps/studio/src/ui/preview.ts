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

  // DEUX generations depuis le MEME document, et c'est deliberé :
  //   - `exportHtml` part dans l'onglet Code et dans le presse-papier —
  //     l'utilisateur ne doit jamais copier une sonde de diagnostic ;
  //   - `previewHtml` porte le tampon d'evenements du volet (#605), sans
  //     lequel le collecteur arrive apres que tout a emis et perd les erreurs.
  // La doctrine « l'apercu EST l'export » tient : meme generateur, meme
  // document, seule une sonde d'observation s'ajoute au rendu.
  const exportHtml = generateDashboardHTML(state.document);
  const previewHtml = generateDashboardHTML(state.document, { debug: true });

  const codeEl = document.getElementById('generated-code');
  if (codeEl) codeEl.textContent = exportHtml;
  const jsonEl = document.getElementById('generated-json');
  if (jsonEl) jsonEl.textContent = JSON.stringify(state.document, null, 2);

  const frame = document.getElementById('preview-frame') as HTMLIFrameElement | null;
  const empty = document.getElementById('empty-state');
  const hasContent = state.document.widgets.length > 0;
  if (empty) empty.hidden = hasContent;
  if (frame) {
    frame.hidden = !hasContent;
    if (hasContent) frame.srcdoc = previewHtml;
  }
}
