import { parseCSV, type FacetGroup } from './facets-types.js';

/**
 * Facettes STATIQUES (#838) : valeurs pre-calculees passees en JSON par
 * l'attribut `static-values`, affichees sans compteur (les données ne sont
 * pas comptees ici, le filtrage a lieu cote serveur).
 */

/**
 * Groupes construits depuis `static-values`.
 *
 * `null` : le JSON est invalide — l'appelant signale, comme avant, et garde
 * les groupes precedents.
 */
export function buildStaticFacetGroups(
  staticValues: string,
  fieldsAttr: string,
  labelMap: Map<string, string>,
  hideEmpty: boolean
): FacetGroup[] | null {
  let parsed: Record<string, string[]>;
  try {
    parsed = JSON.parse(staticValues) as Record<string, string[]>;
  } catch {
    return null;
  }
  const fields = fieldsAttr ? parseCSV(fieldsAttr) : Object.keys(parsed);

  return fields
    .filter((field) => parsed[field] && parsed[field].length > 0)
    .map((field) => ({
      field,
      label: labelMap.get(field) ?? field,
      values: parsed[field].map((v) => ({ value: v, count: 0 })),
    }))
    .filter((group) => !(hideEmpty && group.values.length <= 1));
}

/**
 * Clés déclarées par `static-values` — elles comptent parmi les champs qu'une
 * facette autonome accepte de lire dans l'URL (#773). Un JSON invalide rend
 * un ensemble vide : il est déjà signalé par la construction des groupes.
 */
export function staticValueFields(staticValues: string): string[] {
  try {
    return Object.keys(JSON.parse(staticValues) as object);
  } catch {
    return [];
  }
}
