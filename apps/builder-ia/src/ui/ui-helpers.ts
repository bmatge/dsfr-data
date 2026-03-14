/**
 * Small UI helper functions
 */

import { state } from '../state.js';
import { saveToStorage, loadFromStorage, STORAGE_KEYS, toastInfo, toastWarning, navigateTo } from '@dsfr-data/shared';

/**
 * Switch active tab in the preview panel (delegates to app-preview-panel component)
 */
export function switchTab(tabId: string): void {
  const previewPanel = document.querySelector('app-preview-panel') as HTMLElement & { setActiveTab?(tab: string): void };
  if (previewPanel && previewPanel.setActiveTab) {
    previewPanel.setActiveTab(tabId);
  }
}

/**
 * Toggle a collapsible section by toggling the 'collapsed' CSS class
 */
export function toggleSection(sectionId: string): void {
  const section = document.getElementById(sectionId);
  if (section) {
    section.classList.toggle('collapsed');
  }
}

/**
 * Copy generated code to clipboard
 */
export function copyCode(): void {
  const code = (document.getElementById('generated-code') as HTMLPreElement).textContent || '';
  navigator.clipboard.writeText(code).then(() => {
    toastInfo('Code copie dans le presse-papiers !');
  });
}

/**
 * Open the generated code in the Playground app
 */
export function openInPlayground(): void {
  const code = (document.getElementById('generated-code') as HTMLPreElement).textContent || '';

  if (!code || code.startsWith('// Le code sera genere') || code.startsWith('//')) {
    toastWarning("Generez d'abord un graphique avant de l'ouvrir dans le Playground.");
    return;
  }

  // Store code in sessionStorage
  sessionStorage.setItem('playground-code', code);
  // Redirect to the playground
  navigateTo('playground', { from: 'builder-ia' });
}

/** Favorites localStorage key */
const FAVORITES_KEY = STORAGE_KEYS.FAVORITES;

/** Favorite item shape */
interface Favorite {
  id: string;
  name: string;
  code: string;
  chartType: string;
  source: string;
  createdAt: string;
}

/**
 * Save the current chart as a favorite
 */
export function saveFavorite(): void {
  const code = (document.getElementById('generated-code') as HTMLPreElement).textContent || '';

  if (!code || code.startsWith('// Le code sera genere') || code.startsWith('//')) {
    toastWarning("Generez d'abord un graphique avant de le sauvegarder en favori.");
    return;
  }

  const title = (document.getElementById('preview-title') as HTMLElement).textContent || 'Mon graphique';
  const name = prompt('Nom du favori :', title);
  if (!name) return;

  const favorites = loadFromStorage<Favorite[]>(FAVORITES_KEY, []);

  const favorite: Favorite = {
    id: crypto.randomUUID(),
    name: name,
    code: code,
    chartType: state.chartConfig?.type || 'chart',
    source: 'builder-ia',
    createdAt: new Date().toISOString(),
  };

  favorites.unshift(favorite);
  saveToStorage(FAVORITES_KEY, favorites);

  // Visual feedback
  const btn = document.querySelector('.preview-panel-save-btn') as HTMLElement | null;
  if (btn) {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="ri-check-line" aria-hidden="true"></i> Sauvegarde !';
    btn.style.background = 'var(--background-contrast-success)';
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
    }, 2000);
  }
}
