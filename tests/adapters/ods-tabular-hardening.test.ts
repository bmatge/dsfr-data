import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests traversants #289 (EPIC D) — échappement d'identifiants ODS et
 * garde-fous server-side Tabular.
 *
 * Bugs d'origine :
 * - ODS : identifiants non échappés dans `_buildSelectFromAggregate` et
 *   `group_by` → un champ avec espace ("Date - Journée gazière") casse
 *   l'ODSQL (Grist échappe systématiquement) ;
 * - Tabular : `buildUrl` apposait `field__groupby`/`field__sum` sans
 *   consulter `isTabularServerFieldSafe` — le garde-fou n'était appliqué
 *   que par la délégation query (#275). Un group-by posé directement sur la
 *   source (mode documenté) avec un champ à espaces produisait le
 *   « Malformed query » que la fonction prétend éviter ;
 * - Tabular `_applyColonFilters` : `set()` écrasait deux filtres même
 *   champ+op là où Grist/ODS les AND-ent ;
 * - mineurs : over-fetch (toujours 50 même si remaining < 50), warnings
 *   préfixés `dsfr-data-query:` dans des adapters.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import type { AdapterParams } from '@/adapters/api-adapter.js';

function makeParams(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: 'https://data.example.fr',
    datasetId: 'mon-dataset',
    resource: 'res-123',
    select: '',
    where: '',
    filter: '',
    groupBy: '',
    aggregate: '',
    orderBy: '',
    limit: 0,
    transform: '',
    pageSize: 0,
    ...overrides,
  };
}

describe('#289 — ODS : échappement des identifiants (backquotes ODSQL)', () => {
  const adapter = new OpenDataSoftAdapter();

  it('AC : group-by sur champ à espaces produit un group_by échappé', () => {
    const url = new URL(adapter.buildUrl(makeParams({ groupBy: 'Date - Journée gazière' })));
    expect(url.searchParams.get('group_by')).toBe('`Date - Journée gazière`');
  });

  it('les champs simples restent non échappés (lisibilité des URLs)', () => {
    const url = new URL(adapter.buildUrl(makeParams({ groupBy: 'region' })));
    expect(url.searchParams.get('group_by')).toBe('region');
  });

  it('group-by multi-champs : chaque champ échappé indépendamment', () => {
    const url = new URL(
      adapter.buildUrl(makeParams({ groupBy: 'region, Date - Journée gazière' }))
    );
    expect(url.searchParams.get('group_by')).toBe('region,`Date - Journée gazière`');
  });

  it("l'agrégat sur champ à espaces échappe le champ ET l'alias", () => {
    const select = (adapter as any)._buildSelectFromAggregate(
      makeParams({
        groupBy: 'region',
        aggregate: 'Inventaire LNG (m3 LNG):sum',
      })
    );
    expect(select).toBe('sum(`Inventaire LNG (m3 LNG)`) as `Inventaire LNG (m3 LNG)__sum`, region');
  });

  it('agrégat sur champ simple : sortie identique à avant (non-régression)', () => {
    const select = (adapter as any)._buildSelectFromAggregate(
      makeParams({ groupBy: 'region', aggregate: 'population:sum' })
    );
    expect(select).toBe('sum(population) as population__sum, region');
  });
});

describe('#289 — Tabular : garde-fou supportsServerFields dans buildUrl', () => {
  const adapter = new TabularAdapter();

  it('AC : group-by sur champ à espaces posé sur la SOURCE ne produit plus de Malformed query', () => {
    const url = new URL(
      adapter.buildUrl(makeParams({ groupBy: 'Date - Journée gazière', aggregate: 'pop:sum' }))
    );
    // Aucun paramètre groupby/agrégat malformé : lignes brutes (fallback)
    const keys = [...url.searchParams.keys()];
    expect(keys.some((k) => k.includes('groupby'))).toBe(false);
    expect(keys.some((k) => k.includes('__sum'))).toBe(false);
  });

  it('champs sûrs : group-by/agrégat serveur inchangés (non-régression)', () => {
    const url = new URL(
      adapter.buildUrl(makeParams({ groupBy: 'region', aggregate: 'population:sum' }))
    );
    expect(url.searchParams.has('region__groupby')).toBe(true);
    expect(url.searchParams.has('population__sum')).toBe(true);
  });

  it('fetchAll avec champ non sûr → needsClientProcessing true + warning explicite', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ a: 1 }], meta: { total: 1 }, links: {} }),
    });

    const result = await adapter.fetchAll(
      makeParams({ groupBy: 'Date - Journée gazière', aggregate: 'pop:sum', limit: 10 }),
      new AbortController().signal
    );

    expect(result.needsClientProcessing).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Date - Journée gazière'));
    warnSpy.mockRestore();
  });

  it('fetchAll avec champs sûrs → needsClientProcessing false (serveur a traité)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ region: 'IDF', population__sum: 9 }], meta: { total: 1 } }),
    });

    const result = await adapter.fetchAll(
      makeParams({ groupBy: 'region', aggregate: 'population:sum', limit: 10 }),
      new AbortController().signal
    );

    expect(result.needsClientProcessing).toBe(false);
  });
});

describe('#289 — Tabular : deux filtres même champ+op sont AND-és (append)', () => {
  const adapter = new TabularAdapter();

  it('population:gt:100, population:gt:500 → les deux contraintes posées', () => {
    const url = new URL(
      adapter.buildUrl(makeParams({ where: 'population:gt:100, population:gt:500' }))
    );
    expect(url.searchParams.getAll('population__strictly_greater')).toEqual(['100', '500']);
  });
});

describe('#289 — Tabular : plus d’over-fetch sur la dernière page', () => {
  const adapter = new TabularAdapter();

  beforeEach(() => mockFetch.mockReset());

  it('limit=30 → une requête page_size=30, pas 50', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: Array.from({ length: 30 }, (_, i) => ({ i })),
        meta: { total: 1000 },
      }),
    });

    await adapter.fetchAll(makeParams({ limit: 30 }), new AbortController().signal);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.searchParams.get('page_size')).toBe('30');
  });
});

describe('#289 — préfixes de warning corrects (plus de dsfr-data-query: dans les adapters)', () => {
  it('le warning de pagination incomplète Tabular est préfixé tabular', async () => {
    const adapter = new TabularAdapter();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch.mockReset();
    // 1 page pleine de 50 puis page vide — total annoncé 5000 → incomplet
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: Array.from({ length: 50 }, (_, i) => ({ i })),
          meta: { total: 5000 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [], meta: { total: 5000 } }),
      });

    await adapter.fetchAll(makeParams({ limit: 0 }), new AbortController().signal);

    const calls = warnSpy.mock.calls.map((c) => String(c[0]));
    const paginationWarn = calls.find((m) => m.includes('pagination incomplete'));
    expect(paginationWarn).toBeDefined();
    expect(paginationWarn).toContain('tabular');
    expect(paginationWarn).not.toContain('dsfr-data-query');
    warnSpy.mockRestore();
  });
});
