import { formatNumberFr } from '@dsfr-data/shared/lib';

/**
 * Compteur de résultats paramétrable — grammaire commune à `dsfr-data-search`
 * (#779), `dsfr-data-display` et `dsfr-data-list` (#925, AM-077).
 *
 * La grammaire de l'attribut `count-label`, à lire ici plutôt qu'à deviner :
 *
 * - `count-label="établissement"` — UNE forme. Le pluriel est obtenu en
 *   ajoutant un « s » : « 1 établissement », « 12 établissements ».
 * - `count-label="cheval|chevaux"` — DEUX formes séparées par une **barre
 *   verticale** (pas une virgule : la virgule sépare les entrées d'autres
 *   attributs, jamais celles-ci — cf. `attr-separators.test.ts`). Utile pour
 *   un pluriel irrégulier, et pour un mot invariable : `"prix | prix"`.
 * - Les espaces autour des formes sont retirés.
 * - Attribut absent ou vide : le composant garde son libellé par défaut.
 *
 * L'accord se fait sur `n === 1` : le singulier français couvre 0 et 1
 * (« 0 résultat »), là où l'anglais mettrait le pluriel à 0.
 */
export function countNoun(countLabel: string, n: number, fallback = 'résultat'): string {
  const [singular, plural] = (countLabel.trim() || fallback).split('|').map((form) => form.trim());
  if (n === 1) return singular;
  return plural || `${singular}s`;
}

/**
 * Compteur complet « <nombre> <nom accordé> » quand `count-label` est posé.
 *
 * Le nombre passe par le formateur fr-FR (espace fine insécable de milliers)
 * — c'est ce que fait déjà `dsfr-data-search`. Le compteur PAR DÉFAUT de
 * `display` et de `list` n'est pas touché par cette fonction : il est rendu
 * tel quel par les composants, pour ne rien changer aux pages qui ne posent
 * pas l'attribut (#925, point résiduel laissé ouvert).
 */
export function formatCountWithLabel(countLabel: string, n: number): string {
  return `${formatNumberFr(n)} ${countNoun(countLabel, n)}`;
}
