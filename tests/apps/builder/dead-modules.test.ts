import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Aucun module mort dans le Builder (#618).
 *
 * CE FICHIER EXISTE A CAUSE D'UN CAS REEL.
 * `apps/builder/src/ui/chart-renderer.ts` (368 lignes) n'avait aucun
 * appelant et ciblait un `#preview-canvas` disparu de l'index — et
 * `tests/apps/builder/chart-renderer.test.ts` (898 lignes) le testait
 * toujours au vert. Une suite qui valide du code que personne n'execute
 * donne une fausse assurance, et masque le fait que le vrai chemin de rendu
 * n'est pas couvert.
 *
 * A ne pas confondre avec `apps/builder-ia/src/ui/chart-renderer.ts`, bien
 * vivant (et vise par #609).
 */

const RACINE = join(__dirname, '../../..');
const SRC = join(RACINE, 'apps/builder/src');

/** Tous les .ts sous apps/builder/src, chemins relatifs a SRC. */
function modules(dir = SRC, prefixe = ''): string[] {
  const out: string[] = [];
  for (const entree of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefixe ? `${prefixe}/${entree.name}` : entree.name;
    if (entree.isDirectory()) out.push(...modules(join(dir, entree.name), rel));
    else if (entree.name.endsWith('.ts') && !entree.name.endsWith('.d.ts')) out.push(rel);
  }
  return out;
}

/**
 * Modules sans appelant DANS l'app, déclarés avec leur raison. Chaque entrée
 * est une dette datée : elle sort de la liste quand son consommateur arrive.
 */
const SANS_APPELANT_DECLARES: Record<string, string> = {
  'assistant/reperes.config.ts':
    'lu par scripts/build-reperes.ts (check:reperes), jamais importé par l’app (#1006)',
  'assistant/reperes.generated.ts':
    'registre des repères, consommé par l’assistant contextuel à venir (#1017) ; testé par reperes-completude',
  'assistant/adaptateur.ts':
    'adaptateur de révélation, branché par l’assistant contextuel (#1017) ; testé par adaptateur.test.ts',
};

describe('le Builder n’embarque aucun module mort', () => {
  const tous = modules();
  const sources = tous.map((rel) => readFileSync(join(SRC, rel), 'utf-8'));

  it('le module supprimé ne revient pas', () => {
    expect(existsSync(join(SRC, 'ui/chart-renderer.ts'))).toBe(false);
    expect(existsSync(join(RACINE, 'tests/apps/builder/chart-renderer.test.ts'))).toBe(false);
  });

  it('chaque module est importé par au moins un autre', () => {
    // `main.ts` est le point d'entree : personne ne l'importe, c'est normal.
    const orphelins = tous.filter((rel) => {
      if (rel === 'main.ts') return false;
      if (rel in SANS_APPELANT_DECLARES) return false;
      const nom = rel.replace(/\.ts$/, '').split('/').pop()!;
      return !sources.some((src) => new RegExp(`from '[^']*${nom}\\.js'`).test(src));
    });

    expect(orphelins, `modules sans appelant : ${orphelins.join(', ')}`).toEqual([]);
  });

  it('chaque exception déclarée existe encore et reste sans appelant', () => {
    for (const rel of Object.keys(SANS_APPELANT_DECLARES)) {
      expect(tous, rel).toContain(rel);
      const nom = rel.replace(/\.ts$/, '').split('/').pop()!;
      const appele = sources.some((src) => src.includes(`${nom}.js'`));
      expect(appele, `${rel} a désormais un appelant : retirer l’exception`).toBe(false);
    }
  });
});
