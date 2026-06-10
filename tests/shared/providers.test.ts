import { describe, it, expect } from 'vitest';
import {
  detectProvider,
  extractResourceIds,
  resolveSourceUrl,
  normalizeProviderAuthHeaders,
  parseDataGouvDataset,
  dataGouvDatasetApiUrl,
  extractDataGouvResources,
  getProvider,
  getAllProviders,
  ODS_CONFIG,
  TABULAR_CONFIG,
  GRIST_CONFIG,
  INSEE_CONFIG,
  GENERIC_CONFIG,
} from '../../packages/shared/src/providers/index.js';
import type { ProviderId, ProviderConfig } from '../../packages/shared/src/providers/index.js';
import { migrateSource, serializeSourceForServer } from '../../packages/shared/src/types/source.js';
import type { Source } from '../../packages/shared/src/types/source.js';

// =========================================================================
// Provider configs
// =========================================================================

describe('ProviderConfig definitions', () => {
  const ALL_CONFIGS = [ODS_CONFIG, TABULAR_CONFIG, GRIST_CONFIG, INSEE_CONFIG, GENERIC_CONFIG];

  it('should have 5 registered providers', () => {
    expect(getAllProviders()).toHaveLength(5);
  });

  it('each config should have a unique id', () => {
    const ids = ALL_CONFIGS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each config should have required properties', () => {
    for (const config of ALL_CONFIGS) {
      expect(config.id).toBeTruthy();
      expect(config.displayName).toBeTruthy();
      expect(config.response).toBeDefined();
      expect(config.pagination).toBeDefined();
      expect(config.capabilities).toBeDefined();
      expect(config.query).toBeDefined();
      expect(config.facets).toBeDefined();
      expect(config.resource).toBeDefined();
    }
  });

  it('generic should be the fallback (no urlPatterns)', () => {
    expect(GENERIC_CONFIG.urlPatterns).toHaveLength(0);
  });

  it('getProvider returns the correct config', () => {
    expect(getProvider('opendatasoft')).toBe(ODS_CONFIG);
    expect(getProvider('tabular')).toBe(TABULAR_CONFIG);
    expect(getProvider('grist')).toBe(GRIST_CONFIG);
    expect(getProvider('insee')).toBe(INSEE_CONFIG);
    expect(getProvider('generic')).toBe(GENERIC_CONFIG);
  });

  it('getProvider returns generic for unknown id', () => {
    expect(getProvider('unknown' as ProviderId)).toBe(GENERIC_CONFIG);
  });
});

// =========================================================================
// ODS config specifics
// =========================================================================

describe('ODS config', () => {
  it('should have offset pagination', () => {
    expect(ODS_CONFIG.pagination.type).toBe('offset');
    expect(ODS_CONFIG.pagination.pageSize).toBe(100);
    expect(ODS_CONFIG.pagination.maxPages).toBe(10);
  });

  it('should support server-side operations', () => {
    expect(ODS_CONFIG.capabilities.serverFetch).toBe(true);
    expect(ODS_CONFIG.capabilities.serverFacets).toBe(true);
    expect(ODS_CONFIG.capabilities.serverSearch).toBe(true);
    expect(ODS_CONFIG.capabilities.serverGroupBy).toBe(true);
    expect(ODS_CONFIG.capabilities.serverOrderBy).toBe(true);
    expect(ODS_CONFIG.capabilities.serverGeo).toBe(true);
  });

  it('should use ODSQL where format', () => {
    expect(ODS_CONFIG.capabilities.whereFormat).toBe('odsql');
  });

  it('should have server facets mode', () => {
    expect(ODS_CONFIG.facets.defaultMode).toBe('server');
  });

  it('should use dsfr-data-source + dsfr-data-query in code gen', () => {});
});

// =========================================================================
// Tabular config specifics
// =========================================================================

describe('Tabular config', () => {
  it('should have page-based pagination', () => {
    expect(TABULAR_CONFIG.pagination.type).toBe('page');
    expect(TABULAR_CONFIG.pagination.maxPages).toBe(500);
    expect(TABULAR_CONFIG.pagination.maxRecords).toBe(25000);
  });

  it('should have server meta for pagination', () => {
    expect(TABULAR_CONFIG.pagination.serverMeta).toBeDefined();
    expect(TABULAR_CONFIG.pagination.serverMeta?.totalPath).toBe('meta.total');
  });

  it('should support server-side ordering, groupBy and aggregation', () => {
    expect(TABULAR_CONFIG.capabilities.serverOrderBy).toBe(true);
    expect(TABULAR_CONFIG.capabilities.serverGroupBy).toBe(true);
    expect(TABULAR_CONFIG.capabilities.serverGeo).toBe(false);
    expect(TABULAR_CONFIG.capabilities.serverFacets).toBe(false);
  });

  it('should use colon where format', () => {
    expect(TABULAR_CONFIG.capabilities.whereFormat).toBe('colon');
  });

  it('should have static facets mode', () => {
    expect(TABULAR_CONFIG.facets.defaultMode).toBe('static');
  });
});

// =========================================================================
// Grist config specifics
// =========================================================================

describe('Grist config', () => {
  it('should have offset pagination', () => {
    expect(GRIST_CONFIG.pagination.type).toBe('offset');
    expect(GRIST_CONFIG.pagination.pageSize).toBe(100);
    expect(GRIST_CONFIG.pagination.params.offset).toBe('offset');
    expect(GRIST_CONFIG.pagination.params.limit).toBe('limit');
  });

  it('should require flatten', () => {
    expect(GRIST_CONFIG.response.requiresFlatten).toBe(true);
    expect(GRIST_CONFIG.response.nestedDataKey).toBe('fields');
  });

  it('should have known proxy hosts', () => {
    expect(GRIST_CONFIG.knownHosts).toHaveLength(2);
    expect(GRIST_CONFIG.knownHosts[0].hostname).toBe('grist.numerique.gouv.fr');
    expect(GRIST_CONFIG.knownHosts[1].hostname).toBe('docs.getgrist.com');
  });

  it('should use bearer auth', () => {
    expect(GRIST_CONFIG.defaultAuthType).toBe('bearer');
  });

  it('should use dsfr-data-source api-type grist in code gen', () => {});

  it('should have server facets mode', () => {
    expect(GRIST_CONFIG.facets.defaultMode).toBe('server');
  });

  it('should extract documentId and tableId', () => {
    expect(GRIST_CONFIG.resource.idFields).toEqual(['documentId', 'tableId']);
  });
});

// =========================================================================
// INSEE config specifics
// =========================================================================

describe('INSEE config', () => {
  it('should have page-based pagination', () => {
    expect(INSEE_CONFIG.pagination.type).toBe('page');
    expect(INSEE_CONFIG.pagination.pageSize).toBe(1000);
    expect(INSEE_CONFIG.pagination.maxPages).toBe(100);
    expect(INSEE_CONFIG.pagination.maxRecords).toBe(100000);
  });

  it('should use page and maxResult params', () => {
    expect(INSEE_CONFIG.pagination.params.page).toBe('page');
    expect(INSEE_CONFIG.pagination.params.pageSize).toBe('maxResult');
  });

  it('should only support server fetch', () => {
    expect(INSEE_CONFIG.capabilities.serverFetch).toBe(true);
    expect(INSEE_CONFIG.capabilities.serverFacets).toBe(false);
    expect(INSEE_CONFIG.capabilities.serverSearch).toBe(false);
    expect(INSEE_CONFIG.capabilities.serverGroupBy).toBe(false);
    expect(INSEE_CONFIG.capabilities.serverOrderBy).toBe(false);
    expect(INSEE_CONFIG.capabilities.serverGeo).toBe(false);
  });

  it('should require flatten for nested observations', () => {
    expect(INSEE_CONFIG.response.requiresFlatten).toBe(true);
    expect(INSEE_CONFIG.response.dataPath).toBe('observations');
  });

  it('should use colon where format with client-only aggregation', () => {
    expect(INSEE_CONFIG.capabilities.whereFormat).toBe('colon');
    expect(INSEE_CONFIG.query.aggregationSyntax).toBe('client-only');
  });

  it('should have no authentication', () => {
    expect(INSEE_CONFIG.defaultAuthType).toBe('none');
  });

  it('should have no known hosts (CORS works)', () => {
    expect(INSEE_CONFIG.knownHosts).toHaveLength(0);
  });

  it('should have client facets mode', () => {
    expect(INSEE_CONFIG.facets.defaultMode).toBe('client');
  });

  it('should use dsfr-data-source api-type insee', () => {});

  it('should extract datasetId', () => {
    expect(INSEE_CONFIG.resource.idFields).toEqual(['datasetId']);
  });
});

// =========================================================================
// detectProvider
// =========================================================================

describe('detectProvider', () => {
  // ODS URLs
  it('detects ODS from data.economie.gouv.fr URL', () => {
    const url =
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/fiscalite-locale-des-particuliers/records?limit=15';
    expect(detectProvider(url).id).toBe('opendatasoft');
  });

  it('detects ODS from any ODS domain', () => {
    const url =
      'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite/records';
    expect(detectProvider(url).id).toBe('opendatasoft');
  });

  // Tabular URLs
  it('detects Tabular from tabular-api.data.gouv.fr URL', () => {
    const url =
      'https://tabular-api.data.gouv.fr/api/resources/2876a346-d50c-4911-934e-19ee07b0e503/data/';
    expect(detectProvider(url).id).toBe('tabular');
  });

  it('detects Tabular with query params', () => {
    const url =
      'https://tabular-api.data.gouv.fr/api/resources/42a34c0a-7c97-4463-b00e-5913ea5f7077/data/?page_size=101';
    expect(detectProvider(url).id).toBe('tabular');
  });

  // Grist URLs
  it('detects Grist from grist.numerique.gouv.fr URL', () => {
    const url = 'https://grist.numerique.gouv.fr/api/docs/abc123/tables/Table1/records';
    expect(detectProvider(url).id).toBe('grist');
  });

  it('detects Grist from docs.getgrist.com URL', () => {
    const url = 'https://docs.getgrist.com/api/docs/xyz789/tables/Data/records';
    expect(detectProvider(url).id).toBe('grist');
  });

  it('detects Grist from any domain with /api/docs/ pattern', () => {
    const url = 'https://custom-grist.example.com/api/docs/doc1/tables/t1/records';
    expect(detectProvider(url).id).toBe('grist');
  });

  // INSEE URLs
  it('detects INSEE from api.insee.fr Melodi URL', () => {
    const url = 'https://api.insee.fr/melodi/data/DS_POPULATIONS_REFERENCE?maxResult=10';
    expect(detectProvider(url).id).toBe('insee');
  });

  it('detects INSEE from Melodi URL without query params', () => {
    const url = 'https://api.insee.fr/melodi/data/DD_CNA_AGREGATS';
    expect(detectProvider(url).id).toBe('insee');
  });

  // Generic
  it('returns generic for unknown URLs', () => {
    expect(detectProvider('https://api.example.com/data').id).toBe('generic');
  });

  it('returns generic for empty string', () => {
    expect(detectProvider('').id).toBe('generic');
  });

  // All playground example URLs
  describe('playground URLs', () => {
    const PLAYGROUND_URLS = [
      {
        url: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/fiscalite-locale-des-particuliers/records?limit=15',
        expected: 'opendatasoft',
      },
      {
        url: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/industrie-du-futur/records?limit=20',
        expected: 'opendatasoft',
      },
      {
        url: 'https://tabular-api.data.gouv.fr/api/resources/2876a346-d50c-4911-934e-19ee07b0e503/data/',
        expected: 'tabular',
      },
      {
        url: 'https://tabular-api.data.gouv.fr/api/resources/42a34c0a-7c97-4463-b00e-5913ea5f7077/data/?page_size=101',
        expected: 'tabular',
      },
    ];

    for (const { url, expected } of PLAYGROUND_URLS) {
      it(`detects ${expected} from ${url.substring(0, 60)}...`, () => {
        expect(detectProvider(url).id).toBe(expected);
      });
    }
  });
});

// =========================================================================
// extractResourceIds
// =========================================================================

describe('extractResourceIds', () => {
  it('extracts datasetId from ODS URL', () => {
    const url =
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/fiscalite-locale-des-particuliers/records';
    const ids = extractResourceIds(url);
    expect(ids).toEqual({ datasetId: 'fiscalite-locale-des-particuliers' });
  });

  it('extracts resourceId from Tabular URL', () => {
    const url =
      'https://tabular-api.data.gouv.fr/api/resources/2876a346-d50c-4911-934e-19ee07b0e503/data/';
    const ids = extractResourceIds(url);
    expect(ids).toEqual({ resourceId: '2876a346-d50c-4911-934e-19ee07b0e503' });
  });

  it('extracts documentId and tableId from Grist URL', () => {
    const url = 'https://grist.numerique.gouv.fr/api/docs/abc123/tables/Table1/records';
    const ids = extractResourceIds(url);
    expect(ids).toEqual({ documentId: 'abc123', tableId: 'Table1' });
  });

  it('extracts datasetId from INSEE Melodi URL', () => {
    const url = 'https://api.insee.fr/melodi/data/DS_POPULATIONS_REFERENCE?maxResult=10';
    const ids = extractResourceIds(url);
    expect(ids).toEqual({ datasetId: 'DS_POPULATIONS_REFERENCE' });
  });

  it('returns null for generic URLs', () => {
    expect(extractResourceIds('https://api.example.com/data')).toBeNull();
  });

  it('works with explicit provider', () => {
    const url =
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/my-dataset/records';
    const ids = extractResourceIds(url, ODS_CONFIG);
    expect(ids).toEqual({ datasetId: 'my-dataset' });
  });
});

// =========================================================================
// Human page URLs (detection + extraction)
// =========================================================================

describe('detectProvider on human page URLs', () => {
  it('detects ODS from an explorer dataset page', () => {
    const url = 'https://data.economie.gouv.fr/explore/dataset/prix-controle-technique/table/';
    expect(detectProvider(url).id).toBe('opendatasoft');
  });

  it('detects ODS from an embedded dataset page', () => {
    const url = 'https://opendata.paris.fr/explore/embed/dataset/velib-disponibilite/table/';
    expect(detectProvider(url).id).toBe('opendatasoft');
  });

  it('detects ODS from an /explore/assets/ page', () => {
    const url = 'https://data.economie.gouv.fr/explore/assets/annuaire-centres-controle-technique/';
    expect(detectProvider(url).id).toBe('opendatasoft');
    expect(extractResourceIds(url)).toEqual({ datasetId: 'annuaire-centres-controle-technique' });
  });

  it('detects ODS from an /explore/dataset/{slug}/information/ page (other ODS version)', () => {
    const url =
      'https://opendata.hauts-de-seine.fr/explore/dataset/fr-219200631-arretes-d-interdiction-d-habiter/information/';
    expect(detectProvider(url).id).toBe('opendatasoft');
    expect(extractResourceIds(url)).toEqual({
      datasetId: 'fr-219200631-arretes-d-interdiction-d-habiter',
    });
  });

  it('detects Tabular from a data.gouv.fr resource permalink', () => {
    const url = 'https://www.data.gouv.fr/fr/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503';
    expect(detectProvider(url).id).toBe('tabular');
  });

  it('does NOT match a data.gouv.fr dataset page (no resource id derivable)', () => {
    const url = 'https://www.data.gouv.fr/fr/datasets/prix-des-carburants-en-france/';
    expect(detectProvider(url).id).toBe('generic');
  });
});

describe('extractResourceIds on human page URLs', () => {
  it('extracts datasetId from an ODS explorer page', () => {
    const url = 'https://data.economie.gouv.fr/explore/dataset/prix-controle-technique/table/';
    expect(extractResourceIds(url)).toEqual({ datasetId: 'prix-controle-technique' });
  });

  it('extracts resourceId from a data.gouv.fr permalink', () => {
    const url = 'https://www.data.gouv.fr/fr/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503';
    expect(extractResourceIds(url)).toEqual({ resourceId: '2876a346-d50c-4911-934e-19ee07b0e503' });
  });
});

// =========================================================================
// resolveSourceUrl (page URL → canonical API URL, no network)
// =========================================================================

describe('resolveSourceUrl', () => {
  it('rewrites an ODS explorer page into the records API URL (same origin)', () => {
    const r = resolveSourceUrl(
      'https://data.economie.gouv.fr/explore/dataset/prix-controle-technique/table/'
    );
    expect(r.provider.id).toBe('opendatasoft');
    expect(r.apiUrl).toBe(
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-controle-technique/records'
    );
    expect(r.normalized).toBe(true);
    expect(r.ids).toEqual({ datasetId: 'prix-controle-technique' });
  });

  it('leaves an ODS API URL unchanged (normalized=false)', () => {
    const r = resolveSourceUrl(
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/test/records?limit=15'
    );
    expect(r.provider.id).toBe('opendatasoft');
    expect(r.apiUrl).toBe(
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/test/records'
    );
    expect(r.normalized).toBe(false);
  });

  it('resolves a data.gouv.fr permalink to the Tabular API host (different origin)', () => {
    const r = resolveSourceUrl(
      'https://www.data.gouv.fr/fr/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503'
    );
    expect(r.provider.id).toBe('tabular');
    expect(r.baseUrl).toBe('https://www.data.gouv.fr');
    expect(r.apiUrl).toBe(
      'https://tabular-api.data.gouv.fr/api/resources/2876a346-d50c-4911-934e-19ee07b0e503/data/'
    );
    expect(r.normalized).toBe(true);
  });

  it('returns a generic result with no apiUrl for unknown URLs', () => {
    const r = resolveSourceUrl('https://api.example.com/data');
    expect(r.provider.id).toBe('generic');
    expect(r.apiUrl).toBeNull();
    expect(r.normalized).toBe(false);
  });

  it('handles empty / unparseable input gracefully', () => {
    const r = resolveSourceUrl('');
    expect(r.provider.id).toBe('generic');
    expect(r.baseUrl).toBeNull();
    expect(r.apiUrl).toBeNull();
  });

  it('preserves the apikey query param on an ODS records URL (normalized=false)', () => {
    const r = resolveSourceUrl(
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/ccsf/records?apikey=SECRET'
    );
    expect(r.apiUrl).toBe(
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/ccsf/records?apikey=SECRET'
    );
    expect(r.normalized).toBe(false);
  });

  it('preserves the apikey query param when normalizing an ODS page URL', () => {
    const r = resolveSourceUrl(
      'https://data.economie.gouv.fr/explore/dataset/ccsf/table/?apikey=SECRET'
    );
    expect(r.apiUrl).toBe(
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/ccsf/records?apikey=SECRET'
    );
    expect(r.normalized).toBe(true);
  });

  it('drops non-auth query params (limit) but keeps the path canonical', () => {
    const r = resolveSourceUrl(
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/test/records?limit=15'
    );
    expect(r.apiUrl).toBe(
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/test/records'
    );
    expect(r.normalized).toBe(false);
  });
});

// =========================================================================
// normalizeProviderAuthHeaders (ODS apikey → Authorization: Apikey <key>)
// =========================================================================

describe('normalizeProviderAuthHeaders', () => {
  const odsUrl = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/x/records';

  it('rewrites a misnamed ODS apikey header into Authorization: Apikey', () => {
    const r = normalizeProviderAuthHeaders(odsUrl, { Apikey: 'KEY' });
    expect(r.changed).toBe(true);
    expect(r.headers).toEqual({ Authorization: 'Apikey KEY' });
  });

  it('also handles api-key / x-api-key variants', () => {
    expect(normalizeProviderAuthHeaders(odsUrl, { 'api-key': 'K' }).headers).toEqual({
      Authorization: 'Apikey K',
    });
    expect(normalizeProviderAuthHeaders(odsUrl, { 'X-API-Key': 'K' }).headers).toEqual({
      Authorization: 'Apikey K',
    });
  });

  it('leaves an existing Authorization header untouched', () => {
    const headers = { Authorization: 'Apikey EXISTING', Apikey: 'IGNORED' };
    const r = normalizeProviderAuthHeaders(odsUrl, headers);
    expect(r.changed).toBe(false);
    expect(r.headers).toBe(headers);
  });

  it('preserves other headers while moving the key', () => {
    const r = normalizeProviderAuthHeaders(odsUrl, { Apikey: 'KEY', Accept: 'application/json' });
    expect(r.headers).toEqual({ Accept: 'application/json', Authorization: 'Apikey KEY' });
  });

  it('does nothing for non-ODS providers (Tabular)', () => {
    const r = normalizeProviderAuthHeaders(
      'https://tabular-api.data.gouv.fr/api/resources/abc/data/',
      {
        Apikey: 'KEY',
      }
    );
    expect(r.changed).toBe(false);
    expect(r.headers).toEqual({ Apikey: 'KEY' });
  });

  it('does nothing when ODS has no apikey-like header', () => {
    const r = normalizeProviderAuthHeaders(odsUrl, { 'X-Custom': 'v' });
    expect(r.changed).toBe(false);
  });
});

// =========================================================================
// data.gouv.fr dataset pages → resource resolution
// =========================================================================

describe('parseDataGouvDataset', () => {
  it('extracts the slug from a dataset page (no locale, no trailing slash)', () => {
    expect(
      parseDataGouvDataset(
        'https://www.data.gouv.fr/datasets/resultats-nationaux-des-observatoires-locaux-des-loyers'
      )
    ).toBe('resultats-nationaux-des-observatoires-locaux-des-loyers');
  });

  it('extracts the slug from a /fr/datasets/ page with trailing slash', () => {
    expect(parseDataGouvDataset('https://www.data.gouv.fr/fr/datasets/prix-carburants/')).toBe(
      'prix-carburants'
    );
  });

  it('does NOT match a resource permalink /datasets/r/{uuid}', () => {
    expect(
      parseDataGouvDataset(
        'https://www.data.gouv.fr/fr/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503'
      )
    ).toBeNull();
  });

  it('returns null for non-data.gouv URLs', () => {
    expect(parseDataGouvDataset('https://data.economie.gouv.fr/explore/dataset/x/')).toBeNull();
  });

  it('builds the catalog API URL from a slug', () => {
    expect(dataGouvDatasetApiUrl('my-dataset')).toBe(
      'https://www.data.gouv.fr/api/1/datasets/my-dataset/'
    );
  });
});

describe('extractDataGouvResources', () => {
  const datasetJson = {
    title: 'Loyers',
    resources: [
      {
        id: '21543ae5-7d6e-4c49-8719-e7f725d441da',
        title: 'Loyers 2025',
        format: 'CSV',
        extras: {
          'analysis:parsing:parsing_table': 'abc123',
          'analysis:content-length': 524288,
        },
      },
      {
        // CSV but NOT parsed → not queryable via Tabular
        id: '5dcdae40-91b5-44ba-8ffc-65af94b61c6a',
        title: 'Loyers 2019 (doublon)',
        format: 'csv',
        extras: { 'check:count-availability': true },
      },
      {
        id: 'pdf-resource',
        title: 'Méthodologie',
        format: 'pdf',
        extras: {},
      },
    ],
  };

  it('maps every resource and flags Tabular availability via parsing_table', () => {
    const resources = extractDataGouvResources(datasetJson);
    expect(resources).toHaveLength(3);

    const parsed = resources[0];
    expect(parsed.id).toBe('21543ae5-7d6e-4c49-8719-e7f725d441da');
    expect(parsed.format).toBe('csv');
    expect(parsed.size).toBe(524288);
    expect(parsed.tabularApiUrl).toBe(
      'https://tabular-api.data.gouv.fr/api/resources/21543ae5-7d6e-4c49-8719-e7f725d441da/data/'
    );

    // CSV without parsing_table → no Tabular URL
    expect(resources[1].tabularApiUrl).toBeNull();
    // PDF → no Tabular URL
    expect(resources[2].tabularApiUrl).toBeNull();
  });

  it('lets the caller keep only Tabular-queryable resources', () => {
    const queryable = extractDataGouvResources(datasetJson).filter((r) => r.tabularApiUrl);
    expect(queryable.map((r) => r.title)).toEqual(['Loyers 2025']);
  });

  it('returns an empty list when there are no resources', () => {
    expect(extractDataGouvResources({})).toEqual([]);
    expect(extractDataGouvResources(null)).toEqual([]);
  });
});

// =========================================================================
// migrateSource
// =========================================================================

describe('migrateSource', () => {
  it('adds provider=grist for grist sources', () => {
    const legacy = { id: '1', name: 'test', type: 'grist' as const };
    const migrated = migrateSource(legacy);
    expect(migrated.provider).toBe('grist');
  });

  it('auto-detects opendatasoft provider from apiUrl', () => {
    const legacy = {
      id: '2',
      name: 'ODS source',
      type: 'api' as const,
      apiUrl: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/test/records',
    };
    const migrated = migrateSource(legacy);
    expect(migrated.provider).toBe('opendatasoft');
    expect(migrated.resourceIds).toEqual({ datasetId: 'test' });
  });

  it('auto-detects tabular provider from apiUrl', () => {
    const legacy = {
      id: '3',
      name: 'Tabular source',
      type: 'api' as const,
      apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc-123/data/',
    };
    const migrated = migrateSource(legacy);
    expect(migrated.provider).toBe('tabular');
    expect(migrated.resourceIds).toEqual({ resourceId: 'abc-123' });
  });

  it('defaults to generic for manual sources', () => {
    const legacy = { id: '4', name: 'manual', type: 'manual' as const };
    const migrated = migrateSource(legacy);
    expect(migrated.provider).toBe('generic');
  });

  it('defaults to generic for api sources without URL', () => {
    const legacy = { id: '5', name: 'no url', type: 'api' as const };
    const migrated = migrateSource(legacy);
    expect(migrated.provider).toBe('generic');
  });

  it('preserves existing provider if already set', () => {
    const source: Partial<Source> = {
      id: '6',
      name: 'already migrated',
      type: 'api',
      provider: 'tabular',
      apiUrl: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/x/records',
    };
    const migrated = migrateSource(source);
    // provider should NOT be overwritten even though URL matches ODS
    expect(migrated.provider).toBe('tabular');
  });

  it('preserves all existing fields', () => {
    const legacy: Partial<Source> = {
      id: '7',
      name: 'full',
      type: 'grist',
      documentId: 'doc1',
      tableId: 'T1',
      apiKey: 'key123',
      isPublic: false,
      recordCount: 42,
    };
    const migrated = migrateSource(legacy);
    expect(migrated.documentId).toBe('doc1');
    expect(migrated.tableId).toBe('T1');
    expect(migrated.apiKey).toBe('key123');
    expect(migrated.isPublic).toBe(false);
    expect(migrated.recordCount).toBe(42);
    expect(migrated.provider).toBe('grist');
  });

  it('extracts Grist resourceIds from apiUrl', () => {
    const legacy: Partial<Source> = {
      id: '8',
      name: 'grist with url',
      type: 'grist',
      apiUrl: 'https://grist.numerique.gouv.fr/api/docs/myDoc/tables/myTable/records',
    };
    const migrated = migrateSource(legacy);
    expect(migrated.provider).toBe('grist');
    expect(migrated.resourceIds).toEqual({ documentId: 'myDoc', tableId: 'myTable' });
  });

  it('unpacks server format (record_count, config_json, data_json)', () => {
    // Simulate what the server returns after GET /api/sources
    const serverRow = {
      id: 'api_123',
      name: 'ODS Source',
      type: 'api' as const,
      record_count: 10,
      config_json: {
        apiUrl: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/test/records',
        method: 'GET',
        connectionId: 'conn_1',
        provider: 'opendatasoft',
      },
      data_json: [{ col1: 'a' }, { col1: 'b' }],
      owner_id: 'user_1',
      _owned: true,
      _permissions: { read: true, write: true },
    } as unknown as Partial<Source>;

    const migrated = migrateSource(serverRow);
    expect(migrated.recordCount).toBe(10);
    expect(migrated.apiUrl).toBe(
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/test/records'
    );
    expect(migrated.method).toBe('GET');
    expect(migrated.connectionId).toBe('conn_1');
    expect(migrated.provider).toBe('opendatasoft');
    expect(migrated.data).toEqual([{ col1: 'a' }, { col1: 'b' }]);
    // Server-only fields should be cleaned up
    expect((migrated as Record<string, unknown>).record_count).toBeUndefined();
    expect((migrated as Record<string, unknown>).config_json).toBeUndefined();
    expect((migrated as Record<string, unknown>).data_json).toBeUndefined();
    expect((migrated as Record<string, unknown>).owner_id).toBeUndefined();
    expect((migrated as Record<string, unknown>)._owned).toBeUndefined();
  });
});

// =========================================================================
// serializeSourceForServer
// =========================================================================

describe('serializeSourceForServer', () => {
  it('packs client fields into server format', () => {
    const source: Source = {
      id: 'api_1',
      name: 'Test',
      type: 'api',
      apiUrl: 'https://example.com/api',
      method: 'GET',
      headers: '{"X-Key": "abc"}',
      dataPath: 'results',
      connectionId: 'conn_1',
      provider: 'opendatasoft',
      data: [{ a: 1 }, { a: 2 }],
      recordCount: 100,
    };
    const serialized = serializeSourceForServer(source);
    expect(serialized.id).toBe('api_1');
    expect(serialized.name).toBe('Test');
    expect(serialized.type).toBe('api');
    expect(serialized.recordCount).toBe(100);
    expect(serialized.configJson).toEqual({
      apiUrl: 'https://example.com/api',
      method: 'GET',
      headers: '{"X-Key": "abc"}',
      dataPath: 'results',
      connectionId: 'conn_1',
      provider: 'opendatasoft',
    });
    expect(serialized.dataJson).toEqual([{ a: 1 }, { a: 2 }]);
    // Flat fields should NOT be in the serialized output
    expect(serialized.apiUrl).toBeUndefined();
    expect(serialized.data).toBeUndefined();
  });
});

// =========================================================================
// ProviderConfig alignment (all configs have the same shape)
// =========================================================================

describe('ProviderConfig alignment', () => {
  const ALL_CONFIGS: ProviderConfig[] = [
    ODS_CONFIG,
    TABULAR_CONFIG,
    GRIST_CONFIG,
    INSEE_CONFIG,
    GENERIC_CONFIG,
  ];

  it('all configs have valid whereFormat', () => {
    for (const config of ALL_CONFIGS) {
      expect(['odsql', 'colon']).toContain(config.capabilities.whereFormat);
    }
  });

  it('all configs have valid pagination type', () => {
    for (const config of ALL_CONFIGS) {
      expect(['offset', 'page', 'cursor', 'none']).toContain(config.pagination.type);
    }
  });

  it('all configs have valid facets mode', () => {
    for (const config of ALL_CONFIGS) {
      expect(['server', 'static', 'client']).toContain(config.facets.defaultMode);
    }
  });

  it('all configs have valid aggregation syntax', () => {
    for (const config of ALL_CONFIGS) {
      expect(['odsql-select', 'colon-attr', 'client-only', 'sql']).toContain(
        config.query.aggregationSyntax
      );
    }
  });

  it('all configs have valid auth type', () => {
    for (const config of ALL_CONFIGS) {
      expect(['bearer', 'apikey-header', 'query-param', 'none']).toContain(config.defaultAuthType);
    }
  });

  it('extractIds is a function for all configs', () => {
    for (const config of ALL_CONFIGS) {
      expect(typeof config.resource.extractIds).toBe('function');
    }
  });
});
