import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le lecteur Parquet (`hyparquet` + `fzstd`, ≈ 22 Ko gzip) ne doit JAMAIS
 * entrer dans un bundle principal (#1055) : seules les pages qui posent
 * `fetch-mode="export"` sur une source Tabular le chargent.
 *
 * - ESM : `import()` → chunks séparés `dist/hyparquet-*.js` et `dist/fzstd-*.js`,
 *   référencés par le bundle, jamais inlinés ;
 * - UMD : pas de découpage possible, `scripts/build-lib.ts` substitue
 *   `parquet-modules-umd.ts`, qui importe CES MÊMES chunks à côté du script —
 *   le bundle porte leur nom, pas leur code, et aucun CDN tiers (#292).
 *
 * Signatures : deux messages d'erreur propres aux paquets, qu'aucun code du
 * dépôt n'écrit. Ignoré (et non rouge) quand `dist/` n'existe pas, comme
 * `tests/lib-dev-mode-guard.test.ts` — la CI le rejoue après le build.
 */

const DIST = join(__dirname, '../packages/core/dist');
const HYPARQUET = 'parquet file invalid (footer != PAR1)';
const FZSTD = 'invalid zstd data';

const PRINCIPAUX = [
  'dsfr-data.esm.js',
  'dsfr-data.umd.js',
  'dsfr-data.core.esm.js',
  'dsfr-data.core.umd.js',
  'dsfr-data.map.esm.js',
  'dsfr-data.map.umd.js',
  'dsfr-data.debug.js',
];

const built = existsSync(join(DIST, 'dsfr-data.esm.js'));
const lire = (f: string) => readFileSync(join(DIST, f), 'utf8');

describe.skipIf(!built)('bundles publiés — lecteur Parquet chargé à la demande (#1055)', () => {
  it.each(PRINCIPAUX)('%s ne contient ni hyparquet ni fzstd', (f) => {
    const code = lire(f);
    expect(code.includes(HYPARQUET)).toBe(false);
    expect(code.includes(FZSTD)).toBe(false);
  });

  const chunks = () => {
    const fichiers = readdirSync(DIST);
    return {
      hyp: fichiers.filter((f) => /^hyparquet-[\w-]+\.js$/.test(f)),
      zst: fichiers.filter((f) => /^fzstd-[\w-]+\.js$/.test(f)),
    };
  };

  it('ESM : les chunks existent, contiennent le lecteur, et sont importés', () => {
    const { hyp, zst } = chunks();
    expect(hyp).toHaveLength(1);
    expect(zst).toHaveLength(1);
    expect(lire(hyp[0]).includes(HYPARQUET)).toBe(true);
    expect(lire(zst[0]).includes(FZSTD)).toBe(true);
    for (const f of ['dsfr-data.esm.js', 'dsfr-data.core.esm.js']) {
      expect(lire(f)).toContain(`import("./${hyp[0]}")`);
      expect(lire(f)).toContain(`import("./${zst[0]}")`);
    }
  });

  it('UMD : importe les MÊMES chunks, à côté du script, sans CDN tiers', () => {
    const { hyp, zst } = chunks();
    for (const f of ['dsfr-data.umd.js', 'dsfr-data.core.umd.js']) {
      const code = lire(f);
      expect(code).toContain(`./${hyp[0]}`);
      expect(code).toContain(`./${zst[0]}`);
      expect(code).toContain('document.currentScript');
      expect(code).not.toMatch(/cdn\.jsdelivr\.net\/npm\/(hyparquet|fzstd)/);
    }
  });
});
