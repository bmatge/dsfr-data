import { getByPath } from './json-path.js';

/**
 * Resolution des expressions de template `{{...}}` partagee entre
 * <dsfr-data-display> et <dsfr-data-map-popup> (#426 — le popup ne gerait
 * pas `champ:format` ni `champ|défaut`).
 *
 * Syntaxe supportee :
 * - `champ` / `champ.sous.clé` : acces (imbrique) a la valeur
 * - `champ|défaut`             : fallback si null/undefined
 * - `champ:format`             : formatage (formats : `number`)
 * - `champ:format|défaut`      : combinaison des deux
 *
 * Les variables speciales (`$index`, `$uid`...) sont fournies par l'appelant
 * via `vars` — resolues avant toute autre interpretation.
 */
export function resolveTemplateExpression(
  item: Record<string, unknown>,
  expr: string,
  vars?: Record<string, () => string>
): string {
  if (vars && Object.prototype.hasOwnProperty.call(vars, expr)) {
    return vars[expr]();
  }

  // Fallback : champ|valeur_defaut
  let fieldPath = expr;
  let defaultValue = '';
  const pipeIndex = expr.indexOf('|');
  if (pipeIndex !== -1) {
    fieldPath = expr.substring(0, pipeIndex).trim();
    defaultValue = expr.substring(pipeIndex + 1).trim();
  }

  // Format : champ:format
  let format = '';
  const colonIndex = fieldPath.indexOf(':');
  if (colonIndex !== -1) {
    format = fieldPath.substring(colonIndex + 1).trim();
    fieldPath = fieldPath.substring(0, colonIndex).trim();
  }

  const value = getByPath(item, fieldPath);
  if (value === null || value === undefined) return defaultValue;

  if (format) {
    return formatTemplateValue(value, format);
  }
  return String(value);
}

/** Applique un format a une valeur. Formats supportes : number (fr-FR) */
export function formatTemplateValue(value: unknown, format: string): string {
  if (format === 'number') {
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    if (!isNaN(num)) {
      return num.toLocaleString('fr-FR');
    }
  }
  return String(value);
}
