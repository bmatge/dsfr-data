import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tests traversants #306 (EPIC H) — le chrome applicatif est hors de la lib.
 *
 * Bug d'origine : packages/core/src/components/layout/ (auth-modal,
 * password-change-modal, share-dialog avec fetch /api/auth et /api/shares,
 * app-header avec les services d'auth) était exporté par index.ts et
 * index-core.ts → le bundle npm publié dsfr-data.core.esm.js contenait
 * 16× /api/auth et la modale de connexion complète.
 */

const ROOT = join(__dirname, '..');

describe('#306 — AC : la lib publiée ne contient plus le chrome applicatif', () => {
  it('components/layout/ n’existe plus dans packages/core', () => {
    expect(existsSync(join(ROOT, 'packages/core/src/components/layout'))).toBe(false);
  });

  it('les entries npm n’exportent plus aucun composant App*', () => {
    for (const entry of ['index.ts', 'index-core.ts']) {
      const src = readFileSync(join(ROOT, 'packages/core/src', entry), 'utf8');
      expect(src, entry).not.toMatch(/AppHeader|AppFooter|AppLayout|layout\/index/);
    }
  });

  it('aucun fichier de core ne référence /api/auth, /api/shares, /api/cache ni /api/monitoring (#307/#308)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) {
          const content = readFileSync(p, 'utf8');
          if (/\/api\/(auth|shares|cache|monitoring)/.test(content)) offenders.push(p);
        }
      }
    };
    walk(join(ROOT, 'packages/core/src'));
    expect(offenders).toEqual([]);
  });

  it('le chrome vit dans le package privé @dsfr-data/app-ui (non publié)', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'packages/app-ui/package.json'), 'utf8'));
    expect(pkg.private).toBe(true);
    expect(existsSync(join(ROOT, 'packages/app-ui/src/auth-modal.ts'))).toBe(true);
    // L'incohérence historique est résolue : l'entrée exporte les 6 composants
    const idx = readFileSync(join(ROOT, 'packages/app-ui/src/index.ts'), 'utf8');
    for (const c of ['AppSidemenu', 'AppPreviewPanel', 'AppHeader', 'AppFooter']) {
      expect(idx).toContain(c);
    }
  });

  it('les apps et le hub chargent le bundle app-ui séparé', () => {
    const hub = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(hub).toContain('app-ui.esm.js');
    const playground = readFileSync(join(ROOT, 'apps/playground/index.html'), 'utf8');
    expect(playground).toContain('packages/app-ui/dist/app-ui.esm.js');
  });
});
