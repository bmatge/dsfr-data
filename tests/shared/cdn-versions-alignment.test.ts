import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tests de garde #322 (EPIC J) — versions CDN alignées, exports vivants.
 *
 * Bugs d'origine : cdn-versions.ts désynchronisé (dsfrChart 2.0.4 vs ^2.0.5
 * installé) ; setAuthBaseUrl exporté jamais appelé (_baseUrl toujours '') ;
 * migration.ts mort ; fetchWithTimeout écrasait le signal de l'appelant.
 */

import { CDN_VERSIONS } from '../../packages/shared/src/templates/cdn-versions.js';

describe('#322 — AC : versions CDN alignées avec package.json', () => {
  it('dsfrChart correspond à la dépendance installée de core', () => {
    const corePkg = JSON.parse(
      readFileSync(join(__dirname, '../../packages/core/package.json'), 'utf8')
    );
    const allDeps = {
      ...corePkg.dependencies,
      ...corePkg.devDependencies,
      ...corePkg.peerDependencies,
    };
    const declared = (allDeps['@gouvfr/dsfr-chart'] || '').replace(/^[\^~]/, '');
    expect(CDN_VERSIONS.dsfrChart).toBe(declared);
  });
});

describe('#322 — AC : zéro export sans consommateur', () => {
  it('setAuthBaseUrl, validateAndFilterArray, getAllProviders ne sont plus exportés', () => {
    for (const barrel of ['index.ts', 'lib.ts']) {
      const src = readFileSync(join(__dirname, '../../packages/shared/src', barrel), 'utf8');
      expect(src, barrel).not.toContain('setAuthBaseUrl');
      expect(src, barrel).not.toContain('getAllProviders');
      expect(src, barrel).not.toContain('validateAndFilterArray');
    }
  });

  it('migration.ts (module mort) a disparu', () => {
    expect(() =>
      readFileSync(join(__dirname, '../../packages/shared/src/storage/migration.ts'), 'utf8')
    ).toThrow();
  });

  it('la couche persistance ne référence plus le toast (UI)', () => {
    const src = readFileSync(
      join(__dirname, '../../packages/shared/src/storage/local-storage.ts'),
      'utf8'
    );
    expect(src).not.toContain("import('../ui/toast");
    expect(src).toContain('dsfr-data:storage-quota');
  });
});

describe('#322 — fetchWithTimeout compose le signal appelant', () => {
  it('un abort amont annule la requête (plus écrasé)', async () => {
    const { fetchWithTimeout } = await import('../../packages/shared/src/api/fetch-helpers.js');
    const controller = new AbortController();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        );
      });
    });

    const p = fetchWithTimeout('https://api.example.fr/x', { signal: controller.signal }, 60000);
    controller.abort();

    await expect(p).rejects.toThrow();
    fetchSpy.mockRestore();
  });
});

import { vi } from 'vitest';
