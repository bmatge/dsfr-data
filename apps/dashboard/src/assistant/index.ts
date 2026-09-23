/**
 * Assistant contextuel du tableau de bord (#1018, epic #993, ADR-143).
 *
 * Même câblage que la carto (`apps/builder-carto/src/assistant/index.ts`) :
 *
 * 1. la correspondance locale (`trouverRepere`), TOUJOURS, sans modèle : un
 *    réglage de widget absent du tableau montre d'abord l'item de la
 *    bibliothèque à glisser (prérequis `widget-<type>`) ;
 * 2. Albert en secours (`brancherAlbert`), seulement s'il est configuré ;
 *    sinon « Guidage dans l'interface ».
 *
 * Les constats sont ceux du volet Diagnostic (règles génériques, évaluées sur
 * l'aperçu en iframe, toutes chaînes de widgets confondues).
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
import type { AppState } from '../state.js';
import { PREREQUIS } from './prerequis.js';
import { REGISTRE } from './reperes.generated.js';

/** Phrase d'aide de l'état vide, propre au tableau de bord. */
export const AIDE_DASHBOARD =
  'Demandez où se trouve un réglage du tableau de bord ou d’un widget : je l’ouvre et je le désigne. Une suggestion remplit le champ, sans l’envoyer.';

/** Profil du tableau de bord pour le prompt d'Albert. */
export const PROFIL_DASHBOARD: ProfilAssistant<AppState> = {
  nom: 'l’éditeur de tableau de bord (« Créer un tableau de bord »)',
  description:
    'L’usager compose une page de tableau de bord : une grille de lignes et de cellules où il glisse des widgets (KPI, graphique, tableau, texte), chacun réglé dans une fenêtre de configuration.',
  panneaux: [
    'Bibliothèque de widgets',
    'Sources',
    'Grille',
    'Tableau de bord',
    'Configurer le widget',
  ],
  prerequis: PREREQUIS,
};

/**
 * Suggestions de l'état vide (au plus 3), selon le tableau en cours. Chacune
 * mène à un repère par la seule correspondance locale (test-garde).
 */
export function suggestionsDashboard(etat: AppState): SuggestionAssistant[] {
  const widgets = etat.dashboard.widgets;
  if (widgets.length === 0) {
    return [
      { texte: 'Ajouter un widget KPI' },
      { texte: 'Modèles de tableau de bord' },
      { texte: 'Changer le titre du tableau de bord' },
    ];
  }
  return [
    widgets.some((w) => w.type === 'kpi')
      ? { texte: 'Format du KPI' }
      : { texte: 'Ajouter un widget KPI' },
    { texte: 'Ajouter une ligne' },
    { texte: 'Enregistrer le tableau de bord' },
  ];
}

/** En-tête du diagnostic transmis au Studio par « Construire pour moi ». */
export const ENTETE_PASSATION_STUDIO = 'Tableau de bord en cours dans « Créer un tableau de bord »';

/** Passation « Construire pour moi » : le diagnostic, puis le Studio (sans envoi). */
export function construireDansLeStudio(
  texteDiagnostic: string,
  naviguer: (href: string) => void = (href) => {
    window.location.href = href;
  }
): void {
  transmettreDiagnostic(`${ENTETE_PASSATION_STUDIO}\n\n${texteDiagnostic}`);
  naviguer(appHref('studio', { from: 'dashboard' }));
}

export interface OptionsAssistantDashboard {
  adaptateur: AdaptateurReperage<AppState>;
  /** Volet Diagnostic monté par l'app : constats, texte, ouverture. */
  diagnostic: MountedDiagnostic | null;
  /** Repli explicite (tests). Absent : Albert s'il est utilisable. */
  repondre?: (contexte: ContexteAssistant) => Promise<Reponse>;
  /** Transport d'Albert (tests : `post` mocké). Défaut : `resolveTransport()`. */
  transport?: () => Promise<TransportAssistant>;
  naviguer?: (href: string) => void;
  host?: HTMLElement;
}

/** Monte l'assistant du tableau de bord. */
export function monterAssistantDashboard(opts: OptionsAssistantDashboard): MountedAssistant {
  const { adaptateur, diagnostic } = opts;
  const assistant = mountAssistant<AppState>({
    app: 'dashboard',
    registre: REGISTRE,
    adaptateur,
    constats: () => diagnostic?.constats() ?? [],
    ...(opts.repondre ? { repondre: opts.repondre } : {}),
    suggestions: () => suggestionsDashboard(adaptateur.etat()),
    aide: AIDE_DASHBOARD,
    ouvrirDiagnostic: diagnostic ? () => diagnostic.panel.toggle(true) : undefined,
    diagnostic: diagnostic?.panel,
    construire: () => construireDansLeStudio(diagnostic?.text() ?? '', opts.naviguer),
    host: opts.host,
  });
  if (!opts.repondre) {
    void brancherAlbert(assistant, {
      registre: REGISTRE,
      adaptateur,
      profil: PROFIL_DASHBOARD,
      transport: opts.transport,
    });
  }
  return assistant;
}

/** « Me montrer » du volet Diagnostic : le même `montrer()` que l'assistant. */
export function montrerRepereDashboard(
  id: string,
  adaptateur: AdaptateurReperage<AppState>
): Promise<ResultatMontrer> {
  return montrer(id, { registre: REGISTRE, adaptateur });
}
