import { describe, it, expect, vi } from 'vitest';
import { parseAggregates, aggregateAlias } from '@/utils/aggregates.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import { GristAdapter } from '@/adapters/grist-adapter.js';
import type { AdapterParams } from '@/adapters/api-adapter.js';

/**
 * AC de #269 (A1) : `aggregate="population:sum"` produit la MÊME colonne
 * (`population__sum`) sur tous les chemins du pipeline — client-side,
 * ODS, Tabular, Grist SQL — pour qu'un value-field de chart survive au
 * changement de provider.
 */

const EXPECTED_ALIAS = 'population__sum';

function makeParams(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: 'https://example.org/api/docs/doc1/tables/t1/records',
    datasetId: 'ds',
    resource: 'res',
    where: '',
    filter: '',
    select: '',
    groupBy: 'region',
    aggregate: 'population:sum',
    orderBy: '',
    serverSide: false,
    pageSize: 20,
    limit: 0,
    headers: {},
    ...overrides,
  } as AdapterParams;
}

describe('convention d’alias d’agrégat unique field__fn (#269)', () => {
  it('parseAggregates résout l’alias par défaut en field__fn', () => {
    expect(aggregateAlias('population', 'sum')).toBe(EXPECTED_ALIAS);
    const parsed = parseAggregates('population:sum');
    expect(parsed).toEqual([{ field: 'population', function: 'sum', alias: EXPECTED_ALIAS }]);
  });

  it('client-side (dsfr-data-query) : la colonne agrégée est population__sum', () => {
    const query = new DsfrDataQuery();
    query.groupBy = 'region';
    query.aggregate = 'population:sum';
    const rows = (
      query as unknown as {
        _applyGroupByAndAggregate: (d: Record<string, unknown>[]) => Record<string, unknown>[];
      }
    )._applyGroupByAndAggregate([
      { region: 'A', population: 10 },
      { region: 'A', population: 5 },
      { region: 'B', population: 7 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveProperty(EXPECTED_ALIAS);
    expect(rows.find((r) => r.region === 'A')?.[EXPECTED_ALIAS]).toBe(15);
  });

  it('ODS : le select généré aliase en population__sum', () => {
    const adapter = new OpenDataSoftAdapter();
    const url = new URL(adapter.buildUrl(makeParams({ baseUrl: 'https://data.example.org' })));
    expect(url.searchParams.get('select')).toContain(`sum(population) as ${EXPECTED_ALIAS}`);
  });

  it('Tabular : le paramètre serveur est population__sum (= colonne retournée)', () => {
    const adapter = new TabularAdapter();
    const url = new URL(adapter.buildUrl(makeParams()));
    expect([...url.searchParams.keys()]).toContain(EXPECTED_ALIAS);
  });

  it('Grist SQL : le SELECT aliase en population__sum', async () => {
    const adapter = new GristAdapter();
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    // SQL availability check
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ records: [[1]] }) });
    // SQL query — capture le body pour inspecter le SQL généré
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ columns: ['region', EXPECTED_ALIAS], records: [['A', 15]] }),
    });

    const result = await adapter.fetchAll(makeParams(), new AbortController().signal);

    const sqlCall = mockFetch.mock.calls[1];
    const body = JSON.parse((sqlCall[1] as RequestInit).body as string) as { sql: string };
    expect(body.sql).toContain(`as "${EXPECTED_ALIAS}"`);
    expect(result.data[0]).toHaveProperty(EXPECTED_ALIAS);

    vi.unstubAllGlobals();
  });

  it('Grist fallback Records : needsClientProcessing=true → la convention client s’applique', async () => {
    const adapter = new GristAdapter();
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    // SQL indisponible
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });
    // Records mode
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ records: [{ id: 1, fields: { region: 'A', population: 10 } }] }),
    });

    const result = await adapter.fetchAll(makeParams(), new AbortController().signal);
    // Le fallback rend la main au client : c'est dsfr-data-query qui agrège,
    // avec le même alias field__fn (testé plus haut) → colonne identique.
    expect(result.needsClientProcessing).toBe(true);

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
