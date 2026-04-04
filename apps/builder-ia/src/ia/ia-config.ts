/**
 * IA configuration management (generic API settings)
 * Supports any OpenAI-compatible chat completions API
 * (Albert, OpenAI, Anthropic, Gemini, Mistral, etc.)
 *
 * Two modes:
 * - User config: user provides their own API key in localStorage
 * - Server default: server-side token injected by /ia-proxy-default (token never exposed)
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

/** Server-side default config (token is never exposed to client) */
export interface ServerIAConfig {
  available: boolean;
  apiUrl?: string;
  model?: string;
}

const IA_CONFIG_KEY = 'dsfr-data-ia-config';

/** Cached server config (fetched once per session) */
let serverConfig: ServerIAConfig | null = null;

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

/** Fetch the server-side default config (cached after first call) */
export async function fetchServerConfig(): Promise<ServerIAConfig> {
  if (serverConfig !== null) return serverConfig;
  try {
    const res = await fetch('/ia-server-config');
    serverConfig = await res.json();
  } catch {
    serverConfig = { available: false };
  }
  return serverConfig!;
}

/** Whether we are currently in server-default mode */
export function isServerMode(): boolean {
  return !hasUserConfig() && serverConfig?.available === true;
}

/** Get cached server config (null if not fetched yet) */
export function getServerConfig(): ServerIAConfig | null {
  return serverConfig;
}

/** Update the IA config UI badge to show active mode */
export function updateIAModeBadge(): void {
  const badge = document.getElementById('ia-mode-badge');
  if (!badge) return;

  const tokenInput = document.getElementById('ia-token') as HTMLInputElement | null;

  if (hasUserConfig() || tokenInput?.value) {
    badge.textContent = 'Config perso';
    badge.className = 'fr-badge fr-badge--sm fr-badge--success';
  } else if (serverConfig?.available) {
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
  const modelEl = document.getElementById('ia-model') as HTMLInputElement;
  const tokenEl = document.getElementById('ia-token') as HTMLInputElement;

  if (apiUrlEl)
    apiUrlEl.value =
      serverConfig?.apiUrl || 'https://albert.api.etalab.gouv.fr/v1/chat/completions';
  if (modelEl) modelEl.value = serverConfig?.model || 'albert-large';
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
