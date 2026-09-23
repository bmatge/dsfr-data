/**
 * IA configuration management (generic API settings)
 * Supports any OpenAI-compatible chat completions API
 * (Albert, OpenAI, Anthropic, Gemini, Mistral, etc.)
 *
 * Two modes:
 * - User config: user provides their own API key in localStorage
 * - Server default: server-side token injected by /ia-proxy-default (token never exposed)
 */

import {
  toastSuccess,
  fetchServerConfig as fetchSharedServerConfig,
  getServerConfig as getSharedServerConfig,
  isServerMode as isSharedServerMode,
  type ServerIAConfig,
} from '@dsfr-data/shared';

/** IA config shape */
export interface IAConfig {
  apiUrl: string;
  model: string;
  token: string;
  systemPrompt: string;
  extraParams: Record<string, string>;
}

/** Server-side default config (token is never exposed to client) */
export type { ServerIAConfig };

const IA_CONFIG_KEY = 'dsfr-data-ia-config';

/** Modele par défaut : openweight-large = gpt-oss-120b cote Albert. */
export const DEFAULT_MODEL = 'openweight-large';

/** Modeles proposes dans le dropdown (les autres passent par "Personnalise…"). */
const MODEL_PRESETS = new Set([
  'openweight-large',
  'openweight-medium',
  'openweight-small',
  'albert-large',
]);

/**
 * Lit le modele choisi : valeur du select, ou input "Personnalise…" si actif.
 * Tolere l'absence du select custom (compat tests / anciens DOM).
 */
export function readModelValue(): string {
  const select = document.getElementById('ia-model') as HTMLSelectElement | null;
  if (!select) return DEFAULT_MODEL;
  if (select.value === '__custom__') {
    const custom = document.getElementById('ia-model-custom') as HTMLInputElement | null;
    return custom?.value.trim() || DEFAULT_MODEL;
  }
  return select.value;
}

/**
 * Applique un modele au select : preset -> sélectionne l'option ; sinon ->
 * bascule sur "Personnalise…" et remplit l'input texte.
 */
export function applyModelValue(model: string): void {
  const select = document.getElementById('ia-model') as HTMLSelectElement | null;
  const custom = document.getElementById('ia-model-custom') as HTMLInputElement | null;
  if (!select) return;
  if (MODEL_PRESETS.has(model)) {
    select.value = model;
    if (custom) {
      custom.style.display = 'none';
      custom.value = '';
    }
  } else {
    select.value = '__custom__';
    if (custom) {
      custom.value = model;
      custom.style.display = '';
    }
  }
}

/** Affiche/masque l'input "Personnalise…" selon l'option choisie. */
export function onModelSelectChange(): void {
  const select = document.getElementById('ia-model') as HTMLSelectElement | null;
  const custom = document.getElementById('ia-model-custom') as HTMLInputElement | null;
  if (!select || !custom) return;
  custom.style.display = select.value === '__custom__' ? '' : 'none';
}

/** Check if user has their own config with a token in localStorage */
export function hasUserConfig(): boolean {
  const raw = localStorage.getItem(IA_CONFIG_KEY);
  if (!raw) return false;
  try {
    const config = JSON.parse(raw) as Partial<IAConfig>;
    return !!config.token;
  } catch {
    return false;
  }
}

/**
 * Config serveur : deleguee au transport IA commun (#998), pour qu'un seul
 * cache de `/ia-server-config` serve le builder-IA et le Studio.
 */
export function fetchServerConfig(): Promise<ServerIAConfig> {
  return fetchSharedServerConfig();
}

/** Whether we are currently in server-default mode */
export function isServerMode(): boolean {
  return isSharedServerMode();
}

/** Get cached server config (null if not fetched yet) */
export function getServerConfig(): ServerIAConfig | null {
  return getSharedServerConfig();
}

/** Update the IA config UI badge to show active mode */
export function updateIAModeBadge(): void {
  const badge = document.getElementById('ia-mode-badge');
  if (!badge) return;

  const tokenInput = document.getElementById('ia-token') as HTMLInputElement | null;

  if (hasUserConfig() || tokenInput?.value) {
    badge.textContent = 'Config perso';
    badge.className = 'fr-badge fr-badge--sm fr-badge--success';
  } else if (getServerConfig()?.available) {
    badge.textContent = `Albert (serveur)`;
    badge.className = 'fr-badge fr-badge--sm fr-badge--info';
  } else {
    badge.textContent = 'Non configure';
    badge.className = 'fr-badge fr-badge--sm fr-badge--warning';
  }
}

/** Clear user config from localStorage and revert to server default */
export function resetIAConfig(): void {
  localStorage.removeItem(IA_CONFIG_KEY);

  // Reset form fields to defaults
  const apiUrlEl = document.getElementById('ia-api-url') as HTMLInputElement;
  const tokenEl = document.getElementById('ia-token') as HTMLInputElement;

  if (apiUrlEl)
    apiUrlEl.value =
      getServerConfig()?.apiUrl || 'https://albert.api.etalab.gouv.fr/v1/chat/completions';
  applyModelValue(getServerConfig()?.model || DEFAULT_MODEL);
  if (tokenEl) tokenEl.value = '';

  updateIAModeBadge();
  toastSuccess('Configuration reinitialise (mode serveur)');
}

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
    <input class="fr-input" type="text" placeholder="clé" value="${key}" style="flex:1;">
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
      applyModelValue(config.model);
    }
    if (config.token) {
      (document.getElementById('ia-token') as HTMLInputElement).value = config.token;
    }
    if (config.systemPrompt) {
      (document.getElementById('ia-system-prompt') as HTMLTextAreaElement).value =
        config.systemPrompt;
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
    model: readModelValue(),
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
    model: readModelValue(),
    token: (document.getElementById('ia-token') as HTMLInputElement).value,
    systemPrompt: (document.getElementById('ia-system-prompt') as HTMLTextAreaElement).value,
    extraParams: getExtraParamsFromDOM(),
  };
}
