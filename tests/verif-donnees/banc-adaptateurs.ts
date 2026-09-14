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
 * 325 lignes, soit sept pages de 50 côté adaptateur : la pagination est
 * réellement exercée. Le filtre est délégué (`DEP__exact`).
 */
const TABULAR_RESSOURCE = '91a95bee-c7c8-45f9-a8aa-f14cc4697545';
const TABULAR_URL =
  `https://tabular-api.data.gouv.fr/api/resources/${TABULAR_RESSOURCE}/data/` +
  `?DEP__exact=09&page_size=100`;

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
