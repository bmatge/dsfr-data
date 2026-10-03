/**
 * Minimum, maximum et ajout en nombre SANS étalement d'arguments (BUG-038 du
 * banc d'essai, #1228).
 *
 * `Math.min(...values)` et `cible.push(...lignes)` passent chaque élément en
 * ARGUMENT d'appel : au-delà d'un seuil qui dépend du moteur (entre 120 000 et
 * 125 000 sous V8), l'appel lève « RangeError: Maximum call stack size
 * exceeded ». Le composant garde alors son dernier rendu, sans un mot à
 * l'écran — un chiffre périmé, pas une erreur. Une page ne peut pas connaître
 * ce plafond d'avance : tout tableau de DONNÉES passe donc par une boucle.
 *
 * Mêmes résultats que `Math.min` / `Math.max` : `Infinity` / `-Infinity` sur
 * un tableau vide, `NaN` dès qu'une valeur est `NaN`. Seul le signe d'un zéro
 * n'est pas départagé (`Math.min(0, -0)` vaut `-0`) : aucun affichage ne le lit.
 */

/** Plus petite valeur d'un tableau de nombres, de taille quelconque. */
export function minOf(values: ArrayLike<number>): number {
  let min = Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isNaN(v)) return NaN;
    if (v < min) min = v;
  }
  return min;
}

/** Plus grande valeur d'un tableau de nombres, de taille quelconque. */
export function maxOf(values: ArrayLike<number>): number {
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isNaN(v)) return NaN;
    if (v > max) max = v;
  }
  return max;
}

/** Ajoute chaque élément de `items` à `target`, en place — `push(...items)` sans plafond. */
export function appendAll<T>(target: T[], items: ArrayLike<T>): void {
  for (let i = 0; i < items.length; i++) target.push(items[i]);
}
