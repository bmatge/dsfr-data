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
 * Le transport HTTP est injecte (`post`) : chat.ts garde la propriete du choix
 * serveur-défaut vs config-utilisateur, et la boucle reste testable (post mocke).
 */

import type { Source, Field } from '../state.js';
import { SKILLS, getRelevantSkills, buildSkillsContext } from '../skills.js';
import { selectSkillSection } from '../skills-sections.js';
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

/** Forme minimale d'un tool_call OpenAI. */
interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** Forme minimale d'un message de reponse OpenAI. */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/** Forme minimale d'une reponse chat/completions OpenAI-compatible. */
export interface OpenAIResponse {
  choices: { message: ChatMessage }[];
}

/** Fonction de transport injectee : POST le body et renvoie la reponse parsee. */
export type PostChat = (body: Record<string, unknown>) => Promise<OpenAIResponse>;

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
}

/**
 * Dispatch d'un outil non terminal (introspection / skill / preview). Renvoie le
 * texte a remettre au modele.
 */
function dispatchTool(name: string, args: Record<string, unknown>, ctx: ToolContext): string {
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
      return buildSkillsContext(matched);
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

/** Parse les arguments JSON d'un tool_call de facon tolerante. */
function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
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
  };

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversation.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
  ];

  // Garde-fou anti-boucle : ne pas rappeler indefiniment le même outil de lookup.
  const lookupCalls = new Set<string>();
  // Etapes de raisonnement franchies (humanisees), conservees pour affichage.
  const steps: string[] = [];
  let lastContent = '';

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const isLastRound = round === MAX_ROUNDS - 1;
    const body: Record<string, unknown> = {
      model,
      messages,
      tools: ALL_TOOLS,
      tool_choice: 'auto',
      temperature,
      ...(seed !== undefined ? { seed } : {}),
      ...(extra ?? {}),
    };

    const data = await post(body);
    const msg = data.choices?.[0]?.message;
    if (!msg) return { action: null, text: lastContent, steps };
    lastContent = msg.content ?? lastContent;

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // Reponse conversationnelle pure (pas d'action) — ex. question de clarification.
      return { action: null, text: msg.content ?? '', steps };
    }

    // Empile le message assistant porteur des tool_calls.
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: toolCalls });

    // Traite CHAQUE tool_call : tout id doit recevoir une reponse role:"tool".
    // Un final accepte termine la boucle ; un final casse est renvoye au modele.
    for (const call of toolCalls) {
      const name = call.function.name;
      const args = parseArgs(call.function.arguments);
      steps.push(humanizeStep(name, args));
      onProgress?.(steps);

      if (FINAL_TOOL_NAMES.has(name)) {
        const actionName = toolNameToAction(name);
        const result = validateAction({ action: actionName, ...args });

        // Validation de forme echouee (type/valueField manquants…).
        if (!result) {
          if (isLastRound) return { action: null, text: msg.content ?? lastContent, steps };
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content:
              'Action invalide : pour create_chart, "config" doit contenir au minimum un "type" connu et un "valueField" existant. Corrige et reessaie.',
          });
          continue;
        }

        // Garde-fou observe→corrige : un create_chart casse ne termine pas la
        // boucle, on renvoie le diagnostic pour auto-correction. Ne s'applique
        // que si on a des données a diagnostiquer (sinon on ne peut rien verifier).
        if (
          result.action === 'createChart' &&
          result.config &&
          !isLastRound &&
          ctx.data.length > 0
        ) {
          const diag = diagnoseConfig(result.config, ctx.data);
          if (!diag.ok) {
            messages.push({ role: 'tool', tool_call_id: call.id, content: diag.text });
            continue;
          }
        }

        const text = (typeof args.message === 'string' && args.message) || msg.content || '';
        return { action: result, text, steps };
      }

      // Outil non terminal (introspection / skill / preview).
      const key = `${name}:${call.function.arguments}`;
      let content: string;
      if (lookupCalls.has(key)) {
        content = "Déjà fourni ci-dessus. Génère maintenant l'action finale.";
      } else {
        lookupCalls.add(key);
        content = dispatchTool(name, args, ctx);
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content });
    }
  }

  // Budget de rounds epuise sans action finale.
  return { action: null, text: lastContent, steps };
}
