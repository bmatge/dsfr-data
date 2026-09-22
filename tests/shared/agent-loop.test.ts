/**
 * Boucle agentique generique (#1004, ADR-143) — transport mocke, outils factices.
 * Couvre les garde-fous communs : plafond de tours, dernier tour sans outils,
 * anti-doublon, outils repetables, terminaux, fin sans outil.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  runAgentLoop,
  parseToolArgs,
  DEFAULT_DUPLICATE_MESSAGE,
  type AgentLoopOptions,
} from '../../packages/shared/src/ia/agent-loop.js';
import type { OpenAIResponse, PostChat } from '../../packages/shared/src/ia/chat-types.js';

let callSeq = 0;

function toolCallMsg(calls: { name: string; args?: Record<string, unknown> }[]): OpenAIResponse {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: calls.map((c) => ({
            id: `call-${callSeq++}`,
            type: 'function' as const,
            function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
          })),
        },
      },
    ],
  };
}

function textMsg(content: string): OpenAIResponse {
  return { choices: [{ message: { role: 'assistant', content } }] };
}

type Body = {
  tool_choice: string;
  tools: unknown[];
  temperature: number;
  messages: { role: string; content: string | null; tool_call_id?: string }[];
};

function scriptedPost(responses: OpenAIResponse[]) {
  let i = 0;
  const fn = vi.fn(async (_body: Record<string, unknown>) => {
    return responses[Math.min(i++, responses.length - 1)];
  });
  return fn;
}

function bodyOf(post: ReturnType<typeof scriptedPost>, n: number): Body {
  return post.mock.calls[n][0] as unknown as Body;
}

function baseOpts(post: PostChat, overrides: Partial<AgentLoopOptions> = {}): AgentLoopOptions {
  return {
    post,
    model: 'test-model',
    systemPrompt: 'system',
    conversation: [{ role: 'user', content: 'bonjour' }],
    tools: [{ type: 'function', function: { name: 'lookup' } }],
    executer: (name) => `résultat de ${name}`,
    maxRounds: 5,
    ...overrides,
  };
}

describe('shared/ia/agent-loop — fin sans outil', () => {
  it("s'arrete au premier message sans outil et rend son texte", async () => {
    const post = scriptedPost([textMsg('Quelle période ?')]);
    const result = await runAgentLoop(baseOpts(post));
    expect(result.fin).toBe('texte');
    expect(result.text).toBe('Quelle période ?');
    expect(result.rounds).toBe(1);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('construit le corps : systeme, conversation, outils, tool_choice auto, extra', async () => {
    const post = scriptedPost([textMsg('ok')]);
    await runAgentLoop(baseOpts(post, { temperature: 0.3, extra: { seed: 42 } }));
    const body = bodyOf(post, 0) as Body & { model: string; seed: number };
    expect(body.model).toBe('test-model');
    expect(body.tool_choice).toBe('auto');
    expect(body.temperature).toBe(0.3);
    expect(body.seed).toBe(42);
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(body.tools).toHaveLength(1);
  });

  it('rend fin "vide" quand le transport ne renvoie aucun message', async () => {
    const post = scriptedPost([{ choices: [] }]);
    const result = await runAgentLoop(baseOpts(post));
    expect(result.fin).toBe('vide');
  });
});

describe('shared/ia/agent-loop — plafond de tours', () => {
  it("n'appelle jamais le modele plus de maxRounds fois", async () => {
    const post = scriptedPost([toolCallMsg([{ name: 'agir' }])]);
    const executer = vi.fn(() => 'fait');
    const result = await runAgentLoop(
      baseOpts(post, { maxRounds: 4, executer, repetables: new Set(['agir']) })
    );
    expect(post).toHaveBeenCalledTimes(4);
    expect(result.rounds).toBe(4);
    expect(result.fin).toBe('plafond');
    // Le dernier tour est sans outils : ses appels ne sont pas executes.
    expect(executer).toHaveBeenCalledTimes(3);
  });

  it('le dernier tour interdit les outils (tool_choice none), les precedents non', async () => {
    const post = scriptedPost([
      toolCallMsg([{ name: 'agir' }]),
      toolCallMsg([{ name: 'agir' }]),
      textMsg('Voici ma conclusion.'),
    ]);
    const result = await runAgentLoop(
      baseOpts(post, { maxRounds: 3, repetables: new Set(['agir']) })
    );
    expect(bodyOf(post, 0).tool_choice).toBe('auto');
    expect(bodyOf(post, 1).tool_choice).toBe('auto');
    expect(bodyOf(post, 2).tool_choice).toBe('none');
    expect(result.fin).toBe('texte');
    expect(result.text).toBe('Voici ma conclusion.');
  });

  it('dernierTourSansOutils: false garde les outils jusqu au bout', async () => {
    const post = scriptedPost([toolCallMsg([{ name: 'agir' }])]);
    const executer = vi.fn(() => 'fait');
    await runAgentLoop(
      baseOpts(post, {
        maxRounds: 3,
        executer,
        repetables: new Set(['agir']),
        dernierTourSansOutils: false,
      })
    );
    expect(bodyOf(post, 2).tool_choice).toBe('auto');
    expect(executer).toHaveBeenCalledTimes(3);
  });

  it('un terminal appele malgre tout au dernier tour est honore', async () => {
    const post = scriptedPost([
      toolCallMsg([{ name: 'agir' }]),
      toolCallMsg([{ name: 'agir' }, { name: 'finish', args: { message: 'Fini.' } }]),
    ]);
    const executer = vi.fn(() => 'fait');
    const result = await runAgentLoop(
      baseOpts(post, {
        maxRounds: 2,
        executer,
        repetables: new Set(['agir']),
        terminaux: new Set(['finish']),
      })
    );
    expect(result.fin).toBe('terminal');
    expect(result.terminal).toEqual({ name: 'finish', args: { message: 'Fini.' } });
    expect(executer).toHaveBeenCalledTimes(1);
  });
});

describe('shared/ia/agent-loop — anti-doublon', () => {
  it("n'execute pas deux fois le meme appel (meme nom, memes arguments)", async () => {
    const post = scriptedPost([
      toolCallMsg([{ name: 'lookup', args: { field: 'region' } }]),
      toolCallMsg([{ name: 'lookup', args: { field: 'region' } }]),
      textMsg('fin'),
    ]);
    const executer = vi.fn(() => 'valeurs');
    await runAgentLoop(baseOpts(post, { executer }));
    expect(executer).toHaveBeenCalledTimes(1);
    const toolMsgs = bodyOf(post, 2).messages.filter((m) => m.role === 'tool');
    expect(toolMsgs.map((m) => m.content)).toEqual(['valeurs', DEFAULT_DUPLICATE_MESSAGE]);
  });

  it('des arguments differents ne sont pas un doublon', async () => {
    const post = scriptedPost([
      toolCallMsg([{ name: 'lookup', args: { field: 'a' } }]),
      toolCallMsg([{ name: 'lookup', args: { field: 'b' } }]),
      textMsg('fin'),
    ]);
    const executer = vi.fn(() => 'valeurs');
    await runAgentLoop(baseOpts(post, { executer }));
    expect(executer).toHaveBeenCalledTimes(2);
  });

  it('le message de doublon est configurable', async () => {
    const post = scriptedPost([
      toolCallMsg([{ name: 'lookup' }]),
      toolCallMsg([{ name: 'lookup' }]),
      textMsg('fin'),
    ]);
    await runAgentLoop(baseOpts(post, { messageDoublon: 'Déjà vu.' }));
    const toolMsgs = bodyOf(post, 2).messages.filter((m) => m.role === 'tool');
    expect(toolMsgs[1].content).toBe('Déjà vu.');
  });
});

describe('shared/ia/agent-loop — outils repetables', () => {
  it("un outil repetable n'est jamais dedoublonne", async () => {
    const post = scriptedPost([
      toolCallMsg([{ name: 'run_and_trace' }]),
      toolCallMsg([{ name: 'run_and_trace' }]),
      toolCallMsg([{ name: 'run_and_trace' }]),
      textMsg('vérifié'),
    ]);
    let n = 0;
    const executer = vi.fn(() => `trace ${++n}`);
    const result = await runAgentLoop(
      baseOpts(post, { executer, repetables: new Set(['run_and_trace']) })
    );
    expect(executer).toHaveBeenCalledTimes(3);
    const toolMsgs = bodyOf(post, 3).messages.filter((m) => m.role === 'tool');
    expect(toolMsgs.map((m) => m.content)).toEqual(['trace 1', 'trace 2', 'trace 3']);
    expect(result.text).toBe('vérifié');
  });
});

describe('shared/ia/agent-loop — terminaux et progression', () => {
  it('un terminal arrete la boucle sans etre execute, apres les outils qui le precedent', async () => {
    const post = scriptedPost([
      toolCallMsg([{ name: 'lookup' }, { name: 'finish', args: { message: 'Prêt.' } }]),
    ]);
    const executer = vi.fn(() => 'ok');
    const result = await runAgentLoop(baseOpts(post, { executer, terminaux: new Set(['finish']) }));
    expect(result.fin).toBe('terminal');
    expect(result.terminal?.args.message).toBe('Prêt.');
    expect(executer).toHaveBeenCalledTimes(1);
    expect(executer).toHaveBeenCalledWith('lookup', {});
  });

  it('chaque tool_call recoit une reponse role tool avec son id', async () => {
    const post = scriptedPost([toolCallMsg([{ name: 'a' }, { name: 'b' }]), textMsg('fin')]);
    await runAgentLoop(baseOpts(post));
    const msgs = bodyOf(post, 1).messages;
    const assistant = msgs.find((m) => m.role === 'assistant') as unknown as {
      tool_calls: { id: string }[];
    };
    const toolIds = msgs.filter((m) => m.role === 'tool').map((m) => m.tool_call_id);
    expect(toolIds).toEqual(assistant.tool_calls.map((c) => c.id));
  });

  it('humanise chaque etape via decrireEtape et notifie onProgress', async () => {
    const post = scriptedPost([
      toolCallMsg([{ name: 'lookup', args: { field: 'x' } }]),
      textMsg('fin'),
    ]);
    const progress: string[][] = [];
    const result = await runAgentLoop(
      baseOpts(post, {
        decrireEtape: (name, args) => `${name}(${String(args.field)})`,
        onProgress: (steps) => progress.push([...steps]),
      })
    );
    expect(result.steps).toEqual(['lookup(x)']);
    expect(progress).toEqual([['lookup(x)']]);
  });
});

describe('shared/ia/agent-loop — parseToolArgs', () => {
  it('tolere un JSON casse, vide ou non objet', () => {
    expect(parseToolArgs('{"a":1}')).toEqual({ a: 1 });
    expect(parseToolArgs('')).toEqual({});
    expect(parseToolArgs('{pas du json')).toEqual({});
    expect(parseToolArgs('[1,2]')).toEqual({});
    expect(parseToolArgs('null')).toEqual({});
  });
});
