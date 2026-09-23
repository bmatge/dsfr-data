/**
 * Visite guidée du builder graphique, exprimée en repères (#1013, ADR-143).
 *
 * Chaque étape cite un repère du registre (`../assistant/reperes.generated.ts`,
 * vérifié par `check:reperes`, règle 6) ; l'adaptateur de révélation ouvre la
 * section repliée qui le porte avant l'affichage — le même geste que
 * « Me montrer », là où la visite appelait `openSection` elle-même.
 */

import type { TourConfig } from '@dsfr-data/shared';
import { creerAdaptateurBuilder } from '../assistant/adaptateur.js';

export const BUILDER_TOUR: TourConfig = {
  id: 'builder',
  label: 'Builder',
  version: 1,
  // Créé à la demande : le module se charge aussi hors navigateur (tests).
  adaptateur: { reveler: (id) => creerAdaptateurBuilder().reveler(id) },
  steps: [
    {
      repere: 'builder.source',
      title: 'Vos données',
      description:
        "Commencez ici : choisissez une source de données existante dans la liste déroulante. Pas encore de source ? Créez-en une depuis l'app Sources.",
      position: 'right',
    },
    {
      repere: 'builder.type',
      title: 'Type de graphique',
      description:
        'Choisissez parmi 11 types : barres, lignes, camembert, carte, KPI, tableau... Le type adapte automatiquement les options disponibles.',
      position: 'right',
    },
    {
      repere: 'builder.donnees',
      title: 'Configuration',
      description:
        'Sélectionnez les champs a afficher (axe X et axe Y). Les options avancees (filtres, agrégations) sont accessibles via le mode avance.',
      position: 'right',
    },
    {
      repere: 'builder.actions.generer',
      title: 'Générer !',
      description:
        'Cliquez ici pour voir le resultat. Vous pouvez modifier et re-générer autant de fois que necessaire.',
      position: 'right',
    },
    {
      repere: 'builder.actions.copier',
      title: 'Aperçu et code',
      description:
        'Le graphique s\'affiche dans l\'aperçu, à droite. "Copier le code" copie le HTML pret a integrer dans votre site ; l\'onglet "Code" de l\'aperçu le montre.',
      position: 'bottom',
    },
  ],
};
