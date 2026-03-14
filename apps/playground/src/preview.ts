/**
 * Preview HTML generation for the playground iframe.
 * Delegates to the shared getPreviewHTML and adds runPreview helper.
 */

import { getPreviewHTML } from '@dsfr-data/shared';
export { getPreviewHTML };

export function runPreview(editor: { getValue(): string }, iframeId: string): void {
  const code = editor.getValue();
  const iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
  if (iframe) {
    iframe.srcdoc = getPreviewHTML(code);
  }
}
