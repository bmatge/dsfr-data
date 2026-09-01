/**
 * Moteur de scoring des skills (#514).
 *
 * La source vit desormais dans `@dsfr-data/shared`
 * (`packages/shared/src/ia/skill-matching.ts`, #515) : partagee entre le
 * builder-IA, le studio et la copie generee du serveur MCP. Ce shim re-exporte
 * l'API — point d'entree historique des imports et des tests.
 */

export type { MatchableSkill, SkillMatch, SearchOptions } from '@dsfr-data/shared';
export {
  normalize,
  tokenize,
  headingsOf,
  scoreSkill,
  searchSkills,
  matchSkills,
} from '@dsfr-data/shared';
