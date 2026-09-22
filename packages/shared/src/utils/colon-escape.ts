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

/**
 * Champs d'une clause colon (#1026) : `a|b:contains:x` vise `a` OU `b`.
 *
 * La grammaire « champs multiples » applique le MÊME opérateur et la MÊME
 * valeur à plusieurs champs, reliés par un OU ; les clauses restent, elles,
 * reliées par un ET. `|` sépare donc les champs AVANT le premier `:` et les
 * valeurs d'un `in` / `notin` APRÈS le second — la position lève
 * l'ambiguïté. Un nom de champ ne peut porter aucun des trois séparateurs
 * (`,` `:` `|`), comme avant.
 *
 * Une clause à un seul champ rend un tableau d'un élément : c'est le cas
 * général, et tous les parseurs le traitent comme tel.
 */
export function splitColonFields(field: string): string[] {
  return field
    .split('|')
    .map((f) => f.trim())
    .filter(Boolean);
}

/** Une clause colon vise-t-elle plusieurs champs (`a|b:op:v`, #1026) ? */
export function isMultiFieldClause(clause: string): boolean {
  const field = clause.split(':')[0] ?? '';
  return splitColonFields(field).length > 1;
}
