/**
 * Normalize configuration: toggle and input listeners.
 * Also exports updateMiddlewareSections() to show/hide middleware sections
 * based on generation mode.
 */

import { state } from '../state.js';

/**
 * Show or hide the normalize & facets sections based on generation mode.
 * Called when generation mode changes or when a source is loaded.
 */
export function updateMiddlewareSections(): void {
  const isDynamic = state.generationMode === 'dynamic';
  const normalizeSection = document.getElementById('section-normalize');
  const facetsSection = document.getElementById('section-facets');

  if (normalizeSection) normalizeSection.style.display = isDynamic ? 'block' : 'none';
  if (facetsSection) facetsSection.style.display = isDynamic ? 'block' : 'none';

  // Disable configs when switching away from dynamic
  if (!isDynamic) {
    state.normalizeConfig.enabled = false;
    state.facetsConfig.enabled = false;
    const normalizeToggle = document.getElementById('normalize-enabled') as HTMLInputElement | null;
    const facetsToggle = document.getElementById('facets-enabled') as HTMLInputElement | null;
    if (normalizeToggle) normalizeToggle.checked = false;
    if (facetsToggle) facetsToggle.checked = false;
    const normalizeOpts = document.getElementById('normalize-options');
    const facetsOpts = document.getElementById('facets-options');
    if (normalizeOpts) normalizeOpts.style.display = 'none';
    if (facetsOpts) facetsOpts.style.display = 'none';
  }
}

/**
 * Setup event listeners for normalize config inputs.
 */
export function setupNormalizeListeners(): void {
  const enabledToggle = document.getElementById('normalize-enabled') as HTMLInputElement | null;
  const options = document.getElementById('normalize-options');

  if (enabledToggle) {
    enabledToggle.addEventListener('change', () => {
      state.normalizeConfig.enabled = enabledToggle.checked;
      if (options) options.style.display = enabledToggle.checked ? 'block' : 'none';
    });
  }

  const trimEl = document.getElementById('normalize-trim') as HTMLInputElement | null;
  if (trimEl) {
    trimEl.addEventListener('change', () => {
      state.normalizeConfig.trim = trimEl.checked;
    });
  }

  const numericAutoEl = document.getElementById('normalize-numeric-auto') as HTMLInputElement | null;
  if (numericAutoEl) {
    numericAutoEl.addEventListener('change', () => {
      state.normalizeConfig.numericAuto = numericAutoEl.checked;
    });
  }

  const numericEl = document.getElementById('normalize-numeric') as HTMLInputElement | null;
  if (numericEl) {
    numericEl.addEventListener('input', () => {
      state.normalizeConfig.numeric = numericEl.value;
    });
  }

  const renameEl = document.getElementById('normalize-rename') as HTMLInputElement | null;
  if (renameEl) {
    renameEl.addEventListener('input', () => {
      state.normalizeConfig.rename = renameEl.value;
    });
  }

  const stripHtmlEl = document.getElementById('normalize-strip-html') as HTMLInputElement | null;
  if (stripHtmlEl) {
    stripHtmlEl.addEventListener('change', () => {
      state.normalizeConfig.stripHtml = stripHtmlEl.checked;
    });
  }

  const replaceEl = document.getElementById('normalize-replace') as HTMLInputElement | null;
  if (replaceEl) {
    replaceEl.addEventListener('input', () => {
      state.normalizeConfig.replace = replaceEl.value;
    });
  }

  const lowercaseKeysEl = document.getElementById('normalize-lowercase-keys') as HTMLInputElement | null;
  if (lowercaseKeysEl) {
    lowercaseKeysEl.addEventListener('change', () => {
      state.normalizeConfig.lowercaseKeys = lowercaseKeysEl.checked;
    });
  }

  const flattenEl = document.getElementById('normalize-flatten') as HTMLInputElement | null;
  if (flattenEl) {
    flattenEl.addEventListener('input', () => {
      state.normalizeConfig.flatten = flattenEl.value;
    });
  }
}

/**
 * Auto-enable normalize with flatten="fields" for Grist sources.
 * Updates both state and UI to reflect the pre-configured state.
 */
export function autoEnableNormalizeForGrist(): void {
  state.normalizeConfig.enabled = true;
  state.normalizeConfig.flatten = 'fields';
  state.normalizeConfig.trim = true;
  state.normalizeConfig.numericAuto = true;

  const toggle = document.getElementById('normalize-enabled') as HTMLInputElement | null;
  const options = document.getElementById('normalize-options');
  const flattenEl = document.getElementById('normalize-flatten') as HTMLInputElement | null;
  const trimEl = document.getElementById('normalize-trim') as HTMLInputElement | null;
  const numericAutoEl = document.getElementById('normalize-numeric-auto') as HTMLInputElement | null;

  if (toggle) toggle.checked = true;
  if (options) options.style.display = 'block';
  if (flattenEl) flattenEl.value = 'fields';
  if (trimEl) trimEl.checked = true;
  if (numericAutoEl) numericAutoEl.checked = true;
}
