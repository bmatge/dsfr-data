/**
 * Unified Source interface shared across all apps (sources, builder, builder-ia).
 *
 * Replaces the 3 independent Source definitions that existed before:
 * - apps/sources/src/state.ts (14 fields)
 * - apps/builder/src/state.ts  (10 fields)
 * - apps/builder-ia/src/state.ts (6 fields)
 */

import type { ProviderId } from '../providers/provider-config.js';
import { detectProvider, extractResourceIds } from '../providers/index.js';

export interface Source {
  id: string;
  name: string;

  // --- Type and provider ---
  /** High-level source type */
  type: 'grist' | 'api' | 'manual';
  /** Auto-detected provider (opendatasoft, tabular, grist, generic) */
  provider?: ProviderId;

  // --- Connection ---
  apiUrl?: string;
  method?: string;
  headers?: string | null;
  dataPath?: string | null;

  // --- Resource IDs (extracted from URL by provider) ---
  resourceIds?: Record<string, string>;

  // --- Grist specific ---
  documentId?: string;
  tableId?: string;
  apiKey?: string | null;
  isPublic?: boolean;

  // --- Loaded data ---
  data?: Record<string, unknown>[];
  rawRecords?: Array<{ fields: Record<string, unknown> }>;
  recordCount?: number;

  // --- Origin connection ---
  connectionId?: string;
}

/**
 * Migrate a source from legacy or server format to the unified client format.
 *
 * Handles:
 * - Legacy sources (without provider field) → auto-detect provider
 * - Server format (snake_case columns, config_json/data_json blobs) → unpack to flat fields
 */
export function migrateSource(raw: Partial<Source>): Source {
  const source = { ...raw } as Source & Record<string, unknown>;

  // --- Server format: unpack snake_case and JSON blobs ---
  // (server returns record_count, config_json, data_json instead of client-side fields)

  // record_count → recordCount
  if (source.record_count !== undefined && source.recordCount === undefined) {
    source.recordCount = source.record_count as number;
  }

  // config_json → unpack connection details to flat fields
  const configJson = source.config_json ?? source.configJson;
  if (configJson && typeof configJson === 'object') {
    const cfg = configJson as Record<string, unknown>;
    if (cfg.apiUrl && !source.apiUrl) source.apiUrl = cfg.apiUrl as string;
    if (cfg.method && !source.method) source.method = cfg.method as string;
    if (cfg.headers !== undefined && source.headers === undefined) source.headers = cfg.headers as string | null;
    if (cfg.dataPath !== undefined && source.dataPath === undefined) source.dataPath = cfg.dataPath as string | null;
    if (cfg.connectionId && !source.connectionId) source.connectionId = cfg.connectionId as string;
    if (cfg.documentId && !source.documentId) source.documentId = cfg.documentId as string;
    if (cfg.tableId && !source.tableId) source.tableId = cfg.tableId as string;
    if (cfg.apiKey !== undefined && source.apiKey === undefined) source.apiKey = cfg.apiKey as string | null;
    if (cfg.isPublic !== undefined && source.isPublic === undefined) source.isPublic = cfg.isPublic as boolean;
    if (cfg.provider && !source.provider) source.provider = cfg.provider as ProviderId;
    if (cfg.resourceIds && !source.resourceIds) source.resourceIds = cfg.resourceIds as Record<string, string>;
  }

  // data_json → data
  const dataJson = source.data_json ?? source.dataJson;
  if (dataJson && Array.isArray(dataJson) && !source.data) {
    source.data = dataJson as Record<string, unknown>[];
  }

  // Clean up server-only fields
  for (const key of ['config_json', 'configJson', 'data_json', 'dataJson',
    'record_count', 'owner_id', 'created_at', 'updated_at', '_owned', '_permissions']) {
    delete source[key];
  }

  // --- Legacy migration: auto-detect provider ---

  if (!source.provider) {
    if (source.type === 'grist') {
      source.provider = 'grist';
    } else if (source.type === 'api' && source.apiUrl) {
      source.provider = detectProvider(source.apiUrl).id;
    } else {
      source.provider = 'generic';
    }
  }

  // Auto-extract resource IDs if missing
  if (!source.resourceIds && source.apiUrl && source.provider !== 'generic') {
    const ids = extractResourceIds(source.apiUrl);
    if (ids) source.resourceIds = ids;
  }

  return source as Source;
}

/**
 * Serialize a Source to the server-expected format.
 *
 * Packs flat client fields into the DB column structure:
 * - Connection details → configJson (maps to config_json)
 * - data → dataJson (maps to data_json)
 * - recordCount stays as-is (server camelCase helper maps to record_count)
 */
export function serializeSourceForServer(source: Source): Record<string, unknown> {
  const configJson: Record<string, unknown> = {};
  if (source.apiUrl) configJson.apiUrl = source.apiUrl;
  if (source.method) configJson.method = source.method;
  if (source.headers !== undefined) configJson.headers = source.headers;
  if (source.dataPath !== undefined) configJson.dataPath = source.dataPath;
  if (source.connectionId) configJson.connectionId = source.connectionId;
  if (source.documentId) configJson.documentId = source.documentId;
  if (source.tableId) configJson.tableId = source.tableId;
  if (source.apiKey !== undefined) configJson.apiKey = source.apiKey;
  if (source.isPublic !== undefined) configJson.isPublic = source.isPublic;
  if (source.provider) configJson.provider = source.provider;
  if (source.resourceIds) configJson.resourceIds = source.resourceIds;

  return {
    id: source.id,
    name: source.name,
    type: source.type,
    configJson,
    dataJson: source.data || null,
    recordCount: source.recordCount || 0,
  };
}
