/**
 * Oracle de non-régression numérique — le MANIFESTE des contrôles.
 *
 * Principe : deux implémentations indépendantes doivent donner le même chiffre
 * au même instant. D'un côté la bibliothèque rend un balisage `dsfr-data-*`
 * contre la vraie API ; de l'autre, `tools/oracle` télécharge les lignes
 * BRUTES du même jeu (export JSON, clause ODSQL écrite à la main ici, jamais
 * traduite par la lib) et recalcule en tableaux nus (`compute.ts`). Rien
 * n'est figé : un jeu qui vit change les deux côtés en même temps.
 *
 * Chaque contrôle porte : la source brute, le balisage à rendre, ce qu'on
 * observe dans la page (valeur d'un KPI, lignes d'une query) et le calcul
 * attendu. Un contrôle vient toujours d'une reproduction réelle du banc
 * open-data-viz, de préférence un cas qui a déjà menti (#765, #810, #763,
 * #792).
 */

export type Agg = 'count' | 'sum' | 'avg' | 'min' | 'max';

/** Un filtre ligne à ligne côté oracle, volontairement minimal et explicite. */
export type RowFilter =
  { field: string; op: 'eq'; value: string | number } | { field: string; op: 'isnotnull' };

export interface RawSource {
  /** Hôte Opendatasoft, sans slash final. */
  baseUrl: string;
  dataset: string;
  /** Clause ODSQL BRUTE (syntaxe ODS, pas le dialecte colon de la lib). */
  where?: string;
}

export interface ExpectKpi {
  kind: 'kpi';
  /** id du `dsfr-data-kpi` dans le balisage. */
  id: string;
  agg: Agg;
  field?: string;
  /** Filtre appliqué par l'oracle avant l'agrégat (miroir du `where` du KPI). */
  filter?: RowFilter;
  /** Décimales affichées par le KPI : la comparaison se fait à cette précision. */
  decimals?: number;
}

export interface ExpectGroupBy {
  kind: 'group-by';
  /** id de la `dsfr-data-query` dont on lit les lignes (cache de données). */
  id: string;
  by: string;
  /** Colonnes attendues : nom de sortie → agrégat sur un champ brut. */
  columns: Record<string, { agg: Agg; field?: string }>;
  /** Ordre attendu des groupes (champ de tri, sens), pour comparer ligne à ligne. */
  orderBy?: { column: string; dir: 'asc' | 'desc' };
  limit?: number;
}

export type Expect = ExpectKpi | ExpectGroupBy;

export interface Check {
  id: string;
  /** Page du banc d'où vient le cas, et constat/issue qui le motive. */
  origin: string;
  source: RawSource;
  /** Balisage complet rendu par Playwright (sources, queries, KPI, …). */
  markup: string;
  expects: Expect[];
}

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

export const CHECKS: Check[] = [
  {
    id: 'ips-colleges-kpis',
    origin:
      'education/dataviz-ips-colleges — KPI count / avg / min / max sur un export de 6 971 lignes',
    source: IPS,
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
    origin:
      'education/dataviz-ips-colleges — BUG-009 / #765 : deux group-by sur une source partagée, le KPI doit garder le compte total (il tombait à 2)',
    source: IPS,
    markup: `${IPS_SOURCE}
  <dsfr-data-query id="q-secteur" source="ips" group-by="secteur"
    aggregate="ips:avg:ips_moyen, uai:count:nb" order-by="ips_moyen:desc"></dsfr-data-query>
  <dsfr-data-query id="q-academie" source="ips" group-by="libelle_academie"
    aggregate="ips:avg:ips_moyen, uai:count:nb" order-by="ips_moyen:desc" limit="12"></dsfr-data-query>
  <dsfr-data-kpi id="k-total" source="ips" value="count" format="nombre"></dsfr-data-kpi>`,
    expects: [
      { kind: 'kpi', id: 'k-total', agg: 'count' },
      {
        kind: 'group-by',
        id: 'q-secteur',
        by: 'secteur',
        columns: { ips_moyen: { agg: 'avg', field: 'ips' }, nb: { agg: 'count', field: 'uai' } },
        orderBy: { column: 'ips_moyen', dir: 'desc' },
      },
      {
        kind: 'group-by',
        id: 'q-academie',
        by: 'libelle_academie',
        columns: { ips_moyen: { agg: 'avg', field: 'ips' }, nb: { agg: 'count', field: 'uai' } },
        orderBy: { column: 'ips_moyen', dir: 'desc' },
        limit: 12,
      },
    ],
  },
  {
    id: 'sports-carence-kpi-where',
    origin:
      'education/portrait-de-territoire-sports — KPI somme avec where sur une source agrégée côté serveur (group-by + select) ; l’oracle repart des communes brutes',
    source: {
      baseUrl: 'https://equipements.sports.gouv.fr',
      dataset: 'insee-2020-geoapi-2023',
      where: "zrr = 'zrr'",
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
