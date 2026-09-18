/**
 * Lecture disque des skills écrites à la main (`skills/<nom>/`), séparée du
 * rendu pur de `markdown-skills.ts` pour que celui-ci reste testable sans
 * système de fichiers.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import {
  GENERATED_SKILL_DIR,
  parseMarkdownSkill,
  type MarkdownSkill,
  type MarkdownSkillFiles,
} from './markdown-skills.js';

/** Dossiers `skills/<nom>/` porteurs d'un SKILL.md, hors skill générée, triés. */
export function listMarkdownSkillDirs(skillsRoot: string): string[] {
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot)
    .filter(
      (d) =>
        d !== GENERATED_SKILL_DIR &&
        !d.startsWith('.') &&
        statSync(resolve(skillsRoot, d)).isDirectory() &&
        existsSync(resolve(skillsRoot, d, 'SKILL.md'))
    )
    .sort();
}

/**
 * Fichiers d'une skill. Les références sont prises dans l'ordre où le SKILL.md
 * les cite (premier lien `references/x.md`), puis les non citées, par nom.
 */
export function readMarkdownSkillFiles(skillsRoot: string, dir: string): MarkdownSkillFiles {
  const base = resolve(skillsRoot, dir);
  const skillMd = readFileSync(resolve(base, 'SKILL.md'), 'utf-8');
  const refDir = resolve(base, 'references');
  const present = existsSync(refDir)
    ? readdirSync(refDir)
        .filter((f) => f.endsWith('.md'))
        .sort()
    : [];
  const cited: string[] = [];
  for (const m of skillMd.matchAll(/\(references\/([^)]+\.md)\)/g)) {
    if (present.includes(m[1]) && !cited.includes(m[1])) cited.push(m[1]);
  }
  const ordered = [...cited, ...present.filter((f) => !cited.includes(f))];
  const references = new Map<string, string>();
  for (const f of ordered)
    references.set(`references/${f}`, readFileSync(resolve(refDir, f), 'utf-8'));
  return { dir, skillMd, references };
}

export function readMarkdownSkills(skillsRoot: string): MarkdownSkill[] {
  return listMarkdownSkillDirs(skillsRoot).map((dir) =>
    parseMarkdownSkill(readMarkdownSkillFiles(skillsRoot, dir))
  );
}
