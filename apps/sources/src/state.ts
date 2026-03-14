/**
 * Application state for the Sources app.
 * Contains interfaces, types, and the mutable singleton state object.
 */

import { loadFromStorage, STORAGE_KEYS, migrateSource } from '@dsfr-data/shared';
import type { Source } from '@dsfr-data/shared';

// ============================================================
// Types
// ============================================================

export interface GristConnection {
  id: string;
  type: 'grist';
  name: string;
  url: string;
  apiKey: string | null;
  isPublic: boolean;
  status: string;
  statusText: string;
}

export interface ApiConnection {
  id: string;
  type: 'api';
  name: string;
  apiUrl: string;
  method: string;
  headers: string | null;
  dataPath: string | null;
  status: string;
  statusText: string;
}

export type Connection = GristConnection | ApiConnection;

/** Legacy connections may lack a type field. */
export type StoredConnection = Connection & Record<string, unknown>;

export interface GristDocument {
  id: string;
  name: string;
  orgId: number;
  workspaceId: number;
  [key: string]: unknown;
}

export interface GristTable {
  id: string;
  [key: string]: unknown;
}

export interface GristRecord {
  id: number;
  fields: Record<string, unknown>;
}

// Source is imported from @dsfr-data/shared (unified interface)
export type { Source } from '@dsfr-data/shared';

export interface SourcesState {
  connections: StoredConnection[];
  sources: Source[];
  /** ID of the currently selected connection (null = none selected) */
  selectedConnectionId: string | null;
  selectedDocument: string | null;
  selectedTable: string | null;
  documents: GristDocument[];
  tables: GristTable[];
  tableData: GristRecord[] | Record<string, unknown>[];
  /** ID of the connection being edited in the modal (null = creating new) */
  editingConnectionId: string | null;
  previewedSource: Source | null;
  /** Total record count reported by API (e.g. ODS total_count), -1 if unknown */
  apiTotalCount: number;
}

// ============================================================
// Constants
// ============================================================

/** External proxy URL for production / Tauri builds */
export { PROXY_BASE_URL as EXTERNAL_PROXY } from '@dsfr-data/shared';

// ============================================================
// Normalize connections from backend API
// ============================================================

/**
 * Normalize a connection object from the backend API.
 * The backend stores type-specific fields (url, apiKey, apiUrl, method, etc.)
 * inside a `config_json` column. When synced back to localStorage via
 * ApiStorageAdapter, these fields are missing from the top level.
 * This function merges config_json fields back into the connection object.
 */
export function normalizeConnection(conn: StoredConnection): StoredConnection {
  const configJson = conn.config_json;
  if (configJson && typeof configJson === 'object') {
    // Merge config_json fields into top level (config_json takes priority for type-specific fields)
    const config = configJson as Record<string, unknown>;
    const normalized = { ...conn };

    // Restore type from config_json if the top-level type was wrongly set
    if (config.url && !normalized.url) {
      normalized.url = config.url as string;
    }
    if (config.apiKey !== undefined && normalized.apiKey === undefined) {
      normalized.apiKey = config.apiKey as string | null;
    }
    if (config.isPublic !== undefined && normalized.isPublic === undefined) {
      normalized.isPublic = config.isPublic as boolean;
    }
    if (config.apiUrl && !normalized.apiUrl) {
      normalized.apiUrl = config.apiUrl as string;
    }
    if (config.method && !normalized.method) {
      normalized.method = config.method as string;
    }
    if (config.headers !== undefined && normalized.headers === undefined) {
      normalized.headers = config.headers as string | null;
    }
    if (config.dataPath !== undefined && normalized.dataPath === undefined) {
      normalized.dataPath = config.dataPath as string | null;
    }
    if (config.statusText && !normalized.statusText) {
      normalized.statusText = config.statusText as string;
    }

    // Fix type if config_json contains url (indicates grist, not api)
    if (config.url && normalized.type === 'api') {
      (normalized as Record<string, unknown>).type = 'grist';
    }

    return normalized as StoredConnection;
  }
  return conn;
}

/**
 * Normalize an array of connections loaded from storage.
 */
export function normalizeConnections(connections: StoredConnection[]): StoredConnection[] {
  return connections.map(normalizeConnection);
}

// ============================================================
// Module-level mutable state singleton
// ============================================================

export function createInitialState(): SourcesState {
  return {
    connections: normalizeConnections(loadFromStorage<StoredConnection[]>(STORAGE_KEYS.CONNECTIONS, [])),
    sources: loadFromStorage<Source[]>(STORAGE_KEYS.SOURCES, []).map(migrateSource),
    selectedConnectionId: null,
    selectedDocument: null,
    selectedTable: null,
    documents: [],
    tables: [],
    tableData: [],
    editingConnectionId: null,
    previewedSource: null,
    apiTotalCount: -1,
  };
}

/**
 * The mutable application state, shared across all modules.
 * Import this object and mutate it directly (matching the original approach).
 */
export const state: SourcesState = createInitialState();

// ============================================================
// Parsed data from manual source modal (JSON / CSV modes)
// ============================================================

/** Currently active source input mode in the manual-source modal */
export let currentSourceMode = 'table';
export function setCurrentSourceMode(mode: string): void {
  currentSourceMode = mode;
}

/** Parsed JSON data (set by json-parser) */
export let parsedJsonData: Record<string, unknown>[] | null = null;
export function setParsedJsonData(data: Record<string, unknown>[] | null): void {
  parsedJsonData = data;
}

/** Parsed CSV data (set by csv-parser) */
export let parsedCsvData: Record<string, unknown>[] | null = null;
export function setParsedCsvData(data: Record<string, unknown>[] | null): void {
  parsedCsvData = data;
}
