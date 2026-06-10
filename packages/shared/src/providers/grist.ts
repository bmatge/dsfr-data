import type { ProviderConfig } from './provider-config.js';

const GRIST_RE = /\/api\/docs\/([^/]+)\/tables\/([^/]+)/;

export const GRIST_CONFIG: ProviderConfig = {
  id: 'grist',
  displayName: 'Grist',
  urlPatterns: [GRIST_RE],
  knownHosts: [
    { hostname: 'grist.numerique.gouv.fr', proxyEndpoint: '/grist-gouv-proxy' },
    { hostname: 'docs.getgrist.com', proxyEndpoint: '/grist-proxy' },
  ],
  defaultBaseUrl: 'https://grist.numerique.gouv.fr',
  defaultAuthType: 'bearer',

  response: {
    dataPath: 'records',
    totalCountPath: null,
    nestedDataKey: 'fields',
    requiresFlatten: true,
  },

  pagination: {
    type: 'offset',
    pageSize: 100,
    maxPages: 0,
    maxRecords: 0,
    params: {
      offset: 'offset',
      limit: 'limit',
    },
    nextPagePath: null,
  },

  capabilities: {
    serverFetch: true,
    serverFacets: true,
    serverSearch: false,
    serverGroupBy: true,
    serverOrderBy: true,
    serverGeo: false,
    whereFormat: 'colon',
  },

  query: {
    aggregationSyntax: 'sql',
    searchTemplate: null,
  },

  facets: {
    defaultMode: 'server',
  },

  resource: {
    idFields: ['documentId', 'tableId'],
    apiPathTemplate: '/api/docs/{documentId}/tables/{tableId}/records',
    extractIds: (url: string) => {
      const m = url.match(GRIST_RE);
      return m ? { documentId: m[1], tableId: m[2] } : null;
    },
  },
};
