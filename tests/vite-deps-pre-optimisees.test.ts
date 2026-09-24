import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { DEPS_PRE_OPTIMISEES, IMPORTS_DE_TYPES } from '../scripts/lib/deps-pre-optimisees';

/**
 * #1119 — chaque dépendance npm de la lib est pré-optimisée au démarrage du
 * serveur de dev (`optimizeDeps.include`). Une dépendance oubliée serait
 * découverte en cours de route, et Vite rechargerait les pages ouvertes :
 * `npm run verif` démarré à froid perdrait les contrôles en cours.
 */

const RACINE = resolve(__dirname, '..');
const SOURCES = ['packages/core/src', 'packages/shared/src', 'packages/app-ui/src'];

function fichiers(dossier: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) out.push(...fichiers(chemin));
    else if (/\.ts$/.test(nom) && !/\.d\.ts$/.test(nom)) out.push(chemin);
  }
  return out;
}

/** Les imports nus d'un source : `from 'x'`, `import 'x'`, `import('x')` — sans relatifs ni alias. */
function importsNus(source: string): string[] {
  const out: string[] = [];
  const motif = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(motif)) {
    const spec = m[1];
    if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/')) continue;
    if (spec.startsWith('@dsfr-data/')) continue;
    // Une feuille de style importée en `?inline` n'est pas une dépendance à pré-optimiser.
    if (spec.includes('?') || spec.endsWith('.css')) continue;
    out.push(spec);
  }
  return out;
}

describe('#1119 — dépendances pré-optimisées par le serveur de dev', () => {
  const trouves = new Map<string, string>();
  for (const dossier of SOURCES) {
    for (const f of fichiers(resolve(RACINE, dossier))) {
      for (const spec of importsNus(readFileSync(f, 'utf-8'))) {
        if (!trouves.has(spec)) trouves.set(spec, f.slice(RACINE.length + 1));
      }
    }
  }

  it('lit bien des imports nus dans les sources (le garde ne tourne pas à vide)', () => {
    expect(trouves.has('lit')).toBe(true);
    expect(trouves.has('leaflet')).toBe(true);
  });

  it('chaque import nu de la lib est dans optimizeDeps.include, ou déclaré type seul', () => {
    const manquants = [...trouves]
      .filter(([spec]) => !DEPS_PRE_OPTIMISEES.includes(spec) && !IMPORTS_DE_TYPES.includes(spec))
      .map(([spec, ou]) => `${spec} (${ou})`);
    expect(manquants, 'à ajouter à scripts/lib/deps-pre-optimisees.ts').toEqual([]);
  });

  it('la liste ne garde aucune dépendance que la lib n’importe plus', () => {
    const perimes = [...DEPS_PRE_OPTIMISEES, ...IMPORTS_DE_TYPES].filter((d) => !trouves.has(d));
    expect(perimes, 'à retirer de scripts/lib/deps-pre-optimisees.ts').toEqual([]);
  });

  it('vite.config.ts branche bien la liste sur optimizeDeps.include', () => {
    const config = readFileSync(resolve(RACINE, 'vite.config.ts'), 'utf-8');
    expect(config).toMatch(/optimizeDeps:\s*\{\s*include:\s*\[\.\.\.DEPS_PRE_OPTIMISEES\]/);
  });
});
