/**
 * Transport LLM du studio — meme contrat que le builder-IA (chat.ts) :
 *
 *   - mode serveur : POST /ia-proxy-default (jeton injecte cote serveur,
 *     jamais expose au navigateur), configuration via GET /ia-server-config ;
 *   - mode utilisateur : cle dans localStorage (MEME cle que le builder-IA :
 *     l'utilisateur configure une fois), POST /ia-proxy + X-Target-URL.
 *
 * Retry automatique sur 429 (jeton Albert partage) : Retry-After sinon
 * backoff exponentiel plafonne.
 */

export interface OpenAIResponse {
  choices: {
    message: {
      role: string;
      content: string | null;
      tool_calls?: {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }[];
    };
  }[];
}

export type PostChat = (body: Record<string, unknown>) => Promise<OpenAIResponse>;

/** Meme cle que le builder-IA (ia-config.ts) — configuration partagee. */
const IA_CONFIG_KEY = 'dsfr-data-ia-config';
const DEFAULT_MODEL = 'openweight-large';

export interface StudioIAConfig {
  apiUrl: string;
  model: string;
  token: string;
}

export interface ServerIAConfig {
  available: boolean;
  apiUrl?: string;
  model?: string;
}

let serverConfig: ServerIAConfig | null = null;

/** Config serveur (jeton cote serveur), sondee une fois par session. */
export async function fetchServerConfig(): Promise<ServerIAConfig> {
  if (serverConfig) return serverConfig;
  try {
    const res = await fetch('/ia-server-config');
    serverConfig = res.ok ? ((await res.json()) as ServerIAConfig) : { available: false };
  } catch {
    serverConfig = { available: false };
  }
  return serverConfig;
}

/** Pour les tests : reinitialise le cache de config serveur. */
export function resetServerConfigCache(): void {
  serverConfig = null;
}

/** Config utilisateur (localStorage, partagee avec le builder-IA). */
export function loadUserConfig(): StudioIAConfig {
  try {
    const raw = localStorage.getItem(IA_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StudioIAConfig>;
      return {
        apiUrl: parsed.apiUrl ?? '',
        model: parsed.model ?? DEFAULT_MODEL,
        token: parsed.token ?? '',
      };
    }
  } catch {
    // localStorage inaccessible ou JSON invalide : config vide.
  }
  return { apiUrl: '', model: DEFAULT_MODEL, token: '' };
}

/** Etat resolu du transport : quel chemin, quel modele. */
export interface ResolvedTransport {
  mode: 'server' | 'user' | 'none';
  model: string;
  post: PostChat;
}

async function postProxy(
  endpoint: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<OpenAIResponse> {
  const MAX_429_RETRIES = 3;
  let response!: Response;
  for (let attempt = 0; ; attempt++) {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    if (response.status !== 429 || attempt >= MAX_429_RETRIES) break;
    const retryAfter = Number(response.headers.get('retry-after'));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 10000)
        : Math.min(1000 * 2 ** attempt, 4000);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  if (!response.ok) {
    let detail = '';
    try {
      const errBody = (await response.json()) as { error?: { message?: string; type?: string } };
      detail = errBody?.error?.message || errBody?.error?.type || '';
    } catch {
      // corps non JSON
    }
    throw new Error(
      detail ? `Erreur API ${response.status} (${detail})` : `Erreur API ${response.status}`
    );
  }
  return (await response.json()) as OpenAIResponse;
}

/**
 * Resout le transport : mode serveur si disponible et pas de jeton utilisateur,
 * sinon mode utilisateur, sinon 'none' (l'UI explique quoi configurer).
 */
export async function resolveTransport(): Promise<ResolvedTransport> {
  const user = loadUserConfig();
  const server = await fetchServerConfig();

  if (!user.token && server.available) {
    return {
      mode: 'server',
      model: server.model ?? 'albert-large',
      post: (body) => postProxy('/ia-proxy-default', {}, body),
    };
  }
  if (user.token && user.apiUrl) {
    return {
      mode: 'user',
      model: user.model,
      post: (body) =>
        postProxy(
          '/ia-proxy',
          { 'X-Target-URL': user.apiUrl, Authorization: `Bearer ${user.token}` },
          body
        ),
    };
  }
  return {
    mode: 'none',
    model: '',
    post: async () => {
      throw new Error(
        "Aucune configuration IA : renseigne une clé API dans l'Assistant IA, ou déploie avec un jeton serveur."
      );
    },
  };
}
