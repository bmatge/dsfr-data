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
 * Elle sait aussi RETIRER un zero de tete (#766) : un jeu qui publie ses
 * departements sur trois caracteres (`059`, `02A`) ou l'outre-mer sur quatre
 * (`0971`) voyait chaque ligne comptee puis jetee, et la carte se vidait. Le
 * zero n'est retire que si le reste est un code valide : `000` reste `000`,
 * donc invalide, plutot que de devenir un `00` tout aussi faux.
 *
 * Ne touche ni a `2A`/`2B` ni aux codes d'outre-mer a trois chiffres.
 */
export function normalizeDeptCode(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  const code = String(raw).trim();
  if (/^\d+$/.test(code) && code.length < 3) return code.padStart(2, '0');
  const padded = /^0(\d{2}|2[AB]|97\d)$/i.exec(code);
  if (padded) {
    const stripped = padded[1].toUpperCase();
    if (isValidDeptCode(stripped)) return stripped;
  }
  return code;
}
