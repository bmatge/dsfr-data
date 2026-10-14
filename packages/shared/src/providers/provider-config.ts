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
    /**
     * Aplatit un enregistrement de ce provider (#586). Renseigne uniquement
     * quand `requiresFlatten` est vrai et que `nestedDataKey` ne suffit pas :
     * une observation INSEE eclate en `attributes`/`dimensions`/`measures` ne
     * se reduit pas a une cle d'enveloppe.
     *
     * Quand ce champ est absent mais que `nestedDataKey` est renseigne, les
     * consommateurs appliquent `flattenNestedKey`. Voir `providers/flatten.ts`.
     */
    flattenRecord?: (record: unknown) => Record<string, unknown>;
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
      /**
       * Chemin des lignes dans une réponse paginée, quand il diffère de
       * `response.dataPath` (convention `paginate` du mode URL, #1136).
       */
      dataPath?: string;
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
    /**
     * Gabarit de la recherche PORTÉE PAR LE CONTEXTE (ADR-159, lot 3, #1285) :
     * ce que l'API sait faire d'un terme saisi par un visiteur dans des champs
     * NOMMÉS. `{fields}` devient les champs joints par
     * `contextSearchFieldsJoin` (défaut `|`, le OU entre champs de la
     * grammaire colon, #1026), `{q}` le terme échappé dans le dialecte de
     * l'adaptateur.
     *
     * Distinct de `searchTemplate`, le gabarit de l'attribut `server-search`,
     * qui ne change pas : sur Opendatasoft celui-là cherche dans TOUS les
     * champs (`search("{q}")`), celui-ci dans les seuls champs que la
     * recherche désigne (`search(champ, "{q}")`).
     *
     * `null` ou absent = l'API n'a rien pour chercher : la source calcule la
     * recherche elle-même, dans le navigateur, sur les lignes chargées.
     */
    contextSearchTemplate?: string | null;
    /** Séparateur des champs dans `contextSearchTemplate` (défaut `|`). */
    contextSearchFieldsJoin?: string;
    /**
     * Le moteur ne lit que des champs TEXTE et REFUSE les autres (HTTP 400
     * sur un portail Opendatasoft, mesuré). Quand les lignes déjà chargées
     * montrent un champ numérique, la recherche est calculée dans le
     * navigateur plutôt que confiée au serveur.
     */
    contextSearchTextOnly?: boolean;
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
    /**
     * Les paramètres de la chaîne de requête SONT des filtres du jeu (#1163) :
     * INSEE Melodi filtre par dimension (`GEO=REG&TIME_PERIOD=2023`). La
     * détection d'une URL collée les conserve alors — hors pagination, que
     * l'adaptateur pilote — au lieu de ramener la connexion au jeu entier.
     */
    queryParamsAreFilters?: boolean;
  };
}
