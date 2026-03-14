/**
 * Generate dist/skills.json from the builder-IA skills definitions.
 * This file is served statically in production and consumed by the MCP server.
 *
 * Usage: npx vite-node scripts/build-skills-json.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SKILLS } from '../apps/builder-ia/src/skills.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'dist');

mkdirSync(outDir, { recursive: true });

const skills = Object.values(SKILLS).map(s => ({
  id: s.id,
  name: s.name,
  description: s.description,
  trigger: s.trigger,
  content: s.content,
}));

const outPath = resolve(outDir, 'skills.json');
writeFileSync(outPath, JSON.stringify(skills, null, 2));

console.log(`skills.json generated (${skills.length} skills) -> ${outPath}`);
