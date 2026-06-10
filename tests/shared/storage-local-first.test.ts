import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests traversants #321 (EPIC J) — storage/sync local-first.
 *
 * Bugs d'origine : mergeServerWithLocal retournait serverItems.map(...) —
 * un item créé hors-ligne (absent du serveur) disparaissait, puis load()
 * écrasait le cache local ; favorites/dashboards n'avaient AUCUN merge.
 * Boucle de write-back : load() → saveToStorage → save-hook → adapter.save
 * → syncItems → GET + un PUT par item, pour 5 clés préfetchées à CHAQUE
 * ouverture d'app. 409 défilé comme un succès (modif perdue).
 */

import { ApiStorageAdapter } from '../../packages/shared/src/storage/api-storage-adapter.js';
import {
  setSaveHook,
  saveToStorageQuiet,
  STORAGE_KEYS,
} from '../../packages/shared/src/storage/local-storage.js';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('#321 — AC : un item créé hors-ligne survit à la reconnexion', () => {
  it('les items locaux absents du serveur sont conservés (favorites compris)', async () => {
    // Local : 2 items dont 1 inconnu du serveur (créé hors-ligne)
    localStorage.setItem(
      STORAGE_KEYS.FAVORITES,
      JSON.stringify([
        { id: 'srv-1', name: 'connu' },
        { id: 'offline-1', name: 'créé hors-ligne' },
      ])
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 'srv-1', name: 'connu' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const adapter = new ApiStorageAdapter();
    const result = (await adapter.load(STORAGE_KEYS.FAVORITES, [])) as Array<{ id: string }>;

    expect(result.map((i) => i.id)).toContain('offline-1');
    expect(result.map((i) => i.id)).toContain('srv-1');
  });
});

describe('#321 — AC : ouvrir une app ne génère aucun PUT si rien n’a changé', () => {
  it('le cache du load() ne déclenche PAS le save-hook (fini le write-back)', async () => {
    const hook = vi.fn();
    setSaveHook(hook);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 'a', name: 'x' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const adapter = new ApiStorageAdapter();
    await adapter.load(STORAGE_KEYS.FAVORITES, []);

    expect(hook).not.toHaveBeenCalled();
    setSaveHook(null);
  });

  it('saveToStorageQuiet écrit sans hook, saveToStorage le déclenche', async () => {
    const hook = vi.fn();
    setSaveHook(hook);

    saveToStorageQuiet('test-key', { a: 1 });
    expect(hook).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('test-key')!)).toEqual({ a: 1 });

    setSaveHook(null);
  });
});
