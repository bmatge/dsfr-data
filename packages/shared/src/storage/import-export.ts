/**
 * Import/Export — portable JSON format for all user data.
 *
 * Exports sources, connections (without API keys), favorites, and dashboards
 * as a single JSON file. Imports validate each item before merging.
 */

import { loadFromStorage, saveToStorage, STORAGE_KEYS } from './local-storage.js';
import {
  validateSource,
  validateConnection,
  validateFavorite,
  validateDashboard,
} from '../validation/validators.js';

export interface ExportBundle {
  version: 1;
  exportedAt: string;
  sources: unknown[];
  connections: unknown[];
  favorites: unknown[];
  dashboards: unknown[];
}

export interface ImportResult {
  sources: number;
  connections: number;
  favorites: number;
  dashboards: number;
  skipped: number;
}

/**
 * En-têtes dont la valeur est un secret : jamais exportés.
 * (Authorization Bearer, Apikey ODS, X-API-Key, cookies...)
 */
const SENSITIVE_HEADER_RE =
  /^(authorization|proxy-authorization|cookie|set-cookie|apikey|api[-_]?key|x[-_]api[-_]key|x[-_]auth[-_]?token)$/i;

/** Retire les en-têtes sensibles. Accepte la forme objet ou chaîne JSON. */
function redactHeaders(headers: unknown): unknown {
  if (typeof headers === 'string') {
    try {
      const parsed = JSON.parse(headers);
      const redacted = redactHeaders(parsed);
      return JSON.stringify(redacted);
    } catch {
      // Chaîne non-JSON : on ne sait pas la filtrer → on ne l'exporte pas
      return undefined;
    }
  }
  if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (SENSITIVE_HEADER_RE.test(key)) continue;
      out[key] = value;
    }
    return out;
  }
  return headers;
}

/**
 * Copie exportable d'un item : `apiKey` retiré, en-têtes sensibles expurgés.
 * Les sources portent aussi des secrets (champ Grist `apiKey`,
 * `headers` Authorization/Apikey) — pas seulement les connections (#316).
 */
function stripSecrets(item: unknown): unknown {
  if (!item || typeof item !== 'object') return item;
  const { apiKey: _apiKey, ...rest } = item as Record<string, unknown>;
  if (rest.headers !== undefined) {
    const redacted = redactHeaders(rest.headers);
    if (redacted === undefined) delete rest.headers;
    else rest.headers = redacted;
  }
  return rest;
}

/**
 * Export all user data as a JSON bundle.
 * API keys and sensitive headers are stripped from sources AND connections.
 */
export function exportAllData(): ExportBundle {
  const sources = loadFromStorage<unknown[]>(STORAGE_KEYS.SOURCES, []);
  const connections = loadFromStorage<Record<string, unknown>[]>(STORAGE_KEYS.CONNECTIONS, []);
  const favorites = loadFromStorage<unknown[]>(STORAGE_KEYS.FAVORITES, []);
  const dashboards = loadFromStorage<unknown[]>(STORAGE_KEYS.DASHBOARDS, []);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sources: sources.map(stripSecrets),
    connections: connections.map(stripSecrets),
    favorites,
    dashboards,
  };
}

/**
 * Download the export bundle as a JSON file.
 */
export function downloadExport(filename?: string): void {
  const bundle = exportAllData();
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `dsfr-data-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Import data from a JSON bundle, merging with existing data (upsert by ID).
 * Returns counts of imported items.
 */
export function importData(bundle: unknown): ImportResult {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('Format invalide : objet JSON attendu');
  }

  const data = bundle as Record<string, unknown>;
  if (data.version !== 1) {
    throw new Error(`Version non supportee : ${data.version}`);
  }

  const result: ImportResult = {
    sources: 0,
    connections: 0,
    favorites: 0,
    dashboards: 0,
    skipped: 0,
  };

  // Import sources
  if (Array.isArray(data.sources)) {
    const existing = loadFromStorage<Record<string, unknown>[]>(STORAGE_KEYS.SOURCES, []);
    const existingIds = new Set(existing.map((s) => (s as { id?: string }).id));

    for (const raw of data.sources) {
      const validated = validateSource(raw);
      if (!validated) {
        result.skipped++;
        continue;
      }
      if (existingIds.has(validated.id)) {
        // Update existing
        const idx = existing.findIndex((s) => (s as { id?: string }).id === validated.id);
        if (idx >= 0) existing[idx] = validated as unknown as Record<string, unknown>;
      } else {
        existing.push(validated as unknown as Record<string, unknown>);
      }
      result.sources++;
    }
    saveToStorage(STORAGE_KEYS.SOURCES, existing);
  }

  // Import connections
  if (Array.isArray(data.connections)) {
    const existing = loadFromStorage<Record<string, unknown>[]>(STORAGE_KEYS.CONNECTIONS, []);
    const existingIds = new Set(existing.map((c) => (c as { id?: string }).id));

    for (const raw of data.connections) {
      const validated = validateConnection(raw);
      if (!validated) {
        result.skipped++;
        continue;
      }
      const id = validated.id as string;
      if (existingIds.has(id)) {
        const idx = existing.findIndex((c) => (c as { id?: string }).id === id);
        if (idx >= 0) existing[idx] = validated;
      } else {
        existing.push(validated);
      }
      result.connections++;
    }
    saveToStorage(STORAGE_KEYS.CONNECTIONS, existing);
  }

  // Import favorites
  if (Array.isArray(data.favorites)) {
    const existing = loadFromStorage<Record<string, unknown>[]>(STORAGE_KEYS.FAVORITES, []);
    const existingIds = new Set(existing.map((f) => (f as { id?: string }).id));

    for (const raw of data.favorites) {
      const validated = validateFavorite(raw);
      if (!validated) {
        result.skipped++;
        continue;
      }
      const id = validated.id as string;
      if (existingIds.has(id)) {
        const idx = existing.findIndex((f) => (f as { id?: string }).id === id);
        if (idx >= 0) existing[idx] = validated;
      } else {
        existing.push(validated);
      }
      result.favorites++;
    }
    saveToStorage(STORAGE_KEYS.FAVORITES, existing);
  }

  // Import dashboards
  if (Array.isArray(data.dashboards)) {
    const existing = loadFromStorage<Record<string, unknown>[]>(STORAGE_KEYS.DASHBOARDS, []);
    const existingIds = new Set(existing.map((d) => (d as { id?: string }).id));

    for (const raw of data.dashboards) {
      const validated = validateDashboard(raw);
      if (!validated) {
        result.skipped++;
        continue;
      }
      const id = validated.id as string;
      if (existingIds.has(id)) {
        const idx = existing.findIndex((d) => (d as { id?: string }).id === id);
        if (idx >= 0) existing[idx] = validated;
      } else {
        existing.push(validated);
      }
      result.dashboards++;
    }
    saveToStorage(STORAGE_KEYS.DASHBOARDS, existing);
  }

  return result;
}

/**
 * Read a File as JSON and import the data.
 */
export async function importFromFile(file: File): Promise<ImportResult> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Fichier JSON invalide');
  }
  return importData(parsed);
}
