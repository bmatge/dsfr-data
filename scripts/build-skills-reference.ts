/**
 * Genere `apps/builder-ia/src/skills-reference.generated.ts` depuis le
 * custom-elements manifest (issue #512).
 *
 * Chaine complete :
 *   1. `npm run build:cem`       -> packages/core/custom-elements.json
 *   2. `npm run build:skills-ref` -> apps/builder-ia/src/skills-reference.generated.ts
 *   3. `skills.ts` importe la reference et la concatene au guide redige a la main
 *
 * Ce que la generation apporte : les attributs, types, defauts, methodes
 * publiques, evenements, slots et variables CSS de chaque composant sont
 * exhaustifs PAR CONSTRUCTION. La partie redigee a la main (guide, exemples,
 * pieges) reste la valeur ajoutee humaine.
 *
 * Point cle : les evenements du pipeline ne sont pas ecrits a la main. Ils sont
 * derives du mixin porte par le composant (`TransformerMixin` /
 * `SourceSubscriberMixin`), que le manifeste enregistre. Un composant qui change
 * de mixin voit sa reference suivre toute seule.
 *
 * Usage : npx vite-node scripts/build-skills-reference.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildReferences, type CemManifest } from './lib/cem-reference.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const manifestPath = resolve(root, 'packages/core/custom-elements.json');
const outPath = resolve(root, 'apps/builder-ia/src/skills-reference.generated.ts');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as CemManifest;
const references = buildReferences(manifest);
const tags = Object.keys(references);

if (tags.length === 0) {
  throw new Error(`Aucun custom element dans ${manifestPath}. Lancer "npm run build:cem" d'abord.`);
}

const entries = tags
  .map((tag) => `  ${JSON.stringify(tag)}: ${JSON.stringify(references[tag])},`)
  .join('\n');
const file = `/* eslint-disable */
/**
 * FICHIER GENERE — NE PAS EDITER A LA MAIN.
 *
 * Source : packages/core/custom-elements.json (custom-elements manifest)
 * Regenerer : npm run build:skills-ref  (ou npm run build:skills, qui enchaine
 * l'analyse CEM puis cette generation).
 *
 * Toute edition manuelle sera ecrasee. Pour changer le contenu, modifier le
 * JSDoc du composant dans packages/core/src/components/ puis regenerer.
 *
 * Le garde-fou tests/apps/builder-ia/skills-reference.test.ts verifie que ce
 * fichier est aligne sur les composants reels (introspection Lit runtime).
 */

/** Section « reference » generee, indexee par tag name. */
export const COMPONENT_REFERENCES: Record<string, string> = {
${entries}
};

/**
 * Reference generee d'un ou plusieurs composants, prete a etre concatenee au
 * guide redige a la main d'une skill.
 */
export function reference(...tags: string[]): string {
  return tags
    .map((tag) => {
      const md = COMPONENT_REFERENCES[tag];
      if (!md) throw new Error(\`Reference generee absente pour <\${tag}> — relancer npm run build:skills\`);
      return md;
    })
    .join('\\n');
}
`;

writeFileSync(outPath, file);

const bytes = Buffer.byteLength(file, 'utf-8');
console.log(
  `skills-reference.generated.ts : ${tags.length} composants, ${(bytes / 1024).toFixed(1)} Ko -> ${outPath}`
);
