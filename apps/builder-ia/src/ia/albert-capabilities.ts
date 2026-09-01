/**
 * Albert (OpenGateLLM) capability descriptor.
 *
 * Le gateway Albert expose dans son OpenAPI les parametres `response_format`
 * (json_schema), `tools`/`tool_choice`, etc. MAIS qu'un parametre soit dans le
 * schema ne garantit pas qu'il fonctionne de bout en bout sur leur deploiement
 * vLLM (le tool-calling gpt-oss/vLLM exige des flags serveur). On garde donc un
 * descriptif de capacites, sonde empiriquement (cf. scripts/probe-albert.ts),
 * avec un défaut conservateur : sans preuve, on retombe sur le chemin legacy
 * (extractAction/repairAction) qui marche partout.
 *
 * Ces capacites ne s'appliquent QU'a la branche OpenAI-compatible de
 * callAlbertAPI. Gemini et Anthropic gardent leur chemin existant.
 */

export interface AlbertCapabilities {
  /** Modele effectivement cible (alias resolu cote gateway si connu) */
  model: string;
  /** response_format:{type:"json_schema"} fonctionne de bout en bout */
  jsonSchema: boolean;
  /** tools / tool_choice fonctionne (boucle agentique possible) */
  toolCalling: boolean;
  /**
   * /v1/rerank repond un classement exploitable (#514). Sert a reclasser les
   * skills candidates par un modele souverain plutot que par le seul scoring
   * lexical local. Faux tant que la sonde ne l'a pas confirme.
   *
   * OPTIONNEL a dessein : les capacites sont persistees en localStorage, donc
   * un objet memorise avant #514 n'a pas ce champ. `undefined` est falsy — le
   * rerank reste desactive, sans migration ni invalidation du cache.
   */
  rerank?: boolean;
  /** Modele de rerank retenu par la sonde (vide si rerank indisponible). */
  rerankModel?: string;
  /** Timestamp (ms) de la derniere sonde ; 0 si jamais sondee */
  probedAt: number;
}

/**
 * Défaut conservateur : aucune capacité avancée présumée. Tant qu'une sonde
 * n'a pas confirme json_schema / toolCalling, on sert le comportement actuel.
 */
export const DEFAULT_CAPABILITIES: AlbertCapabilities = {
  model: '',
  jsonSchema: false,
  toolCalling: false,
  rerank: false,
  rerankModel: '',
  probedAt: 0,
};

const CAPABILITIES_KEY = 'dsfr-data-ia-capabilities';

/** Cache en memoire (rempli depuis localStorage au premier acces). */
let cached: AlbertCapabilities | null = null;

/**
 * Capacites courantes. Lit le cache memoire, sinon localStorage, sinon retourne
 * null (l'appelant utilisera DEFAULT_CAPABILITIES). On ne sonde JAMAIS pendant un
 * tour de chat (latence) : la sonde est un script/action explicite.
 */
export function getCapabilities(): AlbertCapabilities | null {
  if (cached !== null) return cached;
  try {
    const raw = localStorage.getItem(CAPABILITIES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AlbertCapabilities>;
    cached = {
      model: typeof parsed.model === 'string' ? parsed.model : '',
      jsonSchema: parsed.jsonSchema === true,
      toolCalling: parsed.toolCalling === true,
      // #526 : ces deux champs etaient PERDUS a la relecture — le rerank ne
      // pouvait donc jamais s'activer, meme ecrit a la main en localStorage.
      rerank: parsed.rerank === true,
      rerankModel: typeof parsed.rerankModel === 'string' ? parsed.rerankModel : '',
      probedAt: typeof parsed.probedAt === 'number' ? parsed.probedAt : 0,
    };
    return cached;
  } catch {
    return null;
  }
}

/** Persiste les capacites (cache memoire + localStorage). */
export function setCapabilities(caps: AlbertCapabilities): void {
  cached = caps;
  try {
    localStorage.setItem(CAPABILITIES_KEY, JSON.stringify(caps));
  } catch {
    /* localStorage indisponible : on garde au moins le cache memoire */
  }
}

/** Efface les capacités mémorisées (retour au défaut conservateur). */
export function resetCapabilities(): void {
  cached = null;
  try {
    localStorage.removeItem(CAPABILITIES_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Capacites par défaut pour le gateway Albert (etalab). gpt-oss / albert-large
 * exposent tools + json_schema cote OpenGateLLM ; on les ACTIVE par défaut pour
 * que la boucle agentique tourne sans sonde manuelle. Si le gateway refuse (400/
 * 403 sur le parametre tools), callAlbertAPI retombe automatiquement sur le
 * chemin legacy (try/catch) — donc activer par défaut ne peut pas casser l'app.
 */
export const ALBERT_DEFAULT_CAPABILITIES: AlbertCapabilities = {
  model: '',
  jsonSchema: true,
  toolCalling: true,
  // Le rerank NE PEUT PAS suivre la meme regle : contrairement a tools, qui
  // retombe sur le chemin legacy en cas de refus, un rerank actif par defaut
  // ajouterait un aller-retour reseau a chaque recherche de skills, y compris
  // quand l'endpoint n'existe pas. Il reste donc a false tant que la sonde
  // (scripts/probe-albert.ts) ne l'a pas confirme.
  rerank: false,
  rerankModel: '',
  probedAt: 0,
};

/**
 * Capacites effectives a utiliser dans callAlbertAPI : priorite aux capacites
 * MEMORISEES (sonde explicite, qui fait foi), sinon défaut selon le provider —
 * agentique pour Albert, conservateur sinon.
 */
export function effectiveCapabilities(opts?: { isAlbert?: boolean }): AlbertCapabilities {
  const stored = getCapabilities();
  if (stored) return stored;
  return opts?.isAlbert ? ALBERT_DEFAULT_CAPABILITIES : DEFAULT_CAPABILITIES;
}
