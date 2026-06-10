/**
 * Adapter pour le mode generic (client-side).
 * Pas de fetch API — les données viennent d'une source via data-bridge.
 */

import type { ApiAdapter, AdapterCapabilities, AdapterParams, FetchResult } from './api-adapter.js';
import type { ProviderConfig } from '@dsfr-data/shared/lib';
import { GENERIC_CONFIG } from '@dsfr-data/shared/lib';
import { buildColonFacetWhere } from '../utils/where.js';

export class GenericAdapter implements ApiAdapter {
  readonly type = 'generic';

  readonly capabilities: AdapterCapabilities = {
    serverFetch: false,
    serverFacets: false,
    serverSearch: false,
    serverGroupBy: false,
    serverOrderBy: false,
    serverGeo: false,
    // Aligne sur ce que l'adapter emet reellement (buildFacetWhere colon)
    // et sur GENERIC_CONFIG du shared — declarait 'odsql' a tort (#271)
    whereFormat: 'colon',
  };

  validate(_params: AdapterParams): string | null {
    // Seul chemin qui appelle validate : le mode adapter de dsfr-data-source,
    // active par le piege api-type="generic" + base-url (#288). L'adapter
    // generic ne fetche pas — signaler la config au lieu de laisser fetchAll
    // throw (unhandled rejection avant #283).
    return (
      'api-type "generic" ne fetche pas via base-url — fournissez "url" (mode URL) ' +
      'ou un api-type concret (opendatasoft, tabular, grist, insee)'
    );
  }

  fetchAll(): Promise<FetchResult> {
    throw new Error('GenericAdapter ne supporte pas le fetch serveur');
  }

  fetchPage(): Promise<FetchResult> {
    throw new Error('GenericAdapter ne supporte pas le mode server-side');
  }

  buildUrl(): string {
    throw new Error("GenericAdapter ne construit pas d'URL API");
  }

  buildServerSideUrl(): string {
    throw new Error('GenericAdapter ne supporte pas le mode server-side');
  }

  getDefaultSearchTemplate(): null {
    return null;
  }

  getProviderConfig(): ProviderConfig {
    return GENERIC_CONFIG;
  }

  buildFacetWhere(selections: Record<string, Set<string>>, excludeField?: string): string {
    return buildColonFacetWhere(selections, excludeField);
  }
}
