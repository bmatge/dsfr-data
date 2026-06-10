/**
 * Formatters — re-export de la famille UNIQUE @dsfr-data/shared (#317).
 * Les previews des apps consomment les memes fonctions : preview = rendu.
 */
export {
  formatValue,
  formatNumber,
  formatPercentage,
  formatCurrency,
  formatDecimal,
  formatDate,
} from '@dsfr-data/shared/lib';
export type { FormatType } from '@dsfr-data/shared/lib';

/**
 * Détermine la couleur selon les seuils
 */
export function getColorBySeuil(
  value: number,
  seuilVert?: number,
  seuilOrange?: number
): 'vert' | 'orange' | 'rouge' | 'bleu' {
  if (seuilVert !== undefined && value >= seuilVert) {
    return 'vert';
  }
  if (seuilOrange !== undefined && value >= seuilOrange) {
    return 'orange';
  }
  if (seuilVert !== undefined || seuilOrange !== undefined) {
    return 'rouge';
  }
  return 'bleu';
}

/**
 * Retourne la classe CSS DSFR correspondant à une couleur
 */
export function getDsfrColorClass(color: 'vert' | 'orange' | 'rouge' | 'bleu'): string {
  const colorMap: Record<string, string> = {
    vert: 'fr-badge--success',
    orange: 'fr-badge--warning',
    rouge: 'fr-badge--error',
    bleu: 'fr-badge--info',
  };
  return colorMap[color] || colorMap.bleu;
}

/**
 * Retourne la couleur CSS DSFR pour les KPI
 */
export function getDsfrKpiColor(color: 'vert' | 'orange' | 'rouge' | 'bleu'): string {
  const colorMap: Record<string, string> = {
    vert: 'var(--background-contrast-success)',
    orange: 'var(--background-contrast-warning)',
    rouge: 'var(--background-contrast-error)',
    bleu: 'var(--background-contrast-info)',
  };
  return colorMap[color] || colorMap.bleu;
}
