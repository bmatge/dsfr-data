/**
 * JSON parsing for manual source creation.
 */

import { setParsedJsonData } from '../state.js';

// ============================================================
// Parse JSON input from the manual source modal
// ============================================================

/**
 * Reads the JSON textarea and data-path input, parses the content,
 * normalizes it to an array, and updates the preview UI.
 */
export function parseJsonInput(): void {
  const inputEl = document.getElementById('json-input') as HTMLTextAreaElement | null;
  const dataPathEl = document.getElementById('json-data-path') as HTMLInputElement | null;
  const preview = document.getElementById('json-preview');
  const countSpan = document.getElementById('json-preview-count');

  const input = inputEl?.value.trim() ?? '';
  const dataPath = dataPathEl?.value.trim() ?? '';

  if (!input) {
    if (preview) preview.style.display = 'none';
    setParsedJsonData(null);
    return;
  }

  try {
    let data: unknown = JSON.parse(input);

    // Navigate to data path if specified
    if (dataPath) {
      const parts = dataPath.split('.');
      for (const part of parts) {
        if (data && typeof data === 'object') {
          data = (data as Record<string, unknown>)[part];
        }
      }
    }

    // Normalize to array
    if (!Array.isArray(data)) {
      data = data ? [data] : [];
    }

    const arrayData = data as Record<string, unknown>[];
    setParsedJsonData(arrayData);

    if (countSpan) countSpan.textContent = String(arrayData.length);
    if (preview) {
      preview.style.display = 'block';
      const pEl = preview.querySelector('p');
      if (pEl) pEl.style.color = 'var(--text-default-success)';
    }
  } catch {
    setParsedJsonData(null);
    if (countSpan) countSpan.textContent = 'Erreur JSON';
    if (preview) {
      preview.style.display = 'block';
      const pEl = preview.querySelector('p');
      if (pEl) pEl.style.color = 'var(--text-default-error)';
    }
  }
}
