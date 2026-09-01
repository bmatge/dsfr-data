/**
 * Sonde client des capacites Albert (#526) — transport mocke (ProbeIO).
 *
 * Ce qui est verifie : les capacites detectees sont PERSISTEES via
 * setCapabilities (le chainon manquant de #514), le mode serveur explique que
 * le rerank n'est pas sondable au lieu d'echouer, et un gateway injoignable ne
 * retrograde pas les capacites memorisees.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { runCapabilityProbe, type ProbeIO } from '../../../apps/builder-ia/src/ia/capability-probe';
import {
  getCapabilities,
  resetCapabilities,
  setCapabilities,
} from '../../../apps/builder-ia/src/ia/albert-capabilities';

const okChat = (content = 'OK') => ({
  status: 200,
  json: { choices: [{ message: { role: 'assistant', content } }] },
});

beforeEach(() => resetCapabilities());

describe('runCapabilityProbe (#526)', () => {
  it('mode utilisateur, tout OK : detecte et PERSISTE jsonSchema/toolCalling/rerank', async () => {
    const io: ProbeIO = {
      model: 'openweight-large',
      serverMode: false,
      apiUrl: 'https://albert.api.etalab.gouv.fr/v1/chat/completions',
      chat: async (body) => (body.response_format ? okChat('{"ok": true}') : okChat()),
      get: async () => ({
        status: 200,
        json: { data: [{ id: 'bge-reranker-v2-m3', type: 'text-classification' }] },
      }),
      post: async (url) => {
        expect(url).toBe('https://albert.api.etalab.gouv.fr/v1/rerank');
        return {
          status: 200,
          json: {
            results: [
              { index: 0, relevance_score: 0.9 },
              { index: 1, relevance_score: 0.1 },
            ],
          },
        };
      },
    };

    const report = await runCapabilityProbe(io);
    expect(report.steps.every((s) => s.ok)).toBe(true);
    expect(report.capabilities).toMatchObject({
      jsonSchema: true,
      toolCalling: true,
      rerank: true,
      rerankModel: 'bge-reranker-v2-m3',
    });
    // Persistance : c'est TOUT l'objet de l'issue.
    expect(getCapabilities()?.rerank).toBe(true);
    expect(getCapabilities()?.rerankModel).toBe('bge-reranker-v2-m3');
  });

  it('mode serveur : sonde chat mais explique que le rerank est non sondable', async () => {
    const io: ProbeIO = {
      model: 'albert-large',
      serverMode: true,
      chat: async (body) => (body.response_format ? okChat('{"ok": true}') : okChat()),
    };
    const report = await runCapabilityProbe(io);
    expect(report.capabilities.jsonSchema).toBe(true);
    expect(report.capabilities.toolCalling).toBe(true);
    expect(report.capabilities.rerank).toBe(false);
    const rerankStep = report.steps.find((s) => s.name.includes('Rerank'));
    expect(rerankStep?.ok).toBe(false);
    expect(rerankStep?.detail).toContain('mode jeton serveur');
    expect(getCapabilities()?.probedAt).toBeGreaterThan(0);
  });

  it('rerank : retombe sur les modeles connus si /v1/models est muet', async () => {
    const tried: string[] = [];
    const io: ProbeIO = {
      model: 'openweight-large',
      serverMode: false,
      apiUrl: 'https://albert.api.etalab.gouv.fr/v1/chat/completions',
      chat: async (body) => (body.response_format ? okChat('{"ok": true}') : okChat()),
      get: async () => ({ status: 500, json: {} }),
      post: async (_url, body) => {
        tried.push(String(body.model));
        return {
          status: 200,
          json: {
            results: [
              { index: 0, relevance_score: 1 },
              { index: 1, relevance_score: 0 },
            ],
          },
        };
      },
    };
    const report = await runCapabilityProbe(io);
    expect(report.capabilities.rerank).toBe(true);
    expect(tried[0]).toBe('bge-reranker-v2-m3');
  });

  it('gateway injoignable : rapport en echec mais capacites memorisees INTACTES', async () => {
    setCapabilities({
      model: 'openweight-large',
      jsonSchema: true,
      toolCalling: true,
      rerank: true,
      rerankModel: 'bge-reranker-v2-m3',
      probedAt: 111,
    });
    const io: ProbeIO = {
      model: 'openweight-large',
      serverMode: true,
      chat: async () => ({ status: 503, json: {} }),
    };
    const report = await runCapabilityProbe(io);
    expect(report.steps[0].ok).toBe(false);
    // Pas de retrogradation sur incident reseau : la sonde precedente fait foi.
    expect(getCapabilities()?.rerank).toBe(true);
    expect(getCapabilities()?.probedAt).toBe(111);
  });

  it('capacite refusee par le gateway (tools en 400) : detectee a false', async () => {
    const io: ProbeIO = {
      model: 'openweight-large',
      serverMode: true,
      chat: async (body) => {
        if (body.tools) return { status: 400, json: { error: { message: 'tools unsupported' } } };
        return body.response_format ? okChat('{"ok": true}') : okChat();
      },
    };
    const report = await runCapabilityProbe(io);
    expect(report.capabilities.toolCalling).toBe(false);
    expect(report.capabilities.jsonSchema).toBe(true);
  });
});
