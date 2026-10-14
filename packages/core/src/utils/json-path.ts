/**
 * JSON Path - Extraction de données via un chemin de propriétés
 * Permet d'accéder à des propriétés imbriquées dans un objet JSON
 */

import { getByPath, isUnsafeKey } from '@dsfr-data/shared/lib';

/**
 * Lecture par chemin pointé : écrite UNE fois, dans `@dsfr-data/shared/lib`
 * (`utils/json-path.ts`), pour que le Studio IA lise un champ comme la page
 * (#1285). Ré-exportée ici pour les composants.
 */
export { getByPath };

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
    if (isUnsafeKey(key)) {
      return;
    }
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1];
  if (isUnsafeKey(lastKey)) {
    return;
  }
  current[lastKey] = value;
}

/**
 * Extrait une valeur avec une valeur par défaut si non trouvée
 */
export function getByPathOrDefault<T>(obj: unknown, path: string, defaultValue: T): T {
  const result = getByPath(obj, path);
  return result !== undefined ? (result as T) : defaultValue;
}
