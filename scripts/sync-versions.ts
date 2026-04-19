/**
 * Synchronise la version du package.json root vers :
 * - src-tauri/tauri.conf.json
 * - src-tauri/Cargo.toml
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

// Tauri conf
const tauriConfPath = resolve(root, 'src-tauri/tauri.conf.json');
const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf-8'));
const oldTauriVersion = tauriConf.version;
tauriConf.version = version;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');

// Cargo.toml
const cargoPath = resolve(root, 'src-tauri/Cargo.toml');
let cargo = readFileSync(cargoPath, 'utf-8');
const oldCargoVersion = cargo.match(/^version = "(.+)"$/m)?.[1];
cargo = cargo.replace(/^version = ".+"$/m, `version = "${version}"`);
writeFileSync(cargoPath, cargo);

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
if (oldTauriVersion !== version)
  console.log(`  tauri.conf.json : ${oldTauriVersion} -> ${version}`);
if (oldCargoVersion !== version) console.log(`  Cargo.toml : ${oldCargoVersion} -> ${version}`);
if (oldVersionTs !== version)
  console.log(`  packages/core/src/version.ts : ${oldVersionTs} -> ${version}`);
if (oldTauriVersion === version && oldCargoVersion === version && oldVersionTs === version)
  console.log('  Deja a jour.');
