/**
 * La comparaison TOLÉRANTE d'une recherche, dans le navigateur (ADR-159).
 *
 * Une seule écriture pour les deux endroits où une recherche est calculée
 * hors d'un serveur : `dsfr-data-search` sur les lignes qu'elle reçoit, et
 * `dsfr-data-source` quand la recherche lui arrive par le contexte et que son
 * API n'a rien pour chercher (lot 3, #1285). Casse et accents sont ignorés —
 * c'est ce qui distingue la recherche du filtre `contains`, qui respecte les
 * accents.
 *
 * Le module partagé de comparaison de texte (filtre ET recherche) est le
 * lot 4 de l'ADR-159 : il reprendra ces trois règles telles quelles.
 */

import { stripAccents } from '@dsfr-data/shared/lib';
import type { ContextSearch } from '@dsfr-data/shared/lib';

/** `contains` sous-chaîne · `starts` début d'un mot · `words` tous les mots du terme. */
export type SearchOperator = ContextSearch['operator'];

/** Forme comparée d'un texte : sans accents, sans casse, sans blancs de bord. */
export function normalizeSearchText(value: unknown): string {
  return stripAccents(String(value)).toLowerCase().trim();
}

/**
 * La ligne répond-elle au terme (DÉJÀ normalisé) ? `fields` vide : tous les
 * champs de la ligne, hors champs techniques (`_…`). `read` lit la valeur
 * d'un champ — par défaut la clé telle quelle.
 */
export function matchesSearch(
  record: Record<string, unknown>,
  normTerm: string,
  fields: string[],
  operator: SearchOperator,
  read: (row: Record<string, unknown>, field: string) => unknown = (row, field) => row[field]
): boolean {
  const searchFields =
    fields.length > 0 ? fields : Object.keys(record).filter((k) => !k.startsWith('_'));
  const text = (field: string) => normalizeSearchText(read(record, field) ?? '');

  switch (operator) {
    case 'starts':
      return searchFields.some((f) =>
        text(f)
          .split(/\s+/)
          .some((w) => w.startsWith(normTerm))
      );

    case 'words': {
      const queryWords = normTerm.split(/\s+/).filter(Boolean);
      return queryWords.every((qw) => searchFields.some((f) => text(f).includes(qw)));
    }

    case 'contains':
    default:
      return searchFields.some((f) => text(f).includes(normTerm));
  }
}

/** Les lignes qui répondent à TOUTES les recherches (un ET entre elles). */
export function applySearches<T extends Record<string, unknown>>(
  rows: T[],
  searches: ContextSearch[],
  read?: (row: Record<string, unknown>, field: string) => unknown
): T[] {
  const active = searches
    .map((s) => ({ ...s, norm: normalizeSearchText(s.term) }))
    .filter((s) => s.norm !== '');
  if (active.length === 0) return rows;
  return rows.filter((row) =>
    active.every((s) => matchesSearch(row, s.norm, s.fields, s.operator || 'contains', read))
  );
}

/** Une recherche dite en clair, pour un message : « terme » dans champ. */
export function describeSearch(search: ContextSearch): string {
  const where = search.fields.length > 0 ? ` dans ${search.fields.join(', ')}` : '';
  return `« ${search.term} »${where}`;
}
