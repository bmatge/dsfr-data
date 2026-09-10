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
import { canonicalAggregation } from './aggregations.js';

/**
 * Liste blanche des fonctions d'agrégat du pipeline (query + adapters).
 * Source unique du type `AggregateFunction` de dsfr-data-query.
 *
 * `distinct` (#672) : nombre de valeurs distinctes, alias d'entrée
 * `count-distinct` ramené à `distinct` par `parseAggregates` (alias de
 * colonne `champ__distinct`, ODS `count(distinct x)`, Grist
 * `COUNT(DISTINCT x)` ; non délégué à Tabular).
 */
export const AGGREGATE_FUNCTIONS = ['count', 'sum', 'avg', 'min', 'max', 'distinct'] as const;

export function isAggregateFunction(fn: string): fn is QueryAggregate['function'] {
  return (AGGREGATE_FUNCTIONS as readonly string[]).includes(fn);
}

/**
 * Valide les fonctions d'une expression d'agrégat contre la liste blanche
 * (#649). Retourne un message lisible nommant la fonction reçue et les
 * fonctions acceptées (le composant y préfixe son nom et l'attribut), ou
 * null si tout est connu. Une faute de frappe (`sum` → `somme`) produisait
 * un 0 plausible en silence.
 */
export function validateAggregateFunctions(aggExpr: string): string | null {
  for (const agg of parseAggregates(aggExpr)) {
    if (!isAggregateFunction(agg.function)) {
      // `count-if` refusé (#673) : un comptage conditionnel sur query
      // dupliquerait `where` — filtrer d'abord, puis `champ:count`.
      if (/^count[-_]?if$/i.test(agg.function)) {
        return (
          `fonction d'agrégat "${agg.function}" refusée dans "${agg.field}:${agg.function}" — ` +
          `filtrez avec where="champ:op:valeur" puis agrégez avec "${agg.field}:count" ` +
          `(sur dsfr-data-kpi : value="count:champ:valeur")`
        );
      }
      return (
        `fonction d'agrégat "${agg.function}" inconnue dans "${agg.field}:${agg.function}" — ` +
        `fonctions acceptées : ${AGGREGATE_FUNCTIONS.join(', ')}`
      );
    }
  }
  return null;
}

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
 *
 * La fonction n'est PAS filtrée ici : une fonction inconnue est conservée
 * telle quelle pour que `validateAggregateFunctions` puisse la nommer dans
 * l'erreur de configuration (#649) — la lâcher en silence reproduirait le 0
 * muet.
 */
export function parseAggregates(aggExpr: string): ParsedAggregate[] {
  if (!aggExpr) return [];
  const out: ParsedAggregate[] = [];
  for (const part of aggExpr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const [field, rawFn, alias] = part.split(':').map((s) => s.trim());
    if (!field || !rawFn) continue;
    // Alias de fonction résolu AVANT l'alias de colonne (#672) :
    // `x:count-distinct` produit `x__distinct`, comme `x:distinct`.
    const fn = canonicalAggregation(rawFn);
    out.push({
      field,
      function: fn as QueryAggregate['function'],
      alias: alias || aggregateAlias(field, fn),
    });
  }
  return out;
}
