/**
 * Runtime data validation for stored objects.
 *
 * Unlike TypeScript casts (`as T`), these functions actually check the data at runtime.
 * Invalid items are logged and filtered out rather than causing crashes.
 *
 * Durci pour l'import de bundles JSON non fiables (#316) :
 * - les clés dangereuses (`__proto__`, `constructor`, `prototype`) sont
 *   retirées récursivement (un spread/assign aval sur l'objet stocké
 *   déclencherait sinon une pollution de prototype) ;
 * - les champs optionnels connus sont typés — un champ au mauvais type est
 *   retiré plutôt que stocké tel quel ;
 * - le `code` des favoris (HTML exécuté dans la preview sandboxée) est borné.
 */

import type { Source } from '../types/source.js';
import { isUnsafeKey } from '../utils/security.js';

/** Taille max du code HTML d'un favori importé (largement au-dessus des widgets réels). */
export const MAX_FAVORITE_CODE_LENGTH = 200_000;

/**
 * Retire récursivement les clés dangereuses d'une valeur issue de JSON.parse.
 * Retourne une copie (les objets importés ne sont jamais mutés en place).
 */
function stripUnsafeKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUnsafeKeys(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (isUnsafeKey(key)) continue;
      out[key] = stripUnsafeKeys((value as Record<string, unknown>)[key]);
    }
    return out as T;
  }
  return value;
}

type FieldType =
  | 'string'
  | 'string-or-null'
  | 'boolean'
  | 'number'
  | 'object-array'
  | 'string-record';

/** Retire les champs optionnels dont la valeur ne correspond pas au type attendu. */
function dropMistypedFields(obj: Record<string, unknown>, spec: Record<string, FieldType>): void {
  for (const [field, type] of Object.entries(spec)) {
    if (obj[field] === undefined) continue;
    const v = obj[field];
    const ok =
      type === 'string'
        ? typeof v === 'string'
        : type === 'string-or-null'
          ? typeof v === 'string' || v === null
          : type === 'boolean'
            ? typeof v === 'boolean'
            : type === 'number'
              ? typeof v === 'number' && Number.isFinite(v)
              : type === 'object-array'
                ? Array.isArray(v) && v.every((e) => e && typeof e === 'object')
                : /* string-record */ v !== null &&
                  typeof v === 'object' &&
                  !Array.isArray(v) &&
                  Object.values(v).every((e) => typeof e === 'string');
    if (!ok) delete obj[field];
  }
}

/** Validate a Source object — returns null if invalid */
export function validateSource(raw: unknown): Source | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = stripUnsafeKeys(raw as Record<string, unknown>);

  if (typeof obj.id !== 'string' || !obj.id) return null;
  if (typeof obj.name !== 'string' || !obj.name) return null;
  if (typeof obj.type !== 'string') return null;

  dropMistypedFields(obj, {
    provider: 'string',
    apiUrl: 'string',
    method: 'string',
    headers: 'string-or-null',
    dataPath: 'string-or-null',
    documentId: 'string',
    tableId: 'string',
    apiKey: 'string-or-null',
    isPublic: 'boolean',
    data: 'object-array',
    rawRecords: 'object-array',
    recordCount: 'number',
    resourceIds: 'string-record',
    connectionId: 'string',
    leftSourceId: 'string',
    rightSourceId: 'string',
    joinOn: 'string',
    joinType: 'string',
    joinPrefixRight: 'string',
  });

  return obj as unknown as Source;
}

/** Validate a Connection object — returns null if invalid */
export function validateConnection(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = stripUnsafeKeys(raw as Record<string, unknown>);

  if (typeof obj.id !== 'string' || !obj.id) return null;
  if (typeof obj.name !== 'string' || !obj.name) return null;
  if (typeof obj.type !== 'string') return null;

  dropMistypedFields(obj, {
    url: 'string',
    baseUrl: 'string',
    apiKey: 'string-or-null',
    method: 'string',
  });

  return obj;
}

/** Validate a Favorite object — returns null if invalid */
export function validateFavorite(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = stripUnsafeKeys(raw as Record<string, unknown>);

  if (typeof obj.id !== 'string' || !obj.id) return null;
  if (typeof obj.name !== 'string' || !obj.name) return null;
  if (typeof obj.code !== 'string' || !obj.code) return null;
  // Le code est du HTML execute dans la preview (iframe sandboxee) : on borne
  // sa taille pour qu'un bundle forge ne puisse pas saturer le localStorage.
  if (obj.code.length > MAX_FAVORITE_CODE_LENGTH) return null;

  return obj;
}

/** Validate a Dashboard object — returns null if invalid */
export function validateDashboard(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = stripUnsafeKeys(raw as Record<string, unknown>);

  if (typeof obj.id !== 'string' || !obj.id) return null;
  if (typeof obj.name !== 'string' || !obj.name) return null;

  return obj;
}

/**
 * Validate and filter an array of items.
 * Invalid items are logged (id/name only — never the full object, which may
 * carry secrets) and removed.
 */
export function validateAndFilterArray<T>(
  items: unknown[],
  validator: (item: unknown) => T | null,
  label: string
): T[] {
  const valid: T[] = [];
  for (const item of items) {
    const validated = validator(item);
    if (validated) {
      valid.push(validated);
    } else {
      const hint =
        item && typeof item === 'object'
          ? ((item as Record<string, unknown>).id ?? (item as Record<string, unknown>).name ?? '?')
          : String(item);
      console.warn(`[validation] Invalid ${label} item dropped (id/name: ${String(hint)})`);
    }
  }
  return valid;
}
