/**
 * Prérequis du builder graphique (#1006, ADR-143 §5) : règles nommées, citées
 * par `data-prerequis` dans le balisage. Un prérequis manquant n'est jamais un
 * refus : l'assistant montre d'abord le repère qui le lève.
 *
 * `check:reperes` lit ce fichier STATIQUEMENT (sans l'importer) : les clés de
 * `PREREQUIS` et leur `repereQuiLeve` doivent rester des littéraux.
 *
 * `source-chargee` et `champs-choisis` reprennent `getCompleteness()` de
 * `state.ts`, la même mesure que les étapes de l'aperçu : l'assistant et
 * l'interface ne peuvent pas diverger.
 */
import type { PrerequisParId } from '@dsfr-data/shared';
import { getCompleteness, supportsMultiSeries, type BuilderState } from '../state.js';

export const PREREQUIS = {
  'source-chargee': {
    message: "Chargez d'abord une source de données.",
    repereQuiLeve: 'builder.source.choix',
    verifier: (etat) => getCompleteness(etat).source,
  },
  'champs-choisis': {
    message: 'Choisissez les champs à afficher.',
    repereQuiLeve: 'builder.donnees',
    verifier: (etat) => getCompleteness(etat).config,
  },
  'type-multi-series': {
    message: "Ce type n'a qu'une série : passez en barres, lignes ou radar.",
    repereQuiLeve: 'builder.type',
    verifier: (etat) => supportsMultiSeries(etat.chartType),
  },
} satisfies PrerequisParId<BuilderState>;
