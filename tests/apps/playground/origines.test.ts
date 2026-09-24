/**
 * Origines du code confié au Playground : la Carte n'y figurait pas, et son
 * « Ouvrir dans le Playground » ouvrait le Playground sur son contenu par
 * défaut, sans un mot. Le test-garde relit les apps : toute origine qui envoie
 * vers le Playground doit être acceptée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { estOrigineCode, ORIGINES_CODE } from '../../../apps/playground/src/origines';

const RACINE = join(__dirname, '../../..');

/** Fichiers .ts d'un dossier, récursivement. */
function fichiersTs(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiersTs(chemin);
    return nom.endsWith('.ts') ? [chemin] : [];
  });
}

/**
 * Origines passées au Playground dans le code des apps :
 * `navigateTo('playground', { from: 'x' })` et `playground/index.html?from=x`.
 */
function originesEmises(): Set<string> {
  const origines = new Set<string>();
  const appsDir = join(RACINE, 'apps');
  for (const app of readdirSync(appsDir)) {
    const src = join(appsDir, app, 'src');
    if (app === 'playground' || !statSync(join(appsDir, app)).isDirectory()) continue;
    let fichiers: string[];
    try {
      fichiers = fichiersTs(src);
    } catch {
      continue;
    }
    for (const f of fichiers) {
      const texte = readFileSync(f, 'utf-8');
      for (const m of texte.matchAll(/navigateTo\('playground', \{ from: '([a-z-]+)' \}\)/g)) {
        origines.add(m[1]);
      }
      for (const m of texte.matchAll(/playground\/index\.html\?from=([a-z-]+)/g)) {
        origines.add(m[1]);
      }
    }
  }
  return origines;
}

describe('origines du code confié au Playground', () => {
  it('la Carte est une origine acceptée', () => {
    expect(estOrigineCode('builder-carto')).toBe(true);
  });

  it('toute app qui envoie vers le Playground y est acceptée (test-garde)', () => {
    // Mutation : retirer 'builder-carto' d'ORIGINES_CODE → rouge.
    const emises = originesEmises();
    expect(emises.size).toBeGreaterThan(0);
    for (const origine of emises) {
      expect(estOrigineCode(origine), `origine « ${origine} » non acceptée`).toBe(true);
    }
  });

  it('une origine inconnue ou absente est refusée', () => {
    expect(estOrigineCode('inconnue')).toBe(false);
    expect(estOrigineCode(null)).toBe(false);
    expect(estOrigineCode('__proto__')).toBe(false);
  });

  it('chaque lien de retour se lit correctement', () => {
    for (const libelle of Object.values(ORIGINES_CODE)) {
      expect(`Retour ${libelle}`).toMatch(/^Retour (au|aux|à la) /);
    }
  });
});
