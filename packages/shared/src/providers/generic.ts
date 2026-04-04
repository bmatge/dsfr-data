import type { ProviderConfig } from './provider-config.js';

export const GENERIC_CONFIG: ProviderConfig = {
  id: 'generic',
  displayName: 'Generic REST',
  urlPatterns: [], // fallback — matches anything not matched by other providers
  knownHosts: [],
  defaultBaseUrl: '',
  defaultAuthType: 'none',

  response: {
    dataPath: '',
    totalCountPath: null,
    nestedDataKey: null,
    requiresFlatten: false,
  },

  pagination: {
    type: 'none',
    pageSize: 0,
    maxPages: 0,
    maxRecords: 0,
    params: {},
    nextPagePath: null,
  },

  capabilities: {
    serverFetch: false,
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
    idFields: [],
    apiPathTemplate: '',
    extractIds: () => null,
  },

  codeGen: {
    usesDsfrDataSource: true,
    usesDsfrDataQuery: true,
    usesDsfrDataNormalize: false,
    sourceApiType: 'generic',
    fieldPrefix: '',
    dependencies: { dsfr: true, dsfrChart: true, dsfrData: true },
  },
};
