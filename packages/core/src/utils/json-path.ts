/**
 * JSON Path - Extraction de données via un chemin de propriétés
 * Permet d'accéder à des propriétés imbriquées dans un objet JSON
 */

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

    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * Vérifie si un chemin existe dans un objet
 */
export function hasPath(obj: unknown, path: string): boolean {
  return getByPath(obj, path) !== undefined;
}

/**
 * Assigne une valeur dans un objet en suivant un chemin de propriétés,
 * créant les objets intermédiaires si nécessaire.
 * @example
 * const obj = {};
 * setByPath(obj, 'fields.Pays', 'France') // => { fields: { Pays: 'France' } }
 */
export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
  const keys = normalizedPath.split('.');

  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * Extrait une valeur avec une valeur par défaut si non trouvée
 */
export function getByPathOrDefault<T>(obj: unknown, path: string, defaultValue: T): T {
  const result = getByPath(obj, path);
  return result !== undefined ? (result as T) : defaultValue;
}
