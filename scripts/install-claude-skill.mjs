#!/usr/bin/env node
/**
 * Installe les skills Claude Code du dépôt (skills/<nom>/ : la skill générée
 * « dsfr-data » et les skills écrites à la main, ex. « dataviz-metier », ADR-136)
 * pour un développeur, par lien symbolique (ou copie) :
 *
 *   npm run skills:install                    → .claude/skills/<nom> de CE repo (skills de projet)
 *   npm run skills:install -- --global        → ~/.claude/skills/<nom> (toutes les sessions)
 *   npm run skills:install -- --only dsfr-data  → une seule skill
 *   npm run skills:install -- --copy          → copie au lieu du lien (Windows sans droits symlink)
 *   npm run skills:install -- --uninstall [--global] [--only <nom>]
 *
 * Voir docs/AI-SKILLS.md.
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  readlinkSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const args = new Set(argv);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsRoot = resolve(root, 'skills');
const base = args.has('--global')
  ? resolve(homedir(), '.claude/skills')
  : resolve(root, '.claude/skills');

const onlyAt = argv.indexOf('--only');
const only = onlyAt >= 0 ? argv[onlyAt + 1] : null;
if (onlyAt >= 0 && !only) {
  console.error('--only attend un nom de skill (ex. --only dsfr-data)');
  process.exit(1);
}

/** Skills installables : tout dossier skills/<nom>/ portant un SKILL.md. */
const names = readdirSync(skillsRoot)
  .filter((d) => !d.startsWith('.') && existsSync(resolve(skillsRoot, d, 'SKILL.md')))
  .sort()
  .filter((d) => !only || d === only);

if (names.length === 0) {
  console.error(
    only
      ? `Skill introuvable : ${resolve(skillsRoot, only)}`
      : `Aucune skill dans ${skillsRoot}\nLancez d'abord : npm run build:skills`
  );
  process.exit(1);
}

if (args.has('--uninstall')) {
  for (const name of names) {
    const target = resolve(base, name);
    if (existsSync(target) || isLink(target)) {
      rmSync(target, { recursive: true, force: true });
      console.log(`Retirée : ${target}`);
    } else {
      console.log(`Rien à retirer : ${target}`);
    }
  }
  process.exit(0);
}

mkdirSync(base, { recursive: true });
for (const name of names) {
  const source = resolve(skillsRoot, name);
  const target = resolve(base, name);
  if (existsSync(target) || isLink(target)) rmSync(target, { recursive: true, force: true });

  if (args.has('--copy')) {
    cpSync(source, target, { recursive: true });
    console.log(
      `Skill copiée dans ${target}\n(relancer après chaque \`git pull\` ou \`npm run build:skills\`)`
    );
  } else {
    const rel = relative(dirname(target), source);
    symlinkSync(rel, target, 'dir');
    console.log(`Skill liée : ${target} -> ${readlinkSync(target)}`);
  }
}
console.log(
  args.has('--global')
    ? 'Claude Code les charge dans toutes les sessions (skills utilisateur).'
    : 'Claude Code les charge dans les sessions ouvertes dans ce repo (skills de projet).'
);

function isLink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
