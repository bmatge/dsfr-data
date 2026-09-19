/**
 * Lecture disque des skills écrites à la main (`skills/<nom>/`), séparée du
 * rendu pur de `markdown-skills.ts` pour que celui-ci reste testable sans
 * système de fichiers.
 *
 * Tout accès au disque passe par `sousRacine()` : un seul endroit où un
 * segment de chemin est validé, un seul endroit à relire.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { resolve, sep } from 'path';
import {
  GENERATED_SKILL_DIR,
  parseMarkdownSkill,
  type MarkdownSkill,
  type MarkdownSkillFiles,
} from './markdown-skills.js';

/** Un nom simple : ni séparateur, ni `..`, ni nom vide. */
const NOM_SIMPLE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Le chemin de `segments` SOUS `racine` — la seule porte d'accès au disque de
 * ce module. Chaque segment doit être un nom simple, et le chemin résolu doit
 * rester sous la racine : sinon on lève, on ne lit pas.
 *
 * Les segments viennent en pratique de `readdirSync` (qui ne rend jamais de
 * séparateur, ni `.`, ni `..`), mais `readMarkdownSkillFiles` est EXPORTÉ et
 * son `dir` est un paramètre : la garde est ici, pas chez l'appelant.
 */
function sousRacine(racine: string, ...segments: string[]): string {
  for (const s of segments) {
    if (!NOM_SIMPLE.test(s)) throw new Error(`segment de chemin refusé : ${JSON.stringify(s)}`);
  }
  // Faux positif de path-traversal : `racine` et `segments` ne viennent pas
  // d'une entrée utilisateur — la racine est `skills/` calculée par le build,
  // les segments sortent de `readdirSync`. Et ils sont validés juste au-dessus
  // (nom simple) puis vérifiés juste en dessous (confinement sous la racine) :
  // c'est ce que la règle demande de faire, elle ne sait pas le voir. Revoir si
  // la racine devenait un argument CLI. Posé le 2026-09-19.
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
  const base = resolve(racine);
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
  const chemin = resolve(base, ...segments);
  if (chemin !== base && !chemin.startsWith(base + sep)) {
    throw new Error(`chemin hors de ${base} : ${chemin}`);
  }
  return chemin;
}

/** Dossiers `skills/<nom>/` porteurs d'un SKILL.md, hors skill générée, triés. */
export function listMarkdownSkillDirs(skillsRoot: string): string[] {
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot)
    .filter(
      (d) =>
        d !== GENERATED_SKILL_DIR &&
        NOM_SIMPLE.test(d) &&
        statSync(sousRacine(skillsRoot, d)).isDirectory() &&
        existsSync(sousRacine(skillsRoot, d, 'SKILL.md'))
    )
    .sort();
}

/**
 * Fichiers d'une skill. Les références sont prises dans l'ordre où le SKILL.md
 * les cite (premier lien `references/x.md`), puis les non citées, par nom.
 */
export function readMarkdownSkillFiles(skillsRoot: string, dir: string): MarkdownSkillFiles {
  const base = sousRacine(skillsRoot, dir);
  const skillMd = readFileSync(sousRacine(base, 'SKILL.md'), 'utf-8');
  const refDir = sousRacine(base, 'references');
  const present = existsSync(refDir)
    ? readdirSync(refDir)
        .filter((f) => f.endsWith('.md') && NOM_SIMPLE.test(f))
        .sort()
    : [];
  const cited: string[] = [];
  for (const m of skillMd.matchAll(/\(references\/([^)]+\.md)\)/g)) {
    if (present.includes(m[1]) && !cited.includes(m[1])) cited.push(m[1]);
  }
  const ordered = [...cited, ...present.filter((f) => !cited.includes(f))];
  const references = new Map<string, string>();
  for (const f of ordered)
    references.set(`references/${f}`, readFileSync(sousRacine(refDir, f), 'utf-8'));
  return { dir, skillMd, references };
}

export function readMarkdownSkills(skillsRoot: string): MarkdownSkill[] {
  return listMarkdownSkillDirs(skillsRoot).map((dir) =>
    parseMarkdownSkill(readMarkdownSkillFiles(skillsRoot, dir))
  );
}
