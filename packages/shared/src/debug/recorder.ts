/**
 * Le collecteur : un seul écouteur, tout le flux (#604).
 *
 * Tout le trafic inter-composants passe par quatre `CustomEvent` dispatchés
 * sur `document` (`packages/core/src/utils/data-bridge.ts`). Un unique
 * `addEventListener` voit donc passer l'intégralité du pipeline d'une page,
 * **sans modifier un seul composant** — c'est ce qui rend ce chantier petit.
 *
 * Deux pièges que le code ci-dessous traite explicitement :
 *
 * - **Le cache global s'efface sous nos pieds.** `TransformerMixin`
 *   `disconnectedCallback` appelle `clearDataCache(this.id)` : une étape
 *   retirée du DOM perd son entrée. S'appuyer sur `window.__dsfrDataCache`
 *   ferait disparaître la trace au moment précis où on en a besoin — le
 *   collecteur garde donc SA copie.
 * - **Il n'existe aucun signal « le pipeline a fini ».** Une commande
 *   remontante peut relancer toute la chaîne bien après le dernier événement.
 *   D'où une quiescence explicite : plus rien depuis N ms ET aucune étape en
 *   chargement, avec un plafond dur.
 */

import {
  BUS_EVENTS,
  type BusCommandDetail,
  type BusErrorDetail,
  type BusLoadedDetail,
  type BusLoadingDetail,
  type BusPaginationMeta,
} from './events.js';
import { snapshotGraph, topoOrder, type DataflowGraph } from './graph.js';
import { summarizeStage, type StageSummary } from './summarize.js';
import type { Field, Row } from '../ia/data-tools.js';

export type TraceEvent =
  | { seq: number; t: number; kind: 'loading'; node: string }
  | {
      seq: number;
      t: number;
      kind: 'loaded';
      node: string;
      rows: number;
      fields: Field[];
      sample: Row[];
      shape: StageSummary['shape'];
      meta?: BusPaginationMeta;
    }
  | { seq: number; t: number; kind: 'error'; node: string; message: string; attemptedUrl?: string }
  | {
      seq: number;
      t: number;
      kind: 'command';
      node: string;
      from?: string;
      cmd: Omit<BusCommandDetail, 'sourceId' | 'origin'>;
    };

/**
 * `Omit` sur une union en écrase les branches (il ne garde que les clés
 * communes). Cette variante distribue, ce qui permet de construire un
 * événement sans son horodatage tout en gardant le typage par `kind`.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Un événement de trace, avant que le collecteur ne le date et le numérote. */
export type TraceEventInput = DistributiveOmit<TraceEvent, 'seq' | 't'>;

export type StageStatus = 'idle' | 'loading' | 'loaded' | 'error';

/** Dernier état connu d'une étape — ce que le volet affiche par nœud. */
export interface StageState {
  status: StageStatus;
  rows?: number;
  fields?: Field[];
  sample?: Row[];
  shape?: StageSummary['shape'];
  meta?: BusPaginationMeta;
  message?: string;
  attemptedUrl?: string;
  /** Nombre d'émissions observées — révèle les boucles de rechargement. */
  emissions: number;
}

/** Ce que le volet, l'assistant et les tests consomment. */
export interface Trace {
  graph: DataflowGraph;
  events: TraceEvent[];
  states: Record<string, StageState>;
  /** Ms écoulées depuis le dernier événement, au moment du snapshot. */
  sinceLastEventMs: number | null;
  quiescent: boolean;
  /** Délégation serveur relevée sur les dsfr-data-query (#603). */
  delegation: Record<string, DelegationState>;
}

export interface DelegationState {
  groupBy: boolean;
  aggregate: boolean;
  orderBy: boolean;
  where: boolean;
}

export interface RecorderOptions {
  /** Document écouté — celui d'une iframe, en général. */
  doc?: Document;
  /** Racine du parcours DOM ; défaut : le document écouté. */
  root?: ParentNode;
  /** Événements conservés (anneau glissant). */
  maxEvents?: number;
  /** Lignes d'échantillon par émission. */
  sampleRows?: number;
  /** Silence requis pour déclarer la quiescence. */
  quiescenceMs?: number;
  /** Plafond dur d'attente — le pipeline-executor utilise déjà 15 s. */
  maxWaitMs?: number;
  /** Horloge injectable (tests). */
  now?: () => number;
}

const DEFAULTS = {
  maxEvents: 300,
  sampleRows: 5,
  quiescenceMs: 300,
  maxWaitMs: 15000,
};

/** Interface minimale d'un dsfr-data-query, pour lire sa délégation (#603). */
interface QueryLike extends Element {
  getDelegation?: () => DelegationState;
}

export class DataflowRecorder {
  private readonly doc: Document;
  private readonly root: ParentNode;
  private readonly opts: Required<Omit<RecorderOptions, 'doc' | 'root'>>;

  private events: TraceEvent[] = [];
  private states = new Map<string, StageState>();
  private seq = 0;
  private lastEventAt: number | null = null;
  private listeners: Array<() => void> = [];
  private changeHandlers = new Set<() => void>();
  private running = false;

  constructor(options: RecorderOptions = {}) {
    this.doc = options.doc ?? document;
    this.root = options.root ?? this.doc;
    this.opts = {
      maxEvents: options.maxEvents ?? DEFAULTS.maxEvents,
      sampleRows: options.sampleRows ?? DEFAULTS.sampleRows,
      quiescenceMs: options.quiescenceMs ?? DEFAULTS.quiescenceMs,
      maxWaitMs: options.maxWaitMs ?? DEFAULTS.maxWaitMs,
      now: options.now ?? (() => Date.now()),
    };
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Branche les quatre écouteurs. Idempotent. */
  start(): void {
    if (this.running) return;
    this.running = true;

    const on = <T>(name: string, handler: (detail: T) => void) => {
      const fn = (e: Event) => handler((e as CustomEvent<T>).detail);
      this.doc.addEventListener(name, fn);
      this.listeners.push(() => this.doc.removeEventListener(name, fn));
    };

    on<BusLoadingDetail>(BUS_EVENTS.LOADING, (d) => {
      if (!d?.sourceId) return;
      this.push({ kind: 'loading', node: d.sourceId } as const);
      this.patch(d.sourceId, { status: 'loading' });
    });

    on<BusLoadedDetail>(BUS_EVENTS.LOADED, (d) => {
      if (!d?.sourceId) return;
      const summary = summarizeStage(d.data, this.opts.sampleRows);
      const meta = this.readMeta(d.sourceId);
      this.push({
        kind: 'loaded',
        node: d.sourceId,
        rows: summary.rows,
        fields: summary.fields,
        sample: summary.sample,
        shape: summary.shape,
        ...(meta ? { meta } : {}),
      } as const);
      const previous = this.states.get(d.sourceId);
      this.patch(d.sourceId, {
        status: 'loaded',
        rows: summary.rows,
        fields: summary.fields,
        sample: summary.sample,
        shape: summary.shape,
        ...(meta ? { meta } : {}),
        message: undefined,
        attemptedUrl: undefined,
        emissions: (previous?.emissions ?? 0) + 1,
      });
    });

    on<BusErrorDetail>(BUS_EVENTS.ERROR, (d) => {
      if (!d?.sourceId) return;
      const message = d.error?.message ?? 'Erreur inconnue';
      this.push({
        kind: 'error',
        node: d.sourceId,
        message,
        ...(d.attemptedUrl ? { attemptedUrl: d.attemptedUrl } : {}),
      } as const);
      this.patch(d.sourceId, {
        status: 'error',
        message,
        ...(d.attemptedUrl ? { attemptedUrl: d.attemptedUrl } : {}),
      });
    });

    on<BusCommandDetail>(BUS_EVENTS.SOURCE_COMMAND, (d) => {
      if (!d?.sourceId) return;
      const { sourceId, origin, ...cmd } = d;
      this.push({
        kind: 'command',
        node: sourceId,
        ...(origin ? { from: origin } : {}),
        cmd,
      } as const);
    });
  }

  stop(): void {
    for (const off of this.listeners) off();
    this.listeners = [];
    this.running = false;
  }

  clear(): void {
    this.events = [];
    this.states.clear();
    this.seq = 0;
    this.lastEventAt = null;
    this.notify();
  }

  /** S'abonne aux changements — pour un rendu vivant. Rend le désabonnement. */
  onChange(handler: () => void): () => void {
    this.changeHandlers.add(handler);
    return () => this.changeHandlers.delete(handler);
  }

  /**
   * Meta de pagination de l'étape, lue sur le cache global au moment de
   * l'émission. `TransformerMixin` la pose AVANT `dispatchDataLoaded` (#282),
   * elle est donc à jour ici.
   */
  private readMeta(sourceId: string): BusPaginationMeta | undefined {
    const win = this.doc.defaultView as
      (Window & { __dsfrDataMeta?: Map<string, BusPaginationMeta> }) | null;
    return win?.__dsfrDataMeta?.get(sourceId);
  }

  private push(partial: TraceEventInput): void {
    this.seq += 1;
    const t = this.opts.now();
    this.lastEventAt = t;
    this.events.push({ ...partial, seq: this.seq, t } as TraceEvent);
    if (this.events.length > this.opts.maxEvents) {
      this.events.splice(0, this.events.length - this.opts.maxEvents);
    }
    this.notify();
  }

  private patch(node: string, patch: Partial<StageState>): void {
    const current = this.states.get(node) ?? { status: 'idle' as StageStatus, emissions: 0 };
    this.states.set(node, { ...current, ...patch });
  }

  private notify(): void {
    for (const handler of this.changeHandlers) handler();
  }

  /** Vrai quand plus rien ne bouge et qu'aucune étape n'est en chargement. */
  isQuiescent(): boolean {
    if (this.lastEventAt === null) return true;
    if (this.opts.now() - this.lastEventAt < this.opts.quiescenceMs) return false;
    for (const state of this.states.values()) {
      if (state.status === 'loading') return false;
    }
    return true;
  }

  /**
   * Attend la quiescence, ou le plafond.
   *
   * Rend `false` si le plafond a été atteint : l'appelant doit alors afficher
   * « en cours » plutôt qu'un faux calme — un état intermédiaire présenté
   * comme final est pire que pas d'information du tout.
   */
  async waitForQuiescence(): Promise<boolean> {
    const deadline = this.opts.now() + this.opts.maxWaitMs;
    // Pas de setInterval : un pas court garde la latence perçue basse sans
    // occuper la boucle d'événements.
    const step = Math.max(30, Math.floor(this.opts.quiescenceMs / 4));
    for (;;) {
      if (this.isQuiescent()) return true;
      if (this.opts.now() >= deadline) return false;
      await new Promise((r) => setTimeout(r, step));
    }
  }

  /** Délégation serveur des dsfr-data-query présents dans la racine (#603). */
  private readDelegation(): Record<string, DelegationState> {
    const out: Record<string, DelegationState> = {};
    for (const el of Array.from(this.root.querySelectorAll('dsfr-data-query'))) {
      const query = el as QueryLike;
      if (typeof query.getDelegation !== 'function') continue;
      const id = query.id;
      if (!id) continue;
      try {
        out[id] = query.getDelegation();
      } catch {
        // Un composant non encore rehaussé ne doit jamais casser la trace.
      }
    }
    return out;
  }

  /** Instantané complet : topologie + journal + état par étape. */
  snapshot(): Trace {
    const graph = snapshotGraph(this.root);
    const states: Record<string, StageState> = {};

    // L'ordre topologique donne au volet et au texte la lecture amont → aval
    // que l'utilisateur attend, quel que soit l'ordre du document.
    for (const node of topoOrder(graph)) {
      states[node.id] = this.states.get(node.id) ?? { status: 'idle', emissions: 0 };
    }
    // Une étape qui a émis puis a été retirée du DOM reste dans le journal :
    // c'est souvent elle qu'on cherche.
    for (const [id, state] of this.states) {
      if (!states[id]) states[id] = state;
    }

    return {
      graph,
      events: [...this.events],
      states,
      sinceLastEventMs: this.lastEventAt === null ? null : this.opts.now() - this.lastEventAt,
      quiescent: this.isQuiescent(),
      delegation: this.readDelegation(),
    };
  }
}
