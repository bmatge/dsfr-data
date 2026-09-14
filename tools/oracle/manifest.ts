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
      /**
       * Compare sans accents ni casse (`eq` et `contains`) — ce que fait une
       * recherche plein texte quand « ecole » doit trouver « École ». Le
       * repliement est écrit dans `compute.ts`, jamais emprunté à la lib.
       */
      fold?: boolean;
    }
  /** Appartenance à un ensemble — le OU multi-valeurs d'un `in` ou d'une facette. */
  | { field: string; op: 'in'; values: Array<string | number> }
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

/**
 * Valeurs et COMPTEURS affichés d'un groupe de `dsfr-data-facets` — ce que
 * l'utilisateur lit à côté de chaque case, dans l'ordre où il le lit.
 */
export interface ExpectFacets extends ExpectBase {
  kind: 'facets';
  pipeline: Step[];
  /** Libellé affiché du groupe observé (légende du fieldset, ou label du select). */
  group: string;
  /** Colonne du recalcul qui porte la valeur affichée. */
  valueColumn: string;
  /** Colonne du recalcul qui porte le compteur affiché. */
  countColumn: string;
}

/**
 * Un TEXTE affiché — libellé d'un `dsfr-data-context-value`, tag d'un
 * `dsfr-data-context-tags`, compteur d'un `dsfr-data-search`.
 *
 * L'attendu reste un RECALCUL : la valeur vient du `pipeline`, soit d'une
 * colonne d'une ligne recalculée (`column`), soit d'un agrégat global
 * (`agg`). Le manifeste ne fournit que l'habillage fixe autour d'elle
 * (`prefix` / `suffix`), pas le chiffre.
 */
export interface ExpectText extends ExpectBase {
  kind: 'text';
  /** Sélecteur CSS DANS l'élément observé — absent : l'élément lui-même. */
  selector?: string;
  /** Comparer le NOMBRE lu dans le texte (fr-FR) plutôt que le texte. */
  numeric?: boolean;
  /** Décimales affichées, quand la comparaison est numérique. */
  decimals?: number;
  /** Agrégat global appliqué aux lignes recalculées (`numeric` seulement). */
  agg?: Agg;
  /** Champ de l'agrégat. */
  field?: string;
  /** Colonne de la ligne recalculée dont la valeur est attendue. */
  column?: string;
  /** Rang de la ligne recalculée lue (défaut : la première). */
  row?: number;
  /** Texte fixe avant la valeur (gabarit du composant). */
  prefix?: string;
  /** Texte fixe après la valeur. */
  suffix?: string;
}

/**
 * Les URL d'API RÉELLEMENT appelées par la page (#836, #838).
 *
 * Seul lecteur qui ne porte pas sur un chiffre affiché, et il est indispensable
 * au lot « délégation » : deux balisages peuvent montrer les mêmes chiffres en
 * demandant au serveur des choses opposées. Qu'une `dsfr-data-query` délègue ou
 * non son `group_by` ne se voit QUE là — un total juste calculé sur des lignes
 * agrégées par erreur reste juste tant que personne d'autre ne lit la source.
 *
 * Le journal est tenu par la page elle-même (le `fetch` est enveloppé avant le
 * chargement de la bibliothèque) ; l'oracle ne juge que la présence d'un
 * fragment, il ne reconstruit aucune URL — il ne saurait pas le faire sans
 * emprunter les constructeurs d'URL de la lib, ce qui lui est interdit.
 */
export interface ExpectUrls {
  kind: 'urls';
  /** Nom du constat dans le rapport (`urls:group-by-delegue`) : pas un id d'élément. */
  id: string;
  /** Ne retient que les URL portant ce fragment (défaut : toutes celles appelées). */
  among?: string;
  /** Fragment dont on juge la présence dans les URL retenues (`group_by=`). */
  contains: string;
  /**
   * `none` aucune ne le porte · `some` au moins une · `all` toutes ·
   * `last` la dernière retenue le porte · `notLast` la dernière ne le porte pas.
   * `last` / `notLast` disent l'état où la page s'est ARRÊTÉE : c'est ce qui
   * distingue une délégation retirée en cours de route d'une délégation jamais
   * tentée (renégociation `dsfr-data-delegation-contested`, #765).
   */
  verdict: 'none' | 'some' | 'all' | 'last' | 'notLast';
}

export type Expect =
  | ExpectKpi
  | ExpectRows
  | ExpectChart
  | ExpectList
  | ExpectLegend
  | ExpectFacets
  | ExpectText
  | ExpectUrls;

/** Déterministe (bloquant sur PR, zéro réseau) ou vivant (nuit / à la demande). */
export type CheckMode = 'deterministic' | 'live';

/**
 * Un GESTE joué dans la page avant l'observation.
 *
 * Les filtres qui viennent de l'utilisateur ne se vérifient pas sur un
 * rendu figé : c'est le geste qui produit le chiffre, et l'ordre des
 * événements compte (d'où le navigateur, pas un DOM simulé).
 *
 * `selector` est un sélecteur Playwright (CSS, ou `text=…`). `goto` sans
 * `value` RECHARGE l'URL courante de la page — celle que la synchro d'URL
 * vient d'écrire : c'est le contrôle en deux navigations.
 */
export interface Action {
  kind: 'click' | 'fill' | 'select' | 'goto';
  /** Élément visé (click, fill, select). */
  selector?: string;
  /** Texte saisi (fill), option choisie (select), URL relative ou absolue (goto). */
  value?: string;
  /** Options d'un `<select multiple>` (select). */
  values?: string[];
}

/**
 * Horloge de la page : un instant FIXE et un fuseau.
 *
 * Les bornes dynamiques (`today`, `current-month`, `last-n-days`) se
 * calculent en jour civil LOCAL. Sans horloge posée, un contrôle qui les
 * met en jeu serait vert 364 jours sur 365 et rouge le bon jour — ou
 * l'inverse.
 */
export interface Clock {
  /** Instant fixe, en ISO avec décalage explicite (`2026-06-01T00:30:00+02:00`). */
  now: string;
  /** Fuseau du navigateur (défaut : `UTC`). */
  timezone?: string;
}

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
  /** Horloge et fuseau de la page, pour les bornes de date dynamiques. */
  clock?: Clock;
  /** Gestes joués dans la page AVANT l'observation (filtres, facettes, URL). */
  actions?: Action[];
  expects: Expect[];
  /**
   * Contrôle LÉGITIME que la bibliothèque ne passe pas encore : la raison, avec
   * le chiffre lib et le chiffre oracle.
   *
   * Un contrôle qui tombe sur un défaut de la lib ne se supprime pas et ne
   * s'adoucit pas — les deux reviennent à écrire dans le dépôt que le défaut
   * n'existe pas. Il se met en attente, en NOMMANT ce qu'il attend : c'est la
   * liste des défauts connus, et elle se lit dans le rapport.
   */
  skip?: string;
}

/** Un manifeste : un domaine, ses contrôles. */
export interface Manifest {
  /** Nom court du domaine, repris dans le rapport. */
  domain: string;
  checks: Check[];
}
