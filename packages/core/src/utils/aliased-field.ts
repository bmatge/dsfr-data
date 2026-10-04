/**
 * Colonne à alias inline — `champ` ou `champ:Libellé` — lue face aux DONNÉES.
 *
 * Un seul analyseur pour `label-field` / `value-field` de `dsfr-data-a11y`
 * (#1230, PG-032 du banc) et pour `label-field` de `dsfr-data-chart` (#1244) :
 * `parseAliasedColumn` (#668), plus une précaution de compatibilité. Avant
 * l'alias, l'entrée ENTIÈRE était le nom de la colonne ; un jeu dont une
 * colonne s'appelle réellement `a:b` ne doit pas voir ses libellés se vider.
 * Une entrée qui existe telle quelle dans la première ligne, deux-points
 * compris, est donc lue telle quelle — et elle est son propre libellé.
 */
import { parseAliasedColumn, type AliasedColumn } from '@dsfr-data/shared/lib';

export function resolveAliasedColumn(entry: string, rows: readonly unknown[]): AliasedColumn {
  const literal = entry.trim();
  if (literal.includes(':') && hasOwnColumn(rows[0], literal)) {
    return { key: literal, label: literal };
  }
  return parseAliasedColumn(literal);
}

/** La ligne porte-t-elle, à plat, une colonne de ce nom exact ? */
export function hasOwnColumn(row: unknown, name: string): boolean {
  return row !== null && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row, name);
}
