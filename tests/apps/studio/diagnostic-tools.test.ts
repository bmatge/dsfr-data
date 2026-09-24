import { describe, it, expect, vi } from 'vitest';
import { runStudioLoop } from '../../../apps/studio/src/ia/agent-loop.js';
import { buildSystemPrompt } from '../../../apps/studio/src/ia/system-prompt.js';
import { describeBlockVocabulary } from '../../../apps/studio/src/ia/vocabulaire.js';
import { REPEATABLE_TOOLS, createEmptyDashboard } from '@dsfr-data/shared';
import type { FrameAttachment, Trace, PostChat } from '@dsfr-data/shared';

/**
 * Outils de diagnostic dans la boucle du studio (#607).
 *
 * Les outils eux-memes vivent dans packages/shared depuis #1010 et sont
 * testes dans `tests/shared/ia-diagnostic-tools.test.ts`. Restent ici ce qui
 * est propre au studio : leur branchement dans la boucle, le budget de tours
 * et le prompt systeme.
 *
 * Le test le plus important est celui de l'ANTI-BOUCLE : la boucle refuse de
 * re-payer un lookup identique. Applique a `run_and_trace`, ce garde-fou se
 * retourne contre nous — verifier qu'un correctif a fonctionne, c'est
 * precisement relancer la MEME observation. Le modele se verrait refuser sa
 * verification au moment exact ou il en a besoin.
 */

function makeTrace(over: Partial<Trace> = {}): Trace {
  return {
    graph: {
      nodes: [
        {
          id: 'src',
          tag: 'dsfr-data-source',
          role: 'source',
          synthetic: false,
          ambiguous: false,
          upstream: [],
          attrs: { 'api-type': 'tabular' },
        },
        {
          id: 'q1',
          tag: 'dsfr-data-query',
          role: 'transform',
          synthetic: false,
          ambiguous: false,
          upstream: ['src'],
          attrs: { 'group-by': 'dept' },
        },
      ],
      dangling: [],
    },
    events: [],
    states: {
      src: {
        status: 'loaded',
        rows: 100,
        fields: [
          { name: 'dept', type: 'texte', sample: 'A' },
          { name: 'montant', type: 'numérique', sample: 1 },
        ],
        sample: [{ dept: 'A', montant: 42 }],
        shape: 'array',
        emissions: 1,
      },
      q1: {
        status: 'loaded',
        rows: 8,
        fields: [{ name: 'dept', type: 'texte', sample: 'A' }],
        sample: [{ dept: 'A' }],
        shape: 'array',
        emissions: 1,
      },
    },
    order: ['src', 'q1'],
    sinceLastEventMs: 10,
    lastEventAt: 1_000_000,
    quiescent: true,
    delegation: { q1: { groupBy: false, aggregate: false, orderBy: false, where: false } },
    reseau: [],
    console: [],
    ...over,
  };
}

describe('l’anti-boucle ne doit PAS avaler run_and_trace', () => {
  it('run_and_trace est déclaré répétable', () => {
    expect(REPEATABLE_TOOLS.has('run_and_trace')).toBe(true);
  });

  it('la boucle le rejoue vraiment deux fois de suite', async () => {
    // LE test de non-regression. Sans l'exclusion, le second appel recevrait
    // « Déjà fourni ci-dessus » et le modele conclurait sans avoir verifie.
    const calls: string[] = [];
    let round = 0;
    const post = vi.fn<PostChat>(async () => {
      round += 1;
      if (round <= 2) {
        return {
          choices: [
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: `c${round}`,
                    type: 'function' as const,
                    function: { name: 'run_and_trace', arguments: '{}' },
                  },
                ],
              },
            },
          ],
        };
      }
      return {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'fin',
                  type: 'function' as const,
                  function: { name: 'finish', arguments: '{"message":"ok"}' },
                },
              ],
            },
          },
        ],
      };
    });

    const trace = makeTrace();
    await runStudioLoop({
      conversation: [{ role: 'user', content: 'pourquoi c’est vide ?' }],
      systemPrompt: 'test',
      document: createEmptyDashboard(),
      data: [],
      fields: [],
      sourceId: 'src',
      post,
      model: 'test',
      diagnostic: {
        attachment: () =>
          ({
            snapshot: () => {
              calls.push('snapshot');
              return trace;
            },
            waitForQuiescence: async () => true,
          }) as unknown as FrameAttachment,
        rerender: () => calls.push('rerender'),
        redactValues: () => false,
      },
    });

    expect(calls.filter((c) => c === 'rerender')).toHaveLength(2);
  });
});

describe('budget de tours', () => {
  it('le mode diagnostic en accorde davantage que la composition', async () => {
    // Observer -> hypothese -> correctif -> reobserver -> confirmer : cinq
    // tours minimum. Couper a 8 revenait a interrompre juste avant la
    // verification, le pire moment possible.
    const rounds = async (withDiagnostic: boolean) => {
      let n = 0;
      const post = vi.fn<PostChat>(async () => {
        n += 1;
        return {
          choices: [
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: `c${n}`,
                    type: 'function' as const,
                    function: { name: 'inspect_data', arguments: '{}' },
                  },
                ],
              },
            },
          ],
        };
      });
      await runStudioLoop({
        conversation: [],
        systemPrompt: 'test',
        document: createEmptyDashboard(),
        data: [{ a: 1 }],
        fields: [{ name: 'a', type: 'numérique', sample: 1 }],
        sourceId: 'src',
        post,
        model: 'test',
        ...(withDiagnostic
          ? {
              diagnostic: {
                attachment: () => null,
                rerender: () => {},
                redactValues: () => false,
              },
            }
          : {}),
      });
      return n;
    };

    expect(await rounds(false)).toBe(8);
    expect(await rounds(true)).toBe(12);
  });
});

describe('prompt système', () => {
  const base = {
    source: null,
    fields: [],
    sampleRecord: null,
    document: createEmptyDashboard(),
  };

  it('ne parle pas de diagnostic quand les outils sont absents', () => {
    expect(buildSystemPrompt(base)).not.toContain('run_and_trace');
  });

  it('explique la méthode quand ils sont là', () => {
    const prompt = buildSystemPrompt({ ...base, diagnostic: true });

    expect(prompt).toContain('run_and_trace');
    expect(prompt).toContain("PAR L'OBSERVATION");
    // Autorisation explicite : sans elle, un modele prudent s'interdirait de
    // rappeler l'outil et conclurait sans verifier.
    expect(prompt).toContain('deux fois de suite');
    expect(prompt).toContain('lister_constats');
  });

  it('ne pousse PAS la trace dans le prompt', () => {
    // Non bornee et changeante a chaque tour : la pousser la ferait payer a
    // chaque appel pour une information le plus souvent hors sujet.
    const prompt = buildSystemPrompt({ ...base, diagnostic: true });

    expect(prompt).not.toContain('Flux —');
    // Borne sur la partie redigee : le vocabulaire des blocs, engendre depuis
    // le schema des outils (#1109), grandit avec le modele de blocs et se
    // mesure a part. 7000 depuis #1111 : la section du bloc « component »
    // (quand s'en servir, fiche avant d'ecrire, flux et ids) y prend ~800 ;
    // 7300 depuis #1141 : attributs-champs et pagination serveur (~250).
    expect(prompt.length - describeBlockVocabulary().length).toBeLessThan(7300);
  });
});

describe('lister_constats dans la boucle du studio (#1010)', () => {
  it('est proposé au modèle et lit les constats fournis par le studio', async () => {
    let round = 0;
    const bodies: Record<string, unknown>[] = [];
    const post = vi.fn<PostChat>(async (body) => {
      bodies.push(body);
      round += 1;
      if (round === 1) {
        return {
          choices: [
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'c1',
                    type: 'function' as const,
                    function: { name: 'lister_constats', arguments: '{}' },
                  },
                ],
              },
            },
          ],
        };
      }
      return { choices: [{ message: { role: 'assistant', content: 'Voilà.' } }] };
    });

    await runStudioLoop({
      conversation: [{ role: 'user', content: 'pourquoi c’est vide ?' }],
      systemPrompt: 'test',
      document: createEmptyDashboard(),
      data: [],
      fields: [],
      sourceId: 'src',
      post,
      model: 'test',
      diagnostic: {
        attachment: () => null,
        rerender: () => {},
        redactValues: () => false,
        constats: () => [
          {
            id: 'pipeline/zero-ligne@q1',
            regle: 'pipeline/zero-ligne',
            gravite: 'avertissement',
            titre: 'q1 : aucune ligne',
            explication: 'x',
            reperes: [],
            preuve: 'q1 → 0 ligne',
            etape: 'q1',
          },
        ],
      },
    });

    const noms = (bodies[0].tools as { function: { name: string } }[]).map((t) => t.function.name);
    expect(noms).toContain('lister_constats');
    const retours = (bodies[1].messages as { role: string; content: string }[])
      .filter((m) => m.role === 'tool')
      .map((m) => m.content)
      .join('\n');
    expect(retours).toContain('1. pipeline/zero-ligne@q1 — [avertissement]');
  });
});
