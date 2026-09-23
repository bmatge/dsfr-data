/**
 * Assistant contextuel du Playground (#1018, epic #993, ADR-143).
 *
 * Même câblage que la carto (`apps/builder-carto/src/assistant/index.ts`),
 * avec deux sortes de constats et deux sortes de repères :
 *
 * - constats STATIQUES (analyse du balisage, `REGLE_BALISAGE`) et DYNAMIQUES
 *   (règles génériques sur la trace de l'aperçu), tous lus dans le volet
 *   Diagnostic ;
 * - repères d'INTERFACE (registre généré) montrés par `montrer()`, et repères
 *   de CODE (`playground.ligne.<n>.<balise>[.<attribut>]`) montrés par
 *   `montrerCode()`, qui pose le curseur sur la ligne en cause. Ceux-ci ne
 *   sont pas au registre (le code change à chaque frappe) : `mountAssistant`
 *   les confie à `montrerHorsRegistre`.
 *
 * Répondre (#1105) : la correspondance locale sur le registre d'abord, puis
 * sur le CODE courant (`correspondance-code.ts` : « changer la limite de 15 »
 * → la ligne `limit="15"`), Albert en secours s'il est configuré
 * (`brancherAlbert`), sinon « Guidage dans l'interface ». Albert reçoit le
 * plan du code et peut citer un repère de code, que `libelleRepereCode`
 * valide sur le code courant avant qu'il soit montré.
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
  type SuggestionAssistant,
  type TransportAssistant,
} from '@dsfr-data/shared';
import type { CodeMirrorEditor } from '../editor.js';
import { lireRepereCode, montrerCode, REPERE_EDITEUR, type EtatPlayground } from './adaptateur.js';
import { correspondanceCode, libelleRepereCode, planDuCode } from './correspondance-code.js';
import { REGISTRE } from './reperes.generated.js';

/** Phrase d'aide de l'état vide, propre au Playground. */
export const AIDE_PLAYGROUND =
  'Demandez où se trouve un réglage du Playground ou une ligne du code (« changer la limite de 15 »), ou ouvrez un constat : je pose le curseur sur la ligne en cause. Une suggestion remplit le champ, sans l’envoyer.';

/** Profil du Playground pour le prompt d'Albert. */
export const PROFIL_PLAYGROUND: ProfilAssistant<EtatPlayground> = {
  nom: 'le Playground',
  description:
    'L’usager édite librement le code HTML d’une page dsfr-data, l’exécute dans l’aperçu et en lit les constats (analyse du balisage et trace d’exécution).',
  panneaux: ['Barre d’actions', 'Parcourir les exemples', 'Éditeur de code', 'Aperçu'],
  consignes:
    'Quand la question porte sur le code (une balise, un attribut, une valeur), montre la ligne en cause : passe à montrer l’identifiant de repère de code du plan (playground.ligne.<n>.<balise>, ou .<attribut> en plus), jamais un numéro inventé. Explique en une phrase quoi changer, sans réécrire le code.',
  contexte: (etat) => planDuCode(etat.code),
};

/** Zones du registre qui englobent les lignes du code : trop vagues quand une ligne répond. */
export const REPERES_ENGLOBANT_LE_CODE: readonly string[] = [REPERE_EDITEUR, 'playground.editeur'];

/**
 * Suggestions de l'état vide (au plus 3). Chacune mène à un repère par la
 * seule correspondance locale (test-garde).
 */
export function suggestionsPlayground(etat: EtatPlayground): SuggestionAssistant[] {
  const vide = etat.code.trim() === '';
  return [
    { texte: 'Parcourir les exemples' },
    { texte: vide ? 'Ajouter des dépendances' : 'Exécuter le code' },
    { texte: 'Exporter en PNG' },
  ];
}

/** En-tête du diagnostic transmis au Studio par « Construire pour moi ». */
export const ENTETE_PASSATION_STUDIO = 'Code en cours dans le Playground';

/** Passation « Construire pour moi » : le diagnostic, puis le Studio (sans envoi). */
export function construireDansLeStudio(
  texteDiagnostic: string,
  naviguer: (href: string) => void = (href) => {
    window.location.href = href;
  }
): void {
  transmettreDiagnostic(`${ENTETE_PASSATION_STUDIO}\n\n${texteDiagnostic}`);
  naviguer(appHref('studio', { from: 'playground' }));
}

/**
 * « Me montrer » d'un repère, d'où qu'il vienne (volet Diagnostic ou
 * assistant) : une ligne de code par `montrerCode()`, sinon un réglage de
 * l'interface par `montrer()`.
 */
export function montrerReperePlayground(
  id: string,
  editor: CodeMirrorEditor,
  adaptateur: AdaptateurReperage<EtatPlayground>
): void {
  const code = lireRepereCode(id);
  if (code) montrerCode(editor, code);
  else void montrer(id, { registre: REGISTRE, adaptateur });
}

export interface OptionsAssistantPlayground {
  editor: CodeMirrorEditor;
  adaptateur: AdaptateurReperage<EtatPlayground>;
  /** Volet Diagnostic monté par l'app : constats, texte, ouverture. */
  diagnostic: MountedDiagnostic | null;
  /** Repli explicite (tests). Absent : Albert s'il est utilisable. */
  repondre?: (contexte: ContexteAssistant) => Promise<Reponse>;
  /** Transport d'Albert (tests : `post` mocké). Défaut : `resolveTransport()`. */
  transport?: () => Promise<TransportAssistant>;
  naviguer?: (href: string) => void;
  host?: HTMLElement;
}

/** Monte l'assistant du Playground. */
export function monterAssistantPlayground(opts: OptionsAssistantPlayground): MountedAssistant {
  const { adaptateur, diagnostic, editor } = opts;
  const assistant = mountAssistant<EtatPlayground>({
    app: 'playground',
    registre: REGISTRE,
    adaptateur,
    constats: () => diagnostic?.constats() ?? [],
    ...(opts.repondre ? { repondre: opts.repondre } : {}),
    // Repères de code : hors registre, montrés dans l'éditeur.
    montrerHorsRegistre: (id) => {
      const code = lireRepereCode(id);
      if (!code) return false;
      montrerCode(editor, code);
      return true;
    },
    // Un repère de code cité par Albert : montré seulement s'il désigne le code courant.
    libelleHorsRegistre: (id) => libelleRepereCode(id, adaptateur.etat().code),
    // Avant Albert : les lignes du code courant qui répondent à la question.
    correspondanceHorsRegistre: (question) => correspondanceCode(question, adaptateur.etat().code),
    reperesEnglobants: REPERES_ENGLOBANT_LE_CODE,
    suggestions: () => suggestionsPlayground(adaptateur.etat()),
    aide: AIDE_PLAYGROUND,
    ouvrirDiagnostic: diagnostic ? () => diagnostic.panel.toggle(true) : undefined,
    diagnostic: diagnostic?.panel,
    construire: () => construireDansLeStudio(diagnostic?.text() ?? '', opts.naviguer),
    host: opts.host,
  });
  if (!opts.repondre) {
    void brancherAlbert(assistant, {
      registre: REGISTRE,
      adaptateur,
      profil: PROFIL_PLAYGROUND,
      transport: opts.transport,
    });
  }
  return assistant;
}
