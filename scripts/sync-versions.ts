/**
 * Synchronise la version de packages/core/package.json vers :
 * - packages/core/src/version.ts (source TS de la version, importee par
 *   <app-header> pour afficher "Beta {version}" sans sortir du rootDir)
 *
 * Usage : npx vite-node scripts/sync-versions.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');

const pkg = JSON.parse(readFileSync(resolve(root, 'packages/core/package.json'), 'utf-8'));
const version = pkg.version;

// packages/core/src/version.ts — source TS de la version
const versionTsPath = resolve(root, 'packages/core/src/version.ts');
const oldVersionTs = readFileSync(versionTsPath, 'utf-8').match(/VERSION = '(.+)'/)?.[1];
const versionTsContent = `/**
 * Version publique de la librairie \`dsfr-data\`, synchronisee depuis
 * \`packages/core/package.json\` par \`scripts/sync-versions.ts\`.
 *
 * Ne pas editer a la main — regenere a chaque \`npm run version-packages\`.
 */
export const VERSION = '${version}';
`;
writeFileSync(versionTsPath, versionTsContent);

console.log(`Version synchronisee : ${version}`);
if (oldVersionTs !== version)
  console.log(`  packages/core/src/version.ts : ${oldVersionTs} -> ${version}`);
else console.log('  Deja a jour.');
