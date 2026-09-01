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
import { splitSkillContent, availableSections } from '../apps/builder-ia/src/skills-sections.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'packages/core/dist');

mkdirSync(outDir, { recursive: true });

// `content` reste l'agregat historique : les consommateurs deja en place
// (https://chartsbuilder.miweb.run/dist/skills.json) ne voient aucun changement.
// `sections` est additif — le serveur MCP s'en sert pour `get_skill(id, section)`
// sans rejouer le decoupage de son cote (#513).
const skills = Object.values(SKILLS).map((s) => ({
  id: s.id,
  name: s.name,
  description: s.description,
  trigger: s.trigger,
  content: s.content,
  sections: splitSkillContent(s.content),
  availableSections: availableSections(s.content),
}));

const outPath = resolve(outDir, 'skills.json');
writeFileSync(outPath, JSON.stringify(skills, null, 2));

const bytes = Buffer.byteLength(JSON.stringify(skills), 'utf-8');
console.log(
  `skills.json generated (${skills.length} skills, ${(bytes / 1024).toFixed(1)} Ko) -> ${outPath}`
);
