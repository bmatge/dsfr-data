/**
 * Échappement des caractères structurels de la syntaxe colon
 * (`field:op:value, field2:op:v1|v2`) — partagé entre la lib
 * (`packages/core/src/utils/where.ts`) et les utilitaires app-side
 * (`query/filter-translator.ts`). Cf. #271 / #315.
 *
 * Les caractères `,` `:` `|` présents dans une VALEUR sont percent-encodés
 * (avec `%` lui-même pour la réversibilité). Les parseurs décodent via
 * `unescapeColonValue` APRÈS découpage sur les séparateurs structurels.
 */

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
