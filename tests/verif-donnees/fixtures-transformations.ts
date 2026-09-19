/**
 * Alimentation déterministe du lot TRANSFORMATIONS.
 *
 * Ces jeux sont servis à la page par l'attribut `data` de `dsfr-data-source`
 * (données inline, aucun fetch) et donnés tels quels à l'oracle : les deux
 * côtés repartent EXACTEMENT des mêmes lignes, et le contrôle ne dépend
 * d'aucun faux serveur.
 *
 * Ils sont écrits à la main, ligne à ligne, pour porter les cas limites du
 * lot : chaîne vide FACE à un null (une valeur vide n'est pas une valeur
 * absente), décimale française, accents et apostrophes, chaîne numérique à
 * zéro de tête, champ tableau, division par zéro, clé de jointure vide et
 * clé de jointure à la graphie divergente (#792).
 *
 * CE MODULE NE SAIT RIEN DE PLAYWRIGHT ni de la bibliothèque : le test-garde
 * d'indépendance (`tests/oracle/guard.test.ts`) parcourt son graphe d'imports
 * et refuserait toute entrée par `packages/`.
 */
import type { Row } from '../../tools/oracle/manifest.js';

/**
 * Douze territoires : filtres, agrégats, regroupements, tris.
 *
 * `statut` porte les trois états qu'un filtre confond trop facilement —
 * renseigné, chaîne VIDE, `null` ; `taux` est écrit en décimale française ;
 * `code` porte un zéro de tête (`0042`) que l'égalité lâche doit ramener au
 * nombre ; `nom` porte accents, apostrophe et esperluette ; `mesure` MÊLE des
 * nombres et des « NC », la paire mixte que les comparaisons d'ordre rangent
 * en texte.
 */
// Une ligne par territoire : un jeu de fixtures se lit comme un tableau.
// prettier-ignore
export const TERRITOIRES: Row[] = [
  { code: '01',   nom: 'Bouches-du-Rhône',   zone: 'sud',   categorie: 'A', population: 2000000, taux: '12,5',  annee: '2024-03-15', statut: 'ouvert', mois: '2026-01', flux: 10,  mesure: 250, tags: 'mer, soleil' },
  { code: '02',   nom: "Côte-d'Or",          zone: 'est',   categorie: 'B', population: 530000,  taux: '8,25',  annee: '2023-11-02', statut: 'ferme',  mois: '2026-01', flux: 20,  mesure: 'NC', tags: 'vigne' },
  { code: '03',   nom: "Val-d'Oise",         zone: 'nord',  categorie: 'A', population: 1250000, taux: '15',    annee: '2024-07-01', statut: 'ouvert', mois: '2026-02', flux: 30,  mesure: 90, tags: 'ville, transport' },
  { code: '04',   nom: 'Ille-et-Vilaine',    zone: 'nord',  categorie: 'B', population: 1080000, taux: '9,75',  annee: '2022-01-20', statut: '',       mois: '2026-02', flux: 40,  mesure: 1200, tags: 'mer' },
  { code: '05',   nom: 'Haute-Garonne',      zone: 'sud',   categorie: 'A', population: 1400000, taux: '11',    annee: '2024-03-15', statut: 'ouvert', mois: '2026-03', flux: 50,  mesure: 'NC', tags: 'ville' },
  { code: '06',   nom: 'Bas-Rhin',           zone: 'est',   categorie: 'B', population: 1140000, taux: '7,5',   annee: '2023-05-09', statut: 'ferme',  mois: '2026-03', flux: 60,  mesure: 100, tags: 'vigne, ville' },
  { code: '07',   nom: 'Recherche & Essais', zone: 'nord',  categorie: 'A', population: 2600000, taux: '14,25', annee: '2021-12-31', statut: 'ouvert', mois: '2026-01', flux: 70,  mesure: 45, tags: 'ville' },
  { code: '08',   nom: 'Var',                zone: 'sud',   categorie: 'B', population: 1080000, taux: '10,5',  annee: '2024-09-18', statut: 'ferme',  mois: '2026-02', flux: 80,  mesure: 'NC', tags: 'mer, soleil' },
  { code: '09',   nom: 'Loire-Atlantique',   zone: 'nord',  categorie: 'A', population: 1080000, taux: '13',    annee: '2022-06-05', statut: null,     mois: '2026-03', flux: 90,  mesure: 300, tags: 'mer' },
  { code: '10',   nom: 'Rhône',              zone: 'est',   categorie: 'B', population: 1870000, taux: '6,75',  annee: '2023-02-14', statut: 'ferme',  mois: '2026-01', flux: 100, mesure: 80, tags: 'ville' },
  { code: '11',   nom: 'Gironde',            zone: 'sud',   categorie: 'A', population: 1620000, taux: '16,5',  annee: '2024-01-09', statut: '',       mois: '2026-02', flux: 110, mesure: 150, tags: 'vigne, mer' },
  { code: '0042', nom: "Territoire d'essai", zone: 'nord',  categorie: 'B', population: 42000,   taux: '5',     annee: '2021-03-03', statut: 'ouvert', mois: '2026-03', flux: 120, mesure: 'NC', tags: '' },
];

/**
 * Huit lignes brutes pour la normalisation : chaînes à convertir, valeurs à
 * arrondir, colonnes à renommer, libellés à remplacer, champs multivalués à
 * découper, colonnes Oui/Non parallèles à replier.
 */
// prettier-ignore
export const BRUTES: Row[] = [
  { cle: 'a', montant_txt: '1 234,5', part: 0.123456, lib_dep: 'Nord',        etat: 'N/A', annee: '2024', axes: 'eau|air',       acces_moteur: 'Oui', acces_visuel: 'Non' },
  { cle: 'b', montant_txt: '2 000',   part: 0.5,      lib_dep: 'Sud',         etat: 'ok',  annee: '2025', axes: 'air',           acces_moteur: 'Non', acces_visuel: 'Oui' },
  { cle: 'c', montant_txt: '12,75',   part: 0.987654, lib_dep: 'Est',         etat: 'n.d.', annee: '2024', axes: 'eau|sol|air',  acces_moteur: 'Oui', acces_visuel: 'Oui' },
  { cle: 'd', montant_txt: '0',       part: 0,        lib_dep: 'Ouest',       etat: 'ok',  annee: '2026', axes: '',              acces_moteur: 'Non', acces_visuel: 'Non' },
  { cle: 'e', montant_txt: '',        part: 0.25,     lib_dep: 'Centre',      etat: 'N/A', annee: '2025', axes: 'sol',           acces_moteur: 'Oui', acces_visuel: 'Non' },
  { cle: 'f', montant_txt: '3 000,25', part: 0.75,    lib_dep: 'Corse',       etat: 'ok',  annee: '2024', axes: 'eau|sol',       acces_moteur: 'Non', acces_visuel: 'Oui' },
  { cle: 'g', montant_txt: '45',      part: 0.019,    lib_dep: 'Guadeloupe',  etat: 'n.d.', annee: '2026', axes: 'air|sol',      acces_moteur: 'Oui', acces_visuel: 'Non' },
  { cle: 'h', montant_txt: '7,5',     part: 0.4445,   lib_dep: 'Réunion',     etat: 'ok',  annee: '2025', axes: 'eau',           acces_moteur: 'Non', acces_visuel: 'Non' },
];

/**
 * Six lignes taillées pour la grammaire des colonnes calculées : un
 * dénominateur NUL (division par zéro), un opérande ABSENT, une cellule
 * VIDE face à un zéro, une date ISO, un champ TABLEAU, des libellés à
 * capitaliser, à rogner et à remplacer.
 */
// prettier-ignore
export const CALCULS: Row[] = [
  { cle: 'c1', a: 10,  b: 2,    quota: 0,  vide: '',   texte: '  Préfecture  ', date: '2024-03-15', liste: ['eau', 'air'],  seuil: 5 },
  { cle: 'c2', a: 7,   b: 0,    quota: 3,  vide: 'x',  texte: 'Sous-préfecture', date: '2023-11-02', liste: [],             seuil: 5 },
  { cle: 'c3', a: 100, b: 8,    quota: 0,  vide: '',   texte: 'Mairie',         date: '2022-06-05', liste: ['sol'],        seuil: 5 },
  { cle: 'c4', a: null, b: 4,   quota: 12, vide: 'y',  texte: 'Conseil',        date: '2021-12-31', liste: ['air', 'sol'], seuil: 5 },
  { cle: 'c5', a: 3,   b: 6,    quota: 7,  vide: '',   texte: 'Région',         date: '2026-01-09', liste: ['eau'],        seuil: 5 },
  { cle: 'c6', a: 45,  b: 9,    quota: 0,  vide: 'z',  texte: 'Département',    date: '2025-09-18', liste: [],             seuil: 5 },
];

/**
 * Format LONG pour le pivot : deux années par commune, une commune sans
 * observation pour 2023 (la cellule doit rester vide, jamais 0), une paire
 * de lignes qui tombent dans la MÊME cellule (la réduction s'y voit), et
 * une ligne dont le champ pivoté est vide (elle ne fait pas de colonne).
 */
// prettier-ignore
export const LONG: Row[] = [
  { commune: 'Lyon',   annee: '2022', montant: 10,  ouverture: '2022-04-01' },
  { commune: 'Lyon',   annee: '2023', montant: 12,  ouverture: '2023-02-15' },
  { commune: 'Lyon',   annee: '2023', montant: 8,   ouverture: '2023-08-30' },
  { commune: 'Nice',   annee: '2022', montant: 7,   ouverture: '2022-11-20' },
  { commune: 'Nice',   annee: '2024', montant: 21,  ouverture: '2024-05-05' },
  { commune: 'Brest',  annee: '2022', montant: 5,   ouverture: '2022-01-10' },
  { commune: 'Brest',  annee: '2023', montant: '4,5', ouverture: '2023-06-18' },
  { commune: 'Brest',  annee: '2024', montant: 9,   ouverture: '2024-09-02' },
  { commune: 'Nancy',  annee: '',     montant: 99,  ouverture: '2020-01-01' },
];

/**
 * Deux ÉDITIONS d'un baromètre, en format long : une part de répondants par
 * question et par année (#878, cas 2 du 18/09).
 *
 * Deux questions n'ont qu'une édition — `teletravail` posée en 2024 seulement,
 * `cybersecurite` en 2025 seulement. Après pivot, leur cellule manquante est
 * ABSENTE, pas nulle : une soustraction qui la prendrait pour un zéro
 * fabriquerait une variation de −85,2 points pour une question qui n'a pas
 * été reposée, et la mettrait en tête du classement des variations. Les
 * valeurs sont choisies pour que ce faux −85,2 dépasse la plus forte
 * variation réelle (+12,5).
 */
// prettier-ignore
export const EDITIONS: Row[] = [
  { question: 'site-internet',   annee: '2024', score: 60.1 },
  { question: 'site-internet',   annee: '2025', score: 66.4 },
  { question: 'facture-elec',    annee: '2024', score: 40 },
  { question: 'facture-elec',    annee: '2025', score: 52.5 },
  { question: 'ia',              annee: '2024', score: 8 },
  { question: 'ia',              annee: '2025', score: 19.2 },
  { question: 'reseaux-sociaux', annee: '2024', score: 55 },
  { question: 'reseaux-sociaux', annee: '2025', score: 54.1 },
  { question: 'teletravail',     annee: '2024', score: 85.2 },
  { question: 'cybersecurite',   annee: '2025', score: 33.3 },
];

/**
 * Format LARGE pour le dépliage : trois mois en colonnes, une cellule vide
 * (elle disparaît avec `drop-empty`), une valeur en décimale française.
 */
// prettier-ignore
export const LARGE: Row[] = [
  { indicateur: 'Consommation', unite: 'MWh', c2026_01: '120',  c2026_02: '110,5', c2026_03: '95' },
  { indicateur: 'Production',   unite: 'MWh', c2026_01: '80',   c2026_02: '',      c2026_03: '130' },
  { indicateur: 'Solde',        unite: 'MWh', c2026_01: '-40',  c2026_02: '20',    c2026_03: '35' },
];

/**
 * Côté gauche d'une jointure : deux lignes sans clé (chaîne vide, `null`),
 * une ligne dont la clé n'existe pas à droite.
 */
// prettier-ignore
export const GAUCHE: Row[] = [
  { code: '01', libelle: 'Alpha',   valeur: 10 },
  { code: '02', libelle: 'Bravo',   valeur: 20 },
  { code: '03', libelle: 'Charlie', valeur: 30 },
  { code: '99', libelle: 'Zoulou',  valeur: 40 },
  { code: '',   libelle: 'Vide',    valeur: 50 },
  { code: null, libelle: 'Absent',  valeur: 60 },
];

/** Côté droit : une clé sans correspondance à gauche, une clé VIDE. */
// prettier-ignore
export const DROITE: Row[] = [
  { code: '01', region: 'Hauts-de-France', poids: 100 },
  { code: '02', region: 'Normandie',       poids: 200 },
  { code: '03', region: 'Bretagne',        poids: 300 },
  { code: '77', region: 'Occitanie',       poids: 400 },
  { code: '',   region: 'Sans code',       poids: 500 },
];

/**
 * Même référentiel que `DROITE`, à la GRAPHIE près (#792) : les codes y
 * portent un zéro de tête que la gauche n'a pas. Deux clés seulement
 * s'apparient — c'est le 1,5 % d'écart plausible et faux du banc d'essai.
 */
// prettier-ignore
export const GAUCHE_GRAPHIE: Row[] = [
  { code: '1',  libelle: 'Un',     valeur: 11 },
  { code: '02', libelle: 'Deux',   valeur: 22 },
  { code: '03', libelle: 'Trois',  valeur: 33 },
  { code: '4',  libelle: 'Quatre', valeur: 44 },
];

/** Clé composite : l'année ET le code, aucun des deux ne suffit. */
// prettier-ignore
export const COMPOSITE_GAUCHE: Row[] = [
  { annee: '2024', code: '01', valeur: 1 },
  { annee: '2024', code: '02', valeur: 2 },
  { annee: '2025', code: '01', valeur: 3 },
  { annee: '2025', code: '02', valeur: 4 },
];

// prettier-ignore
export const COMPOSITE_DROITE: Row[] = [
  { annee: '2024', code: '01', budget: 1000 },
  { annee: '2025', code: '02', budget: 2000 },
  { annee: '2023', code: '01', budget: 3000 },
];

/** Deux millésimes de même schéma, à empiler. */
// prettier-ignore
export const PILE_2024: Row[] = [
  { mois: '01', montant: 10, libelle: 'Janvier' },
  { mois: '02', montant: 20, libelle: 'Février' },
  { mois: '03', montant: 30, libelle: 'Mars' },
];

// prettier-ignore
export const PILE_2025: Row[] = [
  { mois: '01', montant: 15, libelle: 'Janvier' },
  { mois: '02', montant: 25, libelle: 'Février' },
];

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
