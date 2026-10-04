/**
 * Ce que le Builder (« Créer un graphique ») N'EXPOSE PAS, et pourquoi (#1204).
 *
 * Lu par le garde-fou `tests/apps/builder/couverture.test.ts` : chaque type de
 * graphique de la bibliothèque (`DSFRChartType`), chaque composant d'affichage
 * public du manifeste `packages/core/custom-elements.json` et chaque attribut
 * de `dsfr-data-chart` est soit EXPOSÉ par le Builder (une tuile `data-type`,
 * un contrôle qui porte `data-attribut`, de la forme balise:attribut), soit déclaré ici avec sa
 * raison.
 *
 * - Un type, un composant d'affichage ou un attribut NOUVEAU de la
 *   bibliothèque, ni exposé ni déclaré ici, fait échouer le test : il faut
 *   trancher — lui donner un contrôle, ou l'exclure en disant pourquoi. C'est
 *   ce qui a manqué avant #1204 : le podium, le barres + ligne et trois cartes
 *   existaient dans la bibliothèque sans que rien ne signale leur absence ici.
 * - Une exclusion devenue FAUSSE (le Builder expose désormais la cible) fait
 *   aussi échouer le test : on la retire.
 * - Une exclusion qui ne vise rien que le manifeste déclare échoue également.
 *
 * Deux natures d'entrées, à ne pas confondre :
 * - `suite` renseigné : le réglage a sa place dans le formulaire, il n'y est
 *   pas ENCORE. L'issue citée en tient la liste.
 * - `suite` absent : la cible est hors du périmètre de ce formulaire, à
 *   dessein ; la raison dit où elle se règle.
 *
 * Les raisons sont REGROUPÉES : une raison vaut pour toutes les cibles de sa
 * ligne. Elles décrivent l'état du Builder, pas un jugement sur la
 * bibliothèque. Sur le modèle de `apps/studio/src/couverture-exclusions.ts`.
 */

/**
 * Issue qui tient la liste des réglages à exposer plus tard. #1218 a tenu ce
 * rôle après #1204 ; son lot livré (unité, bornes, lignes de référence, cibles,
 * couleurs fixées, catégories vides, synthèse de carte), le reste est passé à
 * #1263.
 */
export const ISSUE_DE_SUITE = '#1263';

export interface ExclusionBuilder {
  /** Ce que vise l'exclusion. */
  genre: 'type' | 'composant' | 'attribut';
  /**
   * Noms visés : types de `DSFRChartType`, balises `dsfr-data-*`, ou attributs
   * de `dsfr-data-chart`.
   */
  noms: readonly string[];
  raison: string;
  /** Issue de suite quand le réglage est à exposer plus tard ; absent : hors périmètre. */
  suite?: string;
}

/**
 * Attributs de `dsfr-data-chart` que le générateur ÉCRIT sans contrôle dédié :
 * ils se déduisent d'un autre réglage. Ce ne sont pas des exclusions — le
 * garde-fou vérifie, sur du code généré, qu'ils sont bien écrits.
 */
export const ECRITS_SANS_CONTROLE: readonly { attribut: string; deduitDe: string }[] = [
  { attribut: 'source', deduitDe: 'la source choisie : identifiant de la requête générée' },
  { attribut: 'name', deduitDe: 'le titre et les libellés de séries' },
  { attribut: 'horizontal', deduitDe: 'la tuile « Barres H »' },
  { attribut: 'fill', deduitDe: 'le choix entre « Camembert » (plein) et « Anneau »' },
];

export const EXCLUSIONS: readonly ExclusionBuilder[] = [
  // --- Composants d'affichage ---------------------------------------------
  {
    genre: 'composant',
    noms: ['dsfr-data-kpi-group'],
    raison:
      'Plusieurs indicateurs côte à côte : le Builder produit un KPI à la fois. Un groupe demande une liste d’indicateurs, que le formulaire ne sait pas encore décrire.',
    suite: ISSUE_DE_SUITE,
  },
  {
    genre: 'composant',
    noms: ['dsfr-data-display'],
    raison:
      'Cartes ou fiches répétées à partir d’un gabarit HTML : le formulaire n’a pas d’éditeur de gabarit.',
    suite: ISSUE_DE_SUITE,
  },
  {
    genre: 'composant',
    noms: ['dsfr-data-repeat'],
    raison:
      'Répétition d’un gabarit HTML libre : ce n’est pas une forme de graphique. Elle s’écrit dans le Playground ou le Studio IA.',
  },
  {
    genre: 'composant',
    noms: ['dsfr-data-map', 'dsfr-data-map-layer'],
    raison:
      'Carte à couches (fond de carte, marqueurs, zones) : c’est l’objet du Builder carto « Créer une carte ». Le Builder graphique ne propose que les cartes choroplèthes de dsfr-data-chart.',
  },

  // --- dsfr-data-chart : hors périmètre -----------------------------------
  {
    genre: 'attribut',
    noms: ['gauge-value'],
    raison:
      'Valeur fixe d’une jauge, écrite à la main et sans source : le Builder part toujours d’une source, dont il agrège le champ de valeur.',
  },

  // --- dsfr-data-chart : à exposer plus tard ------------------------------
  {
    genre: 'attribut',
    noms: ['highlight-index'],
    raison:
      'Barre mise en avant : l’attribut désigne un rang, pas une catégorie, et le rang change avec le tri ou les données. « Couleurs par catégorie » (color-map) désigne la catégorie par son nom ; un contrôle par rang reste à arbitrer.',
    suite: ISSUE_DE_SUITE,
  },
  {
    genre: 'attribut',
    noms: ['map-highlight'],
    raison: 'Territoire mis en avant : pas de contrôle pour désigner le territoire.',
    suite: ISSUE_DE_SUITE,
  },
  {
    genre: 'attribut',
    noms: ['map-summary-weight', 'map-summary-field'],
    raison:
      'Synthèse de carte pondérée par un effectif, ou calculée sur une autre colonne : la requête générée n’agrège que le champ de valeur, il lui faudrait une seconde colonne. « Chiffre affiché sous le titre » propose la moyenne, la somme, une valeur publiée ou aucun chiffre.',
    suite: ISSUE_DE_SUITE,
  },
  {
    genre: 'attribut',
    noms: [
      'heading-level',
      'databox-date-field',
      'databox-tooltip-title',
      'databox-tooltip-content',
      'databox-modal-title',
      'databox-modal-content',
      'databox-actions',
      'databox-default-source',
    ],
    raison:
      'Réglages fins du cadre officiel (niveau de titre, date lue dans les données, infobulle, fenêtre d’information, actions, source par défaut) : la section « Cadre officiel DSFR » n’expose que le titre, la source, la date, la tendance et les trois actions courantes.',
    suite: ISSUE_DE_SUITE,
  },
  {
    genre: 'attribut',
    noms: ['idle-message'],
    raison:
      'Message affiché quand la source attend un filtre : le Builder ne génère aucun require-where, l’attribut serait sans effet. À exposer avec lui, ou à classer hors périmètre.',
    suite: ISSUE_DE_SUITE,
  },
];
