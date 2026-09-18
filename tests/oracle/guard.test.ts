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

/**
 * L'UNIQUE dérogation, et sa raison.
 *
 * Un tableau de bord exporté n'est pas un balisage qu'on écrit : c'est
 * `generateDashboardHTML` qui le produit, et c'est précisément lui que le lot
 * « export Studio » met à l'épreuve (sources dédiées #765, agrégat serveur d'un
 * KPI #810). Le recopier à la main dans le manifeste reviendrait à contrôler la
 * copie plutôt que le générateur.
 *
 * Ce que la dérogation ne permet pas : elle vaut pour le SEUL fichier de
 * fixtures qui construit ce balisage, et le garde ne descend pas dans le graphe
 * de la lib depuis lui (les spécifieurs `packages/` ne sont pas suivis). Rien
 * du calcul ne passe par là — l'oracle recalcule toujours depuis les lignes
 * brutes, en tableaux nus.
 */
const DEROGATIONS: Array<{ fichier: string; specifieur: RegExp }> = [
  {
    fichier: 'tests/verif-donnees/fixtures-export-studio.ts',
    specifieur: /^\.\.\/\.\.\/packages\/shared\/src\/dashboard\//,
  },
];

const INTERDITS = [
  { test: (s: string) => s.includes('packages/'), nom: 'packages/' },
  { test: (s: string) => s.startsWith('@dsfr-data/'), nom: '@dsfr-data/*' },
  { test: (s: string) => s.startsWith('@/'), nom: 'alias @/' },
];

/**
 * Le SENS de la dépendance, et pas seulement son contenu.
 *
 * `tools/oracle` est le moteur, `tests/verif-donnees` sont ses données : les
 * manifestes importent le moteur, jamais l'inverse. Un moteur qui irait lire
 * les manifestes lui-même ne serait plus appelable sur autre chose qu'eux —
 * un test unitaire devrait alors charger tous les contrôles du dépôt pour
 * éprouver une fonction de rendu — et le graphe deviendrait circulaire.
 * Ce qu'il faut savoir des contrôles se PASSE en paramètre (`FicheBanc`).
 *
 * Une exception, et une seule : `tools/oracle/run.ts` n'est pas un module du
 * moteur mais le POINT D'ENTRÉE de `npm run verif:expected` — la racine de
 * composition, dont le travail est précisément de rapprocher le moteur et les
 * manifestes. Comme le spec Playwright, et pour la même raison.
 */
const RACINES_DE_COMPOSITION = ['tools/oracle/run.ts', 'tools/oracle/manifests.ts'];

function importeSesDonnees(depuisRelatif: string, cibleRelative: string): boolean {
  if (RACINES_DE_COMPOSITION.includes(depuisRelatif)) return false;
  return depuisRelatif.startsWith('tools/oracle/') && cibleRelative.startsWith('tests/');
}

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
      const relatif = relative(RACINE, fichier);
      const derogation = DEROGATIONS.find((d) => d.fichier === relatif);
      for (const specifieur of importsDe(source)) {
        if (derogation?.specifieur.test(specifieur)) continue;
        const interdit = INTERDITS.find((i) => i.test(specifieur));
        if (interdit) {
          fautifs.push(`${relatif} → ${specifieur} (${interdit.nom})`);
          continue;
        }
        const suivant = resoudre(fichier, specifieur);
        if (!suivant) continue;
        const cible = relative(RACINE, suivant);
        if (importeSesDonnees(relatif, cible)) {
          fautifs.push(`${relatif} → ${specifieur} (le moteur importe ses données : ${cible})`);
          continue;
        }
        aVoir.push(suivant);
      }
    }

    expect(fautifs).toEqual([]);
    // Le garde ne prouve rien s'il n'a rien parcouru.
    expect(vus.size).toBeGreaterThan(5);
  });

  it('suit les imports JSON des jeux sans les refuser ni les parcourir (#879)', () => {
    // Les lignes des fixtures vivent dans `tests/verif-donnees/jeux/*.json`
    // depuis le lot 2 : un spécifieur `./jeux/x.json` n'est ni un interdit
    // (rien de `packages/`) ni un module TypeScript à parcourir. Le garde le
    // laisse passer — et ce test s'assure qu'il en a bien rencontré, sinon
    // la tolérance ne serait qu'un cas jamais exercé.
    const fixtures = fichiersTs(resolve(RACINE, 'tests/verif-donnees')).filter((f) =>
      /fixtures.*\.ts$/.test(f)
    );
    const specifieursJson = fixtures.flatMap((f) =>
      importsDe(readFileSync(f, 'utf-8')).filter((s) => s.endsWith('.json'))
    );
    expect(specifieursJson.length).toBeGreaterThan(20);
    for (const s of specifieursJson) {
      expect(s.startsWith('./jeux/')).toBe(true);
      expect(INTERDITS.find((i) => i.test(s))).toBeUndefined();
      expect(resoudre(resolve(RACINE, 'tests/verif-donnees/fixtures.ts'), s)).toBeNull();
    }
  });

  it('refuse un import de `tests/verif-donnees` depuis `tools/oracle`', () => {
    // La règle porte sur le SENS : le manifeste importe le moteur, jamais
    // l'inverse. Éprouvée ici sur la fonction elle-même, pour qu'elle ne puisse
    // pas se relâcher en silence le jour où plus aucun fichier ne la déclenche.
    expect(importeSesDonnees('tools/oracle/banc.ts', 'tests/verif-donnees/index.ts')).toBe(true);
    expect(importeSesDonnees('tests/oracle/banc.test.ts', 'tests/verif-donnees/banc.ts')).toBe(
      false
    );
    // La racine de composition, elle, a le droit — c'est son rôle.
    expect(importeSesDonnees('tools/oracle/run.ts', 'tests/verif-donnees/index.ts')).toBe(false);
    expect(importeSesDonnees('tests/verif-donnees/banc.ts', 'tools/oracle/manifest.ts')).toBe(
      false
    );
    expect(importeSesDonnees('tools/oracle/report.ts', 'tools/oracle/banc.ts')).toBe(false);
  });

  it('la dérogation vise un fichier qui existe, et lui seul', () => {
    // Une dérogation devenue sans objet est une porte laissée ouverte : elle
    // s'enlève avec le fichier qu'elle couvrait.
    for (const { fichier } of DEROGATIONS) {
      expect(existsSync(resolve(RACINE, fichier)), `${fichier} absent`).toBe(true);
    }
    expect(DEROGATIONS.map((d) => d.fichier)).toEqual([
      'tests/verif-donnees/fixtures-export-studio.ts',
    ]);
    // Et elle ne couvre que le générateur d'export, pas la lib entière.
    const { specifieur } = DEROGATIONS[0];
    expect(specifieur.test('../../packages/shared/src/dashboard/export-html.js')).toBe(true);
    expect(specifieur.test('../../packages/core/src/utils/aggregations.js')).toBe(false);
    expect(specifieur.test('../../packages/shared/src/query/filter-translator.js')).toBe(false);
  });
});
