/**
 * Rerank souverain des skills via Albert /v1/rerank (#514).
 *
 * L'endpoint n'est PAS sollicite ici : tout passe par un `fetch` injecte. Ce
 * qui est verifie, c'est la propriete qui compte — le rerank ne peut jamais
 * degrader le service. Chaque mode de defaillance imaginable doit rendre
 * l'ordre local inchange.
 */
import { describe, it, expect, vi } from 'vitest';
import { rerankSkills, rerankUrlFrom } from '../../../apps/builder-ia/src/ia/skill-rerank';
import type { SkillMatch, MatchableSkill } from '../../../apps/builder-ia/src/skill-matching';

const skill = (id: string): MatchableSkill => ({
  id,
  name: id,
  description: `description de ${id}`,
  trigger: [],
  content: '',
});

const candidates: Array<SkillMatch> = ['a', 'b', 'c'].map((id, i) => ({
  skill: skill(id),
  score: 30 - i,
  reasons: [],
}));

const ids = (list: Array<SkillMatch>) => list.map((m) => m.skill.id);

const OPTS = {
  apiUrl: 'https://albert.api.etalab.gouv.fr/v1/chat/completions',
  token: 'tok',
  model: 'albert-rerank',
};

/**
 * Reponse bien formee qui inverse l'ordre — ANCIENNE forme `data[].score`
 * (docs albert-api historiques), gardee en repli tolerant par le client.
 */
const reversingFetch = () =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: [
        { index: 0, score: 0.1 },
        { index: 1, score: 0.5 },
        { index: 2, score: 0.9 },
      ],
    }),
  });

/** Forme REELLE d'OpenGateLLM (#526) : results[].relevance_score. */
const reversingFetchOpenGate = () =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      results: [
        { index: 0, relevance_score: 0.1 },
        { index: 1, relevance_score: 0.5 },
        { index: 2, relevance_score: 0.9 },
      ],
    }),
  });

describe('rerankSkills (#514)', () => {
  it('derive /v1/rerank depuis l’URL de chat configuree', () => {
    expect(rerankUrlFrom(OPTS.apiUrl)).toBe('https://albert.api.etalab.gouv.fr/v1/rerank');
    expect(rerankUrlFrom('pas-une-url')).toBe('');
  });

  it('reordonne selon les scores renvoyes (forme historique data[].score)', async () => {
    const fetchImpl = reversingFetch();
    const out = await rerankSkills('carte', candidates, {
      ...OPTS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(ids(out)).toEqual(['c', 'b', 'a']);
  });

  it('reordonne selon la forme reelle OpenGateLLM (results[].relevance_score, #526)', async () => {
    const fetchImpl = reversingFetchOpenGate();
    const out = await rerankSkills('carte', candidates, {
      ...OPTS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(ids(out)).toEqual(['c', 'b', 'a']);
  });

  it('envoie la forme de requete OpenGateLLM : model + query + documents (#526)', async () => {
    const fetchImpl = reversingFetchOpenGate();
    await rerankSkills('carte', candidates, {
      ...OPTS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.query).toBe('carte');
    expect(Array.isArray(body.documents)).toBe(true);
    expect(body.prompt).toBeUndefined();
    expect(body.input).toBeUndefined();
  });

  it('n’envoie que nom et description, jamais le contenu des fiches', async () => {
    const fetchImpl = reversingFetch();
    const gros = candidates.map((m) => ({
      ...m,
      skill: { ...m.skill, content: 'X'.repeat(20000) },
    }));
    await rerankSkills('carte', gros, { ...OPTS, fetchImpl: fetchImpl as unknown as typeof fetch });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.documents).toEqual([
      'a — description de a',
      'b — description de b',
      'c — description de c',
    ]);
    expect(JSON.stringify(body)).not.toContain('XXXX');
  });

  it('conserve les scores locaux (ils expliquent la candidature)', async () => {
    const fetchImpl = reversingFetch();
    const out = await rerankSkills('carte', candidates, {
      ...OPTS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.map((m) => m.score).sort((x, y) => y - x)).toEqual([30, 29, 28]);
  });

  describe('repli local — le rerank ne doit jamais degrader le service', () => {
    const expectUnchanged = async (fetchImpl: unknown) => {
      const out = await rerankSkills('carte', candidates, {
        ...OPTS,
        fetchImpl: fetchImpl as typeof fetch,
      });
      expect(ids(out)).toEqual(['a', 'b', 'c']);
    };

    it('sur erreur HTTP', async () => {
      await expectUnchanged(vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    });

    it('sur panne reseau', async () => {
      await expectUnchanged(vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    });

    it('sur JSON invalide', async () => {
      await expectUnchanged(
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => {
            throw new Error('invalid json');
          },
        })
      );
    });

    it('sur reponse partielle (moins d’entrees que de candidats)', async () => {
      await expectUnchanged(
        vi
          .fn()
          .mockResolvedValue({ ok: true, json: async () => ({ data: [{ index: 0, score: 1 }] }) })
      );
    });

    it('sur index hors bornes', async () => {
      await expectUnchanged(
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            data: [
              { index: 0, score: 1 },
              { index: 1, score: 2 },
              { index: 99, score: 3 },
            ],
          }),
        })
      );
    });

    it('sur score manquant', async () => {
      await expectUnchanged(
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            data: [{ index: 0 }, { index: 1, score: 2 }, { index: 2, score: 3 }],
          }),
        })
      );
    });

    it('sur depassement du delai', async () => {
      const fetchImpl = vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('aborted')));
          })
      );
      const out = await rerankSkills('carte', candidates, {
        ...OPTS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 10,
      });
      expect(ids(out)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('court-circuits — aucun appel reseau inutile', () => {
    it('sans token', async () => {
      const fetchImpl = reversingFetch();
      await rerankSkills('carte', candidates, {
        ...OPTS,
        token: '',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('sans modele de rerank confirme par la sonde', async () => {
      const fetchImpl = reversingFetch();
      await rerankSkills('carte', candidates, {
        ...OPTS,
        model: '',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('avec moins de deux candidats (rien a reclasser)', async () => {
      const fetchImpl = reversingFetch();
      await rerankSkills('carte', candidates.slice(0, 1), {
        ...OPTS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  it('borne la charge utile et garde la queue dans l’ordre local', async () => {
    const many: Array<SkillMatch> = Array.from({ length: 14 }, (_v, i) => ({
      skill: skill(`s${i}`),
      score: 100 - i,
      reasons: [],
    }));
    // Reponse identite sur les 10 premiers.
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: Array.from({ length: 10 }, (_v, i) => ({ index: i, score: 10 - i })),
      }),
    });
    const out = await rerankSkills('carte', many, {
      ...OPTS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.documents).toHaveLength(10);
    expect(out).toHaveLength(14);
    expect(ids(out).slice(10)).toEqual(['s10', 's11', 's12', 's13']);
  });
});
