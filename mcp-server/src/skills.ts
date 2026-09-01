/**
 * Skills loading and matching — extracted for testability.
 */

import {
  matchSkills as sharedMatchSkills,
  searchSkills,
  scoreSkill,
  MIN_SCORE,
  type SkillMatch,
  type SearchOptions,
} from './skill-matching.generated.js';

/**
 * Sections adressables d'une skill (#513). Definies cote builder-IA dans
 * `apps/builder-ia/src/skills-sections.ts` et transportees telles quelles par
 * `dist/skills.json` : le serveur MCP ne rejoue PAS le decoupage, il lit une
 * donnee deja calculee — un seul endroit ou la partition peut changer.
 */
export const SKILL_SECTION_IDS = ['guide', 'reference', 'exemples', 'pieges'] as const;

export type SkillSectionId = (typeof SKILL_SECTION_IDS)[number];

export interface Skill {
  id: string;
  name: string;
  description: string;
  trigger: string[];
  content: string;
  /**
   * Absent quand le serveur pointe une instance dsfr-data anterieure a #513 :
   * le MCP est distribue separement de l'instance dont il telecharge les skills,
   * donc les deux versions coexistent en production. Tout le code de section
   * doit retomber proprement sur `content`.
   */
  sections?: Partial<Record<SkillSectionId, string>>;
  availableSections?: SkillSectionId[];
}

/** Sections reellement disponibles pour une skill, `[]` si la source est ancienne. */
export function sectionsOf(skill: Skill): SkillSectionId[] {
  if (skill.availableSections?.length) return skill.availableSections;
  if (!skill.sections) return [];
  return SKILL_SECTION_IDS.filter((id) => (skill.sections?.[id] ?? '').length > 0);
}

/**
 * Contenu a renvoyer pour `get_skill(skill_id, section)`.
 *
 * - section absente ou `tout` : contenu integral (comportement historique) ;
 * - skills.json sans `sections` (instance ancienne) : repli sur le contenu
 *   integral, en le disant, plutot qu'une erreur ;
 * - section vide pour cette skill : on liste ce qui existe.
 */
export function selectSection(skill: Skill, section?: string): string {
  if (!section || section === 'tout') return skill.content;

  const available = sectionsOf(skill);
  if (available.length === 0) {
    return (
      `[Cette instance dsfr-data ne publie pas encore de sections — fiche complete ci-dessous.]\n\n` +
      skill.content
    );
  }
  if (!(SKILL_SECTION_IDS as readonly string[]).includes(section)) {
    return `Section "${section}" inconnue. Sections valides : ${[...SKILL_SECTION_IDS, 'tout'].join(', ')}.`;
  }
  const text = skill.sections?.[section as SkillSectionId] ?? '';
  if (!text) {
    return `La skill "${skill.id}" n'a pas de section "${section}". Sections disponibles : ${available.join(', ')}, tout.`;
  }
  return text;
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
 * Matching des skills — delegue au moteur PARTAGE avec le builder-IA (#514).
 *
 * C'etait auparavant un `includes` sur les triggers, structurellement moins
 * pertinent que le cote builder-IA, et toute amelioration devait etre faite
 * deux fois. Le moteur vit maintenant dans
 * `packages/shared/src/ia/skill-matching.ts` et est copie ici par
 * `npm run build:skill-matching`.
 */
export function matchSkills(skills: Skill[], message: string, options?: SearchOptions): Skill[] {
  return sharedMatchSkills(skills, message, options);
}

export { searchSkills, scoreSkill, MIN_SCORE };
export type { SkillMatch, SearchOptions };

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
    // Cartes DSFR Chart (choroplèthes dep/reg/aca/monde via dsfr-data-chart)
    if (lower === 'map' || lower === 'map-reg' || lower === 'map-aca' || lower === 'map-monde')
      ids.push('dsfrColors', 'chartTypes');
    // Cartes Leaflet (dsfr-data-map + compagnons) — distinctes des map* DSFR Chart
    if (lower === 'carte' || lower === 'leaflet' || lower === 'map-layer')
      ids.push('dsfrDataMap', 'dsfrColors');
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
