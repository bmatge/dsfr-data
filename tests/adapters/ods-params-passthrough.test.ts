import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #726 — `params` vit en mode adaptateur.
 *
 * Un jeu Opendatasoft a dates est lu dans le fuseau du portail : sans
 * `timezone`, six dates du jeu « prix des carburants » sortent decalees de
 * deux heures. Avant ce passe-plat, la seule facon de poser ce parametre
 * etait de rester en mode URL — donc de renoncer a `fetch-mode="export"`.
 *
 * Le point d'injection est unique : `_applyOdsqlClauses` sert `/records` et
 * `/exports/json` ; `buildServerSideUrl` pose les memes parametres pour son
 * propre compte. Les cles que la bibliotheque construit elle-meme sont
 * refusees en amont, dans `dsfr-data-source`.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import type { AdapterParams, ServerSideOverlay } from '@/adapters/api-adapter.js';
import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { clearDataCache, clearDataMeta } from '@/utils/data-bridge.js';

/** Vue interne du composant (membres prives exerces par les tests) */
interface SourceInternals {
  _buildUrl(): string;
  _cacheFingerprint(): unknown;
  _fetchViaAdapter(): Promise<void>;
}

function internals(source: DsfrDataSource): SourceInternals {
  return source as unknown as SourceInternals;
}

function makeParams(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: 'https://data.economie.gouv.fr',
    datasetId: 'prix-des-carburants-en-france-flux-instantane-v2',
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

function makeSource(): DsfrDataSource {
  const source = new DsfrDataSource();
  source.id = 'carburants';
  source.apiType = 'opendatasoft';
  source.baseUrl = 'https://data.economie.gouv.fr';
  source.datasetId = 'prix-des-carburants-en-france-flux-instantane-v2';
  return source;
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

/** Reponse d'export : tableau nu de `n` lignes */
function mockExport(rows: number) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(Array.from({ length: rows }, (_, i) => ({ id: i }))),
  });
}

function calledUrl(n = 0): string {
  return mockFetch.mock.calls[n][0] as string;
}

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockFetch.mockReset();
  clearDataCache('carburants');
  clearDataMeta('carburants');
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('#726 — AC : params est transmis en mode adaptateur', () => {
  it('getAdapterParams porte les paires de params dans extraParams', () => {
    const source = makeSource();
    source.params = '{"timezone":"Europe/Paris"}';

    expect(source.getAdapterParams().extraParams).toEqual({ timezone: 'Europe/Paris' });
  });

  it('params absent laisse extraParams indefini', () => {
    expect(makeSource().getAdapterParams().extraParams).toBeUndefined();
  });

  it('les valeurs non textuelles sont serialisees, null et undefined ecartes', () => {
    const source = makeSource();
    source.params = '{"pretty":true,"rows":10,"lang":null}';

    expect(source.getAdapterParams().extraParams).toEqual({ pretty: 'true', rows: '10' });
  });

  it('buildUrl (mode records) porte timezone', () => {
    const url = new URL(
      new OpenDataSoftAdapter().buildUrl(
        makeParams({ extraParams: { timezone: 'Europe/Paris' } }),
        100
      )
    );

    expect(url.pathname).toMatch(/\/records$/);
    expect(url.searchParams.get('timezone')).toBe('Europe/Paris');
    expect(url.searchParams.get('limit')).toBe('100');
  });

  it('buildExportUrl (mode export) porte timezone', () => {
    const url = new URL(
      new OpenDataSoftAdapter().buildExportUrl(
        makeParams({ fetchMode: 'export', extraParams: { timezone: 'Europe/Paris' } }),
        1001
      )
    );

    expect(url.pathname).toMatch(/\/exports\/json$/);
    expect(url.searchParams.get('timezone')).toBe('Europe/Paris');
  });

  it('buildServerSideUrl porte timezone (pagination serveur)', () => {
    const overlay: ServerSideOverlay = { page: 2, effectiveWhere: '', orderBy: '' };
    const url = new URL(
      new OpenDataSoftAdapter().buildServerSideUrl(
        makeParams({ extraParams: { timezone: 'Europe/Paris' } }),
        overlay
      )
    );

    expect(url.searchParams.get('timezone')).toBe('Europe/Paris');
    expect(url.searchParams.get('offset')).toBe('20');
  });

  it('le passe-plat cohabite avec les clauses construites par la bibliotheque', () => {
    const url = new URL(
      new OpenDataSoftAdapter().buildUrl(
        makeParams({
          where: 'prix_valeur > 1.5',
          groupBy: 'departement',
          orderBy: 'prix_valeur:desc',
          select: 'count(*) as nb, departement',
          extraParams: { timezone: 'Europe/Paris' },
        })
      )
    );

    expect(url.searchParams.get('timezone')).toBe('Europe/Paris');
    expect(url.searchParams.get('where')).toBe('prix_valeur > 1.5');
    expect(url.searchParams.get('group_by')).toBe('departement');
    expect(url.searchParams.get('order_by')).toBe('prix_valeur DESC');
    expect(url.searchParams.get('select')).toBe('count(*) as nb, departement');
  });

  it('une clause construite gagne toujours sur un passe-plat homonyme', () => {
    // Defense en profondeur : la liste noire de la source ecarte deja `where`,
    // un appel direct a l'adaptateur ne doit pas pouvoir l'ecraser non plus.
    const url = new URL(
      new OpenDataSoftAdapter().buildUrl(
        makeParams({
          where: 'prix_valeur > 1.5',
          extraParams: { where: 'tout' } as Record<string, string>,
        })
      )
    );

    expect(url.searchParams.get('where')).toBe('prix_valeur > 1.5');
  });

  it('fetchAll en mode records appelle une URL portant timezone', async () => {
    mockRecordsPage(50, 50);

    await new OpenDataSoftAdapter().fetchAll(
      makeParams({ limit: 50, extraParams: { timezone: 'Europe/Paris' } }),
      new AbortController().signal
    );

    expect(new URL(calledUrl()).searchParams.get('timezone')).toBe('Europe/Paris');
  });

  it('fetchAll en mode export appelle une URL portant timezone', async () => {
    mockExport(120);

    await new OpenDataSoftAdapter().fetchAll(
      makeParams({ fetchMode: 'export', extraParams: { timezone: 'Europe/Paris' } }),
      new AbortController().signal
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = new URL(calledUrl());
    expect(url.pathname).toMatch(/\/exports\/json$/);
    expect(url.searchParams.get('timezone')).toBe('Europe/Paris');
  });

  it('bout en bout : la source charge le jeu en mode export avec timezone', async () => {
    const source = makeSource();
    source.fetchMode = 'export';
    source.params = '{"timezone":"Europe/Paris"}';
    mockExport(42);

    await internals(source)._fetchViaAdapter();

    const url = new URL(calledUrl());
    expect(url.pathname).toMatch(/\/exports\/json$/);
    expect(url.searchParams.get('timezone')).toBe('Europe/Paris');
    expect(source.getAttribute('data-dsfr-config-error')).toBeNull();
  });
});

describe('#726 — AC : une cle reservee est refusee, pas ecrasee en silence', () => {
  it('la cle reservee est retiree du passe-plat', () => {
    const source = makeSource();
    source.params = '{"where":"tout","timezone":"Europe/Paris"}';

    expect(source.getAdapterParams().extraParams).toEqual({ timezone: 'Europe/Paris' });
  });

  it('la cle reservee produit une erreur de configuration nommant la cle', async () => {
    const source = makeSource();
    source.params = '{"limit":"9999"}';
    mockRecordsPage(10, 10);

    await internals(source)._fetchViaAdapter();

    const message = source.getAttribute('data-dsfr-config-error');
    expect(message).toContain('"limit"');
    expect(message).toContain('réservée');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('plusieurs cles reservees sont toutes nommees', async () => {
    const source = makeSource();
    source.params = '{"select":"x","order_by":"y"}';
    mockRecordsPage(10, 10);

    await internals(source)._fetchViaAdapter();

    const message = source.getAttribute('data-dsfr-config-error') || '';
    expect(message).toContain('"select"');
    expect(message).toContain('"order_by"');
  });

  it('la liste noire couvre toutes les cles construites par la bibliotheque', () => {
    const source = makeSource();
    source.params = JSON.stringify({
      select: '1',
      where: '1',
      group_by: '1',
      order_by: '1',
      limit: '1',
      offset: '1',
      facet: '1',
      timezone: 'Europe/Paris',
    });

    expect(source.getAdapterParams().extraParams).toEqual({ timezone: 'Europe/Paris' });
  });

  it('le chargement continue malgre la cle refusee', async () => {
    const source = makeSource();
    source.params = '{"where":"tout","timezone":"Europe/Paris"}';
    mockRecordsPage(10, 10);

    await internals(source)._fetchViaAdapter();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = new URL(calledUrl());
    expect(url.searchParams.get('timezone')).toBe('Europe/Paris');
    expect(url.searchParams.get('where')).toBeNull();
  });

  it("un params qui n'est pas un objet JSON produit un message", async () => {
    const source = makeSource();
    source.params = 'pas-du-json';
    mockRecordsPage(10, 10);

    await internals(source)._fetchViaAdapter();

    expect(source.getAttribute('data-dsfr-config-error')).toContain('"params"');
    expect(source.getAdapterParams().extraParams).toBeUndefined();
  });

  it('un tableau JSON est refuse comme params', () => {
    const source = makeSource();
    source.params = '[1,2]';

    expect(source.getAdapterParams().extraParams).toBeUndefined();
  });
});

describe('#726 — non-regression : mode URL et empreinte de cache', () => {
  it('le mode URL continue de poser params en query string, cles reservees comprises', () => {
    const source = new DsfrDataSource();
    source.id = 'url-src';
    source.url = 'https://api.example.com/data';
    source.method = 'GET';
    source.params = '{"where":"tout","limit":"10","timezone":"Europe/Paris"}';

    const url = new URL(internals(source)._buildUrl());
    expect(url.searchParams.get('where')).toBe('tout');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('timezone')).toBe('Europe/Paris');
  });

  it('le mode URL POST garde params dans le corps de la requete', () => {
    const source = new DsfrDataSource();
    source.id = 'url-src';
    source.url = 'https://api.example.com/data';
    source.method = 'POST';
    source.params = '{"where":"tout"}';

    const url = new URL(internals(source)._buildUrl());
    expect(url.searchParams.get('where')).toBeNull();
  });

  it("l'empreinte de cache distingue deux valeurs de params", () => {
    const a = makeSource();
    a.params = '{"timezone":"Europe/Paris"}';
    const b = makeSource();
    b.params = '{"timezone":"UTC"}';

    expect(JSON.stringify(internals(a)._cacheFingerprint())).not.toBe(
      JSON.stringify(internals(b)._cacheFingerprint())
    );
  });

  it("l'empreinte de cache est stable a params egal", () => {
    const a = makeSource();
    a.params = '{"timezone":"Europe/Paris"}';
    const b = makeSource();
    b.params = '{"timezone":"Europe/Paris"}';

    expect(JSON.stringify(internals(a)._cacheFingerprint())).toBe(
      JSON.stringify(internals(b)._cacheFingerprint())
    );
  });
});
