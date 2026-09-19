/**
 * Alimentation déterministe du lot TRANSFORMATIONS.
 *
 * Ces jeux sont servis à la page par l'attribut `data` de `dsfr-data-source`
 * (données inline, aucun fetch) et donnés tels quels à l'oracle : les deux
 * côtés repartent EXACTEMENT des mêmes lignes, et le contrôle ne dépend
 * d'aucun faux serveur.
 *
 * Les LIGNES vivent dans `jeux/transformations-*.json` (#879) — un jeu, un
 * fichier, lisible hors TypeScript et par le banc d'essai. Ce pour quoi
 * chaque jeu a été taillé est écrit dans `jeux/README.md` : chaîne vide FACE
 * à un null, décimale française, accents et apostrophes, chaîne numérique à
 * zéro de tête, champ tableau, division par zéro, clé de jointure vide et
 * clé à la graphie divergente (#792), cellule absente d'un pivot (#878).
 *
 * CE MODULE NE SAIT RIEN DE PLAYWRIGHT ni de la bibliothèque : le test-garde
 * d'indépendance (`tests/oracle/guard.test.ts`) parcourt son graphe d'imports
 * et refuserait toute entrée par `packages/`.
 */
import type { Row } from '../../tools/oracle/manifest.js';
import territoires from './jeux/transformations-territoires.json' with { type: 'json' };
import brutes from './jeux/transformations-brutes.json' with { type: 'json' };
import calculs from './jeux/transformations-calculs.json' with { type: 'json' };
import long from './jeux/transformations-long.json' with { type: 'json' };
import editions from './jeux/transformations-editions.json' with { type: 'json' };
import large from './jeux/transformations-large.json' with { type: 'json' };
import gauche from './jeux/transformations-gauche.json' with { type: 'json' };
import droite from './jeux/transformations-droite.json' with { type: 'json' };
import gaucheGraphie from './jeux/transformations-gauche-graphie.json' with { type: 'json' };
import compositeGauche from './jeux/transformations-composite-gauche.json' with { type: 'json' };
import compositeDroite from './jeux/transformations-composite-droite.json' with { type: 'json' };
import pile2024 from './jeux/transformations-pile-2024.json' with { type: 'json' };
import pile2025 from './jeux/transformations-pile-2025.json' with { type: 'json' };
import barometreQuestions from './jeux/transformations-barometre-questions.json' with { type: 'json' };
import barometreScores from './jeux/transformations-barometre-scores.json' with { type: 'json' };

/** Douze territoires : filtres, agrégats, regroupements, tris. */
export const TERRITOIRES: Row[] = territoires;

/** Huit lignes brutes pour la normalisation (typage, arrondi, renommage, découpe, repli). */
export const BRUTES: Row[] = brutes;

/** Six lignes taillées pour la grammaire des colonnes calculées. */
export const CALCULS: Row[] = calculs;

/** Format LONG pour le pivot : communes × années, cellules absentes, décimale française. */
export const LONG: Row[] = long;

/** Deux éditions d'un baromètre, deux questions à une seule édition (#878, cas 2). */
export const EDITIONS: Row[] = editions;

/** Format LARGE pour le dépliage : trois mois en colonnes, une cellule vide. */
export const LARGE: Row[] = large;

/** Côté gauche d'une jointure : deux clés vides, une clé sans correspondance. */
export const GAUCHE: Row[] = gauche;

/** Côté droit : une clé sans correspondance à gauche, une clé VIDE. */
export const DROITE: Row[] = droite;

/** Même référentiel que `DROITE`, à la graphie près (#792). */
export const GAUCHE_GRAPHIE: Row[] = gaucheGraphie;

/** Clé composite : l'année ET le code, aucun des deux ne suffit. */
export const COMPOSITE_GAUCHE: Row[] = compositeGauche;
export const COMPOSITE_DROITE: Row[] = compositeDroite;

/** Deux millésimes de même schéma, à empiler. */
export const PILE_2024: Row[] = pile2024;
export const PILE_2025: Row[] = pile2025;

/** Les cinq questions RÉPÉTÉES par `dsfr-data-repeat` (#891) : une ligne, une instance. */
export const BAROMETRE_QUESTIONS: Row[] = barometreQuestions;

/** Les scores PARTITIONNÉS par `scopes` : onze lignes, cinq clés, dont une à somme nulle. */
export const BAROMETRE_SCORES: Row[] = barometreScores;

/**
 * Les lignes d'un jeu, prêtes pour l'attribut `data` d'un
 * `dsfr-data-source` : du JSON dans un attribut HTML entre quotes simples.
 * L'apostrophe et l'esperluette des libellés (« Côte-d'Or », « Recherche &
 * Essais ») cassent l'attribut si elles ne sont pas entités — ce sont
 * justement celles que les jeux portent exprès.
 */
export function inline(rows: Row[]): string {
  return JSON.stringify(rows).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;');
}
