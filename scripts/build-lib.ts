/**
 * Build script that produces 3 library bundles:
 *
 *   dsfr-data.esm.js / .umd.js       — full bundle (all components)
 *   dsfr-data.core.esm.js / .umd.js   — core bundle (no world-map, no d3-geo)
 *   dsfr-data.world-map.esm.js         — world-map add-on (ESM only)
 *
 * Also copies the TopoJSON asset to dist/data/.
 */
import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cpSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const commonConfig = {
  esbuild: { keepNames: true },
  define: { 'process.env.NODE_ENV': '"production"' },
  resolve: { alias: { '@': resolve(root, 'src') } },
  configFile: false,
  logLevel: 'warn' as const,
};

async function buildBundle(
  entry: string,
  name: string,
  fileName: (format: string) => string,
  formats: ('es' | 'umd')[],
) {
  console.log(`Building ${name}...`);
  await build({
    ...commonConfig,
    root,
    build: {
      lib: { entry, name, fileName, formats },
      outDir: 'dist',
      emptyOutDir: false,
      assetsInlineLimit: 0,
      rollupOptions: {
        output: {
          globals: {},
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  });
}

// Clean dist/ before building
const { rmSync } = await import('fs');
try { rmSync(resolve(root, 'dist'), { recursive: true }); } catch { /* ok */ }
mkdirSync(resolve(root, 'dist'), { recursive: true });

// 1. Full bundle
await buildBundle(
  resolve(root, 'src/index.ts'),
  'DsfrData',
  (fmt) => `dsfr-data.${fmt === 'es' ? 'esm' : fmt}.js`,
  ['es', 'umd'],
);

// 2. Core bundle (no world-map / d3-geo / topojson)
await buildBundle(
  resolve(root, 'src/index-core.ts'),
  'DsfrData',
  (fmt) => `dsfr-data.core.${fmt === 'es' ? 'esm' : fmt}.js`,
  ['es', 'umd'],
);

// 3. World-map add-on (ESM only — loaded as module complement)
await buildBundle(
  resolve(root, 'src/index-world-map.ts'),
  'DsfrDataWorldMap',
  (fmt) => `dsfr-data.world-map.${fmt === 'es' ? 'esm' : fmt}.js`,
  ['es', 'umd'],
);

// 4. Map add-on (Leaflet carte interactive — loaded as module complement)
await buildBundle(
  resolve(root, 'src/index-map.ts'),
  'DsfrDataMap',
  (fmt) => `dsfr-data.map.${fmt === 'es' ? 'esm' : fmt}.js`,
  ['es', 'umd'],
);

// 5. Copy TopoJSON to dist/data/ for runtime fetch
mkdirSync(resolve(root, 'dist/data'), { recursive: true });
cpSync(
  resolve(root, 'src/data/world-countries-110m.json'),
  resolve(root, 'dist/data/world-countries-110m.json'),
);

console.log('\nBuild complete. Bundles in dist/:');
const { readdirSync, statSync } = await import('fs');
for (const f of readdirSync(resolve(root, 'dist')).sort()) {
  const s = statSync(resolve(root, 'dist', f));
  if (s.isFile()) {
    console.log(`  ${f}  (${Math.round(s.size / 1024)} KB)`);
  }
}
