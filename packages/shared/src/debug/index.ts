/**
 * Collecteur de diagnostic du pipeline dsfr-data (#604).
 *
 * Tout est PUR ou strictement DOM : aucun accès réseau, aucun état global,
 * aucune dépendance à `packages/core`. Le collecteur peut donc tourner
 * n'importe où — dans une app, dans une iframe d'aperçu, ou dans un script
 * autonome injecté sur une page tierce (#608).
 */

export { BUS_EVENTS } from './events.js';
export type {
  BusPaginationMeta,
  BusSourceCommand,
  BusLoadedDetail,
  BusErrorDetail,
  BusLoadingDetail,
  BusCommandDetail,
} from './events.js';

export { STAGE_ROLES, snapshotGraph, downstreamOf, topoOrder } from './graph.js';
export type { StageRole, StageNode, DataflowGraph } from './graph.js';

export { extractRows, summarizeStage, diffFields, fieldMatrix } from './summarize.js';
export type { StageSummary, FieldDiff } from './summarize.js';

export { DataflowRecorder } from './recorder.js';
export type {
  TraceEvent,
  StageStatus,
  StageState,
  Trace,
  DelegationState,
  RecorderOptions,
} from './recorder.js';

export { formatTrace, summarizeTrace } from './format.js';
export type { FormatOptions } from './format.js';
