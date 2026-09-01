/**
 * Configuration @custom-elements-manifest/analyzer.
 *
 * Produit `packages/core/custom-elements.json` : la description machine des
 * composants `dsfr-data-*` (attributs, types, defauts, evenements, slots,
 * variables CSS) extraite du code + du JSDoc.
 *
 * Deux consommateurs :
 *  - `scripts/build-skills-reference.ts` -> section « reference » generee des
 *    skills builder-IA / MCP (issue #512) ;
 *  - les integrateurs de la lib npm (autocompletion editeur via le manifeste).
 *
 * Regenerer avec `npm run build:cem` (le fichier produit est commite).
 */
export default {
  globs: ['packages/core/src/components/*.ts'],
  exclude: ['**/*.test.ts'],
  outdir: 'packages/core',
  litelement: true,
  dev: false,
};
