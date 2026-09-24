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

/**
 * Etat de la connexion, lu sur la completion simple (#1142). Un HTTP 200 bien
 * forme PROUVE la connexion, meme si le texte revient vide : un modele a
 * raisonnement (gpt-oss) peut epuiser son budget avant d'ecrire sa reponse.
 *   - `ok`                 : 200 et `choices[0].message` present ;
 *   - `erreur-http`        : le gateway a repondu, avec un statut d'erreur ;
 *   - `reponse-inattendue` : 200 sans `choices[0].message` ;
 *   - `injoignable`        : exception du transport (reseau, proxy).
 */
export type ProbeConnexion = 'ok' | 'erreur-http' | 'reponse-inattendue' | 'injoignable';

export interface ProbeReport {
  capabilities: AlbertCapabilities;
  steps: ProbeStep[];
  /** Etat de la connexion (completion simple). */
  connexion: ProbeConnexion;
  /** Statut HTTP de la completion simple, s'il y en a eu un. */
  httpStatus?: number;
  /** Vrai si les capacites ont ete persistees via setCapabilities(). */
  memorise: boolean;
}

/**
 * Budget de jetons de chaque etape. 30 ne suffisait pas : gpt-oss-120b
 * (openweight-large) raisonne avant de repondre, et le raisonnement consommait
 * tout — `content` vide, `finish_reason: "length"` (#1142).
 */
export const PROBE_MAX_COMPLETION_TOKENS = 512;

/** Modeles de rerank a essayer si /v1/models est muet (verifie le 2026-09-01). */
const RERANK_FALLBACK_MODELS = ['bge-reranker-v2-m3', 'BAAI/bge-reranker-v2-m3'];

interface ProbeChoice {
  finish_reason?: string | null;
  message?: {
    content?: string | null;
    reasoning_content?: string | null;
    reasoning?: string | null;
  } | null;
}

function choiceOf(json: unknown): ProbeChoice | undefined {
  const choices = (json as { choices?: unknown })?.choices;
  return Array.isArray(choices) ? (choices[0] as ProbeChoice | undefined) : undefined;
}

function contentOf(json: unknown): string {
  const content = choiceOf(json)?.message?.content;
  return typeof content === 'string' ? content : '';
}

/** Reponse bien formee : `choices[0].message` present, quel que soit son texte. */
function wellFormed(json: unknown): boolean {
  const message = choiceOf(json)?.message;
  return !!message && typeof message === 'object';
}

/**
 * Pourquoi le texte est vide : budget epuise (`finish_reason=length`), texte
 * reste dans le raisonnement, ou rien d'explicable.
 */
export function explainEmptyContent(json: unknown): string {
  const choice = choiceOf(json);
  const message = choice?.message;
  const raisonnement = message?.reasoning_content ?? message?.reasoning;
  const aRaisonne = typeof raisonnement === 'string' && raisonnement.length > 0;
  if (choice?.finish_reason === 'length') {
    return aRaisonne
      ? 'réponse vide : le modèle a épuisé son budget de jetons en raisonnant (finish_reason=length)'
      : 'réponse vide : le modèle a épuisé son budget de jetons (finish_reason=length)';
  }
  if (aRaisonne) return 'réponse vide : le texte est resté dans le raisonnement du modèle';
  return `réponse vide (finish_reason=${choice?.finish_reason ?? 'absent'})`;
}

/** Message d'erreur du gateway, s'il en donne un (forme OpenAI). */
function errorOf(json: unknown): string {
  const error = (json as { error?: unknown; detail?: unknown })?.error;
  if (typeof error === 'string') return error;
  const message = (error as { message?: unknown } | undefined)?.message;
  if (typeof message === 'string') return message;
  const detail = (json as { detail?: unknown })?.detail;
  return typeof detail === 'string' ? detail : '';
}

function httpDetail(status: number, json: unknown): string {
  const message = errorOf(json);
  return message ? `HTTP ${status} : ${message.slice(0, 160)}` : `HTTP ${status}`;
}

/**
 * Phrase de conclusion du rapport, selon ce que la sonde a pu etablir. Partagee
 * par le Studio et l'ancien Assistant : jamais « echec de connexion » quand le
 * gateway a repondu 200 (#1142).
 */
export function probeConclusion(report: ProbeReport): string {
  if (report.memorise) return 'Capacités mémorisées : elles font foi pour les prochains messages.';
  const garde = 'capacités non mémorisées (les réglages actuels restent en vigueur).';
  switch (report.connexion) {
    case 'erreur-http':
      return `Le gateway a refusé la requête (HTTP ${report.httpStatus ?? '?'}) : ${garde}`;
    case 'reponse-inattendue':
      return `Connexion établie mais réponse inattendue du gateway : ${garde}`;
    case 'injoignable':
      return `Gateway injoignable : ${garde}`;
    default:
      return `Sonde interrompue : ${garde}`;
  }
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
  const base = {
    model: io.model,
    max_completion_tokens: PROBE_MAX_COMPLETION_TOKENS,
    temperature: 0,
  };

  // 1) Completion simple — si elle echoue, rien d'autre n'est interpretable.
  //    Un 200 bien forme suffit a prouver la connexion : un texte vide (modele
  //    a raisonnement a court de jetons) est signale, pas pris pour une panne.
  let connexion: ProbeConnexion = 'injoignable';
  let httpStatus: number | undefined;
  try {
    const res = await io.chat({
      ...base,
      messages: [{ role: 'user', content: 'Réponds uniquement: OK' }],
    });
    httpStatus = res.status;
    if (res.status !== 200) {
      connexion = 'erreur-http';
      steps.push({
        name: 'Completion simple',
        ok: false,
        detail: httpDetail(res.status, res.json),
      });
    } else if (!wellFormed(res.json)) {
      connexion = 'reponse-inattendue';
      steps.push({
        name: 'Completion simple',
        ok: false,
        detail: 'HTTP 200 mais réponse inattendue (pas de choices[0].message)',
      });
    } else {
      connexion = 'ok';
      steps.push({
        name: 'Completion simple',
        ok: true,
        detail:
          contentOf(res.json).length > 0
            ? `OK (HTTP ${res.status})`
            : `Connexion OK (HTTP ${res.status}), ${explainEmptyContent(res.json)}`,
      });
    }
  } catch (err) {
    steps.push({ name: 'Completion simple', ok: false, detail: String(err) });
  }
  if (connexion !== 'ok') {
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
    return { capabilities, steps, connexion, httpStatus, memorise: false };
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
    const texte = contentOf(res.json);
    let parses = false;
    try {
      const parsed: unknown = JSON.parse(texte);
      parses = typeof parsed === 'object' && parsed !== null;
    } catch {
      parses = false;
    }
    jsonSchema = res.status === 200 && parses;
    let detail = 'OK';
    if (res.status !== 200) detail = httpDetail(res.status, res.json);
    else if (!texte) detail = `non concluant, ${explainEmptyContent(res.json)}`;
    else if (!parses) detail = 'HTTP 200, JSON non conforme';
    steps.push({ name: 'Structured outputs (json_schema)', ok: jsonSchema, detail });
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
        : httpDetail(res.status, res.json),
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
  return { capabilities, steps, connexion, httpStatus, memorise: true };
}
