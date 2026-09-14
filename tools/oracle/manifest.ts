/**
 * Vérification des données — la GRAMMAIRE des contrôles (types seuls).
 *
 * Principe (ADR-122) : deux implémentations indépendantes doivent donner le
 * même chiffre au même instant. D'un côté la bibliothèque rend un balisage
 * `dsfr-data-*` et l'on lit ce qu'elle AFFICHE ; de l'autre, `tools/oracle`
 * repart des lignes BRUTES et recalcule en tableaux nus (`compute.ts`), sans
 * rien importer de `packages/` ni de `@dsfr-data/*` (test-garde
 * `tests/oracle/guard.test.ts`). Si la lib et l'oracle se trompent, ce n'est
 * pas de la même façon.
 *
 * Ce fichier ne porte QUE la grammaire. Les contrôles eux-mêmes vivent par
 * domaine dans `tests/verif-donnees/` :
 *   - `banc.ts`  — contrôles VIVANTS, contre les vraies API du banc d'essai ;
 *   - `query.ts` — contrôles DÉTERMINISTES, sur les fixtures du harnais.
 *
 * Deux alimentations, une seule grammaire : un contrôle déterministe donne ses
 * lignes (`feed.kind === 'fixture'`, les mêmes que celles servies à la page par
 * `page.route`), un contrôle vivant donne une source brute à retélécharger
 * (`feed.kind === 'raw'`). Rien n'est figé : un jeu qui vit change les deux
 * côtés en même temps.
 */

/** Une ligne de données, telle qu'elle sort d'une API ou d'une fixture. */
export type Row = Record<string, unknown>;

/**
 * Agrégats recalculés par l'oracle. `distinct` est le `count(distinct x)`
 * (null et chaîne vide exclus) ; `wavg` la moyenne pondérée (`weight`).
 */
export type Agg = 'count' | 'distinct' | 'sum' | 'avg' | 'min' | 'max' | 'wavg';

/** Un filtre ligne à ligne côté oracle, volontairement minimal et explicite. */
export type RowFilter =
  | {
      field: string;
      op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
      value: string | number;
    }
  | { field: string; op: 'isnotnull' | 'isnull' };

/** Une colonne agrégée : `{ agg: 'sum', field: 'population' }`. */
export interface AggSpec {
  agg: Agg;
  field?: string;
  /** Champ de pondération, pour `wavg` seulement. */
  weight?: string;
}

/** Source BRUTE d'un contrôle vivant (export JSON Opendatasoft). */
export interface RawSource {
  /** Hôte Opendatasoft, sans slash final. */
  baseUrl: string;
  dataset: string;
  /** Clause ODSQL BRUTE (syntaxe ODS, pas le dialecte colon de la lib). */
  where?: string;
}

/** Nom du jeu principal quand le contrôle n'en désigne pas d'autre. */
export const JEU_PRINCIPAL = 'main';

/**
 * Comment l'oracle obtient ses lignes brutes.
 *
 * `fixture` : les lignes sont dans le dépôt, et ce sont EXACTEMENT celles que
 * `page.route` sert à la page — zéro réseau, le contrôle est bloquant sur PR.
 * `raw` : les lignes sont retéléchargées au moment du contrôle — le contrôle
 * dépend d'une API tierce et ne tourne que la nuit ou à la demande.
 */
export type Feed =
  { kind: 'raw'; source: RawSource } | { kind: 'fixture'; datasets: Record<string, Row[]> };

/**
 * Une étape du recalcul. La suite des étapes décrit CE QUE LA PAGE DOIT
 * MONTRER, pas comment la lib s'y prend : les deux chemins restent indépendants.
 */
export type Step =
  | { op: 'filter'; filters: RowFilter[] }
  | { op: 'group-by'; by: string; columns: Record<string, AggSpec> }
  | { op: 'global'; columns: Record<string, AggSpec> }
  | { op: 'order-by'; column: string; dir: 'asc' | 'desc' }
  | { op: 'limit'; n: number }
  | { op: 'running'; from: string; as: string; kind: 'running_sum' | 'diff' }
  | {
      op: 'join';
      /** Nom du jeu de droite dans `feed.datasets`. */
      right: string;
      /** Champ de jointure (`"code"`) ou paire (`"code=code_insee"`). */
      on: string;
      type: 'inner' | 'left';
      prefixRight?: string;
    };

interface ExpectBase {
  /** id de l'élément `dsfr-data-*` observé dans la page. */
  id: string;
  /** Jeu de départ dans `feed.datasets` (défaut : `main`). */
  from?: string;
  /** Recalcul appliqué aux lignes brutes avant comparaison. */
  pipeline?: Step[];
}

/** Valeur affichée par un `dsfr-data-kpi` (texte fr-FR de `.dsfr-data-kpi__value`). */
export interface ExpectKpi extends ExpectBase {
  kind: 'kpi';
  agg: Agg;
  field?: string;
  weight?: string;
  /** Filtre appliqué par l'oracle avant l'agrégat (miroir du `where` du KPI). */
  filter?: RowFilter[];
  /** Décimales affichées : la comparaison se fait à cette précision. */
  decimals?: number;
}

/** Lignes du cache de données d'un id (query, normalize, join, pivot, concat). */
export interface ExpectRows extends ExpectBase {
  kind: 'rows';
  pipeline: Step[];
  /** Colonne-clé, comparée en chaîne ligne à ligne. */
  key: string;
  /** Colonnes numériques comparées ligne à ligne. */
  columns: string[];
}

/** Libellés et valeurs RÉELLEMENT passés à l'élément DSFR Chart rendu. */
export interface ExpectChart extends ExpectBase {
  kind: 'chart';
  pipeline: Step[];
  labelColumn: string;
  valueColumns: string[];
}

/** Lignes du tableau rendu par `dsfr-data-list`. */
export interface ExpectList extends ExpectBase {
  kind: 'list';
  pipeline: Step[];
  /** Colonnes du tableau, dans l'ordre d'affichage. */
  columns: Array<{ column: string; numeric?: boolean }>;
}

/** Entrées de légende d'une couche choroplèthe (`getLegendEntries()`). */
export interface ExpectLegend extends ExpectBase {
  kind: 'legend';
  /** Champ numérique de `fill-field`. */
  field: string;
  /** Nombre de classes (`classes` de la couche). */
  classes: number;
  /** Seule méthode recalculable sans dupliquer la lib : intervalles égaux. */
  method: 'equal';
}

export type Expect = ExpectKpi | ExpectRows | ExpectChart | ExpectList | ExpectLegend;

/** Déterministe (bloquant sur PR, zéro réseau) ou vivant (nuit / à la demande). */
export type CheckMode = 'deterministic' | 'live';

export interface Check {
  id: string;
  mode: CheckMode;
  /** D'où vient le cas, et le constat / l'issue qui le motive. */
  origin: string;
  feed: Feed;
  /** Balises supplémentaires du `<head>` (DSFR Chart depuis node_modules…). */
  head?: string;
  /** Balisage complet rendu par Playwright (sources, queries, KPI, …). */
  markup: string;
  expects: Expect[];
}

/** Un manifeste : un domaine, ses contrôles. */
export interface Manifest {
  /** Nom court du domaine, repris dans le rapport. */
  domain: string;
  checks: Check[];
}
