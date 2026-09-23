/**
 * Assistant contextuel de la carto (#1016, epic #993, ADR-143).
 *
 * Branche `mountAssistant()` (packages/shared/src/ui/mount-assistant.ts) sur
 * la carto : le registre généré, l'adaptateur de révélation (#1005), les
 * constats du volet Diagnostic et la passation « Construire pour moi » vers le
 * Studio.
 *
 * Répondre, dans cet ordre :
 *
 * 1. la correspondance locale (`trouverRepere`, #1012), TOUJOURS, sans modèle :
 *    « afficher les POI dans une fiche » montre « Comportement au clic » sans
 *    appel réseau ;
 * 2. Albert en secours (#1014, #1018), appelé seulement quand rien ne
 *    correspond : `brancherAlbert()` résout le transport au montage et ne
 *    branche le modèle que s'il est utilisable (clé ou jeton serveur, et
 *    tool-calling). Sinon le guidage reste local, sans clé, et le panneau dit
 *    « Guidage dans l'interface ». Un `repondre` passé explicitement (tests)
 *    remplace ce branchement.
 */
import {
  appHref,
  brancherAlbert,
  montrer,
  mountAssistant,
  transmettreDiagnostic,
  type AdaptateurReperage,
  type ContexteAssistant,
  type MatchableSkill,
  type ProfilAssistant,
  type MountedAssistant,
  type MountedDiagnostic,
  type Reponse,
  type ResultatMontrer,
  type SuggestionAssistant,
  type TransportAssistant,
} from '@dsfr-data/shared';
import type { CartoState } from '../state.js';
import { PREREQUIS } from './prerequis.js';
import { REGISTRE } from './reperes.generated.js';

/** Profil de la carto pour le prompt d'Albert (#1018). */
export const PROFIL_CARTO: ProfilAssistant<CartoState> = {
  nom: 'le builder carto (« Créer une carte »)',
  description:
    'L’usager compose une carte DSFR : des couches de points ou de zones, alimentées par une source, avec leur représentation, leur couleur et leur fiche au clic.',
  panneaux: ['Couches', 'Éléments', 'Carte', 'Code'],
  prerequis: PREREQUIS,
};

/** Phrase d'aide de l'état vide, propre à la carto. */
export const AIDE_CARTO =
  'Demandez où se trouve un réglage de la carte : je déplie le bon panneau et je le désigne. Une suggestion remplit le champ, sans l’envoyer.';

/**
 * Suggestions de l'état vide (au plus 3), selon l'état de la carte. Chacune
 * mène à un repère par la seule correspondance locale (test-garde).
 */
export function suggestionsCarto(etat: CartoState): SuggestionAssistant[] {
  const active = etat.layers.find((l) => l.id === etat.activeLayerId);
  if (!active?.source) {
    return [
      { texte: 'Où choisir les données de la couche ?' },
      { texte: 'Afficher les DROM en vignettes' },
      { texte: 'Ajouter une couche' },
    ];
  }
  if (active.type === 'geoshape') {
    return [
      { texte: 'Colorer les zones selon une valeur' },
      { texte: 'Afficher une fiche au clic sur un élément' },
      { texte: 'Afficher les DROM en vignettes' },
    ];
  }
  return [
    { texte: 'Afficher une fiche au clic sur un élément' },
    { texte: 'Regrouper les points proches' },
    { texte: 'Afficher les DROM en vignettes' },
  ];
}

/** En-tête du diagnostic transmis au Studio par « Construire pour moi ». */
export const ENTETE_PASSATION_STUDIO = 'Carte en cours dans « Créer une carte »';

/**
 * Passation « Construire pour moi » : dépose le diagnostic (le pipeline de la
 * carte, ses attributs et ses constats, tel que « Copier le diagnostic » le
 * rend) puis ouvre le Studio, qui le pose dans son champ sans l'envoyer
 * (`recupererDiagnostic()` dans `apps/studio/src/main.ts`).
 */
export function construireDansLeStudio(
  texteDiagnostic: string,
  naviguer: (href: string) => void = (href) => {
    window.location.href = href;
  }
): void {
  transmettreDiagnostic(`${ENTETE_PASSATION_STUDIO}\n\n${texteDiagnostic}`);
  naviguer(appHref('studio', { from: 'builder-carto' }));
}

export interface OptionsAssistantCarto {
  adaptateur: AdaptateurReperage<CartoState>;
  /** Volet Diagnostic monté par l'app : constats, texte, ouverture. */
  diagnostic: MountedDiagnostic | null;
  /**
   * Repli quand la correspondance locale ne trouve rien. Absent : Albert, s'il
   * est utilisable (`brancherAlbert`) ; sinon aucun.
   */
  repondre?: (contexte: ContexteAssistant) => Promise<Reponse>;
  /** Transport d'Albert (tests : `post` mocké). Défaut : `resolveTransport()`. */
  transport?: () => Promise<TransportAssistant>;
  /** Fiches skills liées aux repères par `data-attribut`. */
  fiches?: readonly MatchableSkill[];
  /** Navigation (tests) ; par défaut `window.location.href = …`. */
  naviguer?: (href: string) => void;
  host?: HTMLElement;
}

/** Monte l'assistant de la carto. */
export function monterAssistantCarto(opts: OptionsAssistantCarto): MountedAssistant {
  const { adaptateur, diagnostic } = opts;
  const assistant = mountAssistant<CartoState>({
    app: 'builder-carto',
    registre: REGISTRE,
    adaptateur,
    constats: () => diagnostic?.constats() ?? [],
    ...(opts.repondre ? { repondre: opts.repondre } : {}),
    fiches: opts.fiches,
    suggestions: () => suggestionsCarto(adaptateur.etat()),
    aide: AIDE_CARTO,
    ouvrirDiagnostic: diagnostic ? () => diagnostic.panel.toggle(true) : undefined,
    construire: () => construireDansLeStudio(diagnostic?.text() ?? '', opts.naviguer),
    host: opts.host,
  });
  if (!opts.repondre) {
    void brancherAlbert(assistant, {
      registre: REGISTRE,
      adaptateur,
      profil: PROFIL_CARTO,
      fiches: opts.fiches,
      transport: opts.transport,
    });
  }
  return assistant;
}

/** « Me montrer » du volet Diagnostic : le même `montrer()` que l'assistant. */
export function montrerRepereCarto(
  id: string,
  adaptateur: AdaptateurReperage<CartoState>
): Promise<ResultatMontrer> {
  return montrer(id, { registre: REGISTRE, adaptateur });
}
