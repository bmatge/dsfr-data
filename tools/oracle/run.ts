/**
 * `npm run verif:expected` — télécharge les lignes brutes de chaque contrôle
 * VIVANT et écrit les valeurs ATTENDUES dans `tools/oracle/out/expected.json`.
 * Le spec Playwright `e2e/verif-donnees.spec.ts` rend ensuite le balisage et
 * compare. Les deux côtés lisent l'API au même moment : l'attendu est produit
 * juste avant le rendu, jamais la veille.
 *
 * Les contrôles déterministes n'ont pas besoin de ce passage : leurs lignes
 * sont dans le dépôt, le spec les recalcule lui-même.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { controlesDuMode } from '../../tests/verif-donnees/index.js';
import { resoudreFeed } from './raw.js';
import { computeExpectedFor, type ExpectedCheck } from './expected.js';
import { DOSSIER_SORTIE } from './report.js';

export async function computeExpected(): Promise<ExpectedCheck[]> {
  const out: ExpectedCheck[] = [];
  for (const { domaine, check } of controlesDuMode('live')) {
    const datasets = await resoudreFeed(check.feed);
    const attendu = computeExpectedFor(check, datasets);
    out.push(attendu);
    process.stdout.write(
      `${domaine}/${check.id}: ${attendu.rawRows} lignes brutes, ` +
        `${Object.keys(attendu.values).length} attendu(s)\n`
    );
  }
  return out;
}

const OUT = resolve(DOSSIER_SORTIE, 'expected.json');

const expected = await computeExpected();
mkdirSync(DOSSIER_SORTIE, { recursive: true });
writeFileSync(OUT, JSON.stringify(expected, null, 2));
process.stdout.write(`→ ${OUT}\n`);
