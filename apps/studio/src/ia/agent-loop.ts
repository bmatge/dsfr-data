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
 *
 * La mecanique de boucle (anti-doublon, outils repetables, plafond de tours,
 * dernier tour sans outils) vit dans `runAgentLoop` de @dsfr-data/shared
 * (#1004, ADR-143). Ce module n'en garde que la COMPOSITION propre au studio :
 * les outils (document, donnees, skills, diagnostic, code), leur execution,
 * les budgets et `humanizeStep`.
 */

import { countWhere, distinctValues, inspectData, runAgentLoop } from '@dsfr-data/shared';
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
import {
  DIAGNOSTIC_TOOLS,
  DIAGNOSTIC_TOOL_NAMES,
  REPEATABLE_TOOLS,
  humanizeDiagnosticStep,
  runDiagnosticTool,
  type DiagnosticContext,
} from './diagnostic-tools.js';
import { CODE_TOOLS, CODE_TOOL_NAMES, describeGeneratedCode } from './code-tools.js';
import type { PostChat } from '@dsfr-data/shared';
import { createEmptyDashboard } from '@dsfr-data/shared';
import type { DashboardData, Field } from '../state.js';

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
// Le 8e tour est sans outils (boucle commune) : il sert a conclure en texte.
const MAX_ROUNDS = 8;

/**
 * Budget distinct quand les outils de diagnostic sont disponibles (#607).
 *
 * Une boucle de debogage fait au MINIMUM observer -> hypothese -> correctif
 * -> reobserver -> confirmer : cinq tours, avant toute consultation de skill.
 * Garder 8 revenait a couper le modele juste avant sa verification — le pire
 * moment, puisqu'il conclurait sur un correctif non valide.
 */
const MAX_ROUNDS_DEBUG = 12;

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
  /**
   * Acces au flux rendu (#607). Absent = pas d'outils de diagnostic, la
   * boucle garde son budget de composition.
   */
  diagnostic?: DiagnosticContext;
  /**
   * Code réellement généré pour la page (#787) — l'`exportHtml` de l'aperçu.
   * Présent = outil `read_generated_code`, indépendant du volet Diagnostic :
   * le code existe toujours, qu'on sache observer le rendu ou non.
   */
  generatedCode?: () => string;
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
    case 'read_generated_code':
      return 'Je relis le code généré…';
    default:
      return humanizeDiagnosticStep(name, args) ?? `Outil : ${name}`;
  }
}

const DOCUMENT_TOOL_NAMES: ReadonlySet<string> = new Set([
  'add_blocks',
  'update_block',
  'remove_block',
  'move_block',
  'set_page',
  'reset_document',
]);

/**
 * Outils exemptés de l'anti-doublon de la boucle commune :
 *   - les actions de document (deux add_blocks identiques ajoutent deux blocs) ;
 *   - la lecture du code, qui change à chaque action de document — la relire
 *     après une contestation est précisément ce qu'on attend (#787) ;
 *   - les outils de diagnostic, qui observent un état mutable : rejouer la même
 *     observation après un correctif, c'est tout leur intérêt (#607).
 */
const STUDIO_REPEATABLE_TOOLS: ReadonlySet<string> = new Set([
  ...DOCUMENT_TOOL_NAMES,
  ...CODE_TOOL_NAMES,
  ...REPEATABLE_TOOLS,
]);

const STUDIO_TERMINAL_TOOLS: ReadonlySet<string> = new Set(['finish']);

const DUPLICATE_MESSAGE = 'Déjà fourni ci-dessus. Passe aux actions de document ou à finish.';

export async function runStudioLoop(opts: StudioLoopOptions): Promise<StudioLoopResult> {
  const { document: doc, post, model, onProgress, onDocumentChange } = opts;
  const ctx: DocumentContext = { data: opts.data, fields: opts.fields, sourceId: opts.sourceId };

  const diagnostic = opts.diagnostic;
  const generatedCode = opts.generatedCode;
  const tools = [
    ...ALL_TOOLS,
    ...(diagnostic ? DIAGNOSTIC_TOOLS : []),
    ...(generatedCode ? CODE_TOOLS : []),
  ];
  const maxRounds = diagnostic ? MAX_ROUNDS_DEBUG : MAX_ROUNDS;

  let applied = 0;

  const finalize = (outcome: { ok: boolean; summary: string }): string => {
    if (outcome.ok) {
      applied += 1;
      onDocumentChange?.();
    }
    return outcome.summary;
  };

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

  /** Aiguillage des outils non terminaux : document, code, diagnostic, lookups. */
  const executer = async (name: string, args: Record<string, unknown>): Promise<string> => {
    if (DOCUMENT_TOOL_NAMES.has(name)) return applyDocumentTool(name, args);
    if (CODE_TOOL_NAMES.has(name)) {
      return generatedCode
        ? describeGeneratedCode(generatedCode())
        : "La lecture du code n'est pas disponible ici.";
    }
    if (DIAGNOSTIC_TOOL_NAMES.has(name)) {
      return diagnostic
        ? runDiagnosticTool(name, args, diagnostic)
        : "Le diagnostic n'est pas disponible ici.";
    }
    return dispatchLookup(name, args);
  };

  const result = await runAgentLoop({
    post,
    model,
    systemPrompt: opts.systemPrompt,
    conversation: opts.conversation,
    tools,
    executer,
    terminaux: STUDIO_TERMINAL_TOOLS,
    repetables: STUDIO_REPEATABLE_TOOLS,
    maxRounds,
    onProgress,
    decrireEtape: humanizeStep,
    messageDoublon: DUPLICATE_MESSAGE,
    temperature: 0.1,
    extra: opts.extra,
  });

  const { steps } = result;
  switch (result.fin) {
    case 'terminal':
      // `finish` : son message, sinon le contenu du message (boucle commune).
      return { text: result.text || 'Document mis à jour.', steps, applied };
    case 'plafond':
      // Budget épuisé : le document reflète les actions déjà appliquées.
      return {
        text:
          applied > 0
            ? `${result.text || 'Document mis à jour.'}\n\n${describeDocument(doc)}`
            : result.text,
        steps,
        applied,
      };
    default:
      // Réponse sans outil (clarification, ou conclusion du dernier tour),
      // ou transport muet.
      return { text: result.text, steps, applied };
  }
}
