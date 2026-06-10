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
  /**
   * Miroir EXACT de `AdapterCapabilities` (packages/core) — un test
   * d'alignement (#285) garantit que chaque adapter declare les memes
   * valeurs que sa config : toute deviation fait echouer la CI.
   * (`serverAggregation` supprime : jamais lu, couple a serverGroupBy ;
   * `whereFormat` demenage ici depuis query, seul foyer.)
   */
  capabilities: {
    serverFetch: boolean;
    serverFacets: boolean;
    serverSearch: boolean;
    serverGroupBy: boolean;
    serverOrderBy: boolean;
    serverGeo: boolean;
    /** Dialecte WHERE — separateur derive : ' AND ' (odsql) / ', ' (colon), cf. joinWhere (#271) */
    whereFormat: 'odsql' | 'colon';
  };

  // --- Query syntax ---
  query: {
    /** Mecanisme d'agregation du provider (descriptif) */
    aggregationSyntax: 'odsql-select' | 'colon-attr' | 'client-only' | 'sql';
    /**
     * Mapping operateurs generiques -> syntaxe native.
     * SOURCE DE VERITE consommee par l'adapter (#285) — ne pas dupliquer.
     */
    operatorMapping?: Record<string, string>;
    /**
     * Template de recherche plein-texte ({q} = placeholder), null = pas de
     * recherche serveur. SOURCE DE VERITE : getDefaultSearchTemplate() des
     * adapters la lit (#285).
     */
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
}
