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
 * Acces disque : tout chemin vient d'une config d'app (constantes commitees),
 * mais il est quand meme borne a la racine du depot (`sousRacine`) avant tout
 * acces, et aucun fichier n'est teste avant d'etre lu ou ecrit (pas de fenetre
 * entre le test et l'usage : on lit dans un try/catch sur ENOENT).
 *
 * Usage : npx vite-node scripts/build-reperes.ts [--check]
 *   --check : ne recrit rien, sort en erreur si un probleme est trouve ou si un
 *             registre commite n'est pas le rendu exact de l'extraction (CI).
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, relative, resolve } from 'path';
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

/**
 * Chemin absolu de `morceaux` sous la racine du depot. Leve si le chemin
 * resolu en sort (`..`, chemin absolu dans une config) : un generateur de build
 * n'a rien a lire ni ecrire ailleurs.
 */
function sousRacine(...morceaux: string[]): string {
  const abs = resolve(root, ...morceaux);
  const rel = relative(root, abs);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Chemin hors du depot refuse : ${morceaux.join('/')}`);
  }
  return abs;
}

/** Contenu du fichier, ou null s'il n'existe pas (toute autre erreur remonte). */
function lireSiPresent(abs: string): string | null {
  try {
    return readFileSync(abs, 'utf-8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

function source(abs: string): FichierSource | null {
  const contenu = lireSiPresent(abs);
  return contenu === null ? null : { chemin: relative(root, abs).split('\\').join('/'), contenu };
}

const manifest = JSON.parse(
  readFileSync(sousRacine('packages/core/custom-elements.json'), 'utf-8')
) as CemManifest;

const problemes: Probleme[] = [];
const avertissements: Probleme[] = [];
const perimes: string[] = [];
let ecrits = 0;

/** Noms des fichiers d'un dossier, ou [] s'il n'existe pas (ou si `apps/X` est un fichier). */
function listerSiPresent(abs: string): string[] {
  try {
    return readdirSync(abs);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return [];
    throw e;
  }
}

// Apps actives : celles qui declarent une configuration de reperes. Une config
// qui echoue a l'import fait echouer le script : on ne la saute jamais.
const apps = readdirSync(sousRacine('apps'))
  .filter((app) =>
    listerSiPresent(sousRacine('apps', app, 'src/assistant')).includes('reperes.config.ts')
  )
  .sort();

for (const app of apps) {
  const mod = (await import(sousRacine('apps', app, 'src/assistant/reperes.config.ts'))) as {
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
    const f = source(sousRacine('apps', app, s));
    if (!f) {
      problemes.push({ fichier: `apps/${app}/${s}`, message: 'source declaree introuvable' });
      continue;
    }
    sources.push(f);
  }
  const res = extraireReperes({
    config,
    sources,
    manifest,
    prerequis: config.prerequis
      ? (source(sousRacine('apps', app, config.prerequis)) ?? undefined)
      : undefined,
    constats: (config.constats ?? [])
      .map((c) => source(sousRacine(c)))
      .filter((f): f is FichierSource => f !== null),
  });
  problemes.push(...res.problemes);
  avertissements.push(...res.avertissements);

  const sortie = sousRacine('apps', app, 'src/assistant/reperes.generated.ts');
  const rendu = rendreRegistre(config, res.reperes);
  console.log(`${app} : ${res.reperes.length} repere(s)`);
  if (lireSiPresent(sortie) !== rendu) {
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
