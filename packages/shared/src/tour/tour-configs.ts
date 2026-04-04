/**
 * Product tour configurations for all apps.
 * Each app imports its own config and calls startTourIfFirstVisit().
 */

import type { TourConfig } from '../ui/product-tour.js';

// ─── Sources ───────────────────────────────────────────────────────────

export const SOURCES_TOUR: TourConfig = {
  id: 'sources',
  steps: [
    {
      selector: '#add-connection-btn',
      title: 'Connecter une base de donnees',
      description:
        'Ajoutez une connexion a une base Grist ou une API publique (data.gouv.fr, OpenDataSoft...) pour acceder a vos donnees.',
      position: 'right',
    },
    {
      selector: '#add-source-btn',
      title: 'Creer une source manuelle',
      description:
        "Pas d'API ? Creez une source en collant du JSON, en important un CSV, ou en saisissant un tableau directement.",
      position: 'right',
    },
    {
      selector: '#main-content',
      title: 'Explorer et previsualiser',
      description:
        'Selectionnez une connexion pour parcourir ses tables et previsualiser les donnees avant de les utiliser dans le Builder.',
      position: 'left',
    },
  ],
};

// ─── Builder IA ────────────────────────────────────────────────────────

export const BUILDER_IA_TOUR: TourConfig = {
  id: 'builder-ia',
  steps: [
    {
      selector: '#saved-source',
      title: 'Choisissez une source',
      description:
        "Selectionnez une source de donnees dans la liste. Vous pouvez aussi choisir un jeu de donnees d'exemple pour essayer tout de suite.",
      position: 'bottom',
    },
    {
      selector: '#chat-input',
      title: 'Decrivez votre graphique',
      description:
        'Ecrivez en francais ce que vous voulez : "un graphique en barres de la population par region", "un camembert du budget"... L\'IA genere le code.',
      position: 'top',
    },
    {
      selector: 'app-preview-panel',
      title: 'Resultat et code',
      description:
        'Le graphique genere s\'affiche ici. Basculez sur l\'onglet "Code" pour copier le HTML pret a integrer.',
      position: 'left',
    },
  ],
};

// ─── Builder Carto ─────────────────────────────────────────────────────

export const BUILDER_CARTO_TOUR: TourConfig = {
  id: 'builder-carto',
  steps: [
    {
      selector: '#btn-add-layer',
      title: 'Ajouter une couche',
      description:
        'Cliquez ici pour ajouter une couche de donnees sur la carte : marqueurs, zones colorees, cercles proportionnels ou carte de chaleur.',
      position: 'bottom',
    },
    {
      selector: '.carto-col-config',
      title: 'Configurer la couche',
      description:
        "Choisissez la source de donnees, le type de couche, le champ geographique et les options d'affichage (popup, couleur, clustering...).",
      position: 'right',
    },
    {
      selector: '#btn-execute',
      title: 'Previsualiser',
      description:
        'Cliquez sur "Executer" pour voir la carte en direct. Modifiez et re-executez autant de fois que necessaire.',
      position: 'bottom',
    },
    {
      selector: 'app-preview-panel',
      title: 'Carte et code',
      description:
        'La carte s\'affiche ici. L\'onglet "Code" contient le HTML pret a copier-coller dans votre site.',
      position: 'left',
    },
  ],
};

// ─── Playground ────────────────────────────────────────────────────────

export const PLAYGROUND_TOUR: TourConfig = {
  id: 'playground',
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
      title: 'Executer',
      description:
        'Cliquez pour voir le rendu en direct dans le panneau de droite. Le resultat se met a jour a chaque execution.',
      position: 'bottom',
    },
    {
      selector: '#preview-frame',
      title: 'Apercu en direct',
      description:
        'Le rendu de votre code s\'affiche ici. Utilisez les boutons "Copier" ou "+ Deps" pour obtenir un code autonome.',
      position: 'left',
    },
  ],
};

// ─── Dashboard ─────────────────────────────────────────────────────────

export const DASHBOARD_TOUR: TourConfig = {
  id: 'dashboard',
  steps: [
    {
      selector: '#widget-library',
      title: 'Bibliotheque de widgets',
      description:
        'Glissez un widget (KPI, graphique, tableau ou texte) sur la grille pour commencer a construire votre tableau de bord.',
      position: 'right',
    },
    {
      selector: '#dashboard-grid',
      title: 'Votre grille',
      description:
        'Deposez les widgets ici. Cliquez sur un widget pour le configurer (source de donnees, type de graphique, titre...).',
      position: 'left',
    },
    {
      selector: '.vde-toolbar',
      title: "Barre d'outils",
      description:
        'Sauvegardez, chargez ou exportez votre tableau de bord. Utilisez "Templates" pour partir d\'un modele pre-construit.',
      position: 'bottom',
    },
  ],
};
