/**
 * Boucle agentique du studio — meme patron que le builder-IA (agent-loop.ts) :
 * le modele OBSERVE (introspection des donnees, doc des composants), AGIT par
 * actions de document incrementales, et TERMINE par l'outil finish.
 *
 * Differences avec le builder-IA :
 *   - les actions de document ne sont PAS terminales : elles s'appliquent
 *     immediatement (l'apercu se met a jour en direct via onDocumentChange)
 *     et la boucle continue jusqu'a finish / reponse sans outil ;
 *   - add_blocks est batchable, ce qui tient l'ensemble dans MAX_ROUNDS.
 *
 * Le transport HTTP est injecte (`post`) : la boucle reste testable et
 * agnostique du provider (meme contrat PostChat que le builder-IA).
 */

import { countWhere, distinctValues, inspectData } from '@dsfr-data/shared';
import type { Row } from '@dsfr-data/shared';
import {
  DOCUMENT_TOOLS,
  FINISH_TOOL,
  addBlocks,
  updateBlock,
  removeBlock,
  moveBlock,
  setPage,
  describeDocument,
  type BlockSpec,
  type DocumentContext,
} from '../document.js';
import { loadSkills, relevantSkillsText, skillText } from './skills-client.js';
import type { PostChat } from './transport.js';
import { createEmptyDashboard } from '@dsfr-data/shared';
import type { DashboardData, Field } from '../state.js';

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

// ---------------------------------------------------------------------------
// Outils d'introspection (memes noms que le builder-IA)
// ---------------------------------------------------------------------------

const DATA_INSPECTION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'inspect_data',
      description:
        'Panorama des données chargées : champs, types, min/max ou valeurs distinctes. À appeler AVANT de créer des blocs data.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'distinct_values',
      description: "Valeurs réelles d'une colonne — obligatoire avant un filtre where.",
      parameters: {
        type: 'object',
        properties: { field: { type: 'string', description: 'Nom du champ' } },
        required: ['field'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'count_where',
      description: 'Nombre de lignes qui matchent un filtre "champ:op:valeur" AVANT de le poser.',
      parameters: {
        type: 'object',
        properties: { where: { type: 'string' } },
        required: ['where'],
        additionalProperties: false,
      },
    },
  },
] as const;

const SKILL_LOOKUP_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_relevant_skills',
      description: 'Documentation des composants dsfr-data pertinente pour une intention donnée.',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string', description: "L'intention, en français" } },
        required: ['message'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_skill',
      description: 'Une fiche de documentation par id, section optionnelle.',
      parameters: {
        type: 'object',
        properties: {
          skill_id: { type: 'string' },
          section: { type: 'string', enum: ['guide', 'reference', 'exemples', 'pieges', 'tout'] },
        },
        required: ['skill_id'],
        additionalProperties: false,
      },
    },
  },
] as const;

// Chaque tour = 1 appel Albert (jeton partage, rate-limite). Un document se
// construit en ~4 tours utiles (inspect -> add_blocks batch -> correction ->
// finish) ; 8 laisse la place a une consultation de skill et une retouche.
const MAX_ROUNDS = 8;

const ALL_TOOLS = [...DATA_INSPECTION_TOOLS, ...SKILL_LOOKUP_TOOLS, ...DOCUMENT_TOOLS, FINISH_TOOL];

export interface StudioLoopOptions {
  conversation: { role: 'user' | 'assistant'; content: string }[];
  systemPrompt: string;
  /** LE document (mute en place par les actions). */
  document: DashboardData;
  data: Row[];
  fields: Field[];
  /** Id de la source du dashboard associee aux blocs data. */
  sourceId: string;
  post: PostChat;
  model: string;
  onProgress?: (steps: string[]) => void;
  /** Appele apres chaque action de document appliquee (apercu vivant). */
  onDocumentChange?: () => void;
  extra?: Record<string, unknown>;
}

export interface StudioLoopResult {
  text: string;
  steps: string[];
  /** Nombre d'actions de document effectivement appliquees. */
  applied: number;
}

function humanizeStep(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'inspect_data':
      return 'J’examine le jeu de données…';
    case 'distinct_values':
      return `Je regarde les valeurs de « ${String(args.field ?? '')} »…`;
    case 'count_where':
      return 'Je teste le filtre sur les données…';
    case 'get_relevant_skills':
      return 'Je consulte la documentation…';
    case 'get_skill':
      return `Je consulte la fiche « ${String(args.skill_id ?? '')} »…`;
    case 'add_blocks': {
      const n = Array.isArray(args.blocks) ? args.blocks.length : 0;
      return n > 1 ? `J’ajoute ${n} blocs…` : 'J’ajoute un bloc…';
    }
    case 'update_block':
      return `Je modifie le bloc ${String(args.block_id ?? '')}…`;
    case 'remove_block':
      return `Je retire le bloc ${String(args.block_id ?? '')}…`;
    case 'move_block':
      return `Je déplace le bloc ${String(args.block_id ?? '')}…`;
    case 'set_page':
      return 'Je pose le titre de la page…';
    case 'reset_document':
      return 'Je repars de zéro…';
    case 'finish':
      return 'Je finalise…';
    default:
      return `Outil : ${name}`;
  }
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function runStudioLoop(opts: StudioLoopOptions): Promise<StudioLoopResult> {
  const { document: doc, post, model, onProgress, onDocumentChange } = opts;
  const ctx: DocumentContext = { data: opts.data, fields: opts.fields, sourceId: opts.sourceId };

  const messages: ChatMessage[] = [
    { role: 'system', content: opts.systemPrompt },
    ...opts.conversation.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
  ];

  const lookupCalls = new Set<string>();
  const steps: string[] = [];
  let applied = 0;
  let lastContent = '';

  const applyDocumentTool = (name: string, args: Record<string, unknown>): string => {
    switch (name) {
      case 'add_blocks':
        return finalize(addBlocks(doc, (args.blocks ?? []) as BlockSpec[], ctx));
      case 'update_block':
        return finalize(
          updateBlock(doc, String(args.block_id ?? ''), args as unknown as BlockSpec, ctx)
        );
      case 'remove_block':
        return finalize(removeBlock(doc, String(args.block_id ?? '')));
      case 'move_block':
        return finalize(
          moveBlock(doc, String(args.block_id ?? ''), args.direction === 'up' ? 'up' : 'down')
        );
      case 'set_page':
        return finalize(
          setPage(doc, {
            name: typeof args.name === 'string' ? args.name : undefined,
            description: typeof args.description === 'string' ? args.description : undefined,
          })
        );
      case 'reset_document': {
        const fresh = createEmptyDashboard();
        doc.name = fresh.name;
        doc.description = '';
        doc.widgets = [];
        doc.layout = fresh.layout;
        return finalize({ ok: true, summary: 'Document vidé.' });
      }
      default:
        return `Outil inconnu : ${name}`;
    }

    function finalize(outcome: { ok: boolean; summary: string }): string {
      if (outcome.ok) {
        applied += 1;
        onDocumentChange?.();
      }
      return outcome.summary;
    }
  };

  const dispatchLookup = async (name: string, args: Record<string, unknown>): Promise<string> => {
    switch (name) {
      case 'inspect_data':
        return inspectData(ctx.data, ctx.fields);
      case 'distinct_values':
        return distinctValues(ctx.data, typeof args.field === 'string' ? args.field : '');
      case 'count_where':
        return countWhere(ctx.data, typeof args.where === 'string' ? args.where : '');
      case 'get_relevant_skills': {
        const skills = await loadSkills();
        if (!skills) return 'Documentation indisponible ici — appuie-toi sur le schéma des outils.';
        return relevantSkillsText(skills, typeof args.message === 'string' ? args.message : '');
      }
      case 'get_skill': {
        const skills = await loadSkills();
        if (!skills) return 'Documentation indisponible ici — appuie-toi sur le schéma des outils.';
        return skillText(
          skills,
          typeof args.skill_id === 'string' ? args.skill_id : '',
          typeof args.section === 'string' ? args.section : undefined
        );
      }
      default:
        return `Outil inconnu : ${name}`;
    }
  };

  const DOCUMENT_TOOL_NAMES = new Set([
    'add_blocks',
    'update_block',
    'remove_block',
    'move_block',
    'set_page',
    'reset_document',
  ]);

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const body: Record<string, unknown> = {
      model,
      messages,
      tools: ALL_TOOLS,
      tool_choice: 'auto',
      temperature: 0.1,
      ...(opts.extra ?? {}),
    };

    const data = await post(body);
    const msg = data.choices?.[0]?.message;
    if (!msg) return { text: lastContent, steps, applied };
    lastContent = msg.content ?? lastContent;

    const toolCalls = (msg.tool_calls ?? []) as ToolCall[];
    if (toolCalls.length === 0) {
      // Reponse conversationnelle pure (question de clarification, etc.).
      return { text: msg.content ?? '', steps, applied };
    }

    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: toolCalls });

    for (const call of toolCalls) {
      const name = call.function.name;
      const args = parseArgs(call.function.arguments);
      steps.push(humanizeStep(name, args));
      onProgress?.(steps);

      if (name === 'finish') {
        const text =
          (typeof args.message === 'string' && args.message) ||
          msg.content ||
          'Document mis à jour.';
        return { text, steps, applied };
      }

      let content: string;
      if (DOCUMENT_TOOL_NAMES.has(name)) {
        content = applyDocumentTool(name, args);
      } else {
        // Anti-boucle : ne pas re-payer le même lookup.
        const key = `${name}:${call.function.arguments}`;
        if (lookupCalls.has(key)) {
          content = 'Déjà fourni ci-dessus. Passe aux actions de document ou à finish.';
        } else {
          lookupCalls.add(key);
          content = await dispatchLookup(name, args);
        }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content });
    }
  }

  // Budget epuise : le document reflète les actions déjà appliquées.
  return {
    text:
      applied > 0
        ? `${lastContent || 'Document mis à jour.'}\n\n${describeDocument(doc)}`
        : lastContent,
    steps,
    applied,
  };
}
