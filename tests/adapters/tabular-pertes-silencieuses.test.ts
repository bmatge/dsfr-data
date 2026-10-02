import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #1202 — ce que l'API Tabular perd sans le dire (PG-033, PG-034 du banc).
 *
 * PG-033 : pagination par offset sur un tri non unique → doublons et absents.
 * Quand tout le jeu tient sous le plafond, l'adaptateur relit sans `__sort`
 * et trie lui-même ; tronqué, il garde le tri serveur et le dit.
 *
 * PG-034 : `__in` écarte une valeur à parenthèse avec un HTTP 200 → la
 * clause n'est pas jugée délégable, et un `where` posé sur la source avertit.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import type { AdapterParams } from '@/adapters/api-adapter.js';

function params(overrides: Partial<AdapterParams> = {}): AdapterParams {
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
    pageSize: 20,
    ...overrides,
  };
}

/** Page Tabular brute : `meta.total` connu, `links.next` tant qu'il reste des lignes. */
function page(data: unknown[], total: number, next: number | null) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        data,
        links: {
          next: next ? `/api/resources/resource-456/data/?page=${next}&page_size=200` : null,
        },
        meta: { page: 1, page_size: 200, total },
      }),
  };
}

const rows = (from: number, n: number, nombre: number) =>
  Array.from({ length: n }, (_, i) => ({ id: from + i, nombre }));

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  mockFetch.mockReset();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warnSpy.mockRestore());

describe('PG-033 — tri d’un chargement paginé', () => {
  it('jeu sous le plafond : relu sans __sort, trié ici, chaque ligne une fois', async () => {
    const adapter = new TabularAdapter();
    // 1re page triée par le serveur (la sonde), total 300 > une page
    mockFetch.mockResolvedValueOnce(page(rows(1, 200, 5), 300, 2));
    // relecture sans tri : deux pages
    mockFetch.mockResolvedValueOnce(page([...rows(1, 100, 1), ...rows(101, 100, 3)], 300, 2));
    mockFetch.mockResolvedValueOnce(page(rows(201, 100, 2), 300, null));

    const result = await adapter.fetchAll(
      params({ orderBy: 'nombre:desc' }),
      new AbortController().signal
    );

    const urls = mockFetch.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain('nombre__sort=desc');
    expect(urls.slice(1).some((u) => u.includes('__sort'))).toBe(false);
    expect(result.data).toHaveLength(300);
    expect(new Set((result.data as Array<{ id: number }>).map((r) => r.id)).size).toBe(300);
    const nombres = (result.data as Array<{ nombre: number }>).map((r) => r.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => b - a));
  });

  it('une seule page : le serveur trie, une requête', async () => {
    const adapter = new TabularAdapter();
    mockFetch.mockResolvedValueOnce(page(rows(1, 50, 1), 50, null));
    await adapter.fetchAll(params({ orderBy: 'nombre:desc' }), new AbortController().signal);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toContain('nombre__sort=desc');
  });

  it('chargement tronqué par max-records : le tri serveur est gardé, et dit', async () => {
    const adapter = new TabularAdapter();
    mockFetch.mockResolvedValueOnce(page(rows(1, 200, 5), 10_000, 2));
    await adapter.fetchAll(
      params({ orderBy: 'nombre:desc', maxRecords: 200 }),
      new AbortController().signal
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PG-033'));
  });
});

describe('PG-034 — in/notin à parenthèse ou à virgule', () => {
  const adapter = new TabularAdapter();

  it('n’est pas jugé délégable', () => {
    expect(adapter.supportsServerWhere('cat:in:Homicides|Usage de stupéfiants (AFD)')).toBe(false);
    expect(adapter.supportsServerWhere('cat:notin:Vols (avec violence)')).toBe(false);
    expect(adapter.supportsServerWhere('cat:in:A%2CB|C')).toBe(false);
  });

  it('une liste ordinaire reste délégable, et une parenthèse hors in aussi', () => {
    expect(adapter.supportsServerWhere('cat:in:Homicides|Cambriolages')).toBe(true);
    expect(adapter.supportsServerWhere('cat:eq:Usage de stupéfiants (AFD)')).toBe(true);
  });

  it('un where posé sur la source part tel quel, mais avertit une fois', () => {
    const p = params({ where: 'cat:in:Homicides|Usage de stupéfiants (AFD)' });
    adapter.buildUrl(p, 200, 1);
    adapter.buildUrl(p, 200, 1);
    const avertis = warnSpy.mock.calls.filter((c: unknown[]) => String(c[0]).includes('PG-034'));
    expect(avertis).toHaveLength(1);
  });
});
