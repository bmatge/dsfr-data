/**
 * Rapport de la vérification : par contrôle, valeur lib / valeur oracle /
 * écart / lignes brutes / mode.
 *
 * Un contrôle vert qui ne dit pas SUR QUOI il a porté ne se relit pas : le
 * rapport porte donc aussi le nombre de valeurs comparées. Un contrôle à zéro
 * comparaison ne prouve rien, et se voit.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Constat } from './compare.js';
import { ecrireRapportBanc, type FicheBanc } from './banc.js';

const ICI = dirname(fileURLToPath(import.meta.url));

/** Dossier des sorties (attendu vivant, rapport) — gitignoré. */
export const DOSSIER_SORTIE = resolve(ICI, 'out');

/**
 * Identifiant du run, posé par les scripts npm (`VERIF_RUN=$$`) et hérité par
 * tous les workers Playwright. Il sert à ne fusionner QUE les constats du run
 * en cours : sans lui, un rapport laissé par un run précédent se mêlerait au
 * nouveau et annoncerait vert ce qui n'a pas été rejoué.
 */
const RUN = process.env.VERIF_RUN ?? '';

export interface Rapport {
  run: string;
  generatedAt: string;
  total: number;
  echecs: number;
  comparaisons: number;
  /** Observations qui ont eu TROIS voix : lib, oracle TS, oracle Python (#880). */
  troisVoix: number;
  constats: Constat[];
}

export function construireRapport(constats: Constat[]): Rapport {
  return {
    run: RUN,
    generatedAt: new Date().toISOString(),
    total: constats.length,
    echecs: constats.filter((c) => !c.ok).length,
    comparaisons: constats.reduce((n, c) => n + c.comparaisons, 0),
    troisVoix: constats.filter((c) => c.python !== undefined).length,
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
      `${rapport.comparaisons} valeurs comparées, ${rapport.echecs} échec(s)` +
      (rapport.troisVoix > 0 ? `, ${rapport.troisVoix} à trois voix (lib, TS, Python).` : '.')
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
    const python =
      c.python === undefined
        ? ''
        : ` python ${c.python}` +
          (c.ecartPython === null || c.ecartPython === undefined
            ? ''
            : ` écart ${Math.round(c.ecartPython * 1e6) / 1e6}`);
    lignes.push(
      `    ${c.ok ? 'ok  ' : 'ÉCHEC'} ${colonne(c.observation, 26)} ` +
        `lib ${colonne(c.lib, 28)} oracle ${colonne(c.oracle, 28)}${ecart}${python}`
    );
    if (!c.ok && c.message) lignes.push(`          ${c.message}`);
  }
  return lignes.join('\n');
}

/** Clé d'un constat dans le rapport : domaine, contrôle, observation. */
export function cleConstat(c: Pick<Constat, 'domaine' | 'controle' | 'observation'>): string {
  return `${c.domaine}/${c.controle}/${c.observation}`;
}

const CHEMIN_JSON = resolve(DOSSIER_SORTIE, 'report.json');

/**
 * Écrit `out/report.json` et `out/report.txt`, et rend le résumé texte.
 *
 * Le rapport est FUSIONNÉ avec ce qui est déjà sur le disque plutôt qu'écrasé :
 * Playwright redémarre le worker après un échec, et le worker suivant n'a plus
 * en mémoire les constats de son prédécesseur — précisément ceux qui portent
 * l'échec. Sans fusion, le rapport perdrait ce pour quoi on le lit. La fusion
 * ne retient que les constats du MÊME run (`VERIF_RUN`), sans quoi un rapport
 * laissé par un run précédent annoncerait vert ce qui n'a pas été rejoué.
 *
 * `ordre` est la liste des clés attendues, dans l'ordre des manifestes : elle
 * range le rapport et écarte les constats d'un contrôle qui n'est plus déclaré.
 *
 * `fiches` décrit les contrôles joués — page reproduite, constats du registre,
 * mise en attente —, et sert au SECOND rendu (`out/banc.md`). Elles viennent de
 * l'appelant : le moteur ne va pas lire les manifestes lui-même.
 */
export function ecrireRapport(
  constats: Constat[],
  ordre: string[],
  fiches: readonly FicheBanc[]
): string {
  const parCle = new Map<string, Constat>();
  if (RUN !== '' && existsSync(CHEMIN_JSON)) {
    try {
      const ancien = JSON.parse(readFileSync(CHEMIN_JSON, 'utf-8')) as Rapport;
      if (ancien.run === RUN) {
        for (const c of ancien.constats ?? []) parCle.set(cleConstat(c), c);
      }
    } catch {
      // Rapport illisible (run interrompu) : on repart de ce run.
    }
  }
  for (const c of constats) parCle.set(cleConstat(c), c);

  const fusionnes = ordre
    .map((cle) => parCle.get(cle))
    .filter((c): c is Constat => c !== undefined);

  const rapport = construireRapport(fusionnes);
  const texte = resumeTexte(rapport);
  mkdirSync(DOSSIER_SORTIE, { recursive: true });
  writeFileSync(CHEMIN_JSON, JSON.stringify(rapport, null, 2));
  writeFileSync(resolve(DOSSIER_SORTIE, 'report.txt'), `${texte}\n`);
  // Second rendu des MÊMES constats, rangé par page reproduite et par constat
  // du registre : c'est dans ces termes-là que le banc relit (voir `banc.ts`).
  ecrireRapportBanc(fusionnes, fiches, DOSSIER_SORTIE);
  return texte;
}
