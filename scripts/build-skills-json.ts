/**
 * Generate dist/skills.json from the builder-IA skills definitions.
 * This file is served statically in production and consumed by the MCP server.
 *
 * Genere aussi `dist/skills-meta.json`, le TAMPON DE FRAICHEUR (#733).
 *
 * Pourquoi un fichier a part plutot qu'un en-tete dans skills.json : le
 * document est un TABLEAU au premier niveau, et des consommateurs deja
 * deployes le lisent tel quel depuis
 * https://chartsbuilder.miweb.run/dist/skills.json (serveur MCP distribue
 * separement de l'instance, client skills du studio qui teste `Array.isArray`).
 * Passer a un objet les casserait tous ; le sidecar est purement additif, et il
 * est ecrit par le meme script, donc jamais desynchronise.
 *
 * A quoi il sert : rien ne deploie le VPS automatiquement, la mise en
 * production est un `ssh vps "spawn up"` manuel. Sans date ni version, un
 * lecteur de la fiche ne peut pas distinguer « le code ne documente pas X » de
 * « l'instance servie est en retard ». Trois agents s'y sont trompes le meme
 * jour (#733).
 *
 * Usage: npx vite-node scripts/build-skills-json.ts
 */

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SKILLS } from '../packages/shared/src/skills/skills.js';
import {
  splitSkillContent,
  availableSections,
} from '../packages/shared/src/skills/skills-sections.js';
import { readMarkdownSkills } from './lib/markdown-skills-fs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'packages/core/dist');

mkdirSync(outDir, { recursive: true });

// Skills ecrites a la main dans skills/<nom>/ (ADR-136) : la skill metier
// `dataviz-metier` n'a pas de source dans le code, son markdown EST la source.
// Elle est AJOUTEE apres les skills du builder-IA, jamais melangee : le
// builder-IA (`getRelevantSkills` sur SKILLS) ne la voit pas, le serveur MCP
// et le client skills du studio (qui lisent skills.json) la voient.
const markdownSkills = readMarkdownSkills(resolve(root, 'skills'));

// `content` reste l'agregat historique : les consommateurs deja en place
// (https://chartsbuilder.miweb.run/dist/skills.json) ne voient aucun changement.
// `sections` est additif — le serveur MCP s'en sert pour `get_skill(id, section)`
// sans rejouer le decoupage de son cote (#513).
//
// `index` / `levels` / `references` (#1035) : une skill ecrite a la main et
// multiniveau (`dataviz-metier`) est adressable par niveau et par reference —
// `get_skill(id, niveau: "base")`, `get_skill(id, reference: "choisir-la-forme")`.
// Additif lui aussi : `content` garde l'agregat, les quatre `sections` restent
// une partition de ce `content`. Le decoupage vient du dossier de la skill
// (`scripts/lib/markdown-skills.ts`), la selection de
// `packages/shared/src/ia/skill-levels.ts` (copiee dans le serveur MCP).
const skills = [
  ...Object.values(SKILLS).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    trigger: s.trigger,
    content: s.content,
    sections: splitSkillContent(s.content),
    availableSections: availableSections(s.content),
  })),
  ...markdownSkills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    trigger: s.trigger,
    content: s.content,
    sections: splitSkillContent(s.content),
    availableSections: availableSections(s.content),
    ...(s.levels ? { index: s.index, levels: s.levels, references: s.references } : {}),
  })),
];

const outPath = resolve(outDir, 'skills.json');
writeFileSync(outPath, JSON.stringify(skills, null, 2));

// ---------------------------------------------------------------------------
// Tampon de fraicheur (#733)
// ---------------------------------------------------------------------------

/**
 * Commit court. `DSFR_DATA_COMMIT` prime : un build Docker n'a pas forcement
 * le depot git, et la CI connait le SHA sans lui. Sans rien, « inconnu » —
 * l'absence de commit est une information, pas une erreur de build.
 */
function commitCourt(): string {
  const fourni = process.env.DSFR_DATA_COMMIT?.trim();
  if (fourni) return fourni.slice(0, 12);
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'inconnu';
  }
}

const libVersion = (
  JSON.parse(readFileSync(resolve(root, 'packages/core/package.json'), 'utf-8')) as {
    version: string;
  }
).version;

const meta = {
  generatedAt: new Date().toISOString(),
  libVersion,
  commit: commitCourt(),
  skills: skills.length,
};

const metaPath = resolve(outDir, 'skills-meta.json');
writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

const bytes = Buffer.byteLength(JSON.stringify(skills), 'utf-8');
console.log(
  `skills.json generated (${skills.length} skills dont ${markdownSkills.length} écrite(s) à la main : ${markdownSkills.map((s) => s.id).join(', ') || '—'}, ${(bytes / 1024).toFixed(1)} Ko) -> ${outPath}`
);
console.log(
  `skills-meta.json generated (lib ${meta.libVersion}, commit ${meta.commit}, ${meta.generatedAt}) -> ${metaPath}`
);
