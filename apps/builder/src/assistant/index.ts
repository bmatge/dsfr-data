/**
 * Assistant contextuel du builder graphique (#1017, epic #993, ADR-143).
 *
 * Même câblage que la carto (`apps/builder-carto/src/assistant/index.ts`) :
 *
 * 1. la correspondance locale (`trouverRepere`), TOUJOURS, sans modèle :
 *    « ajouter une série » sur un camembert montre d'abord le prérequis
 *    `type-multi-series`, donc le choix du type ;
 * 2. Albert en secours (`brancherAlbert`), seulement s'il est configuré (clé
 *    ou jeton serveur, tool-calling) ; sinon « Guidage dans l'interface ».
 *
 * Les constats sont ceux du volet Diagnostic, évalués sur l'aperçu en iframe :
 * règles génériques plus `REGLES_BUILDER` (`./constats.ts`), qui désignent
 * le réglage à corriger (« source vide » → la section Source).
 *
 * L'adaptateur est celui de la visite guidée (`openSection`, #1006) : il ne
 * change jamais l'état du builder.
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
import { getCompleteness, supportsMultiSeries, type BuilderState } from '../state.js';
import { PREREQUIS } from './prerequis.js';
import { REGISTRE } from './reperes.generated.js';

/** Phrase d'aide de l'état vide, propre au builder. */
export const AIDE_BUILDER =
  'Demandez où se trouve un réglage du graphique : j’ouvre la bonne section et je le désigne. Une suggestion remplit le champ, sans l’envoyer.';

/** Profil du builder pour le prompt d'Albert. */
export const PROFIL_BUILDER: ProfilAssistant<BuilderState> = {
  nom: 'le builder graphique (« Créer un graphique »)',
  description:
    'L’usager compose un graphique, un KPI ou un tableau DSFR à partir d’une source enregistrée, puis copie le code généré.',
  panneaux: [
    'Source de données',
    'Type de graphique',
    'Configuration des données',
    'Apparence',
    'Mode de génération',
    'Code',
  ],
  prerequis: PREREQUIS,
};

/**
 * Suggestions de l'état vide (au plus 3), selon l'état du builder. Chacune
 * mène à un repère par la seule correspondance locale (test-garde).
 */
export function suggestionsBuilder(etat: BuilderState): SuggestionAssistant[] {
  const complet = getCompleteness(etat);
  if (!complet.source) {
    return [
      { texte: 'Choisir la source' },
      { texte: "Jeu de données d'exemple" },
      { texte: 'Changer le type de graphique' },
    ];
  }
  if (supportsMultiSeries(etat.chartType)) {
    return [
      { texte: 'Ajouter une série' },
      { texte: 'Changer les couleurs' },
      { texte: "Choisir l'axe x" },
    ];
  }
  return [
    { texte: 'Changer le type de graphique' },
    { texte: 'Changer les couleurs' },
    { texte: "Choisir l'axe x" },
  ];
}

/** En-tête du diagnostic transmis au Studio par « Construire pour moi ». */
export const ENTETE_PASSATION_STUDIO = 'Graphique en cours dans « Créer un graphique »';

/** Passation « Construire pour moi » : le diagnostic, puis le Studio (sans envoi). */
export function construireDansLeStudio(
  texteDiagnostic: string,
  naviguer: (href: string) => void = (href) => {
    window.location.href = href;
  }
): void {
  transmettreDiagnostic(`${ENTETE_PASSATION_STUDIO}\n\n${texteDiagnostic}`);
  naviguer(appHref('studio', { from: 'builder' }));
}

export interface OptionsAssistantBuilder {
  adaptateur: AdaptateurReperage<BuilderState>;
  /** Volet Diagnostic monté par l'app : constats, texte, ouverture. */
  diagnostic: MountedDiagnostic | null;
  /** Repli explicite (tests). Absent : Albert s'il est utilisable. */
  repondre?: (contexte: ContexteAssistant) => Promise<Reponse>;
  /** Transport d'Albert (tests : `post` mocké). Défaut : `resolveTransport()`. */
  transport?: () => Promise<TransportAssistant>;
  naviguer?: (href: string) => void;
  host?: HTMLElement;
}

/** Monte l'assistant du builder graphique. */
export function monterAssistantBuilder(opts: OptionsAssistantBuilder): MountedAssistant {
  const { adaptateur, diagnostic } = opts;
  const assistant = mountAssistant<BuilderState>({
    app: 'builder',
    registre: REGISTRE,
    adaptateur,
    constats: () => diagnostic?.constats() ?? [],
    ...(opts.repondre ? { repondre: opts.repondre } : {}),
    suggestions: () => suggestionsBuilder(adaptateur.etat()),
    aide: AIDE_BUILDER,
    ouvrirDiagnostic: diagnostic ? () => diagnostic.panel.toggle(true) : undefined,
    diagnostic: diagnostic?.panel,
    construire: () => construireDansLeStudio(diagnostic?.text() ?? '', opts.naviguer),
    host: opts.host,
  });
  if (!opts.repondre) {
    void brancherAlbert(assistant, {
      registre: REGISTRE,
      adaptateur,
      profil: PROFIL_BUILDER,
      transport: opts.transport,
    });
  }
  return assistant;
}

/** « Me montrer » du volet Diagnostic : le même `montrer()` que l'assistant. */
export function montrerRepereBuilder(
  id: string,
  adaptateur: AdaptateurReperage<BuilderState>
): Promise<ResultatMontrer> {
  return montrer(id, { registre: REGISTRE, adaptateur });
}
