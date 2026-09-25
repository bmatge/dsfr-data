/**
 * Utilitaires WHERE partagés entre composants et adapters (#271).
 *
 * Les composants écrivent leurs filtres dans la grammaire colon
 * (`field:op:value` joints par `, `, multi-valeurs séparées par `|`). Le
 * dialecte de l'API (traduction, jointure, échappement) appartient à
 * l'adaptateur (#1135) : `translateWhere`, `joinWhere` et `escapeSearchTerm`
 * ci-dessous le résolvent via `adapters/where-dialect.ts`, sans qu'aucun
 * composant ne connaisse un dialecte.
 *
 * Les caractères structurels de la syntaxe colon (`,` `:` `|`) présents dans
 * une VALEUR sont percent-encodés par `escapeColonValue` (avec `%` lui-même,
 * pour la réversibilité). Tous les parseurs colon (query, Grist SQL/Records,
 * Tabular, INSEE) décodent via `unescapeColonValue` après découpage.
 *
 * CHAMPS MULTIPLES (#1026) : `a|b:op:valeur` applique le MÊME opérateur et la
 * MÊME valeur à plusieurs champs, reliés par un OU (`splitColonFields`) ; les
 * clauses restent reliées par un ET. C'est le seul OU de la grammaire — pas de
 * clause `or(...)` générale — et il ne réserve aucun caractère de plus : `,`
 * `:` `|` restent les trois séparateurs. Traductions : Tabular
 * `or=(a__op.v,b__op.v)`, ODSQL `(a … OR b …)`, Grist SQL `(a … OR b …)`,
 * client (query, KPI) en OU ; INSEE et generic refusent (`supportsServerWhere`)
 * et laissent le filtre au client.
 */

import { whereDialectOf, type WhereDialectCarrier } from '../adapters/where-dialect.js';

export type { WhereDialectCarrier } from '../adapters/where-dialect.js';

// Implementation partagee avec les utilitaires app-side (filter-translator) :
// definie dans @dsfr-data/shared (lib-safe), re-exportee ici pour les
// consommateurs de packages/core (#315).
export {
  escapeColonValue,
  unescapeColonValue,
  filterToOdsql,
  splitColonFields,
  isMultiFieldClause,
} from '@dsfr-data/shared/lib';
import { escapeColonValue } from '@dsfr-data/shared/lib';

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
 * Joint par un ET des clauses WHERE dans le dialecte de l'adaptateur (#271,
 * #1135) — ` AND ` en ODSQL, `, ` en colon : joindre du colon par ` AND `
 * produit des clauses invalides (le parseur colon découpe sur `,`). Les
 * clauses vides sont écartées. `adapter` absent (source sans adaptateur) =
 * colon.
 */
export function joinWhere(
  adapter: WhereDialectCarrier | null | undefined,
  clauses: Array<string | undefined | null>
): string {
  const list = clauses.filter((c): c is string => !!c);
  return whereDialectOf(adapter).join(list);
}

/**
 * Traduit une clause colon (la grammaire des composants) dans le dialecte de
 * l'adaptateur (#275, #1135). Les composants passent par ici plutôt que de
 * connaître un dialecte : c'est ce qui les garde neutres (garde-fou
 * `tests/lib-provider-neutrality.test.ts`). Une clause vide reste vide.
 */
export function translateWhere(
  adapter: WhereDialectCarrier | null | undefined,
  colonWhere: string
): string {
  if (!colonWhere) return colonWhere;
  return whereDialectOf(adapter).translate(colonWhere);
}

/**
 * Échappe un terme libre (recherche serveur) pour l'insérer dans une clause
 * du dialecte de l'adaptateur (#271, #1135).
 */
export function escapeSearchTerm(
  adapter: WhereDialectCarrier | null | undefined,
  term: string
): string {
  return whereDialectOf(adapter).escape(term);
}

/** Partie d'un tri multi-champs. */
export interface OrderByPart {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Parse la grammaire de tri commune `"field:dir, field2:dir2"` (#273).
 * Même grammaire sur tous les adapters — ODS ne transformait que le dernier
 * segment, Tabular splittait sur `:` globalement (malformé en multi-champs).
 */
export function parseOrderBy(orderBy: string): OrderByPart[] {
  if (!orderBy) return [];
  return orderBy
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const [field, dir] = part.split(':').map((s) => s.trim());
      return { field, direction: dir === 'desc' ? 'desc' : 'asc' } as OrderByPart;
    })
    .filter((p) => !!p.field);
}
