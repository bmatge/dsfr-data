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
  BusIdleDetail,
  BusCommandDetail,
} from './events.js';

export {
  EARLY_BUFFER_KEY,
  earlyBufferScript,
  drainEarlyBuffer,
  readCacheSnapshot,
} from './early-buffer.js';
export type { BufferedBusEvent } from './early-buffer.js';
export { STAGE_ROLES, SHAPE_ATTRS, snapshotGraph, downstreamOf, topoOrder } from './graph.js';
export type { StageRole, StageNode, DataflowGraph, ComputedColumn } from './graph.js';

export {
  FIELD_ATTRS,
  fieldsInAttr,
  referencedFields,
  checkNodeFields,
  fieldIssuesByNode,
} from './field-check.js';
export type { FieldAttrKind, FieldIssue, FieldIssueReason, FieldRef } from './field-check.js';

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

export {
  mountDiagnosticPanel,
  transmettreDiagnostic,
  recupererDiagnostic,
  DIAGNOSTIC_HANDOFF_KEY,
} from './mount.js';
export type { MountDiagnosticOptions, MountedDiagnostic, DiagnosticPanelElement } from './mount.js';
export { attachRecorderToFrame } from './frame.js';
export type { FrameAttachment, FrameAttachOptions } from './frame.js';
export { lintMarkup, formatLintFindings, lireBalises } from './lint-markup.js';
export type { ComponentContract, TagContract, LintFinding, LintSeverity } from './lint-markup.js';
export {
  formatTrace,
  summarizeTrace,
  plural,
  formatInt,
  JOIN_MATCH_ALERT_RATIO,
} from './format.js';
export type { FormatOptions } from './format.js';
