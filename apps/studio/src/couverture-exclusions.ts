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
 *
 * Depuis le bloc « composant libre » (#1111), le Studio ecrit toute balise et
 * tout attribut du manifeste, valides a l'appel : un nouvel attribut de la lib
 * est donc couvert sans autre geste. Ne restent exclus que ce que ce bloc
 * REFUSE a dessein : la source (posee par le Studio), la balise de suivi et
 * les attributs retires.
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

const SOURCE_DU_STUDIO =
  'dsfr-data-source est refusé dans le bloc « composant libre » (#1111) : la source du document est posée par le Studio, qui en choisit la connexion et le chargement.';

const RETIRE =
  'Attribut retiré (alias français #300, ou color remplacé par color-token #367) : le bloc « composant libre » le refuse et renvoie à la forme courante, que le Studio écrit.';

// ---------------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------------

export const EXCLUSIONS: readonly ExclusionDeclaree[] = [
  // --- Composants entiers -------------------------------------------------
  {
    composant: 'dsfr-data-beacon',
    raison:
      "Instrumentation de suivi d'usage : sans objet dans une page composée par le Studio, et refusée dans le bloc « composant libre » (#1111).",
  },

  // --- dsfr-data-source ---------------------------------------------------
  {
    composant: 'dsfr-data-source',
    attributs: ['method', 'headers', 'params', 'api-key-ref', 'use-proxy', 'proxy-url'],
    raison: `Connexion : une page publique n'emporte ni en-têtes ni clé (une source qui en exige est embarquée en data), et le proxy est résolu par la lib. ${SOURCE_DU_STUDIO}`,
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
    raison: `Stratégie de chargement choisie par l'export (ADR-109 : jeu entier, ou pagination serveur pour une liste seule). ${SOURCE_DU_STUDIO}`,
  },
  {
    composant: 'dsfr-data-source',
    attributs: ['group-by', 'aggregate', 'order-by', 'limit'],
    raison: `Regroupement, tri et limite portés par dsfr-data-query (bloc chart, ou bloc « composant libre ») ; une source Opendatasoft dédiée à un KPI ne reçoit que select et where (#810). ${SOURCE_DU_STUDIO}`,
  },

  // --- Attributs retires --------------------------------------------------
  {
    composant: 'dsfr-data-kpi',
    attributs: ['valeur', 'icone', 'tendance', 'seuil-vert', 'seuil-orange', 'couleur', 'color'],
    raison: RETIRE,
  },
  {
    composant: 'dsfr-data-list',
    attributs: ['colonnes', 'recherche', 'filtres', 'tri', 'server-tri'],
    raison: RETIRE,
  },
];
