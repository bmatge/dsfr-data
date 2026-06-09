/**
 * Filter translation utilities.
 * Converts dsfr-data-query colon-syntax filters to ODSQL where clauses
 * and applies filters to local data arrays.
 *
 * Aligné sur la couche WHERE partagée (#271/#315) : valeurs percent-décodées
 * après découpage (`unescapeColonValue`), échappement ODSQL des guillemets
 * et antislashes, et parité serveur/local sur les 12 opérateurs
 * (eq, neq, gt, gte, lt, lte, contains, notcontains, in, notin, isnull, isnotnull).
 */

import { unescapeColonValue } from '../utils/colon-escape.js';

/**
 * Échappe une chaîne destinée à être interpolée dans une string ODSQL (`"…"`).
 * Ordre crucial : backslashes d'abord, puis les doubles quotes.
 * (Même implémentation que escapeOdsqlString de l'adapter ODS.)
 */
function escapeOdsql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Nombre simple, éventuellement signé, décimales `.`, notation scientifique. */
// Chaque quantificateur porte sur une classe disjointe du caractère suivant : pas de backtracking exponentiel.
// eslint-disable-next-line security/detect-unsafe-regex
const PLAIN_NUMBER = /^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/**
 * Littéral ODSQL : numérique non quoté pour les comparaisons arithmétiques,
 * sinon string quotée échappée.
 */
function odsqlLiteral(value: string, preferNumeric: boolean): string {
  if (preferNumeric && PLAIN_NUMBER.test(value.trim())) return value.trim();
  return `"${escapeOdsql(value)}"`;
}

/**
 * Convert a dsfr-data-query filter expression (field:operator:value) to an ODSQL where clause.
 * Supports 12 operators: eq, neq, gt, gte, lt, lte, contains, notcontains, in, notin, isnull, isnotnull.
 */
export function filterToOdsql(filterExpr: string): string {
  const opMap: Record<string, string> = {
    eq: '=',
    neq: '!=',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
  };
  return filterExpr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const segs = part.split(':');
      if (segs.length < 2) return '';
      const field = segs[0];
      const op = segs[1];
      // Operateurs sans valeur (2 segments seulement)
      if (op === 'isnull') return `${field} is null`;
      if (op === 'isnotnull') return `${field} is not null`;
      if (segs.length < 3) return '';
      const rawVal = segs.slice(2).join(':');
      const val = unescapeColonValue(rawVal);
      if (op === 'contains') return `${field} like "%${escapeOdsql(val)}%"`;
      if (op === 'notcontains') return `NOT ${field} like "%${escapeOdsql(val)}%"`;
      if (op === 'in')
        return `${field} in (${rawVal
          .split('|')
          .map((v) => `"${escapeOdsql(unescapeColonValue(v))}"`)
          .join(', ')})`;
      if (op === 'notin')
        return `NOT ${field} in (${rawVal
          .split('|')
          .map((v) => `"${escapeOdsql(unescapeColonValue(v))}"`)
          .join(', ')})`;
      const sqlOp = opMap[op];
      if (!sqlOp) return '';
      // Comparaisons arithmétiques : littéral numérique NON quoté, sinon ODS
      // compare des strings ("9" > "10")
      const numeric = op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte';
      return `${field} ${sqlOp} ${odsqlLiteral(val, numeric)}`;
    })
    .filter(Boolean)
    .join(' AND ');
}

/**
 * Égalité lâche unique (#278) : coercition string/number (`"75" == 75`),
 * repli `String === String` pour les booléens (`true` vs `"true"`).
 * Même sémantique que `_looseEquals` de dsfr-data-query.
 */
function looseEquals(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  // eslint-disable-next-line eqeqeq -- loose equality intentional (string/number coercion)
  if (a == b) return true;
  return String(a) === String(b);
}

function isNumericValue(v: unknown): boolean {
  if (typeof v === 'number') return !isNaN(v);
  if (typeof v === 'string') return v.trim() !== '' && !isNaN(Number(v));
  return false;
}

/**
 * Comparaison pour gt/gte/lt/lte (#278) : null/undefined ne matchent jamais
 * (`Number(null) === 0` faisait passer les nulls — un serveur les exclut).
 * Numérique si les deux côtés le sont, sinon repli lexicographique (dates ISO).
 */
function compareForRange(value: unknown, ref: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (isNumericValue(value) && isNumericValue(ref)) {
    return Number(value) - Number(ref);
  }
  return String(value).localeCompare(String(ref));
}

/**
 * Apply a dsfr-data-query style filter (field:operator:value) to local data rows.
 * Supports the same 12 operators as filterToOdsql — same input, same rows kept.
 * Sémantique null alignée sur dsfr-data-query (#278) : les opérateurs positifs
 * (eq, in, contains, comparaisons) ne matchent jamais null/undefined, les
 * négatifs (neq, notin, notcontains) les laissent passer.
 */
export function applyLocalFilter(
  data: Record<string, unknown>[],
  filterExpr: string
): Record<string, unknown>[] {
  const filters = filterExpr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const segs = part.split(':');
      if (segs.length < 2) return null;
      return { field: segs[0], op: segs[1], rawValue: segs.slice(2).join(':') };
    })
    .filter(Boolean) as { field: string; op: string; rawValue: string }[];

  return data.filter((row) =>
    filters.every((f) => {
      const v = row[f.field];
      const value = unescapeColonValue(f.rawValue);
      switch (f.op) {
        case 'eq':
          return looseEquals(v, value);
        case 'neq':
          return !looseEquals(v, value);
        case 'gt': {
          const cmp = compareForRange(v, value);
          return cmp !== null && cmp > 0;
        }
        case 'gte': {
          const cmp = compareForRange(v, value);
          return cmp !== null && cmp >= 0;
        }
        case 'lt': {
          const cmp = compareForRange(v, value);
          return cmp !== null && cmp < 0;
        }
        case 'lte': {
          const cmp = compareForRange(v, value);
          return cmp !== null && cmp <= 0;
        }
        case 'contains':
          // null ne contient rien (String(undefined)="undefined" matchait, #278)
          return (
            v !== null && v !== undefined && String(v).toLowerCase().includes(value.toLowerCase())
          );
        case 'notcontains':
          return (
            v === null || v === undefined || !String(v).toLowerCase().includes(value.toLowerCase())
          );
        case 'in':
          // Même sémantique lâche que eq, sur chaque token (#315/#278)
          return (
            v !== null &&
            v !== undefined &&
            f.rawValue.split('|').some((token) => looseEquals(v, unescapeColonValue(token)))
          );
        case 'notin':
          return (
            v === null ||
            v === undefined ||
            !f.rawValue.split('|').some((token) => looseEquals(v, unescapeColonValue(token)))
          );
        case 'isnull':
          return v === null || v === undefined;
        case 'isnotnull':
          return v !== null && v !== undefined;
        default:
          console.warn(
            `filter-translator: opérateur inconnu "${f.op}" ignoré (toutes lignes conservées)`
          );
          return true;
      }
    })
  );
}
