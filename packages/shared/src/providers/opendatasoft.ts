import type { ProviderConfig } from './provider-config.js';

/** API URL: .../api/explore/v2.1/catalog/datasets/{slug}/records */
const ODS_API_RE = /\/api\/explore\/v2\.1\/catalog\/datasets\/([^/?#]+)/;
/**
 * Human-facing explorer page. ODS uses several path shapes depending on the
 * instance/theme — the dataset slug follows `dataset` or `assets`, e.g.
 *   https://data.economie.gouv.fr/explore/dataset/prix-controle-technique/table/
 *   https://data.economie.gouv.fr/explore/assets/annuaire-centres-controle-technique/
 *   https://opendata.paris.fr/explore/embed/dataset/{slug}/...
 * The ODS API is served on the same origin as the page, so the records URL is
 * derivable without any network call (see resolveSourceUrl).
 */
const ODS_PAGE_RE = /\/explore\/(?:embed\/)?(?:dataset|assets)\/([^/?#]+)/;

export const ODS_CONFIG: ProviderConfig = {
  id: 'opendatasoft',
  displayName: 'OpenDataSoft',
  urlPatterns: [ODS_API_RE, ODS_PAGE_RE],
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
    serverGeo: true,
    whereFormat: 'odsql',
  },

  query: {
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
      const m = url.match(ODS_API_RE) ?? url.match(ODS_PAGE_RE);
      return m ? { datasetId: m[1] } : null;
    },
  },
};
