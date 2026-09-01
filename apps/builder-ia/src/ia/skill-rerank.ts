/**
 * Reclassement souverain des skills candidates via Albert `/v1/rerank` (#514).
 *
 * Le scoring local (`skill-matching.ts`) est lexical : il ne sait pas qu'une
 * demande « je veux voir l'evolution mois par mois » parle de series
 * temporelles. Un modele de rerank le sait. L'option est donc un RAFFINEMENT
 * du classement, jamais une source de candidats : on ne reclasse que ce que le
 * moteur local a deja retenu.
 *
 * Trois garde-fous, dans cet ordre :
 *
 *  1. **Desactive par defaut.** `capabilities.rerank` reste faux tant que
 *     `scripts/probe-albert.ts` n'a pas confirme que l'endpoint repond un
 *     classement exploitable. Meme doctrine que `jsonSchema` / `toolCalling` :
 *     un parametre present dans l'OpenAPI d'Albert ne prouve pas qu'il marche
 *     de bout en bout. Contrairement a `tools`, on ne l'active PAS par defaut :
 *     un echec y coute un aller-retour reseau a chaque recherche.
 *  2. **Repli local systematique.** Toute erreur, timeout ou reponse
 *     inexploitable renvoie l'ordre local inchange. Aucun chemin ne peut faire
 *     echouer une recherche de skills a cause du rerank.
 *  3. **Borne de temps.** La recherche de skills se produit DANS la boucle
 *     agentique (bornee a 6 tours) : au-dela du delai, on rend la main.
 *
 * Le serveur MCP n'embarque pas ce module : il doit rester fonctionnel
 * hors-ligne (`--skills-file`), donc il s'en tient au scoring local.
 */

import type { SkillMatch, MatchableSkill } from '../skill-matching.js';

/** Delai au-dela duquel on garde l'ordre local et on rend la main. */
const RERANK_TIMEOUT_MS = 2500;

/** Au-dela, le gain de classement ne justifie plus la charge utile envoyee. */
const MAX_CANDIDATES = 10;

export interface RerankOptions {
  /** URL du gateway (ex. https://albert.api.etalab.gouv.fr/v1/chat/completions). */
  apiUrl: string;
  /** Jeton d'API. Vide = pas de rerank (mode token serveur non gere ici). */
  token: string;
  /** Modele de rerank confirme par la sonde. */
  model: string;
  /** Injectable pour les tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Reponse du gateway : un score par entree, avec son index d'origine.
 * Forme REELLE d'OpenGateLLM (verifiee contre le gateway le 2026-09-01, #526) :
 * `results[].relevance_score` (standard Jina/Cohere). L'ancienne forme
 * `data[].score` (docs albert-api historiques) est gardee en repli tolerant.
 */
interface RerankResponse {
  results?: Array<{ index?: number; relevance_score?: number }>;
  data?: Array<{ index?: number; score?: number }>;
}

/** Normalise les deux formes de reponse en lignes { index, score }. */
function rerankRows(body: RerankResponse): Array<{ index?: number; score?: number }> {
  if (Array.isArray(body.results)) {
    return body.results.map((r) => ({ index: r.index, score: r.relevance_score }));
  }
  return body.data ?? [];
}

/** `/v1/rerank` deduit de l'URL de chat configuree. */
export function rerankUrlFrom(apiUrl: string): string {
  try {
    return `${new URL(apiUrl).origin}/v1/rerank`;
  } catch {
    return '';
  }
}

/**
 * Reordonne `candidates` selon Albert. Retourne l'ordre local inchange des que
 * quoi que ce soit ne va pas — c'est le comportement attendu, pas un echec.
 */
export async function rerankSkills<T extends MatchableSkill>(
  message: string,
  candidates: Array<SkillMatch<T>>,
  options: RerankOptions
): Promise<Array<SkillMatch<T>>> {
  const { apiUrl, token, model } = options;
  if (candidates.length < 2 || !token || !model) return candidates;

  const url = rerankUrlFrom(apiUrl);
  if (!url) return candidates;

  const doFetch = options.fetchImpl ?? fetch;
  const subset = candidates.slice(0, MAX_CANDIDATES);
  const rest = candidates.slice(MAX_CANDIDATES);

  // Ce qu'on soumet au rerank : nom + description, pas le contenu integral.
  // Une fiche fait jusqu'a 24 Ko — envoyer 10 fiches couterait plus cher que
  // le gain de classement.
  const documents = subset.map((m) => `${m.skill.name} — ${m.skill.description}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? RERANK_TIMEOUT_MS);

  try {
    const res = await doFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      // Forme requise par OpenGateLLM (422 sur l'ancienne prompt/input, #526).
      body: JSON.stringify({ model, query: message, documents }),
      signal: controller.signal,
    });
    if (!res.ok) return candidates;

    const body = (await res.json()) as RerankResponse;
    const rows = rerankRows(body);

    // Reponse inexploitable : index hors bornes, scores manquants, ou
    // couverture partielle. On n'essaie pas de rattraper — on garde le local.
    const usable =
      rows.length === subset.length &&
      rows.every(
        (r) =>
          typeof r.score === 'number' &&
          typeof r.index === 'number' &&
          r.index >= 0 &&
          r.index < subset.length
      );
    if (!usable) return candidates;

    const reordered = [...rows]
      .sort((a, b) => (b.score as number) - (a.score as number))
      .map((r) => subset[r.index as number]);

    // Les scores locaux sont conserves tels quels : ils restent l'explication
    // du POURQUOI une skill est candidate. Le rerank ne change que l'ordre.
    return [...reordered, ...rest];
  } catch {
    // Timeout, reseau coupe, JSON invalide : l'ordre local fait foi.
    return candidates;
  } finally {
    clearTimeout(timer);
  }
}
