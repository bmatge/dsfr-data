import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests #233 — max-records configurable sur l'adapter ODS.
 *
 * Le plafond « 1000 records » était codé en dur (ODS_MAX_PAGES=10 ×
 * ODS_PAGE_SIZE=100) — ce n'est PAS une limite de l'API ODS. Il bloquait
 * l'architecture « un seul fetch server-side, puis N agrégations côté
 * client ». `max-records` le rend configurable, défaut conservé à 1000
 * (garde-fou anti-surcharge).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import { DsfrDataSource } from '@/components/dsfr-data-source.js';

/** Mocke une API ODS de `total` records servis par pages de 100 */
function mockOdsDataset(total: number) {
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string) => {
    const u = new URL(url);
    const offset = parseInt(u.searchParams.get('offset') || '0', 10);
    const limit = parseInt(u.searchParams.get('limit') || '100', 10);
    const count = Math.max(0, Math.min(limit, total - offset));
    return {
      ok: true,
      json: async () => ({
        total_count: total,
        results: Array.from({ length: count }, (_, i) => ({ id: offset + i })),
      }),
    };
  });
}

const PARAMS = {
  baseUrl: 'https://data.example.fr',
  datasetId: 'ds',
  resource: '',
  select: '',
  where: '',
  filter: '',
  groupBy: '',
  aggregate: '',
  orderBy: '',
  limit: 0,
  transform: '',
  pageSize: 0,
};

describe('#233 — AC : max-records non défini → comportement actuel (cap 1000)', () => {
  it('fetchAll plafonne à 1000 sur un dataset de 2500', async () => {
    mockOdsDataset(2500);
    const adapter = new OpenDataSoftAdapter();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await adapter.fetchAll(PARAMS, new AbortController().signal);

    expect(result.data).toHaveLength(1000);
    expect(mockFetch).toHaveBeenCalledTimes(10);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('pagination incomplete'));
    warnSpy.mockRestore();
  });
});

describe('#233 — AC : max-records="5000" → pagination jusqu’à 5000', () => {
  it('fetchAll va au-delà du plafond historique', async () => {
    mockOdsDataset(2500);
    const adapter = new OpenDataSoftAdapter();

    const result = await adapter.fetchAll(
      { ...PARAMS, maxRecords: 5000 },
      new AbortController().signal
    );

    // Le dataset n'a que 2500 lignes : tout est récupéré (25 pages)
    expect(result.data).toHaveLength(2500);
    expect(result.totalCount).toBe(2500);
    expect(mockFetch).toHaveBeenCalledTimes(25);
  });

  it('max-records="150" plafonne en dessous du défaut', async () => {
    mockOdsDataset(2500);
    const adapter = new OpenDataSoftAdapter();

    const result = await adapter.fetchAll(
      { ...PARAMS, maxRecords: 150 },
      new AbortController().signal
    );

    expect(result.data).toHaveLength(150);
    expect(mockFetch).toHaveBeenCalledTimes(2); // 100 + 50
  });

  it('limit explicite garde la priorité sur max-records', async () => {
    mockOdsDataset(2500);
    const adapter = new OpenDataSoftAdapter();

    const result = await adapter.fetchAll(
      { ...PARAMS, limit: 120, maxRecords: 5000 },
      new AbortController().signal
    );

    expect(result.data).toHaveLength(120);
  });
});

describe('#233 — l’attribut max-records de dsfr-data-source est propagé', () => {
  beforeEach(() => mockFetch.mockReset());

  it('getAdapterParams() transmet maxRecords', () => {
    const source = new DsfrDataSource();
    source.id = 'mr-src';
    source.apiType = 'opendatasoft';
    source.baseUrl = 'https://data.example.fr';
    source.datasetId = 'ds';
    source.setAttribute('max-records', '5000');
    (source as any).maxRecords = 5000;

    expect(source.getAdapterParams().maxRecords).toBe(5000);
  });

  it('défaut : maxRecords absent/0 → cap historique', () => {
    const source = new DsfrDataSource();
    source.id = 'mr-src2';
    expect(source.getAdapterParams().maxRecords ?? 0).toBe(0);
  });
});
