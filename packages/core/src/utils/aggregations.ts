import { toNumber } from '@dsfr-data/shared/lib';

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

/**
 * Parse une expression d'agrégation
 * Formats supportés:
 * - "field" -> accès direct
 * - "avg:field" -> moyenne
 * - "sum:field" -> somme
 * - "count:field:value" -> compte les occurrences où field === value
 * - "min:field" -> minimum
 * - "max:field" -> maximum
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
    return obj[parsed.field] as number | string | null;
  }

  // Pour les agrégations, on a besoin d'un tableau
  if (!Array.isArray(data)) {
    return null;
  }

  const items = data as Record<string, unknown>[];

  switch (parsed.type) {
    case 'direct':
    case 'first':
      return items.length > 0 ? (items[0][parsed.field] as number | string) : null;

    case 'last':
      return items.length > 0 ? (items[items.length - 1][parsed.field] as number | string) : null;

    case 'count':
      if (parsed.filterValue !== undefined) {
        return items.filter((item) => item[parsed.field] === parsed.filterValue).length;
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
    const v = toNumber(item[field], true);
    if (v !== null) out.push(v);
  }
  return out;
}
