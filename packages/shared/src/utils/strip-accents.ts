/**
 * Retire les diacritiques d'une chaine (`é` → `e`, `ç` → `c`) par
 * decomposition NFD. Une seule definition (revue du 2026-09-13) : le motif
 * etait recopie dans map-geo-keys, to-boolean et dsfr-data-search.
 * Ne change ni la casse, ni les espaces : chaque appelant garde sa suite.
 */
export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
