import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Test de garde #308 (EPIC H) — beacon : plus d'API applicative dans la lib.
 *
 * La branche `window.__gwDbMode` POSTait sur /api/monitoring/beacon avec
 * credentials: 'include' — logique applicative (mode DB) dans l'utilitaire
 * de la lib publiée, nommage __gw* hérité de l'ancien nom du projet. Le
 * transport applicatif passe par le hook window.DSFR_DATA_BEACON_TRANSPORT
 * (enregistré par @dsfr-data/app-ui via registerDbBeaconTransport).
 */

describe('#308 — AC : beacon.ts ne référence plus d’API applicative', () => {
  it('le source ne contient ni __gwDbMode ni /api/monitoring ni credentials', () => {
    const src = readFileSync(join(__dirname, '../packages/core/src/utils/beacon.ts'), 'utf8');
    expect(src).not.toContain('__gwDbMode');
    expect(src).not.toContain('/api/monitoring');
    expect(src).not.toContain("credentials: 'include'");
    expect(src).toContain('DSFR_DATA_BEACON_TRANSPORT');
  });

  it('le transport app-side vit dans shared (barrel racine, jamais lib.ts)', () => {
    const root = readFileSync(join(__dirname, '../packages/shared/src/index.ts'), 'utf8');
    const lib = readFileSync(join(__dirname, '../packages/shared/src/lib.ts'), 'utf8');
    expect(root).toContain('registerDbBeaconTransport');
    expect(lib).not.toContain('registerDbBeaconTransport');
    expect(lib).not.toContain('registerServerCacheProvider');
  });
});
