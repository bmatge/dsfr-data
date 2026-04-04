import type { ProviderConfig } from './provider-config.js';

const ODS_DATASET_RE = /\/api\/explore\/v2\.1\/catalog\/datasets\/([^/]+)/;

export const ODS_CONFIG: ProviderConfig = {
  id: 'opendatasoft',
  displayName: 'OpenDataSoft',
  urlPatterns: [ODS_DATASET_RE],
  knownHosts: [], // any ODS domain is valid — no fixed host
  defaultBaseUrl: 'https://data.opendatasoft.com',
  defaultAuthType: 'apikey-header',

  response: {
    dataPath: 'results',
    totalCountPath: 'total_count',
    nestedDataKey: null,
    requiresFlatten: false,
  },

  pagination: {
    type: 'offset',
    pageSize: 100,
    maxPages: 10,
    maxRecords: 1000,
    params: { offset: 'offset', limit: 'limit' },
    nextPagePath: null,
  },

  capabilities: {
    serverFetch: true,
    serverFacets: true,
    serverSearch: true,
    serverGroupBy: true,
    serverOrderBy: true,
    serverAggregation: true,
  },

  query: {
    whereFormat: 'odsql',
    whereSeparator: ' AND ',
    aggregationSyntax: 'odsql-select',
    searchTemplate: 'search("{q}")',
  },

  facets: {
    defaultMode: 'server',
    endpoint: '/facets',
  },

  resource: {
    idFields: ['datasetId'],
    apiPathTemplate: '/api/explore/v2.1/catalog/datasets/{datasetId}/records',
    extractIds: (url: string) => {
      const m = url.match(ODS_DATASET_RE);
      return m ? { datasetId: m[1] } : null;
    },
  },

  codeGen: {
    usesDsfrDataSource: true,
    usesDsfrDataQuery: true,
    usesDsfrDataNormalize: false,
    sourceApiType: 'opendatasoft',
    fieldPrefix: '',
    dependencies: { dsfr: true, dsfrChart: true, dsfrData: true },
  },
};
