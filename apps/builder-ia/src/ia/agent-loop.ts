/**
 * Boucle agentique incrementale pour la branche OpenAI-compatible (Albert).
 *
 * Inspiree du fonctionnement de Claude Code : le modele OBSERVE l'etat reel
 * (donnees, resultat de son action) puis CORRIGE, sur plusieurs tours, avant de
 * finaliser. Concretement il dispose de trois familles d'outils :
 *
 *   - introspection (inspect_data / distinct_values / count_where) : voir la
 *     donnee reelle au lieu de deviner les champs et valeurs ;
 *   - skills (get_relevant_skills / get_skill) : recuperer la doc d'un composant
 *     a la demande (analogue navigateur du mcp-server) ;
 *   - render_preview : tester une config et recevoir un diagnostic AVANT de
 *     l'afficher.
 *
 * Puis un outil FINAL (create_chart / reload_data / reset_chart) termine la
 * boucle. Garde-fou cle : avant de laisser un create_chart terminer, on relance
 * le diagnostic ; si la config est manifestement cassee (champ inexistant, filtre
 * a zero ligne) on ne termine PAS — on renvoie le diagnostic au modele pour qu'il
 * se corrige (auto-correction, meme si le modele a saute l'etape render_preview).
 *
 * Le transport HTTP est injecte (`post`) : chat.ts l'obtient du transport
 * commun (`resolveTransport`, #998), et la boucle reste testable (post mocke).
 *
 * La mecanique de boucle (anti-doublon, plafond de tours, terminaux) vit dans
 * `runAgentLoop` de @dsfr-data/shared (#1004, ADR-143). Ce module n'en garde
 * que la COMPOSITION propre au builder-IA (#1015) : les outils, leur execution,
 * la validation des outils finaux (`validerTerminal`), `humanizeStep` et le
 * budget de tours.
 */

import {
  runAgentLoop as runSharedLoop,
  type OpenAIResponse,
  type PostChat,
} from '@dsfr-data/shared';
import type { Source, Field } from '../state.js';
import {
  SKILLS,
  getRelevantSkills,
  buildSkillsContext,
  type Skill,
} from '@dsfr-data/shared/skills/skills';
import { selectSkillSection } from '@dsfr-data/shared/skills/skills-sections';
import {
  DATA_INSPECTION_TOOLS,
  PREVIEW_TOOL,
  SKILL_LOOKUP_TOOLS,
  FINAL_ACTION_TOOLS,
  FINAL_TOOL_NAMES,
  toolNameToAction,
  validateAction,
  type ActionResult,
} from './action-schema.js';
import { type Row, inspectData, distinctValues, countWhere, diagnoseConfig } from './data-tools.js';
import type { ChartConfig } from '../state.js';

/**
 * Types du dialogue : ceux du socle commun (#998), re-exportes pour les
 * appelants historiques du builder-IA (chat.ts, tests).
 */
export type { OpenAIResponse, PostChat };

export interface AgentLoopOptions {
  /** Conversation déjà construite (sans le system), ex: state.messages.slice(-10). */
  conversation: { role: 'user' | 'assistant'; content: string }[];
  systemPrompt: string;
  source: Source | null;
  /** Données de l'aperçu (state.localData) — substrat des outils d'introspection. */
  data?: Row[] | null;
  /** Champs analyses (state.fields) — enrichit inspect_data. */
  fields?: Field[];
  post: PostChat;
  /** Callback de progression : recoit la liste cumulative des etapes franchies. */
  onProgress?: (steps: string[]) => void;
  model: string;
  temperature: number;
  seed?: number;
  /** Parametres extra (max_completion_tokens, etc.) fusionnes dans le body. */
  extra?: Record<string, unknown>;
  /**
   * Reclassement optionnel des skills candidates (#514). Injecte par
   * l'appelant, qui seul connait l'URL et le jeton du gateway : la boucle reste
   * agnostique du provider. Absent = ordre du scoring local, qui est le defaut.
   */
  rerankSkills?: (message: string, skills: Skill[]) => Promise<Skill[]>;
}

export interface AgentLoopResult {
  action: ActionResult | null;
  text: string;
  /** Etapes de raisonnement franchies (humanisees), pour affichage persistant. */
  steps: string[];
}

/** Humanise un appel d'outil pour l'affichage utilisateur. */
function humanizeStep(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'inspect_data':
      return 'J’examine le jeu de données…';
    case 'distinct_values': {
      const f = typeof args.field === 'string' ? args.field : '';
      return f ? `Je regarde les valeurs de « ${f} »…` : 'Je regarde les valeurs d’une colonne…';
    }
    case 'count_where':
      return 'Je teste le filtre sur les données…';
    case 'render_preview':
      return 'Je vérifie le rendu du graphique…';
    case 'get_relevant_skills':
      return 'Je cherche les bons réglages…';
    case 'get_skill': {
      const id = typeof args.skill_id === 'string' ? args.skill_id : '';
      const section =
        typeof args.section === 'string' && args.section !== 'tout' ? args.section : '';
      if (id && section) return `Je consulte « ${section} » dans la fiche « ${id} »…`;
      return id ? `Je consulte la fiche « ${id} »…` : 'Je consulte la documentation du composant…';
    }
    default:
      return `Consultation : ${name}`;
  }
}

// Chaque tour = 1 appel Albert. Le token serveur est partage et rate-limite (429),
// donc on borne plus court qu'un agent "cloud" : 6 tours suffisent au cycle
// observe->corrige (inspect -> distinct/count -> preview -> create + 1 correction).
const MAX_ROUNDS = 6;
const ALL_TOOLS = [
  ...DATA_INSPECTION_TOOLS,
  ...SKILL_LOOKUP_TOOLS,
  PREVIEW_TOOL,
  ...FINAL_ACTION_TOOLS,
];

/** Contexte d'execution des outils non terminaux. */
interface ToolContext {
  source: Source | null;
  data: Row[];
  fields: Field[];
  rerankSkills?: (message: string, skills: Skill[]) => Promise<Skill[]>;
}

/**
 * Dispatch d'un outil non terminal (introspection / skill / preview). Renvoie le
 * texte a remettre au modele.
 */
async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  switch (name) {
    case 'inspect_data':
      return inspectData(ctx.data, ctx.fields);
    case 'distinct_values':
      return distinctValues(ctx.data, typeof args.field === 'string' ? args.field : '');
    case 'count_where':
      return countWhere(ctx.data, typeof args.where === 'string' ? args.where : '');
    case 'render_preview': {
      const config = (args.config ?? {}) as Partial<ChartConfig>;
      return diagnoseConfig(config, ctx.data).text;
    }
    case 'get_relevant_skills': {
      const message = typeof args.message === 'string' ? args.message : '';
      const matched = getRelevantSkills(message, ctx.source);
      if (matched.length === 0) {
        return 'Aucune skill ne correspond. Essaie des mots-clés plus larges ou get_skill par id.';
      }
      // Le rerank ne fait que REORDONNER des candidates deja retenues par le
      // scoring local, et rend l'ordre local a la moindre anomalie.
      const ordered = ctx.rerankSkills ? await ctx.rerankSkills(message, matched) : matched;
      return buildSkillsContext(ordered);
    }
    case 'get_skill': {
      const id = typeof args.skill_id === 'string' ? args.skill_id : '';
      const skill = SKILLS[id];
      if (!skill) {
        const ids = Object.keys(SKILLS).join(', ');
        return `Skill "${id}" introuvable. Ids disponibles : ${ids}`;
      }
      // `section` absente ou "tout" -> contenu integral (comportement historique).
      const section = typeof args.section === 'string' ? args.section : undefined;
      return selectSkillSection(skill.content, section);
    }
    default:
      return `Outil inconnu : ${name}`;
  }
}

/** Reponse a un appel en double : pousser le modele vers l'action finale. */
const DUPLICATE_MESSAGE = "Déjà fourni ci-dessus. Génère maintenant l'action finale.";

const INVALID_ACTION_MESSAGE =
  'Action invalide : pour create_chart, "config" doit contenir au minimum un "type" connu et un "valueField" existant. Corrige et reessaie.';

/** Action finale validee a partir d'un appel d'outil final. */
function finalAction(name: string, args: Record<string, unknown>): ActionResult | null {
  return validateAction({ action: toolNameToAction(name), ...args });
}

/**
 * Execute la boucle agentique. Retourne l'action finale (validee) + le texte a
 * afficher, ou {action:null, text} pour une reponse purement conversationnelle.
 */
export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const { conversation, systemPrompt, source, post, onProgress, model, temperature, seed, extra } =
    opts;
  const ctx: ToolContext = {
    source,
    data: opts.data ?? [],
    fields: opts.fields ?? [],
    rerankSkills: opts.rerankSkills,
  };

  /**
   * Garde-fou observe→corrige : un final invalide, ou un create_chart casse
   * (champ inexistant, filtre a zero ligne), ne termine pas la boucle — son
   * diagnostic revient au modele pour auto-correction, meme s'il a saute
   * render_preview. Le diagnostic ne s'applique qu'avec des donnees a verifier,
   * et pas au dernier tour (plus de tour pour corriger).
   */
  const validerTerminal = (
    name: string,
    args: Record<string, unknown>,
    tour: { dernier: boolean }
  ): string | null => {
    const result = finalAction(name, args);
    if (!result) return INVALID_ACTION_MESSAGE;
    if (result.action === 'createChart' && result.config && !tour.dernier && ctx.data.length > 0) {
      const diag = diagnoseConfig(result.config, ctx.data);
      if (!diag.ok) return diag.text;
    }
    return null;
  };

  const result = await runSharedLoop({
    post,
    model,
    systemPrompt,
    conversation,
    tools: ALL_TOOLS,
    executer: (name, args) => dispatchTool(name, args, ctx),
    terminaux: FINAL_TOOL_NAMES,
    validerTerminal,
    maxRounds: MAX_ROUNDS,
    onProgress,
    decrireEtape: humanizeStep,
    messageDoublon: DUPLICATE_MESSAGE,
    // Comportement du builder conserve : chaque tour garde ses outils, le
    // dernier compris, pour qu'un create_chart y reste possible. Le studio et
    // l'assistant contextuel concluent, eux, en texte au dernier tour.
    dernierTourSansOutils: false,
    temperature,
    extra: { ...(seed !== undefined ? { seed } : {}), ...(extra ?? {}) },
  });

  if (result.fin === 'terminal' && result.terminal) {
    const action = finalAction(result.terminal.name, result.terminal.args);
    return { action, text: result.text, steps: result.steps };
  }
  // Reponse conversationnelle, transport muet, ou budget epuise sans action finale.
  return { action: null, text: result.text, steps: result.steps };
}
