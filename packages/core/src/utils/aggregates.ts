/**
 * Parsing partagé des expressions d'agrégat `"field:fn[:alias], ..."` (#269).
 *
 * Convention d'alias UNIQUE pour tout le pipeline : `field__fn`
 * (ex. `population__sum`). Tous les chemins — client-side (dsfr-data-query),
 * ODS, Tabular, Grist SQL et fallback Records — produisent la même colonne,
 * pour qu'un `value-field` de chart survive au changement de provider ou à
 * une bascule Grist SQL ↔ Records.
 */

import type { QueryAggregate } from '../components/dsfr-data-query.js';

/** Alias par défaut d'une colonne agrégée : `field__fn`. */
export function aggregateAlias(field: string, fn: string): string {
  return `${field}__${fn}`;
}

/** Agrégat parsé, alias toujours résolu. */
export type ParsedAggregate = QueryAggregate & { alias: string };

/**
 * Parse une expression d'agrégat. Les segments malformés (champ ou fonction
 * manquants, virgule traînante) sont ignorés plutôt que de produire un
 * agrégat invalide en aval (ex. `Empty SQL identifier` côté Grist).
 */
export function parseAggregates(aggExpr: string): ParsedAggregate[] {
  if (!aggExpr) return [];
  const out: ParsedAggregate[] = [];
  for (const part of aggExpr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const [field, fn, alias] = part.split(':').map((s) => s.trim());
    if (!field || !fn) continue;
    out.push({
      field,
      function: fn as QueryAggregate['function'],
      alias: alias || aggregateAlias(field, fn),
    });
  }
  return out;
}
