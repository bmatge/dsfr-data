/**
 * Genere le registre des reperes d'interface de chaque app (#997, epic #992,
 * ADR-143) : `apps/<app>/src/assistant/reperes.generated.ts`.
 *
 * L'equivalent de `build-specs-tables.ts` pour l'interface : le balisage
 * (`data-repere`, `data-zone`, `data-attribut`, `data-prerequis`) est la seule
 * source ; le registre en est le rendu, enrichi de la description des attributs
 * tiree de `packages/core/custom-elements.json`. Jamais edite a la main.
 *
 * Apps actives : celles qui ont un `apps/<app>/src/assistant/reperes.config.ts`
 * (la carto seulement a cette etape, #1002 la balise entierement).
 *
 * L'extraction est dans `scripts/lib/reperes-extract.ts` (pure, testee par
 * `tests/reperes/`) ; ce script ne fait que lire et ecrire les fichiers.
 *
 * Usage : npx vite-node scripts/build-reperes.ts [--check]
 *   --check : ne recrit rien, sort en erreur si un probleme est trouve ou si un
 *             registre commite n'est pas le rendu exact de l'extraction (CI).
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { ReperesConfig } from '../packages/shared/src/ui/reperes-types';
import type { CemManifest } from './lib/cem-reference.js';
import {
  extraireReperes,
  rendreRegistre,
  type FichierSource,
  type Probleme,
} from './lib/reperes-extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const checkOnly = process.argv.includes('--check');

const manifest = JSON.parse(
  readFileSync(resolve(root, 'packages/core/custom-elements.json'), 'utf-8')
) as CemManifest;

function lire(abs: string): FichierSource {
  return { chemin: relative(root, abs).split('\\').join('/'), contenu: readFileSync(abs, 'utf-8') };
}

/** Apps actives : celles qui declarent une configuration de reperes. */
function appsActives(): string[] {
  return readdirSync(resolve(root, 'apps'))
    .filter((app) => existsSync(join(root, 'apps', app, 'src/assistant/reperes.config.ts')))
    .sort();
}

const problemes: Probleme[] = [];
const avertissements: Probleme[] = [];
const perimes: string[] = [];
let ecrits = 0;

for (const app of appsActives()) {
  const dossier = join(root, 'apps', app);
  const mod = (await import(join(dossier, 'src/assistant/reperes.config.ts'))) as {
    default: ReperesConfig;
  };
  const config = mod.default;
  if (config.app !== app) {
    problemes.push({
      fichier: `apps/${app}/src/assistant/reperes.config.ts`,
      message: `config.app vaut « ${config.app} », attendu « ${app} »`,
    });
    continue;
  }
  const sources: FichierSource[] = [];
  for (const s of config.sources) {
    const abs = join(dossier, s);
    if (!existsSync(abs)) {
      problemes.push({ fichier: `apps/${app}/${s}`, message: 'source declaree introuvable' });
      continue;
    }
    sources.push(lire(abs));
  }
  const prerequisAbs = config.prerequis ? join(dossier, config.prerequis) : null;
  const res = extraireReperes({
    config,
    sources,
    manifest,
    prerequis: prerequisAbs && existsSync(prerequisAbs) ? lire(prerequisAbs) : undefined,
    constats: (config.constats ?? [])
      .map((c) => resolve(root, c))
      .filter((abs) => existsSync(abs))
      .map(lire),
  });
  problemes.push(...res.problemes);
  avertissements.push(...res.avertissements);

  const sortie = join(dossier, 'src/assistant/reperes.generated.ts');
  const rendu = rendreRegistre(config, res.reperes);
  const actuel = existsSync(sortie) ? readFileSync(sortie, 'utf-8') : null;
  console.log(`${app} : ${res.reperes.length} repere(s)`);
  if (actuel !== rendu) {
    if (checkOnly) perimes.push(relative(root, sortie));
    else {
      writeFileSync(sortie, rendu);
      ecrits++;
    }
  }
}

if (checkOnly) {
  if (perimes.length) {
    console.error('\n✗ Registre(s) non a jour (relancer npm run build:reperes) :');
    perimes.forEach((f) => console.error(`  ${f}`));
  } else console.log('✓ Registres a jour.');
} else console.log(`Registres reecrits : ${ecrits}`);

if (avertissements.length) {
  console.warn(`\n⚠ ${avertissements.length} avertissement(s) :`);
  avertissements.forEach((p) => console.warn(`  [${p.fichier}] ${p.message}`));
}
if (problemes.length) {
  console.error(`\n✗ ${problemes.length} probleme(s) :`);
  problemes.forEach((p) => console.error(`  [${p.fichier}] ${p.message}`));
  process.exit(1);
}
if (checkOnly && perimes.length) process.exit(1);
