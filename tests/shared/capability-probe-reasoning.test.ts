/**
 * Sonde des capacites face a un modele a raisonnement (#1142).
 *
 * En prod, « Sonder les capacites » affichait « Echec · Completion simple —
 * HTTP 200 » puis « Echec de connexion : capacites non memorisees ». Cause :
 * le modele par defaut (openweight-large = gpt-oss-120b) raisonne avant de
 * repondre ; avec 30 jetons, le raisonnement consommait tout et
 * `message.content` revenait vide ou `null` (`reasoning_content` rempli,
 * `finish_reason: "length"`). La sonde prenait ce 200 pour une panne.
 *
 * Les reponses simulees reproduisent la forme gpt-oss : le jeton Albert repond
 * 403 en direct, seul le proxy du VPS l'accepte — pas de sonde reelle en local.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PROBE_MAX_COMPLETION_TOKENS,
  explainEmptyContent,
  probeConclusion,
  runCapabilityProbe,
  type ProbeHttpResult,
  type ProbeIO,
} from '../../packages/shared/src/ia/capability-probe';
import {
  getCapabilities,
  resetCapabilities,
  setCapabilities,
} from '../../packages/shared/src/ia/albert-capabilities';

/** Reponse gpt-oss a court de jetons : texte vide, raisonnement rempli. */
const gptOssVide = (content: string | null = ''): ProbeHttpResult => ({
  status: 200,
  json: {
    choices: [
      {
        index: 0,
        finish_reason: 'length',
        message: {
          role: 'assistant',
          content,
          reasoning_content: 'The user wants me to answer only "OK". I should',
        },
      },
    ],
  },
});

const ok = (content = 'OK'): ProbeHttpResult => ({
  status: 200,
  json: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }] },
});

/** Transport qui enregistre les corps envoyes. */
function transport(repondre: (body: Record<string, unknown>) => ProbeHttpResult): {
  io: ProbeIO;
  corps: Record<string, unknown>[];
} {
  const corps: Record<string, unknown>[] = [];
  return {
    corps,
    io: {
      model: 'openweight-large',
      serverMode: true,
      chat: async (body) => {
        corps.push(body);
        return repondre(body);
      },
    },
  };
}

beforeEach(() => resetCapabilities());

describe('sonde : un HTTP 200 bien forme prouve la connexion (#1142)', () => {
  it('gpt-oss, content vide + finish_reason=length : connexion OK, capacites memorisees', async () => {
    const { io } = transport((body) => (body.tools ? ok('') : gptOssVide('')));
    const report = await runCapabilityProbe(io);

    const simple = report.steps[0];
    expect(simple.name).toBe('Completion simple');
    expect(simple.ok).toBe(true);
    expect(simple.detail).toContain('Connexion OK (HTTP 200)');
    expect(simple.detail).toContain('budget de jetons');
    expect(simple.detail).toContain('finish_reason=length');
    expect(report.connexion).toBe('ok');
    expect(report.memorise).toBe(true);
    expect(getCapabilities()?.toolCalling).toBe(true);
    expect(probeConclusion(report)).toMatch(/^Capacités mémorisées/);
    expect(probeConclusion(report)).not.toContain('Échec de connexion');
  });

  it('content null (et non chaine vide) : meme verdict, pas d’exception', async () => {
    const { io } = transport(() => gptOssVide(null));
    const report = await runCapabilityProbe(io);
    expect(report.steps[0].ok).toBe(true);
    expect(report.connexion).toBe('ok');
  });

  it('json_schema a court de jetons : « non concluant », jamais une erreur HTTP', async () => {
    const { io } = transport((body) => (body.response_format ? gptOssVide('') : ok()));
    const report = await runCapabilityProbe(io);
    const json = report.steps.find((s) => s.name.startsWith('Structured'));
    expect(json?.ok).toBe(false);
    expect(json?.detail).toContain('non concluant');
    expect(json?.detail).toContain('finish_reason=length');
    expect(json?.detail).not.toMatch(/^HTTP 200$/);
  });

  it('budget de jetons suffisant a TOUTES les etapes de chat (30 epuisait gpt-oss)', async () => {
    const { io, corps } = transport((body) => (body.response_format ? ok('{"ok": true}') : ok()));
    await runCapabilityProbe(io);
    expect(corps.length).toBe(3);
    for (const body of corps) {
      expect(body.max_completion_tokens).toBe(PROBE_MAX_COMPLETION_TOKENS);
    }
    expect(PROBE_MAX_COMPLETION_TOKENS).toBeGreaterThanOrEqual(256);
  });

  it('explique un texte reste dans le raisonnement sans finish_reason=length', () => {
    const detail = explainEmptyContent({
      choices: [{ finish_reason: 'stop', message: { content: '', reasoning: 'OK' } }],
    });
    expect(detail).toContain('raisonnement');
  });
});

describe('sonde : les vraies erreurs restent des erreurs (#1142)', () => {
  it('HTTP 403 : echec, message du gateway, capacites intactes, conclusion precise', async () => {
    setCapabilities({
      model: 'openweight-large',
      jsonSchema: true,
      toolCalling: true,
      rerank: false,
      rerankModel: '',
      probedAt: 42,
    });
    const { io } = transport(() => ({
      status: 403,
      json: { error: { message: 'Invalid API key' } },
    }));
    const report = await runCapabilityProbe(io);
    expect(report.steps[0].ok).toBe(false);
    expect(report.steps[0].detail).toBe('HTTP 403 : Invalid API key');
    expect(report.connexion).toBe('erreur-http');
    expect(report.memorise).toBe(false);
    expect(getCapabilities()?.probedAt).toBe(42);
    expect(probeConclusion(report)).toContain('HTTP 403');
    expect(probeConclusion(report)).toContain('capacités non mémorisées');
  });

  it('HTTP 200 sans choices : reponse inattendue, pas « connexion OK »', async () => {
    const { io } = transport(() => ({ status: 200, json: { object: 'list', data: [] } }));
    const report = await runCapabilityProbe(io);
    expect(report.steps[0].ok).toBe(false);
    expect(report.connexion).toBe('reponse-inattendue');
    expect(probeConclusion(report)).toContain('réponse inattendue');
  });

  it('transport en exception : gateway injoignable', async () => {
    const io: ProbeIO = {
      model: 'openweight-large',
      serverMode: true,
      chat: async () => {
        throw new TypeError('Failed to fetch');
      },
    };
    const report = await runCapabilityProbe(io);
    expect(report.connexion).toBe('injoignable');
    expect(probeConclusion(report)).toMatch(/^Gateway injoignable/);
  });
});
