import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { SKILLS } from '../packages/shared/src/skills/skills.js';
import { CLAUDE_SKILL_DIR } from '../scripts/lib/claude-skill.js';
import {
  parseFrontmatter,
  parseMarkdownSkill,
  parseTriggers,
  skillIdFromDir,
} from '../scripts/lib/markdown-skills.js';
import {
  listMarkdownSkillDirs,
  readMarkdownSkillFiles,
} from '../scripts/lib/markdown-skills-fs.js';
import { searchSkills } from '../packages/shared/src/ia/skill-matching.js';

/**
 * Skills écrites à la main dans skills/<nom>/ (ADR-136), à côté de la skill
 * générée. Elles ne sont pas produites par le build, donc rien ne garantit
 * leur forme : ce test tient lieu de générateur. Il vérifie (1) la forme lue
 * par Claude Code (frontmatter name/description, comme la skill générée),
 * (2) que chaque référence citée existe et que chaque référence présente est
 * citée, (3) que la skill remonte par le moteur de matching partagé
 * builder-IA / MCP sur des questions métier, sans passer devant la skill
 * technique sur une question de syntaxe.
 */
const root = resolve(__dirname, '..');
const skillsRoot = resolve(root, 'skills');
const dirs = listMarkdownSkillDirs(skillsRoot);

describe('skills écrites à la main (skills/<nom>/, hors skill générée)', () => {
  it('la skill générée est exclue de la découverte', () => {
    expect(dirs).not.toContain(CLAUDE_SKILL_DIR.split('/').pop());
    expect(dirs).toContain('dataviz-metier');
  });

  it("l'id suit la convention camelCase des skills du builder-IA", () => {
    expect(skillIdFromDir('dataviz-metier')).toBe('datavizMetier');
    const ids = new Set(Object.keys(SKILLS));
    for (const d of dirs) expect(ids.has(skillIdFromDir(d)), `${d} : id déjà pris`).toBe(false);
  });

  it('parseFrontmatter / parseTriggers', () => {
    const { fields, body } = parseFrontmatter(
      '---\nname: x\ndescription: "y: z"\n---\n# T\n\n> Déclencheurs : a, `b`, c\n'
    );
    expect(fields).toEqual({ name: 'x', description: 'y: z' });
    expect(parseTriggers(body)).toEqual(['a', 'b', 'c']);
    expect(parseTriggers('rien')).toEqual([]);
  });

  for (const dir of dirs) {
    describe(`skills/${dir}`, () => {
      const files = readMarkdownSkillFiles(skillsRoot, dir);
      const skill = parseMarkdownSkill(files);

      it('SKILL.md commence par un frontmatter name/description, comme la skill générée', () => {
        expect(files.skillMd.startsWith(`---\nname: ${dir}\ndescription: `)).toBe(true);
        expect(skill.name).toBe(dir);
        expect(skill.description.length).toBeGreaterThan(80);
        expect(
          skill.trigger.length,
          'aucun déclencheur : la skill ne remonterait que par signaux faibles'
        ).toBeGreaterThan(5);
      });

      it('chaque référence citée existe, chaque référence présente est citée', () => {
        const cited = [...files.skillMd.matchAll(/\(references\/([^)]+\.md)\)/g)].map((m) => m[1]);
        expect(cited.length).toBeGreaterThan(0);
        for (const c of cited) {
          expect(existsSync(resolve(skillsRoot, dir, 'references', c)), `${c} manquante`).toBe(
            true
          );
        }
        for (const rel of files.references.keys()) {
          const f = rel.slice('references/'.length);
          expect(cited, `${f} présente mais non citée dans SKILL.md`).toContain(f);
        }
        // Les liens croisés entre références pointent vers des fichiers existants.
        for (const [rel, content] of files.references) {
          for (const m of content.matchAll(/\]\(([a-z0-9-]+\.md)\)/g)) {
            expect(
              existsSync(resolve(skillsRoot, dir, 'references', m[1])),
              `${rel} → ${m[1]} manquante`
            ).toBe(true);
          }
        }
      });

      it('le contenu servi par skills.json est autoportant (corps + références)', () => {
        for (const rel of files.references.keys())
          expect(skill.content).toContain(`<!-- ${rel} -->`);
        expect(skill.content.startsWith('---')).toBe(false);
      });
    });
  }
});

describe('matching de dataviz-metier par le moteur partagé builder-IA / MCP', () => {
  const metier = parseMarkdownSkill(readMarkdownSkillFiles(skillsRoot, 'dataviz-metier'));
  const all = [...Object.values(SKILLS), metier];

  const remonte = (message: string) =>
    searchSkills(all, message, { limit: 6 }).map((m) => m.skill.id);

  it.each([
    'quel graphique choisir pour montrer la part des femmes par région ?',
    'ce score moyen a-t-il un sens ? une moyenne de pourcentages',
    'peux-tu relire cette page de dataviz avec un regard éditorial',
    'au-dessus de la moyenne est-ce une bonne nouvelle pour cet indicateur',
    'que faire des données manquantes et du groupe null dans ce camembert',
    'ajoute une phrase de lecture et une ligne de référence sur cette courbe',
  ])('remonte sur « %s »', (message) => {
    expect(remonte(message)).toContain('datavizMetier');
  });

  it.each([
    'quels attributs pour dsfr-data-source en mode opendatasoft avec server-side',
    'erreur : la carte leaflet reste vide, marker cluster',
  ])('ne passe pas devant la skill technique sur « %s »', (message) => {
    const ids = remonte(message);
    expect(ids[0]).not.toBe('datavizMetier');
  });
});
