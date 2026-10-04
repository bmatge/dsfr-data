// @vitest-environment node
//
// Relais cachable (ADR-155, lot 1) — pont entre Vitest et la suite de conformance.
//
// La suite de conformance et les tests du relais de référence sont écrits en
// `node:test`, sans dépendance, pour qu'un intégrateur les lance contre SON
// relais (`RELAY_URL=… node --test tests/relay/conformance.test.mjs`) sans
// installer le dépôt. Ce fichier les fait tourner dans la CI du dépôt, contre le
// relais Node de référence, par `npm run test:run` : aucune étape de workflow
// à ajouter, et un relais cassé rougit la même commande que le reste.
//
// Contrat : docs/RELAY.md. Relais : proxy/relay/node/.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const REFERENCE_DIR = join(ROOT, 'tests/relay/reference');

/** Tests de `tls.test.mjs` qui ont besoin d'un certificat fabriqué par `openssl`. */
const TLS_CERTIFICATE_TESTS = 4;

interface NodeTestRun {
  status: number | null;
  output: string;
  pass: number;
  fail: number;
  skipped: number;
}

/** Lance `node --test` sur les fichiers donnés et lit le décompte final. */
function runNodeTests(files: string[]): NodeTestRun {
  // La suite doit éprouver le relais de RÉFÉRENCE : on retire de l'environnement
  // tout ce qui la dirigerait vers un autre relais ou changerait ses réglages.
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name === 'RELAY_URL' || name.startsWith('CONFORMANCE_') || name.startsWith('RELAY_')) {
      delete env[name];
    }
  }
  delete env.NODE_OPTIONS;
  delete env.NODE_TEST_CONTEXT;

  const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    timeout: 150_000,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const count = (pattern: RegExp): number => {
    const match = pattern.exec(output);
    return match ? Number(match[1]) : -1;
  };
  return {
    status: result.status,
    output,
    pass: count(/^ℹ pass (\d+)$/m),
    fail: count(/^ℹ fail (\d+)$/m),
    skipped: count(/^ℹ skipped (\d+)$/m),
  };
}

/** En cas d'échec, le message porte la liste des tests rouges de `node:test`. */
function failures(run: NodeTestRun): string {
  const index = run.output.indexOf('✖ failing tests:');
  return index === -1 ? run.output.slice(-4000) : run.output.slice(index, index + 6000);
}

describe('relais cachable — relais Node de référence (ADR-155)', () => {
  it('passe la suite de conformance du contrat (docs/RELAY.md)', () => {
    const run = runNodeTests(['tests/relay/conformance.test.mjs']);
    expect(run.status, failures(run)).toBe(0);
    expect(run.fail).toBe(0);
    // Garde contre une suite qui ne lancerait plus rien : un décompte vide est un échec.
    expect(run.pass).toBeGreaterThan(130);
    // Trois règles ne s'observent pas de l'extérieur (C-SSRF-6, C-CACHE-4/5,
    // C-DOS-4) : elles sont sautées ICI et éprouvées par le test suivant. Un
    // quatrième saut serait une règle qui a cessé d'être vérifiée.
    expect(run.skipped).toBe(3);
  }, 180_000);

  it('passe ses tests propres : DNS, rebond, cache, journaux, plafonds, configuration, amont hostile, TLS', () => {
    const files = readdirSync(REFERENCE_DIR)
      .filter((name) => name.endsWith('.test.mjs'))
      .sort()
      .map((name) => `tests/relay/reference/${name}`);
    expect(files).toEqual([
      'tests/relay/reference/addresses.test.mjs',
      'tests/relay/reference/config.test.mjs',
      'tests/relay/reference/rate-limit.test.mjs',
      'tests/relay/reference/relay.test.mjs',
      'tests/relay/reference/target.test.mjs',
      'tests/relay/reference/tls.test.mjs',
      'tests/relay/reference/upstream.test.mjs',
    ]);
    const run = runNodeTests(files);
    expect(run.status, failures(run)).toBe(0);
    expect(run.fail).toBe(0);
    expect(run.pass).toBeGreaterThan(280);
    // Le nombre de sauts est EXACT. En CI : aucun — le connecteur TLS de
    // production y est vérifié, `openssl` compris (son absence fait échouer
    // `tls.test.mjs`, qui ne se saute alors plus). Sur un poste sans `openssl` :
    // les quatre tests qui ont besoin d'un certificat, et eux seuls, chacun
    // disant pourquoi. Tout autre décompte est un test qui a cessé de tourner.
    if (process.env.CI) {
      expect(run.skipped).toBe(0);
    } else {
      expect([0, TLS_CERTIFICATE_TESTS]).toContain(run.skipped);
      const reasons = run.output.match(/# openssl absent ou sans `-addext`/g) ?? [];
      expect(reasons.length).toBe(run.skipped);
    }
  }, 180_000);
});
