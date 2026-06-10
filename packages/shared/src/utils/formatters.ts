/**
 * Formatters — famille UNIQUE (#317), consommee par les composants
 * (packages/core re-exporte) ET par les previews des apps : la preview du
 * builder affiche exactement ce que rendra le composant.
 *
 * Politique `%` documentee : `formatPercentage(5)` rend « 5 % » — la valeur
 * est un POURCENTAGE deja exprime (5 = 5 %), pas un ratio (0.05). C'est le
 * contrat du composant dsfr-data-kpi (`format="pourcentage"`).
 */

export type FormatType = 'nombre' | 'pourcentage' | 'euro' | 'decimal';

import { toNumber } from './number-parser.js';

/**
 * Formate un nombre selon le type specifie — '—' pour le non-numerique
 * (toNumber strict #301 : '1 234,5' est parse, 'abc' rend '—', jamais 0).
 */
export function formatValue(
  value: number | string | null | undefined,
  format: FormatType = 'nombre'
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const parsed = typeof value === 'string' ? toNumber(value, true) : value;
  const num = parsed === null ? NaN : parsed;

  if (isNaN(num)) {
    return '—';
  }

  switch (format) {
    case 'nombre':
      return formatNumber(num);
    case 'pourcentage':
      return formatPercentage(num);
    case 'euro':
      return formatCurrency(num);
    case 'decimal':
      return formatDecimal(num);
    default:
      return formatNumber(num);
  }
}

/** Nombre entier avec separateurs de milliers (format francais) */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

/** Pourcentage : la valeur EST le pourcentage (5 -> « 5 % ») */
export function formatPercentage(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

/** Montant en euros, 0 decimale (contrat du composant kpi) */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Nombre decimal (1 a 2 decimales) */
export function formatDecimal(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Date au format francais JJ/MM/AAAA — '—' si invalide */
export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;

  if (isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/**
 * Format KPI des previews d'apps (builder, builder-ia, favorites).
 *
 * @deprecated Wrapper de compatibilite (#317) : delegue a formatValue —
 * la preview rend desormais EXACTEMENT ce que rend le composant (euro
 * etait a 2 decimales ici contre 0 dans le composant). Mapper l'unite :
 * '€'/'EUR' -> 'euro', '%' -> 'pourcentage', sinon 'nombre'.
 */
export function formatKPIValue(value: number, unit?: string): string {
  const format: FormatType =
    unit === '\u20AC' || unit === 'EUR' ? 'euro' : unit === '%' ? 'pourcentage' : 'nombre';
  return formatValue(value, format);
}

/**
 * Format a date to French locale string (court : « 5 juin 2026 »)
 */
export function formatDateShort(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
