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
