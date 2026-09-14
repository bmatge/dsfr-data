/**
 * Alimentation déterministe du lot AFFICHAGES (L5) — les lignes servies à la
 * page et celles dont l'oracle repart sont les MÊMES.
 *
 * Trois jeux, taillés pour ce que ce lot éprouve :
 *   - `communes` : 48 lignes, assez pour une page 2 (21-40) et pour des
 *     classes de choroplèthe qui ne dégénèrent pas ; des ordres de grandeur
 *     écartés (population en millions, budget à la centaine d'euros, taux en
 *     pourcentage déjà exprimé) pour que chaque format d'affichage ait de quoi
 *     se distinguer ; un effectif (`eleves`) qui éloigne franchement la moyenne
 *     pondérée de la moyenne simple (#763) ; un code département valide pour
 *     les cartes DSFR Chart ; des coordonnées pour la carte Leaflet ;
 *   - `serie` : douze mois croissants, pour `first`, `last`, `evolution`,
 *     `trend`, le cumul et les dates ;
 *   - `libelles` : huit libellés accentués, dont l'ordre alphabétique français
 *     n'est PAS l'ordre des codes de caractères (« Écully » se range entre
 *     « Douai » et « Épernay », pas après « Zutkerque »).
 *
 * CE MODULE NE SAIT RIEN DE PLAYWRIGHT : il prend une URL, il rend une
 * réponse. Le test-garde d'indépendance (`tests/oracle/guard.test.ts`)
 * parcourt son graphe d'imports et refuserait toute entrée par `packages/`.
 */
import type { Row } from '../../tools/oracle/manifest.js';

/** Hôte fictif — TLD réservé (RFC 2606) : rien ne peut joindre le réseau. */
export const HOTE_AFFICHAGES = 'https://affichages.verif.invalid';

/**
 * Quarante-huit libellés, accents compris : le tri d'une colonne texte n'est
 * pas un tri de codes de caractères, et une colonne de libellés sans accent
 * ne le dirait pas.
 */
const NOMS = [
  'Arles',
  'Avignon',
  'Bordeaux',
  'Brest',
  'Caen',
  'Calais',
  'Cannes',
  'Chartres',
  'Cholet',
  'Colmar',
  'Dijon',
  'Douai',
  'Épernay',
  'Épinal',
  'Évreux',
  'Évry',
  'Foix',
  'Gap',
  'Grenoble',
  'Hyères',
  'Istres',
  'Laval',
  'Lille',
  'Limoges',
  'Lorient',
  'Lyon',
  'Mâcon',
  'Melun',
  'Metz',
  'Nancy',
  'Nantes',
  'Nice',
  'Nîmes',
  'Niort',
  'Orléans',
  'Pau',
  'Poitiers',
  'Reims',
  'Rennes',
  'Roanne',
  'Rodez',
  'Rouen',
  'Saintes',
  'Sète',
  'Toulon',
  'Tours',
  'Vannes',
  'Vichy',
];

const ZONES = ['Nord', 'Sud', 'Est', 'Ouest'];

/**
 * Les 48 communes. Chaque colonne est construite par une formule, donc
 * reproductible à la lecture ; aucune n'est constante, et aucune n'est
 * proportionnelle à une autre — sinon une moyenne pondérée vaudrait la moyenne
 * simple et le contrôle de #763 ne garderait rien.
 */
export const COMMUNES: Row[] = NOMS.map((nom, i) => ({
  code: String(101 + i),
  dept: String(i + 1).padStart(2, '0'),
  nom,
  zone: ZONES[i % 4],
  population: 12_345 * (i + 1) + (i % 7) * 9_871,
  budget: 1_749.25 + i * 312.5,
  taux: 12.5 + ((i * 7) % 61),
  eleves: 100 + ((i * 13) % 37) * 50,
  agents: 3 + (i % 9),
  maj: `2026-${String(1 + (i % 9)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
  lat: 43 + (i % 9) * 0.7,
  lon: -2 + (i % 11) * 0.8,
}));

/**
 * Douze mois d'une même série, dans l'ordre chronologique. La dernière valeur
 * vaut exactement 1,4 fois la première : l'évolution attendue est un taux rond
 * (40 %), qu'un affichage à la mauvaise unité rend illisible du premier coup.
 */
export const SERIE: Row[] = [
  { mois: '2026-01', jour: '2026-01-15', valeur: 120, objectif: 150 },
  { mois: '2026-02', jour: '2026-02-15', valeur: 132, objectif: 150 },
  { mois: '2026-03', jour: '2026-03-15', valeur: 127, objectif: 150 },
  { mois: '2026-04', jour: '2026-04-15', valeur: 141, objectif: 155 },
  { mois: '2026-05', jour: '2026-05-15', valeur: 138, objectif: 155 },
  { mois: '2026-06', jour: '2026-06-15', valeur: 149, objectif: 155 },
  { mois: '2026-07', jour: '2026-07-15', valeur: 152, objectif: 160 },
  { mois: '2026-08', jour: '2026-08-15', valeur: 147, objectif: 160 },
  { mois: '2026-09', jour: '2026-09-15', valeur: 155, objectif: 160 },
  { mois: '2026-10', jour: '2026-10-15', valeur: 161, objectif: 165 },
  { mois: '2026-11', jour: '2026-11-15', valeur: 159, objectif: 165 },
  { mois: '2026-12', jour: '2026-12-15', valeur: 168, objectif: 165 },
];

/**
 * Huit libellés dont l'ordre alphabétique français diffère de l'ordre des
 * codes de caractères : « É » (U+00C9) y passerait après « Z ».
 */
export const LIBELLES: Row[] = [
  { nom: 'Zutkerque', score: 12 },
  { nom: 'Étampes', score: 45 },
  { nom: 'Évry-Courcouronnes', score: 7 },
  { nom: 'Arles', score: 103 },
  { nom: 'Ölbronn', score: 58 },
  { nom: 'Écully', score: 91 },
  { nom: 'Avignon', score: 34 },
  { nom: 'Ussel', score: 76 },
];

/**
 * Données au format LONG (une ligne par couple mois × groupe) : c'est ce que
 * `series-field` pivote en une série par groupe. Le groupe B n'a pas la même
 * allure que le groupe A — deux séries qui se suivraient ne diraient pas si
 * elles ont été aiguillées correctement.
 */
export const LONG: Row[] = [
  { mois: 'Janvier', groupe: 'Cadres', valeur: 120 },
  { mois: 'Janvier', groupe: 'Agents', valeur: 310 },
  { mois: 'Février', groupe: 'Cadres', valeur: 145 },
  { mois: 'Février', groupe: 'Agents', valeur: 288 },
  { mois: 'Mars', groupe: 'Cadres', valeur: 132 },
  { mois: 'Mars', groupe: 'Agents', valeur: 341 },
];

/** Les quatre jeux, sous le nom que les manifestes leur donnent. */
export const JEUX_AFFICHAGES = {
  communes: COMMUNES,
  serie: SERIE,
  libelles: LIBELLES,
  long: LONG,
} as const;

/** URL d'un jeu servi en tableau nu. */
export function urlAffichage(nom: keyof typeof JEUX_AFFICHAGES): string {
  return `${HOTE_AFFICHAGES}/${nom}`;
}

/** Le faux serveur du lot : une URL, une réponse — ou `null` si imprévue. */
export function repondreAffichages(url: URL): unknown | null {
  if (url.origin !== HOTE_AFFICHAGES) return null;
  const nom = url.pathname.replace(/^\//, '') as keyof typeof JEUX_AFFICHAGES;
  return JEUX_AFFICHAGES[nom] ?? null;
}
