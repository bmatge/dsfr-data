/**
 * Contrat d'action de l'assistant builder-ia — source unique de verite.
 *
 * Le LLM n'ecrit jamais de HTML : son seul job est de produire un objet action
 * que l'app applique de facon deterministe (aperçu via chart-renderer, code
 * embarquable via code-generator). C'est le cas d'usage ideal des Structured
 * Outputs d'Albert (response_format:{type:"json_schema"}).
 *
 * Ce module exporte le contrat en deux representations a partir des mêmes
 * fragments :
 *   - ACTION_JSON_SCHEMA   : pour response_format (chemin single-shot structure)
 *   - *_TOOL / FINAL_ACTION_TOOLS : pour tools/function-calling (boucle agentique)
 * Plus validateAction() : garde runtime qui normalise vers la forme attendue par
 * le handler de sendMessage ({ action, config?/query?, message }).
 *
 * L'enum `type` du config DOIT rester alignee sur ChartConfig['type']
 * (state.ts) — un test d'alignement le vérifie (même esprit que skills.test.ts).
 */

import type { ChartConfig } from '../state.js';

/** Types de graphiques supportes — aligne sur ChartConfig['type']. */
export const CHART_TYPES = [
  'bar',
  'line',
  'pie',
  'doughnut',
  'radar',
  'horizontalBar',
  'scatter',
  'gauge',
  'kpi',
  'map',
  'bar-line',
  'map-reg',
  'map-aca',
  'map-monde',
  'datalist',
  'podium',
] as const;

export const AGGREGATIONS = ['sum', 'avg', 'count', 'min', 'max'] as const;
export const SORT_ORDERS = ['desc', 'asc'] as const;
export const VARIANTS = ['info', 'success', 'warning', 'error'] as const;
export const ACTIONS = ['createChart', 'reloadData', 'resetChart'] as const;

export type ActionName = (typeof ACTIONS)[number];

/** Resultat normalise consomme par sendMessage. */
export interface ActionResult {
  action: ActionName;
  /** Texte FR court que l'assistant "dit" (champ message du schema). */
  message?: string;
  /** Present pour createChart. */
  config?: Partial<ChartConfig>;
  /** Present pour reloadData. */
  query?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Fragments de schema (JSON Schema standard, compatible vLLM guided decoding)
// ---------------------------------------------------------------------------

/** Schema du config de createChart, calque sur ChartConfig. */
export const CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: [...CHART_TYPES], description: 'Type de visualisation' },
    valueField: { type: 'string', description: 'Champ numérique a mesurer (obligatoire)' },
    labelField: { type: 'string', description: "Champ d'etiquette (axe horizontal / catégories)" },
    valueField2: { type: 'string', description: 'Second champ valeur (bar-line, scatter)' },
    valueFields: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Séries multiples (format LARGE) : une colonne numerique par série, EN PLUS de valueField. Ex pour 3 séries : valueField="serieA", valueFields=["serieB","serieC"]. Pour bar/line/radar.',
    },
    codeField: { type: 'string', description: 'Champ code INSEE (cartes departement/region)' },
    aggregation: { type: 'string', enum: [...AGGREGATIONS], description: "Fonction d'agrégation" },
    where: {
      type: 'string',
      description:
        'Filtre, syntaxe "champ:operateur:valeur" (eq, neq, gt, gte, lt, lte, contains, in)',
    },
    limit: { type: 'integer', description: 'Nombre max de resultats' },
    sortOrder: { type: 'string', enum: [...SORT_ORDERS] },
    title: { type: 'string' },
    subtitle: { type: 'string' },
    color: { type: 'string' },
    color2: { type: 'string' },
    variant: { type: 'string', enum: [...VARIANTS], description: 'Couleur semantique du KPI' },
    unit: { type: 'string' },
    palette: {
      type: 'string',
      description:
        'categorical | sequentialAscending | sequentialDescending | divergentAscending | divergentDescending | neutral',
    },
    colonnes: {
      type: 'string',
      description: 'Colonnes du tableau (datalist), separees par virgule',
    },
    pagination: { type: 'integer', description: 'Lignes par page (datalist)' },
  },
  required: ['type', 'valueField'],
  additionalProperties: false,
} as const;

/** Schema du query de reloadData (ODSQL serveur). */
export const QUERY_SCHEMA = {
  type: 'object',
  properties: {
    select: { type: 'string' },
    where: { type: 'string', description: 'Syntaxe ODSQL SQL-like, ex: population > 10000' },
    group_by: { type: 'string' },
    order_by: { type: 'string' },
    limit: { type: 'integer' },
  },
  additionalProperties: false,
} as const;

/**
 * Schema d'action complet (forme PLATE) pour response_format json_schema.
 * Choix de la forme plate (action enum + config/query optionnels) plutot que
 * oneOf discrimine : plus robuste sur le guided-decoding vLLM. `config`/`query`
 * sont conditionnels par convention (le prompt l'explique) ; on ne force pas
 * oneOf pour eviter les rejets xgrammar.
 */
export const ACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: [...ACTIONS], description: 'Action a executer' },
    message: {
      type: 'string',
      description: "Phrase courte en francais a afficher a l'utilisateur",
    },
    config: CONFIG_SCHEMA,
    query: QUERY_SCHEMA,
  },
  required: ['action', 'message'],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Tools (function-calling) — mêmes fragments
// ---------------------------------------------------------------------------

const MESSAGE_PROP = {
  message: { type: 'string', description: "Phrase courte en francais a afficher a l'utilisateur" },
} as const;

/** Tools finaux : un appel a l'un d'eux TERMINE la boucle agentique. */
export const FINAL_ACTION_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'create_chart',
      description:
        "Crée/met a jour la visualisation dans l'aperçu. Utilise les noms de champs EXACTS du contexte de données.",
      parameters: {
        type: 'object',
        properties: { ...MESSAGE_PROP, config: CONFIG_SCHEMA },
        required: ['config'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'reload_data',
      description: 'Recharge les données depuis la source avec des filtres ODSQL serveur.',
      parameters: {
        type: 'object',
        properties: { ...MESSAGE_PROP, query: QUERY_SCHEMA },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'reset_chart',
      description: "Efface l'aperçu et repart de zero.",
      parameters: {
        type: 'object',
        properties: { ...MESSAGE_PROP },
        additionalProperties: false,
      },
    },
  },
] as const;

/** Tools de recuperation de skills (n'arretent pas la boucle). */
export const SKILL_LOOKUP_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_relevant_skills',
      description:
        "Recupere les fiches (skills) pertinentes pour un message utilisateur (matching par mots-clés). A appeler quand tu as besoin des details d'un composant avant de générer.",
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message ou intention a faire matcher' },
        },
        required: ['message'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_skill',
      description: "Recupere le contenu complet d'une fiche (skill) par son id.",
      parameters: {
        type: 'object',
        properties: { skill_id: { type: 'string', description: 'Id de la skill' } },
        required: ['skill_id'],
        additionalProperties: false,
      },
    },
  },
] as const;

/**
 * Tools d'introspection de données (n'arretent pas la boucle). Donnent a l'IA
 * des yeux sur state.localData reel : voir les colonnes/types/valeurs distinctes,
 * tester un filtre. Dispatchees dans agent-loop via data-tools.ts.
 */
export const DATA_INSPECTION_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'inspect_data',
      description:
        'Panorama des données chargées : pour chaque colonne, son type, son nombre de valeurs distinctes, un echantillon (texte) ou min/max (nombre). A appeler EN PREMIER pour comprendre le jeu de données avant de proposer quoi que ce soit.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'distinct_values',
      description:
        "Liste les valeurs reelles d'une colonne. A utiliser avant d'ecrire un filtre 'champ:eq:valeur' pour ne jamais inventer de valeur.",
      parameters: {
        type: 'object',
        properties: { field: { type: 'string', description: 'Nom exact de la colonne' } },
        required: ['field'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'count_where',
      description:
        "Compte combien d'enregistrements matchent un filtre 'champ:op:valeur' AVANT de generer, pour eviter un graphique vide.",
      parameters: {
        type: 'object',
        properties: {
          where: {
            type: 'string',
            description: "Filtre 'champ:op:valeur' (op: eq, neq, gt, gte, lt, lte, contains, in)",
          },
        },
        required: ['where'],
        additionalProperties: false,
      },
    },
  },
] as const;

/**
 * Tool de pre-visualisation (n'arrete pas la boucle) : rend un verdict sur une
 * config (champs presents ? filtre a 0 ligne ? valueField numerique ?) sans rien
 * peindre. Permet a l'IA d'observer puis de corriger avant de finaliser.
 */
export const PREVIEW_TOOL = {
  type: 'function' as const,
  function: {
    name: 'render_preview',
    description:
      "Teste une config de graphique et renvoie un diagnostic (valide ou liste de problemes) SANS l'afficher. Appelle-le avant create_chart pour verifier que le graphique ne sera pas vide ou faux.",
    parameters: {
      type: 'object',
      properties: { config: CONFIG_SCHEMA },
      required: ['config'],
      additionalProperties: false,
    },
  },
} as const;

/** Noms des tools terminaux (un appel termine la boucle). */
export const FINAL_TOOL_NAMES = new Set<string>(FINAL_ACTION_TOOLS.map((t) => t.function.name));

/** Mappe le nom d'un tool terminal vers l'action correspondante. */
export function toolNameToAction(name: string): ActionName | null {
  switch (name) {
    case 'create_chart':
      return 'createChart';
    case 'reload_data':
      return 'reloadData';
    case 'reset_chart':
      return 'resetChart';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Validation runtime
// ---------------------------------------------------------------------------

const ACTION_SET = new Set<string>(ACTIONS);
const TYPE_SET = new Set<string>(CHART_TYPES);

/**
 * Garde runtime : valide/normalise un objet (issu de structured output ou d'un
 * tool call) vers ActionResult. Retourne null si invalide.
 *
 * Tolere les deux formes :
 *   - structured output plat : { action, message, config?, query? }
 *   - tool call déjà resolu :  { action, message, config?/query? }
 */
export function validateAction(obj: unknown): ActionResult | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;

  const action = typeof o.action === 'string' ? o.action : '';
  if (!ACTION_SET.has(action)) return null;

  const message = typeof o.message === 'string' ? o.message : undefined;

  if (action === 'createChart') {
    const config = o.config;
    if (!config || typeof config !== 'object') return null;
    const c = config as Record<string, unknown>;
    if (typeof c.type !== 'string' || !TYPE_SET.has(c.type)) return null;
    if (typeof c.valueField !== 'string' || c.valueField.length === 0) return null;
    return { action: 'createChart', message, config: c as Partial<ChartConfig> };
  }

  if (action === 'reloadData') {
    const query = o.query;
    if (!query || typeof query !== 'object') return null;
    return { action: 'reloadData', message, query: query as Record<string, unknown> };
  }

  // resetChart
  return { action: 'resetChart', message };
}
