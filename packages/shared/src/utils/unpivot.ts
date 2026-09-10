/**
 * Pure unpivot (melt) utility — turns a "wide" table into a "long/tidy" one.
 *
 * A wide table encodes a dimension (often time) in the column NAMES
 * (`c2023_01`, `c2023_02`, …). The dsfr-data pipeline expects tidy data
 * (one observation per row). This utility performs the column → row melt
 * declaratively, with no dependency on Lit or the data-bridge so it can be
 * reused outside the component.
 *
 * It is the exact inverse of a pivot.
 */

import type { AliasedColumn } from './aliased-columns.js';

type Row = Record<string, unknown>;

export interface UnpivotOptions {
  /** Columns kept as-is on every emitted row (the "identifier" columns). */
  idCols?: string[];
  /**
   * Explicit list of columns to melt. Mutually exclusive with `valueColsPattern`.
   * An entry may carry a display label (`{ key, label }`, inline alias
   * `col:Libellé` — #668): the melted key is then the label instead of the
   * column name.
   */
  valueCols?: Array<string | AliasedColumn>;
  /**
   * Pattern matching the columns to melt, with `{TOKEN}` placeholders.
   * Known date tokens have fixed widths: `YYYY` (4 digits), `YY`/`MM`/`DD`/`HH`
   * (2 digits), `Q` (1 digit). Any other `{name}` matches a generic segment.
   * Ex: `"c{YYYY}_{MM}"` matches `c2023_01`.
   */
  valueColsPattern?: string;
  /** Name of the new "variable" column holding the melted key. Default: `"variable"`. */
  varName?: string;
  /**
   * Optional reformat of the melted key, using the tokens captured by
   * `valueColsPattern`. Ex: `"{YYYY}-{MM}"` turns `c2023_01` → `2023-01`.
   * Ignored when no pattern is provided (the key is then the column name).
   */
  varFormat?: string;
  /** Name of the new "value" column holding the cell value. Default: `"value"`. */
  valueName?: string;
  /** Skip emitting a row when the melted cell is null / undefined / "". Default: false. */
  dropEmpty?: boolean;
}

const TOKEN_RE = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Regex character class for a pattern token. Fixed widths for known date tokens. */
function tokenClass(token: string): string {
  switch (token) {
    case 'YYYY':
      return '\\d{4}';
    case 'YY':
    case 'MM':
    case 'DD':
    case 'HH':
      return '\\d{2}';
    case 'Q':
      return '\\d';
    default:
      // A generic segment: anything but common separators / whitespace.
      return '[^_\\-/.\\s]+';
  }
}

interface CompiledPattern {
  regex: RegExp;
  tokens: string[];
}

/**
 * Compile a `{TOKEN}` pattern into an anchored regex with named capture groups.
 * Exported for testing.
 */
export function compileColsPattern(pattern: string): CompiledPattern {
  const tokens: string[] = [];
  let regexStr = '';
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(pattern)) !== null) {
    regexStr += escapeRegex(pattern.slice(lastIndex, m.index));
    const token = m[1];
    // Guard against duplicate token names (invalid named groups in JS regex).
    if (!tokens.includes(token)) {
      tokens.push(token);
      regexStr += `(?<${token}>${tokenClass(token)})`;
    } else {
      regexStr += tokenClass(token);
    }
    lastIndex = m.index + m[0].length;
  }
  regexStr += escapeRegex(pattern.slice(lastIndex));
  // regexStr is built only from escaped literal segments + fixed token classes
  // (no raw user input reaches the regex), so this is safe.
  // eslint-disable-next-line security/detect-non-literal-regexp
  return { regex: new RegExp(`^${regexStr}$`), tokens };
}

/** Apply `varFormat` using the named groups captured from a column name. */
function formatVar(varFormat: string, groups: Record<string, string> | undefined): string {
  return varFormat.replace(TOKEN_RE, (_full, token: string) => {
    return groups && groups[token] !== undefined ? groups[token] : '';
  });
}

/** Collect the union of column names across all rows (wide tables may be heterogeneous). */
function collectColumns(rows: Row[]): string[] {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row && typeof row === 'object') {
      for (const key of Object.keys(row)) {
        if (!seen.has(key)) {
          seen.add(key);
          cols.push(key);
        }
      }
    }
  }
  return cols;
}

/**
 * Melt a wide dataset into tidy rows.
 *
 * For each input row and each value column, emits a row:
 * `{ ...idCols, [varName]: <key>, [valueName]: <cellValue> }`.
 *
 * The cell value is left RAW (string) — numeric typing is delegated to
 * `dsfr-data-normalize` (`numeric-auto`) downstream.
 */
export function performUnpivot(rows: Row[], options: UnpivotOptions): Row[] {
  const idCols = options.idCols ?? [];
  const varName = options.varName || 'variable';
  const valueName = options.valueName || 'value';
  const dropEmpty = options.dropEmpty ?? false;

  if (!Array.isArray(rows) || rows.length === 0) return [];

  const allColumns = collectColumns(rows);
  const idColSet = new Set(idCols);

  // Determine which columns to melt and how to derive each one's key.
  // valueColMap: column name → derived variable key
  const valueColMap = new Map<string, string>();

  if (options.valueColsPattern) {
    const { regex } = compileColsPattern(options.valueColsPattern);
    for (const col of allColumns) {
      if (idColSet.has(col)) continue;
      const match = regex.exec(col);
      if (match) {
        const key = options.varFormat ? formatVar(options.varFormat, match.groups) : col;
        valueColMap.set(col, key);
      }
    }
  } else if (options.valueCols && options.valueCols.length > 0) {
    for (const entry of options.valueCols) {
      const col = typeof entry === 'string' ? entry : entry.key;
      if (idColSet.has(col)) continue;
      // Explicit list: key is the alias when given, else the column name
      // (varFormat needs a pattern to apply).
      const key = typeof entry === 'string' ? entry : entry.label || col;
      valueColMap.set(col, key);
    }
  } else {
    // No explicit list and no pattern: melt every non-id column.
    for (const col of allColumns) {
      if (!idColSet.has(col)) valueColMap.set(col, col);
    }
  }

  const result: Row[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const carried: Row = {};
    for (const idc of idCols) carried[idc] = (row as Row)[idc];

    for (const [col, key] of valueColMap) {
      const cell = (row as Row)[col];
      if (dropEmpty && (cell === null || cell === undefined || cell === '')) {
        continue;
      }
      result.push({ ...carried, [varName]: key, [valueName]: cell });
    }
  }

  return result;
}
