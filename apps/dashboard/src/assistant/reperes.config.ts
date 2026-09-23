/**
 * Repères du dashboard (#1007, epic #992, ADR-143).
 *
 * Lu par `npm run build:reperes` / `check:reperes`, qui génèrent
 * `reperes.generated.ts` à côté. Contrat : `ReperesConfig` dans
 * `packages/shared/src/ui/reperes-types.ts`.
 *
 * Zones de réglage : la barre d'actions, la bibliothèque de widgets, les
 * réglages de grille, les sources, le canevas (titre, modèles, onglets, lignes
 * de la grille), la modale de configuration d'un widget et la modale
 * d'enregistrement. Les formulaires par type de widget (`widget-config.ts`) et
 * les boutons de ligne (`grid.ts`) sont des gabarits TS sans ancêtre lexical :
 * c'est `tests/apps/dashboard/reperes-completude.test.ts`, qui REND chaque
 * type de widget, qui les couvre.
 *
 * Hors zones : la liste « Mes tableaux de bord » (une ligne par tableau
 * enregistré, rien à régler) et l'aperçu plein écran.
 */
import type { ReperesConfig } from '@dsfr-data/shared';

const config: ReperesConfig = {
  app: 'dashboard',
  prefixe: 'dashboard',
  sources: ['index.html', 'src/widget-config.ts', 'src/grid.ts'],
  zonesDeReglage: [
    'dashboard.actions',
    'dashboard.bibliotheque',
    'dashboard.grille',
    'dashboard.sources',
    'dashboard.canevas',
    'dashboard.canevas.grille',
    'dashboard.widget',
    'dashboard.widget.kpi',
    'dashboard.widget.graphique',
    'dashboard.widget.tableau',
    'dashboard.widget.texte',
    'dashboard.enregistrement',
  ],
  // Les boutons d'action d'un widget posé (dupliquer, configurer, supprimer)
  // sont créés par createElement dans widgets.ts : invisibles pour la règle
  // lexicale, ils sont déclarés comme exception DE RENDU dans le test de
  // complétude, avec leur raison.
  exceptions: [],
  prerequis: 'src/assistant/prerequis.ts',
  constats: [],
  synonymes: {
    'dashboard.widget.kpi.valeur': ['indicateur', 'chiffre clé', 'calcul'],
    'dashboard.widget.graphique.champ-x': ['axe x', 'abscisse', 'catégories', 'étiquettes'],
    'dashboard.widget.graphique.champ-y': ['axe y', 'ordonnée', 'valeur', 'mesure'],
    'dashboard.widget.graphique.palette': ['couleurs', 'palette'],
    'dashboard.canevas.modeles': ['template', 'gabarit', 'modèle'],
  },
};

export default config;
