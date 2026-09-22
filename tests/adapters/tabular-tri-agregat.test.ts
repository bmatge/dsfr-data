import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #1045 — l'API Tabular ne trie pas une colonne d'agregat.
 *
 * Mesure du 2026-09-23 (ressource 90e0d717…) : `EPCI__groupby&NB_VP__sum`
 * + `NB_VP__sum__sort=desc` → 400, 42703 « column …NB_VP__sum does not
 * exist » ; `EPCI__sort=desc` → 200 ; `NB_VP__sort=desc` → 400, 42803. Le tri
 * sur agregat ne part donc plus au serveur : l'adaptateur lit les groupes
 * COMPLETS et trie lui-meme, en fetch complet comme en pagination serveur.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import type { AdapterParams, ServerSideOverlay } from '@/adapters/api-adapter.js';

function tabularParams(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: 'https://tabular-api.data.gouv.fr',
    datasetId: '',
    resource: 'resource-456',
    select: '',
    where: '',
    filter: '',
    groupBy: '',
    aggregate: '',
    orderBy: '',
    limit: 0,
    transform: '',
    pageSize: 2,
    ...overrides,
  };
}

function overlay(overrides: Partial<ServerSideOverlay> = {}): ServerSideOverlay {
  return { page: 1, effectiveWhere: '', orderBy: '', ...overrides };
}

function sorts(url: string): string[] {
  const i = url.indexOf('?');
  if (i === -1) return [];
  return url
    .slice(i + 1)
    .split('&')
    .filter((p) => p.split('=')[0].endsWith('__sort'));
}

/** Groupes rendus par l'API, dans SON ordre (celui du regroupement). */
const GROUPES = [
  { code: 'A', population__sum: 10 },
  { code: 'B', population__sum: 50 },
  { code: 'C', population__sum: 30 },
  { code: 'D', population__sum: 40 },
  { code: 'E', population__sum: 20 },
];

/** Reponse Tabular agregee : pas de `meta.total`, `links.next` pagine. */
function reponse(data: unknown[], next: string | null = null) {
  return {
    ok: true,
    json: () => Promise.resolve({ data, links: { next }, meta: { page: 1, page_size: 200 } }),
  };
}

const REGROUPE = { groupBy: 'code', aggregate: 'population:sum' };

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockFetch.mockReset();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('#1045 — URL : jamais de tri sur une colonne d’agrégat', () => {
  const adapter = new TabularAdapter();

  it('ne trie pas une colonne d’agrégat au serveur (fetch complet et page)', () => {
    const params = tabularParams({ ...REGROUPE, orderBy: 'population__sum:desc' });
    expect(sorts(adapter.buildUrl(params, 200, 1))).toEqual([]);
    expect(
      sorts(adapter.buildServerSideUrl(params, overlay({ orderBy: 'population__sum:desc' })))
    ).toEqual([]);
  });

  it('délègue un tri sur la colonne de regroupement (accepté par l’API)', () => {
    const params = tabularParams({ ...REGROUPE, orderBy: 'code:desc' });
    expect(sorts(adapter.buildUrl(params, 200, 1))).toEqual(['code__sort=desc']);
    expect(sorts(adapter.buildServerSideUrl(params, overlay({ orderBy: 'code:desc' })))).toEqual([
      'code__sort=desc',
    ]);
  });

  it('un tri mixte (clé puis agrégat) reste entier côté adaptateur', () => {
    const params = tabularParams({ ...REGROUPE, orderBy: 'code:asc, population__sum:desc' });
    expect(sorts(adapter.buildUrl(params, 200, 1))).toEqual([]);
  });

  it('sans regroupement, le tri part tel quel', () => {
    const params = tabularParams({ orderBy: 'population:desc' });
    expect(sorts(adapter.buildUrl(params, 200, 1))).toEqual(['population__sort=desc']);
  });

  it('regroupement non délégable (distinct) : aucun tri calculé n’est émis', () => {
    const params = tabularParams({
      groupBy: 'code',
      aggregate: 'dept:distinct:nb',
      orderBy: 'nb:desc',
    });
    expect(sorts(adapter.buildUrl(params, 200, 1))).toEqual([]);
  });
});

describe('#1045 — fetchAll : groupes complets, puis tri, puis limit', () => {
  it('lit TOUS les groupes malgré limit, trie, puis coupe (vrai top N)', async () => {
    const adapter = new TabularAdapter();
    mockFetch.mockResolvedValueOnce(reponse(GROUPES));

    const result = await adapter.fetchAll(
      tabularParams({ ...REGROUPE, orderBy: 'population__sum:desc', limit: 2 }),
      new AbortController().signal
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = String(mockFetch.mock.calls[0][0]);
    // La lecture n'est pas bornee a 2 : un top 2 sur deux groupes lus serait faux
    expect(url).toContain('page_size=200');
    expect(url).not.toContain('__sort');
    expect(result.data).toEqual([
      { code: 'B', population__sum: 50 },
      { code: 'D', population__sum: 40 },
    ]);
    expect(result.needsClientProcessing).toBe(false);
  });

  it('suit links.next avant de trier', async () => {
    const adapter = new TabularAdapter();
    const page1 = Array.from({ length: 200 }, (_, i) => ({ code: `P${i}`, population__sum: i }));
    mockFetch
      .mockResolvedValueOnce(reponse(page1, 'https://x/data/?page=2'))
      .mockResolvedValueOnce(reponse([{ code: 'Z', population__sum: 1000 }]));

    const result = await adapter.fetchAll(
      tabularParams({ ...REGROUPE, orderBy: 'population__sum:desc', limit: 1 }),
      new AbortController().signal
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual([{ code: 'Z', population__sum: 1000 }]);
  });
});

describe('#1045 — fetchPage : jamais un tri sur une page de groupes', () => {
  it('découpe la page dans les groupes complets triés, total connu', async () => {
    const adapter = new TabularAdapter();
    mockFetch.mockResolvedValueOnce(reponse(GROUPES));

    const params = tabularParams({ ...REGROUPE });
    const p1 = await adapter.fetchPage(
      params,
      overlay({ page: 1, orderBy: 'population__sum:desc' }),
      new AbortController().signal
    );
    expect(p1.data.map((g) => (g as { code: string }).code)).toEqual(['B', 'D']);
    expect(p1.totalCount).toBe(5);
    expect(p1.needsClientProcessing).toBe(false);
    expect(String(mockFetch.mock.calls[0][0])).not.toContain('__sort');

    // Page 2 : relue dans les groupes gardes, sans nouvelle requete
    const p2 = await adapter.fetchPage(
      params,
      overlay({ page: 2, orderBy: 'population__sum:desc' }),
      new AbortController().signal
    );
    expect(p2.data.map((g) => (g as { code: string }).code)).toEqual(['C', 'E']);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Sens inverse : meme lecture, autre tri
    const asc = await adapter.fetchPage(
      params,
      overlay({ page: 1, orderBy: 'population__sum:asc' }),
      new AbortController().signal
    );
    expect(asc.data.map((g) => (g as { code: string }).code)).toEqual(['A', 'E']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('un autre filtre relit les groupes', async () => {
    const adapter = new TabularAdapter();
    mockFetch.mockResolvedValueOnce(reponse(GROUPES)).mockResolvedValueOnce(reponse(GROUPES));
    const params = tabularParams({ ...REGROUPE });
    const tri = 'population__sum:desc';
    await adapter.fetchPage(params, overlay({ orderBy: tri }), new AbortController().signal);
    await adapter.fetchPage(
      params,
      overlay({ orderBy: tri, effectiveWhere: 'code:eq:A' }),
      new AbortController().signal
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[1][0])).toContain('code__exact=A');
  });

  it('plafond atteint : total inconnu, tronqué, et le tri partiel est signalé', async () => {
    const adapter = new TabularAdapter();
    const page1 = Array.from({ length: 200 }, (_, i) => ({ code: `P${i}`, population__sum: i }));
    mockFetch.mockResolvedValueOnce(reponse(page1, 'https://x/data/?page=2'));

    const result = await adapter.fetchPage(
      tabularParams({ ...REGROUPE, maxRecords: 200 }),
      overlay({ orderBy: 'population__sum:desc' }),
      new AbortController().signal
    );

    expect(result.totalCount).toBeUndefined();
    expect(result.truncated).toBe(true);
    expect(
      warnSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('premiers groupes seulement'))
    ).toBe(true);
  });
});
