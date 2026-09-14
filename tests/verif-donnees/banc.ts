/**
 * Contrôles VIVANTS — contre les vraies API, sur des reproductions du banc
 * d'essai open-data-viz.
 *
 * Ici rien n'est figé : l'oracle retélécharge les lignes brutes au moment du
 * contrôle (export JSON, clause ODSQL écrite à la main ci-dessous, jamais
 * traduite par la lib) et la page rend le même balisage contre la même API au
 * même instant. Un jeu qui vit change les deux côtés en même temps ; un écart
 * entre les deux est un défaut, pas une mise à jour.
 *
 * Ces contrôles dépendent d'API tierces : ils tournent la nuit, à la demande,
 * ou sur une PR étiquetée `oracle` — jamais en bloquant sur chaque PR
 * (`.github/workflows/oracle.yml`). Les contrôles bloquants sont dans
 * `query.ts`, sur fixtures.
 */
import type { Check, Manifest, RawSource } from '../../tools/oracle/manifest.js';

const IPS: RawSource = {
  baseUrl: 'https://data.education.gouv.fr',
  dataset: 'donnees-ips-colleges',
  where: "rentree_scolaire = '2023-2024' and position is not null",
};

const IPS_SOURCE = `
  <dsfr-data-source id="ips" api-type="opendatasoft"
    base-url="https://data.education.gouv.fr" dataset-id="donnees-ips-colleges"
    fetch-mode="export" max-records="8000"
    where="rentree_scolaire = '2023-2024' and position is not null"></dsfr-data-source>`;

const CHECKS: Check[] = [
  {
    id: 'ips-colleges-kpis',
    mode: 'live',
    page: 'education/dataviz-ips-colleges',
    origin:
      'education/dataviz-ips-colleges — KPI count / avg / min / max sur un export de ~7 000 lignes',
    feed: { kind: 'raw', source: IPS },
    markup: `${IPS_SOURCE}
  <dsfr-data-kpi id="k-count" source="ips" value="count" format="nombre"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-avg" source="ips" value="ips:avg" format="decimal" decimals="1"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-min" source="ips" value="ips:min" format="decimal" decimals="1"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-max" source="ips" value="ips:max" format="decimal" decimals="1"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-count', agg: 'count' },
      { kind: 'kpi', id: 'k-avg', agg: 'avg', field: 'ips', decimals: 1 },
      { kind: 'kpi', id: 'k-min', agg: 'min', field: 'ips', decimals: 1 },
      { kind: 'kpi', id: 'k-max', agg: 'max', field: 'ips', decimals: 1 },
    ],
  },
  {
    id: 'ips-colleges-group-by-partage',
    mode: 'live',
    page: 'education/dataviz-ips-colleges',
    constats: ['BUG-009'],
    origin:
      'education/dataviz-ips-colleges — BUG-009 / #765 : deux group-by sur une source partagée, le KPI doit garder le compte total (il tombait à 2)',
    feed: { kind: 'raw', source: IPS },
    markup: `${IPS_SOURCE}
  <dsfr-data-query id="q-secteur" source="ips" group-by="secteur"
    aggregate="ips:avg:ips_moyen, uai:count:nb" order-by="ips_moyen:desc"></dsfr-data-query>
  <dsfr-data-query id="q-academie" source="ips" group-by="libelle_academie"
    aggregate="ips:avg:ips_moyen, uai:count:nb" order-by="ips_moyen:desc" limit="12"></dsfr-data-query>
  <dsfr-data-kpi id="k-total" source="ips" value="count" format="nombre"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-total', agg: 'count' },
      {
        kind: 'rows',
        id: 'q-secteur',
        key: 'secteur',
        columns: ['ips_moyen', 'nb'],
        pipeline: [
          {
            op: 'group-by',
            by: 'secteur',
            columns: {
              ips_moyen: { agg: 'avg', field: 'ips' },
              nb: { agg: 'count', field: 'uai' },
            },
          },
          { op: 'order-by', column: 'ips_moyen', dir: 'desc' },
        ],
      },
      {
        kind: 'rows',
        id: 'q-academie',
        key: 'libelle_academie',
        columns: ['ips_moyen', 'nb'],
        pipeline: [
          {
            op: 'group-by',
            by: 'libelle_academie',
            columns: {
              ips_moyen: { agg: 'avg', field: 'ips' },
              nb: { agg: 'count', field: 'uai' },
            },
          },
          { op: 'order-by', column: 'ips_moyen', dir: 'desc' },
          { op: 'limit', n: 12 },
        ],
      },
    ],
  },
  {
    id: 'sports-carence-kpi-where',
    mode: 'live',
    page: 'education/portrait-de-territoire-sports',
    origin:
      'education/portrait-de-territoire-sports — KPI somme avec where sur une source agrégée côté serveur (group-by + select) ; l’oracle repart des communes brutes',
    feed: {
      kind: 'raw',
      source: {
        baseUrl: 'https://equipements.sports.gouv.fr',
        dataset: 'insee-2020-geoapi-2023',
        where: "zrr = 'zrr'",
      },
    },
    markup: `
  <dsfr-data-source id="s-carence" api-type="opendatasoft"
    base-url="https://equipements.sports.gouv.fr" dataset-id="insee-2020-geoapi-2023"
    group-by="zrr, zfrr, typo_rurb_crte, commune_loi_montagne, vas"
    select="count(*) as n, sum(population) as pop" max-records="200"></dsfr-data-source>
  <dsfr-data-kpi id="k-zrr-n" source="s-carence" value="n:sum" where="zrr:eq:zrr" format="nombre"></dsfr-data-kpi>
  <dsfr-data-kpi id="k-zrr-pop" source="s-carence" value="pop:sum" where="zrr:eq:zrr" format="nombre"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-zrr-n', agg: 'count' },
      { kind: 'kpi', id: 'k-zrr-pop', agg: 'sum', field: 'population' },
    ],
  },
];

export const BANC: Manifest = { domain: 'banc', checks: CHECKS };
