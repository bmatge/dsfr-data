import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #810 — un `select` purement agrégé, sans `group_by`, sur Opendatasoft.
 *
 * Comportement RÉEL de l'API, relevé sur data.economie.gouv.fr
 * (plan-de-relance) :
 *   ?select=count(*) as n            → total_count 3080, results = 3 080 lignes valant { n: 3080 }
 *   ?select=count(*) as n&where=<rien> → total_count 0, results = []
 * La pagination courait jusqu'au plafond (dix requêtes de copies), et un filtre
 * sans correspondance donnait « — » au lieu de 0.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';

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

/** Reproduit l'API : l'agrégat répété sur chaque ligne du jeu filtré. */
function mockAggregateApi(total: number, row: Record<string, unknown>) {
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string) => {
    const limit = parseInt(new URL(url, 'http://localhost').searchParams.get('limit') || '100', 10);
    return {
      ok: true,
      json: async () => ({
        total_count: total,
        results: Array.from({ length: Math.min(limit, total) }, () => ({ ...row })),
      }),
    };
  });
}

beforeEach(() => mockFetch.mockReset());

describe('#810 — select agrégé sans group_by', () => {
  it('une seule requête limit=1, une seule ligne, total inconnu (pas de fausse troncature)', async () => {
    mockAggregateApi(3080, { n: 3080 });
    const result = await new OpenDataSoftAdapter().fetchAll(
      { ...PARAMS, select: 'count(*) as n' },
      new AbortController().signal
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(
      new URL(mockFetch.mock.calls[0][0] as string, 'http://localhost').searchParams.get('limit')
    ).toBe('1');
    expect(result.data).toEqual([{ n: 3080 }]);
    expect(result.totalCount).toBeUndefined();
    expect(result.truncated).toBeUndefined();
  });

  it('plusieurs agrégats, alias backquoté : une ligne', async () => {
    mockAggregateApi(10, { total: 42, 'Montant moyen': 4.2 });
    const result = await new OpenDataSoftAdapter().fetchAll(
      { ...PARAMS, select: 'sum(montant) as total, avg(montant) as `Montant moyen`' },
      new AbortController().signal
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual([{ total: 42, 'Montant moyen': 4.2 }]);
  });

  it('aucune ligne ne passe le filtre : count vaut 0, les autres fonctions null', async () => {
    mockAggregateApi(0, {});
    const result = await new OpenDataSoftAdapter().fetchAll(
      { ...PARAMS, select: 'count(*) as n, sum(montant) as total', where: 'type = "absent"' },
      new AbortController().signal
    );
    expect(result.data).toEqual([{ n: 0, total: null }]);
  });

  it('un champ nu dans le select garde le chargement ordinaire', async () => {
    mockAggregateApi(3, { region: 'IDF' });
    const result = await new OpenDataSoftAdapter().fetchAll(
      { ...PARAMS, select: 'count(*) as total, region' },
      new AbortController().signal
    );
    expect(result.data).toHaveLength(3);
  });

  it('avec group_by, rien ne change (chemin des regroupements)', async () => {
    mockAggregateApi(2, { region: 'IDF', n: 2 });
    const result = await new OpenDataSoftAdapter().fetchAll(
      { ...PARAMS, select: 'count(*) as n', groupBy: 'region' },
      new AbortController().signal
    );
    expect(result.data).toHaveLength(2);
  });
});
