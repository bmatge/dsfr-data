#!/usr/bin/env node
/**
 * Installe la skill Claude Code « dsfr-data » (skills/dsfr-data/) pour un
 * développeur, par lien symbolique (ou copie) :
 *
 *   npm run skills:install            → .claude/skills/dsfr-data de CE repo (skill de projet)
 *   npm run skills:install -- --global → ~/.claude/skills/dsfr-data (toutes les sessions)
 *   npm run skills:install -- --copy   → copie au lieu du lien (Windows sans droits symlink)
 *   npm run skills:install -- --uninstall [--global]
 *
 * Voir docs/AI-SKILLS.md.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, readlinkSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'skills/dsfr-data');
const base = args.has('--global') ? resolve(homedir(), '.claude/skills') : resolve(root, '.claude/skills');
const target = resolve(base, 'dsfr-data');

if (!existsSync(resolve(source, 'SKILL.md'))) {
  console.error(`Skill introuvable : ${source}\nLancez d'abord : npm run build:skills`);
  process.exit(1);
}

if (args.has('--uninstall')) {
  if (existsSync(target) || isLink(target)) {
    rmSync(target, { recursive: true, force: true });
    console.log(`Retirée : ${target}`);
  } else {
    console.log(`Rien à retirer : ${target}`);
  }
  process.exit(0);
}

mkdirSync(base, { recursive: true });
if (existsSync(target) || isLink(target)) rmSync(target, { recursive: true, force: true });

if (args.has('--copy')) {
  cpSync(source, target, { recursive: true });
  console.log(`Skill copiée dans ${target}\n(relancer après chaque \`npm run build:skills\`)`);
} else {
  const rel = relative(dirname(target), source);
  symlinkSync(rel, target, 'dir');
  console.log(`Skill liée : ${target} -> ${readlinkSync(target)}`);
}
console.log(
  args.has('--global')
    ? 'Claude Code la charge dans toutes les sessions (skill utilisateur).'
    : 'Claude Code la charge dans les sessions ouvertes dans ce repo (skill de projet).'
);

function isLink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
