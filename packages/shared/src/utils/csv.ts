/**
 * Construction de CSV robuste, partagée entre les composants d'export
 * (dsfr-data-list, dsfr-data-a11y) et les apps.
 *
 * - Quoting RFC 4180 : toute cellule contenant le séparateur, un guillemet
 *   ou un saut de ligne (\n, \r) est entourée de guillemets doublés.
 * - BOM UTF-8 en tête (par défaut) pour qu'Excel FR ouvre les accents
 *   correctement.
 * - Neutralisation de l'injection de formules tableur : les cellules
 *   commençant par `=`, `@`, tabulation, ou par `+`/`-` sans être un nombre,
 *   sont préfixées d'une apostrophe.
 */

export interface CsvColumn {
  key: string;
  label?: string;
}

export interface BuildCsvOptions {
  /** Colonnes à exporter (ordre et libellés). Par défaut : clés de la 1re ligne, champs techniques `_*` exclus. */
  columns?: CsvColumn[];
  /** Séparateur de cellules. Par défaut `;` (convention Excel FR). */
  separator?: string;
  /** Préfixer le fichier du BOM UTF-8. Par défaut `true`. */
  bom?: boolean;
}

/** BOM UTF-8 — à retirer si on concatène plusieurs CSV. */
export const CSV_BOM = '\uFEFF';

/** Nombre simple, éventuellement signé, décimales `.` ou `,`, notation scientifique. */
// Chaque quantificateur porte sur une classe disjointe du caractère suivant : pas de backtracking exponentiel.
// eslint-disable-next-line security/detect-unsafe-regex
const PLAIN_NUMBER = /^[+-]?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?$/;

function neutralizeFormula(str: string): string {
  if (!str) return str;
  const first = str[0];
  if (first === '=' || first === '@' || first === '\t') return "'" + str;
  if ((first === '+' || first === '-') && !PLAIN_NUMBER.test(str.trim())) return "'" + str;
  return str;
}

function formatCell(value: unknown, separator: string): string {
  const str = value === null || value === undefined ? '' : String(value);
  const neutralized = neutralizeFormula(str);
  if (
    neutralized.includes(separator) ||
    neutralized.includes('"') ||
    neutralized.includes('\n') ||
    neutralized.includes('\r')
  ) {
    return '"' + neutralized.replace(/"/g, '""') + '"';
  }
  return neutralized;
}

/**
 * Construit un fichier CSV complet (en-tête + lignes) à partir de records.
 * Retourne une chaîne vide si `rows` est vide et qu'aucune colonne n'est fournie.
 */
export function buildCsv(
  rows: Array<Record<string, unknown>>,
  options: BuildCsvOptions = {}
): string {
  const separator = options.separator ?? ';';
  const bom = options.bom ?? true;

  const columns: CsvColumn[] =
    options.columns ??
    (rows.length > 0
      ? Object.keys(rows[0])
          .filter((k) => !k.startsWith('_'))
          .map((key) => ({ key }))
      : []);

  if (columns.length === 0) return '';

  const header = columns.map((c) => formatCell(c.label ?? c.key, separator)).join(separator);
  const body = rows.map((row) =>
    columns.map((c) => formatCell(row[c.key], separator)).join(separator)
  );

  return (bom ? CSV_BOM : '') + [header, ...body].join('\n');
}
