/**
 * Recalcul INDÉPENDANT : tableaux nus, aucune importation de `packages/`.
 * Écrit à part de la bibliothèque, exprès — le test-garde `tests/oracle/guard.test.ts`
 * refuse tout import vers `packages/` ou `@dsfr-data/`. Si la lib et ce fichier
 * se trompent, ce n'est pas de la même façon.
 */
import type { Agg, ExpectGroupBy, RowFilter } from './manifest.js';

export type Row = Record<string, unknown>;

/** Nombre lisible : nombre JS, ou chaîne numérique (point ou virgule décimale). */
export function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function applyFilter(rows: Row[], filter?: RowFilter): Row[] {
  if (!filter) return rows;
  if (filter.op === 'isnotnull') {
    return rows.filter((r) => r[filter.field] !== null && r[filter.field] !== undefined);
  }
  return rows.filter((r) => String(r[filter.field]) === String(filter.value));
}

export function aggregate(rows: Row[], agg: Agg, field?: string): number | null {
  if (agg === 'count') {
    // count sans champ : lignes ; avec champ : valeurs non nulles.
    if (!field) return rows.length;
    return rows.filter((r) => r[field] !== null && r[field] !== undefined && r[field] !== '')
      .length;
  }
  if (!field) throw new Error(`${agg} exige un champ`);
  const nums = rows.map((r) => toNum(r[field])).filter((n): n is number => n !== null);
  if (nums.length === 0) return null;
  switch (agg) {
    case 'sum':
      return nums.reduce((a, b) => a + b, 0);
    case 'avg':
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'min':
      return Math.min(...nums);
    case 'max':
      return Math.max(...nums);
  }
}

/** Group-by en tableaux nus : une ligne par valeur distincte de `by`, colonnes agrégées. */
export function groupBy(rows: Row[], spec: ExpectGroupBy): Row[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r[spec.by] === null || r[spec.by] === undefined ? '' : String(r[spec.by]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  let out: Row[] = [...groups.entries()].map(([key, members]) => {
    const row: Row = { [spec.by]: key };
    for (const [name, col] of Object.entries(spec.columns)) {
      row[name] = aggregate(members, col.agg, col.field);
    }
    return row;
  });
  if (spec.orderBy) {
    const { column, dir } = spec.orderBy;
    out.sort((a, b) => {
      const x = toNum(a[column]) ?? -Infinity;
      const y = toNum(b[column]) ?? -Infinity;
      return dir === 'desc' ? y - x : x - y;
    });
  }
  if (spec.limit !== undefined) out = out.slice(0, spec.limit);
  return out;
}

/** Arrondi à `decimals` décimales, comme l'affichage du KPI. */
export function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Lecture d'un nombre affiché en fr-FR par la lib : espaces (fines ou
 * insécables) de milliers, virgule décimale, unité ou symbole en suffixe.
 */
export function parseDisplayedNumber(text: string): number | null {
  const cleaned = text
    .replace(/[\u202f\u00a0\s]/g, '')
    .replace(/[^0-9,.\-−]/g, '')
    .replace('−', '-')
    .replace(',', '.');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Égalité à la précision affichée (± un demi-pas de la dernière décimale), sinon exacte. */
export function closeEnough(observed: number, expected: number, decimals = 0): boolean {
  const tol = decimals > 0 ? 0.5 / 10 ** decimals + 1e-9 : 0.5;
  return Math.abs(observed - expected) <= tol;
}
