/**
 * Sonde des capacites Albert cote client (#526) — rejoue dans le navigateur ce
 * que fait `scripts/probe-albert.ts`, a travers les proxys de l'app :
 *
 *   1. completion simple          (le gateway repond)
 *   2. response_format json_schema (Structured Outputs)
 *   3. tools / tool_choice         (boucle agentique)
 *   4. /v1/rerank                  (#514) — mode jeton UTILISATEUR uniquement :
 *      en mode serveur le jeton n'atteint jamais le navigateur, donc le rerank
 *      n'est pas sondable ni activable ici, PAR CONCEPTION — la sonde le dit
 *      au lieu d'echouer en silence.
 *
 * Le resultat alimente `setCapabilities()` : c'etait le chainon manquant —
 * jusqu'ici aucune UI n'appelait ce setter, et `rerank` (false par defaut,
 * volontairement) n'avait aucun chemin d'activation.
 *
 * Transport injecte (`ProbeIO`) : le module reste testable et agnostique du
 * choix serveur-defaut vs jeton utilisateur, que seul l'appelant connait.
 */

import { setCapabilities, type AlbertCapabilities } from './albert-capabilities.js';
import { rerankUrlFrom } from './skill-rerank.js';

/** Reponse HTTP minimale remontee par le transport injecte. */
export interface ProbeHttpResult {
  status: number;
  json: unknown;
}

export interface ProbeIO {
  /** POST chat/completions (via /ia-proxy-default ou /ia-proxy). */
  chat(body: Record<string, unknown>): Promise<ProbeHttpResult>;
  /** Modele de chat a sonder. */
  model: string;
  /** Vrai si le jeton est cote serveur (rerank non sondable). */
  serverMode: boolean;
  /** URL du gateway (derive /v1/models et /v1/rerank). Mode utilisateur. */
  apiUrl?: string;
  /** GET brut vers le gateway (mode utilisateur, via /ia-proxy). */
  get?(url: string): Promise<ProbeHttpResult>;
  /** POST brut vers le gateway (mode utilisateur, via /ia-proxy). */
  post?(url: string, body: Record<string, unknown>): Promise<ProbeHttpResult>;
}

export interface ProbeStep {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ProbeReport {
  capabilities: AlbertCapabilities;
  steps: ProbeStep[];
}

/** Modeles de rerank a essayer si /v1/models est muet (verifie le 2026-09-01). */
const RERANK_FALLBACK_MODELS = ['bge-reranker-v2-m3', 'BAAI/bge-reranker-v2-m3'];

function contentOf(json: unknown): string {
  const msg = (json as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message;
  return msg?.content ?? '';
}

function hasToolCall(json: unknown): boolean {
  const msg = (
    json as {
      choices?: { message?: { tool_calls?: { function?: { name?: string } }[] } }[];
    }
  )?.choices?.[0]?.message;
  return Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0;
}

/** Lignes de score des deux formes de reponse rerank (cf. skill-rerank.ts). */
function rerankScores(json: unknown): number[] {
  const body = json as {
    results?: { relevance_score?: number }[];
    data?: { score?: number }[];
  };
  const rows = Array.isArray(body.results)
    ? body.results.map((r) => r.relevance_score)
    : (body.data ?? []).map((r) => r.score);
  return rows.filter((s): s is number => typeof s === 'number');
}

/**
 * Execute la sonde et PERSISTE le resultat via setCapabilities().
 * Ne jette jamais : chaque etape encaisse son erreur dans son rapport.
 */
export async function runCapabilityProbe(io: ProbeIO): Promise<ProbeReport> {
  const steps: ProbeStep[] = [];
  const base = { model: io.model, max_completion_tokens: 30, temperature: 0 };

  // 1) Completion simple — si elle echoue, rien d'autre n'est interpretable.
  let alive = false;
  try {
    const res = await io.chat({
      ...base,
      messages: [{ role: 'user', content: 'Réponds uniquement: OK' }],
    });
    alive = res.status === 200 && contentOf(res.json).length > 0;
    steps.push({
      name: 'Completion simple',
      ok: alive,
      detail: alive ? `OK (HTTP ${res.status})` : `HTTP ${res.status}`,
    });
  } catch (err) {
    steps.push({ name: 'Completion simple', ok: false, detail: String(err) });
  }
  if (!alive) {
    const capabilities: AlbertCapabilities = {
      model: io.model,
      jsonSchema: false,
      toolCalling: false,
      rerank: false,
      rerankModel: '',
      probedAt: Date.now(),
    };
    // On ne persiste PAS un echec de connectivite : ce serait retrograder des
    // capacites peut-etre valides a cause d'un incident reseau passager.
    return { capabilities, steps };
  }

  // 2) response_format json_schema
  let jsonSchema = false;
  try {
    const res = await io.chat({
      ...base,
      messages: [{ role: 'user', content: 'Renvoie {"ok": true}' }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'probe',
          strict: true,
          schema: {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
            additionalProperties: false,
          },
        },
      },
    });
    let parses = false;
    try {
      parses = typeof JSON.parse(contentOf(res.json)) === 'object';
    } catch {
      parses = false;
    }
    jsonSchema = res.status === 200 && parses;
    steps.push({
      name: 'Structured outputs (json_schema)',
      ok: jsonSchema,
      detail: jsonSchema ? 'OK' : `HTTP ${res.status}${parses ? '' : ', JSON non conforme'}`,
    });
  } catch (err) {
    steps.push({ name: 'Structured outputs (json_schema)', ok: false, detail: String(err) });
  }

  // 3) tools / tool_choice
  let toolCalling = false;
  try {
    const res = await io.chat({
      ...base,
      messages: [{ role: 'user', content: 'Appelle l’outil ping.' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'ping',
            description: 'Repond pong',
            parameters: { type: 'object', properties: {}, additionalProperties: false },
          },
        },
      ],
      tool_choice: 'auto',
    });
    // Le gateway qui ACCEPTE le parametre suffit (200) ; un tool_call effectif
    // est un plus mais depend du modele.
    toolCalling = res.status === 200;
    steps.push({
      name: 'Tool calling',
      ok: toolCalling,
      detail: toolCalling
        ? hasToolCall(res.json)
          ? 'OK (tool_call émis)'
          : 'OK (paramètre accepté)'
        : `HTTP ${res.status}`,
    });
  } catch (err) {
    steps.push({ name: 'Tool calling', ok: false, detail: String(err) });
  }

  // 4) Rerank — mode utilisateur uniquement.
  let rerank = false;
  let rerankModel = '';
  if (io.serverMode || !io.apiUrl || !io.post) {
    steps.push({
      name: 'Rerank /v1/rerank',
      ok: false,
      detail:
        'Non sondable en mode jeton serveur (la clé ne quitte jamais le serveur) — par conception. Renseignez un jeton personnel pour activer le rerank.',
    });
  } else {
    const rerankUrl = rerankUrlFrom(io.apiUrl);
    // Candidats : /v1/models (type text-classification ou id *rerank*), sinon repli connu.
    let candidates = [...RERANK_FALLBACK_MODELS];
    try {
      if (io.get) {
        const origin = new URL(io.apiUrl).origin;
        const res = await io.get(`${origin}/v1/models`);
        const models = (res.json as { data?: { id?: string; type?: string }[] })?.data ?? [];
        const found = models
          .filter((m) => m.type === 'text-classification' || /rerank/i.test(m.id ?? ''))
          .map((m) => m.id)
          .filter((id): id is string => typeof id === 'string');
        if (found.length > 0) candidates = [...found, ...RERANK_FALLBACK_MODELS];
      }
    } catch {
      // catalogue muet : les replis suffisent
    }

    for (const candidate of candidates) {
      try {
        const res = await io.post(rerankUrl, {
          model: candidate,
          query: 'graphique en barres',
          documents: ['graphiques DSFR', 'cartes Leaflet'],
        });
        const scores = rerankScores(res.json);
        if (res.status === 200 && scores.length === 2) {
          rerank = true;
          rerankModel = candidate;
          break;
        }
      } catch {
        // candidat suivant
      }
    }
    steps.push({
      name: 'Rerank /v1/rerank',
      ok: rerank,
      detail: rerank ? `OK (modèle ${rerankModel})` : 'Aucun modèle de rerank exploitable',
    });
  }

  const capabilities: AlbertCapabilities = {
    model: io.model,
    jsonSchema,
    toolCalling,
    rerank,
    rerankModel,
    probedAt: Date.now(),
  };
  setCapabilities(capabilities);
  return { capabilities, steps };
}
