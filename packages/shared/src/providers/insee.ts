/**
 * ProviderConfig for the INSEE Melodi API.
 *
 * Melodi gives access to 95+ statistical datasets from INSEE's catalog
 * (https://catalogue-donnees.insee.fr). Filtering is dimension-based
 * (equality via query params), pagination is page-based.
 *
 * API base URL: https://api.insee.fr/melodi
 * CORS: yes (mirrors Origin) — no proxy needed.
 * Auth: none (anonymous, 30 req/min rate limit).
 */

import type { ProviderConfig } from './provider-config.js';

const INSEE_RE = /melodi\/data\/([^?/]+)/;

export const INSEE_CONFIG: ProviderConfig = {
  id: 'insee',
  displayName: 'INSEE (Melodi)',
  urlPatterns: [INSEE_RE],

  knownHosts: [],              // CORS enabled, no proxy needed
  defaultBaseUrl: 'https://api.insee.fr/melodi',
  defaultAuthType: 'none',

  response: {
    dataPath: 'observations',  // { observations: [...] }
    totalCountPath: 'paging.count',
    nestedDataKey: null,       // adapter handles flattening internally
    requiresFlatten: true,     // observations have nested dimensions/measures/attributes
  },

  pagination: {
    type: 'page',
    pageSize: 1000,
    maxPages: 100,
    maxRecords: 100000,
    params: {
      page: 'page',
      pageSize: 'maxResult',
    },
    nextPagePath: 'paging.next',
    serverMeta: {
      pagePath: '',            // not available
      pageSizePath: '',        // not available
      totalPath: 'paging.count',
    },
  },

  capabilities: {
    serverFetch: true,
    serverFacets: false,
    serverSearch: false,
    serverGroupBy: false,
    serverOrderBy: false,
    serverAggregation: false,
  },

  query: {
    whereFormat: 'colon',
    whereSeparator: ', ',
    aggregationSyntax: 'client-only',
    searchTemplate: null,
  },

  facets: {
    defaultMode: 'client',
  },

  resource: {
    idFields: ['datasetId'],
    apiPathTemplate: '/data/{datasetId}',
    extractIds: (url: string) => {
      const m = url.match(INSEE_RE);
      return m ? { datasetId: m[1] } : null;
    },
  },

  codeGen: {
    usesDsfrDataSource: true,
    usesDsfrDataQuery: true,
    usesDsfrDataNormalize: false,  // adapter flattens observations internally
    sourceApiType: 'insee',
    fieldPrefix: '',
    dependencies: {
      dsfr: true,
      dsfrChart: true,
      dsfrData: true,
    },
  },
};
