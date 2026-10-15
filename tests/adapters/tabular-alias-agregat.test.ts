import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests #1320 — l'API Tabular n'a pas d'alias d'agregat : elle nomme toujours
 * la colonne `champ__fonction` (mesure du 2026-10-15, ressource 90e0d717…,
 * `EPCI__groupby&NB_VP__sum` → `{ EPCI, NB_VP__sum }`). Un regroupement
 * delegue avec alias personnalise (`montant:sum:total`) rendait des groupes
 * sans colonne `total` : l'affichage en aval montrait « — ».
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import type { AdapterParams, ServerSideOverlay } from '@/adapters/api-adapter.js';

function params(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: 'https://tabular-api.data.gouv.fr',
    datasetId: '',
    resource: 'resource-456',
    select: '',
    where: '',
    filter: '',
    groupBy: 'groupe',
    aggregate: '',
    orderBy: '',
    limit: 0,
    transform: '',
    pageSize: 20,
    ...overrides,
  };
}

function overlay(overrides: Partial<ServerSideOverlay> = {}): ServerSideOverlay {
  return { page: 1, effectiveWhere: '', orderBy: '', ...overrides };
}

function reponse(data: unknown[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ data, links: {}, meta: { page: 1, page_size: 200 } }),
  };
}

/** Groupes tels que l'API les rend : colonnes `champ__fonction`. */
const GROUPES = [
  { groupe: 'A', montant__sum: 210, rang__count: 3 },
  { groupe: 'B', montant__sum: 90, rang__count: 2 },
];

describe('TabularAdapter — alias personnalise d’un agregat delegue (#1320)', () => {
  const adapter = new TabularAdapter();

  beforeEach(() => {
    mockFetch.mockReset();
    adapter.resetTotalOrderState();
  });

  it('pose l’alias sur les groupes en chargement complet', async () => {
    mockFetch.mockResolvedValueOnce(reponse(GROUPES));
    const result = await adapter.fetchAll(
      params({ aggregate: 'montant:sum:total, rang:count:lignes' }),
      new AbortController().signal
    );
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain('montant__sum');
    expect(url).not.toContain('total');
    expect(result.needsClientProcessing).toBe(false);
    expect(result.data).toEqual([
      { groupe: 'A', total: 210, lignes: 3 },
      { groupe: 'B', total: 90, lignes: 2 },
    ]);
  });

  it('laisse les groupes intacts sans alias personnalise', async () => {
    mockFetch.mockResolvedValueOnce(reponse(GROUPES));
    const result = await adapter.fetchAll(
      params({ aggregate: 'montant:sum, rang:count' }),
      new AbortController().signal
    );
    expect(result.data).toEqual(GROUPES);
  });

  it('garde la colonne par defaut quand un agregat sans alias la demande aussi', async () => {
    mockFetch.mockResolvedValueOnce(reponse([{ groupe: 'A', montant__sum: 210 }]));
    const result = await adapter.fetchAll(
      params({ aggregate: 'montant:sum, montant:sum:total' }),
      new AbortController().signal
    );
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url.match(/montant__sum/g)).toHaveLength(1);
    expect(result.data).toEqual([{ groupe: 'A', montant__sum: 210, total: 210 }]);
  });

  it('trie sur l’alias (tri local sur les groupes complets, #1045)', async () => {
    mockFetch.mockResolvedValueOnce(reponse(GROUPES.slice().reverse()));
    const result = await adapter.fetchAll(
      params({ aggregate: 'montant:sum:total', orderBy: 'total:desc' }),
      new AbortController().signal
    );
    expect(result.data.map((r) => (r as { total: number }).total)).toEqual([210, 90]);
  });

  it('pose l’alias en pagination serveur', async () => {
    mockFetch.mockResolvedValueOnce(reponse(GROUPES));
    const result = await adapter.fetchPage(
      params({ aggregate: 'montant:sum:total' }),
      overlay(),
      new AbortController().signal
    );
    expect(result.needsClientProcessing).toBe(false);
    expect(result.data).toEqual([
      { groupe: 'A', total: 210, rang__count: 3 },
      { groupe: 'B', total: 90, rang__count: 2 },
    ]);
  });

  it('ne touche pas les lignes brutes d’un regroupement non delegue', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const brutes = [{ groupe: 'A', montant: 1, montant__sum: 'colonne du jeu' }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: brutes, links: {}, meta: { total: 1 } }),
    });
    const result = await adapter.fetchAll(
      params({ aggregate: 'montant:distinct:n' }),
      new AbortController().signal
    );
    expect(result.needsClientProcessing).toBe(true);
    expect(result.data).toEqual(brutes);
    warn.mockRestore();
  });
});
