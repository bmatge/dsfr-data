/**
 * Utilitaires WHERE partagés entre composants et adapters (#271).
 *
 * Deux dialectes coexistent dans le pipeline (cf. `AdapterCapabilities.whereFormat`) :
 * - `odsql` (OpenDataSoft) : clauses SQL-like jointes par ` AND `, valeurs
 *   entre guillemets échappées par l'adapter ODS ;
 * - `colon` (Tabular, Grist, INSEE, Generic) : `field:op:value` joints par
 *   `, `, multi-valeurs séparées par `|`.
 *
 * Les caractères structurels de la syntaxe colon (`,` `:` `|`) présents dans
 * une VALEUR sont percent-encodés par `escapeColonValue` (avec `%` lui-même,
 * pour la réversibilité). Tous les parseurs colon (query, Grist SQL/Records,
 * Tabular, INSEE) décodent via `unescapeColonValue` après découpage.
 */

import type { AdapterCapabilities } from '../adapters/api-adapter.js';

export type WhereFormat = AdapterCapabilities['whereFormat'];

/** Encode les caractères structurels de la syntaxe colon dans une valeur. */
export function escapeColonValue(value: string): string {
  return value.replace(/%/g, '%25').replace(/,/g, '%2C').replace(/:/g, '%3A').replace(/\|/g, '%7C');
}

/** Décode une valeur issue d'une clause colon (inverse d'escapeColonValue). */
export function unescapeColonValue(value: string): string {
  return value
    .replace(/%2C/gi, ',')
    .replace(/%3A/gi, ':')
    .replace(/%7C/gi, '|')
    .replace(/%25/gi, '%');
}

/**
 * Construit la clause WHERE colon des sélections de facettes.
 * Remplace les 4 copies (generic, grist, tabular, insee).
 */
export function buildColonFacetWhere(
  selections: Record<string, Set<string>>,
  excludeField?: string
): string {
  const parts: string[] = [];
  for (const [field, values] of Object.entries(selections)) {
    if (field === excludeField || values.size === 0) continue;
    if (values.size === 1) {
      parts.push(`${field}:eq:${escapeColonValue([...values][0])}`);
    } else {
      parts.push(`${field}:in:${[...values].map(escapeColonValue).join('|')}`);
    }
  }
  return parts.join(', ');
}

/**
 * Joint des clauses WHERE selon le dialecte du provider.
 * ` AND ` en ODSQL, `, ` en colon — joindre du colon par ` AND ` produit
 * des clauses invalides (le parseur colon découpe sur `,`).
 */
export function joinWhere(format: WhereFormat, clauses: Array<string | undefined | null>): string {
  const list = clauses.filter((c): c is string => !!c);
  return list.join(format === 'odsql' ? ' AND ' : ', ');
}
