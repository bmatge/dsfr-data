/**
 * Build du chrome applicatif (#306) — bundle ESM autonome charge par les
 * apps via <script type="module">, hors de la lib npm publiee `dsfr-data`.
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const corePkg = JSON.parse(readFileSync(resolve(here, '../core/package.json'), 'utf8'));

await build({
  entryPoints: [resolve(here, 'src/index.ts')],
  bundle: true,
  format: 'esm',
  outfile: resolve(here, 'dist/app-ui.esm.js'),
  // keepNames : sans elle, esbuild supprime les methodes privees des
  // prototypes Lit a la minification (meme regle que la lib, cf. CLAUDE.md)
  keepNames: true,
  minify: true,
  define: {
    __DSFR_DATA_VERSION__: JSON.stringify(corePkg.version),
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.MODE': '"production"',
  },
  logLevel: 'info',
});
