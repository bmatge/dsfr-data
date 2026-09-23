/**
 * Chargement paresseux du lecteur Parquet (#1055) : `hyparquet` et le
 * décompresseur ZSTD `fzstd` (les exports de data.gouv sont compressés en
 * ZSTD, que hyparquet seul ne lit pas).
 *
 * Ce module ne fait QUE des `import()` : aucun import statique, pour que le
 * lecteur (≈ 22 Ko gzip) ne soit jamais dans le bundle principal. En ESM,
 * Vite en fait des chunks séparés (`dist/hyparquet-*.js`), chargés au premier
 * `fetch-mode="export"` d'une source Tabular — comme Leaflet (`loadLeaflet()`
 * de `dsfr-data-map.ts`).
 *
 * Le format UMD ne sait pas découper : `scripts/build-lib.ts` y remplace ce
 * module par `parquet-modules-umd.ts`, qui importe ces MÊMES chunks, publiés à
 * côté du bundle. Les deux fichiers exposent la même signature.
 */
import type { ParquetLibraries } from './parquet-types.js';

export async function importParquetLibraries(): Promise<ParquetLibraries> {
  const [hyparquet, fzstd] = await Promise.all([import('hyparquet'), import('fzstd')]);
  return { hyparquet, fzstd };
}
