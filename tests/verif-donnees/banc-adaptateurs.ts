/**
 * Contrôles VIVANTS du lot « adaptateurs et sources » — un par adaptateur
 * public, contre la vraie API.
 *
 * Les fixtures déterministes prouvent que l'adaptateur lit CE QU'ON LUI SERT ;
 * elles ne prouvent pas que c'est encore la forme que le portail sert
 * aujourd'hui. Un `links.next` qui devient absolu, une mesure qui perd son
 * suffixe, une page dont la taille change : rien de tout cela n'apparaît sur
 * une fixture, et tout cela casse un tableau de bord en production. D'où un
 * contrôle par adaptateur contre l'API réelle.
 *
 * L'oracle appelle la MÊME API, mais par une URL écrite à la main ici, sans
 * adaptateur : les clauses, la pagination et l'extraction du tableau de lignes
 * sont énoncées dans le manifeste (`rowsPath`, `nextPath`), jamais traduites
 * par la bibliothèque.
 *
 * Ces contrôles dépendent d'API tierces : ils tournent la nuit, à la demande,
 * ou sur une PR étiquetée `oracle` — jamais en bloquant
 * (`.github/workflows/oracle.yml`).
 *
 * Grist n'y figure pas : l'API demande un document et un jeton, il n'existe
 * pas d'instance publique en lecture anonyme sur laquelle un contrôle
 * reproductible puisse s'appuyer. Le chemin Grist reste couvert en
 * déterministe (`adaptateurs.ts`, `grist-champs-imbriques`).
 */
import type { Check, Manifest } from '../../tools/oracle/manifest.js';

/**
 * Opendatasoft — le même jeu que `banc.ts`, mais par le chemin d'EXPORT et
 * avec un `where` à parenthèses : les deux points que le déterministe éprouve
 * sur fixture (#689, #767), vérifiés contre le portail.
 */
const WHERE_IPS = "(rentree_scolaire = '2023-2024') and (secteur = 'public')";

/**
 * Tabular — communes de l'Ariège dans le Code officiel géographique.
 * 325 lignes, soit deux pages de 200 côté adaptateur (#1019) : la pagination
 * est réellement exercée. Le filtre est délégué (`DEP__exact`).
 */
const TABULAR_RESSOURCE = '91a95bee-c7c8-45f9-a8aa-f14cc4697545';
const TABULAR_URL =
  `https://tabular-api.data.gouv.fr/api/resources/${TABULAR_RESSOURCE}/data/` +
  `?DEP__exact=09&page_size=100`;

/**
 * Tabular — élus municipaux (RNE) de trois départements, par des colonnes à
 * espaces et accents (#985) : `Code du département`, `Libellé du
 * département`, `Code sexe`. 1 468 lignes au 2026-09-22, huit pages de 200
 * pour l'oracle. L'URL de l'oracle est écrite à la main, percent-encodée ; la
 * projection `columns=` n'y sert qu'à alléger le relevé (deux colonnes sur
 * quinze), elle ne change aucune ligne.
 */
const ELUS_RESSOURCE = '2876a346-d50c-4911-934e-19ee07b0e503';
const ELUS_URL =
  `https://tabular-api.data.gouv.fr/api/resources/${ELUS_RESSOURCE}/data/` +
  `?Code%20du%20d%C3%A9partement__in=01,02,03` +
  `&columns=Libell%C3%A9%20du%20d%C3%A9partement,Code%20sexe&page_size=200`;

/**
 * INSEE Melodi — décès quotidiens d'un département, pour une date figée.
 * L'oracle compte les OBSERVATIONS brutes ; la page compte les lignes
 * aplaties. Les deux doivent donner le même nombre : un aplatissement qui
 * perd ou duplique une observation se voit là, et nulle part ailleurs.
 */
const MELODI_DATASET = 'DS_EC_DECES';
const MELODI_GEO = '2025-DEP-01';
const MELODI_PERIODE = '2026-06-21';
const MELODI_URL =
  `https://api.insee.fr/melodi/data/${MELODI_DATASET}` +
  `?maxResult=1000&totalCount=TRUE&GEO=${MELODI_GEO}&TIME_PERIOD=${MELODI_PERIODE}`;

const CHECKS: Check[] = [
  {
    id: 'ods-export-where-parenthese-vivant',
    mode: 'live',
    page: 'education/dataviz-ips-colleges',
    constats: ['AM-011'],
    origin:
      'education/dataviz-ips-colleges — `fetch-mode="export"` et un `where` ODSQL à parenthèses contre le portail réel (#689, #767) : ce que la fixture promet, le portail le fait-il encore ?',
    feed: {
      kind: 'raw',
      source: {
        baseUrl: 'https://data.education.gouv.fr',
        dataset: 'donnees-ips-colleges',
        where: WHERE_IPS,
      },
    },
    markup: `
  <dsfr-data-source id="s-ips" api-type="opendatasoft"
    base-url="https://data.education.gouv.fr" dataset-id="donnees-ips-colleges"
    fetch-mode="export" max-records="20000"
    where="${WHERE_IPS.replace(/"/g, '&quot;')}"></dsfr-data-source>
  <dsfr-data-kpi id="k-ips-n" source="s-ips" value="count" format="nombre" label="Colleges"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-ips-avg" source="s-ips" value="ips:avg" format="decimal" decimals="1" label="IPS moyen"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-ips-aca" source="s-ips" value="libelle_academie:distinct" format="nombre" label="Academies"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-ips-n', agg: 'count' },
      { kind: 'kpi', id: 'k-ips-avg', agg: 'avg', field: 'ips', decimals: 1 },
      { kind: 'kpi', id: 'k-ips-aca', agg: 'distinct', field: 'libelle_academie' },
    ],
  },

  {
    id: 'tabular-cog-communes-vivant',
    mode: 'live',
    origin:
      'data.gouv / Code officiel geographique — Tabular en vrai : filtre delegue, sept pages suivies par `links.next`, et un `meta.total` qui doit coller au nombre de lignes rendues.',
    feed: {
      kind: 'raw',
      source: { url: TABULAR_URL, rowsPath: 'data', nextPath: 'links.next' },
    },
    markup: `
  <dsfr-data-source id="s-cog" api-type="tabular" resource="${TABULAR_RESSOURCE}"
    where="DEP:eq:09"></dsfr-data-source>
  <dsfr-data-kpi id="k-cog-n" source="s-cog" value="count" format="nombre" label="Communes"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-cog-arr" source="s-cog" value="ARR:distinct" format="nombre" label="Arrondissements"></dsfr-data-kpi>
  <dsfr-data-query id="q-cog" source="s-cog" group-by="ARR"
    aggregate="COM:count:nb" order-by="nb:desc"></dsfr-data-query>`,
    expects: [
      { kind: 'kpi', id: 'k-cog-n', agg: 'count' },
      { kind: 'kpi', id: 'k-cog-arr', agg: 'distinct', field: 'ARR' },
      {
        kind: 'rows',
        id: 'q-cog',
        key: 'ARR',
        columns: ['nb'],
        pipeline: [
          { op: 'group-by', by: 'ARR', columns: { nb: { agg: 'count', field: 'COM' } } },
          { op: 'order-by', column: 'nb', dir: 'desc' },
        ],
      },
    ],
  },

  {
    id: 'tabular-elus-colonne-a-espaces-vivant',
    mode: 'live',
    origin:
      'data.gouv / Répertoire national des élus — #985 : des noms de colonnes à espaces et accents se délèguent à l’API réelle. Mesuré le 2026-09-22 : `Libellé du département__groupby&Code sexe__count` → 200 (le parseur accepte le nom nu, percent-encodé), là où l’ancien garde-fou (#244, #289) forçait le téléchargement de toutes les lignes. Le regroupement, le filtre `in` et la projection `select` → `columns=` partent au serveur ; l’oracle, lui, relève les lignes brutes et regroupe seul.',
    feed: {
      kind: 'raw',
      source: { url: ELUS_URL, rowsPath: 'data', nextPath: 'links.next' },
    },
    markup: `
  <dsfr-data-source id="s-elus" api-type="tabular" resource="${ELUS_RESSOURCE}"
    where="Code du département:in:01|02|03"
    select="Libellé du département, Code sexe"></dsfr-data-source>
  <dsfr-data-kpi id="k-elus-n" source="s-elus" value="count" format="nombre" label="Élus"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-elus-dep" source="s-elus" value="Libellé du département:distinct" format="nombre"
    label="Départements"></dsfr-data-kpi>
  <dsfr-data-source id="s-elus-g" api-type="tabular" resource="${ELUS_RESSOURCE}"
    where="Code du département:in:01|02|03"></dsfr-data-source>
  <dsfr-data-query id="q-elus" source="s-elus-g" group-by="Libellé du département"
    aggregate="Code sexe:count"></dsfr-data-query>
  <dsfr-data-list id="l-elus" source="q-elus"
    columns="Libellé du département:Département, Code sexe__count:Élus"></dsfr-data-list>`,
    expects: [
      { kind: 'kpi', id: 'k-elus-n', agg: 'count' },
      { kind: 'kpi', id: 'k-elus-dep', agg: 'distinct', field: 'Libellé du département' },
      {
        kind: 'rows',
        id: 'q-elus',
        key: 'Libellé du département',
        columns: ['Code sexe__count'],
        pipeline: [
          {
            op: 'group-by',
            by: 'Libellé du département',
            columns: { 'Code sexe__count': { agg: 'count', field: 'Code sexe' } },
          },
        ],
      },
      {
        kind: 'urls',
        id: 'elus-groupby-delegue',
        among: `/api/resources/${ELUS_RESSOURCE}/data/`,
        // Le journal de la page consigne les URL DÉCODÉES
        contains: 'Libellé du département__groupby',
        verdict: 'some',
      },
      {
        kind: 'urls',
        id: 'elus-projection',
        among: `/api/resources/${ELUS_RESSOURCE}/data/`,
        contains: 'columns=Libellé du département,Code sexe',
        verdict: 'some',
      },
    ],
  },

  {
    id: 'tabular-elus-top-agregat-vivant',
    mode: 'live',
    origin:
      'data.gouv / Répertoire national des élus — #1045 : un regroupement trié sur son AGRÉGAT (« top 2 » des départements par nombre d’élus). L’API ne trie pas une colonne d’agrégat : `NB_VP__sum__sort=desc` avec `EPCI__groupby&NB_VP__sum` → 400, 42703 « column …NB_VP__sum does not exist », mesuré le 2026-09-23, sans en-tête CORS. Le regroupement part au serveur, le tri non : l’adaptateur trie les groupes complets, en chargement complet comme en pagination serveur. L’oracle relève les lignes brutes, regroupe et trie seul.',
    feed: {
      kind: 'raw',
      source: { url: ELUS_URL, rowsPath: 'data', nextPath: 'links.next' },
    },
    markup: `
  <dsfr-data-source id="s-elus-top" api-type="tabular" resource="${ELUS_RESSOURCE}"
    where="Code du département:in:01|02|03"></dsfr-data-source>
  <dsfr-data-query id="q-elus-top" source="s-elus-top" group-by="Libellé du département"
    aggregate="Code sexe:count" order-by="Code sexe__count:desc" limit="2"></dsfr-data-query>
  <dsfr-data-list id="l-elus-top" source="q-elus-top"
    columns="Libellé du département:Département, Code sexe__count:Élus"></dsfr-data-list>
  <dsfr-data-source id="s-elus-page" api-type="tabular" resource="${ELUS_RESSOURCE}"
    where="Code du département:in:01|02|03" server-side page-size="2"></dsfr-data-source>
  <dsfr-data-query id="q-elus-page" source="s-elus-page" group-by="Libellé du département"
    aggregate="Code sexe:count" order-by="Code sexe__count:desc"></dsfr-data-query>
  <dsfr-data-list id="l-elus-page" source="q-elus-page" server-sort
    columns="Libellé du département:Département, Code sexe__count:Élus"></dsfr-data-list>`,
    expects: [
      {
        kind: 'rows',
        id: 'q-elus-top',
        key: 'Libellé du département',
        columns: ['Code sexe__count'],
        pipeline: [
          {
            op: 'group-by',
            by: 'Libellé du département',
            columns: { 'Code sexe__count': { agg: 'count', field: 'Code sexe' } },
          },
          { op: 'order-by', column: 'Code sexe__count', dir: 'desc' },
          { op: 'limit', n: 2 },
        ],
      },
      {
        kind: 'list',
        id: 'l-elus-page',
        columns: [
          { column: 'Libellé du département' },
          { column: 'Code sexe__count', numeric: true },
        ],
        pipeline: [
          {
            op: 'group-by',
            by: 'Libellé du département',
            columns: { 'Code sexe__count': { agg: 'count', field: 'Code sexe' } },
          },
          { op: 'order-by', column: 'Code sexe__count', dir: 'desc' },
          { op: 'page', size: 2, number: 1 },
        ],
      },
      {
        kind: 'urls',
        id: 'elus-top-groupby-delegue',
        among: `/api/resources/${ELUS_RESSOURCE}/data/`,
        // Le journal de la page consigne les URL DÉCODÉES
        contains: 'Libellé du département__groupby',
        verdict: 'some',
      },
      {
        kind: 'urls',
        id: 'elus-top-tri-non-delegue',
        among: `/api/resources/${ELUS_RESSOURCE}/data/`,
        contains: '__sort',
        verdict: 'none',
      },
    ],
  },

  {
    id: 'insee-melodi-observations-vivant',
    mode: 'live',
    origin:
      'INSEE Melodi — deces quotidiens d’un departement a une date figee (#586). L’oracle compte les observations BRUTES, la page compte les lignes aplaties : un aplatissement qui en perd une ne se voit qu’ici.',
    feed: {
      kind: 'raw',
      source: { url: MELODI_URL, rowsPath: 'observations', nextPath: 'paging.next' },
    },
    markup: `
  <dsfr-data-source id="s-melodi" api-type="insee" dataset-id="${MELODI_DATASET}"
    where="GEO:eq:${MELODI_GEO}, TIME_PERIOD:eq:${MELODI_PERIODE}"></dsfr-data-source>
  <dsfr-data-kpi id="k-melodi-n" source="s-melodi" value="count" format="nombre" label="Observations"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-melodi-obs" source="s-melodi" value="OBS_VALUE:count" format="nombre" label="Valeurs"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-melodi-n', agg: 'count' },
      // L'oracle ne sait pas aplatir : il compte les observations qui PORTENT
      // une mesure, la page compte les lignes dont `OBS_VALUE` est renseignee.
      // Les deux comptes ne coincident que si l'aplatissement n'en perd aucune.
      { kind: 'kpi', id: 'k-melodi-obs', agg: 'count', field: 'measures' },
    ],
  },
];

export const BANC_ADAPTATEURS: Manifest = { domain: 'banc-adaptateurs', checks: CHECKS };
