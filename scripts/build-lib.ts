/**
 * Build script that produces 3 library bundles:
 *
 *   dsfr-data.esm.js / .umd.js       — full bundle (all components)
 *   dsfr-data.core.esm.js / .umd.js   — core bundle (no Leaflet)
 *   dsfr-data.map.esm.js / .umd.js    — map add-on (Leaflet family)
 *   dsfr-data.debug.js                — collecteur de diagnostic autonome
 *                                       (#608, opt-in, hors bundles publies)
 */
import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const coreDir = resolve(root, 'packages/core');

// Version + commit injectés dans les composants de layout (app-footer).
// Version = semver publié (packages/core/package.json). Commit = hash court
// git (overridable via DSFR_DATA_COMMIT pour les builds Docker sans .git).
const version = JSON.parse(readFileSync(resolve(coreDir, 'package.json'), 'utf8'))
  .version as string;
let commit = process.env.DSFR_DATA_COMMIT ?? '';
if (!commit) {
  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
  } catch {
    commit = '';
  }
}

/**
 * Build de developpement : bundles destines a etre servis par ce depot sur
 * `localhost:<port>` derriere les routes `/*-proxy/` du serveur Vite.
 *
 * POURQUOI CE DRAPEAU EXISTE (#716). `isViteDevMode()` garde son heuristique
 * d'hote derriere `import.meta.env.DEV`, precisement pour qu'un integrateur
 * tiers qui developpe sur `http://localhost:3000` ne soit PAS traite comme le
 * serveur de dev de ce depot (frontiere #319). Or ce script est lance par
 * `vite-node`, qui pose `NODE_ENV=development` : Vite en deduisait `DEV: true`
 * et pliait la garde a la compilation. Le bundle publie sur npm reecrivait donc
 * Tabular, Grist et INSEE vers des chemins `/…-proxy/` relatifs chez n'importe
 * quel integrateur en local — le bug etait DANS LE PAQUET PUBLIE.
 *
 * Le signal est desormais EXPLICITE : `mode` et `import.meta.env.DEV` sont
 * poses ici, et ne dependent plus de ce que `vite-node` a laisse dans
 * `NODE_ENV`. `DSFR_DATA_DEV_BUILD=1` est le drapeau deja conventionne du depot
 * (cf. `scripts/validate-build-env.ts`, `docs/DEPLOYMENT.md`).
 *
 * A savoir : `npm run dev` et les e2e ne passent PAS par ici — le plugin
 * `dev-lib-redirect` de `vite.config.ts` sert les SOURCES. Ce drapeau ne sert
 * qu'aux chemins qui servent un bundle CONSTRUIT sur `localhost` : Docker en
 * local, `npm run preview`, `app-dist/` servi localement, les pages `examples/`
 * et `guide/` hors serveur de dev.
 */
const devBuild = process.env.DSFR_DATA_DEV_BUILD === '1';

const commonConfig = {
  // Ne jamais laisser Vite deduire le mode de NODE_ENV : sous `vite-node` il
  // vaut « development », ce qui produirait un bundle de dev publie sur npm.
  mode: devBuild ? ('development' as const) : ('production' as const),
  esbuild: { keepNames: true },
  define: {
    'process.env.NODE_ENV': devBuild ? '"development"' : '"production"',
    // Redondant avec `mode` par construction, et c'est voulu : c'est la valeur
    // que lit `isViteDevMode()`, elle est posee ici noir sur blanc plutot que
    // deduite d'une chaine mode -> isProduction -> DEV.
    'import.meta.env.DEV': JSON.stringify(devBuild),
    'import.meta.env.PROD': JSON.stringify(!devBuild),
    __DSFR_DATA_VERSION__: JSON.stringify(version),
    __DSFR_DATA_COMMIT__: JSON.stringify(commit),
  },
  resolve: { alias: { '@': resolve(coreDir, 'src') } },
  configFile: false,
  logLevel: 'warn' as const,
};

async function buildBundle(
  entry: string,
  name: string,
  fileName: (format: string) => string,
  formats: ('es' | 'umd')[]
) {
  console.log(`Building ${name}...`);
  await build({
    ...commonConfig,
    root: coreDir,
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
try {
  rmSync(resolve(coreDir, 'dist'), { recursive: true });
} catch {
  /* ok */
}
mkdirSync(resolve(coreDir, 'dist'), { recursive: true });

// 1. Full bundle
await buildBundle(
  resolve(coreDir, 'src/index.ts'),
  'DsfrData',
  (fmt) => `dsfr-data.${fmt === 'es' ? 'esm' : fmt}.js`,
  ['es', 'umd']
);

// 2. Core bundle (no Leaflet)
await buildBundle(
  resolve(coreDir, 'src/index-core.ts'),
  'DsfrData',
  (fmt) => `dsfr-data.core.${fmt === 'es' ? 'esm' : fmt}.js`,
  ['es', 'umd']
);

// 3. Map add-on (Leaflet carte interactive — loaded as module complement)
await buildBundle(
  resolve(coreDir, 'src/index-map.ts'),
  'DsfrDataMap',
  (fmt) => `dsfr-data.map.${fmt === 'es' ? 'esm' : fmt}.js`,
  ['es', 'umd']
);

// 4. Bundle autonome de diagnostic (#608) — ENTREE SEPAREE, jamais fusionnee
//    aux trois bundles publies : un outil d'atelier n'a rien a faire dans le
//    poids d'une page gouvernementale. Format IIFE : une balise <script> ou un
//    marque-page doit suffire, sans module ni import map.
await buildBundle(
  resolve(coreDir, 'src/index-debug.ts'),
  'DsfrDataDebug',
  () => `dsfr-data.debug.js`,
  ['umd']
);

console.log('\nBuild complete. Bundles in packages/core/dist/:');
const { readdirSync, statSync } = await import('fs');
for (const f of readdirSync(resolve(coreDir, 'dist')).sort()) {
  const s = statSync(resolve(coreDir, 'dist', f));
  if (s.isFile()) {
    console.log(`  ${f}  (${Math.round(s.size / 1024)} KB)`);
  }
}
