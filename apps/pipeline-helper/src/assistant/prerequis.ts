/**
 * Prérequis du pipeline (#1008, ADR-143 §5) : règles nommées, citées par les
 * repères des contrôles de nœud (`reperes-donnees.ts`, `data-prerequis` des
 * gabarits). Un contrôle d'étape n'existe que si une étape de ce type est sur
 * le canevas : l'assistant montre d'abord le bouton qui l'ajoute.
 *
 * `check:reperes` lit ce fichier STATIQUEMENT (sans l'importer) : les clés de
 * `PREREQUIS` et leur `repereQuiLeve` doivent rester des littéraux.
 */
import type { PrerequisParId } from '@dsfr-data/shared';

/** Ce que les prérequis lisent : les types des nœuds présents sur le canevas. */
export interface EtatPipeline {
  readonly types: readonly string[];
}

export const PREREQUIS = {
  'noeud-source': {
    message: "Ajoutez d'abord une étape Source.",
    repereQuiLeve: 'pipeline.actions.ajouter-source',
    verifier: (etat) => etat.types.includes('source'),
  },
  'noeud-normalize': {
    message: "Ajoutez d'abord une étape Normaliser.",
    repereQuiLeve: 'pipeline.actions.ajouter-normalisation',
    verifier: (etat) => etat.types.includes('normalize'),
  },
  'noeud-query': {
    message: "Ajoutez d'abord une étape Requêter.",
    repereQuiLeve: 'pipeline.actions.ajouter-requete',
    verifier: (etat) => etat.types.includes('query'),
  },
  'noeud-join': {
    message: "Ajoutez d'abord une étape Joindre.",
    repereQuiLeve: 'pipeline.actions.ajouter-jointure',
    verifier: (etat) => etat.types.includes('join'),
  },
  'noeud-search': {
    message: "Ajoutez d'abord une étape Rechercher.",
    repereQuiLeve: 'pipeline.actions.ajouter-recherche',
    verifier: (etat) => etat.types.includes('search'),
  },
  'noeud-facets': {
    message: "Ajoutez d'abord une étape Facettes.",
    repereQuiLeve: 'pipeline.actions.ajouter-facettes',
    verifier: (etat) => etat.types.includes('facets'),
  },
  'noeud-output': {
    message: "Ajoutez d'abord une étape Sortie.",
    repereQuiLeve: 'pipeline.actions.ajouter-sortie',
    verifier: (etat) => etat.types.includes('output'),
  },
} satisfies PrerequisParId<EtatPipeline>;
