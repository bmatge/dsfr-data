/**
 * Coercition booléenne tolérante des cellules open data (#677).
 *
 * Les colonnes « Oui/Non » arrivent sous mille formes : `Oui`, `oui`, `OUI`,
 * `O`, `Yes`, `Y`, `true`, `vrai`, `1`, `X`, ou simplement une cellule non
 * vide face à une cellule vide. À l'inverse, l'absence s'écrit `Non`, `N`,
 * `false`, `0`, `""`, `N/A`, `NC`, `NR`, `-`, `null`…
 *
 * Doctrine : **présence = vrai**. Toute valeur non vide est vraie SAUF si elle
 * appartient au petit lexique de négations ci-dessous (insensible à la casse
 * et aux accents), ou si elle est numérique et vaut zéro. Ce choix rend la
 * fonction utilisable telle quelle sur une colonne « X / vide ».
 *
 * Partagé (lib-safe) : `fold` de `dsfr-data-normalize`, et tout composant qui
 * doit lire une colonne booléenne sans connaître sa convention d'écriture.
 */

/** Formes écrites de « non » (comparées après trim, minuscules, sans accents). */
const FALSY_TOKENS: ReadonlySet<string> = new Set([
  '',
  '0',
  'non',
  'no',
  'n',
  'false',
  'faux',
  'f',
  'nul',
  'null',
  'none',
  'nan',
  'undefined',
  'n/a',
  'na',
  'nc',
  'nr',
  'nd',
  'n.d.',
  'n.d',
  'non renseigne',
  'non concerne',
  'sans objet',
  '-',
  '--',
  '—',
  '–',
]);

/** Nombre décimal simple (point ou virgule), signe optionnel. */
const SIMPLE_NUMBER_RE = /^[+-]?\d+(?:[.,]\d+)?$/;

/**
 * Convertit une valeur de cellule en booléen.
 *
 * - `boolean` : inchangé ;
 * - `number` : vrai sauf `0` et `NaN` ;
 * - `null` / `undefined` : faux ;
 * - tableau : vrai s'il contient au moins un élément ;
 * - chaîne : faux si vide ou dans le lexique des négations (`non`, `n`, `false`,
 *   `faux`, `0`, `n/a`, `nc`, `nr`, `-`…), faux si numérique et nulle,
 *   vrai sinon (`oui`, `x`, `yes`, `1`, `vrai`, ou tout texte de présence) ;
 * - objet : vrai.
 */
export function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value !== 'string') return true;

  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (FALSY_TOKENS.has(normalized)) return false;
  if (SIMPLE_NUMBER_RE.test(normalized)) {
    return parseFloat(normalized.replace(',', '.')) !== 0;
  }
  return true;
}
