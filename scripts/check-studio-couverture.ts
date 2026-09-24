/**
 * Garde-fou de couverture du Studio IA (#1109) — BLOQUANT en CI (etape
 * quality), sur le modele de `check:specs-tables`.
 *
 * Pour chaque composant `dsfr-data-*` et chaque attribut du manifeste
 * `packages/core/custom-elements.json` : soit le Studio sait l'ecrire (mesure
 * sur son export reel, depuis le schema de ses outils — voir
 * `apps/studio/src/couverture.ts`), soit une exclusion est declaree avec sa
 * raison dans `apps/studio/src/couverture-exclusions.ts`.
 *
 * Echoue sur : un composant ou attribut nouveau non tranche, une exclusion
 * devenue fausse (attribut desormais ecrit), une exclusion qui ne vise rien.
 *
 * Usage : npx vite-node scripts/check-studio-couverture.ts
 * Importe `@dsfr-data/shared` : lancer `npm run build:shared` avant.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  attributsEcritsParLeStudio,
  verifierCouverture,
  type ManifesteCem,
} from '../apps/studio/src/couverture.js';
import { EXCLUSIONS } from '../apps/studio/src/couverture-exclusions.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifeste = JSON.parse(
  readFileSync(resolve(root, 'packages/core/custom-elements.json'), 'utf8')
) as ManifesteCem;

const bilan = verifierCouverture(manifeste, attributsEcritsParLeStudio(), EXCLUSIONS);

const lignes: string[] = [
  `Couverture du Studio : ${bilan.composants.ecrits}/${bilan.composants.total} composants écrits.`,
];
for (const [tag, { ecrits, total }] of [...bilan.attributs].sort(([a], [b]) =>
  a.localeCompare(b)
)) {
  lignes.push(`  ${tag} : ${ecrits}/${total} attributs`);
}
process.stdout.write(`${lignes.join('\n')}\n`);

if (bilan.erreurs.length > 0) {
  process.stderr.write(
    `\n${bilan.erreurs.length} écart(s) de couverture non tranché(s) :\n` +
      bilan.erreurs.map((e) => `  - ${e}`).join('\n') +
      '\n'
  );
  process.exit(1);
}
process.stdout.write('Chaque composant et attribut est écrit ou exclu avec sa raison.\n');
