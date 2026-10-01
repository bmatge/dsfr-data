/**
 * Number parsing utilities supporting French and international formats
 */

/**
 * Parse a value to number, handling French (comma) and international (dot) formats.
 * Returns 0 for non-parseable values when strict is false (default).
 * Returns null for non-parseable values when strict is true.
 */
export function toNumber(val: unknown, strict?: false): number;
export function toNumber(val: unknown, strict: true): number | null;
export function toNumber(val: unknown, strict = false): number | null {
  if (typeof val === 'number') return isNaN(val) ? (strict ? null : 0) : val;
  if (typeof val !== 'string') return strict ? null : 0;

  let cleaned = val.trim();
  if (cleaned === '') return strict ? null : 0;

  // Strict (#1200, BUG-023/032) : la chaîne entière doit être un nombre. Un
  // symbole d'unité FINAL est toléré (« 45,2 % », « 12 € ») — il est courant
  // dans les jeux publics et ne change pas la valeur.
  if (strict) cleaned = cleaned.replace(UNIT_SUFFIX, '');

  // Remove space separators (thousands)
  cleaned = cleaned.replace(/\s/g, '');

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    // Mixed format: determine which is the decimal separator (the last one)
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      // French format: 1.234,56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // English format: 1,234.56
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    const commaCount = (cleaned.match(/,/g) || []).length;
    if (commaCount > 1) {
      // '1,234,567' : separateurs de milliers anglais — replace(',', '.')
      // ne remplacait que la premiere virgule -> 1.234 (#301)
      cleaned = cleaned.replace(/,/g, '');
    } else {
      // Virgule unique : decimale francaise ('1,234' = 1.234 — convention
      // francaise assumee, les milliers anglais a virgule unique sont
      // ambigus et la lib est French-first)
      cleaned = cleaned.replace(',', '.');
    }
  } else if (hasDot) {
    const dotCount = (cleaned.match(/\./g) || []).length;
    if (dotCount > 1) {
      // '1.234.567' : milliers francais a points (#301)
      cleaned = cleaned.replace(/\./g, '');
    }
    // Point unique : decimale — inchange
  }

  // Strict : plus aucun PRÉFIXE numérique. `parseFloat` lisait « 2026-09-25 »
  // 2026, « 2024-09 » 2024, « 75A » 75 : un `max` de dates rendait l'année,
  // et « Depuis le 01/01/1970 » s'affichait. Pour lire un préfixe exprès
  // (« 1922-1930 » → 1922), `toLeadingNumber`.
  if (strict && !FULL_NUMBER.test(cleaned)) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? (strict ? null : 0) : num;
}

/** Symbole d'unité final toléré par la lecture stricte (#1200). */
const UNIT_SUFFIX = /\s*[%‰€$£]$/;

/** Un nombre ENTIER après nettoyage des séparateurs : signe, décimales, exposant. */
// Classes disjointes et quantificateurs bornés par des littéraux : linéaire.
// eslint-disable-next-line security/detect-unsafe-regex
const FULL_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * Le nombre qui OUVRE la chaîne, en connaissance de cause (#1200) :
 * « 1922-1930 » → 1922, « 75A » → 75. C'est l'ancienne lecture « stricte »,
 * devenue un choix explicite (`dsfr-data-normalize numeric-prefix`). Aucun
 * nombre en tête → `null`.
 */
export function toLeadingNumber(val: unknown): number | null {
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (typeof val !== 'string') return null;
  const m = /^\s*([+-]?\d[\d\s]*(?:[.,]\d+)?)/.exec(val);
  return m ? toNumber(m[1].trim(), true) : null;
}

/**
 * Check if a string value looks like a number
 * Accepts: 123, 123.45, 123,45, 1 234, 1 234,56, -123, etc.
 *
 * VOLONTAIREMENT plus strict que toNumber (#317) : detection conservatrice
 * (numeric-auto ne doit convertir que l'evident — '1e3', '50%', '+123'
 * sont rejetes ici) quand toNumber est un PARSEUR tolerant pour les champs
 * explicitement declares numeriques.
 */
export function looksLikeNumber(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const cleaned = val.trim();
  if (cleaned === '') return false;
  // Linear: [\d\s] and [.,] character classes don't overlap → no catastrophic backtracking.
  // eslint-disable-next-line security/detect-unsafe-regex
  return /^-?[\d\s]+([.,]\d+)?$/.test(cleaned);
}
