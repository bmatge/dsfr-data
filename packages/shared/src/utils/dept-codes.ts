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
