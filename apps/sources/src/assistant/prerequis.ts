/**
 * Prérequis de l'app Sources (#1007, ADR-143 §5) : règles nommées, citées par
 * `data-prerequis` dans le balisage. Un prérequis manquant n'est jamais un
 * refus : l'assistant montre d'abord le repère qui le lève.
 *
 * `check:reperes` lit ce fichier STATIQUEMENT (sans l'importer) : les clés de
 * `PREREQUIS` et leur `repereQuiLeve` doivent rester des littéraux.
 */
import type { PrerequisParId } from '@dsfr-data/shared';
import type { SourcesState } from '../state.js';

/** Ce que les règles lisent : l'état de l'app et l'ouverture du panneau d'aperçu. */
export interface EtatSources {
  app: SourcesState;
  /** Le panneau latéral d'aperçu est-il ouvert ? */
  apercuOuvert: boolean;
}

export const PREREQUIS = {
  'apercu-ouvert': {
    message:
      "Ouvrez d'abord l'aperçu d'une table ou d'un jeu : bouton « Aperçu » d'une ligne de la liste.",
    repereQuiLeve: 'sources.connexions',
    verifier: (etat) => etat.apercuOuvert && etat.app.previewedSource !== null,
  },
  'deux-sources-locales': {
    message: 'Une jointure demande au moins deux jeux de données locaux contenant des données.',
    repereQuiLeve: 'sources.locaux.creer',
    verifier: (etat) => etat.app.sources.filter((s) => s.data && s.data.length > 0).length >= 2,
  },
  'document-grist-choisi': {
    message:
      "Dépliez d'abord une connexion Grist et choisissez son document : le bouton « Créer une table dans Grist » y apparaît.",
    repereQuiLeve: 'sources.connexions',
    verifier: (etat) => !!etat.app.selectedConnectionId && !!etat.app.selectedDocument,
  },
} satisfies PrerequisParId<EtatSources>;
