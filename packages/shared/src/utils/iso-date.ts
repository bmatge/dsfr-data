/**
 * Chaine de date ISO 8601 : `AAAA-MM-JJ`, ou datetime
 * `AAAA-MM-JJThh:mm[:ss[.mmm]][Z|+hh:mm]` (separateur `T` ou espace).
 * Validation de FORME seulement : l'ordre lexicographique de ces chaines est
 * l'ordre chronologique (#667).
 *
 * Une seule definition (revue du 2026-09-13) : le motif etait recopie dans
 * `core/utils/aggregations.ts` et `shared/utils/pivot.ts`.
 */
// Chaque quantificateur porte sur une classe disjointe du caractere qui le
// suit (chiffres / separateurs litteraux) : pas de retour arriere exponentiel.
const ISO_DATE_RE =
  // eslint-disable-next-line security/detect-unsafe-regex
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Une valeur est-elle une chaine de date ISO (#667) ? */
export function isIsoDateString(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_RE.test(value.trim());
}
