/**
 * Texte d'une cellule de tableau de données — UNE fonction pour les deux
 * tableaux qui accompagnent un graphique : celui de `dsfr-data-a11y` (#666) et
 * celui de la DataBox de `dsfr-data-chart` (#1244). Deux fonctions divergeaient
 * déjà : `2.27` d'un côté, « 2,27 » de l'autre, pour la même ligne.
 *
 * Les nombres sont rendus en fr-FR (`formatNumberFr` : au plus 2 décimales, ou
 * exactement `decimals`) ; une absence (`null`, `undefined`) est une cellule
 * vide ; tout le reste est rendu tel quel — une chaîne n'est jamais relue comme
 * un nombre (code INSEE « 01 », SIREN, « 0,00123 » déjà écrit).
 *
 * Un tableau équivalent n'annonce jamais zéro pour une valeur qui ne l'est pas
 * (#1282). Sans `decimals`, une valeur non nulle inférieure à 0,01 en valeur
 * absolue garde ses deux premiers chiffres significatifs, écrits en entier :
 * 0,00123 → « 0,0012 », −0,00123 → « -0,0012 », 1e-12 → « 0,000000000001 »
 * (jamais de notation scientifique). Zéro, et `-0`, s'écrivent « 0 ». À partir
 * de 0,01 rien ne change : « 0,01 », « 2,27 », « 1 234 567,89 ». La règle vit
 * dans `formatNumberFr`, que `dsfr-data-list` appelle aussi : les trois
 * tableaux de la bibliothèque écrivent le même texte. Avec `decimals`, le
 * nombre de décimales demandé est tenu tel quel (0,00123 à 2 → « 0,00 »).
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
