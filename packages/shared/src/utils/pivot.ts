/**
 * Pure pivot (cast / spread) utility — turns a "long/tidy" table into a
 * "wide" one (#255). Exact inverse of `performUnpivot`.
 *
 * A long table carries one observation per row (`commune | annee | montant`).
 * The pivot keeps the `row` fields as the row identity, turns every distinct
 * value of the `column` field into a column, and fills each cell with an
 * aggregate of the `value` field.
 *
 * Doctrine (#301) : an empty cell is `null`, never a silent 0 — `sum` on a
 * cell without any numeric value is `null` too. No dependency on Lit or the
 * data-bridge so the function can be reused outside the component.
 */

import { toNumber, looksLikeNumber } from './number-parser.js';
import { unescapeColonValue } from './colon-escape.js';
import { isUnsafeKey } from './security.js';

type Row = Record<string, unknown>;

/** Aggregate functions accepted by the pivot (common pipeline grammar, #303). */
export const PIVOT_AGGREGATES = ['sum', 'count', 'avg', 'min', 'max', 'first', 'last'] as const;

export type PivotAggregate = (typeof PIVOT_AGGREGATES)[number];

export function isPivotAggregate(fn: string): fn is PivotAggregate {
  return (PIVOT_AGGREGATES as readonly string[]).includes(fn);
}

/** Default cap on generated columns (`max-columns`). */
export const PIVOT_DEFAULT_MAX_COLUMNS = 50;

export interface PivotOptions {
  /** Fields forming the row identity (kept as-is on every emitted row). At least one. */
  rowFields: string[];
  /** Field whose distinct values become column names. */
  columnField: string;
  /** Field whose values fill the cells. */
  valueField: string;
  /** Cell reduction when several rows fall in the same cell. Default: `sum`. */
  aggregate?: PivotAggregate;
  /**
   * Order of the generated columns. Default (undefined): order of first
   * appearance in the data. `asc` / `desc` sort the raw values, numerically
   * when they all look numeric, otherwise as French strings.
   */
  columnOrder?: 'asc' | 'desc';
  /**
   * Template of the generated column names, `{value}` = raw value.
   * Ex: `"annee_{value}"` turns `2023` into `annee_2023` (a safe identifier
   * for `compute`). Default: `"{value}"` (the raw value).
   */
  columnFormat?: string;
  /**
   * Display labels keyed by RAW value (`labels="2022:Année 2022 | …"`):
   * a labelled value takes its label as column name, bypassing `columnFormat`.
   */
  labels?: Map<string, string>;
  /** Cap on generated columns (default 50). Beyond, `PivotError` `max-columns`. */
  maxColumns?: number;
}

/** What the pivot did — published in the meta for the trace (#604). */
export interface PivotStats {
  /** Generated columns (one per distinct value of the column field). */
  columns: number;
  /**
   * Row identity fields, in declaration order. With `columnNames`, gives the
   * intended column order of the output — JavaScript enumerates integer-like
   * keys (`2022`, `2023`) BEFORE the others whatever the insertion order, so a
   * consumer deriving its columns from `Object.keys` needs this hint.
   */
  rowFields: string[];
  /** Names of the generated columns, in output order. */
  columnNames: string[];
  /**
   * Cells emitted as `null` : no observation, or no numeric value for a
   * numeric aggregate (`sum`, `avg`…).
   */
  emptyCells: number;
  /** Rows emitted (one per distinct row identity). */
  rows: number;
  /** Input rows ignored because their column field was null / undefined / "". */
  skippedRows: number;
}

export interface PivotResult {
  rows: Row[];
  stats: PivotStats;
}

export type PivotErrorCode = 'max-columns' | 'collision' | 'config';

/**
 * Configuration error raised by `performPivot` — the component turns it into a
 * `reportConfigError` (page error), never into a table.
 */
export class PivotError extends Error {
  readonly code: PivotErrorCode;

  constructor(code: PivotErrorCode, message: string) {
    super(message);
    this.name = 'PivotError';
    this.code = code;
  }
}

/**
 * Parse the `labels` grammar shared with dsfr-data-facets:
 * `"valeur:Libellé | valeur2:Libellé 2"`. A literal `:` or `|` in a value or
 * a label is escaped as `%3A` / `%7C` (escapeColonValue, #315).
 */
export function parsePivotLabels(expr: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!expr) return map;
  for (const pair of expr.split('|')) {
    const sep = pair.indexOf(':');
    if (sep === -1) continue;
    const key = unescapeColonValue(pair.slice(0, sep).trim());
    const label = unescapeColonValue(pair.slice(sep + 1).trim());
    if (key && label) map.set(key, label);
  }
  return map;
}

/** Row identity — distinguishes `null`, `""` and `0`. */
function rowKeyOf(row: Row, fields: string[]): string {
  return JSON.stringify(fields.map((f) => (row[f] === undefined ? null : row[f])));
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/** Chaîne de date ISO (même motif que `aggregations.ts`, #667). */
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Non-blank values, all ISO date strings — or null when any is not. */
function isoDateValues(values: unknown[]): string[] | null {
  const out: string[] = [];
  for (const v of values) {
    if (isBlank(v)) continue;
    if (typeof v !== 'string' || !ISO_DATE_RE.test(v.trim())) return null;
    out.push(v.trim());
  }
  return out.length > 0 ? out : null;
}

function numericValues(values: unknown[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    const n = toNumber(v, true);
    if (n !== null) out.push(n);
  }
  return out;
}

/** Reduce the values of one cell. Empty / non-numeric → null, never 0 (#301). */
function reduceCell(values: unknown[], aggregate: PivotAggregate): unknown {
  if (values.length === 0) return null;
  switch (aggregate) {
    case 'count':
      return values.length;
    case 'first':
      return values[0] === undefined ? null : values[0];
    case 'last':
      return values[values.length - 1] === undefined ? null : values[values.length - 1];
    case 'sum': {
      const nums = numericValues(values);
      return nums.length > 0 ? nums.reduce((acc, v) => acc + v, 0) : null;
    }
    case 'avg': {
      const nums = numericValues(values);
      return nums.length > 0 ? nums.reduce((acc, v) => acc + v, 0) / nums.length : null;
    }
    case 'min':
    case 'max': {
      // Colonne de dates ISO (#667) : ordre lexicographique, AVANT le chemin
      // numérique — toNumber('2026-09-09') vaudrait 2026.
      const dates = isoDateValues(values);
      if (dates) {
        const key = (d: string) => d.replace(' ', 'T');
        return dates.reduce((acc, d) =>
          aggregate === 'min' ? (key(d) < key(acc) ? d : acc) : key(d) > key(acc) ? d : acc
        );
      }
      const nums = numericValues(values);
      if (nums.length > 0) {
        return aggregate === 'min' ? Math.min(...nums) : Math.max(...nums);
      }
      // No numeric value at all (dates ISO, libellés) : lexicographic order.
      const strs = values.filter((v) => !isBlank(v)).map((v) => String(v));
      if (strs.length === 0) return null;
      return strs.reduce((acc, s) =>
        aggregate === 'min' ? (s < acc ? s : acc) : s > acc ? s : acc
      );
    }
    default:
      return null;
  }
}

/** Sort raw column values : numeric when they all look numeric, French strings otherwise. */
function sortRawValues(values: string[], order: 'asc' | 'desc'): string[] {
  const allNumeric = values.every((v) => looksLikeNumber(v));
  const sorted = [...values].sort((a, b) =>
    allNumeric ? toNumber(a) - toNumber(b) : a.localeCompare(b, 'fr', { numeric: true })
  );
  return order === 'desc' ? sorted.reverse() : sorted;
}

/**
 * Pivot a long dataset into wide rows.
 *
 * For each distinct combination of `rowFields`, emits ONE row
 * `{ ...rowFields, [col1]: agg, [col2]: agg, … }` carrying EVERY generated
 * column (a cell without observation is `null`) — the schema is uniform, a
 * downstream `dsfr-data-list` can derive its columns from any row.
 *
 * Throws `PivotError` when the configuration is invalid, when the number of
 * distinct column values exceeds `maxColumns`, or when a generated column
 * name collides with a row field or another generated name.
 */
export function performPivot(rows: Row[], options: PivotOptions): PivotResult {
  const rowFields = (options.rowFields ?? []).map((f) => f.trim()).filter(Boolean);
  const columnField = (options.columnField ?? '').trim();
  const valueField = (options.valueField ?? '').trim();
  const aggregate: PivotAggregate = options.aggregate ?? 'sum';
  const maxColumns = options.maxColumns ?? PIVOT_DEFAULT_MAX_COLUMNS;
  const columnFormat = options.columnFormat || '{value}';
  const labels = options.labels ?? new Map<string, string>();

  if (rowFields.length === 0) {
    throw new PivotError('config', 'attribut "row" requis (champs formant l\'identité de ligne)');
  }
  if (!columnField) {
    throw new PivotError(
      'config',
      'attribut "column" requis (champ dont les valeurs deviennent des colonnes)'
    );
  }
  if (!valueField) {
    throw new PivotError('config', 'attribut "value" requis (champ qui remplit les cellules)');
  }
  if (!isPivotAggregate(aggregate)) {
    throw new PivotError(
      'config',
      `fonction d'agrégat "${String(aggregate)}" inconnue — fonctions acceptées : ${PIVOT_AGGREGATES.join(', ')}`
    );
  }
  if (!Number.isFinite(maxColumns) || maxColumns < 1) {
    throw new PivotError('config', 'attribut "max-columns" : entier positif attendu');
  }

  const input = Array.isArray(rows) ? rows : [];

  // 1. Distinct raw column values (appearance order) + cells.
  const rawValues: string[] = [];
  const rawSeen = new Set<string>();
  const groups = new Map<string, { carried: Row; cells: Map<string, unknown[]> }>();
  let skippedRows = 0;

  for (const row of input) {
    if (!row || typeof row !== 'object') continue;
    const colRaw = row[columnField];
    if (isBlank(colRaw)) {
      skippedRows += 1;
      continue;
    }
    const col = String(colRaw);
    if (!rawSeen.has(col)) {
      rawSeen.add(col);
      rawValues.push(col);
      if (rawValues.length > maxColumns) {
        throw new PivotError(
          'max-columns',
          `plus de ${maxColumns} valeurs distinctes dans "${columnField}" — un pivot sur ce champ ` +
            `produirait autant de colonnes ; choisissez un autre champ, filtrez en amont ` +
            `ou relevez "max-columns"`
        );
      }
    }
    const key = rowKeyOf(row, rowFields);
    let group = groups.get(key);
    if (!group) {
      const carried: Row = {};
      for (const f of rowFields) carried[f] = row[f] === undefined ? null : row[f];
      group = { carried, cells: new Map() };
      groups.set(key, group);
    }
    const cell = group.cells.get(col);
    if (cell) cell.push(row[valueField]);
    else group.cells.set(col, [row[valueField]]);
  }

  // 2. Column order and names.
  const orderedRaw = options.columnOrder
    ? sortRawValues(rawValues, options.columnOrder)
    : rawValues;
  const rowFieldSet = new Set(rowFields);
  const columnNames: string[] = [];
  const nameOf = new Map<string, string>();
  for (const raw of orderedRaw) {
    const name = labels.get(raw) ?? columnFormat.split('{value}').join(raw);
    if (isUnsafeKey(name)) {
      throw new PivotError(
        'collision',
        `la valeur "${raw}" de "${columnField}" produirait la colonne réservée "${name}" — utilisez "column-format" ou "labels"`
      );
    }
    if (rowFieldSet.has(name)) {
      throw new PivotError(
        'collision',
        `la colonne générée "${name}" porte le même nom qu'un champ de "row" — ` +
          `utilisez "column-format" (ex. "${columnField}_{value}") ou "labels"`
      );
    }
    if (nameOf.has(name) || columnNames.includes(name)) {
      throw new PivotError(
        'collision',
        `deux valeurs de "${columnField}" produisent la même colonne "${name}" — vérifiez "labels" / "column-format"`
      );
    }
    nameOf.set(raw, name);
    columnNames.push(name);
  }

  // 3. Emit one row per identity, every column present (null when empty).
  const out: Row[] = [];
  let emptyCells = 0;
  for (const { carried, cells } of groups.values()) {
    const emitted: Row = { ...carried };
    for (const raw of orderedRaw) {
      const values = cells.get(raw);
      if (!values) {
        emptyCells += 1;
        emitted[nameOf.get(raw) as string] = null;
        continue;
      }
      const reduced = reduceCell(values, aggregate);
      if (reduced === null) emptyCells += 1;
      emitted[nameOf.get(raw) as string] = reduced;
    }
    out.push(emitted);
  }

  return {
    rows: out,
    stats: {
      columns: columnNames.length,
      rowFields,
      columnNames,
      emptyCells,
      rows: out.length,
      skippedRows,
    },
  };
}
