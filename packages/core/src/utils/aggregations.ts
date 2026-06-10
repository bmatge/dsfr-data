import { toNumber } from '@dsfr-data/shared/lib';
import { getByPath } from './json-path.js';

/**
 * Aggregations - Fonctions d'agrégation pour les KPIs
 * Permet de calculer des agrégats (avg, sum, count, min, max) sur des tableaux de données
 */

export type AggregationType = 'avg' | 'sum' | 'count' | 'min' | 'max' | 'first' | 'last';

export interface ParsedExpression {
  type: AggregationType | 'direct';
  field: string;
  filterField?: string;
  filterValue?: string | boolean | number;
}

const AGG_TYPES: ReadonlySet<string> = new Set([
  'avg',
  'sum',
  'count',
  'min',
  'max',
  'first',
  'last',
]);

let legacyGrammarWarned = false;

/**
 * Parse une expression d'agrégation.
 *
 * Grammaire COMMUNE du pipeline (#303) : "field:fn" — la même que query et
 * tous les adapters (`population:sum`). L'ancienne grammaire INVERSÉE du
 * kpi ("fn:field", ex. `sum:population`) reste lue en alias déprécié
 * (warn console unique).
 *
 * Formats supportés :
 * - "field"            -> accès direct
 * - "field:fn"         -> grammaire commune (population:sum)
 * - "fn:field"         -> ancienne grammaire kpi (dépréciée)
 * - "count"            -> compte tous les enregistrements
 * - "count:field:value"-> compte les occurrences où field == value (lâche)
 */
export function parseExpression(expression: string): ParsedExpression {
  const parts = expression.split(':');

  if (parts.length === 1) {
    // "count" seul = compter tous les enregistrements
    if (parts[0] === 'count') {
      return { type: 'count', field: '' };
    }
    return { type: 'direct', field: parts[0] };
  }

  // Grammaire commune "field:fn" : parts[1] est une fonction connue et
  // parts[0] n'en est pas une (un champ nommé 'sum' reste l'ancienne lecture)
  if (parts.length === 2 && AGG_TYPES.has(parts[1]) && !AGG_TYPES.has(parts[0])) {
    return { type: parts[1] as AggregationType, field: parts[0] };
  }

  if (AGG_TYPES.has(parts[0]) && !legacyGrammarWarned) {
    legacyGrammarWarned = true;
    console.warn(
      `dsfr-data-kpi: la grammaire "${parts[0]}:${parts[1]}" (fn:champ) est dépréciée — ` +
        `utilisez la grammaire commune du pipeline "champ:fn" (ex. "population:sum") (#303)`
    );
  }

  const type = parts[0] as AggregationType;
  const field = parts[1];

  if (parts.length === 3) {
    // count:field:value
    let filterValue: string | boolean | number = parts[2];

    // Parse boolean/number values
    if (filterValue === 'true') filterValue = true;
    else if (filterValue === 'false') filterValue = false;
    else if (!isNaN(Number(filterValue))) filterValue = Number(filterValue);

    return { type, field, filterField: field, filterValue };
  }

  return { type, field };
}

/**
 * Calcule une agrégation sur un tableau de données
 */
export function computeAggregation(data: unknown, expression: string): number | string | null {
  const parsed = parseExpression(expression);

  // Si c'est un accès direct à un objet (pas un tableau)
  if (parsed.type === 'direct' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    // getByPath (#303) : seul composant sans chemins imbriques —
    // valeur="fields.score" echouait silencieusement
    return getByPath(obj, parsed.field) as number | string | null;
  }

  // Pour les agrégations, on a besoin d'un tableau
  if (!Array.isArray(data)) {
    return null;
  }

  const items = data as Record<string, unknown>[];

  switch (parsed.type) {
    case 'direct':
    case 'first':
      return items.length > 0 ? (getByPath(items[0], parsed.field) as number | string) : null;

    case 'last':
      return items.length > 0
        ? (getByPath(items[items.length - 1], parsed.field) as number | string)
        : null;

    case 'count':
      if (parsed.filterValue !== undefined) {
        // Egalite LACHE (#303) : query filtre en ==, count:field:value
        // comparait en === strict ("75" ne matchait pas 75)
        return items.filter((item) =>
          looseEquals(getByPath(item, parsed.field), parsed.filterValue)
        ).length;
      }
      return items.length;

    case 'sum':
      // toNumber : decimales francaises ('1 234,5') parsees ; NaN exclu (#301)
      return collectNumericValues(items, parsed.field).reduce((acc, v) => acc + v, 0);

    case 'avg': {
      // Moyenne sur les seules valeurs numeriques — diviser par
      // items.length comptait les non-numeriques comme des zeros (#301)
      const values = collectNumericValues(items, parsed.field);
      if (values.length === 0) return null;
      return values.reduce((acc, v) => acc + v, 0) / values.length;
    }

    case 'min': {
      // Le garde portait sur items.length, pas sur le tableau filtre :
      // aucune valeur numerique -> Math.min(...[]) = Infinity (#301)
      const values = collectNumericValues(items, parsed.field);
      return values.length > 0 ? Math.min(...values) : null;
    }

    case 'max': {
      const values = collectNumericValues(items, parsed.field);
      return values.length > 0 ? Math.max(...values) : null;
    }

    default:
      return null;
  }
}

/**
 * Valeurs numeriques d'un champ — toNumber strict (#301) : les decimales
 * francaises sont parsees, les non-numeriques sont EXCLUS (jamais 0).
 */
function collectNumericValues(items: Record<string, unknown>[], field: string): number[] {
  const out: number[] = [];
  for (const item of items) {
    const v = toNumber(getByPath(item, field), true);
    if (v !== null) out.push(v);
  }
  return out;
}

/** Egalite lache alignee sur dsfr-data-query (#278/#303) */
function looseEquals(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  // eslint-disable-next-line eqeqeq -- coercition lache intentionnelle
  if (a == b) return true;
  return String(a) === String(b);
}
