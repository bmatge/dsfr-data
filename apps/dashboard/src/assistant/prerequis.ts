/**
 * Prérequis du dashboard (#1007, ADR-143 §5) : règles nommées, citées par
 * `data-prerequis` dans le balisage de la modale de configuration. Un réglage
 * de widget n'existe que si le tableau de bord porte un widget de ce type :
 * l'assistant montre alors l'item de la bibliothèque à glisser sur la grille.
 *
 * `check:reperes` lit ce fichier STATIQUEMENT (sans l'importer) : les clés de
 * `PREREQUIS` et leur `repereQuiLeve` doivent rester des littéraux.
 */
import type { PrerequisParId } from '@dsfr-data/shared';
import { isBuilderChart, isFavoriteChart, type AppState, type WidgetType } from '../state.js';

/** Le tableau de bord porte-t-il un widget de ce type ? */
function aUnWidget(etat: AppState, type: WidgetType): boolean {
  return etat.dashboard.widgets.some((w) => w.type === type);
}

export const PREREQUIS = {
  'widget-kpi': {
    message: "Glissez d'abord un widget KPI sur la grille.",
    repereQuiLeve: 'dashboard.bibliotheque.kpi',
    verifier: (etat) => aUnWidget(etat, 'kpi'),
  },
  'widget-graphique': {
    message:
      "Glissez d'abord un widget Graphique sur la grille : un graphique issu des favoris ou de l'assistant garde sa configuration d'origine.",
    repereQuiLeve: 'dashboard.bibliotheque.graphique',
    verifier: (etat) =>
      etat.dashboard.widgets.some(
        (w) => w.type === 'chart' && !isFavoriteChart(w.config) && !isBuilderChart(w.config)
      ),
  },
  'widget-tableau': {
    message: "Glissez d'abord un widget Tableau sur la grille.",
    repereQuiLeve: 'dashboard.bibliotheque.tableau',
    verifier: (etat) => aUnWidget(etat, 'table'),
  },
  'widget-texte': {
    message: "Glissez d'abord un widget Texte sur la grille.",
    repereQuiLeve: 'dashboard.bibliotheque.texte',
    verifier: (etat) => aUnWidget(etat, 'text'),
  },
} satisfies PrerequisParId<AppState>;
