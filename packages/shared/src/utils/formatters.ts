/**
 * Formatters for KPI values, numbers, and dates
 */

/**
 * Format a KPI value with optional unit (currency, percentage)
 */
export function formatKPIValue(value: number, unit?: string): string {
  const num = Math.round(value * 100) / 100;
  if (unit === '\u20AC' || unit === 'EUR') {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  } else if (unit === '%') {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(num) + ' %';
  }
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(num);
}

/**
 * Format a date to French locale string
 */
export function formatDateShort(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
