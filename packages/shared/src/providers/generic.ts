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

  // L'adaptateur generique ne pagine pas lui-meme (`type: 'none'`). `params`
  // et `serverMeta` declarent la convention OPT-IN de l'attribut `paginate`
  // du mode URL de dsfr-data-source (#1136) : `?page=N&page_size=M` en
  // requete, `{ data: [...], meta: { page, page_size, total } }` en reponse.
  // La source la lit ici, au lieu de la porter en dur.
  pagination: {
    type: 'none',
    pageSize: 0,
    maxPages: 0,
    maxRecords: 0,
    params: { page: 'page', pageSize: 'page_size' },
    nextPagePath: null,
    serverMeta: {
      pagePath: 'meta.page',
      pageSizePath: 'meta.page_size',
      totalPath: 'meta.total',
      dataPath: 'data',
    },
  },

  capabilities: {
    serverFetch: false,
    serverFacets: false,
    serverSearch: false,
    serverGroupBy: false,
    serverOrderBy: false,
    serverGeo: false,
    whereFormat: 'colon',
  },

  query: {
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
};
