/**
 * Skills loading and matching — extracted for testability.
 */

export interface Skill {
  id: string;
  name: string;
  description: string;
  trigger: string[];
  content: string;
}

/**
 * Routing decision for an incoming HTTP MCP request, based on its session id.
 *
 * Extracted (pure) for testability. Key point: a request carrying a session id
 * the server doesn't know — typically because the server restarted and lost its
 * in-memory sessions — must be answered with 404 (`not-found`), NOT 400. The
 * StreamableHTTP spec lets the client re-initialize a fresh session on 404;
 * a 400 leaves the client stuck (every tool call keeps failing) until it is
 * manually reconnected.
 */
export type McpRequestRoute = 'existing' | 'init' | 'not-found' | 'bad-request';

export function routeMcpRequest(opts: {
  sessionId?: string;
  hasSession: boolean;
  method?: string;
}): McpRequestRoute {
  const { sessionId, hasSession, method } = opts;
  if (sessionId && hasSession) return 'existing';
  if (!sessionId && method === 'POST') return 'init';
  if (sessionId && !hasSession) return 'not-found'; // stale session → 404 → client re-inits
  return 'bad-request';
}

/**
 * Match skills whose triggers appear in the given message (case-insensitive).
 */
export function matchSkills(skills: Skill[], message: string): Skill[] {
  const lower = message.toLowerCase();
  return skills.filter((s) => s.trigger.some((t) => lower.includes(t.toLowerCase())));
}

/**
 * Pick skill IDs relevant to a given chart type for generate_widget_code.
 */
export function getWidgetSkillIds(chartType?: string): string[] {
  const ids = [
    'compositionPatterns',
    'dsfrDataSource',
    // Préparation des données : nettoyage/typage (compute, decimales FR) et bascule
    // des tableurs "wide" (temps dans les noms de colonnes) via dsfr-data-unpivot.
    // Pertinent quelle que soit la visualisation → toujours injecté pour que la
    // génération connaisse le pipeline complet (source → unpivot → normalize → query → chart).
    'dsfrDataNormalize',
    'dsfrDataUnpivot',
    'dsfrDataChart',
    'apiProviders',
    'troubleshooting',
  ];

  if (chartType) {
    const lower = chartType.toLowerCase();
    if (lower === 'kpi') ids.push('dsfrDataKpi');
    if (lower === 'podium' || lower === 'classement' || lower === 'ranking')
      ids.push('dsfrDataPodium');
    if (lower === 'datalist' || lower === 'tableau') ids.push('dsfrDataList');
    if (lower === 'map' || lower === 'map-reg') ids.push('dsfrColors');
    if (lower.includes('bar') || lower.includes('pie') || lower.includes('line'))
      ids.push('chartTypes');
  } else {
    ids.push(
      'dsfrDataKpi',
      'dsfrDataPodium',
      'dsfrDataList',
      'dsfrDataQuery',
      'chartTypes',
      'dsfrColors'
    );
  }

  if (!ids.includes('dsfrDataQuery')) ids.push('dsfrDataQuery');

  return [...new Set(ids)];
}
