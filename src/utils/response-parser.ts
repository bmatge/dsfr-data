/**
 * Response parser utilities — extracts data and total count from API
 * responses using ProviderConfig's response structure definition.
 */

import type { ProviderConfig } from '@dsfr-data/shared';
import { getByPath } from './json-path.js';

/**
 * Extract the data array from an API response JSON.
 * Handles dataPath, nestedDataKey, and requiresFlatten.
 */
export function extractData(json: unknown, config: ProviderConfig): unknown[] {
  let data: unknown = config.response.dataPath
    ? getByPath(json, config.response.dataPath)
    : json;

  if (!Array.isArray(data)) {
    data = data != null ? [data] : [];
  }

  // Flatten nested structures (e.g. Grist records[].fields)
  if (config.response.requiresFlatten && config.response.nestedDataKey) {
    const key = config.response.nestedDataKey;
    data = (data as Record<string, unknown>[]).map((r) => {
      const nested = r[key] as Record<string, unknown> | undefined;
      return nested ? { ...nested } : r;
    });
  }

  return data as unknown[];
}

/**
 * Extract the total count from an API response JSON.
 * Returns null if the provider has no totalCountPath.
 */
export function extractTotalCount(json: unknown, config: ProviderConfig): number | null {
  if (!config.response.totalCountPath) return null;
  const count = getByPath(json, config.response.totalCountPath);
  return typeof count === 'number' ? count : null;
}
