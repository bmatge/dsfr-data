import { parsePipePairs } from './facets-attributes.js';
import type { FacetGroup, FacetSelections } from './facets-types.js';

/**
 * Lecture et écriture de l'URL par une facette AUTONOME (#312, #773, #683),
 * sortie du composant (#838).
 *
 * En mode `context`, rien de tout ceci ne sert : c'est le contexte qui porte
 * l'URL (#678, ADR-104).
 */

/** Parse url-param-map attribute into a map of URL param name -> facet field name */
export function parseUrlParamMap(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [paramName, fieldName] of parsePipePairs(raw)) {
    if (fieldName) map.set(paramName, fieldName);
  }
  return map;
}

/**
 * Paramètres d'URL lus comme pré-sélections.
 *
 * Sans `url-param-map`, seuls les params correspondant aux champs CONNUS
 * deviennent des selections (#312) : `?utm_source=newsletter` filtrait sur un
 * champ inexistant -> 0 resultat inexplicable. Une valeur peut porter
 * plusieurs modalités séparées par des virgules : `?region=IDF,PACA`.
 */
export function readUrlSelections(
  params: URLSearchParams,
  paramMap: Map<string, string>,
  knownFields: Set<string>
): FacetSelections {
  const selections: FacetSelections = {};

  for (const [paramName, paramValue] of params.entries()) {
    const fieldName =
      paramMap.size > 0
        ? (paramMap.get(paramName) ?? null)
        : knownFields.has(paramName)
          ? paramName
          : null;

    if (!fieldName) continue;

    const values = paramValue
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    if (!selections[fieldName]) {
      selections[fieldName] = new Set();
    }
    for (const v of values) {
      selections[fieldName].add(v);
    }
  }

  return selections;
}

/**
 * Écrit les sélections courantes dans les paramètres de `url`, en place.
 *
 * Part des params EXISTANTS (#312) : repartir de zéro effaçait le paramètre
 * du `dsfr-data-search` voisin et tout autre param de la page à chaque clic.
 * Nos propres params périmés sont retirés avant que les courants soient
 * posés.
 */
export function writeUrlSelections(
  url: URL,
  selections: FacetSelections,
  groups: FacetGroup[],
  paramMap: Map<string, string>
): void {
  const params = url.searchParams;
  // Build reverse map: field -> URL param name
  const reverseMap = new Map<string, string>();
  for (const [paramName, fieldName] of paramMap) {
    reverseMap.set(fieldName, paramName);
  }

  for (const field of Object.keys(selections)) {
    params.delete(reverseMap.get(field) ?? field);
  }
  for (const group of groups) {
    params.delete(reverseMap.get(group.field) ?? group.field);
  }

  for (const [field, values] of Object.entries(selections)) {
    if (values.size === 0) continue;
    const paramName = reverseMap.get(field) ?? field;
    params.set(paramName, [...values].join(','));
  }
}

/**
 * Un paramètre lu par cette facette AUTONOME est-il aussi porté par un
 * `dsfr-data-context` à `url-sync` (#773) ? Les deux s'écraseraient
 * mutuellement.
 *
 * Vue STRUCTURELLE sur le contexte (`getUrlParamNames`), sans importer son
 * module — même précaution que #681.
 */
export function findUrlParamConflicts(read: Set<string>): {
  conflicts: string[];
  contextId: string;
} {
  const conflicts: string[] = [];
  let contextId = '';
  for (const el of document.querySelectorAll('dsfr-data-context')) {
    const names = (el as unknown as { getUrlParamNames?: () => string[] }).getUrlParamNames?.();
    for (const name of names ?? []) {
      if (read.has(name) && !conflicts.includes(name)) {
        conflicts.push(name);
        contextId ||= el.id;
      }
    }
  }
  return { conflicts, contextId };
}
