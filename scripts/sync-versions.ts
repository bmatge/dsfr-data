/**
 * Synchronise la version du package.json root vers :
 * - src-tauri/tauri.conf.json
 * - src-tauri/Cargo.toml
 *
 * Usage : npx vite-node scripts/sync-versions.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));
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

console.log(`Version synchronisee : ${version}`);
if (oldTauriVersion !== version) console.log(`  tauri.conf.json : ${oldTauriVersion} -> ${version}`);
if (oldCargoVersion !== version) console.log(`  Cargo.toml : ${oldCargoVersion} -> ${version}`);
if (oldTauriVersion === version && oldCargoVersion === version) console.log('  Deja a jour.');
