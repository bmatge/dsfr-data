/**
 * Boucle agentique du studio (#515) — transport mocke (meme technique que
 * tests/apps/builder-ia/agent-loop.test.ts) : on scriptes les reponses du
 * modele et on verifie que les actions de document s'appliquent en direct,
 * que finish termine, et que la boucle reste bornee.
 */
import { describe, it, expect, vi } from 'vitest';
import { createEmptyDashboard } from '@dsfr-data/shared';
import { runStudioLoop } from '../../../apps/studio/src/ia/agent-loop';
import type { PostChat, OpenAIResponse } from '../../../apps/studio/src/ia/transport';

const DATA = [
  { region: 'IDF', population: 12000 },
  { region: 'PACA', population: 5000 },
];
const FIELDS = [
  { name: 'region', type: 'texte', sample: 'IDF' },
  { name: 'population', type: 'numérique', sample: 12000 },
];

function toolCallMsg(calls: { name: string; args: Record<string, unknown> }[]): OpenAIResponse {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: calls.map((c, i) => ({
            id: `call-${Math.random().toString(36).slice(2)}-${i}`,
            type: 'function' as const,
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          })),
        },
      },
    ],
  };
}

function textMsg(content: string): OpenAIResponse {
  return { choices: [{ message: { role: 'assistant', content } }] };
}

function scriptedPost(responses: OpenAIResponse[]): PostChat {
  let i = 0;
  return vi.fn(async () => responses[Math.min(i++, responses.length - 1)]);
}

function baseOpts(post: PostChat, doc = createEmptyDashboard()) {
  return {
    conversation: [{ role: 'user' as const, content: 'un dashboard des populations' }],
    systemPrompt: 'system',
    document: doc,
    data: DATA,
    fields: FIELDS,
    sourceId: 'src-1',
    post,
    model: 'test-model',
  };
}

describe('studio/agent-loop', () => {
  it('applique un add_blocks batch puis termine sur finish', async () => {
    const doc = createEmptyDashboard();
    const changes: number[] = [];
    const post = scriptedPost([
      toolCallMsg([
        { name: 'set_page', args: { name: 'Populations' } },
        {
          name: 'add_blocks',
          args: {
            blocks: [
              { kind: 'text', content: 'Intro' },
              {
                kind: 'chart',
                config: {
                  type: 'bar',
                  labelField: 'region',
                  valueField: 'population',
                  aggregation: 'sum',
                },
              },
            ],
          },
        },
      ]),
      toolCallMsg([{ name: 'finish', args: { message: 'Dashboard prêt.' } }]),
    ]);

    const result = await runStudioLoop({
      ...baseOpts(post, doc),
      onDocumentChange: () => changes.push(doc.widgets.length),
    });

    expect(result.text).toBe('Dashboard prêt.');
    expect(result.applied).toBe(2);
    expect(doc.name).toBe('Populations');
    expect(doc.widgets).toHaveLength(2);
    // L'apercu a ete notifie au fil de l'eau (set_page puis add_blocks).
    expect(changes.length).toBe(2);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('renvoie le diagnostic au modele quand un bloc est refuse, et laisse corriger', async () => {
    const doc = createEmptyDashboard();
    const post = scriptedPost([
      toolCallMsg([
        {
          name: 'add_blocks',
          args: { blocks: [{ kind: 'chart', config: { type: 'bar', valueField: 'inconnu' } }] },
        },
      ]),
      toolCallMsg([
        {
          name: 'add_blocks',
          args: {
            blocks: [
              {
                kind: 'chart',
                config: { type: 'bar', labelField: 'region', valueField: 'population' },
              },
            ],
          },
        },
      ]),
      toolCallMsg([{ name: 'finish', args: { message: 'Corrigé.' } }]),
    ]);

    const result = await runStudioLoop(baseOpts(post, doc));
    expect(result.text).toBe('Corrigé.');
    expect(doc.widgets).toHaveLength(1);

    // Le 2e appel a bien recu le diagnostic en role:"tool".
    const secondBody = (post as ReturnType<typeof vi.fn>).mock.calls[1][0] as {
      messages: { role: string; content: string }[];
    };
    const toolMsgs = secondBody.messages.filter((m) => m.role === 'tool');
    expect(toolMsgs.some((m) => m.content.includes('inconnu'))).toBe(true);
  });

  it("s'arrete sur une reponse conversationnelle pure (question de clarification)", async () => {
    const post = scriptedPost([textMsg('Quelle période voulez-vous couvrir ?')]);
    const result = await runStudioLoop(baseOpts(post));
    expect(result.text).toBe('Quelle période voulez-vous couvrir ?');
    expect(result.applied).toBe(0);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('reste borne : budget de rounds epuise sans finish', async () => {
    const post = scriptedPost([toolCallMsg([{ name: 'inspect_data', args: {} }])]);
    const result = await runStudioLoop(baseOpts(post));
    expect((post as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(8);
    expect(result.applied).toBe(0);
  });

  it('deduplique les lookups identiques (anti-boucle)', async () => {
    const post = scriptedPost([
      toolCallMsg([{ name: 'distinct_values', args: { field: 'region' } }]),
      toolCallMsg([{ name: 'distinct_values', args: { field: 'region' } }]),
      toolCallMsg([{ name: 'finish', args: { message: 'ok' } }]),
    ]);
    await runStudioLoop(baseOpts(post));
    const thirdBody = (post as ReturnType<typeof vi.fn>).mock.calls[2][0] as {
      messages: { role: string; content: string }[];
    };
    const toolMsgs = thirdBody.messages.filter((m) => m.role === 'tool');
    expect(toolMsgs.some((m) => m.content.includes('Déjà fourni'))).toBe(true);
  });

  it('reset_document vide le document (widgets et chapo)', async () => {
    const doc = createEmptyDashboard();
    const post1 = scriptedPost([
      toolCallMsg([{ name: 'add_blocks', args: { blocks: [{ kind: 'text', content: 'Intro' }] } }]),
      toolCallMsg([{ name: 'finish', args: { message: 'ok' } }]),
    ]);
    await runStudioLoop(baseOpts(post1, doc));
    expect(doc.widgets).toHaveLength(1);

    const post2 = scriptedPost([
      toolCallMsg([{ name: 'reset_document', args: {} }]),
      toolCallMsg([{ name: 'finish', args: { message: 'Repartons de zéro.' } }]),
    ]);
    const result = await runStudioLoop(baseOpts(post2, doc));
    expect(result.text).toBe('Repartons de zéro.');
    expect(doc.widgets).toHaveLength(0);
  });
});
