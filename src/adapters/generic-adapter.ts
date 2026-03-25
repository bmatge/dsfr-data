/**
 * Adapter pour le mode generic (client-side).
 * Pas de fetch API — les donnees viennent d'une source via data-bridge.
 */

import type { ApiAdapter, AdapterCapabilities, AdapterParams, FetchResult } from './api-adapter.js';
import type { ProviderConfig } from '@dsfr-data/shared';
import { GENERIC_CONFIG } from '@dsfr-data/shared';

export class GenericAdapter implements ApiAdapter {
  readonly type = 'generic';

  readonly capabilities: AdapterCapabilities = {
    serverFetch: false,
    serverFacets: false,
    serverSearch: false,
    serverGroupBy: false,
    serverOrderBy: false,
    serverGeo: false,
    whereFormat: 'odsql',
  };

  validate(_params: AdapterParams): string | null {
    return null;
  }

  fetchAll(): Promise<FetchResult> {
    throw new Error('GenericAdapter ne supporte pas le fetch serveur');
  }

  fetchPage(): Promise<FetchResult> {
    throw new Error('GenericAdapter ne supporte pas le mode server-side');
  }

  buildUrl(): string {
    throw new Error('GenericAdapter ne construit pas d\'URL API');
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

  buildFacetWhere(
    selections: Record<string, Set<string>>,
    excludeField?: string
  ): string {
    // Fallback colon syntax
    const parts: string[] = [];
    for (const [field, values] of Object.entries(selections)) {
      if (field === excludeField || values.size === 0) continue;
      if (values.size === 1) {
        parts.push(`${field}:eq:${[...values][0]}`);
      } else {
        parts.push(`${field}:in:${[...values].join('|')}`);
      }
    }
    return parts.join(', ');
  }
}
