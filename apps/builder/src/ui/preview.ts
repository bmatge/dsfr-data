/**
 * Preview rendering for the builder iframe.
 * Uses the shared getPreviewHTML to wrap generated code in a standalone HTML
 * document, then renders it via iframe srcdoc.
 */

import { getPreviewHTML } from '@dsfr-data/shared';

/**
 * Render the generated code in the preview iframe.
 * Hides the empty-state placeholder and displays the iframe.
 */
export function renderPreview(code: string): void {
  const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement | null;
  const emptyState = document.getElementById('empty-state') as HTMLElement | null;
  if (!iframe) return;
  if (emptyState) emptyState.style.display = 'none';
  iframe.style.display = 'block';
  // `debug: true` : sans le tampon, le collecteur du volet Diagnostic arrive
  // apres que tout a emis et ne reconstitue qu'un etat, sans les erreurs.
  iframe.srcdoc = getPreviewHTML(code, { debug: true });
}
