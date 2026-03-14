/**
 * IA configuration management (generic API settings)
 * Supports any OpenAI-compatible chat completions API
 * (Albert, OpenAI, Anthropic, Gemini, Mistral, etc.)
 */

import { toastSuccess } from '@dsfr-data/shared';

/** IA config shape */
export interface IAConfig {
  apiUrl: string;
  model: string;
  token: string;
  systemPrompt: string;
  extraParams: Record<string, string>;
}

const IA_CONFIG_KEY = 'dsfr-data-ia-config';

/**
 * Toggle the IA config panel visibility
 */
export function toggleIAConfig(): void {
  const content = document.getElementById('ia-config-content') as HTMLElement;
  const arrow = document.getElementById('ia-config-arrow') as HTMLElement;
  content.classList.toggle('open');
  arrow.style.transform = content.classList.contains('open') ? 'rotate(180deg)' : '';
}

/**
 * Add an empty key:value row to the extra params container
 */
export function addExtraParam(key = '', value = ''): void {
  const container = document.getElementById('ia-extra-params');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'ia-extra-param-row';
  row.style.cssText = 'display:flex;gap:0.5rem;margin-bottom:0.5rem;align-items:center;';
  row.innerHTML = `
    <input class="fr-input" type="text" placeholder="cle" value="${key}" style="flex:1;">
    <input class="fr-input" type="text" placeholder="valeur" value="${value}" style="flex:1;">
    <button class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline" type="button" onclick="this.parentElement.remove()" title="Supprimer"><i class="ri-delete-bin-line"></i></button>
  `;
  container.appendChild(row);
}

/**
 * Read extra params from the DOM rows
 */
function getExtraParamsFromDOM(): Record<string, string> {
  const container = document.getElementById('ia-extra-params');
  if (!container) return {};

  const params: Record<string, string> = {};
  const rows = container.querySelectorAll('.ia-extra-param-row');
  for (const row of rows) {
    const inputs = row.querySelectorAll('input');
    const key = inputs[0]?.value.trim();
    const val = inputs[1]?.value.trim();
    if (key) {
      params[key] = val;
    }
  }
  return params;
}

/**
 * Render extra params rows in the DOM from a config object
 */
function renderExtraParams(params: Record<string, string>): void {
  const container = document.getElementById('ia-extra-params');
  if (!container) return;

  container.innerHTML = '';
  for (const [key, value] of Object.entries(params)) {
    addExtraParam(key, value);
  }
}

/**
 * Load IA config from localStorage into the form fields
 */
export function loadIAConfig(): void {
  const raw = localStorage.getItem(IA_CONFIG_KEY);
  if (!raw) return;

  try {
    const config = JSON.parse(raw) as Partial<IAConfig>;
    if (config.apiUrl) {
      (document.getElementById('ia-api-url') as HTMLInputElement).value = config.apiUrl;
    }
    if (config.model) {
      (document.getElementById('ia-model') as HTMLInputElement).value = config.model;
    }
    if (config.token) {
      (document.getElementById('ia-token') as HTMLInputElement).value = config.token;
    }
    if (config.systemPrompt) {
      (document.getElementById('ia-system-prompt') as HTMLTextAreaElement).value = config.systemPrompt;
    }
    if (config.extraParams && Object.keys(config.extraParams).length > 0) {
      renderExtraParams(config.extraParams);
    }
  } catch {
    // Ignore parse errors
  }
}

/**
 * Save IA config from form fields to localStorage
 */
export function saveIAConfig(): void {
  const config: IAConfig = {
    apiUrl: (document.getElementById('ia-api-url') as HTMLInputElement).value,
    model: (document.getElementById('ia-model') as HTMLInputElement).value,
    token: (document.getElementById('ia-token') as HTMLInputElement).value,
    systemPrompt: (document.getElementById('ia-system-prompt') as HTMLTextAreaElement).value,
    extraParams: getExtraParamsFromDOM(),
  };
  localStorage.setItem(IA_CONFIG_KEY, JSON.stringify(config));
  toastSuccess('Configuration sauvegardee !');
}

/**
 * Get current IA config from form fields (without saving)
 */
export function getIAConfig(): IAConfig {
  return {
    apiUrl: (document.getElementById('ia-api-url') as HTMLInputElement).value,
    model: (document.getElementById('ia-model') as HTMLInputElement).value,
    token: (document.getElementById('ia-token') as HTMLInputElement).value,
    systemPrompt: (document.getElementById('ia-system-prompt') as HTMLTextAreaElement).value,
    extraParams: getExtraParamsFromDOM(),
  };
}
