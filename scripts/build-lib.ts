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
import { mkdirSync, readFileSync, readdirSync, statSync } from 'fs';
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

/**
 * ... et le meme piege une couche plus bas : la RESOLUTION des modules (#899).
 *
 * `mode` et `define` ci-dessous reecrivent le CODE produit ; ils ne choisissent
 * pas la condition d'export par laquelle Vite resout une dependance. Pour cela
 * Vite lit `process.env.NODE_ENV` du PROCESSUS — que `vite-node` laisse a
 * « development ». Lit publie une condition `development` : les bundles
 * publies embarquaient donc `lit-html/development`, `lit-element/development`
 * et `reactive-element/development` (verifie sur les paquets npm 0.30.0 et
 * 0.31.0), soit des verifications supplementaires a chaque mise a jour de
 * propriete et un « Lit is in dev mode » en console sur chaque page
 * d'integrateur.
 *
 * On pose donc la variable AVANT tout appel a `build()`, c'est-a-dire avant
 * toute resolution. Le garde-fou qui empeche la regression de revenir est dans
 * `tests/lib-dev-mode-guard.test.ts`, rejoue par la CI apres le build.
 */
process.env.NODE_ENV = devBuild ? 'development' : 'production';

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
  configFile: false,
  logLevel: 'warn' as const,
};

/**
 * Le lecteur Parquet (#1055) est charge a la demande par `import()`
 * (`packages/core/src/adapters/parquet-modules.ts`). En ESM, Vite en fait des
 * chunks separes (`dist/hyparquet-*.js`, `dist/fzstd-*.js`), comme Leaflet.
 * Un bundle UMD, lui, ne se decoupe pas : Vite y INLINE tout `import()`, et
 * le lecteur (~26 Ko gzip) alourdirait toutes les pages. Pour l'UMD, le module
 * est donc remplace par `parquet-modules-umd.ts`, qui importe CES MEMES chunks
 * ESM, publies a cote de lui, par rapport a l'URL du script — jamais depuis un
 * CDN tiers (#292). D'ou un build PAR FORMAT (l'alias ne vaut que pour l'UMD),
 * les ESM d'abord : leurs noms de chunks, haches, sont releves dans `dist/`
 * puis injectes dans les UMD. Garde : `tests/lib-parquet-lazy-guard.test.ts`.
 */
function aliasesFor(format: 'es' | 'umd') {
  const aliases: Array<{ find: string | RegExp; replacement: string }> = [
    { find: '@', replacement: resolve(coreDir, 'src') },
  ];
  if (format === 'umd') {
    aliases.unshift({
      find: /^\.\/parquet-modules\.js$/,
      replacement: resolve(coreDir, 'src/adapters/parquet-modules-umd.ts'),
    });
  }
  return aliases;
}

/** Chunks du lecteur Parquet produits par les builds ESM, par paquet. */
function parquetChunks(): { hyparquet: string; fzstd: string } {
  const files = readdirSync(resolve(coreDir, 'dist'));
  const find = (pkg: string) => {
    const matches = files.filter((f) => f.startsWith(`${pkg}-`) && f.endsWith('.js'));
    if (matches.length !== 1) {
      throw new Error(`build-lib: un seul chunk ${pkg}-*.js attendu dans dist/, trouve ${matches}`);
    }
    return `./${matches[0]}`;
  };
  return { hyparquet: find('hyparquet'), fzstd: find('fzstd') };
}

async function buildFormat(
  entry: string,
  name: string,
  fileName: (format: string) => string,
  format: 'es' | 'umd'
) {
  console.log(`Building ${name} (${format})...`);
  await build({
    ...commonConfig,
    define: {
      ...commonConfig.define,
      ...(format === 'umd'
        ? { __DSFR_DATA_PARQUET_CHUNKS__: JSON.stringify(parquetChunks()) }
        : {}),
    },
    resolve: { alias: aliasesFor(format) },
    root: coreDir,
    build: {
      lib: { entry, name, fileName, formats: [format] },
      outDir: 'dist',
      emptyOutDir: false,
      assetsInlineLimit: 0,
      rollupOptions: {
        output: {
          globals: {},
          assetFileNames: 'assets/[name][extname]',
          // Chunks paresseux nommes d'apres leur paquet : `src-*.js` et
          // `esm-*.js` (noms des fichiers d'entree de hyparquet et fzstd)
          // ne diraient rien a qui lit `dist/` ou un journal reseau.
          chunkFileNames: (chunk: { name: string; moduleIds: string[] }) => {
            const pkg = ['hyparquet', 'fzstd'].find((p) =>
              chunk.moduleIds.some((id) => id.includes(`/node_modules/${p}/`))
            );
            return `${pkg ?? '[name]'}-[hash].js`;
          },
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

const esmUmd = (suffix: string) => (fmt: string) =>
  `dsfr-data${suffix}.${fmt === 'es' ? 'esm' : fmt}.js`;

// Les trois bundles publies, ESM D'ABORD : les UMD relisent dans `dist/` le
// nom des chunks du lecteur Parquet que les ESM y ont poses (voir aliasesFor).
const PUBLISHED = [
  // 1. Full bundle
  { entry: 'src/index.ts', name: 'DsfrData', fileName: esmUmd('') },
  // 2. Core bundle (no Leaflet)
  { entry: 'src/index-core.ts', name: 'DsfrData', fileName: esmUmd('.core') },
  // 3. Map add-on (Leaflet carte interactive — loaded as module complement)
  { entry: 'src/index-map.ts', name: 'DsfrDataMap', fileName: esmUmd('.map') },
];
for (const format of ['es', 'umd'] as const) {
  for (const b of PUBLISHED) {
    await buildFormat(resolve(coreDir, b.entry), b.name, b.fileName, format);
  }
}

// 4. Bundle autonome de diagnostic (#608) — ENTREE SEPAREE, jamais fusionnee
//    aux trois bundles publies : un outil d'atelier n'a rien a faire dans le
//    poids d'une page gouvernementale. Format IIFE : une balise <script> ou un
//    marque-page doit suffire, sans module ni import map.
await buildFormat(
  resolve(coreDir, 'src/index-debug.ts'),
  'DsfrDataDebug',
  () => `dsfr-data.debug.js`,
  'umd'
);

console.log('\nBuild complete. Bundles in packages/core/dist/:');

for (const f of readdirSync(resolve(coreDir, 'dist')).sort()) {
  const s = statSync(resolve(coreDir, 'dist', f));
  if (s.isFile()) {
    console.log(`  ${f}  (${Math.round(s.size / 1024)} KB)`);
  }
}
