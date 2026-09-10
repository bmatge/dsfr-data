/**
 * Data Bridge - Système de communication inter-composants
 * Permet aux composants dsfr-data-* de partager des données via un système d'événements
 */

import type { JoinStats, PivotStats } from '@dsfr-data/shared/lib';

export interface DataLoadedEvent {
  sourceId: string;
  data: unknown;
}

export interface DataErrorEvent {
  sourceId: string;
  error: Error;
  /**
   * URL reellement appelee (proxy applique), a seule fin de diagnostic (#603).
   *
   * `fetch-diagnostics.ts` produit deja l'explication complete d'un echec
   * opaque, mais uniquement dans la console : le message de l'`Error` reste
   * volontairement court pour ne pas deverser un paragraphe dans l'UI. Ce
   * champ rend l'URL disponible aux abonnes du bus (volet Diagnostic,
   * assistant) sans rien changer a l'`Error` elle-meme.
   *
   * Absent quand l'URL n'a pas pu etre construite, ou pour les erreurs qui ne
   * viennent pas d'un fetch (donnees inline invalides, config).
   */
  attemptedUrl?: string;
}

export interface DataLoadingEvent {
  sourceId: string;
}

/**
 * Étape volontairement en attente (#690) : `require-where` est posé et aucun
 * filtre non vide n'a encore été reçu.
 *
 * Distinct d'un chargement (rien n'est parti), d'une erreur (rien n'a échoué)
 * et d'un résultat vide (aucune requête n'a été faite). Les afficheurs le
 * rendent en message « choisissez un filtre », le volet Diagnostic en
 * « en attente d'un filtre ».
 */
export interface DataIdleEvent {
  sourceId: string;
  /** Pourquoi l'étape attend. Seule valeur actuelle : `require-where`. */
  reason: 'require-where';
}

/**
 * Metadonnees de pagination publiees par les sources (#270).
 *
 * CONTRAT :
 * - `serverSide: true` est le SEUL signal qui active la pagination serveur
 *   en aval (list, display). Ne jamais inferer depuis `total` — un fetchAll
 *   publie aussi un total.
 * - `total` : undefined = inconnu (ex. Grist Records hors derniere page).
 *   L'aval doit alors proposer "page suivante" tant que la page est pleine.
 * - `pageSize` : 0 quand non pagine (fetchAll).
 * - `truncated` (#658) : les lignes livrees sont un SOUS-ENSEMBLE de ce que
 *   l'etape aurait pu livrer — plafond `max-records` atteint sur un fetchAll
 *   (`total > data.length`, ou page pleine au plafond quand le total est
 *   inconnu, cas `group_by` ODS #641), ou `limit` d'un dsfr-data-query.
 *   Purement diagnostique : aucun consommateur n'en change de comportement.
 * - `join` (#660) : taux d'appariement pose par dsfr-data-join.
 * - Un dsfr-data-query hors pagination serveur republie `total` = nombre de
 *   lignes AVANT son `limit` (#659) ; en pagination serveur il conserve le
 *   total serveur, dont l'aval a besoin pour paginer.
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  /** Total de lignes cote serveur ; undefined = inconnu */
  total?: number;
  /** True si la source pagine cote serveur (fetchPage) */
  serverSide?: boolean;
  /** True si le fetch n'a pas pu traiter group-by/aggregate server-side (fallback client) */
  needsClientProcessing?: boolean;
  /** True si les lignes livrees sont tronquees (max-records, limit) — #658 */
  truncated?: boolean;
  /** Taux d'appariement d'une jointure — #660 */
  join?: JoinStats;
  /** Colonnes generees et cellules vides d'un pivot long → wide — #255 */
  pivot?: PivotStats;
}

export interface SourceCommandEvent {
  sourceId: string;
  /**
   * Id du composant qui emet la commande (#603) — purement informatif.
   *
   * Le bus est plat : sans lui, une trace ne peut dire que « quelqu'un a
   * demande un group-by a src ». `TransformerMixin` le renseigne avec son
   * propre id lors du relais aval → amont.
   */
  origin?: string;
  page?: number; // pagination
  where?: string; // recherche serveur (ODSQL pour ODS)
  whereKey?: string; // identifie la source du where (permet merge multi-sources)
  orderBy?: string; // tri serveur ("field:direction")
  groupBy?: string; // group-by serveur (delegue par dsfr-data-query)
  aggregate?: string; // agrégation serveur (delegue par dsfr-data-query)
}

// Noms des événements custom
export const DATA_EVENTS = {
  LOADED: 'dsfr-data-loaded',
  ERROR: 'dsfr-data-error',
  LOADING: 'dsfr-data-loading',
  IDLE: 'dsfr-data-idle',
  SOURCE_COMMAND: 'dsfr-data-source-command',
} as const;

// Cache global des données par sourceId — stocké sur window pour partage entre bundles UMD
type WindowWithCache = Window & {
  __dsfrDataCache?: Map<string, unknown>;
  __dsfrDataMeta?: Map<string, PaginationMeta>;
  __dsfrDataIdle?: Set<string>;
};
const _win: WindowWithCache | Record<string, never> =
  typeof window !== 'undefined' ? (window as WindowWithCache) : {};
if (!_win.__dsfrDataCache) _win.__dsfrDataCache = new Map<string, unknown>();
if (!_win.__dsfrDataMeta) _win.__dsfrDataMeta = new Map<string, PaginationMeta>();
if (!_win.__dsfrDataIdle) _win.__dsfrDataIdle = new Set<string>();
const dataCache: Map<string, unknown> = _win.__dsfrDataCache;
const metaCache: Map<string, PaginationMeta> = _win.__dsfrDataMeta;
/**
 * Étapes actuellement en attente d'un filtre (#690).
 *
 * Le bus est événementiel : un afficheur monté APRÈS l'entrée en attente
 * n'aurait rien à lire — ni événement passé, ni cache (purgé). Ce registre
 * joue pour l'état « idle » le rôle que `dataCache` joue pour les lignes.
 */
const idleSources: Set<string> = _win.__dsfrDataIdle;

/**
 * Enregistre des données dans le cache global
 */
export function setDataCache(sourceId: string, data: unknown): void {
  dataCache.set(sourceId, data);
}

/**
 * Récupère des données depuis le cache global
 */
export function getDataCache(sourceId: string): unknown | undefined {
  return dataCache.get(sourceId);
}

/**
 * Supprime des données du cache
 */
export function clearDataCache(sourceId: string): void {
  dataCache.delete(sourceId);
  idleSources.delete(sourceId);
}

/**
 * L'étape attend-elle un filtre (#690) ? Lu par les abonnés qui se branchent
 * après coup, l'événement `dsfr-data-idle` étant déjà passé.
 */
export function isDataIdle(sourceId: string): boolean {
  return idleSources.has(sourceId);
}

/**
 * Enregistre des métadonnées de pagination
 */
export function setDataMeta(sourceId: string, meta: PaginationMeta): void {
  metaCache.set(sourceId, meta);
}

/**
 * Récupère les métadonnées de pagination
 */
export function getDataMeta(sourceId: string): PaginationMeta | undefined {
  return metaCache.get(sourceId);
}

/**
 * Supprime les métadonnées de pagination
 */
export function clearDataMeta(sourceId: string): void {
  metaCache.delete(sourceId);
}

/**
 * Dispatch un événement de données chargées
 */
export function dispatchDataLoaded(sourceId: string, data: unknown): void {
  setDataCache(sourceId, data);
  idleSources.delete(sourceId);

  const event = new CustomEvent<DataLoadedEvent>(DATA_EVENTS.LOADED, {
    bubbles: true,
    composed: true,
    detail: { sourceId, data },
  });

  document.dispatchEvent(event);
}

/**
 * Dispatch un événement d'erreur.
 *
 * `attemptedUrl` est optionnelle et purement diagnostique (#603) : elle ne
 * modifie ni le message de l'`Error`, ni le contrat des abonnés existants.
 */
export function dispatchDataError(sourceId: string, error: Error, attemptedUrl?: string): void {
  idleSources.delete(sourceId);
  const event = new CustomEvent<DataErrorEvent>(DATA_EVENTS.ERROR, {
    bubbles: true,
    composed: true,
    detail: attemptedUrl ? { sourceId, error, attemptedUrl } : { sourceId, error },
  });

  document.dispatchEvent(event);
}

/**
 * Dispatch un événement de chargement en cours
 */
export function dispatchDataLoading(sourceId: string): void {
  idleSources.delete(sourceId);
  const event = new CustomEvent<DataLoadingEvent>(DATA_EVENTS.LOADING, {
    bubbles: true,
    composed: true,
    detail: { sourceId },
  });

  document.dispatchEvent(event);
}

/**
 * Dispatch un état « en attente d'un filtre » (#690).
 *
 * Le cache et la meta de l'étape sont PURGÉS avant l'émission : une étape qui
 * repasse en attente (dernier filtre retiré) ne doit pas laisser ses lignes
 * précédentes derrière elle — un afficheur monté après coup les lirait au
 * cache et se croirait alimenté.
 */
export function dispatchDataIdle(
  sourceId: string,
  reason: DataIdleEvent['reason'] = 'require-where'
): void {
  clearDataCache(sourceId);
  clearDataMeta(sourceId);
  idleSources.add(sourceId);

  const event = new CustomEvent<DataIdleEvent>(DATA_EVENTS.IDLE, {
    bubbles: true,
    composed: true,
    detail: { sourceId, reason },
  });

  document.dispatchEvent(event);
}

/**
 * Dispatch une commande vers une source (pagination, recherche, tri)
 */
export function dispatchSourceCommand(
  sourceId: string,
  command: Omit<SourceCommandEvent, 'sourceId'>
): void {
  const event = new CustomEvent<SourceCommandEvent>(DATA_EVENTS.SOURCE_COMMAND, {
    bubbles: true,
    composed: true,
    detail: { sourceId, ...command },
  });

  document.dispatchEvent(event);
}

/**
 * S'abonne aux commandes pour une source
 */
export function subscribeToSourceCommands(
  sourceId: string,
  callback: (command: Omit<SourceCommandEvent, 'sourceId'>) => void
): () => void {
  const handler = (e: Event) => {
    const event = e as CustomEvent<SourceCommandEvent>;
    if (event.detail.sourceId === sourceId) {
      const { sourceId: _, ...rest } = event.detail;
      callback(rest);
    }
  };
  document.addEventListener(DATA_EVENTS.SOURCE_COMMAND, handler);
  return () => document.removeEventListener(DATA_EVENTS.SOURCE_COMMAND, handler);
}

/**
 * S'abonne aux événements d'une source de données
 */
export function subscribeToSource(
  sourceId: string,
  callbacks: {
    onLoaded?: (data: unknown) => void;
    onError?: (error: Error) => void;
    onLoading?: () => void;
    /** L'étape amont attend un filtre (`require-where`, #690) */
    onIdle?: (reason: DataIdleEvent['reason']) => void;
  }
): () => void {
  const handleLoaded = (e: Event) => {
    const event = e as CustomEvent<DataLoadedEvent>;
    if (event.detail.sourceId === sourceId && callbacks.onLoaded) {
      callbacks.onLoaded(event.detail.data);
    }
  };

  const handleError = (e: Event) => {
    const event = e as CustomEvent<DataErrorEvent>;
    if (event.detail.sourceId === sourceId && callbacks.onError) {
      callbacks.onError(event.detail.error);
    }
  };

  const handleLoading = (e: Event) => {
    const event = e as CustomEvent<DataLoadingEvent>;
    if (event.detail.sourceId === sourceId && callbacks.onLoading) {
      callbacks.onLoading();
    }
  };

  const handleIdle = (e: Event) => {
    const event = e as CustomEvent<DataIdleEvent>;
    if (event.detail.sourceId === sourceId && callbacks.onIdle) {
      callbacks.onIdle(event.detail.reason);
    }
  };

  document.addEventListener(DATA_EVENTS.LOADED, handleLoaded);
  document.addEventListener(DATA_EVENTS.ERROR, handleError);
  document.addEventListener(DATA_EVENTS.LOADING, handleLoading);
  document.addEventListener(DATA_EVENTS.IDLE, handleIdle);

  // Retourne une fonction de cleanup
  return () => {
    document.removeEventListener(DATA_EVENTS.LOADED, handleLoaded);
    document.removeEventListener(DATA_EVENTS.ERROR, handleError);
    document.removeEventListener(DATA_EVENTS.LOADING, handleLoading);
    document.removeEventListener(DATA_EVENTS.IDLE, handleIdle);
  };
}
