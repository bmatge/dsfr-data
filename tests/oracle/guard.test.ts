import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * L'oracle ne vaut que par son INDÉPENDANCE : s'il importait l'adaptateur ODS,
 * les agrégations ou la traduction de filtres de la lib, il se tromperait de
 * la même façon qu'elle et ne verrait rien.
 *
 * Le garde ne se contente donc pas de lire les fichiers de `tools/oracle` : il
 * parcourt TOUT LE GRAPHE atteignable depuis le moteur et depuis les
 * manifestes (`tests/verif-donnees`), et refuse `packages/`, `@dsfr-data/*` ou
 * l'alias `@/` où que ce soit dedans. Un fichier neuf y entre sans rien avoir
 * à déclarer — c'est le point : personne n'a à penser à l'ajouter.
 */

const RACINE = resolve(__dirname, '../..');

/** Points d'entrée : le moteur, et les manifestes qui s'en servent. */
const ENTREES = ['tools/oracle', 'tests/verif-donnees'];

const INTERDITS = [
  { test: (s: string) => s.includes('packages/'), nom: 'packages/' },
  { test: (s: string) => s.startsWith('@dsfr-data/'), nom: '@dsfr-data/*' },
  { test: (s: string) => s.startsWith('@/'), nom: 'alias @/' },
];

function fichiersTs(dir: string): string[] {
  const out: string[] = [];
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) {
      out.push(...fichiersTs(chemin));
      continue;
    }
    if (entree.endsWith('.ts')) out.push(chemin);
  }
  return out;
}

/** Spécifieurs importés par un fichier (`import … from`, `export … from`, `import(...)`). */
function importsDe(source: string): string[] {
  const specifieurs: string[] = [];
  for (const m of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) specifieurs.push(m[1]);
  for (const m of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specifieurs.push(m[1]);
  return specifieurs;
}

/** Résout un spécifieur relatif vers un fichier `.ts` du dépôt, ou null. */
function resoudre(depuis: string, specifieur: string): string | null {
  if (!specifieur.startsWith('.')) return null;
  const brut = resolve(dirname(depuis), specifieur);
  for (const candidat of [
    brut.replace(/\.js$/, '.ts'),
    `${brut}.ts`,
    join(brut, 'index.ts'),
    brut,
  ]) {
    if (existsSync(candidat) && candidat.endsWith('.ts')) return candidat;
  }
  return null;
}

describe('vérification des données — garde d’indépendance', () => {
  it('le moteur et les manifestes n’importent rien de la bibliothèque', () => {
    const aVoir: string[] = [];
    for (const entree of ENTREES) aVoir.push(...fichiersTs(resolve(RACINE, entree)));

    const vus = new Set<string>();
    const fautifs: string[] = [];

    while (aVoir.length > 0) {
      const fichier = aVoir.pop()!;
      if (vus.has(fichier)) continue;
      vus.add(fichier);
      const source = readFileSync(fichier, 'utf-8');
      for (const specifieur of importsDe(source)) {
        const interdit = INTERDITS.find((i) => i.test(specifieur));
        if (interdit) {
          fautifs.push(`${relative(RACINE, fichier)} → ${specifieur} (${interdit.nom})`);
          continue;
        }
        const suivant = resoudre(fichier, specifieur);
        if (suivant) aVoir.push(suivant);
      }
    }

    expect(fautifs).toEqual([]);
    // Le garde ne prouve rien s'il n'a rien parcouru.
    expect(vus.size).toBeGreaterThan(5);
  });
});
