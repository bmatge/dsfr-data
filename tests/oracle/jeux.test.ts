import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { JEU } from '../builder-e2e/api-fixtures.js';
import { controlesDuMode } from '../verif-donnees/index.js';
import type { Row } from '../../tools/oracle/manifest.js';

/**
 * Les jeux de `tests/verif-donnees/jeux/` (#879) : un jeu = un fichier JSON,
 * lu par tout le monde.
 *
 * Ce test tient les deux sens de la relation. Chaque fichier est LU par au
 * moins un contrôle déterministe — un jeu que personne ne lit est un poids
 * mort — et chaque `feed.datasets` d'un contrôle déterministe VIENT d'un
 * fichier — plus aucun littéral orphelin dans un manifeste ou une fixture,
 * sinon un oracle dans un autre langage ne le verrait pas. La comparaison se
 * fait par contenu (forme JSON), pas par identité : une fixture qui copierait
 * un jeu en le modifiant d'une cellule serait vue.
 */

const DOSSIER = resolve(__dirname, '../verif-donnees/jeux');

/** Les jeux, par nom de fichier sans extension, tels que le disque les porte. */
function lireJeux(): Map<string, unknown> {
  const jeux = new Map<string, unknown>();
  for (const fichier of readdirSync(DOSSIER)) {
    if (!fichier.endsWith('.json')) continue;
    jeux.set(
      fichier.replace(/\.json$/, ''),
      JSON.parse(readFileSync(resolve(DOSSIER, fichier), 'utf-8'))
    );
  }
  return jeux;
}

/** Forme canonique d'un jeu, pour le comparer par contenu. */
function empreinte(lignes: unknown): string {
  return JSON.stringify(lignes);
}

describe('vérification des données — les jeux JSON', () => {
  const jeux = lireJeux();

  it('il y a des jeux, et chacun est un tableau d’objets plats', () => {
    expect(jeux.size).toBeGreaterThan(20);
    for (const [nom, contenu] of jeux) {
      expect(Array.isArray(contenu), `${nom} n'est pas un tableau`).toBe(true);
      for (const ligne of contenu as unknown[]) {
        expect(
          ligne !== null && typeof ligne === 'object' && !Array.isArray(ligne),
          `${nom} : une ligne n'est pas un objet`
        ).toBe(true);
      }
      expect((contenu as unknown[]).length, `${nom} est vide`).toBeGreaterThan(0);
    }
  });

  it('un `null` reste un `null`, une chaîne vide reste vide : le piège de `mesures`', () => {
    const mesures = jeux.get('mesures') as Row[];
    // Deux clés vides de nature différente, jamais confondues à la relecture.
    expect(mesures.filter((r) => r.code === '')).toHaveLength(1);
    expect(mesures.filter((r) => r.code === null)).toHaveLength(1);
    // Un zéro numérique n'est pas une chaîne vide.
    expect(mesures.filter((r) => r.quota === 0)).toHaveLength(3);
    expect(mesures.filter((r) => r.quota === '')).toHaveLength(3);
  });

  it('chaque jeu est lu par au moins un contrôle déterministe', () => {
    const lus = new Set<string>();
    for (const { check } of controlesDuMode('deterministic')) {
      if (check.feed.kind !== 'fixture') continue;
      for (const lignes of Object.values(check.feed.datasets)) lus.add(empreinte(lignes));
    }
    const orphelins = [...jeux.entries()]
      .filter(([, contenu]) => !lus.has(empreinte(contenu)))
      .map(([nom]) => nom);
    expect(orphelins).toEqual([]);
  });

  it('chaque `feed.datasets` déterministe vient d’un jeu du dossier — aucun littéral orphelin', () => {
    const connus = new Map<string, string>();
    for (const [nom, contenu] of jeux) connus.set(empreinte(contenu), nom);
    const inconnus: string[] = [];
    for (const { domaine, check } of controlesDuMode('deterministic')) {
      if (check.feed.kind !== 'fixture') continue;
      for (const [nom, lignes] of Object.entries(check.feed.datasets)) {
        if (!connus.has(empreinte(lignes))) inconnus.push(`${domaine}/${check.id} : ${nom}`);
      }
    }
    expect(inconnus).toEqual([]);
  });

  it('`territoires.json` est exactement le jeu que le harnais de recette engendre', () => {
    // Le harnais reste le générateur (`JEU`, tests/builder-e2e/api-fixtures.ts) ;
    // le fichier est sa matérialisation, et les deux ne doivent pas diverger.
    expect(empreinte(jeux.get('territoires'))).toBe(empreinte(JEU));
  });

  it('`canari-volume.json` est exactement ce que son générateur à graine engendre (#882)', () => {
    // Générateur congruentiel linéaire, graine 42 — la formule est écrite dans
    // jeux/README.md ; le fichier en est la matérialisation, et les deux ne
    // doivent pas diverger.
    let x = 42;
    const GROUPES = ['A', 'B', 'C', 'D'];
    const attendu = Array.from({ length: 1001 }, (_, i) => {
      x = (1103515245 * x + 12345) % 2147483648;
      return { n: i + 1, groupe: GROUPES[x % 4], valeur: x % 1000 };
    });
    expect(empreinte(jeux.get('canari-volume'))).toBe(empreinte(attendu));
  });

  it('chaque jeu est décrit dans jeux/README.md', () => {
    const readme = readFileSync(resolve(DOSSIER, 'README.md'), 'utf-8');
    const sansFiche = [...jeux.keys()].filter((nom) => !readme.includes(`\`${nom}.json\``));
    expect(sansFiche).toEqual([]);
  });
});
