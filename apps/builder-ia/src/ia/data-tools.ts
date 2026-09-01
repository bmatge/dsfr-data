/**
 * Outils d'introspection de données pour la boucle agentique.
 *
 * Le module vit desormais dans `@dsfr-data/shared` (`packages/shared/src/ia/
 * data-tools.ts`, #515) : il est partage entre le builder-IA et le studio.
 * Ce shim re-exporte l'API — point d'entree historique des imports
 * (`agent-loop.ts`, `chart-renderer.ts`) et des tests.
 */

export type { Row, Aggregation, Diagnosis } from '@dsfr-data/shared';
export {
  aggregateBy,
  buildMultiSeries,
  applyWhereFilter,
  inspectData,
  distinctValues,
  countWhere,
  diagnoseConfig,
} from '@dsfr-data/shared';
