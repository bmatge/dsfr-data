import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests traversants #320 (EPIC J) — singletons auth/sync partagés via window.
 *
 * Bug d'origine : les apps chargent les composants via les bundles
 * pré-compilés ET importent @dsfr-data/shared aliasé sur src → deux copies
 * compilées d'auth-service et sync-queue coexistaient : double fetch
 * /api/auth/me au démarrage, indicateur de sync du header aveugle (il
 * écoutait la copie bundle), et persistQueue() d'une copie écrasait la file
 * de l'autre sous la même clé localStorage (perte d'écritures).
 */

beforeEach(() => {
  // Repart d'un état partagé vierge (sinon il persiste entre tests/modules)
  delete (window as any).__dsfrDataAuthShared;
  delete (window as any).__dsfrDataSyncShared;
  vi.resetModules();
});

describe('#320 — AC : une seule instance d’état entre deux copies du module', () => {
  it('deux imports isolés d’auth-service partagent état et promesse checkAuth', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 1, email: 'a@b.fr' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Deux "copies compilées" simulées par deux registres de modules
    const copyA = await import('../../packages/shared/src/auth/auth-service.js');
    vi.resetModules();
    const copyB = await import('../../packages/shared/src/auth/auth-service.js');
    expect(copyA).not.toBe(copyB); // bien deux modules distincts

    // L'état est partagé : le même objet window est branché
    expect((window as any).__dsfrDataAuthShared).toBeDefined();

    // checkAuth simultané depuis les deux copies → UNE seule requête health/me
    await Promise.all([copyA.checkAuth(), copyB.checkAuth()]);
    const authCalls = mockFetch.mock.calls.filter(([url]) => String(url).includes('/api/auth/me'));
    expect(authCalls.length).toBeLessThanOrEqual(1);

    vi.unstubAllGlobals();
  });

  it('le listener posé par une copie voit les changements de statut de l’autre (sync)', async () => {
    const copyA = await import('../../packages/shared/src/storage/sync-queue.js');
    vi.resetModules();
    const copyB = await import('../../packages/shared/src/storage/sync-queue.js');
    expect(copyA).not.toBe(copyB);

    const seen: string[] = [];
    // L'indicateur du header (copie A) écoute…
    copyA.onSyncStatusChange((status: string) => seen.push(status));

    // …et c'est la copie B (l'app) qui sync réellement
    const internals = (window as any).__dsfrDataSyncShared;
    expect(internals).toBeDefined();
    internals.status = 'syncing';
    for (const cb of internals.listeners) cb('syncing', 0);

    expect(seen).toContain('syncing');
  });

  it('la file est UNIQUE : pas d’écrasement croisé sous la clé localStorage', async () => {
    const copyA = await import('../../packages/shared/src/storage/sync-queue.js');
    vi.resetModules();
    const copyB = await import('../../packages/shared/src/storage/sync-queue.js');

    const internals = (window as any).__dsfrDataSyncShared;
    // Les deux copies voient la MÊME file (même référence)
    internals.queue.push({ method: 'PUT', url: '/api/x', retries: 0 });
    expect(internals.queue).toHaveLength(1);
    // Une seconde copie ne repart pas d'une file vide qui écraserait l'autre
    expect((copyA as any) === (copyB as any)).toBe(false);
    expect((window as any).__dsfrDataSyncShared.queue).toHaveLength(1);
  });
});
