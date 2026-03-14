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
 * Retourne l'adapter pour un api-type donne.
 * Les adapters sont des singletons (stateless).
 */
export function getAdapter(apiType: string): ApiAdapter {
  const adapter = ADAPTER_REGISTRY.get(apiType);
  if (!adapter) {
    throw new Error(`Type d'API non supporte: ${apiType}`);
  }
  return adapter;
}

/**
 * Enregistre un adapter custom (pour extensibilite).
 */
export function registerAdapter(adapter: ApiAdapter): void {
  ADAPTER_REGISTRY.set(adapter.type, adapter);
}
