import { getByPath } from './json-path.js';
import { formatDate } from '@dsfr-data/shared/lib';

/**
 * Moteur de templates `{{...}}` partagé entre dsfr-data-display et
 * dsfr-data-map-popup (#426, épic #694).
 *
 * Grammaire d'une expression : `chemin[:format[:arg]][|défaut]`
 * - `chemin` / `chemin.sous.clé` : accès (imbriqué) à la valeur
 * - `:format`                    : `number`, `date`, `datetime`
 * - `:format:arg`                : argument du format, séparé par un second `:`
 *                                  (`number:2` décimales)
 * - `|défaut`                    : fallback si null/undefined
 *
 * Limite documentée : `|` est interdit dans l'argument (il ouvre le défaut),
 * `}` est interdit partout (il ferme le placeholder).
 *
 * Les variables spéciales (`$index`, `$uid`...) sont fournies par l'appelant
 * via `vars` — résolues avant toute autre interprétation.
 */

/** Expression décomposée selon la grammaire `chemin[:format[:arg]][|défaut]`. */
export interface ParsedTemplateExpression {
  /** Chemin (éventuellement imbriqué) de la valeur, trimé. */
  path: string;
  /** Nom du format, trimé (chaîne vide si absent). */
  format: string;
  /** Argument du format, tel quel (espaces conservés) ; undefined si absent. */
  arg: string | undefined;
  /** Valeur de repli si la donnée est null/undefined, trimée. */
  defaultValue: string;
}

/**
 * Découpe une expression selon la grammaire commune. L'argument n'est pas
 * trimé : `tags:join: / ` conserve les espaces de son séparateur.
 */
export function parseTemplateExpression(expr: string): ParsedTemplateExpression {
  let head = expr;
  let defaultValue = '';
  const pipeIndex = expr.indexOf('|');
  if (pipeIndex !== -1) {
    head = expr.substring(0, pipeIndex);
    defaultValue = expr.substring(pipeIndex + 1).trim();
  }

  let path = head;
  let format = '';
  let arg: string | undefined;
  const colonIndex = head.indexOf(':');
  if (colonIndex !== -1) {
    path = head.substring(0, colonIndex);
    const formatPart = head.substring(colonIndex + 1);
    const argIndex = formatPart.indexOf(':');
    if (argIndex !== -1) {
      format = formatPart.substring(0, argIndex).trim();
      arg = formatPart.substring(argIndex + 1);
    } else {
      format = formatPart.trim();
    }
  }

  return { path: path.trim(), format, arg, defaultValue };
}

/** Résout une expression `{{...}}` pour un enregistrement donné. */
export function resolveTemplateExpression(
  item: Record<string, unknown>,
  expr: string,
  vars?: Record<string, () => string>
): string {
  const trimmed = expr.trim();
  if (vars && Object.prototype.hasOwnProperty.call(vars, trimmed)) {
    return vars[trimmed]();
  }

  const { path, format, arg, defaultValue } = parseTemplateExpression(expr);

  const value = getByPath(item, path);
  if (value === null || value === undefined) return defaultValue;

  return formatTemplateValue(value, format, arg);
}

function toDate(value: unknown): Date | string {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  return String(value);
}

/**
 * Applique un format à une valeur. Formats supportés :
 * - `number[:décimales]` : fr-FR, séparateur de milliers (non-numérique inchangé)
 * - `date`               : JJ/MM/AAAA, « — » si invalide
 * - `datetime`           : JJ/MM/AAAA HH:MM, « — » si invalide
 * Sinon `String(value)`.
 */
export function formatTemplateValue(value: unknown, format: string, arg?: string): string {
  switch (format) {
    case 'number': {
      const num = typeof value === 'number' ? value : parseFloat(String(value));
      if (!isNaN(num)) {
        const decimals = arg !== undefined ? parseInt(arg, 10) : NaN;
        return Number.isInteger(decimals) && decimals >= 0
          ? num.toLocaleString('fr-FR', {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })
          : num.toLocaleString('fr-FR');
      }
      break;
    }
    case 'date':
      return formatDate(toDate(value));
    case 'datetime': {
      const raw = toDate(value);
      const date = typeof raw === 'string' ? new Date(raw) : raw;
      if (isNaN(date.getTime())) return '—';
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    }
  }
  return String(value);
}
