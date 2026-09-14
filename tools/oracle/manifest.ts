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
 * (null et chaîne vide exclus) ; `wavg` la moyenne pondérée (`weight`) ;
 * `first` / `last` la valeur du champ sur la première / la dernière ligne
 * DANS L'ORDRE COURANT ; `evolution` le taux (dernière − première) / première
 * sur les valeurs numériques renseignées, dans ce même ordre.
 */
export type Agg =
  'count' | 'distinct' | 'sum' | 'avg' | 'min' | 'max' | 'wavg' | 'first' | 'last' | 'evolution';

/**
 * Un filtre ligne à ligne côté oracle, volontairement minimal et explicite.
 *
 * `isnull` / `isnotnull` disent VIDE au sens large (absent ou chaîne vide).
 * `isnull-strict` / `isnotnull-strict` disent absent SEULEMENT (null ou
 * undefined) : c'est la distinction que fait le `where` de la bibliothèque,
 * pour qui une chaîne vide est une valeur renseignée.
 */
export type RowFilter =
  | {
      field: string;
      op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'notcontains';
      value: string | number;
      /**
       * Compare sans accents ni casse (`eq` et `contains`) — ce que fait une
       * recherche plein texte quand « ecole » doit trouver « École ». Le
       * repliement est écrit dans `compute.ts`, jamais emprunté à la lib.
       */
      fold?: boolean;
    }
  /** Appartenance à un ensemble — le OU multi-valeurs d'un `in` ou d'une facette. */
  | { field: string; op: 'in' | 'notin'; values: Array<string | number> }
  | { field: string; op: 'isnotnull' | 'isnull' | 'isnull-strict' | 'isnotnull-strict' };

/** Une colonne agrégée : `{ agg: 'sum', field: 'population' }`. */
export interface AggSpec {
  agg: Agg;
  field?: string;
  /** Champ de pondération, pour `wavg` seulement. */
  weight?: string;
  /**
   * Filtre PROPRE à cette colonne, appliqué avant l'agrégat — le miroir du
   * filtre entre accolades d'une expression de KPI (`ecoles:sum{sexe:eq:F}`,
   * #776), qui ne vaut que pour son côté d'un ratio.
   */
  filter?: RowFilter[];
}

/** Source BRUTE d'un contrôle vivant (export JSON Opendatasoft). */
export interface RawSource {
  /** Hôte Opendatasoft, sans slash final. */
  baseUrl: string;
  dataset: string;
  /** Clause ODSQL BRUTE (syntaxe ODS, pas le dialecte colon de la lib). */
  where?: string;
}

/**
 * Source BRUTE générique : une URL appelée TELLE QUELLE.
 *
 * `RawSource` ne sait interroger qu'un portail Opendatasoft. Les autres API du
 * banc n'ont ni la même racine ni la même enveloppe — Tabular rend
 * `{ data, links: { next } }`, INSEE Melodi `{ observations, paging }` — et un
 * contrôle vivant sur leur adaptateur est impossible sans une alimentation qui
 * sache lire ces deux formes. D'où cette variante : l'URL et ses clauses sont
 * écrites À LA MAIN dans le manifeste, jamais traduites par la lib, et
 * l'oracle n'extrait que le tableau de lignes.
 */
export interface RawUrlSource {
  /** URL complète de la première page, clauses comprises. */
  url: string;
  /** Chemin pointé du tableau de lignes (`data`, `observations`) ; défaut : la racine. */
  rowsPath?: string;
  /** Chemin pointé de l'URL de page suivante (`links.next`, `paging.next`). */
  nextPath?: string;
  /** Plafond de pages suivies — une pagination qui boucle ne doit pas pendre. */
  maxPages?: number;
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
  | {
      kind: 'raw';
      /** Le jeu PRINCIPAL (`main`), celui d'où partent les attentes sans `from`. */
      source: RawSource | RawUrlSource;
      /**
       * Jeux BRUTS supplémentaires, nommés — un par table de droite d'une
       * jointure, un par pile d'un empilement. Sans eux, un contrôle vivant ne
       * pourrait porter que sur une source unique, et les deux opérations du
       * pipeline qui mettent DEUX jeux en regard (`join`, `concat`) — celles
       * qui portent justement le constat AM-074 et l'écart de graphie #792 —
       * resteraient hors du mode vivant.
       */
      sources?: Record<string, RawSource | RawUrlSource>;
    }
  | { kind: 'fixture'; datasets: Record<string, Row[]> };

/**
 * Une étape du recalcul. La suite des étapes décrit CE QUE LA PAGE DOIT
 * MONTRER, pas comment la lib s'y prend : les deux chemins restent indépendants.
 */
export type Step =
  | { op: 'filter'; filters: RowFilter[] }
  | {
      op: 'group-by';
      /** Un champ, ou plusieurs pour un regroupement composite. */
      by: string | string[];
      columns: Record<string, AggSpec>;
    }
  | { op: 'global'; columns: Record<string, AggSpec> }
  | { op: 'order-by'; column: string; dir: 'asc' | 'desc' }
  /** Tri à plusieurs clés, dans l'ordre déclaré (la première départage). */
  | { op: 'order-by-keys'; keys: Array<{ column: string; dir: 'asc' | 'desc' }> }
  | { op: 'limit'; n: number }
  | {
      /**
       * La PAGE que l'afficheur montre : `number` (1 pour la première) de
       * `size` lignes. Une pagination fausse ne se voit pas sur la page 1.
       */
      op: 'page';
      size: number;
      number: number;
    }
  | { op: 'running'; from: string; as: string; kind: 'running_sum' | 'diff' }
  | {
      /**
       * Quotient de deux colonnes, ligne à ligne : la FRACTION qu'un ratio de
       * KPI affiche (`count:statut:ouvert / count`, #673). Dénominateur nul ou
       * non numérique : `null`, jamais 0 ni l'infini.
       */
      op: 'ratio';
      numerator: string;
      denominator: string;
      as: string;
    }
  | {
      op: 'join';
      /** Nom du jeu de droite dans `feed.datasets`. */
      right: string;
      /**
       * Champ de jointure (`"code"`), paire (`"code=code_insee"`) ou clé
       * composite (`"annee, code"` — chaque segment pouvant être une paire).
       */
      on: string;
      type: 'inner' | 'left' | 'right' | 'full';
      prefixRight?: string;
    }
  /** Colonnes calculées : la MÊME expression que l'attribut `compute`, réévaluée à part. */
  | { op: 'derive'; expr: string }
  /** Repli long → large, symétrique de `unpivot` (`dsfr-data-pivot`). */
  | {
      op: 'pivot';
      row: string | string[];
      column: string;
      value: string;
      aggregate?: PivotAgg;
      /** Gabarit des noms de colonnes, `{value}` = valeur brute. */
      columnFormat?: string;
      /** Ordre des colonnes : par défaut celui de leur première apparition. */
      columnOrder?: 'asc' | 'desc';
    }
  /** Dépliage large → long (`dsfr-data-unpivot`), colonnes citées une à une. */
  | {
      op: 'unpivot';
      idCols: string[];
      /** Colonnes dépliées, avec la clé émise quand elle diffère du nom. */
      valueCols: Array<{ column: string; as?: string }>;
      varName?: string;
      valueName?: string;
      dropEmpty?: boolean;
    }
  /**
   * Empilement de jeux (`dsfr-data-concat`). Les lignes courantes sont
   * REMPLACÉES par la pile des jeux cités, dans l'ordre.
   */
  | {
      op: 'concat';
      /** Noms des jeux de `feed.datasets`, dans l'ordre d'empilement. */
      sources: string[];
      /** Colonne portant la provenance de chaque ligne. */
      originField?: string;
      /** Valeur écrite dans `originField` par jeu ; à défaut, le nom du jeu. */
      originLabels?: Record<string, string>;
    };

/** Réductions de cellule d'un pivot (grammaire commune du pipeline). */
export type PivotAgg = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'first' | 'last';

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
  /**
   * Facteur appliqué à la valeur RECALCULÉE avant comparaison, quand la page
   * n'affiche pas la même unité que la donnée : `100` pour une fraction rendue
   * en pourcentage (#673), `1e-6` pour un total rendu en compact (« 14,8 M »).
   */
  scale?: number;
  /**
   * Motif que le TEXTE affiché doit vérifier, en plus du chiffre : c'est lui
   * qui distingue « 12,5 % » de « 12,5 », « 1 749 € » de « 1749 ». Le motif
   * décrit la FORME fr-FR attendue, jamais la valeur — sinon il ne garderait
   * plus rien du calcul.
   */
  pattern?: string;
  /**
   * Nature de la valeur affichée. `date` : la colonne porte des chaînes ISO,
   * l'oracle compare le texte JJ/MM/AAAA et non un nombre (#667).
   */
  as?: 'number' | 'date';
}

/** Lignes du cache de données d'un id (query, normalize, join, pivot, concat). */
export interface ExpectRows extends ExpectBase {
  kind: 'rows';
  pipeline: Step[];
  /** Colonne-clé, comparée en chaîne ligne à ligne ; plusieurs pour une clé composite. */
  key: string | string[];
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
  /**
   * Décimales AFFICHÉES par les cellules numériques (`decimals` du composant,
   * ou son défaut : deux au plus). La comparaison se fait à cette précision —
   * une moyenne rendue « 41,33 » ne vaut pas 41,333333 à six décimales.
   */
  decimals?: number;
}

/** Entrées de légende d'une couche choroplèthe (`getLegendEntries()`). */
export interface ExpectLegend extends ExpectBase {
  kind: 'legend';
  /** Champ numérique de `fill-field`. */
  field: string;
  /** Nombre de classes (`classes` de la couche). */
  classes: number;
  /**
   * Discrétisation : `equal` (intervalles de même largeur), `quantile`
   * (effectifs égaux — la borne de rang `i` est la valeur triée d'indice
   * `⌊i·n/classes⌋`), `manual` (les bornes de `breaks`, données ici).
   */
  method: 'equal' | 'quantile' | 'manual';
  /** Bornes supérieures, pour `manual` — les mêmes que l'attribut `breaks`. */
  breaks?: number[];
}

/**
 * Textes RENDUS par les éléments que `selector` désigne dans le composant :
 * les lignes secondaires d'un KPI, les valeurs d'un podium, les cellules d'un
 * `dsfr-data-display`, une tendance. Une observation par élément, comparée à
 * la colonne `column` du recalcul, ligne à ligne.
 */
export interface ExpectTexts extends ExpectBase {
  kind: 'texts';
  /** Sélecteur CSS cherché DANS le composant (light DOM ou shadow root). */
  selector: string;
  pipeline: Step[];
  /** Colonne du recalcul comparée aux textes, dans l'ordre. */
  column: string;
  /** Relire chaque texte comme un nombre fr-FR (défaut : comparer les chaînes). */
  numeric?: boolean;
  /** Décimales de la comparaison numérique. */
  decimals?: number;
  /** Facteur appliqué à la valeur recalculée (fraction → pourcentage…). */
  scale?: number;
  /** Motif que CHAQUE texte doit vérifier — la forme, pas la valeur. */
  pattern?: string;
}

/** Couleurs sémantiques d'un KPI (seuils), telles que le DOM les porte. */
export type CouleurKpi = 'vert' | 'orange' | 'rouge' | 'bleu';

/**
 * CLASSE appliquée selon la valeur : les seuils d'un KPI décident d'un
 * habillage, et un habillage qui ne suit pas le chiffre ment autant qu'un
 * chiffre faux.
 */
export interface ExpectClass extends ExpectBase {
  kind: 'class';
  /** Sélecteur CSS de l'élément porteur de la classe. */
  selector: string;
  /**
   * Sélecteur dont la PRÉSENCE dit que le composant a fini d'afficher ses
   * données (`.dsfr-data-kpi__value`). Sans lui, on lirait l'habillage de
   * l'état de chargement, qui porte la classe neutre — et le contrôle
   * passerait ou tomberait selon l'instant de la lecture.
   */
  ready?: string;
  /** Recalcul menant à UNE ligne (terminer par `global`). */
  pipeline?: Step[];
  /** Colonne de cette ligne portant la valeur qui décide de la couleur. */
  column?: string;
  /** Facteur appliqué à la valeur recalculée avant les seuils. */
  scale?: number;
  /** Seuils déclarés sur le composant (`threshold-green`, `threshold-orange`). */
  thresholds?: { green?: number; orange?: number };
  /** Classe DOM attendue pour chacune des quatre couleurs. */
  classes: Record<CouleurKpi, string>;
  /** Couleur forcée (`color-token`) : la valeur ne décide plus. */
  forced?: CouleurKpi;
}

/**
 * ATTRIBUT posé sur l'élément d'affichage rendu (l'élément DSFR Chart), là où
 * ce qui est montré n'est pas du texte : le résumé d'une carte (#763), les
 * bornes d'axes relayées.
 */
export interface ExpectAttr extends ExpectBase {
  kind: 'attr';
  /** Nom de l'attribut lu sur l'élément rendu. */
  attr: string;
  /** Valeur littérale attendue (une borne d'axe relayée telle quelle). */
  literal?: string;
  /** … ou un recalcul menant à UNE ligne (terminer par `global`). */
  pipeline?: Step[];
  /** Colonne de cette ligne, quand la valeur est recalculée. */
  column?: string;
  /** Décimales de la comparaison numérique. */
  decimals?: number;
  /** Facteur appliqué à la valeur recalculée. */
  scale?: number;
}

/** Contenu du fichier CSV que l'export du composant produit. */
export interface ExpectCsv extends ExpectBase {
  kind: 'csv';
  pipeline: Step[];
  /** Colonnes exportées, dans l'ordre, avec l'en-tête attendu. */
  columns: Array<{ column: string; label: string }>;
}

/**
 * Couleurs des PASTILLES de légende d'un graphique (#732 / #813) : la légende
 * qui ne suit pas `color-map` ment sur les couleurs du tracé.
 */
export interface ExpectDots extends ExpectBase {
  kind: 'dots';
  pipeline: Step[];
  /** Colonne dont la valeur est la modalité colorée (part, série). */
  labelColumn: string;
  /** Modalité → couleur, telle que la page la déclare (hexadécimal). */
  colorMap: Record<string, string>;
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
  | ExpectTexts
  | ExpectClass
  | ExpectAttr
  | ExpectCsv
  | ExpectDots
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
  /**
   * Reproduction du banc d'essai dont le contrôle reprend le balisage
   * (`education/dataviz-ips-colleges`). Le rapport `out/banc.md` groupe par
   * cette valeur : c'est ce que le banc relit, page par page.
   */
  page?: string;
  /**
   * Identifiants du registre du banc couverts par le contrôle (`BUG-009`,
   * `AM-063`). `origin` les cite déjà en prose ; ce champ les rend LISIBLES
   * sans analyser une phrase, pour que le rapport puisse dire « ce constat a
   * été rejoué, et voici le chiffre ».
   */
  constats?: string[];
  feed: Feed;
  /** Balises supplémentaires du `<head>` (DSFR Chart depuis node_modules…). */
  head?: string;
  /** Balisage complet rendu par Playwright (sources, queries, KPI, …). */
  markup: string;
  /**
   * Chaîne de requête ajoutée à l'URL de la page (`page=2`) : un lien profond
   * est un chemin d'affichage à part entière (`url-sync`), et il évite de
   * piloter la page au clavier pour vérifier ce qu'elle montre en page 2.
   */
  query?: string;
  /** Horloge et fuseau de la page, pour les bornes de date dynamiques. */
  clock?: Clock;
  /** Gestes joués dans la page AVANT l'observation (filtres, facettes, URL). */
  actions?: Action[];
  expects: Expect[];
  /**
   * Contrôle LÉGITIME que la bibliothèque ne passe pas encore : la raison, avec
   * le chiffre lib et le chiffre oracle.
   *
   * Il ne se supprime pas et ne s'adoucit pas — les deux reviennent à écrire
   * dans le dépôt qu'il n'y avait rien à voir. Il se met en attente, en
   * NOMMANT ce qu'il attend et LEQUEL des deux cas c'est, parce qu'ils
   * n'appellent pas la même suite : un DÉFAUT contredit ce que la
   * documentation promet, et s'ouvre en issue ; une AMÉLIORATION attendue ne
   * contredit rien, le chiffre affiché est juste, et le contrôle est écrit
   * pour que le jour où la capacité arrive, elle arrive juste. Réclamer ce que
   * personne n'a promis coûte ce que #746 a mesuré, dans l'autre sens.
   */
  skip?: string;
}

/** Un manifeste : un domaine, ses contrôles. */
export interface Manifest {
  /** Nom court du domaine, repris dans le rapport. */
  domain: string;
  checks: Check[];
}
