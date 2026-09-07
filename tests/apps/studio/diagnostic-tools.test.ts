import { describe, it, expect, vi } from 'vitest';
import {
  DIAGNOSTIC_TOOLS,
  DIAGNOSTIC_TOOL_NAMES,
  REPEATABLE_TOOLS,
  humanizeDiagnosticStep,
  runDiagnosticTool,
  type DiagnosticContext,
} from '../../../apps/studio/src/ia/diagnostic-tools.js';
import { runStudioLoop } from '../../../apps/studio/src/ia/agent-loop.js';
import { buildSystemPrompt } from '../../../apps/studio/src/ia/system-prompt.js';
import { createEmptyDashboard } from '@dsfr-data/shared';
import type { FrameAttachment, Trace } from '@dsfr-data/shared';

/**
 * Outils de diagnostic de l'assistant (#607).
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
    quiescent: true,
    delegation: { q1: { groupBy: false, aggregate: false, orderBy: false, where: false } },
    ...over,
  };
}

function makeContext(trace: Trace | null, settled = true) {
  const rerender = vi.fn();
  const attachment = trace
    ? ({
        snapshot: () => trace,
        waitForQuiescence: async () => settled,
        current: () => null,
        sawEarlyBuffer: () => true,
        detach: () => {},
      } as unknown as FrameAttachment)
    : null;
  const ctx: DiagnosticContext = {
    attachment: () => attachment,
    rerender,
    redactValues: () => false,
  };
  return { ctx, rerender };
}

describe('schémas des outils', () => {
  it('sont plats — contrainte du décodage guidé vLLM', () => {
    // Meme contrainte que document.ts : un `oneOf` casse le decodage guide.
    const json = JSON.stringify(DIAGNOSTIC_TOOLS);
    expect(json).not.toContain('oneOf');
    expect(json).not.toContain('anyOf');
    expect(json).not.toContain('allOf');
  });

  it('déclarent additionalProperties: false partout', () => {
    for (const tool of DIAGNOSTIC_TOOLS) {
      expect(tool.function.parameters.additionalProperties).toBe(false);
    }
  });

  it('les noms déclarés correspondent au jeu d’exécution', () => {
    expect(new Set(DIAGNOSTIC_TOOLS.map((t) => t.function.name))).toEqual(
      new Set(DIAGNOSTIC_TOOL_NAMES)
    );
  });
});

describe('run_and_trace', () => {
  it('relance le rendu AVANT d’observer', async () => {
    // Observer sans relancer rendrait la trace du document precedent : le
    // modele conclurait que son correctif n'a rien change.
    const { ctx, rerender } = makeContext(makeTrace());

    await runDiagnosticTool('run_and_trace', {}, ctx);

    expect(rerender).toHaveBeenCalled();
  });

  it('rend le flux en texte français', async () => {
    const { ctx } = makeContext(makeTrace());

    const out = await runDiagnosticTool('run_and_trace', {}, ctx);

    expect(out).toContain('Flux —');
    expect(out).toContain('src');
    expect(out).toContain('reçoit 100 lignes ← src');
  });

  it('avertit quand le relevé est pris en plein vol', async () => {
    // Un etat intermediaire presente comme final ferait conclure le modele
    // sur des chiffres provisoires.
    const { ctx } = makeContext(makeTrace({ quiescent: false }), false);

    expect(await runDiagnosticTool('run_and_trace', {}, ctx)).toContain('ATTENTION');
  });

  it('explique l’absence d’aperçu au lieu de jeter', async () => {
    const { ctx } = makeContext(null);

    const out = await runDiagnosticTool('run_and_trace', {}, ctx);

    expect(out).toContain('Aucun aperçu observable');
  });

  it('nomme les champs présents en entrée et absents en sortie', async () => {
    // Le mode de panne le plus frequent : un champ renomme en amont vide
    // tout l'aval sans lever la moindre erreur.
    const { ctx } = makeContext(makeTrace());

    const out = await runDiagnosticTool('run_and_trace', {}, ctx);

    expect(out).toContain('Champs présents en entrée mais absents en sortie');
    expect(out).toContain('montant');
  });
});

describe('inspect_stage', () => {
  it('détaille une étape', async () => {
    const { ctx } = makeContext(makeTrace());

    const out = await runDiagnosticTool('inspect_stage', { node_id: 'src' }, ctx);

    expect(out).toContain('Étape src — dsfr-data-source');
    expect(out).toContain('api-type="tabular"');
    expect(out).toContain('dept (texte)');
  });

  it('liste les étapes connues quand l’id est faux', async () => {
    // Rendre « introuvable » sans dire ce qui existe ferait deviner le
    // modele — et gaspiller un tour.
    const { ctx } = makeContext(makeTrace());

    const out = await runDiagnosticTool('inspect_stage', { node_id: 'inexistant' }, ctx);

    expect(out).toContain("n'existe pas");
    expect(out).toContain('src, q1');
  });

  it('rend l’URL réellement appelée sur un échec (#603)', async () => {
    const trace = makeTrace();
    trace.states.src = {
      status: 'error',
      message: 'HTTP 400: Bad Request',
      attemptedUrl: 'https://api.fr/x?dept__groupby=yes',
      emissions: 0,
    };
    const { ctx } = makeContext(trace);

    const out = await runDiagnosticTool('inspect_stage', { node_id: 'src' }, ctx);

    expect(out).toContain('ÉCHEC : HTTP 400: Bad Request');
    expect(out).toContain('https://api.fr/x?dept__groupby=yes');
  });

  it('dit où chaque opération s’est exécutée', async () => {
    const { ctx } = makeContext(makeTrace());

    expect(await runDiagnosticTool('inspect_stage', { node_id: 'q1' }, ctx)).toContain(
      'Délégation : groupBy=client'
    );
  });
});

describe('confidentialité', () => {
  it('masque les valeurs mais garde comptes et champs', async () => {
    // La trace part vers un service externe : pour une source ministerielle,
    // on veut le diagnostic sans les donnees.
    const trace = makeTrace();
    trace.states.src.sample = [{ dept: 'A', montant: 42 }];
    const ctx: DiagnosticContext = {
      attachment: () =>
        ({
          snapshot: () => trace,
          waitForQuiescence: async () => true,
        }) as unknown as FrameAttachment,
      rerender: () => {},
      redactValues: () => true,
    };

    const out = await runDiagnosticTool('inspect_stage', { node_id: 'src' }, ctx);

    expect(out).not.toContain('42');
    expect(out).toContain('dept (texte)');
    expect(out).toContain('100 ligne');
  });
});

describe('l’anti-boucle ne doit PAS avaler run_and_trace', () => {
  it('run_and_trace est déclaré répétable', () => {
    expect(REPEATABLE_TOOLS.has('run_and_trace')).toBe(true);
  });

  it('tous les outils de diagnostic sont répétables — ils observent du mutable', () => {
    for (const name of DIAGNOSTIC_TOOL_NAMES) {
      expect(REPEATABLE_TOOLS.has(name), `${name} doit être répétable`).toBe(true);
    }
  });

  it('la boucle le rejoue vraiment deux fois de suite', async () => {
    // LE test de non-regression. Sans l'exclusion, le second appel recevrait
    // « Déjà fourni ci-dessus » et le modele conclurait sans avoir verifie.
    const calls: string[] = [];
    let round = 0;
    const post = vi.fn(async () => {
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
      const post = vi.fn(async () => {
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
  });

  it('ne pousse PAS la trace dans le prompt', () => {
    // Non bornee et changeante a chaque tour : la pousser la ferait payer a
    // chaque appel pour une information le plus souvent hors sujet.
    const prompt = buildSystemPrompt({ ...base, diagnostic: true });

    expect(prompt).not.toContain('Flux —');
    expect(prompt.length).toBeLessThan(4000);
  });
});

describe('libellés de progression', () => {
  it('nomme chaque outil en français', () => {
    expect(humanizeDiagnosticStep('run_and_trace', {})).toContain('relance');
    expect(humanizeDiagnosticStep('inspect_stage', { node_id: 'q1' })).toContain('q1');
    expect(humanizeDiagnosticStep('inconnu', {})).toBeNull();
  });
});
