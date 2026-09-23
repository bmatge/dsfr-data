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
 * 2. un repli INJECTÉ (`repondre`), appelé seulement quand rien ne correspond.
 *    Aucun n'est branché aujourd'hui : le guidage fonctionne sans clé, et le
 *    panneau dit « Réponses tirées de l'interface, sans IA ». Le repli Albert
 *    (#1014, `assistant-loop.ts`) se branchera ici, en passant `repondre` à
 *    `monterAssistantCarto()` — rien d'autre à changer dans l'app.
 */
import {
  appHref,
  montrer,
  mountAssistant,
  transmettreDiagnostic,
  type AdaptateurReperage,
  type ContexteAssistant,
  type MatchableSkill,
  type MountedAssistant,
  type MountedDiagnostic,
  type Reponse,
  type ResultatMontrer,
  type SuggestionAssistant,
} from '@dsfr-data/shared';
import type { CartoState } from '../state.js';
import { REGISTRE } from './reperes.generated.js';

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
  /** Repli quand la correspondance locale ne trouve rien (Albert, #1014). Absent : aucun. */
  repondre?: (contexte: ContexteAssistant) => Promise<Reponse>;
  /** Fiches skills liées aux repères par `data-attribut`. */
  fiches?: readonly MatchableSkill[];
  /** Navigation (tests) ; par défaut `window.location.href = …`. */
  naviguer?: (href: string) => void;
  host?: HTMLElement;
}

/** Monte l'assistant de la carto. */
export function monterAssistantCarto(opts: OptionsAssistantCarto): MountedAssistant {
  const { adaptateur, diagnostic } = opts;
  return mountAssistant<CartoState>({
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
}

/** « Me montrer » du volet Diagnostic : le même `montrer()` que l'assistant. */
export function montrerRepereCarto(
  id: string,
  adaptateur: AdaptateurReperage<CartoState>
): Promise<ResultatMontrer> {
  return montrer(id, { registre: REGISTRE, adaptateur });
}
