/**
 * Pure join utility — performs in-memory joins on two arrays of rows.
 *
 * Extracted from dsfr-data-join so it can be reused by the sources app
 * (join modal) without depending on Lit or the data-bridge.
 */

type Row = Record<string, unknown>;

export type JoinType = 'inner' | 'left' | 'right' | 'full';

export interface JoinKey {
  left: string;
  right: string;
}

export interface JoinOptions {
  /** Join key expression: "field", "left=right", or comma-separated multi-key */
  on: string;
  /** Join type (default: 'left') */
  type?: JoinType;
  /** Prefix for left-side fields on collision (default: '') */
  prefixLeft?: string;
  /** Prefix for right-side fields on collision (default: 'right_') */
  prefixRight?: string;
}

/**
 * Parse an `on` expression into an array of JoinKey.
 *
 * Supported formats:
 * - "code_dept" → [{ left: "code_dept", right: "code_dept" }]
 * - "dept_code=code" → [{ left: "dept_code", right: "code" }]
 * - "annee,code_region" → multi-key
 */
export function parseJoinKeys(on: string): JoinKey[] {
  return on.split(',').map(part => {
    const trimmed = part.trim();
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      return {
        left: trimmed.substring(0, eqIndex).trim(),
        right: trimmed.substring(eqIndex + 1).trim(),
      };
    }
    return { left: trimmed, right: trimmed };
  });
}

/**
 * Perform an in-memory join of two datasets. O(n+m) via Map indexing.
 */
export function performJoin(
  leftData: Row[],
  rightData: Row[],
  options: JoinOptions,
): Row[] {
  const keys = parseJoinKeys(options.on);
  const joinType: JoinType = options.type ?? 'left';
  const prefixLeft = options.prefixLeft ?? '';
  const prefixRight = options.prefixRight ?? 'right_';

  const leftKeyFields = keys.map(k => k.left);
  const rightKeyFields = keys.map(k => k.right);
  const joinKeyFieldSet = new Set([...leftKeyFields, ...rightKeyFields]);

  // Detect field-name collisions once (from first rows)
  const collisions = detectCollisions(
    leftData[0] ?? null,
    rightData[0] ?? null,
    joinKeyFieldSet,
  );

  // Index the right side by key
  const rightIndex = new Map<string, Row[]>();
  for (const row of rightData) {
    const k = buildKey(row, rightKeyFields);
    if (!rightIndex.has(k)) rightIndex.set(k, []);
    rightIndex.get(k)!.push(row);
  }

  const result: Row[] = [];

  if (joinType === 'inner' || joinType === 'left') {
    for (const leftRow of leftData) {
      const k = buildKey(leftRow, leftKeyFields);
      const matches = rightIndex.get(k);
      if (matches) {
        for (const rightRow of matches) {
          result.push(mergeRow(leftRow, rightRow, keys, collisions, prefixLeft, prefixRight));
        }
      } else if (joinType === 'left') {
        result.push(mergeRow(leftRow, null, keys, collisions, prefixLeft, prefixRight));
      }
    }
  } else if (joinType === 'right') {
    const leftIndex = new Map<string, Row[]>();
    for (const row of leftData) {
      const k = buildKey(row, leftKeyFields);
      if (!leftIndex.has(k)) leftIndex.set(k, []);
      leftIndex.get(k)!.push(row);
    }
    for (const rightRow of rightData) {
      const k = buildKey(rightRow, rightKeyFields);
      const matches = leftIndex.get(k);
      if (matches) {
        for (const leftRow of matches) {
          result.push(mergeRow(leftRow, rightRow, keys, collisions, prefixLeft, prefixRight));
        }
      } else {
        result.push(mergeRow(null, rightRow, keys, collisions, prefixLeft, prefixRight));
      }
    }
  } else if (joinType === 'full') {
    const matchedRightKeys = new Set<string>();
    for (const leftRow of leftData) {
      const k = buildKey(leftRow, leftKeyFields);
      const matches = rightIndex.get(k);
      if (matches) {
        matchedRightKeys.add(k);
        for (const rightRow of matches) {
          result.push(mergeRow(leftRow, rightRow, keys, collisions, prefixLeft, prefixRight));
        }
      } else {
        result.push(mergeRow(leftRow, null, keys, collisions, prefixLeft, prefixRight));
      }
    }
    for (const rightRow of rightData) {
      const k = buildKey(rightRow, rightKeyFields);
      if (!matchedRightKeys.has(k)) {
        result.push(mergeRow(null, rightRow, keys, collisions, prefixLeft, prefixRight));
      }
    }
  }

  return result;
}

// --- Internal helpers (not exported) ---

function buildKey(row: Row, fields: string[]): string {
  return fields.map(f => String(row[f] ?? '')).join('|');
}

function detectCollisions(
  leftRow: Row | null,
  rightRow: Row | null,
  joinKeyFields: Set<string>,
): Set<string> {
  if (!leftRow || !rightRow) return new Set();
  const leftFields = new Set(Object.keys(leftRow));
  const collisions = new Set<string>();
  for (const field of Object.keys(rightRow)) {
    if (leftFields.has(field) && !joinKeyFields.has(field)) {
      collisions.add(field);
    }
  }
  return collisions;
}

function mergeRow(
  leftRow: Row | null,
  rightRow: Row | null,
  keys: JoinKey[],
  collisions: Set<string>,
  prefixLeft: string,
  prefixRight: string,
): Row {
  const result: Row = {};

  // Left fields
  if (leftRow) {
    for (const [field, value] of Object.entries(leftRow)) {
      const key = collisions.has(field) && prefixLeft
        ? `${prefixLeft}${field}` : field;
      result[key] = value;
    }
  }

  // Right fields
  const rightKeyFields = new Set(keys.map(k => k.right));
  if (rightRow) {
    for (const [field, value] of Object.entries(rightRow)) {
      // Don't duplicate join keys
      if (rightKeyFields.has(field)) {
        const leftKeyField = keys.find(k => k.right === field)!.left;
        if (!leftRow) {
          result[leftKeyField] = value;
        }
        continue;
      }
      const key = collisions.has(field)
        ? `${prefixRight}${field}` : field;
      result[key] = value;
    }
  }

  return result;
}
