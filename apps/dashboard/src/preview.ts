/**
 * Dashboard app - Preview modal
 */

import { generateHTMLCode } from './code-generator.js';

export function openPreviewModal(): void {
  const modal = document.getElementById('preview-modal');
  const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement | null;

  if (!modal || !iframe) return;

  iframe.srcdoc = generateHTMLCode();
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

export function closePreviewModal(): void {
  const modal = document.getElementById('preview-modal');
  const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement | null;

  if (modal) modal.classList.remove('active');
  if (iframe) iframe.srcdoc = '';
  document.body.style.overflow = '';
}
