/**
 * Tri de lignes du pipeline — un seul comparateur pour `dsfr-data-query` et
 * pour les adaptateurs qui trient eux-memes ce que leur API ne sait pas trier
 * (Tabular, tri sur une colonne d'agregat, #1045). Deux comparateurs
 * divergeraient : le meme `order-by` ne rendrait pas le meme ordre selon
 * qu'il est delegue ou non.
 */

import { getByPath } from './json-path.js';
import type { OrderByPart } from './where.js';

/** True si la valeur est interpretable comme nombre (hors null/''). */
export function isNumericValue(v: unknown): boolean {
  if (typeof v === 'number') return !isNaN(v);
  if (typeof v === 'string') return v.trim() !== '' && !isNaN(Number(v));
  return false;
}

/**
 * Comparateur total a 3 niveaux : null/vide < numerique < chaîne (#278).
 * Transitif — l'ancien comparateur mixte (numerique si LES DEUX valeurs
 * sont numeriques, sinon string) produisait un ordre arbitraire sur les
 * colonnes mixtes, et `Number(null) === 0` classait les nulls parmi les
 * nombres.
 */
export function compareValues(valA: unknown, valB: unknown): number {
  const rank = (v: unknown): number => {
    if (v === null || v === undefined || v === '') return 0;
    return isNumericValue(v) ? 1 : 2;
  };
  const rankA = rank(valA);
  const rankB = rank(valB);
  if (rankA !== rankB) return rankA - rankB;
  if (rankA === 0) return 0;
  if (rankA === 1) return Number(valA) - Number(valB);
  return String(valA).localeCompare(String(valB));
}

/**
 * Trie des lignes selon la grammaire commune du pipeline `"field:dir, …"`
 * (#273), deja decoupee par `parseOrderBy`. Tri stable, comparateur total
 * (#278). En desc, l'ordre est exactement inverse (nulls en dernier).
 * Rend une copie : le tableau recu n'est pas modifie.
 */
export function sortRows<T>(rows: T[], parts: OrderByPart[]): T[] {
  if (parts.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const { field, direction } of parts) {
      const cmp = compareValues(getByPath(a, field), getByPath(b, field));
      if (cmp !== 0) return direction === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}
