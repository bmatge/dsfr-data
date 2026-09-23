/**
 * Assistant contextuel du Pipeline (#1018, epic #993, ADR-143).
 *
 * Même câblage que la carto (`apps/builder-carto/src/assistant/index.ts`) :
 *
 * 1. la correspondance locale (`trouverRepere`), TOUJOURS, sans modèle : un
 *    réglage d'étape absente du canevas montre d'abord le bouton qui l'ajoute
 *    (prérequis `noeud-<type>`) ;
 * 2. Albert en secours (`brancherAlbert`), seulement s'il est configuré ;
 *    sinon « Guidage dans l'interface ».
 *
 * Les constats sont ceux du volet Diagnostic, qui observe le conteneur
 * d'exécution du document (mode live, règles génériques). L'adaptateur
 * sélectionne le nœud dans Rete puis résout le repère à travers son shadow DOM.
 */
import {
  appHref,
  brancherAlbert,
  montrer,
  mountAssistant,
  transmettreDiagnostic,
  type AdaptateurReperage,
  type ContexteAssistant,
  type MountedAssistant,
  type MountedDiagnostic,
  type ProfilAssistant,
  type Reponse,
  type ResultatMontrer,
  type SuggestionAssistant,
  type TransportAssistant,
} from '@dsfr-data/shared';
import { PREREQUIS, type EtatPipeline } from './prerequis.js';
import { REGISTRE } from './reperes.generated.js';

/** Phrase d'aide de l'état vide, propre au Pipeline. */
export const AIDE_PIPELINE =
  'Demandez où se trouve le réglage d’une étape : je sélectionne le nœud et je le désigne. Une suggestion remplit le champ, sans l’envoyer.';

/** Profil du Pipeline pour le prompt d'Albert. */
export const PROFIL_PIPELINE: ProfilAssistant<EtatPipeline> = {
  nom: 'l’éditeur de pipeline (« Pipeline »)',
  description:
    'L’usager relie des étapes (Source, Normaliser, Requêter, Joindre, Rechercher, Facettes, Sortie) sur un canevas, les règle dans leur nœud, puis exécute le pipeline et en copie le code.',
  panneaux: ['Barre d’actions', 'Éditeur du pipeline', 'Panneau latéral'],
  prerequis: PREREQUIS,
};

/**
 * Suggestions de l'état vide (au plus 3), selon les étapes présentes. Chacune
 * mène à un repère par la seule correspondance locale (test-garde).
 */
export function suggestionsPipeline(etat: EtatPipeline): SuggestionAssistant[] {
  if (!etat.types.includes('source')) {
    return [
      { texte: 'Ajouter une source' },
      { texte: 'Ajouter un filtre' },
      { texte: 'Exécuter le pipeline' },
    ];
  }
  return [
    { texte: 'Ajouter un filtre' },
    { texte: 'Grouper par' },
    { texte: 'Exécuter le pipeline' },
  ];
}

/** En-tête du diagnostic transmis au Studio par « Construire pour moi ». */
export const ENTETE_PASSATION_STUDIO = 'Pipeline en cours dans « Pipeline »';

/** Passation « Construire pour moi » : le diagnostic, puis le Studio (sans envoi). */
export function construireDansLeStudio(
  texteDiagnostic: string,
  naviguer: (href: string) => void = (href) => {
    window.location.href = href;
  }
): void {
  transmettreDiagnostic(`${ENTETE_PASSATION_STUDIO}\n\n${texteDiagnostic}`);
  naviguer(appHref('studio', { from: 'pipeline-helper' }));
}

export interface OptionsAssistantPipeline {
  adaptateur: AdaptateurReperage<EtatPipeline>;
  /** Volet Diagnostic monté par l'app : constats, texte, ouverture. */
  diagnostic: MountedDiagnostic | null;
  /** Repli explicite (tests). Absent : Albert s'il est utilisable. */
  repondre?: (contexte: ContexteAssistant) => Promise<Reponse>;
  /** Transport d'Albert (tests : `post` mocké). Défaut : `resolveTransport()`. */
  transport?: () => Promise<TransportAssistant>;
  naviguer?: (href: string) => void;
  host?: HTMLElement;
}

/** Monte l'assistant du Pipeline. */
export function monterAssistantPipeline(opts: OptionsAssistantPipeline): MountedAssistant {
  const { adaptateur, diagnostic } = opts;
  const assistant = mountAssistant<EtatPipeline>({
    app: 'pipeline-helper',
    registre: REGISTRE,
    adaptateur,
    constats: () => diagnostic?.constats() ?? [],
    ...(opts.repondre ? { repondre: opts.repondre } : {}),
    suggestions: () => suggestionsPipeline(adaptateur.etat()),
    aide: AIDE_PIPELINE,
    ouvrirDiagnostic: diagnostic ? () => diagnostic.panel.toggle(true) : undefined,
    construire: () => construireDansLeStudio(diagnostic?.text() ?? '', opts.naviguer),
    host: opts.host,
  });
  if (!opts.repondre) {
    void brancherAlbert(assistant, {
      registre: REGISTRE,
      adaptateur,
      profil: PROFIL_PIPELINE,
      transport: opts.transport,
    });
  }
  return assistant;
}

/** « Me montrer » du volet Diagnostic : le même `montrer()` que l'assistant. */
export function montrerReperePipeline(
  id: string,
  adaptateur: AdaptateurReperage<EtatPipeline>
): Promise<ResultatMontrer> {
  return montrer(id, { registre: REGISTRE, adaptateur });
}
