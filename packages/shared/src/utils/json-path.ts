/**
 * Lecture d'une valeur par CHEMIN POINTÉ (`lieu.ville`, `items[0].nom`).
 *
 * C'est ainsi que la bibliothèque lit un champ désigné par un attribut :
 * `dsfr-data-query`, le `where` d'un KPI et le filtre client de la source
 * passent tous par ce lecteur. Il vit ici, et non dans `packages/core`, pour
 * que le Studio IA (`ia/data-tools.ts`) lise un champ exactement comme la page
 * qu'il génère (#1285) — `packages/core/src/utils/json-path.ts` le
 * ré-exporte. Pur, sans DOM : lib-safe, exporté par les DEUX barrels.
 */

import { isUnsafeKey } from './security.js';

/**
 * Extrait une valeur d'un objet en suivant un chemin de propriétés
 * @param obj - L'objet source
 * @param path - Le chemin (ex: "results.items", "data.users[0].name")
 * @returns La valeur trouvée ou undefined
 *
 * @example
 * getByPath({ a: { b: { c: 42 } } }, 'a.b.c') // => 42
 * getByPath({ items: [1, 2, 3] }, 'items[1]') // => 2
 * getByPath({ data: { results: [] } }, 'data.results') // => []
 */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path || path.trim() === '') {
    return obj;
  }

  // Normalise le chemin : convertit items[0] en items.0
  const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
  const keys = normalizedPath.split('.');

  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    if (isUnsafeKey(key)) {
      return undefined;
    }

    // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}
