/**
 * Product tour configuration for the Builder app.
 */

import type { TourConfig } from '@dsfr-data/shared';

/** Open a collapsed section by ID */
function openSection(sectionId: string): void {
  const section = document.getElementById(sectionId);
  if (section?.classList.contains('collapsed')) {
    section.classList.remove('collapsed');
  }
}

export const BUILDER_TOUR: TourConfig = {
  id: 'builder',
  steps: [
    {
      selector: '#section-source',
      title: 'Vos donnees',
      description:
        "Commencez ici : choisissez une source de donnees existante, ou cliquez sur une des cartes d'exemple pour essayer tout de suite.",
      position: 'right',
      onBeforeShow: () => openSection('section-source'),
    },
    {
      selector: '.chart-type-grid',
      title: 'Type de graphique',
      description:
        'Choisissez parmi 11 types : barres, lignes, camembert, carte, KPI, tableau... Le type adapte automatiquement les options disponibles.',
      position: 'right',
      onBeforeShow: () => openSection('section-type'),
    },
    {
      selector: '#section-data',
      title: 'Configuration',
      description:
        'Selectionnez les champs a afficher (axe X et axe Y). Les options avancees (filtres, agregations) sont accessibles via le mode avance.',
      position: 'right',
      onBeforeShow: () => openSection('section-data'),
    },
    {
      selector: '#generate-btn',
      title: 'Generer !',
      description:
        'Cliquez ici pour voir le resultat. Vous pouvez modifier et re-generer autant de fois que necessaire.',
      position: 'right',
    },
    {
      selector: 'app-preview-panel',
      title: 'Apercu et code',
      description:
        'Le graphique s\'affiche ici. Basculez sur l\'onglet "Code genere" pour copier le HTML pret a integrer dans votre site.',
      position: 'left',
    },
  ],
};
