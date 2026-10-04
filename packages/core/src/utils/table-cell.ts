/**
 * Texte d'une cellule de tableau de données — UNE fonction pour les deux
 * tableaux qui accompagnent un graphique : celui de `dsfr-data-a11y` (#666) et
 * celui de la DataBox de `dsfr-data-chart` (#1244). Deux fonctions divergeaient
 * déjà : `2.27` d'un côté, « 2,27 » de l'autre, pour la même ligne.
 *
 * Les nombres sont rendus en fr-FR (`formatNumberFr` : au plus 2 décimales, ou
 * exactement `decimals`) ; une absence (`null`, `undefined`) est une cellule
 * vide ; tout le reste est rendu tel quel — une chaîne n'est jamais relue comme
 * un nombre (code INSEE « 01 », SIREN).
 */
import { formatNumberFr } from '@dsfr-data/shared/lib';

export function formatTableCell(value: unknown, decimals?: number | null): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return formatNumberFr(
      value,
      decimals === null || decimals === undefined ? undefined : { decimals }
    );
  }
  return String(value);
}
