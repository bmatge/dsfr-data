/**
 * Data Bridge - Système de communication inter-composants
 * Permet aux composants dsfr-data-* de partager des données via un système d'événements
 */

export interface DataLoadedEvent {
  sourceId: string;
  data: unknown;
}

export interface DataErrorEvent {
  sourceId: string;
  error: Error;
}

export interface DataLoadingEvent {
  sourceId: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  /** True si le fetch n'a pas pu traiter group-by/aggregate server-side (fallback client) */
  needsClientProcessing?: boolean;
}

export interface SourceCommandEvent {
  sourceId: string;
  page?: number; // pagination
  where?: string; // recherche serveur (ODSQL pour ODS)
  whereKey?: string; // identifie la source du where (permet merge multi-sources)
  orderBy?: string; // tri serveur ("field:direction")
  groupBy?: string; // group-by serveur (delegue par dsfr-data-query)
  aggregate?: string; // agregation serveur (delegue par dsfr-data-query)
}

// Noms des événements custom
export const DATA_EVENTS = {
  LOADED: 'dsfr-data-loaded',
  ERROR: 'dsfr-data-error',
  LOADING: 'dsfr-data-loading',
  SOURCE_COMMAND: 'dsfr-data-source-command',
} as const;

// Cache global des données par sourceId — stocké sur window pour partage entre bundles UMD
const _win = typeof window !== 'undefined' ? (window as any) : ({} as any);
if (!_win.__dsfrDataCache) _win.__dsfrDataCache = new Map<string, unknown>();
if (!_win.__dsfrDataMeta) _win.__dsfrDataMeta = new Map<string, PaginationMeta>();
const dataCache: Map<string, unknown> = _win.__dsfrDataCache;
const metaCache: Map<string, PaginationMeta> = _win.__dsfrDataMeta;

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

  const event = new CustomEvent<DataLoadedEvent>(DATA_EVENTS.LOADED, {
    bubbles: true,
    composed: true,
    detail: { sourceId, data },
  });

  document.dispatchEvent(event);
}

/**
 * Dispatch un événement d'erreur
 */
export function dispatchDataError(sourceId: string, error: Error): void {
  const event = new CustomEvent<DataErrorEvent>(DATA_EVENTS.ERROR, {
    bubbles: true,
    composed: true,
    detail: { sourceId, error },
  });

  document.dispatchEvent(event);
}

/**
 * Dispatch un événement de chargement en cours
 */
export function dispatchDataLoading(sourceId: string): void {
  const event = new CustomEvent<DataLoadingEvent>(DATA_EVENTS.LOADING, {
    bubbles: true,
    composed: true,
    detail: { sourceId },
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

  document.addEventListener(DATA_EVENTS.LOADED, handleLoaded);
  document.addEventListener(DATA_EVENTS.ERROR, handleError);
  document.addEventListener(DATA_EVENTS.LOADING, handleLoading);

  // Retourne une fonction de cleanup
  return () => {
    document.removeEventListener(DATA_EVENTS.LOADED, handleLoaded);
    document.removeEventListener(DATA_EVENTS.ERROR, handleError);
    document.removeEventListener(DATA_EVENTS.LOADING, handleLoading);
  };
}
