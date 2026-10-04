// @vitest-environment node
/**
 * L'extrait nginx du relais cachable (ADR-155, lot 3), par un VRAI nginx.
 *
 * Hors de la suite ordinaire : il faut Docker, sous Linux (réseau de l'hôte). Activé
 * par `RELAIS_NGINX_REEL=1` (job `relais-nginx` de `.github/workflows/ci.yml`) :
 *
 *   RELAIS_NGINX_REEL=1 npx vitest run tests/relay/nginx/relais-nginx.test.ts
 *
 * Quatre passes :
 *   1. `nginx -t` sur l'extrait de PRODUCTION, tel qu'un intégrateur l'inclut, dans un
 *      conteneur sans réseau ;
 *   2. la SUITE DE CONFORMANCE du contrat (`tests/relay/conformance.test.mjs`) contre
 *      la variante de banc de l'extrait — mêmes fichiers, amont remplacé par le faux
 *      amont de la suite (`banc.mjs`). La liste des tests rouges doit être EXACTEMENT
 *      celle des limites documentées (`limites.mjs`) ;
 *   3. les OBSERVATIONS (`observations.test.mjs`) : ce qui tient derrière chaque
 *      limite, le cache périmé, ce que `proxy_pass` transmet ;
 *   4. dans la même passe, nginx placé DEVANT le relais Node (`mandataire-node.*.conf`).
 *
 * Rien ne sort de la machine : le seul amont est le faux amont local de la suite.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ACTIF = process.env.RELAIS_NGINX_REEL === '1';
const RACINE = resolve(__dirname, '../../..');
const IMAGE = 'nginx:alpine';

interface BancModule {
  EXTRAIT_DIR: string;
  RENOMMAGES: [string, string][];
  PORT_RELAIS: number;
  PORT_MANDATAIRE: number;
  PORT_OBSERVATION: number;
  LOCATIONS_NAIVES: string;
  deriverBanc(options?: { dureeCache?: number }): { http: string; server: string; cles: string };
  squelette(options: { port: number; http: string[]; server: string[]; extra?: string }): string;
}
interface Limite {
  test: string;
  regle: string;
  cle: string;
  echec: RegExp;
}
interface LimitesModule {
  LIMITES: Limite[];
  SAUTES: number;
}
interface Resultat {
  issue: 'vert' | 'rouge' | 'saute' | 'note';
  nom?: string;
  erreur?: string;
  texte?: string;
}

async function importer<T>(chemin: string): Promise<T> {
  return (await import(/* @vite-ignore */ pathToFileURL(join(RACINE, chemin)).href)) as T;
}

function docker(args: string[]): string {
  return execFileSync('docker', args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 180_000,
  });
}

/** Sortie d'un conteneur, pour le message d'un échec. */
function journal(conteneur: string): string {
  const sortie = spawnSync('docker', ['logs', '--tail', '80', conteneur], { encoding: 'utf-8' });
  return `${sortie.stdout ?? ''}\n${sortie.stderr ?? ''}`;
}

/** Attend que nginx réponde (n'importe quel statut) sur le port donné. */
async function attendre(port: number, conteneur: string): Promise<void> {
  for (let essai = 0; essai < 100; essai += 1) {
    try {
      await fetch(`http://127.0.0.1:${port}/donnees-relais/`);
      return;
    } catch {
      await new Promise((suite) => setTimeout(suite, 100));
    }
  }
  throw new Error(`nginx ne répond pas sur ${port} :\n${journal(conteneur)}`);
}

/** Lance `node --test` avec le rapporteur du banc et rend une entrée par test. */
function lancerNodeTest(
  fichier: string,
  env: Record<string, string>
): { statut: number | null; resultats: Resultat[]; sortie: string } {
  const propre: NodeJS.ProcessEnv = { ...process.env };
  for (const nom of Object.keys(propre)) {
    if (nom.startsWith('RELAY_') || nom.startsWith('CONFORMANCE_') || nom.startsWith('OBS_')) {
      delete propre[nom];
    }
  }
  delete propre.NODE_OPTIONS;
  delete propre.NODE_TEST_CONTEXT;
  const run = spawnSync(
    process.execPath,
    ['--test', '--test-reporter=./tests/relay/nginx/rapporteur.mjs', fichier],
    { cwd: RACINE, env: { ...propre, ...env }, encoding: 'utf8', timeout: 400_000 }
  );
  const sortie = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
  const resultats: Resultat[] = [];
  for (const ligne of (run.stdout ?? '').split('\n')) {
    if (!ligne.startsWith('{')) continue;
    try {
      resultats.push(JSON.parse(ligne) as Resultat);
    } catch {
      // ligne qui n'est pas du rapporteur
    }
  }
  return { statut: run.status, resultats, sortie };
}

describe.skipIf(!ACTIF)('relais cachable — extrait nginx, nginx réel', () => {
  const conteneurs = {
    relais: `relais-nginx-${process.pid}`,
    observation: `relais-nginx-obs-${process.pid}`,
    mandataire: `relais-nginx-mandataire-${process.pid}`,
  };
  let dossier = '';
  let banc: BancModule;
  let limites: LimitesModule;
  let montage: string[] = [];

  /** Écrit un dossier de configuration et rend les arguments `-v` du conteneur. */
  function preparer(
    nom: string,
    fichiers: Record<string, string>,
    squelette: { port: number; http: string[]; server: string[]; extra?: string }
  ): string[] {
    const racine = join(dossier, nom);
    mkdirSync(join(racine, 'banc'), { recursive: true });
    for (const [fichier, contenu] of Object.entries(fichiers)) {
      writeFileSync(join(racine, 'banc', fichier), contenu);
    }
    writeFileSync(join(racine, 'nginx.conf'), banc.squelette(squelette));
    return [
      ...montage,
      '-v',
      `${join(racine, 'banc')}:/etc/nginx/banc:ro`,
      '-v',
      `${join(racine, 'nginx.conf')}:/etc/nginx/nginx.conf:ro`,
    ];
  }

  beforeAll(async () => {
    banc = await importer<BancModule>('tests/relay/nginx/banc.mjs');
    limites = await importer<LimitesModule>('tests/relay/nginx/limites.mjs');
    dossier = mkdtempSync(join(tmpdir(), 'relais-nginx-'));
    chmodSync(dossier, 0o755);
    // Les fichiers de production, montés TELS QUELS sous le chemin que citent leurs `include`.
    montage = ['-v', `${banc.EXTRAIT_DIR}:/etc/nginx/relais:ro`];
  }, 60_000);

  afterAll(() => {
    for (const conteneur of Object.values(conteneurs)) {
      try {
        docker(['rm', '-f', conteneur]);
      } catch {
        // déjà arrêté
      }
    }
    if (dossier) rmSync(dossier, { recursive: true, force: true });
  });

  it('nginx -t : l’extrait de production, inclus comme le dit son README', () => {
    const volumes = preparer(
      'production',
      {},
      {
        port: 8080,
        http: [
          'relais/relais-http.conf',
          'relais/cles.example.conf',
          'relais/hotes.http.example.conf',
        ],
        server: ['relais/relais-server.conf', 'relais/hotes.server.example.conf'],
      }
    );
    // nginx résout le nom de chaque amont au chargement : sans réseau, on lui donne une
    // adresse de documentation (RFC 5737), jamais appelée.
    const hotes = banc.RENOMMAGES.slice(0, 3).flatMap(([exemple]) => [
      '--add-host',
      `${exemple}:192.0.2.1`,
    ]);
    const sortie = spawnSync(
      'docker',
      ['run', '--rm', '--network', 'none', ...hotes, ...volumes, IMAGE, 'nginx', '-t'],
      { encoding: 'utf-8', timeout: 180_000 }
    );
    expect(sortie.status, `${sortie.stdout}\n${sortie.stderr}`).toBe(0);
    const version = spawnSync(
      'docker',
      ['run', '--rm', '--network', 'none', IMAGE, 'nginx', '-v'],
      {
        encoding: 'utf-8',
        timeout: 60_000,
      }
    );
    console.log(
      `Image ${IMAGE} : ${/nginx version: \S+/.exec(`${version.stdout}\n${version.stderr}`)?.[0]}`
    );
    // Un avertissement de nginx sur l'extrait est une faute de l'extrait.
    expect(`${sortie.stdout}\n${sortie.stderr}`).not.toMatch(/\[(warn|emerg|error)\]/);
  }, 240_000);

  describe('suite de conformance du contrat (docs/RELAY.md)', () => {
    let resultats: Resultat[] = [];
    let sortie = '';

    beforeAll(async () => {
      const derive = banc.deriverBanc();
      const volumes = preparer(
        'relais',
        {
          'hotes.http.conf': derive.http,
          'hotes.server.conf': derive.server,
          'cles.conf': derive.cles,
        },
        {
          port: banc.PORT_RELAIS,
          http: ['relais/relais-http.conf', 'banc/cles.conf', 'banc/hotes.http.conf'],
          server: ['relais/relais-server.conf', 'banc/hotes.server.conf'],
        }
      );
      docker(['run', '-d', '--network', 'host', '--name', conteneurs.relais, ...volumes, IMAGE]);
      await attendre(banc.PORT_RELAIS, conteneurs.relais);

      // Les plafonds sont ceux de l'extrait de PRODUCTION, pas ceux du profil : le banc
      // ne change que l'adresse de l'amont. La suite est réglée en conséquence.
      const run = lancerNodeTest('tests/relay/conformance.test.mjs', {
        RELAY_URL: `http://127.0.0.1:${banc.PORT_RELAIS}/donnees-relais`,
        CONFORMANCE_HAS_CACHE: '1',
        CONFORMANCE_TIMEOUT_MS: '10000',
        CONFORMANCE_MAX_BYTES: '10485760',
        CONFORMANCE_RATE_REQUESTS: '600',
      });
      resultats = run.resultats;
      sortie = run.sortie;
      const rouges = resultats.filter((resultat) => resultat.issue === 'rouge');
      console.log(
        [
          `Suite de conformance contre nginx : ${resultats.filter((r) => r.issue === 'vert').length} verts, ` +
            `${rouges.length} rouges, ${resultats.filter((r) => r.issue === 'saute').length} sautés.`,
          ...rouges.map(
            (rouge) =>
              `  ROUGE ${rouge.nom}\n        ${String(rouge.erreur).split('\n').join(' ⏎ ')}`
          ),
          ...resultats.filter((r) => r.issue === 'note').map((note) => `  note : ${note.texte}`),
        ].join('\n')
      );
    }, 400_000);

    it('la suite a tourné en entier : 140 tests, trois sautés d’elle-même', () => {
      const tests = resultats.filter((resultat) => resultat.issue !== 'note');
      expect(tests.length, sortie.slice(-3000)).toBe(140);
      expect(tests.filter((resultat) => resultat.issue === 'saute').length).toBe(limites.SAUTES);
    });

    it('les tests rouges sont EXACTEMENT les limites documentées de l’extrait', () => {
      const rouges = resultats
        .filter((resultat) => resultat.issue === 'rouge')
        .map((resultat) => resultat.nom)
        .sort();
      const attendus = limites.LIMITES.map((limite) => limite.test).sort();
      expect(rouges, `${journal(conteneurs.relais)}`).toEqual(attendus);
    });

    it('chaque limite est rouge pour la raison documentée, pas pour une autre', () => {
      for (const limite of limites.LIMITES) {
        const rouge = resultats.find(
          (resultat) => resultat.issue === 'rouge' && resultat.nom === limite.test
        );
        expect(String(rouge?.erreur), limite.test).toMatch(limite.echec);
      }
    });

    it('la tolérance de C-SSRF-4 (chemin normalisé resté sous le préfixe) n’est pas ce qui fait passer nginx', () => {
      // Tous les chemins piégés sont REFUSÉS par l'extrait, sur la forme brute : les
      // dix-neuf tests C-SSRF-4 sont verts (hors `%00`, que nginx refuse avant de
      // router) sans que rien n'ait atteint l'amont. `observations.test.mjs` le
      // vérifie chemin par chemin.
      const pieges = resultats.filter((resultat) => resultat.nom?.startsWith('C-SSRF-4 — '));
      expect(pieges.length).toBe(19);
      expect(pieges.filter((resultat) => resultat.issue === 'vert').length).toBe(18);
    });
  });

  describe('observations', () => {
    let resultats: Resultat[] = [];
    let sortie = '';

    beforeAll(async () => {
      const derive = banc.deriverBanc({ dureeCache: 1 });
      const observation = preparer(
        'observation',
        {
          'hotes.http.conf': derive.http,
          'hotes.server.conf': derive.server,
          'cles.conf': derive.cles,
        },
        {
          port: banc.PORT_OBSERVATION,
          http: ['relais/relais-http.conf', 'banc/cles.conf', 'banc/hotes.http.conf'],
          server: ['relais/relais-server.conf', 'banc/hotes.server.conf'],
          extra: banc.LOCATIONS_NAIVES,
        }
      );
      const mandataire = preparer(
        'mandataire',
        {},
        {
          port: banc.PORT_MANDATAIRE,
          http: ['relais/mandataire-node.http.conf'],
          server: ['relais/mandataire-node.server.conf'],
        }
      );
      const demarreA = Date.now();
      docker([
        'run',
        '-d',
        '--network',
        'host',
        '--name',
        conteneurs.observation,
        ...observation,
        IMAGE,
      ]);
      docker([
        'run',
        '-d',
        '--network',
        'host',
        '--name',
        conteneurs.mandataire,
        ...mandataire,
        IMAGE,
      ]);
      await attendre(banc.PORT_OBSERVATION, conteneurs.observation);
      await attendre(banc.PORT_MANDATAIRE, conteneurs.mandataire);

      const run = lancerNodeTest('tests/relay/nginx/observations.test.mjs', {
        OBS_RELAIS_URL: `http://127.0.0.1:${banc.PORT_OBSERVATION}/donnees-relais`,
        OBS_MANDATAIRE_URL: `http://127.0.0.1:${banc.PORT_MANDATAIRE}/donnees-relais`,
        // nginx ne charge son cache qu'une minute après son démarrage : une partie des
        // observations attend ce moment.
        OBS_DEMARRE_A: String(demarreA),
        // Une observation REDÉMARRE ce conteneur : ce que devient le cache après.
        OBS_CONTENEUR: conteneurs.observation,
      });
      resultats = run.resultats;
      sortie = run.sortie;
      console.log(
        [
          'Observations sur nginx :',
          ...resultats.map((resultat) =>
            resultat.issue === 'note'
              ? `  note : ${resultat.texte}`
              : `  ${resultat.issue.toUpperCase()} ${resultat.nom}${resultat.erreur ? `\n        ${resultat.erreur.split('\n').join(' ⏎ ')}` : ''}`
          ),
        ].join('\n')
      );
    }, 400_000);

    it('toutes les observations tiennent', () => {
      const tests = resultats.filter((resultat) => resultat.issue !== 'note');
      expect(tests.length, sortie.slice(-3000)).toBeGreaterThan(30);
      const rouges = tests.filter((resultat) => resultat.issue === 'rouge');
      expect(
        rouges.map((rouge) => `${rouge.nom} — ${rouge.erreur}`),
        `${journal(conteneurs.observation)}\n${journal(conteneurs.mandataire)}`
      ).toEqual([]);
      expect(tests.filter((resultat) => resultat.issue === 'saute').length).toBe(0);
    });
  });
});
