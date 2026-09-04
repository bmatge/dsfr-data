/**
 * Unified Source interface shared across all apps (sources, builder, builder-ia).
 *
 * Replaces the 3 independent Source definitions that existed before:
 * - apps/sources/src/state.ts (14 fields)
 * - apps/builder/src/state.ts  (10 fields)
 * - apps/builder-ia/src/state.ts (6 fields)
 */

import type { ProviderId } from '../providers/provider-config.js';
import type { JoinType } from '../utils/join.js';
import { detectProvider, extractResourceIds } from '../providers/index.js';

export interface Source {
  id: string;
  name: string;

  // --- Type and provider ---
  /** High-level source type */
  type: 'grist' | 'api' | 'manual' | 'join';
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

  // --- Join specific ---
  /** ID of the left source (for join type) */
  leftSourceId?: string;
  /** ID of the right source (for join type) */
  rightSourceId?: string;
  /** Join key expression: "field", "left_field=right_field", or comma-separated */
  joinOn?: string;
  /** Join type: inner, left, right, full */
  joinType?: JoinType;
  /** Prefix for right-side colliding fields */
  joinPrefixRight?: string;
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
    if (cfg.headers !== undefined && source.headers === undefined)
      source.headers = cfg.headers as string | null;
    if (cfg.dataPath !== undefined && source.dataPath === undefined)
      source.dataPath = cfg.dataPath as string | null;
    if (cfg.connectionId && !source.connectionId) source.connectionId = cfg.connectionId as string;
    if (cfg.documentId && !source.documentId) source.documentId = cfg.documentId as string;
    if (cfg.tableId && !source.tableId) source.tableId = cfg.tableId as string;
    if (cfg.apiKey !== undefined && source.apiKey === undefined)
      source.apiKey = cfg.apiKey as string | null;
    if (cfg.isPublic !== undefined && source.isPublic === undefined)
      source.isPublic = cfg.isPublic as boolean;
    if (cfg.provider && !source.provider) source.provider = cfg.provider as ProviderId;
    if (cfg.resourceIds && !source.resourceIds)
      source.resourceIds = cfg.resourceIds as Record<string, string>;
    if (cfg.leftSourceId && !source.leftSourceId) source.leftSourceId = cfg.leftSourceId as string;
    if (cfg.rightSourceId && !source.rightSourceId)
      source.rightSourceId = cfg.rightSourceId as string;
    if (cfg.joinOn && !source.joinOn) source.joinOn = cfg.joinOn as string;
    if (cfg.joinType && !source.joinType) source.joinType = cfg.joinType as JoinType;
    if (cfg.joinPrefixRight !== undefined && source.joinPrefixRight === undefined)
      source.joinPrefixRight = cfg.joinPrefixRight as string;
  }

  // data_json → data
  const dataJson = source.data_json ?? source.dataJson;
  if (dataJson && Array.isArray(dataJson) && !source.data) {
    source.data = dataJson as Record<string, unknown>[];
  }

  // Clean up server-only fields
  for (const key of [
    'config_json',
    'configJson',
    'data_json',
    'dataJson',
    'record_count',
    'owner_id',
    'created_at',
    'updated_at',
    '_owned',
    '_permissions',
  ]) {
    delete source[key];
  }

  // --- Legacy migration: auto-detect provider ---

  if (!source.provider) {
    if (source.type === 'grist') {
      source.provider = 'grist';
    } else if (source.type === 'join') {
      source.provider = 'generic';
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
  if (source.leftSourceId) configJson.leftSourceId = source.leftSourceId;
  if (source.rightSourceId) configJson.rightSourceId = source.rightSourceId;
  if (source.joinOn) configJson.joinOn = source.joinOn;
  if (source.joinType) configJson.joinType = source.joinType;
  if (source.joinPrefixRight !== undefined) configJson.joinPrefixRight = source.joinPrefixRight;

  return {
    id: source.id,
    name: source.name,
    type: source.type,
    configJson,
    dataJson: source.data || null,
    recordCount: source.recordCount || 0,
  };
}

/**
 * Passage de bras entre l'app Sources et les builders (#592).
 *
 * `SELECTED_SOURCE` designe la source que l'utilisateur vient d'ouvrir ; les
 * lignes, elles, vivent deja dans `SOURCES` sous le meme id. Les ecrire une
 * seconde fois faisait consommer ~5,4 Mo de quota localStorage pour 2,7 Mo de
 * donnees, et l'ecriture etait refusee au-dela (#586, toast « Espace de
 * stockage plein »).
 *
 * On ne persiste donc que le **pointeur** : tout le descripteur sauf les
 * lignes. `resolveSelectedSource()` les rebranche depuis `SOURCES` a la
 * lecture.
 */
export function toSourcePointer(source: Source): Source {
  const { data: _data, rawRecords: _rawRecords, ...pointer } = source;
  return {
    ...pointer,
    // Le compteur survit au retrait des lignes : les libelles d'option
    // (« Nom · N lignes ») et les gardes « la source a-t-elle des donnees »
    // s'appuient dessus, pas sur `data.length`.
    recordCount: source.recordCount ?? source.data?.length ?? 0,
  };
}

/**
 * Rebranche les lignes d'un pointeur `SELECTED_SOURCE` depuis la liste `SOURCES`.
 *
 * Retourne `null` si aucune source n'est designee. Si le pointeur porte encore
 * ses lignes (entree ecrite avant #592, ou source absente de `SOURCES`), on les
 * garde : la lecture reste compatible avec l'ancien format.
 */
export function resolveSelectedSource(
  pointer: Source | null | undefined,
  sources: Source[]
): Source | null {
  if (!pointer) return null;
  if (pointer.data && pointer.data.length > 0) return pointer;

  const stored = sources.find((s) => s.id === pointer.id);
  if (!stored) return pointer;

  return { ...pointer, data: stored.data, rawRecords: stored.rawRecords };
}
