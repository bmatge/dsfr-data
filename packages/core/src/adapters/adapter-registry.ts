/**
 * Adapter registry — singleton instances of all API adapters.
 *
 * Extracted from api-adapter.ts so that both dsfr-data-source and dsfr-data-query
 * can import getAdapter() without circular dependencies.
 */

import type { ApiAdapter } from './api-adapter.js';
import { GenericAdapter } from './generic-adapter.js';
import { OpenDataSoftAdapter } from './opendatasoft-adapter.js';
import { TabularAdapter } from './tabular-adapter.js';
import { GristAdapter } from './grist-adapter.js';
import { InseeAdapter } from './insee-adapter.js';

const ADAPTER_REGISTRY = new Map<string, ApiAdapter>([
  ['generic', new GenericAdapter()],
  ['opendatasoft', new OpenDataSoftAdapter()],
  ['tabular', new TabularAdapter()],
  ['grist', new GristAdapter()],
  ['insee', new InseeAdapter()],
]);

/**
 * Retourne l'adapter pour un api-type donne, ou null s'il est inconnu.
 * Les adapters sont des singletons (stateless).
 *
 * Ne THROW plus (#283) : l'ancien throw remontait hors try via le
 * setTimeout de _scheduleFetch → unhandled rejection, aucun dsfr-data-error,
 * consommateurs geles en loading. Le call-site (dsfr-data-source) signale
 * l'api-type inconnu via reportConfigError + dispatchDataError.
 */
export function getAdapter(apiType: string): ApiAdapter | null {
  return ADAPTER_REGISTRY.get(apiType) ?? null;
}

/**
 * Enregistre un adapter custom (pour extensibilite).
 */
export function registerAdapter(adapter: ApiAdapter): void {
  ADAPTER_REGISTRY.set(adapter.type, adapter);
}
