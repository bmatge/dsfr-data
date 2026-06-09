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
 * Apply a dsfr-data-query style filter (field:operator:value) to local data rows.
 * Supports the same 12 operators as filterToOdsql — same input, same rows kept.
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
          // eslint-disable-next-line eqeqeq -- loose equality intentional (string/number coercion)
          return v == value;
        case 'neq':
          // eslint-disable-next-line eqeqeq -- loose equality intentional (string/number coercion)
          return v != value;
        case 'gt':
          return Number(v) > Number(value);
        case 'gte':
          return Number(v) >= Number(value);
        case 'lt':
          return Number(v) < Number(value);
        case 'lte':
          return Number(v) <= Number(value);
        case 'contains':
          return String(v).toLowerCase().includes(value.toLowerCase());
        case 'notcontains':
          return !String(v).toLowerCase().includes(value.toLowerCase());
        case 'in':
          // Même sémantique lâche que eq, sur chaque token (#315)
          // eslint-disable-next-line eqeqeq -- loose equality intentional
          return f.rawValue.split('|').some((token) => v == unescapeColonValue(token));
        case 'notin':
          // eslint-disable-next-line eqeqeq -- loose equality intentional
          return !f.rawValue.split('|').some((token) => v == unescapeColonValue(token));
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
