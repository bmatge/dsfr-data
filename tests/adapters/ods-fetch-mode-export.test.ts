import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #689 (ADR-106) — `fetch-mode="export"` sur l'adaptateur ODS.
 *
 * `/exports/json` rend le jeu entier en une requete, avec les memes clauses
 * ODSQL que `/records`, mais sous forme de **tableau nu** : plus de
 * `total_count`, donc la garde `max-records` (#233) et le signal `truncated`
 * (#658) reposent sur un `limit = plafond + 1`.
 *
 * Contrat verifie en direct sur data.economie.gouv.fr le 2026-09-10 :
 * `?limit=2&select=count(*) as nb&group_by=source` renvoie
 * `[{"source": null, "nb": 399}, ...]` en HTTP 200 ; `where`, `order_by` et
 * `offset` sont honores ; une clause invalide renvoie 400 (ODSQLError) et un
 * jeu inconnu 404 (NotFoundURI).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import type { AdapterParams } from '@/adapters/api-adapter.js';
import { DsfrDataSource } from '@/components/dsfr-data-source.js';

function makeParams(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: 'https://data.example.com',
    datasetId: 'communes-france',
    resource: '',
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

/** Reponse d'export : tableau nu de `n` lignes */
function mockExport(rows: number) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(Array.from({ length: rows }, (_, i) => ({ id: i }))),
  });
}

/** Reponse `/records` : enveloppe `{ results, total_count }` */
function mockRecordsPage(rows: number, totalCount: number) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        results: Array.from({ length: rows }, (_, i) => ({ id: i })),
        total_count: totalCount,
      }),
  });
}

/** URL passee au n-ieme appel de fetch */
function calledUrl(n = 0): string {
  return mockFetch.mock.calls[n][0] as string;
}

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockFetch.mockReset();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('#689 — AC : une seule requete sur /exports/json', () => {
  it('charge un jeu complet en un appel, sans pagination', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockExport(742);

    const result = await adapter.fetchAll(
      makeParams({ fetchMode: 'export' }),
      new AbortController().signal
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.data).toHaveLength(742);
    // Tableau nu : le total serveur est inconnu, jamais une sentinelle (#270)
    expect(result.totalCount).toBeUndefined();
    expect(result.truncated).toBeUndefined();
    expect(result.needsClientProcessing).toBe(false);

    const url = new URL(calledUrl());
    expect(url.pathname).toBe('/api/explore/v2.1/catalog/datasets/communes-france/exports/json');
    // plafond par defaut (1 000) + 1 : la ligne de trop revele la troncature
    expect(url.searchParams.get('limit')).toBe('1001');
  });

  it('le defaut reste records : aucun appel a /exports/json sans l’attribut', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockRecordsPage(40, 40);

    await adapter.fetchAll(makeParams(), new AbortController().signal);

    expect(calledUrl()).toContain('/records');
    expect(calledUrl()).not.toContain('/exports/');
  });

  it('limit explicite : le plafond descend au limit demande', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockExport(50);

    await adapter.fetchAll(
      makeParams({ fetchMode: 'export', limit: 50 }),
      new AbortController().signal
    );

    expect(new URL(calledUrl()).searchParams.get('limit')).toBe('51');
  });

  it('max-records releve : le plafond suit l’attribut', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockExport(3000);

    const result = await adapter.fetchAll(
      makeParams({ fetchMode: 'export', maxRecords: 5000 }),
      new AbortController().signal
    );

    expect(new URL(calledUrl()).searchParams.get('limit')).toBe('5001');
    expect(result.data).toHaveLength(3000);
    expect(result.truncated).toBeUndefined();
  });
});

describe('#689 — AC : troncature via limit + 1', () => {
  it('plafond + 1 lignes recues : tronque, truncated et warn nommant max-records', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockExport(1001);

    const result = await adapter.fetchAll(
      makeParams({ fetchMode: 'export' }),
      new AbortController().signal
    );

    expect(result.data).toHaveLength(1000);
    expect(result.truncated).toBe(true);
    expect(result.totalCount).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('export JSON tronque a 1000 lignes')
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('communes-france'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('max-records'));
  });

  it('pile le plafond : pas de troncature signalee', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockExport(1000);

    const result = await adapter.fetchAll(
      makeParams({ fetchMode: 'export' }),
      new AbortController().signal
    );

    expect(result.data).toHaveLength(1000);
    expect(result.truncated).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('#689 — group_by : tous les groupes en un appel', () => {
  it('235 groupes sans pagination, la ou /records en lisait 100 (#641)', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve(Array.from({ length: 235 }, (_, i) => ({ source: `s${i}`, nb: i }))),
    });

    const result = await adapter.fetchAll(
      makeParams({
        fetchMode: 'export',
        groupBy: 'source',
        aggregate: 'count',
      }),
      new AbortController().signal
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.data).toHaveLength(235);
    expect(result.totalCount).toBeUndefined();
    expect(result.truncated).toBeUndefined();
  });
});

describe('#689 — AC : clauses identiques entre records et export', () => {
  const clauses = makeParams({
    where: 'population > 5000 AND libelle = "Aa\\"b"',
    groupBy: 'year(date) as annee, `Date - Journee gaziere`',
    orderBy: 'total:desc, annee:asc',
    select: 'count(*) as total, annee',
  });

  it('select, where, group_by echappe et order_by sont construits a l’identique', () => {
    const adapter = new OpenDataSoftAdapter();
    const records = new URL(adapter.buildUrl(clauses));
    const exportUrl = new URL(adapter.buildExportUrl(clauses, 1001));

    for (const clause of ['select', 'where', 'group_by', 'order_by']) {
      expect(exportUrl.searchParams.get(clause)).toBe(records.searchParams.get(clause));
    }
    // L'expression #641 passe telle quelle, le nom a espaces reste backquote
    expect(exportUrl.searchParams.get('group_by')).toBe(
      'year(date) as annee,`Date - Journee gaziere`'
    );
    expect(exportUrl.searchParams.get('order_by')).toBe('total DESC, annee ASC');
    expect(exportUrl.pathname.endsWith('/exports/json')).toBe(true);
    expect(records.pathname.endsWith('/records')).toBe(true);
  });

  it('l’agregat derive le meme select des deux cotes', () => {
    const adapter = new OpenDataSoftAdapter();
    const params = makeParams({ groupBy: 'region', aggregate: 'population:sum' });
    expect(new URL(adapter.buildExportUrl(params)).searchParams.get('select')).toBe(
      new URL(adapter.buildUrl(params)).searchParams.get('select')
    );
  });
});

describe('#689 — AC : repli sur /records quand l’export echoue', () => {
  it('404 : un warn, un seul appel a /records, puis plus aucune tentative d’export', async () => {
    const adapter = new OpenDataSoftAdapter();
    // 1er reload : export 404 puis repli /records
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });
    mockRecordsPage(30, 30);

    const first = await adapter.fetchAll(
      makeParams({ fetchMode: 'export' }),
      new AbortController().signal
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(calledUrl(0)).toContain('/exports/json');
    expect(calledUrl(1)).toContain('/records');
    expect(first.data).toHaveLength(30);
    expect(first.totalCount).toBe(30);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('export JSON indisponible'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('HTTP 404'));

    // 2e reload : le repli est memorise, l'export n'est plus retente
    mockFetch.mockClear();
    mockRecordsPage(30, 30);

    await adapter.fetchAll(makeParams({ fetchMode: 'export' }), new AbortController().signal);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(calledUrl(0)).toContain('/records');
  });

  it('400 de clause : meme repli', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, statusText: 'Bad Request' });
    mockRecordsPage(10, 10);

    const result = await adapter.fetchAll(
      makeParams({ fetchMode: 'export', groupBy: 'champ_inconnu' }),
      new AbortController().signal
    );

    expect(result.data).toHaveLength(10);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('HTTP 400'));
  });

  it('erreur reseau : pas de repli, l’erreur remonte comme aujourd’hui', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(
      adapter.fetchAll(makeParams({ fetchMode: 'export' }), new AbortController().signal)
    ).rejects.toThrow('Failed to fetch');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('le repli est memorise par jeu, pas globalement', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });
    mockRecordsPage(5, 5);
    await adapter.fetchAll(makeParams({ fetchMode: 'export' }), new AbortController().signal);

    mockFetch.mockClear();
    mockExport(7);
    await adapter.fetchAll(
      makeParams({ fetchMode: 'export', datasetId: 'autre-jeu' }),
      new AbortController().signal
    );

    expect(calledUrl(0)).toContain('/autre-jeu/exports/json');
  });
});

describe('#689 — AC : proxy et auth identiques a /records', () => {
  const PROXY = 'https://proxy.example.fr';
  // Hote reecrit par le proxy (#340) : artificiel pour un portail ODS, mais
  // c'est le seul moyen de prouver que l'export emprunte bien getProxiedUrl —
  // la reecriture se fait par HOTE, jamais par chemin, donc `/exports/json`
  // traverse exactement comme `/records`.
  const HOTE_REECRIT = 'https://tabular-api.data.gouv.fr';

  it('proxy-url : l’export est reecrit comme /records, chemin d’export preserve', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockExport(3);
    await adapter.fetchAll(
      makeParams({ fetchMode: 'export', baseUrl: HOTE_REECRIT, proxyUrl: PROXY }),
      new AbortController().signal
    );
    const urlExport = new URL(calledUrl(0));

    mockFetch.mockClear();
    mockRecordsPage(3, 3);
    await adapter.fetchAll(
      makeParams({ baseUrl: HOTE_REECRIT, proxyUrl: PROXY }),
      new AbortController().signal
    );
    const urlRecords = new URL(calledUrl(0));

    expect(urlExport.origin).toBe(PROXY);
    expect(urlExport.origin).toBe(urlRecords.origin);
    expect(urlExport.pathname).toBe(
      '/tabular-proxy/api/explore/v2.1/catalog/datasets/communes-france/exports/json'
    );
    expect(urlRecords.pathname).toBe(
      '/tabular-proxy/api/explore/v2.1/catalog/datasets/communes-france/records'
    );
  });

  it('hote ODS ordinaire : appel direct dans les deux modes', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockExport(3);
    await adapter.fetchAll(
      makeParams({ fetchMode: 'export', proxyUrl: PROXY }),
      new AbortController().signal
    );
    expect(new URL(calledUrl(0)).origin).toBe('https://data.example.com');
  });

  it('#655 : `apikey` est normalise en `Authorization: Apikey` sur l’export', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockExport(1);

    await adapter.fetchAll(
      makeParams({ fetchMode: 'export', headers: { apikey: 'K' } }),
      new AbortController().signal
    );

    const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers).toEqual({ Authorization: 'Apikey K' });
  });

  it('le signal d’abandon est transmis a l’export', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockExport(1);
    const controller = new AbortController();

    await adapter.fetchAll(makeParams({ fetchMode: 'export' }), controller.signal);

    expect((mockFetch.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
  });
});

describe('#689 — AC : server-side ignore fetch-mode', () => {
  function makeSource(): DsfrDataSource {
    const source = new DsfrDataSource();
    source.id = 'export-src';
    source.apiType = 'opendatasoft';
    source.baseUrl = 'https://data.example.com';
    source.datasetId = 'communes-france';
    return source;
  }

  it('getAdapterParams : fetch-mode="export" + server-side retombe sur records', () => {
    const source = makeSource();
    source.fetchMode = 'export';
    source.serverSide = true;

    expect(source.getAdapterParams().fetchMode).toBe('records');
  });

  it('getAdapterParams : fetch-mode="export" seul est transmis', () => {
    const source = makeSource();
    source.fetchMode = 'export';

    expect(source.getAdapterParams().fetchMode).toBe('export');
  });

  it('defaut : fetchMode vaut records', () => {
    expect(makeSource().getAdapterParams().fetchMode).toBe('records');
  });

  it('la contradiction est signalee (avertissement de configuration, non bloquant)', async () => {
    const source = makeSource();
    source.fetchMode = 'export';
    source.serverSide = true;
    source.pageSize = 20;
    mockRecordsPage(20, 200);

    interface VueInterne {
      _fetchViaAdapter(): Promise<void>;
    }
    await (source as unknown as VueInterne)._fetchViaAdapter();

    expect(source.getAttribute('data-dsfr-config-error')).toContain('fetch-mode="export"');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('server-side'));
    // Le chargement continue, sur l'endpoint pagine
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(calledUrl(0)).toContain('/records');
    expect(calledUrl(0)).not.toContain('/exports/');
  });

  it('fetchPage reste sur /records meme avec fetchMode export dans les params', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockRecordsPage(20, 200);

    await adapter.fetchPage(
      makeParams({ fetchMode: 'export', pageSize: 20 }),
      { page: 2, effectiveWhere: '', orderBy: '' },
      new AbortController().signal
    );

    expect(calledUrl(0)).toContain('/records');
    expect(calledUrl(0)).not.toContain('/exports/');
  });

  it('fetchFacets reste sur /facets', async () => {
    const adapter = new OpenDataSoftAdapter();
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ facets: [] }) });

    await adapter.fetchFacets!(
      { baseUrl: 'https://data.example.com', datasetId: 'communes-france' },
      ['region'],
      ''
    );

    expect(calledUrl(0)).toContain('/facets');
  });
});
