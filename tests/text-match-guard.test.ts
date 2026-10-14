import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Garde ADR-159, lot 4 (#1285) : la comparaison de texte du navigateur n'a
 * qu'une écriture, `packages/shared/src/query/text-match.ts` — le filtre
 * `contains` (sous-chaîne, casse ignorée, accents respectés) et la recherche
 * tolérante. Il y en avait trois pour le filtre (`applyLocalFilter`,
 * `_matchesFilter` de `dsfr-data-query`, `applyWhereFilter` du Studio), plus
 * `contains()` de `compute` et la recherche de `dsfr-data-search`.
 *
 * Recherche statique, commentaires retirés : toute forme
 * `….toLowerCase().includes(` ou `….toLowerCase().indexOf(` hors du module
 * échoue, sauf les exceptions déclarées ci-dessous avec leur raison. Une
 * exception qui ne couvre plus rien fait échouer le test (même mécanique que
 * `lib-provider-neutrality.test.ts`) : la liste ne peut que rétrécir.
 *
 * Pour comparer un texte de données : `filterTextContains` (filtre) ou
 * `matchesSearch` / `normalizeSearchText` (recherche), de `@dsfr-data/shared/lib`.
 */

const ROOT = join(__dirname, '..');
const MODULE = 'packages/shared/src/query/text-match.ts';
const SCANNED = [
  'packages/core/src',
  'packages/shared/src',
  'packages/app-ui/src',
  ...readdirSync(join(ROOT, 'apps'))
    .map((app) => `apps/${app}/src`)
    .filter((dir) => {
      try {
        return statSync(join(ROOT, dir)).isDirectory();
      } catch {
        return false;
      }
    }),
];
const MOTIF = /\.toLowerCase\(\)\s*\.(includes|indexOf)\(/;

interface Exception {
  file: string;
  /** Nombre exact d'occurrences couvertes dans ce fichier. */
  count: number;
  reason: string;
}

/**
 * Comparaisons qui ne portent PAS sur les lignes d'un jeu filtré par la
 * bibliothèque : interface d'une application, ou recherche propre d'un
 * composant laissée hors du lot 4.
 */
const EXCEPTIONS: readonly Exception[] = [
  {
    file: 'packages/core/src/components/dsfr-data-list.ts',
    count: 1,
    reason:
      'Recherche intégrée de dsfr-data-list (attribut `search`) : tous les champs, casse ' +
      'ignorée, accents RESPECTÉS — ce n’est ni le filtre ni la recherche tolérante de ' +
      'dsfr-data-search. La rapprocher de `matchesSearch` changerait des résultats : hors du ' +
      'lot 4, à trancher (#1285).',
  },
  {
    file: 'packages/core/src/components/dsfr-data-facets.ts',
    count: 2,
    reason:
      'Champ de recherche parmi les VALEURS d’une facette (#928) : une liste de choix, pas ' +
      'les lignes du jeu.',
  },
  {
    file: 'apps/favorites/src/main.ts',
    count: 1,
    reason: 'Recherche parmi les favoris de l’utilisateur (interface de l’application).',
  },
  {
    file: 'apps/sources/src/connections/connection-manager.ts',
    count: 3,
    reason: 'Recherche parmi les tables d’une connexion (interface de l’application).',
  },
  {
    file: 'apps/builder-carto/src/composition-echelle.ts',
    count: 1,
    reason: 'Reconnaissance d’un NOM de colonne (« code ») pour proposer un champ géographique.',
  },
];

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      out.push(...collectTsFiles(full));
    } else if (
      entry.endsWith('.ts') &&
      !entry.endsWith('.d.ts') &&
      !entry.includes('.generated.')
    ) {
      out.push(full);
    }
  }
  return out;
}

/** Commentaires de bloc et de ligne (en début de ligne ou après un blanc) retirés. */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** Occurrences du motif, par fichier relatif au dépôt. */
function occurrences(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const dir of SCANNED) {
    for (const file of collectTsFiles(join(ROOT, dir))) {
      const rel = relative(ROOT, file).split('\\').join('/');
      if (rel === MODULE) continue;
      const lines = stripComments(readFileSync(file, 'utf-8')).split('\n');
      lines.forEach((line, i) => {
        const hits = line.match(new RegExp(MOTIF.source, 'g'));
        for (let k = 0; hits && k < hits.length; k++) {
          const list = found.get(rel) ?? [];
          list.push(`${rel}:${i + 1} ${line.trim()}`);
          found.set(rel, list);
        }
      });
    }
  }
  return found;
}

describe('une seule écriture de la comparaison de texte (ADR-159, lot 4)', () => {
  const found = occurrences();

  it('le module partagé porte la comparaison', () => {
    const code = readFileSync(join(ROOT, MODULE), 'utf-8');
    expect(MOTIF.test(code)).toBe(true);
  });

  it('aucune autre écriture de la sous-chaîne hors du module et des exceptions', () => {
    const offenders: string[] = [];
    for (const [file, hits] of found) {
      const exc = EXCEPTIONS.find((e) => e.file === file);
      if (!exc) offenders.push(...hits);
      else if (hits.length > exc.count) offenders.push(...hits);
    }
    expect(
      offenders,
      `Comparer un texte de données par \`filterTextContains\` ou \`matchesSearch\` ` +
        `(${MODULE}), ou déclarer l’exception avec sa raison.`
    ).toEqual([]);
  });

  it('aucune exception morte ni trop large', () => {
    const stale = EXCEPTIONS.filter((e) => (found.get(e.file)?.length ?? 0) !== e.count).map(
      (e) => `${e.file} : ${found.get(e.file)?.length ?? 0} occurrence(s), ${e.count} déclarée(s)`
    );
    expect(stale).toEqual([]);
  });

  it('les trois anciennes écritures du filtre appellent le module', () => {
    const lecteurs = [
      'packages/shared/src/query/filter-translator.ts',
      'packages/core/src/components/dsfr-data-query.ts',
      'packages/shared/src/ia/data-tools.ts',
      'packages/shared/src/utils/compute.ts',
    ];
    for (const file of lecteurs) {
      expect(readFileSync(join(ROOT, file), 'utf-8'), file).toMatch(/filterTextContains\(/);
    }
  });
});
