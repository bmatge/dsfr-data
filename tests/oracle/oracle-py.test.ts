import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Le garde d'indépendance de la TROISIÈME VOIX (#880).
 *
 * `tests/oracle/guard.test.ts` parcourt le graphe d'imports TypeScript ;
 * il ne voit pas un programme Python. Celui-ci s'assure par lecture que
 * `tools/oracle-py/` ne rappelle jamais l'oracle TypeScript ni la
 * bibliothèque — pas de sous-processus, pas de `node`, rien de `packages/` —
 * et qu'il ne dépend que de la bibliothèque standard : aucun `pip`, aucun
 * `import pandas`. Un oracle Python qui appellerait l'oracle TS ne serait
 * plus une voix, il serait un écho.
 */

const DOSSIER = resolve(__dirname, '../../tools/oracle-py');

const INTERDITS: Array<{ motif: RegExp; nom: string }> = [
  { motif: /\bsubprocess\b/, nom: 'subprocess' },
  { motif: /os\.(system|popen|exec[lv]p?e?)\b/, nom: 'os.system / os.popen / os.exec*' },
  { motif: /\bnode\b(?!_modules)/i, nom: 'node' },
  { motif: /packages\//, nom: 'packages/' },
  { motif: /\bimport\s+(pandas|numpy|polars|pyarrow)\b/, nom: 'dépendance hors stdlib' },
  { motif: /\bfrom\s+(pandas|numpy|polars|pyarrow)\b/, nom: 'dépendance hors stdlib' },
  { motif: /\b(pip|requirements\.txt|venv)\b/, nom: 'pip / venv' },
];

describe('vérification des données — garde de la troisième voix', () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith('.py'));

  it('il y a un programme, et il ne rappelle ni node, ni la lib, ni une dépendance', () => {
    expect(fichiers).toContain('oracle.py');
    const fautifs: string[] = [];
    for (const fichier of fichiers) {
      const source = readFileSync(resolve(DOSSIER, fichier), 'utf-8');
      // La docstring d'en-tête a le droit de DIRE ce qu'elle n'exécute pas :
      // on lit le code, pas la prose.
      const code = source.replace(/^#!.*\n/, '').replace(/^"""[\s\S]*?"""/m, '');
      for (const { motif, nom } of INTERDITS) {
        if (motif.test(code)) fautifs.push(`${fichier} : ${nom}`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it('n’importe que la bibliothèque standard', () => {
    const STDLIB = new Set([
      '__future__',
      'argparse',
      'decimal',
      'fractions',
      'functools',
      'json',
      'pathlib',
      're',
      'sys',
      'typing',
      'unicodedata',
    ]);
    for (const fichier of fichiers) {
      const source = readFileSync(resolve(DOSSIER, fichier), 'utf-8');
      const modules = [...source.matchAll(/^\s*(?:import|from)\s+([A-Za-z_][\w.]*)/gm)].map(
        (m) => m[1].split('.')[0]
      );
      const horsStdlib = modules.filter((m) => !STDLIB.has(m));
      expect(horsStdlib, `${fichier} importe hors de la liste connue`).toEqual([]);
    }
  });
});
