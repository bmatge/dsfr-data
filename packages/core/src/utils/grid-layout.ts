/**
 * Colonnage des composants en grille (#790).
 *
 * `cols` désignait deux grandeurs opposées selon le composant : une LARGEUR
 * sur la grille de 12 dans `dsfr-data-facets` (`cols="4"` → 3 facettes par
 * ligne), un NOMBRE d'éléments par ligne dans `dsfr-data-display` et
 * `dsfr-data-kpi-group` (`cols="4"` → 4 éléments par ligne). Deux noms sans
 * ambiguïté les remplacent, et `cols` garde son sens actuel sur chaque
 * composant, sans échéance :
 *
 * - `per-row` : nombre d'éléments par ligne ;
 * - `span` : largeur sur la grille de 12 colonnes.
 *
 * Les deux sont des chaînes : l'échelle responsive (#789, `per-row="1 md:3"`)
 * s'y ajoutera sans changer le type de la propriété.
 */

import { reportConfigError, clearConfigError } from './config-error.js';

/** Diviseurs de 12 : les seuls nombres d'éléments par ligne qui remplissent la grille. */
const DIVISORS_OF_12 = [1, 2, 3, 4, 6, 12];

export interface PerRow {
  /** Nombre d'éléments par ligne, ou null (absent ou invalide). */
  value: number | null;
  /** Message d'erreur de configuration, ou null. */
  error: string | null;
}

/**
 * Lit `per-row`. Vide : pas de valeur, pas d'erreur. Un nombre qui ne divise
 * pas 12 est refusé plutôt qu'arrondi : `per-row="5"` donnerait en silence
 * six éléments par ligne (12 / 5 arrondi à 2 colonnes chacun).
 */
export function parsePerRow(raw: unknown, max: number): PerRow {
  const text = raw === null || raw === undefined ? '' : String(raw).trim();
  if (!text) return { value: null, error: null };
  const n = Number(text);
  const allowed = DIVISORS_OF_12.filter((d) => d <= max);
  if (!Number.isInteger(n) || !allowed.includes(n)) {
    return {
      value: null,
      error:
        `per-row="${text}" : attendu un nombre d'éléments par ligne qui divise la grille ` +
        `de 12 colonnes — ${allowed.join(', ')}`,
    };
  }
  return { value: n, error: null };
}

/** Largeur sur 12 d'un élément quand il y en a `perRow` par ligne. */
export function spanForPerRow(perRow: number): number {
  return 12 / perRow;
}

/**
 * Lit une largeur `span` (1 à 12). Vide : null sans erreur. Hors plage ou
 * non entière : erreur nommée.
 */
export function parseSpan(raw: unknown): { value: number | null; error: string | null } {
  const text = raw === null || raw === undefined ? '' : String(raw).trim();
  if (!text) return { value: null, error: null };
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1 || n > 12) {
    return {
      value: null,
      error: `span="${text}" : attendu une largeur entière de 1 à 12 colonnes`,
    };
  }
  return { value: n, error: null };
}

/**
 * Message de conflit quand l'ancien attribut et le nouveau sont posés
 * ensemble : le nouveau l'emporte, et on le dit.
 */
export function legacyConflictMessage(legacy: string, modern: string): string {
  return (
    `${legacy} et ${modern} sont posés ensemble : ${modern} l'emporte, ${legacy} est ignoré. ` +
    `Retirer ${legacy} (${modern} a le même rôle, sans ambiguïté de sens, #790).`
  );
}

/**
 * Pose ou lève l'erreur de colonnage d'un composant, sans toucher à une autre
 * erreur de configuration : on ne lève que le message qu'on a soi-même posé,
 * et on ne repose pas un message déjà affiché (une console.error par état).
 * Rend le message courant, à conserver par le composant.
 */
export function syncLayoutError(
  el: HTMLElement,
  component: string,
  message: string | null,
  previous: string | null
): string | null {
  const shown = el.getAttribute('data-dsfr-config-error');
  if (message) {
    if (shown !== message) reportConfigError(el, component, message);
    return message;
  }
  if (previous && shown === previous) clearConfigError(el);
  return null;
}
