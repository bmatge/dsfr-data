/**
 * Runtime data validation for stored objects.
 *
 * Unlike TypeScript casts (`as T`), these functions actually check the data at runtime.
 * Invalid items are logged and filtered out rather than causing crashes.
 */

import type { Source } from '../types/source.js';

/** Validate a Source object — returns null if invalid */
export function validateSource(raw: unknown): Source | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== 'string' || !obj.id) return null;
  if (typeof obj.name !== 'string' || !obj.name) return null;
  if (typeof obj.type !== 'string') return null;

  return obj as unknown as Source;
}

/** Validate a Connection object — returns null if invalid */
export function validateConnection(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== 'string' || !obj.id) return null;
  if (typeof obj.name !== 'string' || !obj.name) return null;
  if (typeof obj.type !== 'string') return null;

  return obj;
}

/** Validate a Favorite object — returns null if invalid */
export function validateFavorite(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== 'string' || !obj.id) return null;
  if (typeof obj.name !== 'string' || !obj.name) return null;
  if (typeof obj.code !== 'string' || !obj.code) return null;

  return obj;
}

/** Validate a Dashboard object — returns null if invalid */
export function validateDashboard(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== 'string' || !obj.id) return null;
  if (typeof obj.name !== 'string' || !obj.name) return null;

  return obj;
}

/**
 * Validate and filter an array of items.
 * Invalid items are logged and removed.
 */
export function validateAndFilterArray<T>(
  items: unknown[],
  validator: (item: unknown) => T | null,
  label: string,
): T[] {
  const valid: T[] = [];
  for (const item of items) {
    const validated = validator(item);
    if (validated) {
      valid.push(validated);
    } else {
      console.warn(`[validation] Invalid ${label} item dropped:`, item);
    }
  }
  return valid;
}
