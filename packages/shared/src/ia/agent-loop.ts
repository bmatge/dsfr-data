/**
 * Boucle agentique generique (#1004, ADR-143) — le socle commun des assistants.
 *
 * Le modele OBSERVE et AGIT par appels d'outils, et la boucle s'arrete sur :
 *   - une reponse sans outil (question de clarification, conclusion) ;
 *   - un outil TERMINAL (ex. `finish`) ;
 *   - le plafond de tours.
 *
 * La boucle ne connait AUCUN outil : l'app fournit leurs schemas (`tools`) et
 * leur execution (`executer`). Elle garde pour tous les memes garde-fous :
 *
 *   - anti-doublon : un appel identique (meme nom, memes arguments) n'est pas
 *     re-execute — il est re-paye en jeton Albert sans rien apprendre de neuf ;
 *   - outils REPETABLES, exemptes de l'anti-doublon : ceux qui agissent, ou qui
 *     observent un etat mutable (rejouer la meme observation apres un correctif,
 *     c'est precisement verifier ce correctif) ;
 *   - dernier tour SANS outils (`tool_choice: 'none'`) : au lieu de couper le
 *     modele en plein geste, on lui demande de conclure en texte.
 *
 * Le transport est injecte (`post`) : la boucle ne fait aucun appel reseau
 * elle-meme, reste testable et agnostique du provider.
 *
 * App-side (frontiere lib/app #319) : exportee par `index.ts`, jamais par `lib.ts`.
 */

import type { ChatMessage, PostChat } from './chat-types.js';

/**
 * Pourquoi la boucle s'est arretee.
 *   - `texte`    : le modele a repondu sans outil (y compris au dernier tour) ;
 *   - `terminal` : un outil terminal a ete appele (voir `terminal`) ;
 *   - `plafond`  : tours epuises, le modele appelait encore des outils ;
 *   - `vide`     : le transport n'a rendu aucun message.
 */
export type AgentLoopEnd = 'texte' | 'terminal' | 'plafond' | 'vide';

export interface AgentLoopOptions {
  post: PostChat;
  model: string;
  systemPrompt: string;
  conversation: { role: 'user' | 'assistant'; content: string }[];
  /** Schemas d'outils (forme OpenAI), envoyes tels quels. */
  tools: readonly unknown[];
  /** Execute un outil non terminal ; le texte rendu revient au modele en role `tool`. */
  executer: (name: string, args: Record<string, unknown>) => Promise<string> | string;
  /** Outils qui terminent la boucle sans etre executes. */
  terminaux?: ReadonlySet<string>;
  /**
   * Controle d'un outil terminal AVANT qu'il ne termine la boucle (#1015).
   * Rend `null` pour l'accepter, ou un texte de refus : ce texte revient au
   * modele en role `tool` et la boucle continue, pour qu'il se corrige (ex. un
   * `create_chart` dont le champ n'existe pas). `dernier` : c'est le dernier
   * tour, un refus ne sera pas suivi d'une correction. Absent : tout terminal
   * est accepte.
   */
  validerTerminal?: (
    name: string,
    args: Record<string, unknown>,
    tour: { index: number; dernier: boolean }
  ) => Promise<string | null> | string | null;
  /** Outils exemptes de l'anti-doublon (actions, observations d'un etat mutable). */
  repetables?: ReadonlySet<string>;
  /** Nombre maximal d'appels au modele, dernier tour sans outils compris. */
  maxRounds: number;
  /** Etapes franchies, humanisees par `decrireEtape`, a chaque outil appele. */
  onProgress?: (steps: string[]) => void;
  /** Libelle d'une etape pour l'utilisateur. Defaut : `Outil : <nom>`. */
  decrireEtape?: (name: string, args: Record<string, unknown>) => string;
  /** Reponse renvoyee au modele pour un appel en double. */
  messageDoublon?: string;
  /**
   * Dernier tour avec `tool_choice: 'none'`, pour obtenir une conclusion en
   * texte plutot qu'une coupure. Defaut : true.
   */
  dernierTourSansOutils?: boolean;
  temperature?: number;
  /** Champs additionnels du corps de requete (seed, max_tokens...). */
  extra?: Record<string, unknown>;
}

export interface AgentLoopResult {
  fin: AgentLoopEnd;
  /**
   * Texte du dernier message du modele (ou le dernier texte non vide vu) ;
   * pour un terminal, son argument `message`, a defaut le contenu du message.
   */
  text: string;
  steps: string[];
  /** Nombre d'appels au modele effectues. */
  rounds: number;
  /** Outil terminal appele, quand `fin === 'terminal'`. */
  terminal?: { name: string; args: Record<string, unknown> };
}

export const DEFAULT_DUPLICATE_MESSAGE = 'Déjà fourni ci-dessus. Passe à la suite.';

/** Arguments JSON d'un appel d'outil ; un JSON casse donne un objet vide. */
export function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Texte d'un outil terminal : son argument `message`, sinon le contenu du message. */
function terminalText(args: Record<string, unknown>, content: string | null): string {
  return (typeof args.message === 'string' && args.message) || content || '';
}

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    post,
    model,
    tools,
    executer,
    maxRounds,
    onProgress,
    terminaux = new Set<string>(),
    repetables = new Set<string>(),
    decrireEtape = (name: string) => `Outil : ${name}`,
    messageDoublon = DEFAULT_DUPLICATE_MESSAGE,
    dernierTourSansOutils = true,
    temperature = 0.1,
    validerTerminal,
  } = opts;

  const messages: ChatMessage[] = [
    { role: 'system', content: opts.systemPrompt },
    ...opts.conversation.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
  ];

  const dejaAppeles = new Set<string>();
  const steps: string[] = [];
  let lastContent = '';
  let rounds = 0;

  for (let round = 0; round < maxRounds; round++) {
    const tour = { index: round, dernier: round === maxRounds - 1 };
    const dernierTour = dernierTourSansOutils && tour.dernier;
    const body: Record<string, unknown> = {
      model,
      messages,
      tools,
      // Les schemas restent envoyes au dernier tour : l'historique contient des
      // messages `tool`, que certains gabarits de chat refusent sans outils declares.
      tool_choice: dernierTour ? 'none' : 'auto',
      temperature,
      ...(opts.extra ?? {}),
    };

    const data = await post(body);
    rounds += 1;
    const msg = data.choices?.[0]?.message;
    if (!msg) return { fin: 'vide', text: lastContent, steps, rounds };
    lastContent = msg.content || lastContent;

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return { fin: 'texte', text: msg.content ?? '', steps, rounds };
    }

    // Au dernier tour, un modele qui appelle quand meme des outils n'est pas
    // suivi : seul un terminal est honore (il n'execute rien).
    if (dernierTour) {
      const terminalCall = toolCalls.find((c) => terminaux.has(c.function.name));
      if (terminalCall) {
        const args = parseToolArgs(terminalCall.function.arguments);
        // Refuse au dernier tour : plus de tour pour se corriger, on s'arrete.
        if (validerTerminal && (await validerTerminal(terminalCall.function.name, args, tour))) {
          break;
        }
        steps.push(decrireEtape(terminalCall.function.name, args));
        onProgress?.(steps);
        return {
          fin: 'terminal',
          text: terminalText(args, msg.content),
          steps,
          rounds,
          terminal: { name: terminalCall.function.name, args },
        };
      }
      break;
    }

    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: toolCalls });

    // Chaque tool_call recoit sa reponse role:"tool", dans l'ordre.
    for (const call of toolCalls) {
      const name = call.function.name;
      const args = parseToolArgs(call.function.arguments);
      steps.push(decrireEtape(name, args));
      onProgress?.(steps);

      if (terminaux.has(name)) {
        const refus = validerTerminal ? await validerTerminal(name, args, tour) : null;
        if (refus) {
          messages.push({ role: 'tool', tool_call_id: call.id, content: refus });
          continue;
        }
        return {
          fin: 'terminal',
          text: terminalText(args, msg.content),
          steps,
          rounds,
          terminal: { name, args },
        };
      }

      let content: string;
      if (repetables.has(name)) {
        content = await executer(name, args);
      } else {
        const key = `${name}:${call.function.arguments}`;
        if (dejaAppeles.has(key)) {
          content = messageDoublon;
        } else {
          dejaAppeles.add(key);
          content = await executer(name, args);
        }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content });
    }
  }

  return { fin: 'plafond', text: lastContent, steps, rounds };
}
