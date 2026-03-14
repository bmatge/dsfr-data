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
    // Comma only - likely French decimal separator
    cleaned = cleaned.replace(',', '.');
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? (strict ? null : 0) : num;
}

/**
 * Check if a string value looks like a number
 * Accepts: 123, 123.45, 123,45, 1 234, 1 234,56, -123, etc.
 */
export function looksLikeNumber(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const cleaned = val.trim();
  if (cleaned === '') return false;
  return /^-?[\d\s]+([.,]\d+)?$/.test(cleaned);
}
