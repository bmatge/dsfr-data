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

// Implementation partagee avec les utilitaires app-side (filter-translator) :
// definie dans @dsfr-data/shared (lib-safe), re-exportee ici pour les
// consommateurs de packages/core (#315).
export { escapeColonValue, unescapeColonValue, filterToOdsql } from '@dsfr-data/shared/lib';
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
 * Joint des clauses WHERE selon le dialecte du provider.
 * ` AND ` en ODSQL, `, ` en colon — joindre du colon par ` AND ` produit
 * des clauses invalides (le parseur colon découpe sur `,`).
 */
export function joinWhere(format: WhereFormat, clauses: Array<string | undefined | null>): string {
  const list = clauses.filter((c): c is string => !!c);
  return list.join(format === 'odsql' ? ' AND ' : ', ');
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
