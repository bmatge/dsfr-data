/**
 * Contrôles DÉTERMINISTES — bloquants sur chaque PR, zéro réseau.
 *
 * Les réponses d'API sont servies par `page.route` depuis `fixtures.ts`, et
 * l'oracle repart des MÊMES lignes. Ce qui est éprouvé n'est donc pas la
 * fraîcheur d'un jeu ouvert mais le CALCUL : filtre, regroupement, tri, limite,
 * agrégats, cumul, écart, jointure, moyenne pondérée, discrétisation — et,
 * à chaque fois, ce que la page finit par montrer.
 *
 * Chaque contrôle a été vérifié EN ÉCHEC sur un défaut injecté dans la lib
 * (voir `tools/oracle/README.md`, « prouver une mutation ») : un contrôle qui
 * ne peut pas échouer ne garde rien.
 */
import type { Check, Manifest } from '../../tools/oracle/manifest.js';
import { DATASET, HOTE_ODS, MESURES, REGIONS, TERRITOIRES, urlJeu } from './fixtures.js';

/** DSFR Chart depuis node_modules : la vraie bibliothèque, jamais le CDN. */
const TETE_CHART = `
  <link rel="stylesheet" href="/node_modules/@gouvfr/dsfr-chart/dist/DSFRChart/DSFRChart.css">
  <script type="module" src="/node_modules/@gouvfr/dsfr-chart/dist/DSFRChart/DSFRChart.js"></script>`;

/** « a » dans la région OU l'académie (#1026) : la disjonction, pour l'oracle. */
const REGION_OU_ACADEMIE = {
  op: 'or' as const,
  any: [
    { field: 'region', op: 'contains' as const, value: 'a' },
    { field: 'academie', op: 'contains' as const, value: 'a' },
  ],
};

const CHECKS: Check[] = [
  {
    id: 'where-multi-champs-client',
    mode: 'deterministic',
    origin:
      '#1026 — `where="region|academie:contains:a"` sur une source sans adaptateur : le OU entre champs est calculé dans le navigateur. 3 régions et 52 académies contiennent « a », une ligne dans les deux : 54, ni 1 (un ET), ni 55 (une somme), ni 3 (le seul premier champ).',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  <dsfr-data-source id="s-ou" url="${urlJeu('territoires')}"></dsfr-data-source>
  <dsfr-data-query id="q-ou" source="s-ou" where="region|academie:contains:a"></dsfr-data-query>
  <dsfr-data-kpi id="k-ou-n" source="q-ou" value="count" format="nombre" label="Lignes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-ou-somme" source="q-ou" value="population:sum" format="nombre" label="Population"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-ou-n',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [REGION_OU_ACADEMIE] }],
      },
      {
        kind: 'kpi',
        id: 'k-ou-somme',
        agg: 'sum',
        field: 'population',
        pipeline: [{ op: 'filter', filters: [REGION_OU_ACADEMIE] }],
      },
    ],
  },

  {
    id: 'kpi-where-et-agregats',
    mode: 'deterministic',
    origin:
      'Les quatre agrégats d’un KPI derrière un where client : count, sum, avg (2 décimales) et count(distinct).',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  <dsfr-data-source id="s-terr" url="${urlJeu('territoires')}"></dsfr-data-source>
  <dsfr-data-query id="q-fr" source="s-terr" where="pays_iso2:eq:FR"></dsfr-data-query>
  <dsfr-data-kpi id="k-n" source="q-fr" value="count" format="nombre" label="Lignes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-somme" source="q-fr" value="population:sum" format="nombre" label="Population"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-moyenne" source="q-fr" value="population:avg" format="decimal" decimals="2" label="Moyenne"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-distinct" source="q-fr" value="academie:distinct" format="nombre" label="Académies"></dsfr-data-kpi>`,
    expects: (
      [
        ['k-n', 'count', undefined, 0],
        ['k-somme', 'sum', 'population', 0],
        ['k-moyenne', 'avg', 'population', 2],
        ['k-distinct', 'distinct', 'academie', 0],
      ] as const
    ).map(([id, agg, field, decimals]) => ({
      kind: 'kpi' as const,
      id,
      agg,
      field,
      decimals,
      pipeline: [
        {
          op: 'filter' as const,
          filters: [{ field: 'pays_iso2', op: 'eq' as const, value: 'FR' }],
        },
      ],
    })),
  },

  {
    id: 'group-by-order-by-limite',
    mode: 'deterministic',
    origin:
      'Regroupement + agrégats + tri + limite, lus DEUX fois : dans le cache de la query, puis dans le tableau rendu.',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  <dsfr-data-source id="s-aca" url="${urlJeu('territoires')}"></dsfr-data-source>
  <dsfr-data-query id="q-aca" source="s-aca" group-by="academie"
    aggregate="population:sum:pop, code_dept:distinct:nb_dept"
    order-by="pop:desc" limit="5"></dsfr-data-query>
  <dsfr-data-list id="l-aca" source="q-aca"
    columns="academie:Académie, pop:Population, nb_dept:Départements"></dsfr-data-list>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-aca',
        key: 'academie',
        columns: ['pop', 'nb_dept'],
        pipeline: [
          {
            op: 'group-by',
            by: 'academie',
            columns: {
              pop: { agg: 'sum', field: 'population' },
              nb_dept: { agg: 'distinct', field: 'code_dept' },
            },
          },
          { op: 'order-by', column: 'pop', dir: 'desc' },
          { op: 'limit', n: 5 },
        ],
      },
      {
        kind: 'list',
        id: 'l-aca',
        columns: [
          { column: 'academie' },
          { column: 'pop', numeric: true },
          { column: 'nb_dept', numeric: true },
        ],
        pipeline: [
          {
            op: 'group-by',
            by: 'academie',
            columns: {
              pop: { agg: 'sum', field: 'population' },
              nb_dept: { agg: 'distinct', field: 'code_dept' },
            },
          },
          { op: 'order-by', column: 'pop', dir: 'desc' },
          { op: 'limit', n: 5 },
        ],
      },
    ],
  },

  {
    id: 'source-partagee-765',
    mode: 'deterministic',
    origin:
      'BUG-009 / #765 — deux regroupements et un KPI sur UNE source à adaptateur : aucune query ne doit déléguer son group-by, sinon elle réécrit les lignes des voisins (mesuré : KPI à 11 au lieu de 3 080).',
    feed: { kind: 'fixture', datasets: { main: TERRITOIRES } },
    markup: `
  <dsfr-data-source id="s-ods" api-type="opendatasoft"
    base-url="${HOTE_ODS}" dataset-id="${DATASET}"
    fetch-mode="export" max-records="500"></dsfr-data-source>
  <dsfr-data-query id="q-part-aca" source="s-ods" group-by="academie"
    aggregate="population:sum:pop" order-by="pop:desc"></dsfr-data-query>
  <dsfr-data-query id="q-part-pays" source="s-ods" group-by="pays_iso2"
    aggregate="population:sum:pop" order-by="pop:desc"></dsfr-data-query>
  <dsfr-data-kpi id="k-partage" source="s-ods" value="count" format="nombre" label="Lignes"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-partage', agg: 'count' },
      {
        kind: 'rows',
        id: 'q-part-aca',
        key: 'academie',
        columns: ['pop'],
        pipeline: [
          { op: 'group-by', by: 'academie', columns: { pop: { agg: 'sum', field: 'population' } } },
          { op: 'order-by', column: 'pop', dir: 'desc' },
        ],
      },
      {
        kind: 'rows',
        id: 'q-part-pays',
        key: 'pays_iso2',
        columns: ['pop'],
        pipeline: [
          {
            op: 'group-by',
            by: 'pays_iso2',
            columns: { pop: { agg: 'sum', field: 'population' } },
          },
          { op: 'order-by', column: 'pop', dir: 'desc' },
        ],
      },
    ],
  },

  {
    id: 'jointure-cles-vides',
    mode: 'deterministic',
    origin:
      '#792 — jointure interne sur une clé que deux lignes n’ont pas : une clé vide n’apparie rien, pas même une autre clé vide.',
    feed: { kind: 'fixture', datasets: { main: MESURES, regions: REGIONS } },
    markup: `
  <dsfr-data-source id="s-mes" url="${urlJeu('mesures')}"></dsfr-data-source>
  <dsfr-data-source id="s-reg" url="${urlJeu('regions')}"></dsfr-data-source>
  <dsfr-data-join id="j-mes" left="s-mes" right="s-reg" on="code" type="inner"></dsfr-data-join>
  <dsfr-data-kpi id="k-joint" source="j-mes" value="count" format="nombre" label="Lignes appariées"></dsfr-data-kpi>
  <dsfr-data-query id="q-joint" source="j-mes" group-by="region_nom"
    aggregate="indice:avg:indice_moyen, code:count:nb" order-by="indice_moyen:desc"></dsfr-data-query>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-joint',
        agg: 'count',
        pipeline: [{ op: 'join', right: 'regions', on: 'code', type: 'inner' }],
      },
      {
        kind: 'rows',
        id: 'q-joint',
        key: 'region_nom',
        columns: ['indice_moyen', 'nb'],
        pipeline: [
          { op: 'join', right: 'regions', on: 'code', type: 'inner' },
          {
            op: 'group-by',
            by: 'region_nom',
            columns: {
              indice_moyen: { agg: 'avg', field: 'indice' },
              nb: { agg: 'count', field: 'code' },
            },
          },
          { op: 'order-by', column: 'indice_moyen', dir: 'desc' },
        ],
      },
    ],
  },

  {
    id: 'compute-vide-nest-pas-zero',
    mode: 'deterministic',
    origin:
      '#846 — une colonne calculée qui teste « quota = 0 » : une cellule VIDE n’est pas un zéro. Le piège est l’égalité lâche entre la chaîne vide et le nombre zéro.',
    feed: { kind: 'fixture', datasets: { main: MESURES } },
    markup: `
  <dsfr-data-source id="s-quota" url="${urlJeu('mesures')}"></dsfr-data-source>
  <dsfr-data-normalize id="n-quota" source="s-quota"
    compute="statut = when quota = 0 then 'nul' else 'renseigne'"></dsfr-data-normalize>
  <dsfr-data-kpi id="k-nul" source="n-quota" value="count" where="statut:eq:nul"
    format="nombre" label="Quota nul"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-renseigne" source="n-quota" value="count" where="statut:eq:renseigne"
    format="nombre" label="Quota renseigné"></dsfr-data-kpi>`,
    expects: [
      {
        kind: 'kpi',
        id: 'k-nul',
        agg: 'count',
        filter: [{ field: 'quota', op: 'eq', value: 0 }],
      },
      {
        kind: 'kpi',
        id: 'k-renseigne',
        agg: 'count',
        filter: [{ field: 'quota', op: 'neq', value: 0 }],
      },
    ],
  },

  {
    id: 'moyenne-ponderee',
    mode: 'deterministic',
    origin:
      'Une moyenne pondérée par zone, composée dans la page (produit, deux sommes, un quotient) ; l’oracle la recalcule d’un seul geste.',
    feed: { kind: 'fixture', datasets: { main: MESURES } },
    markup: `
  <dsfr-data-source id="s-pond" url="${urlJeu('mesures')}"></dsfr-data-source>
  <dsfr-data-normalize id="n-produit" source="s-pond"
    compute="produit = indice * poids"></dsfr-data-normalize>
  <dsfr-data-query id="q-pond" source="n-produit" group-by="zone"
    aggregate="produit:sum:num, poids:sum:den" order-by="den:desc"></dsfr-data-query>
  <dsfr-data-normalize id="n-moyenne" source="q-pond"
    compute="moyenne = num / den"></dsfr-data-normalize>`,
    expects: [
      {
        kind: 'rows',
        id: 'n-moyenne',
        key: 'zone',
        columns: ['moyenne', 'den'],
        pipeline: [
          {
            op: 'group-by',
            by: 'zone',
            columns: {
              moyenne: { agg: 'wavg', field: 'indice', weight: 'poids' },
              den: { agg: 'sum', field: 'poids' },
            },
          },
          { op: 'order-by', column: 'den', dir: 'desc' },
        ],
      },
    ],
  },

  {
    id: 'cumul-et-ecart',
    mode: 'deterministic',
    origin:
      '#738 / #775 — cumul (`running_sum`) et écart à la ligne précédente (`diff`) après le tri. La première ligne d’un écart vaut null, jamais 0.',
    feed: { kind: 'fixture', datasets: { main: MESURES } },
    markup: `
  <dsfr-data-source id="s-mois" url="${urlJeu('mesures')}"></dsfr-data-source>
  <dsfr-data-query id="q-mois" source="s-mois" group-by="mois"
    aggregate="flux:sum:total, total:running_sum:cumul, total:diff:ecart"
    order-by="mois:asc"></dsfr-data-query>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-mois',
        key: 'mois',
        columns: ['total', 'cumul', 'ecart'],
        pipeline: [
          { op: 'group-by', by: 'mois', columns: { total: { agg: 'sum', field: 'flux' } } },
          { op: 'order-by', column: 'mois', dir: 'asc' },
          { op: 'running', from: 'total', as: 'cumul', kind: 'running_sum' },
          { op: 'running', from: 'total', as: 'ecart', kind: 'diff' },
        ],
      },
    ],
  },

  {
    id: 'graphique-valeurs-transmises',
    mode: 'deterministic',
    origin:
      'Ce qui est passé au VRAI élément DSFR Chart (`<bar-chart x=… y=…>`), et non le cache amont : un graphique qui affiche autre chose que ce qu’il a reçu est invisible au cache.',
    feed: { kind: 'fixture', datasets: { main: MESURES } },
    head: TETE_CHART,
    markup: `
  <dsfr-data-source id="s-graph" url="${urlJeu('mesures')}"></dsfr-data-source>
  <dsfr-data-query id="q-graph" source="s-graph" group-by="zone"
    aggregate="flux:sum:total" order-by="total:desc"></dsfr-data-query>
  <dsfr-data-chart id="g-zone" source="q-graph" type="bar"
    label-field="zone" value-field="total" name="Flux"></dsfr-data-chart>`,
    expects: [
      {
        kind: 'chart',
        id: 'g-zone',
        labelColumn: 'zone',
        valueColumns: ['total'],
        pipeline: [
          { op: 'group-by', by: 'zone', columns: { total: { agg: 'sum', field: 'flux' } } },
          { op: 'order-by', column: 'total', dir: 'desc' },
        ],
      },
    ],
  },

  {
    id: 'legende-choroplethe',
    mode: 'deterministic',
    origin:
      '#685 — les classes AFFICHÉES par la légende d’une couche choroplèthe à intervalles égaux, lues par `getLegendEntries()`.',
    feed: { kind: 'fixture', datasets: { main: MESURES } },
    markup: `
  <dsfr-data-source id="s-carte" url="${urlJeu('mesures')}"></dsfr-data-source>
  <dsfr-data-map id="carte" center="46.6,2.3" zoom="5" height="320px" tiles="osm">
    <dsfr-data-map-layer id="couche" source="s-carte" type="circle"
      lat-field="lat" lon-field="lon" fill-field="indice"
      classes="4" method="equal"></dsfr-data-map-layer>
    <dsfr-data-map-legend for="couche" label="Indice"></dsfr-data-map-legend>
  </dsfr-data-map>`,
    expects: [{ kind: 'legend', id: 'couche', field: 'indice', classes: 4, method: 'equal' }],
  },
];

export const QUERY: Manifest = { domain: 'query', checks: CHECKS };
