/**
 * ProviderConfig: centralised definition of API provider specificities.
 *
 * Each supported provider (OpenDataSoft, Tabular, Grist, Generic REST)
 * is described by a single ProviderConfig object. This replaces the ~35
 * scattered properties across ~25 files with one authoritative source.
 */

// ---------------------------------------------------------------------------
// Provider ID
// ---------------------------------------------------------------------------

export type ProviderId = 'opendatasoft' | 'tabular' | 'grist' | 'insee' | 'generic';

// ---------------------------------------------------------------------------
// ProviderConfig interface
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  // --- Identity ---
  id: ProviderId;
  displayName: string;
  /** Regex patterns to detect this provider from an API URL */
  urlPatterns: RegExp[];

  // --- Connection / Proxy ---
  /** Known hostnames and their proxy endpoint paths */
  knownHosts: Array<{ hostname: string; proxyEndpoint: string }>;
  /** Default base URL (without proxy) */
  defaultBaseUrl: string;
  /** Default authentication type */
  defaultAuthType: 'bearer' | 'apikey-header' | 'query-param' | 'none';

  // --- Response structure ---
  response: {
    /** JSON path to the data array (e.g. 'results', 'data', 'records') */
    dataPath: string;
    /** JSON path to total count (e.g. 'total_count', 'meta.total') */
    totalCountPath: string | null;
    /** Records are wrapped under a sub-object? (e.g. 'fields' for Grist) */
    nestedDataKey: string | null;
    /** Does this provider need dsfr-data-normalize flatten automatically? */
    requiresFlatten: boolean;
  };

  // --- Pagination ---
  pagination: {
    type: 'offset' | 'page' | 'cursor' | 'none';
    pageSize: number;
    maxPages: number;
    maxRecords: number;
    params: {
      page?: string;
      pageSize?: string;
      offset?: string;
      limit?: string;
    };
    /** JSON path to the next page URL */
    nextPagePath: string | null;
    /** Server meta structure for pagination */
    serverMeta?: {
      pagePath: string;
      pageSizePath: string;
      totalPath: string;
    };
  };

  // --- Server capabilities ---
  capabilities: {
    serverFetch: boolean;
    serverFacets: boolean;
    serverSearch: boolean;
    serverGroupBy: boolean;
    serverOrderBy: boolean;
    serverAggregation: boolean;
  };

  // --- Query syntax ---
  query: {
    /** Filter format: ODSQL SQL-like or colon syntax field:op:value */
    whereFormat: 'odsql' | 'colon';
    /** Separator for joining WHERE clauses */
    whereSeparator: string;
    /** Aggregation syntax for code generation */
    aggregationSyntax: 'odsql-select' | 'colon-attr' | 'client-only' | 'sql';
    /** Mapping of generic operators to native syntax */
    operatorMapping?: Record<string, string>;
    /** Full-text search template. Use {q} as placeholder. null = no server search. */
    searchTemplate?: string | null;
  };

  // --- Facets ---
  facets: {
    /** Default mode for facets */
    defaultMode: 'server' | 'static' | 'client';
    /** Dedicated API endpoint for server facets */
    endpoint?: string;
  };

  // --- Resource identification ---
  resource: {
    /** ID field names in the API URL */
    idFields: string[];
    /** API URL path template with {field} placeholders */
    apiPathTemplate: string;
    /** Extract resource IDs from a URL */
    extractIds: (url: string) => Record<string, string> | null;
  };

  // --- Code generation ---
  codeGen: {
    /** Does the generated pipeline use dsfr-data-source? (always true) */
    usesDsfrDataSource: boolean;
    /** Does the generated pipeline use dsfr-data-query? */
    usesDsfrDataQuery: boolean;
    /** Does the generated pipeline use dsfr-data-normalize? */
    usesDsfrDataNormalize: boolean;
    /** api-type value for dsfr-data-source */
    sourceApiType: ProviderId;
    /** Field prefix for nested data paths (e.g. 'fields.' for Grist without flatten) */
    fieldPrefix: string;
    /** Required CSS/JS dependencies */
    dependencies: {
      dsfr: boolean;
      dsfrChart: boolean;
      dsfrData: boolean;
    };
  };
}
