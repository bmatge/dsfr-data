/**
 * Contrôles DÉTERMINISTES des TABLEAUX DE BORD EXPORTÉS (#765, #810).
 *
 * Le balisage n'est pas écrit ici : il est PRODUIT par `generateDashboardHTML`,
 * le générateur que partagent le Studio et l'Assistant IA (voir
 * `fixtures-export-studio.ts` et la dérogation nommée du test-garde). C'est le
 * seul moyen de contrôler ce que fait le générateur plutôt qu'une copie de ce
 * qu'il est censé faire — et les deux défauts que ces contrôles gardent sont
 * nés là :
 *
 *   #765 — un graphique agrégé partageant sa source posait son regroupement
 *          DESSUS, et les voisins recevaient des lignes agrégées : KPI à 11 au
 *          lieu de 3 080. Le remède est une source DÉDIÉE (`<base>--<widget>`).
 *   #810 — un KPI sur une source partagée comptait les lignes CHARGÉES,
 *          plafonnées à `max-records` : 1 000 au lieu de 3 080. Le remède est
 *          un agrégat calculé par le serveur (`select` ODSQL), ou le total
 *          annoncé par l'API (`meta:total` sur Tabular).
 *
 *   #1081 — un graphique à PLUSIEURS mesures et une agrégation n'agrégeait
 *          que la première : `aggregate="population:sum"` face à
 *          `value-fields="pop2025"`. Une requête agrégée ne rend que les champs
 *          de groupe et les agrégats, la colonne désignée n'existait plus — la
 *          seconde série se traçait vide, sans erreur. Le remède : chaque
 *          mesure est agrégée, et le graphique désigne les colonnes agrégées.
 *
 * Chaque contrôle regarde les deux faces : le chiffre affiché, recalculé par
 * l'oracle depuis les lignes brutes, ET les URL appelées, qui disent si le
 * serveur a bien fait le calcul.
 */
import type { Check, Manifest, Step } from '../../tools/oracle/manifest.js';
import { MESURES, TERRITOIRES } from './fixtures.js';
import { TETE_CHART, urlsDe } from './fixtures-delegation.js';
import {
  ID_SOURCE,
  corpsExporte,
  document_,
  nommer,
  preremplir,
  sourceEmbarquee,
  widget,
} from './fixtures-export-studio.js';

/** Taille de page d'une liste exportée (défaut du générateur). */
const PAGE = 10;

/** Le regroupement des graphiques du lot : population par académie, décroissant. */
const PAR_ACADEMIE: Step[] = [
  {
    op: 'group-by',
    by: 'academie',
    columns: { population__sum: { agg: 'sum', field: 'population' } },
  },
  { op: 'order-by', column: 'population__sum', dir: 'desc' },
];

/** La liste du lot : les lignes telles quelles, triées, première page. */
const LISTE: Step[] = [
  { op: 'order-by', column: 'population', dir: 'desc' },
  { op: 'limit', n: PAGE },
];

/** La configuration `datalist` partagée par les documents (pas d'agrégation). */
const CONFIG_LISTE = {
  type: 'datalist' as const,
  labelField: 'region',
  valueField: 'population',
  sortOrder: 'desc' as const,
  colonnes: 'region:Territoire, population:Habitants',
  pagination: PAGE,
  title: 'Territoires',
};

/** Les noms donnes aux blocs du document « graphique + liste ». */
const NOMS_GRAPHIQUE_LISTE = nommer([
  [`dsfr-data-chart[source="q-w-graphique"]`, 'w-graphique'],
  [`dsfr-data-list[source="q-w-liste"]`, 'w-liste'],
]);

const CHECKS: Check[] = [
  {
    id: 'graphique-agrege-source-dediee',
    mode: 'deterministic',
    origin:
      '#765 — un graphique agrege et une liste sur LA MEME source : le graphique recoit sa propre balise de source (`src-verif--w-graphique`) et delegue son regroupement, la liste garde la source partagee et la pagine.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    head: TETE_CHART,
    markup:
      corpsExporte(
        document_('Graphique et liste', 'ods', [
          widget(
            'w-graphique',
            {
              type: 'bar',
              labelField: 'academie',
              valueField: 'population',
              aggregation: 'sum',
              sortOrder: 'desc',
              title: 'Population par académie',
            },
            0
          ),
          widget('w-liste', CONFIG_LISTE, 1),
        ])
      ) + NOMS_GRAPHIQUE_LISTE,
    expects: [
      {
        kind: 'chart',
        id: 'w-graphique',
        labelColumn: 'academie',
        valueColumns: ['population__sum'],
        pipeline: PAR_ACADEMIE,
      },
      {
        kind: 'list',
        id: 'w-liste',
        columns: [{ column: 'region' }, { column: 'population', numeric: true }],
        pipeline: LISTE,
      },
      // La source dediee delegue : le regroupement est calcule par le serveur,
      // sur le jeu ENTIER, et non sur les lignes d'une page.
      urlsDe('regroupement-au-serveur', 'ods', 'group_by=academie', 'some'),
    ],
  },

  {
    id: 'deux-graphiques-un-seul-partage',
    mode: 'deterministic',
    origin:
      '#765 — deux graphiques agreges sur la meme source et rien d’autre : le premier garde la source partagee (la dedier aussi la laisserait sans lecteur), le second recoit la sienne. Les deux regroupements sont justes, et differents.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    head: TETE_CHART,
    markup:
      corpsExporte(
        document_('Deux graphiques', 'ods', [
          widget(
            'w-aca',
            {
              type: 'bar',
              labelField: 'academie',
              valueField: 'population',
              aggregation: 'sum',
              sortOrder: 'desc',
              title: 'Par académie',
            },
            0
          ),
          widget(
            'w-pays',
            {
              type: 'bar',
              labelField: 'pays_iso2',
              valueField: 'population',
              aggregation: 'sum',
              sortOrder: 'desc',
              title: 'Par pays',
            },
            1
          ),
        ])
      ) +
      nommer([
        [`dsfr-data-chart[source="q-w-aca"]`, 'w-aca'],
        [`dsfr-data-chart[source="q-w-pays"]`, 'w-pays'],
      ]),
    expects: [
      {
        kind: 'chart',
        id: 'w-aca',
        labelColumn: 'academie',
        valueColumns: ['population__sum'],
        pipeline: PAR_ACADEMIE,
      },
      {
        kind: 'chart',
        id: 'w-pays',
        labelColumn: 'pays_iso2',
        valueColumns: ['population__sum'],
        pipeline: [
          {
            op: 'group-by',
            by: 'pays_iso2',
            columns: { population__sum: { agg: 'sum', field: 'population' } },
          },
          { op: 'order-by', column: 'population__sum', dir: 'desc' },
        ],
      },
      urlsDe('deux-regroupements', 'ods', 'group_by=', 'some'),
    ],
  },

  {
    id: 'kpi-ods-agregat-serveur',
    mode: 'deterministic',
    origin:
      '#810 — un KPI de somme sur Opendatasoft : source dediee a `select` ODSQL, la somme est calculee par le serveur sur le jeu entier en une requete d’une ligne. La liste d’a cote garde la source partagee.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup:
      corpsExporte(
        document_('KPI et liste (ODS)', 'ods', [
          widget(
            'w-kpi',
            {
              type: 'kpi',
              valueField: 'population',
              aggregation: 'sum',
              unit: 'hab.',
              title: 'Population totale',
            },
            0
          ),
          widget('w-liste', CONFIG_LISTE, 1),
        ])
      ) +
      nommer([
        [`dsfr-data-kpi[source="${ID_SOURCE}--w-kpi"]`, 'w-kpi'],
        [`dsfr-data-list[source="q-w-liste"]`, 'w-liste'],
      ]),
    expects: [
      { kind: 'kpi', id: 'w-kpi', agg: 'sum', field: 'population' },
      {
        kind: 'list',
        id: 'w-liste',
        columns: [{ column: 'region' }, { column: 'population', numeric: true }],
        pipeline: LISTE,
      },
      urlsDe('somme-au-serveur', 'ods', 'select=sum(population) as population__sum', 'some'),
    ],
  },

  {
    id: 'kpi-ods-comptage-filtre',
    mode: 'deterministic',
    origin:
      '#810 — un KPI de comptage avec son filtre propre : `count(*)` et la clause partent tous deux au serveur, en ODSQL. Le chiffre ne depend plus du plafond de lignes.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup:
      corpsExporte(
        document_('KPI filtre (ODS)', 'ods', [
          widget(
            'w-kpi-fr',
            {
              type: 'kpi',
              valueField: 'population',
              aggregation: 'count',
              where: 'pays_iso2:eq:FR',
              title: 'Territoires FR',
            },
            0
          ),
          widget('w-liste', CONFIG_LISTE, 1),
        ])
      ) + nommer([[`dsfr-data-kpi[source="${ID_SOURCE}--w-kpi-fr"]`, 'w-kpi-fr']]),
    expects: [
      {
        kind: 'kpi',
        id: 'w-kpi-fr',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'pays_iso2', op: 'eq', value: 'FR' }] }],
      },
      urlsDe('comptage-filtre-au-serveur', 'ods', 'select=count(*)', 'some'),
    ],
  },

  {
    id: 'kpi-tabular-meta-total',
    mode: 'deterministic',
    origin:
      '#810 — le meme comptage sur Tabular, qui n’a pas de `select` ODSQL : l’export emet `value="meta:total"`, le total annonce par l’enveloppe de l’API. Meme chiffre, par un autre chemin.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup:
      corpsExporte(
        document_('KPI et liste (Tabular)', 'tabular', [
          widget(
            'w-kpi-tab',
            {
              type: 'kpi',
              valueField: 'population',
              aggregation: 'count',
              title: 'Territoires',
            },
            0
          ),
          widget('w-liste', CONFIG_LISTE, 1),
        ])
      ) +
      nommer([
        [`dsfr-data-kpi[source="${ID_SOURCE}"]`, 'w-kpi-tab'],
        [`dsfr-data-list[source="q-w-liste"]`, 'w-liste'],
      ]),
    expects: [
      { kind: 'kpi', id: 'w-kpi-tab', agg: 'count' },
      {
        kind: 'list',
        id: 'w-liste',
        columns: [{ column: 'region' }, { column: 'population', numeric: true }],
        pipeline: LISTE,
      },
    ],
  },

  {
    id: 'filtres-etendus-aux-sources-derivees',
    mode: 'deterministic',
    origin:
      '#765 / #810 — un bloc de filtres doit viser AUSSI les sources derivees : sans cela le graphique agrege et le KPI, qui ne lisent plus la source partagee, ignoreraient le filtre — trois blocs d’une meme page sur trois perimetres differents.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    head: TETE_CHART,
    markup:
      corpsExporte(
        document_('Filtres partages', 'ods', [
          {
            id: 'w-filtres',
            title: 'Filtres',
            position: { row: 0, col: 0 },
            type: 'filters',
            config: {
              filters: [
                { field: 'pays_iso2', label: 'Pays', operator: 'eq', options: ['FR', 'DE', 'ES'] },
              ],
            },
          },
          widget(
            'w-graphique',
            {
              type: 'bar',
              labelField: 'academie',
              valueField: 'population',
              aggregation: 'sum',
              sortOrder: 'desc',
              title: 'Population par académie',
            },
            1
          ),
          widget(
            'w-kpi',
            {
              type: 'kpi',
              valueField: 'population',
              aggregation: 'sum',
              title: 'Population filtrée',
            },
            2
          ),
          widget('w-liste', CONFIG_LISTE, 3),
        ])
      ) +
      nommer([
        [`dsfr-data-kpi[source="${ID_SOURCE}--w-kpi"]`, 'w-kpi'],
        [`dsfr-data-chart[source="q-w-graphique"]`, 'w-graphique'],
        [`dsfr-data-list[source="q-w-liste"]`, 'w-liste'],
      ]) +
      preremplir('flt-w-filtres-pays_iso2', 'FR'),
    expects: [
      {
        kind: 'kpi',
        id: 'w-kpi',
        agg: 'sum',
        field: 'population',
        pipeline: [{ op: 'filter', filters: [{ field: 'pays_iso2', op: 'eq', value: 'FR' }] }],
      },
      {
        kind: 'chart',
        id: 'w-graphique',
        labelColumn: 'academie',
        valueColumns: ['population__sum'],
        pipeline: [
          { op: 'filter', filters: [{ field: 'pays_iso2', op: 'eq', value: 'FR' }] },
          ...PAR_ACADEMIE,
        ],
      },
      {
        kind: 'list',
        id: 'w-liste',
        columns: [{ column: 'region' }, { column: 'population', numeric: true }],
        pipeline: [
          { op: 'filter', filters: [{ field: 'pays_iso2', op: 'eq', value: 'FR' }] },
          ...LISTE,
        ],
      },
      // Aucune requete de donnees ne part sans la clause : ni la source
      // partagee, ni les deux sources derivees.
      urlsDe('filtre-sur-toutes-les-sources', 'ods', 'pays_iso2 = "FR"', 'all'),
    ],
  },

  {
    id: 'multi-series-agrege',
    mode: 'deterministic',
    origin:
      '#1081 — un graphique a deux mesures et une agregation, sur des donnees embarquees : l’export agrege CHAQUE mesure (`aggregate="indice:sum, poids:sum"`) et le graphique designe les colonnes agregees. Avant, seule la premiere l’etait : la seconde serie designait une colonne que la requete ne rendait plus, et se tracait vide. Les deux colonnes du jeu ont des sommes sans rapport (indice ~300, poids jusqu’a 4 000) : une serie qui relirait l’autre se verrait.',
    feed: { kind: 'fixture', datasets: { main: MESURES } },
    head: TETE_CHART,
    markup:
      corpsExporte(
        document_('Deux séries agrégées', sourceEmbarquee(MESURES), [
          widget(
            'w-series',
            {
              type: 'bar',
              labelField: 'zone',
              valueField: 'indice',
              valueFields: ['poids'],
              aggregation: 'sum',
              sortOrder: 'desc',
              title: 'Indice et poids par zone',
            },
            0
          ),
        ])
      ) + nommer([[`dsfr-data-chart[source="q-w-series"]`, 'w-series']]),
    expects: [
      {
        kind: 'chart',
        id: 'w-series',
        labelColumn: 'zone',
        valueColumns: ['indice__sum', 'poids__sum'],
        pipeline: [
          {
            op: 'group-by',
            by: 'zone',
            columns: {
              indice__sum: { agg: 'sum', field: 'indice' },
              poids__sum: { agg: 'sum', field: 'poids' },
            },
          },
          { op: 'order-by', column: 'indice__sum', dir: 'desc' },
        ],
      },
    ],
  },

  {
    id: 'bar-line-agrege',
    mode: 'deterministic',
    origin:
      '#1081 — meme defaut pour la seconde mesure d’un « barres + ligne » (`valueField2`) : `value-field-2="poids"` face a `aggregate="indice:avg"`. La ligne doit porter la moyenne de `poids` par zone, les barres celle de `indice` — deux moyennes sans rapport, dans cet ordre.',
    feed: { kind: 'fixture', datasets: { main: MESURES } },
    head: TETE_CHART,
    markup:
      corpsExporte(
        document_('Barres et ligne agrégées', sourceEmbarquee(MESURES), [
          widget(
            'w-barres-ligne',
            {
              type: 'bar-line',
              labelField: 'zone',
              valueField: 'indice',
              valueField2: 'poids',
              aggregation: 'avg',
              sortOrder: 'desc',
              title: 'Indice (barres) et poids (ligne) par zone',
            },
            0
          ),
        ])
      ) + nommer([[`dsfr-data-chart[source="q-w-barres-ligne"]`, 'w-barres-ligne']]),
    expects: [
      {
        kind: 'chart',
        id: 'w-barres-ligne',
        labelColumn: 'zone',
        valueColumns: ['indice__avg', 'poids__avg'],
        pipeline: [
          {
            op: 'group-by',
            by: 'zone',
            columns: {
              indice__avg: { agg: 'avg', field: 'indice' },
              poids__avg: { agg: 'avg', field: 'poids' },
            },
          },
          { op: 'order-by', column: 'indice__avg', dir: 'desc' },
        ],
      },
    ],
  },

  {
    id: 'multi-series-agrege-serveur',
    mode: 'deterministic',
    origin:
      '#1081 — le meme graphique a deux mesures sur Opendatasoft, seul lecteur de sa source : le regroupement est DELEGUE, et les deux agregats doivent partir au serveur. La seconde mesure porte un nom a espaces et apostrophe (« Nombre d’habitants »), celui qui casse un alias construit sans precaution.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    head: TETE_CHART,
    markup:
      corpsExporte(
        document_('Deux séries agrégées (ODS)', 'ods', [
          widget(
            'w-series-ods',
            {
              type: 'bar',
              labelField: 'academie',
              valueField: 'population',
              valueFields: ["Nombre d'habitants"],
              aggregation: 'sum',
              sortOrder: 'desc',
              title: 'Population par académie, deux colonnes',
            },
            0
          ),
        ])
      ) + nommer([[`dsfr-data-chart[source="q-w-series-ods"]`, 'w-series-ods']]),
    expects: [
      {
        kind: 'chart',
        id: 'w-series-ods',
        labelColumn: 'academie',
        valueColumns: ['population__sum', "Nombre d'habitants__sum"],
        pipeline: [
          {
            op: 'group-by',
            by: 'academie',
            columns: {
              population__sum: { agg: 'sum', field: 'population' },
              "Nombre d'habitants__sum": { agg: 'sum', field: "Nombre d'habitants" },
            },
          },
          { op: 'order-by', column: 'population__sum', dir: 'desc' },
        ],
      },
      urlsDe('deux-agregats-au-serveur', 'ods', 'group_by=academie', 'some'),
    ],
  },
];

export const EXPORT_STUDIO: Manifest = { domain: 'export-studio', checks: CHECKS };
