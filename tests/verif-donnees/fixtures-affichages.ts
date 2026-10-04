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
import type { Row, Step } from '../../tools/oracle/manifest.js';
import { repondreTabular } from '../builder-e2e/api-fixtures.js';
import communes from './jeux/affichages-communes.json' with { type: 'json' };
import serie from './jeux/affichages-serie.json' with { type: 'json' };
import libelles from './jeux/affichages-libelles.json' with { type: 'json' };
import long from './jeux/affichages-long.json' with { type: 'json' };
import absences from './jeux/affichages-absences.json' with { type: 'json' };
import horsDecoupage from './jeux/affichages-hors-decoupage.json' with { type: 'json' };
import contoursDepartements from './jeux/affichages-contours-departements.json' with { type: 'json' };
import zones from './jeux/affichages-zones.json' with { type: 'json' };
import aides from './jeux/affichages-aides.json' with { type: 'json' };
import symboles from './jeux/affichages-symboles.json' with { type: 'json' };
import encarts from './jeux/affichages-encarts.json' with { type: 'json' };

/** Hôte fictif — TLD réservé (RFC 2606) : rien ne peut joindre le réseau. */
export const HOTE_AFFICHAGES = 'https://affichages.verif.invalid';

/**
 * Les 48 communes, libellés accentués compris. Le jeu a été ENGENDRÉ une fois
 * par des formules (aucune colonne constante ni proportionnelle à une autre,
 * sinon une moyenne pondérée vaudrait la moyenne simple et le contrôle de #763
 * ne garderait rien) puis MATÉRIALISÉ dans `jeux/affichages-communes.json` :
 * ce sont ces lignes-là que tout le monde lit (`jeux/README.md`).
 */
export const COMMUNES: Row[] = communes;

/**
 * Douze mois d'une même série, dans l'ordre chronologique. La dernière valeur
 * vaut exactement 1,4 fois la première : l'évolution attendue est un taux rond
 * (40 %), qu'un affichage à la mauvaise unité rend illisible du premier coup.
 */
export const SERIE: Row[] = serie;

/**
 * Huit libellés dont l'ordre alphabétique français diffère de l'ordre des
 * codes de caractères : « É » (U+00C9) y passerait après « Z ».
 */
export const LIBELLES: Row[] = libelles;

/**
 * Données au format LONG (une ligne par couple mois × groupe) : c'est ce que
 * `series-field` pivote en une série par groupe. Le groupe B n'a pas la même
 * allure que le groupe A — deux séries qui se suivraient ne diraient pas si
 * elles ont été aiguillées correctement.
 */
export const LONG: Row[] = long;

/**
 * Trois absences au format long (#1198, BUG-028 et BUG-029 du banc) : une
 * cellule manquante (Cadres en mars), une valeur nulle (Agents en février) et
 * un groupe sans AUCUNE valeur (Stagiaires, `null` puis chaîne vide). Une
 * absence n'est pas un zéro : l'oracle rend `null`, la bibliothèque aussi.
 */
export const ABSENCES: Row[] = absences;

/**
 * Huit départements dont trois HORS découpage (#1201, PG-083 du banc) : un code
 * vide, l'étranger (99) et la Nouvelle-Calédonie (988), que la
 * carte départementale ne dessine pas. Le résumé de la carte ne les compte
 * pas : la carte doit le DIRE, et chiffrer la part écartée d'une somme.
 */
export const HORS_DECOUPAGE: Row[] = horsDecoupage;

/**
 * Dix zones à la manière d'un jeu Opendatasoft (#1053) : chaque ligne porte
 * À LA FOIS `geo_point_2d` (un point {lat, lon}) et `geo_shape` (un polygone
 * GeoJSON). Une couche `geoshape` sans `geo-field` doit tracer la FORME : le
 * calcul d'emprise, lui, devine `geo_point_2d` en premier — reprendre sa
 * détection telle quelle ne tracerait rien.
 */
export const ZONES: Row[] = zones;

/**
 * « Aides nationales » au format LONG (#1108) : une ligne par couple ville ×
 * aide, coordonnées RÉPÉTÉES. Six villes aux effectifs inégaux (1 à 5
 * lignes), dans un ordre entrelacé : une couche `group-field="Ville"` doit
 * tracer six marqueurs, et le volet d'une ville lister chacune de ses aides.
 */
export const AIDES: Row[] = aides;

/**
 * Neuf villes et un nombre d'entrées (AM-107) pour les symboles proportionnels
 * d'une couche `circle` : un zéro (l'ancrage), 1, 4 et 100 (le rapport des
 * rayons en aire doit valoir 2 et 10), des carrés parfaits et trois valeurs
 * qui n'en sont pas (2, 7, 50 — l'arrondi au pixel s'y voit). L'ordre du
 * fichier n'est pas celui des valeurs : un rayon rendu sur la mauvaise ligne
 * se verrait.
 */
export const SYMBOLES: Row[] = symboles;

/**
 * Dix lieux pour une carte à encarts (BUG-034) : quatre en métropole, trois à
 * La Réunion, deux en Guadeloupe, un en Guyane — aucun à Mayotte. Chacun est
 * loin du bord de son encart, ou sur un autre continent : « dans l'emprise »
 * ne dépend ni d'un pixel ni d'une marge. `type` (quatre musées, six
 * théâtres) sert de filtre : un encart doit REMPLACER ses entités, pas les
 * ajouter. Lignes entrelacées : l'ordre du fichier n'est pas celui des
 * territoires.
 */
export const ENCARTS: Row[] = encarts;

/** Les dix jeux, sous le nom que les manifestes leur donnent. */
export const JEUX_AFFICHAGES = {
  communes: COMMUNES,
  serie: SERIE,
  libelles: LIBELLES,
  long: LONG,
  absences: ABSENCES,
  'hors-decoupage': HORS_DECOUPAGE,
  zones: ZONES,
  aides: AIDES,
  symboles: SYMBOLES,
  encarts: ENCARTS,
} as const;

/**
 * Fond des départements de la composition par échelle de la Carto (#1021) :
 * les 101 codes du fond livré avec le paquet, sous des carrés. Servi à l'URL
 * EXACTE que la Carto génère, en `FeatureCollection` — la page l'aplatit
 * (`flatten="properties"`) et le joint au comptage sur `code`.
 */
export const CONTOURS_DEPARTEMENTS: Row[] = contoursDepartements;
export const URL_CONTOURS_DEPARTEMENTS =
  'https://cdn.jsdelivr.net/npm/dsfr-data@0/geo/departements.json';

/** URL d'un jeu servi en tableau nu. */
export function urlAffichage(nom: keyof typeof JEUX_AFFICHAGES): string {
  return `${HOTE_AFFICHAGES}/${nom}`;
}

/**
 * Les 48 communes servies IMBRIQUÉES (#1244) : chaque ligne sous une clé
 * `fields`, précédée d'un `id` — la forme d'un enregistrement Grist lu sans
 * aplatissement. Un jeu reste un tableau d'objets plats (`jeux/README.md`) :
 * c'est le faux serveur qui emballe, et l'oracle repart des lignes plates. Un
 * afficheur doit donc lire `fields.budget` par CHEMIN pour montrer le budget.
 */
export const URL_COMMUNES_IMBRIQUEES = `${HOTE_AFFICHAGES}/communes-imbriquees`;

/**
 * Les emprises des encarts du contrôle BUG-034, en latitudes et longitudes
 * écrites à la main : de larges rectangles autour de chaque territoire, sans
 * rapport avec le cadre en pixels que la carte calcule. Aucun lieu du jeu
 * n'est près d'un bord.
 */
const emprise = (sud: number, nord: number, ouest: number, est: number): Step => ({
  op: 'filter',
  filters: [
    { field: 'lat', op: 'gte', value: sud },
    { field: 'lat', op: 'lte', value: nord },
    { field: 'lon', op: 'gte', value: ouest },
    { field: 'lon', op: 'lte', value: est },
  ],
});
export const DANS_LA_REUNION = emprise(-21.6, -20.6, 55, 56);
export const DANS_LA_GUADELOUPE = emprise(15.8, 16.6, -61.9, -61);
export const DANS_LA_GUYANE = emprise(2, 6, -55, -51);

/**
 * La carte à encarts du contrôle BUG-034 (et de son canari) : une couche de
 * cercles derrière une facette, et quatre encarts posés par `center` et
 * `zoom` — La Réunion, la Guadeloupe, la Guyane, et Mayotte qui n'a aucun
 * lieu. Chaque encart porte un id : c'est LUI qu'on observe, pas la carte.
 */
export const MARKUP_ENCARTS = `
  <dsfr-data-source id="s-encarts" url="${urlAffichage('encarts')}"></dsfr-data-source>
  <dsfr-data-facets id="f-encarts" source="s-encarts" fields="type" labels="type:Type"></dsfr-data-facets>
  <dsfr-data-map id="carte-encarts" center="46.6,2.3" zoom="5" height="300px" tiles="osm">
    <dsfr-data-map-layer id="couche-encarts" source="f-encarts" type="circle" radius="6"
      lat-field="lat" lon-field="lon" shape-class="verif-encart"></dsfr-data-map-layer>
    <dsfr-data-map-inset id="encart-reunion" center="-21.13,55.53" zoom="8" label="La Réunion"></dsfr-data-map-inset>
    <dsfr-data-map-inset id="encart-guadeloupe" center="16.20,-61.45" zoom="9" label="Guadeloupe"></dsfr-data-map-inset>
    <dsfr-data-map-inset id="encart-guyane" center="4.00,-53.10" zoom="6" label="Guyane"></dsfr-data-map-inset>
    <dsfr-data-map-inset id="encart-mayotte" center="-12.83,45.15" zoom="10" label="Mayotte"></dsfr-data-map-inset>
  </dsfr-data-map>`;

/** Le faux serveur du lot : une URL, une réponse — ou `null` si imprévue. */
export function repondreAffichages(url: URL): unknown | null {
  if (url.href === URL_CONTOURS_DEPARTEMENTS) {
    return {
      type: 'FeatureCollection',
      features: CONTOURS_DEPARTEMENTS.map(({ geometry, ...properties }) => ({
        type: 'Feature',
        properties,
        geometry,
      })),
    };
  }
  if (url.href === URL_COMMUNES_IMBRIQUEES) {
    return COMMUNES.map((fields, i) => ({ id: i + 1, fields }));
  }
  if (url.origin !== HOTE_AFFICHAGES) return null;
  const nom = url.pathname.replace(/^\//, '') as keyof typeof JEUX_AFFICHAGES;
  return JEUX_AFFICHAGES[nom] ?? null;
}

/**
 * Ressource Tabular du lot (#1020) : les 48 communes servies dans l'enveloppe
 * Tabular (`{ data, links, meta }`, `meta.total` = 48), pour qu'une source
 * `limit="10"` soit TRONQUÉE EN AMONT et que la couche de carte le dise.
 *
 * Tabular garde le VRAI hôte (l'adaptateur n'accepte pas de `base-url` pour
 * cette variante, voir `fixtures.ts`) : une ressource propre à ce domaine,
 * pour ne partager ses lignes avec aucun autre.
 */
export const RESSOURCE_TABULAR_AFFICHAGES = 'ea1b5c3d-0000-4000-8000-affichages001';
const HOTE_TABULAR_AFFICHAGES = 'https://tabular-api.data.gouv.fr';

/** Réponse Tabular du lot, ou `null` si l'URL ne désigne pas sa ressource. */
export function repondreAffichagesTabular(url: URL): unknown | null {
  if (url.origin !== HOTE_TABULAR_AFFICHAGES) return null;
  if (url.pathname !== `/api/resources/${RESSOURCE_TABULAR_AFFICHAGES}/data/`) return null;
  return repondreTabular(url, COMMUNES);
}
