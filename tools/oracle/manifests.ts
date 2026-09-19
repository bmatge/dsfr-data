/**
 * `npm run verif:manifests` — projette les contrôles DÉTERMINISTES en
 * `tools/oracle/out/manifests.json`, pour qu'une autre implémentation de
 * l'oracle — dans un autre langage — puisse les lire (#880).
 *
 * Les manifestes sont des données : un `Check` n'est qu'un objet, et ses
 * `expects` avec leur `pipeline` se sérialisent tels quels. Ce que la
 * projection AJOUTE, c'est le nom du jeu (`tests/verif-donnees/jeux/*.json`,
 * #879) derrière chaque `feed.datasets` : le lecteur tiers ne connaît pas les
 * modules de fixtures, il connaît les fichiers. L'appariement se fait par
 * CONTENU (même forme JSON), jamais par le nom de la variable TypeScript.
 *
 * Comme `run.ts`, ce fichier est une racine de composition : il rapproche le
 * moteur et les manifestes, ce que le garde d'indépendance interdit au moteur
 * lui-même (`RACINES_DE_COMPOSITION`, tests/oracle/guard.test.ts).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { controlesDuMode } from '../../tests/verif-donnees/index.js';
import { cleAttendu } from './expected.js';
import { DOSSIER_SORTIE } from './report.js';
import type { Expect } from './manifest.js';

const ICI = dirname(fileURLToPath(import.meta.url));
export const DOSSIER_JEUX = resolve(ICI, '../../tests/verif-donnees/jeux');

/** Un contrôle projeté : ses jeux par nom de fichier, ses attentes avec leur clé. */
export interface CheckProjete {
  domaine: string;
  id: string;
  /** Contrôle en attente : l'attendu se calcule quand même, il ne se mesure pas. */
  skip: boolean;
  /** Nom logique du feed → nom du fichier de `jeux/` (sans extension). */
  datasets: Record<string, string>;
  expects: Array<Expect & { cle: string }>;
}

export interface Projection {
  generatedAt: string;
  /** Dossier des jeux, relatif à la racine du dépôt. */
  jeux: string;
  checks: CheckProjete[];
}

/** Les jeux du dossier, indexés par leur forme JSON. */
function jeuxParContenu(): Map<string, string> {
  const index = new Map<string, string>();
  for (const fichier of readdirSync(DOSSIER_JEUX)) {
    if (!fichier.endsWith('.json')) continue;
    const contenu = JSON.parse(readFileSync(resolve(DOSSIER_JEUX, fichier), 'utf-8'));
    index.set(JSON.stringify(contenu), fichier.replace(/\.json$/, ''));
  }
  return index;
}

export function projeter(): Projection {
  const index = jeuxParContenu();
  const checks: CheckProjete[] = [];
  for (const { domaine, check } of controlesDuMode('deterministic')) {
    if (check.feed.kind !== 'fixture') continue;
    const datasets: Record<string, string> = {};
    for (const [nom, lignes] of Object.entries(check.feed.datasets)) {
      const jeu = index.get(JSON.stringify(lignes));
      if (jeu === undefined) {
        throw new Error(
          `${domaine}/${check.id} : le jeu « ${nom} » ne correspond à aucun fichier de jeux/ ` +
            `(tests/oracle/jeux.test.ts le refuse aussi)`
        );
      }
      datasets[nom] = jeu;
    }
    checks.push({
      domaine,
      id: check.id,
      skip: Boolean(check.skip),
      datasets,
      expects: check.expects.map((e) => ({ ...e, cle: cleAttendu(e) })),
    });
  }
  return { generatedAt: new Date().toISOString(), jeux: 'tests/verif-donnees/jeux', checks };
}

const OUT = resolve(DOSSIER_SORTIE, 'manifests.json');
const projection = projeter();
mkdirSync(DOSSIER_SORTIE, { recursive: true });
writeFileSync(OUT, JSON.stringify(projection, null, 2));
process.stdout.write(
  `${projection.checks.length} contrôles déterministes, ` +
    `${projection.checks.reduce((n, c) => n + c.expects.length, 0)} attentes → ${OUT}\n`
);
