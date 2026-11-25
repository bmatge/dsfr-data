#!/usr/bin/env node
/**
 * Le résumé d'une NUIT du mode vivant, pour le workflow (oracle.yml, ADR-168) :
 * lit `out/report.json` et `out/gel/*.json`, imprime un Markdown, et pose les
 * compteurs dans `$GITHUB_OUTPUT` quand on le lui demande.
 *
 *   node tools/oracle/resume-nuit.mjs [tools/oracle/out] [--github-output <fichier>]
 *
 * Sorties (`cle=valeur`) : `date` (jour du rapport, UTC), `echecs`,
 * `bibliotheque`, `donnee`, `indetermine` (constats par verdict de fraîcheur),
 * `gels` (fichiers de `out/gel/`, séparés par des espaces), `rouge` (`true`
 * si le run a au moins un échec), `resume` (chemin du Markdown écrit à côté
 * du rapport : `out/resume-nuit.md`).
 *
 * Node seul, aucun import de `packages/`, `@dsfr-data/*` ni `@/` : ce script
 * lit ce que l'oracle a écrit, il ne recalcule rien (ADR-122, garde
 * `tests/oracle/guard.test.ts`). Un rapport absent n'est pas une erreur : le
 * run a pu tomber avant d'écrire — le résumé le dit, et `rouge=true`.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const VERDICTS = {
  bibliotheque: 'bibliothèque',
  donnee: 'donnée',
  indetermine: 'indéterminé',
};

/** Résume un rapport (objet déjà parsé) et la liste des gels. */
export function resumer(rapport, gels, dateDefaut = new Date().toISOString()) {
  const constats = Array.isArray(rapport?.constats) ? rapport.constats : [];
  const echecs = constats.filter((c) => !c.ok && !c.invariant);
  const parVerdict = { bibliotheque: [], donnee: [], indetermine: [] };
  for (const c of echecs) {
    const f = typeof c.fraicheur === 'string' ? c.fraicheur : '';
    if (f.startsWith(VERDICTS.bibliotheque)) parVerdict.bibliotheque.push(c);
    else if (f.startsWith(VERDICTS.donnee)) parVerdict.donnee.push(c);
    else if (f.startsWith(VERDICTS.indetermine)) parVerdict.indetermine.push(c);
  }
  const sansVerdict = echecs.filter((c) => !c.fraicheur);
  const date = String(rapport?.generatedAt ?? dateDefaut).slice(0, 10);

  const lignes = [];
  lignes.push(`## Nuit du ${date}`);
  lignes.push('');
  if (!rapport) {
    lignes.push(
      '**Aucun rapport** (`out/report.json` absent) : le run est tombé avant la vérification — lire les logs du job.'
    );
  } else {
    lignes.push(
      `${rapport.total ?? '?'} observations, ${rapport.comparaisons ?? '?'} valeurs comparées, **${echecs.length} échec(s)**.`
    );
    // Le rapport compte les verdicts sur TOUS les constats des contrôles
    // tranchés (verts compris) ; le tableau ci-dessous ne compte que les échecs.
    const nuit = Object.entries(rapport.nuit?.verdicts ?? {});
    if (nuit.length > 0) {
      lignes.push('');
      lignes.push(`Verdicts de la nuit (rapport) : ${nuit.map(([v, n]) => `${n} × « ${v} »`).join(', ')}.`);
    }
  }
  lignes.push('');
  lignes.push('| Verdict | Constats | Ce que la règle de vie demande |');
  lignes.push('|---|---|---|');
  lignes.push(
    `| bibliothèque | **${parVerdict.bibliotheque.length}** | gel copié sous \`tests/verif-donnees/gel/\` (PR ouverte par le workflow), correctif dans la lib |`
  );
  lignes.push(
    `| donnée, rejoué | ${parVerdict.donnee.length} | le jeu a bougé entre l'attendu et l'observation ; rejoué vert → rien, rejoué rouge → requalifier le contrôle |`
  );
  lignes.push(
    `| indéterminé | ${parVerdict.indetermine.length} | pas de date de traitement (Tabular, Melodi…) : trancher à la main, sous 24 h |`
  );
  if (sansVerdict.length > 0) {
    lignes.push(`| sans verdict | ${sansVerdict.length} | échec hors écart de chiffre (URL, silence, diagnostic) ou contrôle sans empreinte |`);
  }
  lignes.push('');

  const groupes = [
    ['Verdict « bibliothèque »', parVerdict.bibliotheque],
    ['Verdict « donnée »', parVerdict.donnee],
    ['Verdict « indéterminé »', parVerdict.indetermine],
    ['Sans verdict', sansVerdict],
  ];
  for (const [titre, liste] of groupes) {
    if (liste.length === 0) continue;
    lignes.push(`### ${titre}`);
    lignes.push('');
    for (const c of liste.slice(0, 40)) {
      const serveur = c.serveur !== undefined && c.serveur !== null ? `, serveur ${c.serveur}` : '';
      lignes.push(
        `- \`${c.domaine}/${c.controle}\` · \`${c.observation}\` — lib ${c.lib}, oracle ${c.oracle}${serveur}` +
          (c.message ? ` — ${String(c.message).replace(/\s+/g, ' ').slice(0, 200)}` : '')
      );
    }
    if (liste.length > 40) lignes.push(`- … et ${liste.length - 40} autre(s)`);
    lignes.push('');
  }

  if (gels.length > 0) {
    lignes.push('### Gels écrits par le run');
    lignes.push('');
    for (const g of gels) lignes.push(`- \`${g}\``);
    lignes.push('');
  }

  return {
    date,
    echecs: echecs.length,
    bibliotheque: parVerdict.bibliotheque.length,
    donnee: parVerdict.donnee.length,
    indetermine: parVerdict.indetermine.length,
    gels,
    rouge: !rapport || echecs.length > 0,
    markdown: lignes.join('\n'),
  };
}

function lireRapport(dossier) {
  const chemin = join(dossier, 'report.json');
  if (!existsSync(chemin)) return null;
  return JSON.parse(readFileSync(chemin, 'utf-8'));
}

function listerGels(dossier) {
  const gel = join(dossier, 'gel');
  if (!existsSync(gel)) return [];
  return readdirSync(gel)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

function main(argv) {
  const args = argv.slice(2);
  let sortie = null;
  const positionnels = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--github-output') sortie = args[++i];
    else positionnels.push(args[i]);
  }
  const dossier = resolve(positionnels[0] ?? 'tools/oracle/out');
  const resume = resumer(lireRapport(dossier), listerGels(dossier));
  const cheminResume = join(dossier, 'resume-nuit.md');
  try {
    writeFileSync(cheminResume, resume.markdown + '\n');
  } catch {
    // Dossier absent : le Markdown reste sur la sortie standard.
  }
  process.stdout.write(resume.markdown + '\n');
  if (sortie) {
    const lignes = [
      `date=${resume.date}`,
      `echecs=${resume.echecs}`,
      `bibliotheque=${resume.bibliotheque}`,
      `donnee=${resume.donnee}`,
      `indetermine=${resume.indetermine}`,
      `gels=${resume.gels.join(' ')}`,
      `rouge=${resume.rouge}`,
      `resume=${cheminResume}`,
    ];
    writeFileSync(sortie, lignes.join('\n') + '\n', { flag: 'a' });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv);
}
