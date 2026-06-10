import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests traversants #288 (EPIC D) — cohérence mode URL / mode adapter de
 * dsfr-data-source.
 *
 * Bugs d'origine :
 * - mode URL : les commandes where/orderBy étaient acceptées, stockées,
 *   déclenchaient un refetch… à URL identique (_buildUrl ne lit ni
 *   getEffectiveWhere() ni l'overlay) → filtre silencieusement perdu ;
 * - changements d'attributs non câblés au refetch : page-size, server-side,
 *   headers, method, use-proxy (alors qu'api-key-ref, même rôle que headers,
 *   refetchait) ;
 * - api-type="generic" + base-url activait le mode adapter dont fetchAll
 *   THROW systématiquement, validate() retournant null au lieu de signaler ;
 * - isLoading() mentait pendant un abort de fetch concurrent (le finally du
 *   fetch annulé remettait _loading = false).
 *
 * Contrat fixé :
 * - le mode URL REFUSE explicitement les commandes adapter (warning), les
 *   commandes page restent servies (pagination querystring documentée) ;
 * - watch-list complète ; generic+base-url → erreur de config propre ;
 * - jeton de génération : seul le fetch courant pilote _loading.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchSourceCommand,
  subscribeToSource,
} from '@/utils/data-bridge.js';

describe('#288 — mode URL : commandes adapter refusées explicitement', () => {
  let source: DsfrDataSource;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearDataCache('d4-url');
    clearDataMeta('d4-url');
    source = new DsfrDataSource();
    source.id = 'd4-url';
    source.url = 'https://api.example.com/data';
    source.paginate = true;
    mockFetch.mockReset();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    (source as any)._cleanup();
    warnSpy.mockRestore();
  });

  it('AC : une commande where (search) sur une source mode URL est refusée avec warning, sans refetch', () => {
    (source as any)._setupCommandListener();
    const fetchSpy = vi.spyOn(source as any, '_scheduleFetch').mockImplementation(() => {});

    dispatchSourceCommand('d4-url', { where: 'search("test")', whereKey: 'search-1' });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect((source as any)._whereOverlays.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('mode URL'));

    fetchSpy.mockRestore();
  });

  it('le warning est émis une seule fois (pas de spam à chaque frappe)', () => {
    (source as any)._setupCommandListener();
    const fetchSpy = vi.spyOn(source as any, '_scheduleFetch').mockImplementation(() => {});

    dispatchSourceCommand('d4-url', { where: 'a', whereKey: 'k' });
    dispatchSourceCommand('d4-url', { orderBy: 'x:asc' });
    dispatchSourceCommand('d4-url', { groupBy: 'g' });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('les commandes page restent servies en mode URL (pagination querystring)', () => {
    (source as any)._setupCommandListener();
    const fetchSpy = vi.spyOn(source as any, '_scheduleFetch').mockImplementation(() => {});

    dispatchSourceCommand('d4-url', { page: 3 });

    expect((source as any)._currentPage).toBe(3);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('en mode adapter, les commandes where fonctionnent comme avant', () => {
    const adapterSource = new DsfrDataSource();
    adapterSource.id = 'd4-adapter';
    adapterSource.apiType = 'opendatasoft';
    (adapterSource as any)._setupCommandListener();
    const fetchSpy = vi.spyOn(adapterSource as any, '_scheduleFetch').mockImplementation(() => {});

    dispatchSourceCommand('d4-adapter', { where: 'region = "IDF"', whereKey: 'facets-1' });

    expect((adapterSource as any)._whereOverlays.size).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
    (adapterSource as any)._cleanup();
    clearDataCache('d4-adapter');
  });
});

describe('#288 — watch-list complète des attributs déclenchant un refetch', () => {
  let source: DsfrDataSource;

  beforeEach(() => {
    source = new DsfrDataSource();
    source.id = 'd4-watch';
    source.url = 'https://api.example.com/data';
  });

  afterEach(() => {
    (source as any)._cleanup();
    clearDataCache('d4-watch');
  });

  for (const prop of ['pageSize', 'serverSide', 'headers', 'method', 'useProxy'] as const) {
    it(`AC : changer ${prop} refetche`, () => {
      const fetchSpy = vi.spyOn(source as any, '_scheduleFetch').mockImplementation(() => {});

      source.willUpdate(new Map([[prop, undefined]]));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      fetchSpy.mockRestore();
    });
  }
});

describe('#288 — generic + base-url : erreur de config propre (plus de throw)', () => {
  it('validate() de GenericAdapter signale le piège', async () => {
    const source = new DsfrDataSource();
    source.id = 'd4-generic';
    source.apiType = 'generic';
    source.baseUrl = 'https://api.example.com';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const errors: Error[] = [];
    const unsub = subscribeToSource('d4-generic', { onError: (e: Error) => errors.push(e) });

    // Avant : fetchAll de GenericAdapter THROW systématiquement (validate
    // retournait null) — unhandled rejection via le setTimeout de _scheduleFetch
    await (source as any)._fetchViaAdapter();

    expect(source.hasAttribute('data-dsfr-config-error')).toBe(true);
    expect(source.getAttribute('data-dsfr-config-error')).toMatch(/url|api-type/);
    expect(errors).toHaveLength(1);

    unsub();
    errorSpy.mockRestore();
    (source as any)._cleanup();
    clearDataCache('d4-generic');
  });
});

describe('#288 — isLoading() ne ment plus pendant un abort concurrent', () => {
  it('le finally du fetch annulé ne touche pas le loading du fetch courant', async () => {
    clearDataCache('d4-loading');
    const source = new DsfrDataSource();
    source.id = 'd4-loading';
    source.url = 'https://api.example.com/data';

    // Fetch 1 : rejettera en AbortError quand le fetch 2 l'aura remplacé
    let rejectFirst!: (e: Error) => void;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirst = reject;
        })
    );
    const p1 = (source as any)._fetchViaUrl();
    expect(source.isLoading()).toBe(true);

    // Fetch 2 : reste en vol
    mockFetch.mockImplementationOnce(() => new Promise(() => {}));
    void (source as any)._fetchViaUrl();
    expect(source.isLoading()).toBe(true);

    // L'abort du fetch 1 se matérialise — son finally ne doit PAS éteindre
    // le loading du fetch 2 (toujours en vol)
    rejectFirst(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await p1;

    expect(source.isLoading()).toBe(true);

    (source as any)._cleanup();
    clearDataCache('d4-loading');
  });
});
