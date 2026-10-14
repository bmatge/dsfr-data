/**
 * Ce que « ce texte correspond » veut dire dans le navigateur (ADR-159, lot 4,
 * #1285). Deux contrats, une seule écriture chacun :
 *
 *   - le FILTRE (`contains` / `notcontains` d'un `where` ou d'un `filter`, et
 *     `contains()` de `compute`) : SOUS-CHAÎNE, casse ignorée, accents
 *     respectés — {@link filterTextContains}. C'est la bibliothèque qui dit ce
 *     qu'il retient ; un serveur ne le calcule que si la structure de sa
 *     comparaison est la même (`server-clause.ts`).
 *   - la RECHERCHE (ce qu'un visiteur tape dans `dsfr-data-search`) :
 *     tolérante, casse ET accents ignorés, opérateur `contains`, `starts` ou
 *     `words` — {@link matchesSearch}. Calculée ici quand la source n'a pas de
 *     moteur, ou quand `dsfr-data-search` filtre les lignes qu'elle reçoit.
 *
 * Les lecteurs : `applyLocalFilter` (KPI, source, Builder, compute en `when`),
 * `_matchesField` de `dsfr-data-query`, `contains()` de `compute`,
 * `applyWhereFilter` des outils du Studio, `dsfr-data-search` et la source
 * (recherche du contexte). Le test-garde `tests/text-match-guard.test.ts`
 * refuse une nouvelle écriture de la sous-chaîne hors de ce module.
 *
 * Ce module ne décide pas du sort d'une valeur ABSENTE : chaque lecteur garde
 * le sien, écrit chez lui (voir l'écart du Studio dans `ia/data-tools.ts`).
 * Il est pur, sans DOM ni réseau : lib-safe, exporté par les DEUX barrels.
 */

import { stripAccents } from '../utils/strip-accents.js';
import type { ContextSearch } from './context-filter.js';

// ---------------------------------------------------------------------------
// Le filtre : exact
// ---------------------------------------------------------------------------

/**
 * Le texte `value` porte-t-il `needle` n'importe où, casse ignorée, accents
 * respectés ? La comparaison du filtre `contains`, et rien d'autre : une
 * valeur absente est l'affaire de l'appelant (`null` devient ici « null »).
 */
export function filterTextContains(value: unknown, needle: string): boolean {
  return String(value).toLowerCase().includes(needle.toLowerCase());
}

// ---------------------------------------------------------------------------
// La recherche : tolérante
// ---------------------------------------------------------------------------

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
