/**
 * French department code validation
 */

/**
 * Validate a French department code
 * Valid codes: 01-95, 2A, 2B, 971-976
 */
export function isValidDeptCode(code: string | null | undefined): boolean {
  if (!code || typeof code !== 'string') return false;
  if (['N/A', 'null', 'undefined', '00', ''].includes(code)) return false;
  if (code === '2A' || code === '2B') return true;
  if (/^97[1-6]$/.test(code)) return true;
  if (/^(0[1-9]|[1-8]\d|9[0-5])$/.test(code)) return true;
  return false;
}

/**
 * Normalise un code departement avant validation ou rendu.
 *
 * DSFR Chart attend le format INSEE zero-pade (`01`, pas `1`) : c'est la
 * regle de rendu, et `isValidDeptCode` a raison d'etre stricte. Mais une
 * source livre tres souvent des codes numeriques non completes — un `1` qui
 * a perdu son zero en passant par un tableur ou un JSON.
 *
 * Cette fonction est la source UNIQUE du padding (#610). Elle etait
 * auparavant recopiee a l'identique en trois endroits (le composant, le
 * generateur du Builder deux fois) et ABSENTE de la detection, qui validait
 * donc la valeur brute : une source aux codes 1..13 declenchait
 * « Aucun code departement detecte » pendant que la carte se rendait
 * parfaitement.
 *
 * Ne touche ni a `2A`/`2B` ni aux codes d'outre-mer a trois chiffres.
 */
export function normalizeDeptCode(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  const code = String(raw).trim();
  if (/^\d+$/.test(code) && code.length < 3) return code.padStart(2, '0');
  return code;
}
