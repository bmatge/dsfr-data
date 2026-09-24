/**
 * Ce que le Studio n'ECRIT PAS, et pourquoi (#1109).
 *
 * Lu par le garde-fou de couverture (`couverture.ts`, `npm run
 * check:studio-couverture`, bloquant en CI) : tout composant et tout attribut
 * du manifeste `packages/core/custom-elements.json` est soit ecrit par le
 * Studio (MESURE sur son export), soit declare ici avec sa raison.
 *
 * - Un composant ou un attribut NOUVEAU de la lib, ni ecrit ni declare ici,
 *   fait echouer le controle : il faut trancher (l'exposer dans le modele de
 *   blocs, ou l'exclure en disant pourquoi).
 * - Une exclusion devenue FAUSSE (le Studio ecrit desormais l'attribut) fait
 *   aussi echouer le controle : on la retire.
 * - Une exclusion qui ne vise rien de declare echoue, sauf si elle attend une
 *   evolution nommee (`enAttente`, ex. un attribut en cours d'ajout a la lib).
 *
 * Les raisons sont REGROUPEES : une raison vaut pour tous les attributs de sa
 * ligne. Elles decrivent l'etat du Studio, pas un jugement sur la lib.
 */

export interface ExclusionDeclaree {
  composant: string;
  /** Absent : le composant entier n'est pas ecrit par le Studio. */
  attributs?: readonly string[];
  raison: string;
  /**
   * Evolution attendue (numero d'issue) : tolere que l'exclusion vise un
   * attribut que le manifeste ne declare pas ENCORE.
   */
  enAttente?: string;
}

// ---------------------------------------------------------------------------
// Raisons communes
// ---------------------------------------------------------------------------

const LIBRE =
  'non exposé par le modèle de blocs du Studio (text, chart, filters, map) — relève du bloc « composant libre » (#1111)';

const TRANSFORMATEUR = `Transformateur ${LIBRE}. Le Studio compose source → dsfr-data-query → affichage.`;

const ALIAS_FR =
  "Alias français déprécié (#300) : le Studio écrit la forme anglaise de l'attribut.";

const ATTENTE_DEFAUT = "Message d'attente ou d'état vide : le défaut du composant est conservé.";

const URL_SYNC =
  "Synchronisation avec l'URL de la page non exposée : la page du Studio ne porte pas d'état dans l'URL.";

const CHART_NON_EXPOSE = `Option de <dsfr-data-chart> absente de ChartConfig (option config d'un bloc chart) : ${LIBRE}.`;

const PRESENTATION_NON_EXPOSEE = `Présentation absente de ChartConfig (option config d'un bloc chart) : défaut du composant, ${LIBRE}.`;

const REFINE =
  "Sélection au clic (refine-on-click, #681) non exposée : pour ne pas filtrer le composant lui-même, elle exige une source propre et un dsfr-data-context dont cette source n'est pas cible (JSDoc de dsfr-data-map-layer). Le Studio pose une seule source partagée par tous les blocs, et un contexte seulement avec un bloc filters qui la cible — le câblage serait faux. Voir #1111.";

// ---------------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------------

export const EXCLUSIONS: readonly ExclusionDeclaree[] = [
  // --- Composants entiers -------------------------------------------------
  { composant: 'dsfr-data-normalize', raison: TRANSFORMATEUR },
  { composant: 'dsfr-data-pivot', raison: TRANSFORMATEUR },
  { composant: 'dsfr-data-unpivot', raison: TRANSFORMATEUR },
  { composant: 'dsfr-data-join', raison: TRANSFORMATEUR },
  { composant: 'dsfr-data-concat', raison: TRANSFORMATEUR },
  {
    composant: 'dsfr-data-facets',
    raison: `Composant d'interaction ${LIBRE}. Les filtres partagés du Studio passent par le bloc filters (dsfr-data-context-filter).`,
  },
  {
    composant: 'dsfr-data-search',
    raison: `Composant d'interaction ${LIBRE}. Les filtres partagés du Studio passent par le bloc filters (dsfr-data-context-filter).`,
  },
  { composant: 'dsfr-data-display', raison: `Affichage par gabarit ${LIBRE}.` },
  { composant: 'dsfr-data-repeat', raison: `Répétition par gabarit ${LIBRE}.` },
  { composant: 'dsfr-data-context-value', raison: `Valeur de contexte dans le texte ${LIBRE}.` },
  {
    composant: 'dsfr-data-kpi-group',
    raison:
      'Disposition des indicateurs assurée par la grille du document (width third des blocs chart kpi), pas par un groupe.',
  },
  {
    composant: 'dsfr-data-a11y',
    raison: `Alternative accessible (tableau, téléchargement) ${LIBRE}.`,
  },
  {
    composant: 'dsfr-data-beacon',
    raison: "Instrumentation de suivi d'usage : sans objet dans une page composée par le Studio.",
  },
  {
    composant: 'dsfr-data-map-inset',
    raison:
      'Encarts posés par l\'attribut insets de dsfr-data-map (l\'export écrit insets="drom"), pas par des encarts dédiés.',
  },
  { composant: 'dsfr-data-map-legend', raison: `Compagnon de carte (légende) ${LIBRE}.` },
  {
    composant: 'dsfr-data-map-timeline',
    raison: `Compagnon de carte (animation temporelle) ${LIBRE}.`,
  },

  // --- dsfr-data-source ---------------------------------------------------
  {
    composant: 'dsfr-data-source',
    attributs: ['method', 'headers', 'params', 'api-key-ref', 'use-proxy', 'proxy-url'],
    raison:
      "Connexion : une page publique n'emporte ni en-têtes ni clé (une source qui en exige est embarquée en data), et le proxy est résolu par la lib.",
  },
  {
    composant: 'dsfr-data-source',
    attributs: [
      'refresh',
      'cache-ttl',
      'paginate',
      'max-records',
      'fetch-mode',
      'lazy',
      'lazy-target',
      'require-where',
    ],
    raison:
      "Stratégie de chargement choisie par l'export (ADR-109 : jeu entier, ou pagination serveur pour une liste seule), non réglable dans le Studio.",
  },
  {
    composant: 'dsfr-data-source',
    attributs: ['group-by', 'aggregate', 'order-by', 'limit'],
    raison:
      "Regroupement, tri et limite portés par dsfr-data-query (option config d'un bloc chart) ; une source Opendatasoft dédiée à un KPI ne reçoit que select et where (#810).",
  },

  // --- dsfr-data-query ----------------------------------------------------
  {
    composant: 'dsfr-data-query',
    attributs: ['filter'],
    raison: 'Alias de where (compatibilité).',
  },
  {
    composant: 'dsfr-data-query',
    attributs: ['explode', 'require-where'],
    raison: `Option de dsfr-data-query absente de ChartConfig : ${LIBRE}.`,
  },

  // --- dsfr-data-chart ----------------------------------------------------
  {
    composant: 'dsfr-data-chart',
    attributs: ['empty-label', 'idle-message'],
    raison: ATTENTE_DEFAUT,
  },
  {
    composant: 'dsfr-data-chart',
    attributs: [
      'series-field',
      'name',
      'color-map',
      'unit-tooltip-bar',
      'stacked',
      'highlight-index',
      'x-min',
      'x-max',
      'y-min',
      'y-max',
      'gauge-value',
      'map-highlight',
      'map-summary',
      'map-summary-value',
      'map-summary-weight',
      'map-summary-field',
      'heading-level',
      'reference-lines',
      'targets',
      'targets-zone',
      'targets-legend',
    ],
    raison: CHART_NON_EXPOSE,
  },
  {
    composant: 'dsfr-data-chart',
    attributs: [
      'databox',
      'databox-title',
      'databox-source',
      'databox-date',
      'databox-date-field',
      'databox-download',
      'databox-screenshot',
      'databox-fullscreen',
      'databox-trend',
      'databox-tooltip-title',
      'databox-tooltip-content',
      'databox-modal-title',
      'databox-modal-content',
      'databox-default-source',
      'databox-actions',
    ],
    raison: `Cadre DSFR « databox » : le bloc du document porte déjà le titre ; ${LIBRE}.`,
  },

  // --- dsfr-data-kpi ------------------------------------------------------
  {
    composant: 'dsfr-data-kpi',
    attributs: ['valeur', 'icone', 'tendance', 'seuil-vert', 'seuil-orange', 'couleur'],
    raison: ALIAS_FR,
  },
  { composant: 'dsfr-data-kpi', attributs: ['idle-message'], raison: ATTENTE_DEFAUT },
  {
    composant: 'dsfr-data-kpi',
    attributs: ['where'],
    raison:
      'Filtre porté par dsfr-data-query, ou par la source dédiée du KPI (#810), pas par le KPI.',
  },
  {
    composant: 'dsfr-data-kpi',
    attributs: [
      'heading',
      'description',
      'icon',
      'icon-position',
      'icon-size',
      'picto',
      'picto-field',
      'picto-base',
      'image',
      'image-alt',
      'image-position',
      'orientation',
      'border',
      'tint',
      'format',
      'decimals',
      'trend',
      'lines',
      'threshold-green',
      'threshold-orange',
      'color',
      'col',
      'span',
    ],
    raison: PRESENTATION_NON_EXPOSEE,
  },

  // --- dsfr-data-list -----------------------------------------------------
  {
    composant: 'dsfr-data-list',
    attributs: ['colonnes', 'recherche', 'filtres', 'tri', 'server-tri'],
    raison: ALIAS_FR,
  },
  { composant: 'dsfr-data-list', attributs: ['idle-message'], raison: ATTENTE_DEFAUT },
  { composant: 'dsfr-data-list', attributs: ['url-sync', 'url-page-param'], raison: URL_SYNC },
  {
    composant: 'dsfr-data-list',
    attributs: ['refine-on-click', 'context', 'label'],
    raison: REFINE,
  },
  {
    composant: 'dsfr-data-list',
    attributs: [
      'columns-auto',
      'filters',
      'sort',
      'caption',
      'count-label',
      'decimals',
      'export',
      'cell-class',
    ],
    raison: PRESENTATION_NON_EXPOSEE,
  },

  // --- dsfr-data-podium ---------------------------------------------------
  { composant: 'dsfr-data-podium', attributs: ['idle-message'], raison: ATTENTE_DEFAUT },
  {
    composant: 'dsfr-data-podium',
    attributs: [
      'subtitle',
      'subtitle-field',
      'selected-palette',
      'no-sort',
      'bar-max',
      'image-field',
      'image-shape',
      'icon-field',
      'icon',
      'picto',
      'picto-field',
      'picto-base',
      'rank',
      'orientation',
      'layout',
      'bar',
      'bar-position',
      'border',
      'square',
      'rounded',
    ],
    raison: PRESENTATION_NON_EXPOSEE,
  },

  // --- Filtres partages ---------------------------------------------------
  { composant: 'dsfr-data-context', attributs: ['url-sync', 'url-param-map'], raison: URL_SYNC },
  {
    composant: 'dsfr-data-context-filter',
    attributs: ['year-start-month', 'apply-to', 'default', 'context'],
    raison:
      "Le bloc filters n'écrit que des filtres eq, sans valeur par défaut, imbriqués dans leur contexte et appliqués à toutes ses sources.",
  },
  {
    composant: 'dsfr-data-context-tags',
    attributs: ['clear-all'],
    raison: 'Bouton « tout effacer » : défaut du composant conservé.',
  },

  // --- Carte --------------------------------------------------------------
  {
    composant: 'dsfr-data-map',
    attributs: ['center', 'zoom'],
    raison:
      'Le Studio cadre la carte sur ses données (fit-bounds) ; center et zoom existent dans le modèle du Tableau de bord mais ne sont pas exposés au Studio.',
  },
  {
    composant: 'dsfr-data-map',
    attributs: [
      'min-zoom',
      'max-zoom',
      'tiles',
      'tiles-attribution',
      'tiles-style',
      'tiles-switcher',
      'fullscreen',
      'sovereign-only',
      'no-controls',
      'locked',
      'max-bounds',
      'fit-zone',
      'fit-max-zoom',
      'name',
    ],
    raison: `Réglage de carte (fond, contrôles, bornes) : défaut du composant, ${LIBRE}.`,
  },
  {
    composant: 'dsfr-data-map-layer',
    attributs: ['refine-on-click', 'context', 'label'],
    raison: `${REFINE} label ne sert que de libellé du tag de cette sélection (le libellé d'une couche est écrit en commentaire).`,
  },
  {
    composant: 'dsfr-data-map-layer',
    attributs: [
      'shape-class',
      'no-interactive',
      'color',
      'color-map',
      'fill-opacity',
      'classes',
      'method',
      'breaks',
      'radius',
      'radius-unit',
      'radius-min',
      'radius-max',
      'heat-radius',
      'heat-blur',
      'min-zoom',
      'max-zoom',
      'max-items',
    ],
    raison: `Réglage de couche (style, discrétisation, rayons, zoom) : défaut du composant, ${LIBRE}.`,
  },
  {
    composant: 'dsfr-data-map-layer',
    attributs: ['bbox', 'bbox-debounce', 'bbox-field'],
    raison:
      "Chargement par emprise (bbox) : suppose une source paginée côté serveur, que l'export d'une carte ne pose pas (jeu entier, ADR-109).",
  },
  {
    composant: 'dsfr-data-map-layer',
    attributs: ['time-field', 'time-bucket', 'time-mode'],
    raison: `Dimension temporelle, pilotée par dsfr-data-map-timeline : ${LIBRE}.`,
  },
  {
    composant: 'dsfr-data-map-popup',
    attributs: ['width'],
    raison: 'Largeur du volet : défaut du composant (350px, borné à la largeur de la carte).',
  },
];
