/**
 * Chat functionality - message rendering, AI communication, action handling
 */

import { state } from '../state.js';
import type { Message, ChartConfig } from '../state.js';
import { getIAConfig, isServerMode } from '../ia/ia-config.js';
import type { IAConfig } from '../ia/ia-config.js';
import { SKILLS, getRelevantSkills, buildSkillsContext } from '../skills.js';
import { applyChartConfig, resetChartPreview } from '../ui/chart-renderer.js';
import { analyzeFields, updateFieldsList, updateRawData } from '../sources.js';
import { fetchWithTimeout, httpErrorMessage, detectProvider, escapeHtml } from '@dsfr-data/shared';
import { effectiveCapabilities } from '../ia/albert-capabilities.js';
import { buildSystemPrompt, buildFewShot } from '../ia/system-prompt.js';
import { runAgentLoop } from '../ia/agent-loop.js';
import type { PostChat, OpenAIResponse } from '../ia/agent-loop.js';
import { renderMarkdown } from './markdown.js';
import { ACTION_JSON_SCHEMA, validateAction } from '../ia/action-schema.js';
import type { ActionResult } from '../ia/action-schema.js';

/**
 * Resultat d'un appel IA.
 * - `raw`    : reponse texte brute (chemins legacy / Gemini / Anthropic) — parsee
 *              en aval par extractAction/repairAction.
 * - `action` : action déjà validée (chemins structured / tools) + texte à afficher.
 */
type AICallResult =
  | { kind: 'raw'; raw: string }
  | { kind: 'action'; action: ActionResult | null; text: string; steps?: string[] };

/**
 * Add a message to the chat UI and state
 */
export function addMessage(
  role: 'user' | 'assistant',
  content: string,
  suggestions: string[] = [],
  reasoningSteps: string[] = []
): HTMLElement {
  const container = document.getElementById('chat-messages') as HTMLElement;

  const messageEl = document.createElement('div');
  messageEl.className = `chat-message ${role}`;

  // Rendu Markdown sur (echappement d'abord) : tableaux GFM, listes, gras, code.
  messageEl.innerHTML = renderMarkdown(content);

  // Add suggestions if any
  if (suggestions.length > 0 && role === 'assistant') {
    const suggestionsEl = document.createElement('div');
    suggestionsEl.className = 'chat-suggestions';
    suggestions.forEach((s) => {
      const btn = document.createElement('button');
      btn.className = 'chat-suggestion';
      btn.textContent = s;
      btn.onclick = () => {
        (document.getElementById('chat-input') as HTMLTextAreaElement).value = s;
        sendMessage();
      };
      suggestionsEl.appendChild(btn);
    });
    messageEl.appendChild(suggestionsEl);
  }

  // Raisonnement agentique persistant : bloc repliable (ferme par défaut) accole
  // a la reponse. P1 ne le deplie jamais ; P2 l'ouvre pour auditer les etapes.
  if (reasoningSteps.length > 0 && role === 'assistant') {
    const details = document.createElement('details');
    details.className = 'chat-reasoning';
    const summary = document.createElement('summary');
    const n = reasoningSteps.length;
    summary.textContent = `Raisonnement de l'assistant (${n} etape${n > 1 ? 's' : ''})`;
    details.appendChild(summary);
    const ul = document.createElement('ul');
    reasoningSteps.forEach((s) => {
      const li = document.createElement('li');
      li.textContent = s; // textContent : pas d'injection HTML
      ul.appendChild(li);
    });
    details.appendChild(ul);
    messageEl.appendChild(details);
  }

  container.appendChild(messageEl);
  // Autoscroll vers le dernier message (pattern chat IA moderne) : les anciens
  // messages defilent par le haut, le plus recent reste visible pres de l'input.
  container.scrollTop = container.scrollHeight;

  state.messages.push({ role, content } as Message);

  // Persist conversation
  try {
    sessionStorage.setItem('builder-ia-messages', JSON.stringify(state.messages));
  } catch {
    /* ignore */
  }

  return messageEl;
}

/**
 * Show a thinking/loading indicator in chat
 */
export function addThinkingMessage(): HTMLElement {
  const container = document.getElementById('chat-messages') as HTMLElement;
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message assistant thinking';
  messageEl.id = 'thinking-message';
  messageEl.innerHTML = '<i class="ri-loader-4-line"></i> Reflexion en cours...';
  container.appendChild(messageEl);
  container.scrollTop = container.scrollHeight;
  return messageEl;
}

/**
 * Render the cumulative agentic steps live in the thinking indicator: completed
 * steps with a check, the latest one with the spinner.
 */
export function renderThinkingSteps(steps: string[]): void {
  const el = document.getElementById('thinking-message');
  if (!el) return;
  if (steps.length === 0) {
    el.innerHTML = '<i class="ri-loader-4-line"></i> Reflexion en cours...';
    return;
  }
  el.innerHTML = steps
    .map((s, i) => {
      const last = i === steps.length - 1;
      const icon = last ? 'ri-loader-4-line' : 'ri-check-line';
      return `<div class="chat-step"><i class="${icon}"></i> ${escapeHtml(s)}</div>`;
    })
    .join('');
  const container = document.getElementById('chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

/**
 * Remove the thinking indicator
 */
export function removeThinkingMessage(): void {
  const el = document.getElementById('thinking-message');
  if (el) el.remove();
}

/**
 * Main send message handler - validates input, calls AI, handles response actions
 */
export async function sendMessage(): Promise<void> {
  const input = document.getElementById('chat-input') as HTMLTextAreaElement;
  const message = input.value.trim();

  if (!message || state.isThinking) return;

  // Add user message
  addMessage('user', message);
  input.value = '';
  input.style.height = 'auto';

  // Detect reset/restart intent — handled client-side, no API call needed
  const resetPattern =
    /^(reset|recommencer|reinitialiser|réinitialiser|nouveau graphique|repartir de zero|repartir à zero|on efface tout|efface le graphique|supprimer le graphique|repart de zero|repart à zero|clean|clear chart)\s*[.!?]?$/i;
  if (resetPattern.test(message)) {
    resetChartPreview();
    addMessage(
      'assistant',
      'Aperçu reinitialise ! Decrivez le graphique que vous souhaitez créer.',
      ['Barres', 'Camembert', 'Courbe', 'Tableau', 'KPI']
    );
    return;
  }

  // Check if we have a token (user config or server default)
  const config = getIAConfig();
  if (!config.token && !isServerMode()) {
    addMessage(
      'assistant',
      `Je n'ai pas de token API configure. Veuillez ouvrir "Configuration IA" et entrer votre clé API.

En attendant, je peux vous aider avec des commandes simples. Essayez :
- "barres [champ_label] [champ_valeur]"
- "pie [champ_label] [champ_valeur]"
- "ligne [champ_label] [champ_valeur]"`,
      ['Configurer le token', 'Créer un graphique simple']
    );
    return;
  }

  // Show thinking
  state.isThinking = true;
  (document.getElementById('chat-send-btn') as HTMLButtonElement).disabled = true;
  addThinkingMessage();

  try {
    const result = await callAlbertAPI(message, config);
    removeThinkingMessage();

    // Normalise both call paths into { action, textWithoutJson }:
    //  - raw    : parse the assistant string (legacy / Gemini / Anthropic)
    //  - action : already-validated action + text (structured / tools)
    let action: Record<string, unknown> | null;
    let textWithoutJson: string;
    if (result.kind === 'raw') {
      action = extractAction(result.raw);
      textWithoutJson = stripActionJson(result.raw, action);
    } else if (result.action) {
      action = result.action as unknown as Record<string, unknown>;
      textWithoutJson = result.text;
    } else {
      // Mode tools mais SANS action validee : le modele a parfois ecrit l'action
      // en JSON dans son texte au lieu d'appeler l'outil create_chart. On la
      // recupere et on la retire du texte affiche (sinon JSON brut dans le chat).
      action = extractAction(result.text);
      textWithoutJson = action ? stripActionJson(result.text, action) : result.text;
    }
    // Etapes de raisonnement agentique a accoler a la reponse finale (mode tools).
    const reasoning = result.kind === 'action' ? (result.steps ?? []) : [];

    if (action?.action === 'createChart' && action.config) {
      applyChartConfig(action.config as ChartConfig);
      const chartConfig = action.config as ChartConfig;

      // Build contextual post-chart suggestions
      const textFields = state.fields.filter((f) => f.type === 'texte');
      const hasCategories = textFields.length >= 2;
      let suggestions: string[];
      if (chartConfig.type === 'datalist') {
        suggestions = hasCategories
          ? [
              'Ajouter des facettes interactives',
              'Modifier les colonnes',
              'Générer le code embarquable',
            ]
          : ['Modifier les colonnes', 'Changer la pagination', 'Générer le code embarquable'];
      } else {
        suggestions = ['Changer le type de graphique'];
        if (hasCategories) suggestions.push('Ajouter des facettes');
        suggestions.push('Générer le code embarquable');
      }
      addMessage(
        'assistant',
        textWithoutJson ||
          (chartConfig.type === 'datalist' ? 'Voici votre tableau !' : 'Voici votre graphique !'),
        suggestions,
        reasoning
      );
    } else if (action?.action === 'resetChart') {
      resetChartPreview();
      addMessage(
        'assistant',
        textWithoutJson || 'Aperçu reinitialise ! Decrivez le graphique que vous souhaitez créer.',
        ['Barres', 'Camembert', 'Courbe', 'Tableau', 'KPI'],
        reasoning
      );
    } else if (action?.action === 'reloadData') {
      const success = await handleReloadData(action);
      if (success) {
        addMessage(
          'assistant',
          textWithoutJson || (action.reason as string) || 'Données rechargees avec les filtres.',
          ['Barres', 'Camembert', 'Courbe'],
          reasoning
        );
      } else {
        addMessage(
          'assistant',
          textWithoutJson || 'Impossible de recharger les données avec ces filtres.',
          [],
          reasoning
        );
      }
    } else {
      addMessage('assistant', result.kind === 'raw' ? result.raw : textWithoutJson, [], reasoning);
    }
  } catch (error: unknown) {
    removeThinkingMessage();
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('API Error:', error);
    addMessage('assistant', `Erreur : ${errMsg}`, ['Reessayer']);
    const retryInput = document.getElementById('chat-input') as HTMLTextAreaElement;
    if (retryInput) retryInput.value = message;
  }

  state.isThinking = false;
  (document.getElementById('chat-send-btn') as HTMLButtonElement).disabled = false;
}

/**
 * Build dataContext (field names + sample record) — essential, not fetchable
 * by the model, so it stays in the prompt in every mode.
 */
function buildDataContext(): string {
  let dataContext = '';
  if (state.localData && state.fields.length > 0) {
    const detectedProvider = state.source?.apiUrl ? detectProvider(state.source.apiUrl).id : null;
    const isOds = detectedProvider === 'opendatasoft';
    const isTabular = detectedProvider === 'tabular';
    const totalNote =
      state.source?.recordCount && state.source.recordCount > state.localData.length
        ? ` (aperçu limite, source complete: ${state.source.recordCount} enregistrements)`
        : '';
    const paginationNote = isOds
      ? `\nNOTE : l'aperçu ne contient que ${state.localData.length} enregistrements. L'API ODS en contient probablement plus. Dans le code embarquable, utilise dsfr-data-source avec api-type="opendatasoft" pour recuperer automatiquement toutes les données (pagination automatique, max 1000), puis dsfr-data-query pour transformer.`
      : isTabular
        ? `\nNOTE : l'aperçu ne contient que ${state.localData.length} enregistrements. L'API Tabular en contient probablement plus. Dans le code embarquable, utilise dsfr-data-source avec api-type="tabular" et resource="ID" pour recuperer automatiquement toutes les données (pagination automatique, max 50000), puis dsfr-data-query pour transformer.`
        : '';
    const isGrist = state.source?.type === 'grist';
    const gristNote = isGrist
      ? `\nIMPORTANT: Source Grist détectée. Les données sont sous "records[].fields". Pour le code embarquable, utiliser <dsfr-data-normalize flatten="fields" trim numeric-auto> et referencer les champs par leur nom plat (sans prefixe "fields.").`
      : '';
    dataContext = `\n\nDonnees actuelles (${state.localData.length} enregistrements${totalNote}) :
Champs : ${state.fields.map((f) => `${f.name} (${f.type})`).join(', ')}
Exemple d'enregistrement : ${JSON.stringify(state.localData[0])}${paginationNote}${gristNote}`;
  }
  return dataContext;
}

/**
 * Build the legacy full system prompt (everything stuffed in) — used by the
 * legacy OpenAI path and by the Gemini / Anthropic branches (unchanged behavior).
 */
function buildLegacySystemPrompt(
  userMessage: string,
  config: IAConfig,
  dataContext: string
): string {
  const relevantSkills = getRelevantSkills(userMessage, state.source);
  const skillsContext = buildSkillsContext(relevantSkills);
  const skillsList = Object.values(SKILLS)
    .map((s) => `- ${s.name}: ${s.description}`)
    .join('\n');

  const actionReminder = `\n\n---\nREGLE ABSOLUE - FORMAT DE REPONSE :
Tu dois OBLIGATOIREMENT inclure UN bloc \`\`\`json dans CHAQUE reponse quand l'utilisateur parle de graphique, carte, KPI, tableau, couleur, palette, type, filtre, tri, etc.
NE GENERE JAMAIS de code HTML (<dsfr-data-source>, <dsfr-data-chart>, etc.) SAUF si l'utilisateur dit explicitement "généré le code", "code embarquable", "integrer", "embarquer".

IL N'EXISTE QUE 3 ACTIONS : "createChart", "reloadData" et "resetChart". AUCUNE AUTRE.
Ne généré JAMAIS une action autre que ces trois-la. Pas de "table", "list", "filter", "sort", etc.
Toute visualisation passe par createChart avec le bon "type" dans config.
Si l'utilisateur veut recommencer, reinitialiser ou effacer le graphique : {"action":"resetChart"}

MAPPING DES DEMANDES UTILISATEUR → action createChart :
- "tableau", "table", "liste", "datalist" → {"action":"createChart","config":{"type":"datalist",...}}
- "barres", "bar chart", "histogramme" → {"action":"createChart","config":{"type":"bar",...}}
- "camembert", "pie", "donut", "doughnut" → {"action":"createChart","config":{"type":"pie",...}}
- "courbe", "ligne", "line", "evolution" → {"action":"createChart","config":{"type":"line",...}}
- "radar", "toile d'araignee" → {"action":"createChart","config":{"type":"radar",...}}
- "nuage de points", "scatter" → {"action":"createChart","config":{"type":"scatter",...}}
- "jauge", "gauge", "progression" → {"action":"createChart","config":{"type":"gauge",...}}
- "KPI", "indicateur", "chiffre clé" → {"action":"createChart","config":{"type":"kpi",...}}
- "carte", "map", "departements" → {"action":"createChart","config":{"type":"map",...}}
- "carte regions" → {"action":"createChart","config":{"type":"map-reg",...}}
- "barres + courbe", "bar-line", "double axe" → {"action":"createChart","config":{"type":"bar-line",...}}

FORMAT OBLIGATOIRE :
\`\`\`json
{"action":"createChart","config":{"type":"...","labelField":"...","valueField":"...",...}}
\`\`\`

PALETTES : categorical, sequentialAscending, sequentialDescending, divergentAscending, divergentDescending, neutral.
FILTRES createChart : syntaxe "champ:op:valeur" (eq, neq, gt, gte, lt, lte, contains, in).
FACETTES : pas dans l'aperçu. Généré le createChart puis propose de générer le code embarquable.
CARTES : généré le createChart type map/map-reg. Si les données sont incompletes (100 lignes ODS), ajoute un texte prevenant que l'aperçu est partiel et propose le code embarquable.
CHAMPS : utilise UNIQUEMENT les noms de champs listes dans "Données actuelles".`;

  return buildSystemPrompt({
    mode: 'legacy',
    basePrompt: config.systemPrompt,
    dataContext,
    skillsList,
    skillsContext,
    actionReminder,
  });
}

/** Default temperature for the structured/tools paths (low = deterministic JSON). */
const STRUCTURED_DEFAULT_TEMPERATURE = 0.1;

/**
 * Call the Albert API. Returns either a raw assistant string (legacy / Gemini /
 * Anthropic, parsed downstream) or an already-validated action (structured /
 * tools paths). Capability gating applies ONLY to the OpenAI-compatible branch;
 * Gemini and Anthropic keep their exact previous behavior.
 */
/**
 * Chemins OpenAI-compatibles desactives pour la session apres un refus avere du
 * gateway (ex. Albert qui ne supporte pas `tools`). Evite de re-payer une requete
 * vouee a echouer a chaque message ; un reload de page reinitialise.
 */
const openAIPathBroken = { tools: false, jsonSchema: false };

/** Vrai si l'erreur ressemble a un refus de capacite (4xx, parametre non supporte). */
function looksLikeCapabilityError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(400|403|404|422)\b|tools?|response_format|json_schema|unsupported|not supported/i.test(
    msg
  );
}

async function callAlbertAPI(userMessage: string, config: IAConfig): Promise<AICallResult> {
  const dataContext = buildDataContext();

  // Detect provider from API URL (hostname match, not substring)
  let apiHostname = '';
  try {
    apiHostname = new URL(config.apiUrl).hostname;
  } catch {
    // malformed URL — leave apiHostname empty
  }
  const isAnthropic = apiHostname === 'api.anthropic.com' || apiHostname.endsWith('.anthropic.com');
  const isGemini =
    apiHostname === 'generativelanguage.googleapis.com' || apiHostname.endsWith('.googleapis.com');

  // Server-default mode (no user token) is always OpenAI-compatible (Albert).
  const useServerDefault = !config.token && isServerMode();
  const isAlbert = useServerDefault || apiHostname.endsWith('etalab.gouv.fr');

  const conversationMessages = [
    ...state.messages.slice(-10).map((m) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  // -- Low-level transport: POST a body through the proxy, return parsed JSON ---
  // Retry automatique sur 429 (rate-limit Albert) : la boucle agentique tire
  // plusieurs requetes par message et le token serveur est partage -> on absorbe
  // les pics au lieu de faire echouer l'utilisateur. Respecte Retry-After, sinon
  // backoff exponentiel plafonne (1s, 2s, 4s).
  async function postProxy(
    endpoint: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
    timeout = 30000
  ): Promise<Record<string, unknown>> {
    const MAX_429_RETRIES = 3;
    let response!: Response;
    for (let attempt = 0; ; attempt++) {
      response = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(body),
        },
        timeout
      );
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
        const errBody = await response.json();
        detail =
          errBody?.error?.message || errBody?.error?.type || JSON.stringify(errBody?.error) || '';
      } catch {
        /* ignore parse errors */
      }
      throw new Error(
        detail
          ? `${httpErrorMessage(response.status)} (${detail})`
          : httpErrorMessage(response.status)
      );
    }
    return response.json();
  }

  // -- OpenAI-compatible transport (server-default OR user token) --------------
  function postOpenAI(timeout = 30000): PostChat {
    return async (body: Record<string, unknown>) => {
      const endpoint = useServerDefault ? '/ia-proxy-default' : '/ia-proxy';
      const headers: Record<string, string> = useServerDefault
        ? {}
        : { 'X-Target-URL': config.apiUrl, Authorization: `Bearer ${config.token}` };
      const data = await postProxy(endpoint, headers, body, timeout);
      return data as unknown as OpenAIResponse;
    };
  }

  // -- Resolve OpenAI/Albert inference params from extraParams -----------------
  // temperature/seed are pulled out so we can set sensible defaults that the
  // user can still override; max_tokens is mapped to Albert's max_completion_tokens.
  function resolveOpenAIParams(): {
    extra: Record<string, unknown>;
    temperature?: number;
    seed?: number;
  } {
    const extra: Record<string, unknown> = {};
    let temperature: number | undefined;
    let seed: number | undefined;
    for (const [key, val] of Object.entries(config.extraParams || {})) {
      const num = Number(val);
      const parsed = !isNaN(num) && val !== '' ? num : val;
      if (key === 'temperature') {
        if (typeof parsed === 'number') temperature = parsed;
        continue;
      }
      if (key === 'seed') {
        if (typeof parsed === 'number') seed = parsed;
        continue;
      }
      if (key === 'max_tokens' && isAlbert) {
        extra.max_completion_tokens = parsed;
        continue;
      }
      extra[key] = parsed;
    }
    return { extra, temperature, seed };
  }

  // === Gemini (user mode) — unchanged behavior ===============================
  if (isGemini) {
    const systemPromptWithSkills = buildLegacySystemPrompt(userMessage, config, dataContext);
    const geminiContents = conversationMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const requestBody: Record<string, unknown> = {
      contents: geminiContents,
      systemInstruction: { parts: [{ text: systemPromptWithSkills }] },
    };
    const generationConfig: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(config.extraParams || {})) {
      const num = Number(val);
      const parsed = !isNaN(num) && val !== '' ? num : val;
      if (key === 'max_tokens' || key === 'maxOutputTokens')
        generationConfig.maxOutputTokens = parsed;
      else if (key === 'top_p') generationConfig.topP = parsed;
      else if (key === 'top_k') generationConfig.topK = parsed;
      else generationConfig[key] = parsed;
    }
    if (Object.keys(generationConfig).length > 0) requestBody.generationConfig = generationConfig;

    const separator = config.apiUrl.includes('?') ? '&' : '?';
    const data = await postProxy(
      '/ia-proxy',
      {
        'X-Target-URL': `${config.apiUrl}${separator}key=${config.token}`,
      },
      requestBody
    );
    const candidates = data.candidates as { content: { parts: { text: string }[] } }[];
    return { kind: 'raw', raw: candidates[0].content.parts[0].text };
  }

  // === Anthropic (user mode) — unchanged behavior ============================
  if (isAnthropic) {
    const systemPromptWithSkills = buildLegacySystemPrompt(userMessage, config, dataContext);
    const requestBody: Record<string, unknown> = {
      model: config.model,
      system: systemPromptWithSkills,
      messages: conversationMessages,
    };
    for (const [key, val] of Object.entries(config.extraParams || {})) {
      const num = Number(val);
      requestBody[key] = !isNaN(num) && val !== '' ? num : val;
    }
    const data = await postProxy(
      '/ia-proxy',
      {
        'X-Target-URL': config.apiUrl,
        'x-api-key': config.token,
        'anthropic-version': '2023-06-01',
      },
      requestBody
    );
    const content = data.content as { text: string }[];
    return { kind: 'raw', raw: content[0].text };
  }

  // === OpenAI-compatible (Albert) — capability-gated =========================
  // Sur Albert, on tente d'abord le chemin agentique (tools), puis structured,
  // puis legacy. Chaque chemin avance est protege : si le gateway le refuse, on
  // se rabat sur le suivant et on memorise l'echec pour la session (pas de
  // double-latence a chaque message).
  const caps = effectiveCapabilities({ isAlbert });
  const { extra, temperature, seed } = resolveOpenAIParams();

  // --- Tools / agentic loop -------------------------------------------------
  if (caps.toolCalling && !openAIPathBroken.tools) {
    try {
      const systemPrompt = buildSystemPrompt({
        mode: 'tools',
        basePrompt: config.systemPrompt,
        dataContext,
      });
      const result = await runAgentLoop({
        conversation: conversationMessages,
        systemPrompt,
        source: state.source,
        data: state.localData,
        fields: state.fields,
        post: postOpenAI(45000),
        onProgress: (steps) => renderThinkingSteps(steps),
        model: config.model,
        temperature: temperature ?? STRUCTURED_DEFAULT_TEMPERATURE,
        seed,
        extra,
      });
      // Resultat exploitable = une action OU du texte (ex. clarification).
      // Sinon on laisse filer vers structured/legacy.
      if (result.action || result.text.trim()) {
        return { kind: 'action', action: result.action, text: result.text, steps: result.steps };
      }
    } catch (err) {
      if (looksLikeCapabilityError(err)) {
        const firstTime = !openAIPathBroken.tools;
        openAIPathBroken.tools = true;
        // Repli TRANSPARENT : on previent l'utilisateur une fois plutot que de
        // degrader silencieusement (evite les "deceptions" sans qu'il sache pourquoi).
        if (firstTime) {
          addMessage(
            'assistant',
            "⚠️ Le mode avance d'Albert (agentique : exploration des donnees + auto-correction) n'est pas disponible sur ce gateway. Je passe en mode simplifie pour cette session — les reponses seront moins fines. Rechargez la page pour retenter le mode avance."
          );
        }
      }
      console.warn('[builder-ia] chemin tools indisponible, repli :', err);
    }
  }

  // --- Structured outputs (json_schema) -------------------------------------
  if (caps.jsonSchema && !openAIPathBroken.jsonSchema) {
    try {
      const systemPrompt = buildSystemPrompt({
        mode: 'structured',
        basePrompt: config.systemPrompt,
        dataContext,
      });
      const requestBody: Record<string, unknown> = {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...buildFewShot('structured'),
          ...conversationMessages,
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'builder_action', schema: ACTION_JSON_SCHEMA, strict: true },
        },
        temperature: temperature ?? STRUCTURED_DEFAULT_TEMPERATURE,
        ...(seed !== undefined ? { seed } : {}),
        ...extra,
      };
      const data = await postOpenAI()(requestBody);
      const content = data.choices?.[0]?.message?.content ?? '';
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(content);
      } catch {
        /* leave null — validateAction returns null, downstream shows text */
      }
      const action = validateAction(parsed);
      const text =
        parsed && typeof (parsed as Record<string, unknown>).message === 'string'
          ? ((parsed as Record<string, unknown>).message as string)
          : '';
      if (action || text) return { kind: 'action', action, text };
    } catch (err) {
      if (looksLikeCapabilityError(err)) openAIPathBroken.jsonSchema = true;
      console.warn('[builder-ia] chemin structured indisponible, repli legacy :', err);
    }
  }

  // --- Legacy (no advanced capability) — identical to previous behavior ------
  const systemPromptWithSkills = buildLegacySystemPrompt(userMessage, config, dataContext);
  const requestBody: Record<string, unknown> = {
    model: config.model,
    messages: [{ role: 'system', content: systemPromptWithSkills }, ...conversationMessages],
    ...(temperature !== undefined ? { temperature } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...extra,
  };
  const data = await postOpenAI()(requestBody);
  return { kind: 'raw', raw: data.choices[0].message.content ?? '' };
}

/**
 * Repair malformed actions from the AI.
 * Maps unknown action names to createChart with the appropriate type,
 * since smaller models sometimes invent action names like "table", "filter", etc.
 */
function repairAction(parsed: Record<string, unknown>): Record<string, unknown> {
  if (
    parsed.action === 'createChart' ||
    parsed.action === 'reloadData' ||
    parsed.action === 'resetChart'
  ) {
    return parsed;
  }

  // Handle reset actions
  const resetActions = [
    'reset',
    'resetchart',
    'clear',
    'clearchart',
    'recommencer',
    'reinitialiser',
  ];
  if (resetActions.includes(String(parsed.action).toLowerCase().trim())) {
    return { action: 'resetChart' };
  }

  // Map common hallucinated action names to createChart types
  const actionToType: Record<string, string> = {
    table: 'datalist',
    datalist: 'datalist',
    list: 'datalist',
    tableau: 'datalist',
    liste: 'datalist',
    bar: 'bar',
    bars: 'bar',
    barres: 'bar',
    histogram: 'bar',
    histogramme: 'bar',
    horizontalbar: 'bar',
    pie: 'pie',
    camembert: 'pie',
    donut: 'pie',
    doughnut: 'pie',
    line: 'line',
    ligne: 'line',
    courbe: 'line',
    evolution: 'line',
    radar: 'radar',
    scatter: 'scatter',
    gauge: 'gauge',
    jauge: 'gauge',
    kpi: 'kpi',
    indicateur: 'kpi',
    map: 'map',
    carte: 'map',
    'map-reg': 'map-reg',
    'map-aca': 'map-aca',
    'map-monde': 'map-monde',
    monde: 'map-monde',
    world: 'map-monde',
    'bar-line': 'bar-line',
    barline: 'bar-line',
  };

  const actionName = String(parsed.action).toLowerCase().trim();
  const mappedType = actionToType[actionName];

  if (mappedType) {
    console.warn(
      `repairAction: mapped unknown action "${parsed.action}" → createChart type="${mappedType}"`
    );
    const config = (parsed.config || parsed) as Record<string, unknown>;
    // Don't overwrite type if the config already has one
    if (!config.type) {
      config.type = mappedType;
    }
    return { action: 'createChart', config };
  }

  // If the action is unknown but has a config with a valid type, assume createChart
  if (parsed.config && (parsed.config as Record<string, unknown>).type) {
    console.warn(
      `repairAction: unknown action "${parsed.action}" but config has type, assuming createChart`
    );
    return { action: 'createChart', config: parsed.config };
  }

  console.warn(`repairAction: could not repair unknown action "${parsed.action}"`);
  return parsed;
}

/**
 * Parse the AI response text for a JSON action block.
 * Tries multiple formats that a 24-34B model might produce:
 * 1. ```json { "action": ... } ```
 * 2. ``` { "action": ... } ```  (without "json" tag)
 * 3. Bare JSON object { "action": ... } in the text (no backticks)
 */
function extractAction(text: string): Record<string, unknown> | null {
  // Strategy 1: fenced code block with optional "json" tag
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fencedMatch) {
    try {
      const parsed = JSON.parse(fencedMatch[1]);
      if (parsed.action) {
        return repairAction(parsed);
      }
    } catch (e) {
      console.warn('Failed to parse fenced action:', e);
    }
  }

  // Strategy 2: bare JSON object containing "action" key (any action name)
  const bareMatch = text.match(/(\{\s*"action"\s*:\s*"[^"]*"[\s\S]*\})/);
  if (bareMatch) {
    try {
      const parsed = JSON.parse(bareMatch[1]);
      if (parsed.action) {
        return repairAction(parsed);
      }
    } catch {
      // Try to find the balanced braces
      try {
        const start = bareMatch.index!;
        let depth = 0;
        let end = start;
        for (let i = start; i < text.length; i++) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
        const parsed = JSON.parse(text.slice(start, end));
        if (parsed.action) return repairAction(parsed);
      } catch {
        console.warn('Failed to parse bare action JSON');
      }
    }
  }

  return null;
}

/**
 * Strip the action JSON from the AI response, leaving only the human-readable text.
 * Handles fenced blocks (```json...```, ```...```) and bare JSON objects.
 */
function stripActionJson(text: string, action: Record<string, unknown> | null): string {
  if (!action) return text.trim();

  // Remove fenced code blocks first
  let cleaned = text.replace(/```(?:json)?\s*[\s\S]*?```/g, '');

  // If we matched a bare JSON, also remove it (any action name, since we repair them)
  if (cleaned.includes('"action"')) {
    cleaned = cleaned.replace(/\{\s*"action"\s*:\s*"[^"]*"[\s\S]*$/, '');
  }

  return cleaned.trim();
}

/**
 * Handle reloadData action from the AI: rebuild API URL with ODSQL params, fetch new data
 */
async function handleReloadData(actionData: Record<string, unknown>): Promise<boolean> {
  if (!state.source?.apiUrl) {
    addMessage(
      'assistant',
      "Je ne peux pas recharger les données car aucune URL source n'est disponible."
    );
    return false;
  }

  const infoEl = document.getElementById('saved-source-info') as HTMLElement;
  infoEl.innerHTML = '<i class="ri-loader-4-line"></i> Rechargement avec filtres...';

  try {
    // Build query URL
    const url = new URL(state.source.apiUrl);
    const query = (actionData.query || {}) as Record<string, unknown>;

    if (query.select) url.searchParams.set('select', String(query.select));
    if (query.where) url.searchParams.set('where', String(query.where));
    if (query.group_by) url.searchParams.set('group_by', String(query.group_by));
    if (query.order_by) url.searchParams.set('order_by', String(query.order_by));
    if (query.limit) url.searchParams.set('limit', String(query.limit));

    const response = await fetchWithTimeout(url.toString());
    const json = await response.json();
    const records: Record<string, unknown>[] = json.results || json.records || [];

    if (records.length === 0) {
      infoEl.innerHTML = '<span style="color: orange;">Aucun resultat avec ces filtres</span>';
      return false;
    }

    state.localData = records.map((r) => {
      const fields = r.fields;
      return (fields && typeof fields === 'object' ? fields : r) as Record<string, unknown>;
    });
    analyzeFields();
    updateFieldsList();
    updateRawData();

    infoEl.innerHTML = `<span class="source-badge source-badge-api">API</span> ${state.localData.length} resultats (filtre)`;

    return true;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    infoEl.innerHTML = `<span style="color: red;">Erreur: ${errMsg}</span>`;
    return false;
  }
}
