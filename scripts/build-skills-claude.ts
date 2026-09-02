/**
 * Génère l'export « skill Claude Code » dans skills/dsfr-data/ (SKILL.md +
 * references/*.md) depuis les skills du builder-IA. Dernière étape de
 * `npm run build:skills` ; le test tests/skills-export.test.ts vérifie que
 * les fichiers commités sont le rendu exact des skills (docs/AI-SKILLS.md).
 *
 * Usage: npx vite-node scripts/build-skills-claude.ts
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SKILLS } from '../apps/builder-ia/src/skills.js';
import { CLAUDE_SKILL_DIR, renderClaudeSkill } from './lib/claude-skill.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, CLAUDE_SKILL_DIR);
const version = (
  JSON.parse(readFileSync(resolve(root, 'packages/core/package.json'), 'utf-8')) as {
    version: string;
  }
).version;

const files = renderClaudeSkill(Object.values(SKILLS), version);

// Répertoire des références nettoyé pour ne pas laisser de skill retirée.
rmSync(resolve(outDir, 'references'), { recursive: true, force: true });
mkdirSync(resolve(outDir, 'references'), { recursive: true });
for (const [rel, content] of files) writeFileSync(resolve(outDir, rel), content);

const count = readdirSync(resolve(outDir, 'references')).length;
console.log(`skill Claude Code générée (${count} références) -> ${outDir}`);
