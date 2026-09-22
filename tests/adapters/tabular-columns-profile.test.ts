import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #985 — réduire le volume Tabular.
 *
 * - `select` de la source → `columns=` : l'API ne rend que les colonnes
 *   nommées (34 721 → 3 098 octets pour 50 élus à deux colonnes, 366 892 →
 *   22 383 octets pour 200 bornes IRVE à trois colonnes, mesures du
 *   2026-09-22). Désactivé par un `group-by`/`aggregate` : l'API refuse
 *   `columns` à côté d'un agrégateur (400 « the argument `columns` cannot be
 *   set alongside aggregators »).
 * - `fetchProfile()` : `GET /profile/`, mémorisé par ressource, annulable,
 *   jamais appelé par `fetchAll`.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import type { AdapterParams, ServerSideOverlay } from '@/adapters/api-adapter.js';

function makeParams(overrides: Partial<AdapterParams> = {}): AdapterParams {
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

/** Query string brute d'une URL construite (`?` inclus, '' si absente). */
function query(url: string): string {
  const i = url.indexOf('?');
  return i === -1 ? '' : url.slice(i);
}

const ov: ServerSideOverlay = { page: 1, effectiveWhere: '', orderBy: '' };

describe('#985 — select de la source → columns= (projection)', () => {
  beforeEach(() => mockFetch.mockReset());

  it('buildUrl emet columns= : virgule nue, noms percent-encodes', () => {
    const adapter = new TabularAdapter();
    const url = adapter.buildUrl(makeParams({ select: "Nom de l'élu, Code sexe" }));
    expect(query(url)).toContain("columns=Nom%20de%20l'%C3%A9lu,Code%20sexe");
    expect(new URL(url).searchParams.get('columns')).toBe("Nom de l'élu,Code sexe");
  });

  it('buildServerSideUrl emet la meme projection (fetchPage)', () => {
    const adapter = new TabularAdapter();
    const url = adapter.buildServerSideUrl(makeParams({ select: 'lat, lon, nom' }), ov);
    expect(new URL(url).searchParams.get('columns')).toBe('lat,lon,nom');
  });

  it('sans select : aucun columns=, en fetchAll comme en fetchPage', () => {
    const adapter = new TabularAdapter();
    expect(query(adapter.buildUrl(makeParams()))).not.toContain('columns');
    expect(query(adapter.buildServerSideUrl(makeParams(), ov))).not.toContain('columns');
    expect(query(adapter.buildUrl(makeParams({ select: '  ' })))).not.toContain('columns');
  });

  it('les doublons et les elements vides sont retires', () => {
    const adapter = new TabularAdapter();
    const url = adapter.buildUrl(makeParams({ select: 'a, b,, a ,' }));
    expect(new URL(url).searchParams.get('columns')).toBe('a,b');
  });

  it.each([
    ['group-by + aggregate', { groupBy: 'region', aggregate: 'population:sum' }],
    ['group-by seul (non delegable, lignes brutes completes)', { groupBy: 'region' }],
    ['aggregate distinct (non delegable)', { groupBy: 'region', aggregate: 'code:distinct' }],
    ['aggregate sans group-by', { aggregate: 'population:sum' }],
  ] as const)('%s : pas de columns= (refuse par l’API avec un agregateur)', (_, extra) => {
    const adapter = new TabularAdapter();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const params = makeParams({ select: 'region, population', ...extra });
    expect(query(adapter.buildUrl(params))).not.toContain('columns');
    expect(query(adapter.buildServerSideUrl(params, ov))).not.toContain('columns');
    warnSpy.mockRestore();
  });

  it('fetchAll pagine avec la projection sur CHAQUE page', async () => {
    const adapter = new TabularAdapter();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: Array.from({ length: 200 }, (_, i) => ({ nom: `n${i}` })),
          meta: { total: 250 },
          links: { next: '/api/resources/resource-456/data/?page=2&page_size=200' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: Array.from({ length: 50 }, (_, i) => ({ nom: `m${i}` })),
          meta: { total: 250 },
          links: { next: null },
        }),
      });

    const result = await adapter.fetchAll(
      makeParams({ select: 'nom' }),
      new AbortController().signal
    );

    expect(result.data).toHaveLength(250);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    for (const [u] of mockFetch.mock.calls) {
      expect(new URL(String(u)).searchParams.get('columns')).toBe('nom');
    }
  });

  it('fetchPage porte la projection', async () => {
    const adapter = new TabularAdapter();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ nom: 'a' }], meta: { total: 1 } }),
    });
    await adapter.fetchPage(
      makeParams({ select: 'nom', pageSize: 20 }),
      ov,
      new AbortController().signal
    );
    expect(new URL(String(mockFetch.mock.calls[0][0])).searchParams.get('columns')).toBe('nom');
  });

  it('select a expression ODSQL : ignore, avertissement UNIQUE, toutes les colonnes chargees', () => {
    const adapter = new TabularAdapter();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const select of ['count(*) as total, region', '*', 'sum(x)', '`1_uai`', 'a as b']) {
      expect(query(adapter.buildUrl(makeParams({ select })))).not.toContain('columns');
    }
    const avertissements = warnSpy.mock.calls.filter(([m]) => String(m).includes('ignoré'));
    expect(avertissements).toHaveLength(1);
    expect(String(avertissements[0][0])).toContain('select="count(*) as total, region"');
    warnSpy.mockRestore();
  });

  it('un nom de colonne a parenthese precedee d’une espace n’est PAS une fonction', () => {
    const adapter = new TabularAdapter();
    const url = adapter.buildUrl(makeParams({ select: 'Inventaire LNG (m3 LNG), Date' }));
    expect(new URL(url).searchParams.get('columns')).toBe('Inventaire LNG (m3 LNG),Date');
  });
});

describe('#985 — fetchProfile : profil memorise par ressource, annulable', () => {
  const PROFIL = {
    profile: {
      columns: { consolidated_latitude: { format: 'latitude_wgs', python_type: 'float' } },
      profile: { consolidated_latitude: { nb_distinct: 10, nb_missing_values: 0 } },
      categorical: ['Code sexe'],
      total_lines: 1234,
    },
    deleted_at: null,
  };

  beforeEach(() => mockFetch.mockReset());

  it('lit /profile/ de la ressource et rend l’objet `profile`', async () => {
    const adapter = new TabularAdapter();
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => PROFIL });

    const profil = await adapter.fetchProfile({ resource: 'res-1' });

    expect(String(mockFetch.mock.calls[0][0])).toBe(
      'https://tabular-api.data.gouv.fr/api/resources/res-1/profile/'
    );
    expect(profil.columns?.consolidated_latitude?.format).toBe('latitude_wgs');
    expect(profil.total_lines).toBe(1234);
  });

  it('memorise : deux demandes (meme concurrentes) = UN appel par ressource', async () => {
    const adapter = new TabularAdapter();
    mockFetch.mockResolvedValue({ ok: true, json: async () => PROFIL });

    const [a, b] = await Promise.all([
      adapter.fetchProfile({ resource: 'res-1' }),
      adapter.fetchProfile({ resource: 'res-1' }),
    ]);
    const c = await adapter.fetchProfile({ resource: 'res-1' });
    await adapter.fetchProfile({ resource: 'res-2' });

    expect(a).toBe(b);
    expect(c).toBe(a);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('passe par le proxy et porte les en-tetes', async () => {
    const adapter = new TabularAdapter();
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => PROFIL });

    await adapter.fetchProfile({
      resource: 'res-1',
      proxyUrl: 'https://proxy.example.gouv.fr',
      headers: { 'X-Test': '1' },
    });

    const [u, init] = mockFetch.mock.calls[0];
    expect(String(u)).toContain('proxy.example.gouv.fr');
    expect(String(u)).toContain('/api/resources/res-1/profile/');
    expect((init as RequestInit).headers).toEqual({ 'X-Test': '1' });
  });

  it('un echec n’est pas memorise : la demande suivante reessaie', async () => {
    const adapter = new TabularAdapter();
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' })
      .mockResolvedValueOnce({ ok: true, json: async () => PROFIL });

    await expect(adapter.fetchProfile({ resource: 'res-1' })).rejects.toThrow('HTTP 404');
    const profil = await adapter.fetchProfile({ resource: 'res-1' });

    expect(profil.categorical).toEqual(['Code sexe']);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('annulation : seul le demandeur annule est rejete tant qu’un autre attend', async () => {
    const adapter = new TabularAdapter();
    let resoudre: (v: unknown) => void = () => {};
    mockFetch.mockReturnValueOnce(
      new Promise((r) => {
        resoudre = r;
      })
    );

    const ctrl = new AbortController();
    const annule = adapter.fetchProfile({ resource: 'res-1' }, ctrl.signal);
    const patient = adapter.fetchProfile({ resource: 'res-1' });
    ctrl.abort();

    await expect(annule).rejects.toMatchObject({ name: 'AbortError' });
    expect((mockFetch.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(false);

    resoudre({ ok: true, json: async () => PROFIL });
    await expect(patient).resolves.toMatchObject({ total_lines: 1234 });
  });

  it('annulation du dernier demandeur : requete annulee, rien de memorise', async () => {
    const adapter = new TabularAdapter();
    mockFetch.mockImplementationOnce(
      (_u: string, init: RequestInit) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener('abort', () => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          });
        })
    );
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => PROFIL });

    const ctrl = new AbortController();
    const p = adapter.fetchProfile({ resource: 'res-1' }, ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect((mockFetch.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);

    await expect(adapter.fetchProfile({ resource: 'res-1' })).resolves.toMatchObject({
      total_lines: 1234,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('signal deja annule : rejet immediat, aucun appel', async () => {
    const adapter = new TabularAdapter();
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(adapter.fetchProfile({ resource: 'res-1' }, ctrl.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetchAll n’appelle jamais /profile/', async () => {
    const adapter = new TabularAdapter();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ a: 1 }], meta: { total: 1 }, links: {} }),
    });
    await adapter.fetchAll(makeParams({ select: 'a' }), new AbortController().signal);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).not.toContain('/profile/');
  });
});
