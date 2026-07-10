import type { ProviderConfig } from './provider-config.js';

/** Direct Tabular API URL: tabular-api.data.gouv.fr/api/resources/{id}/data/ */
const TABULAR_API_RE = /tabular-api\.data\.gouv\.fr\/api\/resources\/([^/?#]+)/;
/**
 * Stable data.gouv.fr resource permalink, e.g.
 *   https://www.data.gouv.fr/fr/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503
 * The {uuid} is the resource id queryable via the Tabular API (served on a
 * different host — tabular-api.data.gouv.fr — handled in resolveSourceUrl).
 * NB: a data.gouv DATASET page (/datasets/{slug}/) is NOT matched here: a
 * dataset holds N resources, so picking one requires a network lookup (Phase 1).
 */
const TABULAR_PERMALINK_RE =
  /data\.gouv\.fr\/(?:[a-z]{2}\/)?datasets\/r\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export const TABULAR_CONFIG: ProviderConfig = {
  id: 'tabular',
  displayName: 'Tabular (data.gouv.fr)',
  urlPatterns: [TABULAR_API_RE, TABULAR_PERMALINK_RE],
  knownHosts: [{ hostname: 'tabular-api.data.gouv.fr', proxyEndpoint: '/tabular-proxy' }],
  defaultBaseUrl: 'https://tabular-api.data.gouv.fr',
  defaultAuthType: 'none',

  response: {
    dataPath: 'data',
    totalCountPath: 'meta.total',
    nestedDataKey: null,
    requiresFlatten: false,
  },

  pagination: {
    type: 'page',
    pageSize: 50,
    maxPages: 500,
    maxRecords: 25000,
    params: { page: 'page', pageSize: 'page_size' },
    nextPagePath: 'next',
    serverMeta: {
      pagePath: 'meta.page',
      pageSizePath: 'meta.page_size',
      totalPath: 'meta.total',
    },
  },

  capabilities: {
    serverFetch: true,
    serverFacets: false,
    serverSearch: false,
    serverGroupBy: true,
    serverOrderBy: true,
    serverGeo: false,
    whereFormat: 'colon',
  },

  query: {
    aggregationSyntax: 'colon-attr',
    searchTemplate: null,
    operatorMapping: {
      eq: 'exact',
      neq: 'differs',
      gt: 'strictly_greater',
      gte: 'greater',
      lt: 'strictly_less',
      lte: 'less',
      contains: 'contains',
      notcontains: 'notcontains',
      in: 'in',
      notin: 'notin',
      isnull: 'isnull',
      isnotnull: 'isnotnull',
    },
  },

  facets: {
    defaultMode: 'static',
  },

  resource: {
    idFields: ['resourceId'],
    apiPathTemplate: '/api/resources/{resourceId}/data/',
    extractIds: (url: string) => {
      const m = url.match(TABULAR_API_RE) ?? url.match(TABULAR_PERMALINK_RE);
      return m ? { resourceId: m[1] } : null;
    },
  },
};
