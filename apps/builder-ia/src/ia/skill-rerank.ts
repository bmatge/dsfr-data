/**
 * Reclassement souverain des skills via Albert `/v1/rerank` (#514).
 *
 * La source vit desormais dans `@dsfr-data/shared`
 * (`packages/shared/src/ia/skill-rerank.ts`) : le Studio IA reclasse avec le
 * meme code (#1081). Ce shim re-exporte l'API — point d'entree historique des
 * imports et des tests.
 */

export type { RerankOptions } from '@dsfr-data/shared';
export { rerankSkills, rerankUrlFrom } from '@dsfr-data/shared';
