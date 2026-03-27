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
import { fetchWithTimeout, httpErrorMessage, detectProvider } from '@dsfr-data/shared';

/**
 * Add a message to the chat UI and state
 */
export function addMessage(role: 'user' | 'assistant', content: string, suggestions: string[] = []): HTMLElement {
  const container = document.getElementById('chat-messages') as HTMLElement;

  const messageEl = document.createElement('div');
  messageEl.className = `chat-message ${role}`;

  // Simple markdown-like formatting
  let html = content
    .replace(/```json\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/```\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  messageEl.innerHTML = html;

  // Add suggestions if any
  if (suggestions.length > 0 && role === 'assistant') {
    const suggestionsEl = document.createElement('div');
    suggestionsEl.className = 'chat-suggestions';
    suggestions.forEach(s => {
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

  container.appendChild(messageEl);
  container.scrollTop = container.scrollHeight;

  state.messages.push({ role, content } as Message);

  // Persist conversation
  try { sessionStorage.setItem('builder-ia-messages', JSON.stringify(state.messages)); } catch { /* ignore */ }

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
  const resetPattern = /^(reset|recommencer|reinitialiser|réinitialiser|nouveau graphique|repartir de zero|repartir à zero|on efface tout|efface le graphique|supprimer le graphique|repart de zero|repart à zero|clean|clear chart)\s*[.!?]?$/i;
  if (resetPattern.test(message)) {
    resetChartPreview();
    addMessage('assistant', 'Apercu reinitialise ! Decrivez le graphique que vous souhaitez creer.', [
      'Barres',
      'Camembert',
      'Courbe',
      'Tableau',
      'KPI',
    ]);
    return;
  }

  // Check if we have a token (user config or server default)
  const config = getIAConfig();
  if (!config.token && !isServerMode()) {
    addMessage('assistant', `Je n'ai pas de token API configure. Veuillez ouvrir "Configuration IA" et entrer votre cle API.

En attendant, je peux vous aider avec des commandes simples. Essayez :
- "barres [champ_label] [champ_valeur]"
- "pie [champ_label] [champ_valeur]"
- "ligne [champ_label] [champ_valeur]"`, [
      'Configurer le token',
      'Creer un graphique simple',
    ]);
    return;
  }

  // Show thinking
  state.isThinking = true;
  (document.getElementById('chat-send-btn') as HTMLButtonElement).disabled = true;
  addThinkingMessage();

  try {
    const response = await callAlbertAPI(message, config);
    removeThinkingMessage();

    // Check if response contains an action
    const action = extractAction(response);
    const textWithoutJson = stripActionJson(response, action);

    if (action?.action === 'createChart' && action.config) {
      applyChartConfig(action.config as ChartConfig);
      const chartConfig = action.config as ChartConfig;

      // Build contextual post-chart suggestions
      const textFields = state.fields.filter(f => f.type === 'texte');
      const hasCategories = textFields.length >= 2;
      let suggestions: string[];
      if (chartConfig.type === 'datalist') {
        suggestions = hasCategories
          ? ['Ajouter des facettes interactives', 'Modifier les colonnes', 'Generer le code embarquable']
          : ['Modifier les colonnes', 'Changer la pagination', 'Generer le code embarquable'];
      } else {
        suggestions = ['Changer le type de graphique'];
        if (hasCategories) suggestions.push('Ajouter des facettes');
        suggestions.push('Generer le code embarquable');
      }
      addMessage('assistant', textWithoutJson || (chartConfig.type === 'datalist' ? 'Voici votre tableau !' : 'Voici votre graphique !'), suggestions);
    } else if (action?.action === 'resetChart') {
      resetChartPreview();
      addMessage('assistant', textWithoutJson || 'Apercu reinitialise ! Decrivez le graphique que vous souhaitez creer.', [
        'Barres',
        'Camembert',
        'Courbe',
        'Tableau',
        'KPI',
      ]);
    } else if (action?.action === 'reloadData') {
      const success = await handleReloadData(action);
      if (success) {
        addMessage('assistant', textWithoutJson || (action.reason as string) || 'Donnees rechargees avec les filtres.', [
          'Barres',
          'Camembert',
          'Courbe',
        ]);
      } else {
        addMessage('assistant', textWithoutJson || 'Impossible de recharger les donnees avec ces filtres.');
      }
    } else {
      addMessage('assistant', response);
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
 * Call the Albert API with the user message, conversation history, and skills context
 */
async function callAlbertAPI(userMessage: string, config: IAConfig): Promise<string> {
  // Build context with data info
  let dataContext = '';
  if (state.localData && state.fields.length > 0) {
    const detectedProvider = state.source?.apiUrl ? detectProvider(state.source.apiUrl).id : null;
    const isOds = detectedProvider === 'opendatasoft';
    const isTabular = detectedProvider === 'tabular';
    const totalNote = state.source?.recordCount && state.source.recordCount > state.localData.length
      ? ` (apercu limite, source complete: ${state.source.recordCount} enregistrements)`
      : '';
    const paginationNote = isOds
      ? `\nNOTE : l'apercu ne contient que ${state.localData.length} enregistrements. L'API ODS en contient probablement plus. Dans le code embarquable, utilise dsfr-data-source avec api-type="opendatasoft" pour recuperer automatiquement toutes les donnees (pagination automatique, max 1000), puis dsfr-data-query pour transformer.`
      : isTabular
        ? `\nNOTE : l'apercu ne contient que ${state.localData.length} enregistrements. L'API Tabular en contient probablement plus. Dans le code embarquable, utilise dsfr-data-source avec api-type="tabular" et resource="ID" pour recuperer automatiquement toutes les donnees (pagination automatique, max 50000), puis dsfr-data-query pour transformer.`
        : '';
    const isGrist = state.source?.type === 'grist';
    const gristNote = isGrist
      ? `\nIMPORTANT: Source Grist detectee. Les donnees sont sous "records[].fields". Pour le code embarquable, utiliser <dsfr-data-normalize flatten="fields" trim numeric-auto> et referencer les champs par leur nom plat (sans prefixe "fields.").`
      : '';
    dataContext = `\n\nDonnees actuelles (${state.localData.length} enregistrements${totalNote}) :
Champs : ${state.fields.map(f => `${f.name} (${f.type})`).join(', ')}
Exemple d'enregistrement : ${JSON.stringify(state.localData[0])}${paginationNote}${gristNote}`;
  }

  // Inject relevant skills based on the user message
  const relevantSkills = getRelevantSkills(userMessage, state.source);
  const skillsContext = buildSkillsContext(relevantSkills);

  // Build available skills list for the system prompt
  const skillsList = Object.values(SKILLS).map(s => `- ${s.name}: ${s.description}`).join('\n');

  const actionReminder = `\n\n---\nREGLE ABSOLUE - FORMAT DE REPONSE :
Tu dois OBLIGATOIREMENT inclure UN bloc \`\`\`json dans CHAQUE reponse quand l'utilisateur parle de graphique, carte, KPI, tableau, couleur, palette, type, filtre, tri, etc.
NE GENERE JAMAIS de code HTML (<dsfr-data-source>, <dsfr-data-chart>, etc.) SAUF si l'utilisateur dit explicitement "genere le code", "code embarquable", "integrer", "embarquer".

IL N'EXISTE QUE 3 ACTIONS : "createChart", "reloadData" et "resetChart". AUCUNE AUTRE.
Ne genere JAMAIS une action autre que ces trois-la. Pas de "table", "list", "filter", "sort", etc.
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
- "KPI", "indicateur", "chiffre cle" → {"action":"createChart","config":{"type":"kpi",...}}
- "carte", "map", "departements" → {"action":"createChart","config":{"type":"map",...}}
- "carte regions" → {"action":"createChart","config":{"type":"map-reg",...}}
- "barres + courbe", "bar-line", "double axe" → {"action":"createChart","config":{"type":"bar-line",...}}

FORMAT OBLIGATOIRE :
\`\`\`json
{"action":"createChart","config":{"type":"...","labelField":"...","valueField":"...",...}}
\`\`\`

PALETTES : categorical, sequentialAscending, sequentialDescending, divergentAscending, divergentDescending, neutral.
FILTRES createChart : syntaxe "champ:op:valeur" (eq, neq, gt, gte, lt, lte, contains, in).
FACETTES : pas dans l'apercu. Genere le createChart puis propose de generer le code embarquable.
CARTES : genere le createChart type map/map-reg. Si les donnees sont incompletes (100 lignes ODS), ajoute un texte prevenant que l'apercu est partiel et propose le code embarquable.
CHAMPS : utilise UNIQUEMENT les noms de champs listes dans "Donnees actuelles".`;

  const systemPromptWithSkills = config.systemPrompt +
    `\n\nSKILLS DISPONIBLES (seront injectes si pertinents):\n${skillsList}` +
    dataContext +
    skillsContext +
    actionReminder;

  // Detect provider from API URL
  const isAnthropic = config.apiUrl.includes('anthropic.com');
  const isGemini = config.apiUrl.includes('googleapis.com') || config.apiUrl.includes('generativelanguage');

  const conversationMessages = [
    ...state.messages.slice(-10).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ];

  // Build request body adapted to the provider
  let requestBody: Record<string, unknown>;

  if (isGemini) {
    // Gemini API: contents with role user/model, systemInstruction separate
    const geminiContents = conversationMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    requestBody = {
      contents: geminiContents,
      systemInstruction: { parts: [{ text: systemPromptWithSkills }] },
    };
    // Map extra params into generationConfig
    const generationConfig: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(config.extraParams || {})) {
      const num = Number(val);
      const parsed = !isNaN(num) && val !== '' ? num : val;
      if (key === 'max_tokens' || key === 'maxOutputTokens') {
        generationConfig.maxOutputTokens = parsed;
      } else if (key === 'top_p') {
        generationConfig.topP = parsed;
      } else if (key === 'top_k') {
        generationConfig.topK = parsed;
      } else {
        // temperature, topP, topK, etc. pass through as-is
        generationConfig[key] = parsed;
      }
    }
    if (Object.keys(generationConfig).length > 0) {
      requestBody.generationConfig = generationConfig;
    }
  } else if (isAnthropic) {
    // Anthropic Messages API: system is a top-level field, not in messages
    requestBody = { model: config.model, system: systemPromptWithSkills, messages: conversationMessages };
    for (const [key, val] of Object.entries(config.extraParams || {})) {
      const num = Number(val);
      requestBody[key] = !isNaN(num) && val !== '' ? num : val;
    }
  } else {
    // OpenAI-compatible: system prompt is the first message
    requestBody = {
      model: config.model,
      messages: [
        { role: 'system', content: systemPromptWithSkills },
        ...conversationMessages,
      ],
    };
    for (const [key, val] of Object.entries(config.extraParams || {})) {
      const num = Number(val);
      requestBody[key] = !isNaN(num) && val !== '' ? num : val;
    }
  }

  // Server-default mode: use /ia-proxy-default (token injected server-side)
  const useServerDefault = !config.token && isServerMode();

  let response: Response;

  if (useServerDefault) {
    // Server mode: always OpenAI-compatible (Albert), no auth header needed
    response = await fetchWithTimeout('/ia-proxy-default', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }, 30000);
  } else {
    // User-config mode: existing behavior with X-Target-URL and auth headers
    let targetUrl = config.apiUrl;
    if (isGemini) {
      const separator = targetUrl.includes('?') ? '&' : '?';
      targetUrl = `${targetUrl}${separator}key=${config.token}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Target-URL': targetUrl,
    };

    if (isAnthropic) {
      headers['x-api-key'] = config.token;
      headers['anthropic-version'] = '2023-06-01';
    } else if (!isGemini) {
      headers['Authorization'] = `Bearer ${config.token}`;
    }

    response = await fetchWithTimeout('/ia-proxy', {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    }, 30000);
  }

  if (!response.ok) {
    // Try to extract the actual error message from the provider
    let detail = '';
    try {
      const errBody = await response.json();
      detail = errBody?.error?.message || errBody?.error?.type || JSON.stringify(errBody?.error) || '';
    } catch { /* ignore parse errors */ }
    throw new Error(detail
      ? `${httpErrorMessage(response.status)} (${detail})`
      : httpErrorMessage(response.status));
  }

  const data = await response.json();

  // Server-default mode is always OpenAI-compatible (Albert)
  if (useServerDefault) {
    return data.choices[0].message.content;
  }

  // Parse response based on provider format
  if (isGemini) {
    // Gemini: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
    return data.candidates[0].content.parts[0].text;
  }
  if (isAnthropic) {
    // Anthropic: { content: [{ type: "text", text: "..." }] }
    return data.content[0].text;
  }
  // OpenAI-compatible: { choices: [{ message: { content: "..." } }] }
  return data.choices[0].message.content;
}

/**
 * Repair malformed actions from the AI.
 * Maps unknown action names to createChart with the appropriate type,
 * since smaller models sometimes invent action names like "table", "filter", etc.
 */
function repairAction(parsed: Record<string, unknown>): Record<string, unknown> {
  if (parsed.action === 'createChart' || parsed.action === 'reloadData' || parsed.action === 'resetChart') {
    return parsed;
  }

  // Handle reset actions
  const resetActions = ['reset', 'resetchart', 'clear', 'clearchart', 'recommencer', 'reinitialiser'];
  if (resetActions.includes(String(parsed.action).toLowerCase().trim())) {
    return { action: 'resetChart' };
  }

  // Map common hallucinated action names to createChart types
  const actionToType: Record<string, string> = {
    table: 'datalist', datalist: 'datalist', list: 'datalist', tableau: 'datalist', liste: 'datalist',
    bar: 'bar', bars: 'bar', barres: 'bar', histogram: 'bar', histogramme: 'bar', horizontalbar: 'bar',
    pie: 'pie', camembert: 'pie', donut: 'pie', doughnut: 'pie',
    line: 'line', ligne: 'line', courbe: 'line', evolution: 'line',
    radar: 'radar', scatter: 'scatter', gauge: 'gauge', jauge: 'gauge',
    kpi: 'kpi', indicateur: 'kpi',
    map: 'map', carte: 'map', 'map-reg': 'map-reg',
    'bar-line': 'bar-line', barline: 'bar-line',
  };

  const actionName = String(parsed.action).toLowerCase().trim();
  const mappedType = actionToType[actionName];

  if (mappedType) {
    console.warn(`repairAction: mapped unknown action "${parsed.action}" → createChart type="${mappedType}"`);
    const config = (parsed.config || parsed) as Record<string, unknown>;
    // Don't overwrite type if the config already has one
    if (!config.type) {
      config.type = mappedType;
    }
    return { action: 'createChart', config };
  }

  // If the action is unknown but has a config with a valid type, assume createChart
  if (parsed.config && (parsed.config as Record<string, unknown>).type) {
    console.warn(`repairAction: unknown action "${parsed.action}" but config has type, assuming createChart`);
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
          if (depth === 0) { end = i + 1; break; }
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
    addMessage('assistant', "Je ne peux pas recharger les donnees car aucune URL source n'est disponible.");
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

    state.localData = records.map(r => {
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
