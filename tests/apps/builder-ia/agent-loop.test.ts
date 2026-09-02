import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop } from '../../../apps/builder-ia/src/ia/agent-loop';

function toolCallMsg(name: string, args: unknown, content = '') {
  return {
    choices: [
      {
        message: {
          content,
          tool_calls: [
            {
              id: `call_${name}`,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  };
}

const baseOpts = {
  conversation: [{ role: 'user' as const, content: 'barres population par region' }],
  systemPrompt: 'system',
  source: null,
  model: 'openweight-large',
  temperature: 0.1,
};

describe('builder-ia agent-loop', () => {
  it('consulte un skill puis termine sur create_chart', async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(toolCallMsg('get_relevant_skills', { message: 'barres population' }))
      .mockResolvedValueOnce(
        toolCallMsg(
          'create_chart',
          {
            message: 'Voici votre graphique',
            config: { type: 'bar', valueField: 'population', labelField: 'region' },
          },
          'Voici'
        )
      );
    let progress: string[] = [];

    const result = await runAgentLoop({
      ...baseOpts,
      post,
      onProgress: (steps) => {
        progress = steps;
      },
    });

    expect(post).toHaveBeenCalledTimes(2);
    expect(result.action?.action).toBe('createChart');
    expect(result.action?.config?.type).toBe('bar');
    expect(result.text).toBe('Voici votre graphique');
    // L'etape de consultation a ete humanisee, accumulee et exposee.
    expect(progress).toContain('Je cherche les bons réglages…');
    expect(result.steps).toContain('Je cherche les bons réglages…');

    // Le 2e appel contient un message role:"tool" (resultat du lookup) accumule.
    const secondBody = post.mock.calls[1][0] as { messages: { role: string }[] };
    expect(secondBody.messages.some((m) => m.role === 'tool')).toBe(true);
    expect(secondBody.messages.some((m) => m.role === 'assistant')).toBe(true);
  });

  it('get_skill(section) ne renvoie que la section demandee (#513)', async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(
        toolCallMsg('get_skill', { skill_id: 'dsfrDataChart', section: 'reference' })
      )
      .mockResolvedValueOnce(
        toolCallMsg('create_chart', {
          message: 'ok',
          config: { type: 'bar', valueField: 'v', labelField: 'l' },
        })
      );
    let progress: string[] = [];

    await runAgentLoop({
      ...baseOpts,
      post,
      onProgress: (steps) => {
        progress = steps;
      },
    });

    const secondBody = post.mock.calls[1][0] as { messages: { role: string; content: string }[] };
    const toolMsg = secondBody.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('### Référence `<dsfr-data-chart>`');
    // La partie redigee a la main ne doit PAS etre embarquee : c'est tout
    // l'interet de l'adressage par section.
    expect(toolMsg?.content).not.toContain('### Exemples');
    expect(progress).toContain('Je consulte « reference » dans la fiche « dsfrDataChart »…');
  });

  it('get_skill sans section reste retrocompatible (fiche entiere)', async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(toolCallMsg('get_skill', { skill_id: 'dsfrDataChart' }))
      .mockResolvedValueOnce(
        toolCallMsg('create_chart', {
          message: 'ok',
          config: { type: 'bar', valueField: 'v', labelField: 'l' },
        })
      );

    await runAgentLoop({ ...baseOpts, post });

    const secondBody = post.mock.calls[1][0] as { messages: { role: string; content: string }[] };
    const toolMsg = secondBody.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('### Référence `<dsfr-data-chart>`');
    expect(toolMsg?.content).toContain('### Exemples');
  });

  it('applique le rerank injecte sur get_relevant_skills (#514)', async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(toolCallMsg('get_relevant_skills', { message: 'graphique barres' }))
      .mockResolvedValueOnce(
        toolCallMsg('create_chart', {
          message: 'ok',
          config: { type: 'bar', valueField: 'v', labelField: 'l' },
        })
      );
    // Le hook inverse l'ordre : on verifie que la boucle respecte l'ordre rendu.
    const rerank = vi.fn(async (_msg: string, skills: { id: string }[]) => [...skills].reverse());

    await runAgentLoop({
      ...baseOpts,
      post,
      rerankSkills: rerank as never,
    });

    expect(rerank).toHaveBeenCalledOnce();
    const [message, skills] = rerank.mock.calls[0];
    expect(message).toBe('graphique barres');
    expect(skills.length).toBeGreaterThan(1);

    const second = post.mock.calls[1][0] as { messages: { role: string; content: string }[] };
    const toolMsg = second.messages.find((m) => m.role === 'tool')?.content ?? '';
    const first = skills[0] as unknown as { name: string };
    const last = skills[skills.length - 1] as unknown as { name: string };
    // L'ordre inverse doit se lire dans le contexte remis au modele.
    expect(toolMsg.indexOf(last.name)).toBeLessThan(toolMsg.indexOf(first.name));
  });

  it('sans hook de rerank, garde l’ordre du scoring local', async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(toolCallMsg('get_relevant_skills', { message: 'graphique barres' }))
      .mockResolvedValueOnce(
        toolCallMsg('create_chart', {
          message: 'ok',
          config: { type: 'bar', valueField: 'v', labelField: 'l' },
        })
      );

    await runAgentLoop({ ...baseOpts, post });

    const second = post.mock.calls[1][0] as { messages: { role: string; content: string }[] };
    expect(second.messages.some((m) => m.role === 'tool')).toBe(true);
  });

  it('respecte MAX_ROUNDS si le modele boucle sur les lookups', async () => {
    // Renvoie toujours un lookup different (sinon le garde anti-repetition coupe avant).
    let n = 0;
    const post = vi.fn().mockImplementation(() => {
      n += 1;
      return Promise.resolve(toolCallMsg('get_relevant_skills', { message: `essai ${n}` }));
    });

    const result = await runAgentLoop({ ...baseOpts, post });

    expect(post).toHaveBeenCalledTimes(6); // MAX_ROUNDS
    expect(result.action).toBeNull();
  });

  const TEST_DATA = [
    { region: 'Bretagne', population: 3000 },
    { region: 'Normandie', population: 3300 },
    { region: 'Bretagne', population: 100 },
  ];

  it('inspecte la donnee puis genere — le resultat du tool est remis au modele', async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(toolCallMsg('inspect_data', {}))
      .mockResolvedValueOnce(
        toolCallMsg('create_chart', {
          message: 'ok',
          config: { type: 'bar', valueField: 'population', labelField: 'region' },
        })
      );

    const result = await runAgentLoop({ ...baseOpts, data: TEST_DATA, post });

    expect(result.action?.action).toBe('createChart');
    // Le 2e appel contient le resultat d'inspect_data (panorama des champs).
    const secondBody = post.mock.calls[1][0] as { messages: { role: string; content: string }[] };
    const toolMsg = secondBody.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('population');
    expect(toolMsg?.content).toContain('region');
  });

  it('auto-correction : un create_chart casse est renvoye au modele puis corrige', async () => {
    const post = vi
      .fn()
      // 1) champ inexistant → la boucle NE termine PAS, renvoie le diagnostic.
      .mockResolvedValueOnce(
        toolCallMsg('create_chart', {
          message: 'essai',
          config: { type: 'bar', valueField: 'inexistant', labelField: 'region' },
        })
      )
      // 2) config corrigee → termine.
      .mockResolvedValueOnce(
        toolCallMsg('create_chart', {
          message: 'corrige',
          config: { type: 'bar', valueField: 'population', labelField: 'region' },
        })
      );

    const result = await runAgentLoop({ ...baseOpts, data: TEST_DATA, post });

    expect(post).toHaveBeenCalledTimes(2); // a du reboucler
    expect(result.action?.config?.valueField).toBe('population');
    // Le diagnostic d'erreur a bien ete injecte comme resultat de tool.
    const secondBody = post.mock.calls[1][0] as { messages: { role: string; content: string }[] };
    const toolMsg = secondBody.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('inexistant');
  });

  it('retourne une reponse conversationnelle quand pas de tool_call', async () => {
    const post = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Bonjour, que veux-tu visualiser ?', tool_calls: [] } }],
    });

    const result = await runAgentLoop({ ...baseOpts, post });

    expect(post).toHaveBeenCalledTimes(1);
    expect(result.action).toBeNull();
    expect(result.text).toBe('Bonjour, que veux-tu visualiser ?');
  });
});
