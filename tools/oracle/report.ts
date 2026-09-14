/**
 * Rapport de la vérification : par contrôle, valeur lib / valeur oracle /
 * écart / lignes brutes / mode.
 *
 * Un contrôle vert qui ne dit pas SUR QUOI il a porté ne se relit pas : le
 * rapport porte donc aussi le nombre de valeurs comparées. Un contrôle à zéro
 * comparaison ne prouve rien, et se voit.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Constat } from './compare.js';

const ICI = dirname(fileURLToPath(import.meta.url));

/** Dossier des sorties (attendu vivant, rapport) — gitignoré. */
export const DOSSIER_SORTIE = resolve(ICI, 'out');

export interface Rapport {
  generatedAt: string;
  total: number;
  echecs: number;
  comparaisons: number;
  constats: Constat[];
}

export function construireRapport(constats: Constat[]): Rapport {
  return {
    generatedAt: new Date().toISOString(),
    total: constats.length,
    echecs: constats.filter((c) => !c.ok).length,
    comparaisons: constats.reduce((n, c) => n + c.comparaisons, 0),
    constats,
  };
}

function colonne(texte: string, largeur: number): string {
  return texte.length >= largeur ? texte : texte + ' '.repeat(largeur - texte.length);
}

/** Résumé texte, une ligne par observation, groupé par contrôle. */
export function resumeTexte(rapport: Rapport): string {
  const lignes: string[] = [];
  lignes.push(
    `Vérification des données — ${rapport.total} observations, ` +
      `${rapport.comparaisons} valeurs comparées, ${rapport.echecs} échec(s).`
  );
  let controleCourant = '';
  for (const c of rapport.constats) {
    const cle = `${c.domaine}/${c.controle}`;
    if (cle !== controleCourant) {
      controleCourant = cle;
      lignes.push('');
      lignes.push(`  ${cle} [${c.mode}] — ${c.rawRows} lignes brutes`);
    }
    const ecart = c.ecart === null ? '' : ` écart ${Math.round(c.ecart * 1e6) / 1e6}`;
    lignes.push(
      `    ${c.ok ? 'ok  ' : 'ÉCHEC'} ${colonne(c.observation, 26)} ` +
        `lib ${colonne(c.lib, 28)} oracle ${colonne(c.oracle, 28)}${ecart}`
    );
    if (!c.ok && c.message) lignes.push(`          ${c.message}`);
  }
  return lignes.join('\n');
}

/** Écrit `out/report.json` et `out/report.txt`, et rend le résumé texte. */
export function ecrireRapport(constats: Constat[]): string {
  const rapport = construireRapport(constats);
  const texte = resumeTexte(rapport);
  mkdirSync(DOSSIER_SORTIE, { recursive: true });
  writeFileSync(resolve(DOSSIER_SORTIE, 'report.json'), JSON.stringify(rapport, null, 2));
  writeFileSync(resolve(DOSSIER_SORTIE, 'report.txt'), `${texte}\n`);
  return texte;
}
