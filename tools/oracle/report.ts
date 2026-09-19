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
  /** Les invariants (#881), comptés à part des valeurs : tenus, violés, en attente. */
  invariants: { tenus: number; violes: number; attente: number };
  /**
   * Le recoupement serveur (#883), mode vivant : les verdicts à trois chiffres,
   * comptés par phrase — et les observations dont le serveur n'a rien dit
   * (quota, échec), qui restent à deux voix.
   */
  recoupement: { verdicts: Record<string, number>; sansServeur: number };
  /**
   * Les verdicts d'une NUIT ROUGE (#884), par phrase — `bibliothèque`,
   * `donnée, rejoué`, `indéterminé` — et les contrôles INSTABLES (échoués
   * puis réussis au retry), comptés à part du vert.
   */
  nuit: { verdicts: Record<string, number>; instables: number };
  constats: Constat[];
}

export function construireRapport(constats: Constat[]): Rapport {
  const valeurs = constats.filter((c) => !c.invariant);
  const invariants = constats.filter((c) => c.invariant);
  const verdicts: Record<string, number> = {};
  const nuit: Record<string, number> = {};
  for (const c of valeurs) {
    if (c.verdict) verdicts[c.verdict] = (verdicts[c.verdict] ?? 0) + 1;
    if (c.fraicheur) nuit[c.fraicheur] = (nuit[c.fraicheur] ?? 0) + 1;
  }
  const instables = new Set(
    constats.filter((c) => c.instable).map((c) => `${c.domaine}/${c.controle}`)
  ).size;
  return {
    run: RUN,
    generatedAt: new Date().toISOString(),
    total: valeurs.length,
    echecs: valeurs.filter((c) => !c.ok).length,
    comparaisons: valeurs.reduce((n, c) => n + c.comparaisons, 0),
    troisVoix: valeurs.filter((c) => c.python !== undefined).length,
    invariants: {
      tenus: invariants.filter((c) => c.ok).length,
      violes: invariants.filter((c) => !c.ok && !c.attente).length,
      attente: invariants.filter((c) => !c.ok && c.attente).length,
    },
    recoupement: {
      verdicts,
      sansServeur: valeurs.filter((c) => c.serveur !== undefined && c.verdict === undefined).length,
    },
    nuit: { verdicts: nuit, instables },
    constats,
  };
}

function colonne(texte: string, largeur: number): string {
  return texte.length >= largeur ? texte : texte + ' '.repeat(largeur - texte.length);
}

/** Résumé texte, une ligne par observation, groupé par contrôle. */
export function resumeTexte(rapport: Rapport): string {
  const lignes: string[] = [];
  const inv = rapport.invariants;
  const rec = rapport.recoupement;
  const verdicts = Object.entries(rec.verdicts);
  // Une nuit rouge se lit d'abord par ses verdicts (#884) : bibliothèque ou
  // donnée, et ce qui n'a tenu qu'au retry.
  const nuit = Object.entries(rapport.nuit.verdicts);
  if (nuit.length > 0 || rapport.nuit.instables > 0) {
    lignes.push(
      `Verdicts de la nuit — ` +
        [
          ...nuit.map(([v, n]) => `${n} × « ${v} »`),
          ...(rapport.nuit.instables > 0
            ? [`${rapport.nuit.instables} contrôle(s) instable(s) (vert au retry seulement)`]
            : []),
        ].join(', ') +
        '.'
    );
  }
  lignes.push(
    `Vérification des données — ${rapport.total} observations, ` +
      `${rapport.comparaisons} valeurs comparées, ${rapport.echecs} échec(s)` +
      (rapport.troisVoix > 0 ? `, ${rapport.troisVoix} à trois voix (lib, TS, Python)` : '') +
      (inv.tenus + inv.violes + inv.attente > 0
        ? ` ; invariants : ${inv.tenus} tenu(s), ${inv.violes} violé(s), ${inv.attente} en attente`
        : '') +
      (verdicts.length > 0 || rec.sansServeur > 0
        ? ` ; recoupement serveur : ${verdicts.map(([v, n]) => `${n} × « ${v} »`).join(', ')}` +
          (rec.sansServeur > 0 ? `, ${rec.sansServeur} sans réponse du serveur` : '')
        : '') +
      '.'
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
    const etat = c.ok ? 'ok  ' : c.attente ? 'ATT.' : 'ÉCHEC';
    const serveur =
      c.serveur === undefined
        ? ''
        : ` serveur ${c.serveur}` +
          (c.ecartServeur === null || c.ecartServeur === undefined
            ? ''
            : ` écart ${Math.round(c.ecartServeur * 1e6) / 1e6}`);
    lignes.push(
      `    ${etat} ${colonne(c.observation, 26)} ` +
        `lib ${colonne(c.lib, 28)} ${c.invariant ? 'brut  ' : 'oracle'} ${colonne(c.oracle, 28)}${ecart}${python}${serveur}`
    );
    if (c.verdict) lignes.push(`          verdict : ${c.verdict}`);
    if (c.fraicheur) lignes.push(`          nuit : ${c.fraicheur}`);
    if (c.instable) lignes.push(`          instable : vert au retry seulement`);
    if (!c.ok && c.message && c.message !== c.verdict) lignes.push(`          ${c.message}`);
    if (!c.ok && c.attente) lignes.push(`          en attente : ${c.attente}`);
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
