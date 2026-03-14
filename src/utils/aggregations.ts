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
        return items.filter(item => item[parsed.field] === parsed.filterValue).length;
      }
      return items.length;

    case 'sum':
      return items.reduce((acc, item) => {
        const val = Number(item[parsed.field]);
        return acc + (isNaN(val) ? 0 : val);
      }, 0);

    case 'avg':
      if (items.length === 0) return null;
      const sum = items.reduce((acc, item) => {
        const val = Number(item[parsed.field]);
        return acc + (isNaN(val) ? 0 : val);
      }, 0);
      return sum / items.length;

    case 'min':
      if (items.length === 0) return null;
      return Math.min(...items.map(item => Number(item[parsed.field])).filter(v => !isNaN(v)));

    case 'max':
      if (items.length === 0) return null;
      return Math.max(...items.map(item => Number(item[parsed.field])).filter(v => !isNaN(v)));

    default:
      return null;
  }
}
