import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #852 — la pagination serveur de l'adaptateur Tabular delegue comme le
 * fetch complet.
 *
 * `buildServerSideUrl` n'emettait ni `champ__groupby` ni `champ__sum`
 * (contrairement a `buildUrl`), alors que la query, voyant
 * `capabilities.serverGroupBy`, marque la delegation et SAUTE son calcul
 * client : la page rendait 40 lignes BRUTES comme si c'etaient 8 groupes, et
 * la colonne d'agregat, absente de la reponse, s'affichait « — ». Chiffre faux
 * et plausible (#301), pas une erreur.
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
    pageSize: 40,
    ...overrides,
  };
}

function overlay(overrides: Partial<ServerSideOverlay> = {}): ServerSideOverlay {
  return { page: 1, effectiveWhere: '', orderBy: '', ...overrides };
}

/** Query string brute (`appendBareFlags` emet des flags sans `=`). */
function query(url: string): string {
  const i = url.indexOf('?');
  return i === -1 ? '' : url.slice(i);
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockFetch.mockReset();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('#852 — Tabular : la pagination serveur delegue comme le fetch complet', () => {
  const adapter = new TabularAdapter();

  it('emet `champ__groupby` et `champ__sum` en server-side', () => {
    const params = tabularParams({
      groupBy: 'academie',
      aggregate: 'population:sum',
    });

    const url = adapter.buildServerSideUrl(params, overlay({ orderBy: 'population__sum:desc' }));

    // Flags NUS : l'API rejette la forme valuee `academie__groupby=` (#596)
    expect(query(url)).toContain('academie__groupby');
    expect(query(url)).not.toContain('academie__groupby=');
    expect(query(url)).toContain('population__sum');
    expect(new URLSearchParams(query(url)).get('population__sum__sort')).toBe('desc');
    expect(new URLSearchParams(query(url)).get('page_size')).toBe('40');
    expect(new URLSearchParams(query(url)).get('page')).toBe('1');
  });

  it('emet les MEMES parametres delegues que buildUrl (filtres compris)', () => {
    const params = tabularParams({
      where: 'pays_iso2:eq:FR',
      groupBy: 'code_reg',
      aggregate: 'population:sum',
      orderBy: 'population__sum:desc',
    });

    const complet = query(adapter.buildUrl(params, 40, 1));
    const pagine = query(adapter.buildServerSideUrl(params, overlay({ orderBy: params.orderBy })));

    for (const attendu of [
      'pays_iso2__exact=FR',
      'code_reg__groupby',
      'population__sum',
      'population__sum__sort=desc',
    ]) {
      expect(complet).toContain(attendu);
      expect(pagine).toContain(attendu);
    }
  });

  it('fetchPage annonce des données deja traitees quand la delegation a eu lieu', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ academie: 'Paris', population__sum: 2_100_000 }],
          meta: { total: 8 },
        }),
    });

    const result = await adapter.fetchPage(
      tabularParams({ groupBy: 'academie', aggregate: 'population:sum' }),
      overlay(),
      new AbortController().signal
    );

    expect(result.needsClientProcessing).toBe(false);
    expect(result.totalCount).toBe(8);
  });

  it('champ non delegable : rien n’est emis, et fetchPage rend la main au client', async () => {
    const params = tabularParams({
      groupBy: 'Date - Journee gaziere',
      aggregate: 'population:sum',
    });

    expect(query(adapter.buildServerSideUrl(params, overlay()))).not.toContain('groupby');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ population: 1 }], meta: { total: 40 } }),
    });
    const result = await adapter.fetchPage(params, overlay(), new AbortController().signal);

    // Lignes BRUTES : l'aval doit regrouper lui-meme, jamais les prendre
    // pour des groupes (#852)
    expect(result.needsClientProcessing).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('sans group-by ni aggregate, une page reste une page (rien a retraiter)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ academie: 'Paris' }], meta: { total: 137 } }),
    });

    const result = await adapter.fetchPage(
      tabularParams(),
      overlay(),
      new AbortController().signal
    );

    expect(result.needsClientProcessing).toBe(false);
  });
});
