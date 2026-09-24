/**
 * Banc de pertinence du Studio IA (#1112) — point d'entree.
 *
 *   npm run banc:studio                         # tout, 3 repetitions
 *   npm run banc:studio -- --pr --repetitions 1 # sous-ensemble de PR
 *   npm run banc:studio -- --scenario aides-nationales,kpi-total
 *   npm run banc:studio -- --instance http://localhost:5173
 *
 * Variables d'environnement equivalentes : BANC_STUDIO_INSTANCE,
 * BANC_STUDIO_REPETITIONS, BANC_STUDIO_PAUSE_MS, BANC_STUDIO_SCENARIOS,
 * BANC_STUDIO_PR=1. Les options de la ligne de commande priment.
 *
 * Sortie : tools/banc-studio/out/rapport.json et rapport.md. Le banc MESURE :
 * un critere en echec ne change pas le code de sortie. Seul un banc qui n'a
 * rien pu mesurer (instance fermee, tous les essais en erreur) sort en 1.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { executerScenario } from './executer.js';
import { agreger, essaiDe, rapportMarkdown, type Essai, type MetaRapport } from './rapport.js';
import { choisirScenarios } from './scenarios.js';
import {
  INSTANCE_PAR_DEFAUT,
  creerCadence,
  creerTransport,
  installerFetchRelatif,
  lireConfigServeur,
  lireFraicheur,
  normaliserInstance,
} from './transport.js';

/** 10 s entre deux appels : 6 par minute au plus, sous le plafond partage de 10. */
const PAUSE_PAR_DEFAUT_MS = 10000;
const REPETITIONS_PAR_DEFAUT = 3;

function ecrire(texte: string): void {
  process.stdout.write(`${texte}\n`);
}

function entier(brut: string | undefined, defaut: number, nom: string): number {
  if (brut === undefined || brut === '') return defaut;
  const n = Number(brut);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${nom} : entier positif attendu (${brut}).`);
  return n;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      instance: { type: 'string' },
      repetitions: { type: 'string' },
      pause: { type: 'string' },
      scenario: { type: 'string' },
      pr: { type: 'boolean' },
    },
    strict: false,
    allowPositionals: true,
  });
  const lire = (cle: string): string | undefined => {
    const v = values[cle];
    return typeof v === 'string' ? v : undefined;
  };

  const instance = normaliserInstance(
    lire('instance') ?? process.env.BANC_STUDIO_INSTANCE ?? INSTANCE_PAR_DEFAUT
  );
  const repetitions = Math.max(
    1,
    entier(
      lire('repetitions') ?? process.env.BANC_STUDIO_REPETITIONS,
      REPETITIONS_PAR_DEFAUT,
      'repetitions'
    )
  );
  const pauseMs = entier(
    lire('pause') ?? process.env.BANC_STUDIO_PAUSE_MS,
    PAUSE_PAR_DEFAUT_MS,
    'pause'
  );
  const ids = (lire('scenario') ?? process.env.BANC_STUDIO_SCENARIOS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const pr = values.pr === true || process.env.BANC_STUDIO_PR === '1';
  const scenarios = choisirScenarios({ ids, pr });

  const config = await lireConfigServeur(instance);
  if (!config.available) {
    ecrire(`Instance ${instance} : mode serveur indisponible (/ia-server-config). Rien à mesurer.`);
    return 1;
  }
  const fraicheur = await lireFraicheur(instance);
  installerFetchRelatif(instance);

  const meta: MetaRapport = {
    date: new Date().toISOString(),
    instance,
    modele: config.model ?? 'inconnu',
    libVersion: fraicheur.libVersion,
    commitInstance: fraicheur.commit,
    repetitions,
    pauseMs,
    sousEnsemble: ids.length > 0 ? 'choisi' : pr ? 'pr' : 'complet',
  };
  ecrire(
    `Banc Studio : ${scenarios.length} scénario(s) x ${repetitions} sur ${instance} ` +
      `(modèle ${meta.modele}, pause ${pauseMs} ms)`
  );

  const post = creerTransport(instance);
  const avantAppel = creerCadence(pauseMs);
  const essais: Essai[] = [];
  const debut = Date.now();

  for (let r = 1; r <= repetitions; r++) {
    for (const scenario of scenarios) {
      const execution = await executerScenario(scenario, {
        post,
        model: meta.modele,
        avantAppel,
      });
      const essai = essaiDe(scenario, r, execution);
      essais.push(essai);
      const echecs = essai.criteres.filter((c) => c.verdict === 'echec').map((c) => c.critere);
      ecrire(
        `  ${scenario.id} #${r} : ${essai.erreur ? `erreur (${essai.erreur})` : echecs.length ? `échec ${echecs.join(', ')}` : 'ok'} ` +
          `· ${essai.tours} tours · ${essai.tokens.total} jetons`
      );
    }
  }

  const rapport = agreger(scenarios, essais, meta, Date.now() - debut);
  const markdown = rapportMarkdown(rapport);
  const sortie = resolve(dirname(fileURLToPath(import.meta.url)), 'out');
  mkdirSync(sortie, { recursive: true });
  writeFileSync(resolve(sortie, 'rapport.json'), `${JSON.stringify(rapport, null, 2)}\n`);
  writeFileSync(resolve(sortie, 'rapport.md'), markdown);
  ecrire('');
  ecrire(markdown);
  ecrire(`Rapport : ${resolve(sortie, 'rapport.json')}`);

  return essais.length > 0 && essais.every((e) => e.erreur) ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(`Banc Studio : ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
);
