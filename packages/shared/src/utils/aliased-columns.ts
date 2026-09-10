/**
 * Grammaire d'alias inline `col:Libellé` (#668), partagée par les attributs
 * qui listent des colonnes à afficher : `columns` de dsfr-data-list,
 * `aggregate field:fn:alias` de dsfr-data-query, `value-cols` de
 * dsfr-data-unpivot et `value-field(s)` de dsfr-data-chart.
 *
 * Un `:` littéral dans le nom de colonne ou dans le libellé s'échappe via
 * `escapeColonValue` (`%3A`) ; les deux segments sont décodés après découpage
 * sur le premier `:` structurel. Sans alias, le libellé est le nom de colonne.
 */

import { unescapeColonValue } from './colon-escape.js';

/** Colonne et son libellé d'affichage. */
export interface AliasedColumn {
  /** Nom (chemin) de la colonne dans les données, décodé. */
  key: string;
  /** Libellé affiché ; égal à `key` quand aucun alias n'est donné. */
  label: string;
}

/**
 * Parse UNE expression `col` ou `col:Libellé` (pas de découpage sur la
 * virgule : à utiliser pour un attribut mono-colonne comme `value-field`).
 * Le libellé peut contenir d'autres `:` non échappés (tout ce qui suit le
 * premier `:` lui appartient).
 */
export function parseAliasedColumn(expr: string): AliasedColumn {
  const trimmed = expr.trim();
  const sep = trimmed.indexOf(':');
  if (sep < 0) {
    const key = unescapeColonValue(trimmed);
    return { key, label: key };
  }
  const key = unescapeColonValue(trimmed.slice(0, sep).trim());
  const label = unescapeColonValue(trimmed.slice(sep + 1).trim());
  return { key, label: label || key };
}

/**
 * Parse une liste virgule-séparée `col:Libellé, col2:Libellé 2`.
 * Les segments vides sont ignorés (virgule traînante tolérée).
 */
export function parseAliasedColumns(expr: string): AliasedColumn[] {
  if (!expr) return [];
  return expr
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseAliasedColumn);
}
