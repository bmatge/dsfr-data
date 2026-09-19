import {
  subscribeToSource,
  getDataCache,
  isDataIdle,
  dispatchDataLoaded,
  dispatchDataLoading,
  dispatchDataError,
  dispatchDataIdle,
  setDataMeta,
  clearDataCache,
  clearDataMeta,
} from './data-bridge.js';
import { getByPath } from './json-path.js';
import type { TemplateVars } from './template-clone.js';

/**
 * L'émetteur de `scopes` (#891) — partitionner une source par champ et émettre
 * un id par clé.
 *
 * Extrait du composant pour une raison de fond, pas de confort : le garde
 * statique de #280 interdit à un composant de recoder un abonnement au bus,
 * parce que six transformateurs l'avaient fait chacun à sa façon (erreur jamais
 * remise à zéro, abonnement fuité quand `source` était vidé…). `scopes` ne
 * rentre dans aucun des deux mixins — `SourceSubscriberMixin` abonne à UNE
 * source déclarée et ne réémet rien ; `TransformerMixin` réémet sous SON id,
 * pas sous N ids fabriqués. Le cycle de vie vit donc ici, en un seul endroit,
 * éprouvé pour lui-même.
 *
 * Le contrat en trois phrases. La partition est faite **une fois** par émission
 * (une `Map` par champ), là où N `dsfr-data-query` refiltraient chacune la
 * source entière. Une clé sans lignes émet un **tableau vide** — la ligne
 * existe, son graphique est vide, pas absent. Les états `loading`, `error` et
 * `idle` de la source scopée sont relayés tels quels sur chaque id scopé, et
 * les ids qui ne sont plus émis sont **purgés** du cache (une ligne retirée ne
 * doit pas laisser ses lignes derrière elle, #895).
 */

/** Une entrée de `scopes` : `source:champ:alias` (#888, grammaire A). */
export interface ScopeEntry {
  /** Id de la source partitionnée. */
  source: string;
  /** Champ de la source dont la valeur apparie une ligne répétée. */
  field: string;
  /** Préfixe des ids émis (`<alias>-<clé>`) ; défaut : l'id de la source. */
  alias: string;
  /** L'entrée telle qu'écrite, pour la nommer dans les erreurs. */
  raw: string;
}

/** État d'une source scopée, relayé tel quel sur chacun de ses ids scopés. */
type ScopeStatus = 'loading' | 'loaded' | 'error' | 'idle';

interface ScopeSourceState {
  status: ScopeStatus;
  rows: Record<string, unknown>[];
  error: Error | null;
  /** Partitions déjà calculées pour cette émission, par champ. */
  parts: Map<string, Map<string, Record<string, unknown>[]>>;
}

/**
 * Analyse `scopes` selon la grammaire A (#888). Rend les entrées ET la première
 * erreur rencontrée : une grammaire fausse ne doit jamais être silencieuse
 * (PG-022 du banc), et une entrée fausse n'emporte pas les autres.
 *
 * `keyField` est exigé dès qu'une entrée est déclarée : la clé de partition est
 * celle de la ligne répétée.
 */
export function parseScopes(
  scopes: string,
  keyField: string
): { entries: ScopeEntry[]; error: string | null } {
  const raw = scopes.trim();
  if (!raw) return { entries: [], error: null };
  const entries: ScopeEntry[] = [];
  let error: string | null = null;
  const aliases = new Set<string>();
  for (const chunk of raw.split('|')) {
    const text = chunk.trim();
    if (!text) continue;
    const terms = text.split(':').map((t) => t.trim());
    if (terms.length < 2 || terms.length > 3 || terms.some((t) => t === '')) {
      error ??=
        `scopes : entrée « ${text} » — attendu source:champ:alias ` +
        `(l'alias est facultatif), entrées séparées par « | »`;
      continue;
    }
    const [source, field, alias = source] = terms;
    if (aliases.has(alias)) {
      error ??= `scopes : alias « ${alias} » déclaré deux fois — un alias, un préfixe d'ids`;
      continue;
    }
    aliases.add(alias);
    entries.push({ source, field, alias, raw: text });
  }
  if (!error && entries.length > 0 && !keyField.trim()) {
    error =
      'scopes : attribut "key-field" requis — la clé de partition est celle de la ligne répétée';
  }
  return { entries, error };
}

/**
 * L'abonnement, la partition, l'émission et la purge d'un jeu d'entrées
 * `scopes`. Une instance par composant ; `configure()` la (re)met en place,
 * `setKeys()` lui donne les clés courantes, `teardown()` la démonte.
 */
export class ScopeEmitter {
  /** Entrées analysées ; vide tant que l'attribut est vide ou faux. */
  entries: ScopeEntry[] = [];
  /** Erreur de grammaire, connue dès l'analyse (avant toute donnée). */
  configError: string | null = null;
  /** Erreur relevée à l'émission : champ absent des lignes d'une source scopée. */
  runtimeError: string | null = null;

  private _states = new Map<string, ScopeSourceState>();
  private _unsubs: Array<() => void> = [];
  /** Ids scopés actuellement émis — le périmètre exact de la purge. */
  private _emitted = new Set<string>();
  /** Clés des lignes en cours, dans l'ordre des données (valeurs de `$key`). */
  private _keys: string[] = [];

  /**
   * @param onReport  reçoit un message d'erreur de configuration à poser.
   * @param onProbe   rend `true` quand le composant est encore connecté (le
   *                  contrôle « source introuvable » est différé).
   */
  constructor(
    private readonly onReport: (message: string) => void,
    private readonly isConnected: () => boolean
  ) {}

  /** (Ré)analyse et (ré)abonne. Cleanup TOUJOURS en premier, config fausse comprise. */
  configure(scopes: string, keyField: string): void {
    for (const off of this._unsubs) off();
    this._unsubs = [];
    this._states.clear();
    const { entries, error } = parseScopes(scopes, keyField);
    this.entries = entries;
    this.configError = error;
    this.runtimeError = null;
    if (error) this.onReport(error);
    if (entries.length === 0) {
      this._sync(new Set());
      return;
    }
    for (const source of new Set(entries.map((e) => e.source))) {
      const state: ScopeSourceState = {
        status: isDataIdle(source) ? 'idle' : 'loading',
        rows: [],
        error: null,
        parts: new Map(),
      };
      this._states.set(source, state);
      const cached = getDataCache(source);
      if (cached !== undefined) {
        state.status = 'loaded';
        state.rows = Array.isArray(cached) ? (cached as Record<string, unknown>[]) : [];
      }
      this._unsubs.push(
        subscribeToSource(source, {
          onLoaded: (data) => {
            state.status = 'loaded';
            state.rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
            state.error = null;
            state.parts.clear();
            this.emit();
          },
          onLoading: () => {
            state.status = 'loading';
            state.parts.clear();
            this.emit();
          },
          onError: (err) => {
            state.status = 'error';
            state.error = err;
            state.parts.clear();
            this.emit();
          },
          onIdle: () => {
            state.status = 'idle';
            state.rows = [];
            state.parts.clear();
            this.emit();
          },
        })
      );
    }
    this._probe();
  }

  /**
   * Une source scopée absente de la page est une panne parfaitement
   * silencieuse : les ids scopés resteraient « en chargement » pour toujours.
   * Le contrôle est différé d'une macrotâche — l'amont peut être écrit APRÈS le
   * répéteur, et n'être rehaussé qu'ensuite.
   */
  private _probeScheduled = false;

  private _probe(): void {
    if (this._probeScheduled || typeof document === 'undefined') return;
    this._probeScheduled = true;
    setTimeout(() => {
      this._probeScheduled = false;
      if (!this.isConnected() || this.entries.length === 0) return;
      for (const source of new Set(this.entries.map((e) => e.source))) {
        const absent =
          !document.getElementById(source) &&
          getDataCache(source) === undefined &&
          !isDataIdle(source);
        if (absent) {
          this.onReport(`scopes : source « ${source} » introuvable dans la page`);
          return;
        }
      }
    }, 0);
  }

  teardown(): void {
    for (const off of this._unsubs) off();
    this._unsubs = [];
    this._states.clear();
    this._keys = [];
    this._sync(new Set());
  }

  /** Les clés des lignes répétées, dans leur ordre — celles qu'on émet. */
  setKeys(keys: string[]): void {
    this._keys = keys;
  }

  /** Les ids actuellement émis, pour le graphe du volet Diagnostic. */
  emittedIds(): string[] {
    return [...this._emitted];
  }

  /** Variables `{{$scope.alias}}` (et `{{$scope}}` si une seule entrée) d'une ligne. */
  vars(key: string): TemplateVars {
    const out: TemplateVars = {};
    for (const entry of this.entries) {
      out[`$scope.${entry.alias}`] = () => `${entry.alias}-${key}`;
    }
    if (this.entries.length === 1) {
      const only = this.entries[0];
      out.$scope = () => `${only.alias}-${key}`;
    }
    return out;
  }

  /** Une source scopée est-elle dans un état autre que `loaded` ? */
  hasPendingState(): boolean {
    for (const state of this._states.values()) if (state.status !== 'loaded') return true;
    return false;
  }

  /** Partition d'une source par champ — calculée UNE fois par émission. */
  private _partition(
    state: ScopeSourceState,
    field: string
  ): Map<string, Record<string, unknown>[]> {
    const known = state.parts.get(field);
    if (known) return known;
    const map = new Map<string, Record<string, unknown>[]>();
    for (const row of state.rows) {
      const v = getByPath(row, field);
      if (v === null || v === undefined) continue;
      const key = String(v);
      const bucket = map.get(key);
      if (bucket) bucket.push(row);
      else map.set(key, [row]);
    }
    state.parts.set(field, map);
    return map;
  }

  /**
   * Émet un id scopé par entrée et par clé, avec l'état de la source scopée.
   * Une clé sans lignes émet un tableau vide.
   */
  emit(): void {
    if (this.entries.length === 0 || this.configError) {
      this._sync(new Set());
      return;
    }
    const next = new Set<string>();
    let fieldError: string | null = null;
    for (const entry of this.entries) {
      const state = this._states.get(entry.source);
      if (!state) continue;
      const parts = state.status === 'loaded' ? this._partition(state, entry.field) : null;
      if (parts && parts.size === 0 && state.rows.length > 0) {
        const seen = Object.keys(state.rows[0]).slice(0, 8).join(', ');
        fieldError ??=
          `scopes : entrée « ${entry.raw} » — champ « ${entry.field} » absent des lignes de ` +
          `« ${entry.source} » (champs vus : ${seen})`;
      }
      for (const key of this._keys) {
        const id = `${entry.alias}-${key}`;
        next.add(id);
        switch (state.status) {
          case 'loaded': {
            const rows = parts?.get(key) ?? [];
            // Meta des transformateurs (ARCHITECTURE § 3.6) : le total est celui
            // du scope ; `truncated` et `serverSide` ne se relaient pas — aucun
            // serveur ne pagine un id fabriqué.
            setDataMeta(id, { page: 1, pageSize: 0, total: rows.length });
            dispatchDataLoaded(id, rows);
            break;
          }
          case 'loading':
            dispatchDataLoading(id);
            break;
          case 'error':
            dispatchDataError(id, state.error ?? new Error('source scopée en erreur'));
            break;
          case 'idle':
            dispatchDataIdle(id);
            break;
        }
      }
    }
    this._sync(next);
    if (fieldError !== this.runtimeError) {
      this.runtimeError = fieldError;
      if (fieldError) this.onReport(fieldError);
    }
  }

  /**
   * Rejoue les seuls états non-`loaded`. `loaded` se rattrape au cache ;
   * `loading`, `error` et `idle` sont des ÉVÉNEMENTS, et une ligne qui vient de
   * naître les a manqués — elle resterait sur « aucune donnée » sous une source
   * qui charge encore.
   */
  replayStates(): void {
    for (const entry of this.entries) {
      const state = this._states.get(entry.source);
      if (!state || state.status === 'loaded') continue;
      for (const key of this._keys) {
        const id = `${entry.alias}-${key}`;
        if (state.status === 'loading') dispatchDataLoading(id);
        else if (state.status === 'error')
          dispatchDataError(id, state.error ?? new Error('source scopée en erreur'));
        else dispatchDataIdle(id);
      }
    }
  }

  /**
   * Purge du cache et de la meta des ids qui ne sont plus émis — ligne
   * disparue, alias retiré, répéteur déconnecté. Sans elle, un composant monté
   * après coup lirait au cache les lignes d'une ligne qui n'existe plus (#895).
   */
  private _sync(next: Set<string>): void {
    for (const id of this._emitted) {
      if (next.has(id)) continue;
      clearDataCache(id);
      clearDataMeta(id);
    }
    this._emitted = next;
  }
}
