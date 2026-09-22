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
import { repondreTabular } from '../builder-e2e/api-fixtures.js';
import communes from './jeux/affichages-communes.json' with { type: 'json' };
import serie from './jeux/affichages-serie.json' with { type: 'json' };
import libelles from './jeux/affichages-libelles.json' with { type: 'json' };
import long from './jeux/affichages-long.json' with { type: 'json' };
import contoursDepartements from './jeux/affichages-contours-departements.json' with { type: 'json' };

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

/** Les quatre jeux, sous le nom que les manifestes leur donnent. */
export const JEUX_AFFICHAGES = {
  communes: COMMUNES,
  serie: SERIE,
  libelles: LIBELLES,
  long: LONG,
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
