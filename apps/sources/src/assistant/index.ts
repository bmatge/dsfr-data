/**
 * Assistant contextuel de l'app Sources (#1018, epic #993, ADR-143).
 *
 * Guidage SEUL : la page ne rend aucun pipeline, elle n'a donc ni volet
 * Diagnostic ni constats (ARCHITECTURE §3.8), et pas de passation vers le
 * Studio. L'assistant montre où se trouve un réglage (connexion Grist, clé
 * API, jointure, saisie manuelle…) :
 *
 * 1. la correspondance locale (`trouverRepere`), TOUJOURS, sans modèle ;
 * 2. Albert en secours (`brancherAlbert`), seulement s'il est configuré ;
 *    sinon « Guidage dans l'interface ».
 */
import {
  brancherAlbert,
  mountAssistant,
  type AdaptateurReperage,
  type ContexteAssistant,
  type MountedAssistant,
  type ProfilAssistant,
  type Reponse,
  type SuggestionAssistant,
  type TransportAssistant,
} from '@dsfr-data/shared';
import { PREREQUIS, type EtatSources } from './prerequis.js';
import { REGISTRE } from './reperes.generated.js';

/** Phrase d'aide de l'état vide, propre aux Sources. */
export const AIDE_SOURCES =
  'Demandez où se fait un réglage de vos sources : j’ouvre la bonne fenêtre et je le désigne. Une suggestion remplit le champ, sans l’envoyer.';

/** Profil des Sources pour le prompt d'Albert. */
export const PROFIL_SOURCES: ProfilAssistant<EtatSources> = {
  nom: 'la page Sources',
  description:
    'L’usager déclare des connexions (Grist, API REST, data.gouv…) et des jeux de données locaux (saisis, importés, joints), réutilisés ensuite par les builders.',
  panneaux: [
    'Actions sur les sources',
    'Connexions',
    'Jeux de données locaux',
    'Aperçu des données',
  ],
  prerequis: PREREQUIS,
  consignes: 'Cette page n’a pas de volet Diagnostic : ne parle pas de constats.',
};

/**
 * Suggestions de l'état vide (au plus 3). Chacune mène à un repère par la
 * seule correspondance locale (test-garde).
 */
export function suggestionsSources(etat: EtatSources): SuggestionAssistant[] {
  const locaux = etat.app.sources.filter((s) => s.data && s.data.length > 0).length;
  return [
    { texte: 'Connecter une API' },
    { texte: 'Saisir des données' },
    { texte: locaux >= 2 ? 'Croiser deux sources' : 'Ajouter une connexion Grist' },
  ];
}

export interface OptionsAssistantSources {
  adaptateur: AdaptateurReperage<EtatSources>;
  /** Repli explicite (tests). Absent : Albert s'il est utilisable. */
  repondre?: (contexte: ContexteAssistant) => Promise<Reponse>;
  /** Transport d'Albert (tests : `post` mocké). Défaut : `resolveTransport()`. */
  transport?: () => Promise<TransportAssistant>;
  host?: HTMLElement;
}

/** Monte l'assistant des Sources (sans volet Diagnostic). */
export function monterAssistantSources(opts: OptionsAssistantSources): MountedAssistant {
  const { adaptateur } = opts;
  const assistant = mountAssistant<EtatSources>({
    app: 'sources',
    registre: REGISTRE,
    adaptateur,
    ...(opts.repondre ? { repondre: opts.repondre } : {}),
    suggestions: () => suggestionsSources(adaptateur.etat()),
    aide: AIDE_SOURCES,
    host: opts.host,
  });
  if (!opts.repondre) {
    void brancherAlbert(assistant, {
      registre: REGISTRE,
      adaptateur,
      profil: PROFIL_SOURCES,
      transport: opts.transport,
    });
  }
  return assistant;
}
