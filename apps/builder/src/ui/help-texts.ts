/**
 * Centralized help texts for the Builder UI.
 * Used by tooltips, empty states, and validation messages.
 */

// ─── Tooltip texts (rich contextual help for key controls) ─────────────

export const TOOLTIPS = {
  'label-field':
    'Le champ qui servira d\'etiquette pour chaque barre, point ou segment. Ex\u00a0: si vos données sont par region, choisissez le champ "region".',
  'value-field':
    'Le champ numérique a representer. Ex\u00a0: population, budget, nombre de votes. Ce champ sera utilise pour calculer la hauteur des barres ou la taille des segments.',
  aggregation:
    'Que faire quand plusieurs lignes ont la même etiquette\u00a0?\n\u2022 Somme\u00a0: additionne les valeurs\n\u2022 Moyenne\u00a0: calcule la moyenne\n\u2022 Comptage\u00a0: compte le nombre de lignes\n\u2022 Min / Max\u00a0: garde la plus petite ou grande valeur',
  'sort-order':
    "Dans quel ordre afficher les resultats\u00a0:\n\u2022 Decroissant\u00a0: du plus grand au plus petit\n\u2022 Croissant\u00a0: du plus petit au plus grand\n\u2022 Ordre source\u00a0: ne trie pas, conserve l'ordre des données recues. Utile pour les mois en lettres, jours de la semaine, ou toute série déjà ordonnee a la source.",
  'sort-field':
    'Le champ qui sert de critere de tri.\n\u2022 Auto (défaut)\u00a0: trie par la valeur agregee (hauteur des barres, taille des parts).\n\u2022 Champ cat\u00e9gorie\u00a0: trie alphabetiquement (utile pour ranger des departements ou des noms par ordre alphabetique).',
  'advanced-mode':
    "Active des options de filtrage et de transformation. Utile pour ne garder qu'une partie des données (ex\u00a0: uniquement l'Ile-de-France) ou combiner plusieurs agrégations.",
  'query-filter':
    'Syntaxe\u00a0: champ:operateur:valeur.\nEx\u00a0: region:eq:Bretagne (uniquement la Bretagne)\nEx\u00a0: population:gte:10000 (population >= 10\u00a0000)\nSeparez plusieurs filtres par des virgules.',
  'generation-mode':
    "Embarque\u00a0: les données sont copiees dans le code HTML. Simple, mais les données ne se mettent pas a jour.\n\nDynamique\u00a0: les données sont chargees depuis l'API a chaque affichage. Le graphique est toujours a jour.",
  'chart-palette':
    'Jeu de couleurs pour le graphique.\n\u2022 Couleurs distinctes par cat\u00e9gorie\u00a0: id\u00e9al pour comparer des cat\u00e9gories ind\u00e9pendantes (r\u00e9gions, secteurs)\n\u2022 D\u00e9grad\u00e9 clair\u2009\u2192\u2009fonc\u00e9 (ou inverse)\u00a0: id\u00e9al pour des valeurs ordonn\u00e9es (population, intensit\u00e9)\n\u2022 Bicolore depuis le centre\u00a0: id\u00e9al pour repr\u00e9senter des \u00e9carts par rapport \u00e0 une r\u00e9f\u00e9rence (positif vs n\u00e9gatif)',
  normalize:
    'Prepare les données brutes avant traitement\u00a0: supprime les espaces, convertit les textes "123" en nombres, renomme les colonnes... Utile quand les données de l\'API ne sont pas propres.',
  facets:
    "Ajoute des filtres interactifs sous le graphique. L'utilisateur final pourra filtrer les données par catégorie, annee, etc. Fonctionne uniquement en mode dynamique.",
  a11y: "Ajoute un tableau de données et un bouton de téléchargement CSV sous le graphique, pour les lecteurs d'écran et l'open data. Recommande pour l'accessibilité RGAA.",
  databox:
    "Encadre le graphique dans une boite avec titre, source, date et boutons (téléchargement, plein écran). C'est le style officiel DSFR pour presenter des données.",
} as const;

// ─── Improved hint texts (replace existing fr-hint-text) ───────────────

export const HINTS = {
  'label-field': 'Le champ pour les etiquettes (ex\u00a0: region, annee, catégorie)',
  'value-field': 'Le champ numérique a mesurer (ex\u00a0: population, budget)',
  'aggregation-default':
    'Comment combiner les valeurs quand plusieurs lignes ont la même etiquette',
  'aggregation-kpi': "Calcul applique sur l'ensemble des données pour obtenir une valeur unique",
  'aggregation-map':
    'Comment combiner les valeurs quand plusieurs lignes concernent le même departement',
} as const;

// ─── Validation messages (friendly, actionable) ───────────────────────

export const VALIDATION = {
  'missing-columns':
    'Il manque la selection des colonnes a afficher. Cliquez sur "Configurer les colonnes" pour choisir les champs visibles dans le tableau.',
  'missing-xy':
    "Il manque les champs pour les axes X et Y.\n\u2022 Axe X\u00a0: le champ qui servira d'etiquette (ex\u00a0: region)\n\u2022 Axe Y\u00a0: le champ numérique a representer (ex\u00a0: population)",
  'missing-value':
    'Il manque le champ numérique a mesurer. Sélectionnez un champ dans "Axe Y / Valeurs" (ex\u00a0: population, budget).',
  'generate-first-playground':
    'Cliquez d\'abord sur "Générer le graphique" pour voir le resultat, puis vous pourrez l\'ouvrir dans le Playground.',
  'generate-first-favorite':
    'Cliquez d\'abord sur "Générer le graphique" pour voir le resultat, puis vous pourrez le sauvegarder en favori.',
} as const;

// ─── Empty state messages ─────────────────────────────────────────────

export const EMPTY_STATES = {
  'builder-no-source': {
    icon: 'ri-database-2-line',
    title: 'Pas encore de données\u00a0?',
    description:
      "Creez une source de données pour commencer, ou explorez l'outil avec des données d'exemple.",
    primaryAction: { label: 'Ajouter une source', icon: 'ri-add-line' },
  },
  'builder-preview': {
    icon: 'ri-bar-chart-box-line',
    title: 'Votre graphique apparaitra ici',
    steps: [
      { key: 'source', label: 'Charger une source de données' },
      { key: 'type', label: 'Choisir un type de graphique' },
      { key: 'config', label: 'Configurer les champs' },
      { key: 'generate', label: 'Cliquer sur "Générer"' },
    ],
  },
} as const;
