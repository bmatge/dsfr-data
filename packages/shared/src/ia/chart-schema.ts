/**
 * Vocabulaire et JSON Schema de la ChartConfig — promus depuis
 * apps/builder-ia/src/ia/action-schema.ts (#515) : le meme fragment de schema
 * sert au builder-IA (action createChart) et au studio (bloc chart d'un
 * document multi-blocs). Compatible vLLM guided decoding (pas de oneOf).
 *
 * `CHART_CONFIG_TYPES` DOIT rester aligne sur ChartConfig['type']
 * (chart-config.ts) — le test d'alignement du builder-IA le verifie.
 * (Nom distinct de CHART_TYPES du modele dashboard, qui n'en couvre que 4.)
 */

/** Types de graphiques supportes — aligne sur ChartConfig['type']. */
export const CHART_CONFIG_TYPES = [
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

/** Schema JSON de ChartConfig (fragment reutilisable dans tools et json_schema). */
export const CHART_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: [...CHART_CONFIG_TYPES], description: 'Type de visualisation' },
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
