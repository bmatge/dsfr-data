/**
 * Variante UMD du chargeur Parquet (#1055) — substituée à `parquet-modules.ts`
 * par `scripts/build-lib.ts` pour les seuls bundles `*.umd.js`.
 *
 * Pourquoi : un bundle UMD est un fichier unique, Vite y INLINE tout
 * `import()` (c'est ce qui arrive à Leaflet dans `dsfr-data.map.umd.js`).
 * Un `import('hyparquet')` y ajouterait ~26 Ko gzip au bundle principal de
 * toutes les pages, qu'elles lisent un Parquet ou non.
 *
 * Ici, le bundle UMD importe les MÊMES chunks que le bundle ESM
 * (`hyparquet-<hash>.js`, `fzstd-<hash>.js`, publiés à côté de lui dans
 * `dist/`), résolus par rapport à l'URL du script UMD lui-même — sur le CDN
 * qui sert la bibliothèque comme en auto-hébergement. Aucun hôte tiers
 * (garde #292 : `tests/no-cdn-in-core.test.ts`). Les noms, hachés, sont
 * relevés dans `dist/` après les builds ESM et injectés à la compilation.
 *
 * `import()` fonctionne dans un script classique : le bundle UMD reste
 * chargeable par une simple balise `<script>`. Sans balise (UMD ré-empaqueté
 * par un bundler, `require` côté serveur), l'URL du script est inconnue : le
 * chargement échoue, et la source retombe sur la pagination en le disant.
 */
import type { ParquetLibraries } from './parquet-types.js';

/** Noms des chunks ESM du lecteur, posés par `scripts/build-lib.ts`. */
declare const __DSFR_DATA_PARQUET_CHUNKS__: { hyparquet: string; fzstd: string };

/**
 * URL du script UMD, relevée PENDANT son exécution : `document.currentScript`
 * ne vaut plus rien une fois le script évalué.
 */
const SCRIPT_URL =
  typeof document !== 'undefined' && document.currentScript instanceof HTMLScriptElement
    ? document.currentScript.src
    : '';

export async function importParquetLibraries(): Promise<ParquetLibraries> {
  if (!SCRIPT_URL) {
    throw new Error(
      'lecteur Parquet introuvable : le bundle UMD ne connaît pas son URL (chargé hors balise <script>)'
    );
  }
  const chunks = __DSFR_DATA_PARQUET_CHUNKS__;
  const [hyparquet, fzstd] = await Promise.all([
    import(/* @vite-ignore */ /* webpackIgnore: true */ new URL(chunks.hyparquet, SCRIPT_URL).href),
    import(/* @vite-ignore */ /* webpackIgnore: true */ new URL(chunks.fzstd, SCRIPT_URL).href),
  ]);
  return {
    hyparquet: hyparquet as ParquetLibraries['hyparquet'],
    fzstd: fzstd as ParquetLibraries['fzstd'],
  };
}
