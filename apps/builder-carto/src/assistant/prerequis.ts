/**
 * Prérequis de l'interface carto (#997, ADR-143 §5) : règles nommées, citées par
 * `data-prerequis` dans le balisage.
 *
 * `check:reperes` lit ce fichier STATIQUEMENT (sans l'importer) : les clés de
 * `PREREQUIS` et leur `repereQuiLeve` doivent rester des littéraux. Tout
 * prérequis cité sans règle ici, ou dont le repère qui le lève est absent du
 * registre, fait échouer la CI.
 */
import type { PrerequisParId } from '@dsfr-data/shared';
import type { CartoState } from '../state.js';

export const PREREQUIS = {
  'couche-active': {
    message: "Avant de régler l'affichage des éléments, sélectionnez une couche.",
    repereQuiLeve: 'carto.couches',
    verifier: (etat) => etat.layers.some((l) => l.id === etat.activeLayerId),
  },
} satisfies PrerequisParId<CartoState>;
