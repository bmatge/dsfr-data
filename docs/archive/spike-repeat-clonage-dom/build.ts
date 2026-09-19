/**
 * SPIKE #889 — build JETABLE du bundle de mesure (`NODE_ENV=production npx vite-node e2e/spike-repeat/build.ts`).
 * Sans NODE_ENV=production, vite-node pose « development » et Vite retient la condition
 * d'export `development` de Lit : le bundle embarque Lit en mode dev (vérifié : 2 occurrences
 * de « Lit is in dev mode » ; 0 avec la variable).
 * Mêmes `define` que scripts/build-lib.ts en mode production ; sortie dans
 * e2e/spike-repeat/dist/spike-bundle.js (ignoré par git).
 */
import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const coreDir = resolve(root, 'packages/core');
const version = JSON.parse(readFileSync(resolve(coreDir, 'package.json'), 'utf8'))
  .version as string;

await build({
  mode: 'production',
  configFile: false,
  logLevel: 'warn',
  esbuild: { keepNames: true },
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    __DSFR_DATA_VERSION__: JSON.stringify(version),
    __DSFR_DATA_COMMIT__: JSON.stringify('spike'),
  },
  resolve: { alias: { '@': resolve(coreDir, 'src') } },
  root: here,
  build: {
    lib: {
      entry: resolve(here, 'entry.ts'),
      name: 'SpikeRepeat',
      fileName: () => 'spike-bundle.js',
      formats: ['es'],
    },
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    minify: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
console.log('spike-bundle.js construit (production, dsfr-data ' + version + ')');
