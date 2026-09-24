/**
 * Scenarios du banc de pertinence du Studio (#1112).
 *
 * Un scenario = un jeu de donnees, un ou plusieurs messages de l'usager, et ce
 * qu'on attend du document final et des reponses. Les attentes s'ecrivent dans
 * le vocabulaire des OUTILS du Studio (`BLOCK_SPEC_SCHEMA`, camelCase), pas
 * dans celui des attributs HTML : c'est ce que le modele peut ecrire (#1109).
 *
 * `pr: true` : joue sur une PR qui touche au Studio — les plus discriminants,
 * pour tenir le budget d'appels. La nuit joue tout.
 */

import type { MotsCles, Scenario } from './criteres.js';
import { AIDES_NATIONALES, ETABLISSEMENTS, MUSEES, POPULATION_REGIONS } from './fixtures.js';

/** « Ce n'est pas possible dans le Studio », sous ses formes usuelles. */
const DIT_IMPOSSIBLE: MotsCles = {
  libelle: 'impossibilité annoncée',
  tous: [
    [
      'pas possible',
      'impossible',
      'ne peux pas',
      'ne sais pas',
      'ne permet pas',
      'ne propose pas',
      'pas disponible',
      'pas realisable',
      "n'est pas prevu",
      'ne gere pas',
      'pas en mesure',
      'hors de portee',
      'aucun outil',
      'aucun bloc',
    ],
  ],
};

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'aides-nationales',
    titre: 'Aides nationales : un marqueur par ville, volet listant les aides',
    pr: true,
    source: { nom: 'Aides nationales par ville', lignes: AIDES_NATIONALES },
    messages: [
      'Je veux une carte avec un seul marqueur par ville. Quand on clique sur une ville, un volet ' +
        'latéral doit lister toutes les aides nationales dont elle bénéficie.',
    ],
    attendu: {
      blocs: [
        {
          libelle: 'carte regroupée par ville, volet latéral',
          kind: 'map',
          couche: {
            groupField: 'Ville',
            popupMode: { unDe: ['panel-right', 'panel-left'] },
            latField: 'Latitude',
            lonField: 'Longitude',
          },
        },
      ],
      avertissements: [
        {
          libelle: 'total répété par ville signalé',
          tous: [
            ['total', "nombre d'actions"],
            // Pas « par ville » : la demande elle-meme le contient.
            [
              'repet',
              'recopi',
              'constant',
              'identique',
              'meme valeur',
              'chaque ligne',
              'duplique',
              'pas une valeur par aide',
              'additionn',
              // « sommer », pas « somme » : Amiens est dans la Somme.
              'sommer',
            ],
          ],
        },
      ],
    },
  },
  {
    id: 'barres-triees',
    titre: 'Barres triées : population par région, de la plus grande à la plus petite',
    pr: true,
    source: { nom: 'Population des régions', lignes: POPULATION_REGIONS },
    messages: [
      'Fais un graphique en barres de la population par région, trié de la plus peuplée à la moins peuplée.',
    ],
    attendu: {
      blocs: [
        {
          libelle: 'barres triées décroissantes',
          kind: 'chart',
          chart: {
            type: { unDe: ['bar', 'horizontalBar'] },
            labelField: 'Région',
            valueField: 'Population',
            sortOrder: 'desc',
          },
        },
      ],
    },
  },
  {
    id: 'kpi-total',
    titre: 'KPI : population totale',
    pr: false,
    source: { nom: 'Population des régions', lignes: POPULATION_REGIONS },
    messages: ['Ajoute un indicateur clé qui affiche la population totale de ces régions.'],
    attendu: {
      blocs: [
        {
          libelle: 'KPI somme de la population',
          kind: 'chart',
          chart: { type: 'kpi', valueField: 'Population', aggregation: 'sum' },
        },
      ],
    },
  },
  {
    id: 'tableau-pagine',
    titre: 'Tableau paginé : établissements, 10 lignes par page',
    pr: false,
    source: { nom: 'Établissements scolaires', lignes: ETABLISSEMENTS },
    messages: ['Affiche un tableau de tous les établissements, avec 10 lignes par page.'],
    attendu: {
      blocs: [
        {
          libelle: 'tableau paginé par 10',
          kind: 'chart',
          chart: { type: 'datalist', pagination: 10 },
        },
      ],
    },
  },
  {
    id: 'carte-points',
    titre: 'Carte de points : un marqueur par musée, nom au survol',
    pr: false,
    source: { nom: 'Musées', lignes: MUSEES },
    messages: ['Place chaque musée sur une carte, avec son nom au survol du marqueur.'],
    attendu: {
      blocs: [
        {
          libelle: 'carte de points avec infobulle',
          kind: 'map',
          couche: {
            type: { unDe: ['marker', 'circle'] },
            latField: 'Latitude',
            lonField: 'Longitude',
            tooltipField: 'Nom',
            // Une ligne par musee : regrouper n'a pas lieu d'etre.
            groupField: { absent: true },
          },
        },
      ],
    },
  },
  {
    // #1111 : realisable SEULEMENT avec le bloc « composant libre » — aucun bloc
    // guide ne sait replier un tableau long en tableau croise (dsfr-data-pivot).
    id: 'tableau-croise',
    titre: 'Tableau croisé : élèves par commune (lignes) et type d’établissement (colonnes)',
    pr: true,
    source: { nom: 'Établissements scolaires', lignes: ETABLISSEMENTS },
    messages: [
      'Fais un tableau croisé des établissements : une ligne par commune, une colonne par type ' +
        'd’établissement, et dans chaque case le nombre total d’élèves.',
    ],
    attendu: {
      blocs: [
        {
          libelle: 'pivot commune × type, puis liste',
          kind: 'component',
          composants: [
            {
              tag: 'dsfr-data-pivot',
              attributs: { row: 'Commune', column: 'Type', value: 'Nombre d’élèves' },
            },
            { tag: 'dsfr-data-list' },
          ],
        },
      ],
    },
  },
  {
    id: 'demande-impossible',
    titre: 'Demande impossible : formulaire de saisie, à dire d’emblée',
    pr: true,
    source: { nom: 'Musées', lignes: MUSEES },
    messages: [
      'Ajoute un formulaire pour que les visiteurs du site puissent proposer un nouveau musée, ' +
        'enregistré directement dans le jeu de données.',
    ],
    attendu: { blocs: [], refus: DIT_IMPOSSIBLE, maxTours: 4 },
  },
  {
    id: 'modification',
    titre: 'Modification : barres puis « passe-le en camembert »',
    pr: false,
    source: { nom: 'Population des régions', lignes: POPULATION_REGIONS },
    messages: [
      'Fais un graphique en barres de la population par région.',
      'Finalement, passe ce graphique en camembert.',
    ],
    attendu: {
      // Un seul graphique : le camembert REMPLACE les barres (update_block).
      blocs: [
        {
          libelle: 'le graphique, devenu camembert',
          kind: 'chart',
          chart: {
            type: { unDe: ['pie', 'doughnut'] },
            labelField: 'Région',
            valueField: 'Population',
          },
        },
      ],
    },
  },
  {
    // #1140 : AUCUNE source choisie — l'usager donne l'URL d'un jeu, le modele
    // doit la charger par `charger_source_url`, puis composer sur ses champs.
    // Jeu reel, petit (14 lignes) et fige depuis 2018 sur un portail
    // Opendatasoft/Huwise a domaine propre (data.economie.gouv.fr).
    id: 'source-par-url',
    titre: 'Source par URL : le modèle charge le jeu Opendatasoft donné dans le message',
    pr: false,
    source: null,
    messages: [
      'Fais un graphique de l’évolution du nombre de jeunes entreprises innovantes par année, ' +
        'avec le jeu https://data.economie.gouv.fr/explore/dataset/les-jeunes-entreprises-innovantes/',
    ],
    attendu: {
      blocs: [
        {
          libelle: 'évolution du nombre de JEI par année',
          kind: 'chart',
          chart: {
            type: { unDe: ['line', 'bar'] },
            labelField: 'annee',
            valueField: 'nombre_de_jei',
          },
        },
      ],
    },
  },
];

/** Scenarios retenus : tous, le sous-ensemble de PR, ou une liste d'ids. */
export function choisirScenarios(options: { ids?: readonly string[]; pr?: boolean }): Scenario[] {
  if (options.ids && options.ids.length > 0) {
    const inconnus = options.ids.filter((id) => !SCENARIOS.some((s) => s.id === id));
    if (inconnus.length > 0) {
      throw new Error(
        `Scénario(s) inconnu(s) : ${inconnus.join(', ')}. Connus : ${SCENARIOS.map((s) => s.id).join(', ')}.`
      );
    }
    return SCENARIOS.filter((s) => options.ids?.includes(s.id));
  }
  return options.pr ? SCENARIOS.filter((s) => s.pr) : [...SCENARIOS];
}
