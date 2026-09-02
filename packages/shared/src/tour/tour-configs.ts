/**
 * Product tour configurations for all apps.
 * Each app imports its own config and calls startTourIfFirstVisit().
 *
 * The BUILDER tour is defined inside apps/builder because its steps rely on
 * DOM hooks (openSection) specific to the builder app. It still registers its
 * metadata via TOURS_REGISTRY so the /guide page can list it.
 */

import type { TourConfig } from '../ui/product-tour.js';

// ─── Sources ───────────────────────────────────────────────────────────

export const SOURCES_TOUR: TourConfig = {
  id: 'sources',
  label: 'Sources',
  version: 1,
  steps: [
    {
      selector: '#add-connection-btn',
      title: 'Connecter une base de données',
      description:
        'Ajoutez une connexion a une base Grist ou une API publique (data.gouv.fr, OpenDataSoft...) pour acceder a vos données.',
      position: 'right',
    },
    {
      selector: '#add-source-btn',
      title: 'Créer une source manuelle',
      description:
        "Pas d'API ? Creez une source en collant du JSON, en important un CSV, ou en saisissant un tableau directement.",
      position: 'right',
    },
    {
      selector: '#main-content',
      title: 'Explorer et prévisualiser',
      description:
        'Une fois une connexion ajoutée, vous pourrez parcourir ses tables et prévisualiser les données avant de les utiliser dans le Builder.',
      position: 'left',
    },
  ],
};

// ─── Builder IA ────────────────────────────────────────────────────────

export const BUILDER_IA_TOUR: TourConfig = {
  id: 'builder-ia',
  label: 'Builder IA',
  version: 1,
  steps: [
    {
      selector: '#saved-source',
      title: 'Choisissez une source',
      description:
        "Sélectionnez une source de données dans la liste. Vous pouvez aussi choisir un jeu de données d'exemple pour essayer tout de suite.",
      position: 'bottom',
    },
    {
      selector: '#chat-input',
      title: 'Decrivez votre graphique',
      description:
        'Ecrivez en francais ce que vous voulez : "un graphique en barres de la population par region", "un camembert du budget"... L\'IA généré le code.',
      position: 'top',
    },
    {
      selector: 'app-preview-panel',
      title: 'Resultat et code',
      description:
        'Le graphique généré s\'affiche ici. Basculez sur l\'onglet "Code" pour copier le HTML pret a integrer.',
      position: 'left',
    },
  ],
};

// ─── Builder Carto ─────────────────────────────────────────────────────

export const BUILDER_CARTO_TOUR: TourConfig = {
  id: 'builder-carto',
  label: 'Builder Carto',
  version: 2,
  steps: [
    {
      selector: '#panel-couches',
      title: 'Vos couches de données',
      description:
        'Chaque couche a sa source de données et sa localisation. Ajoutez-en pour superposer plusieurs jeux de données sur la même carte.',
      position: 'right',
    },
    {
      selector: '#panel-elements',
      title: 'La représentation',
      description:
        'Marqueurs, zones colorees, cercles proportionnels ou carte de chaleur — puis couleurs, contenu du clic et options avancees.',
      position: 'right',
    },
    {
      selector: '#panel-carte',
      title: 'La carte elle-même',
      description:
        "Fond de carte, encarts DROM et Corse, tableau d'accessibilite et reglages avances.",
      position: 'right',
    },
    {
      selector: '#btn-execute',
      title: 'La carte est l’aperçu',
      description:
        'La carte occupe tout l’écran : déplacez et zoomez, le cadrage exporté suit. "Générer" recharge l’aperçu et recadre sur les données.',
      position: 'bottom',
    },
    {
      selector: '#btn-export',
      title: 'Copier le code',
      description:
        'Le HTML pret a copier-coller dans votre site, en mode composants seuls ou page autonome.',
      position: 'bottom',
    },
  ],
};

// ─── Playground ────────────────────────────────────────────────────────

export const PLAYGROUND_TOUR: TourConfig = {
  id: 'playground',
  label: 'Playground',
  version: 1,
  steps: [
    {
      selector: '#example-select',
      title: 'Charger un exemple',
      description:
        "Plus de 30 exemples prets a l'emploi : graphiques, tableaux, cartes, facettes... Choisissez-en un pour demarrer.",
      position: 'bottom',
    },
    {
      selector: '#code-editor',
      title: 'Editeur de code',
      description:
        "Modifiez le HTML/JS directement. Tous les composants dsfr-data sont disponibles. L'editeur propose la coloration syntaxique.",
      position: 'right',
    },
    {
      selector: '#run-btn',
      title: 'Exécuter',
      description:
        'Cliquez pour voir le rendu en direct dans le panneau de droite. Le resultat se met a jour a chaque execution.',
      position: 'bottom',
    },
    {
      selector: '#preview-frame',
      title: 'Aperçu en direct',
      description:
        'Le rendu de votre code s\'affiche ici. Utilisez les boutons "Copier le code" ou "Ajouter des dépendances" pour obtenir un code autonome.',
      position: 'left',
    },
  ],
};

// ─── Dashboard ─────────────────────────────────────────────────────────

export const DASHBOARD_TOUR: TourConfig = {
  id: 'dashboard',
  label: 'Dashboard',
  version: 1,
  steps: [
    {
      selector: '#widget-library',
      title: 'Bibliothèque de widgets',
      description:
        'Glissez un widget (KPI, graphique, tableau ou texte) sur la grille pour commencer a construire votre tableau de bord.',
      position: 'right',
    },
    {
      selector: '#dashboard-grid',
      title: 'Votre grille',
      description:
        'Deposez les widgets ici. Cliquez sur un widget pour le configurer (source de données, type de graphique, titre...).',
      position: 'left',
    },
    {
      selector: 'app-action-bar',
      title: "Barre d'actions",
      description:
        'Enregistrez, ouvrez ou exportez votre tableau de bord. Le menu "Templates" du canevas permet de partir d\'un modèle pré-construit.',
      position: 'bottom',
    },
  ],
};

// ─── Tour registry ─────────────────────────────────────────────────────

/**
 * Metadata shared with the /guide page to render the "visites guidées" section
 * (status badge + restart link per tour). Includes tours whose full config is
 * defined inside an app (e.g. Builder) and are therefore not exported from
 * this module.
 *
 * Keep `version` in sync with the `version` of each TourConfig so that the
 * /guide page displays "Non joué" to users who completed an older version.
 *
 * `appPath` is the path to the app index relative to the deployed site root
 * (e.g. `/apps/builder/`). The /guide page appends `?tour=restart` to restart.
 */
export interface TourRegistryEntry {
  id: string;
  label: string;
  version: number;
  appPath: string;
}

export const TOURS_REGISTRY: TourRegistryEntry[] = [
  { id: 'builder', label: 'Builder', version: 1, appPath: '/apps/builder/' },
  { id: 'builder-ia', label: 'Builder IA', version: 1, appPath: '/apps/builder-ia/' },
  { id: 'builder-carto', label: 'Builder Carto', version: 1, appPath: '/apps/builder-carto/' },
  { id: 'sources', label: 'Sources', version: 1, appPath: '/apps/sources/' },
  { id: 'playground', label: 'Playground', version: 1, appPath: '/apps/playground/' },
  { id: 'dashboard', label: 'Dashboard', version: 1, appPath: '/apps/dashboard/' },
];
