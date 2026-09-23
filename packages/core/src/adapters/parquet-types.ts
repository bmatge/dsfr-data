/**
 * Types du lecteur Parquet chargé à la demande (#1055). `import type`
 * seulement : effacé à la compilation, ce fichier ne tire jamais `hyparquet`
 * ni `fzstd` dans un bundle.
 */
export type HyparquetModule = typeof import('hyparquet');
export type FzstdModule = typeof import('fzstd');

/** Ce que rend le chargeur, en ESM comme en UMD (les mêmes chunks). */
export interface ParquetLibraries {
  hyparquet: Pick<
    HyparquetModule,
    'asyncBufferFromUrl' | 'parquetMetadataAsync' | 'parquetReadObjects' | 'parquetSchema'
  >;
  fzstd: Pick<FzstdModule, 'decompress'>;
}
