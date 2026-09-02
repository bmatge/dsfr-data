import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { SKILLS } from '../apps/builder-ia/src/skills.js';
import { CLAUDE_SKILL_DIR, renderClaudeSkill } from '../scripts/lib/claude-skill.js';
import { PROXY_BASE_URL_EMBED, LIB_URL } from '@dsfr-data/shared';

/**
 * Export « skill Claude Code » (skills/dsfr-data/, docs/AI-SKILLS.md) : les
 * fichiers commités doivent être le rendu exact des skills du builder-IA —
 * même garde-fou que pour la référence générée (#512). Échec typique : une
 * skill modifiée sans `npm run build:skills`.
 */
const root = resolve(__dirname, '..');
const dir = resolve(root, CLAUDE_SKILL_DIR);
const version = (
  JSON.parse(readFileSync(resolve(root, 'packages/core/package.json'), 'utf-8')) as {
    version: string;
  }
).version;

describe('export skill Claude Code (skills/dsfr-data)', () => {
  const expected = renderClaudeSkill(Object.values(SKILLS), version, {
    proxyBase: PROXY_BASE_URL_EMBED,
    libUrl: LIB_URL,
  });

  it('SKILL.md a un frontmatter name/description et un index de toutes les skills', () => {
    const md = expected.get('SKILL.md')!;
    expect(md.startsWith('---\nname: dsfr-data\ndescription: ')).toBe(true);
    for (const s of Object.values(SKILLS)) {
      expect(md, `${s.id} absente de l'index`).toContain(`references/`);
      expect(md).toContain(`[${s.name.replace(/\|/g, '\\|')}](`);
    }
  });

  it('chaque skill a sa référence et aucun fichier orphelin ne traîne', () => {
    const files = readdirSync(resolve(dir, 'references')).sort();
    const rendered = [...expected.keys()]
      .filter((k) => k.startsWith('references/'))
      .map((k) => k.slice('references/'.length))
      .sort();
    expect(files).toEqual(rendered);
  });

  it('les fichiers commités sont le rendu exact des skills', () => {
    for (const [rel, content] of expected) {
      const path = resolve(dir, rel);
      expect(existsSync(path), `${rel} manquant — relancer "npm run build:skills"`).toBe(true);
      expect(readFileSync(path, 'utf-8'), `${rel} obsolète — relancer "npm run build:skills"`).toBe(
        content
      );
    }
  });
});
