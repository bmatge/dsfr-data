import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Le résumé d'une nuit pour le workflow (`tools/oracle/resume-nuit.mjs`,
 * ADR-168) : ce que oracle.yml lit pour décider d'un gel (verdict
 * « bibliothèque ») ou d'un simple commentaire (« donnée », « indéterminé »).
 *
 * Le script est lancé comme le workflow le lance — un processus Node, un
 * dossier `out/`, un fichier `$GITHUB_OUTPUT` — pour que le test éprouve
 * l'interface réelle, pas une fonction interne.
 */

const SCRIPT = resolve(__dirname, '../../tools/oracle/resume-nuit.mjs');

function constat(partiel: Record<string, unknown>) {
  return {
    domaine: 'banc-pages',
    controle: 'c',
    mode: 'live',
    rawRows: 10,
    observation: 'kpi:a',
    lib: '1',
    oracle: '1',
    ecart: 0,
    comparaisons: 1,
    ok: true,
    message: '',
    ...partiel,
  };
}

function lancer(dossier: string): { stdout: string; sorties: Record<string, string> } {
  const fichier = join(dossier, 'github-output.txt');
  writeFileSync(fichier, '');
  const stdout = execFileSync(process.execPath, [SCRIPT, dossier, '--github-output', fichier], {
    encoding: 'utf-8',
  });
  const sorties: Record<string, string> = {};
  for (const ligne of readFileSync(fichier, 'utf-8').split('\n')) {
    const i = ligne.indexOf('=');
    if (i > 0) sorties[ligne.slice(0, i)] = ligne.slice(i + 1);
  }
  return { stdout, sorties };
}

describe('resume-nuit.mjs', () => {
  let dossier: string;
  beforeEach(() => {
    dossier = mkdtempSync(join(tmpdir(), 'resume-nuit-'));
  });
  afterEach(() => {
    rmSync(dossier, { recursive: true, force: true });
  });

  it('compte les échecs par verdict et liste les gels écrits', () => {
    writeFileSync(
      join(dossier, 'report.json'),
      JSON.stringify({
        generatedAt: '2026-11-24T18:06:15.992Z',
        total: 4,
        comparaisons: 40,
        echecs: 3,
        nuit: { verdicts: { bibliothèque: 2, indéterminé: 1 }, instables: 0 },
        constats: [
          constat({ observation: 'kpi:ok', fraicheur: 'bibliothèque' }),
          constat({
            controle: 'part-ponderee',
            observation: 'kpi:k-etp',
            ok: false,
            lib: '503 823',
            oracle: '579114',
            serveur: '579114',
            message: 'affiché 503 823, recalculé 579114',
            fraicheur: 'bibliothèque',
          }),
          constat({
            controle: 'rejoue',
            observation: 'kpi:b',
            ok: false,
            fraicheur: 'donnée, rejoué',
          }),
          constat({
            domaine: 'banc-adaptateurs',
            controle: 'tabular',
            observation: 'urls:x',
            ok: false,
            fraicheur: 'indéterminé',
          }),
          // Un invariant violé n'est pas un échec de valeur.
          constat({ observation: 'kpi:a#bounded', ok: false, invariant: true }),
        ],
      })
    );
    mkdirSync(join(dossier, 'gel'));
    writeFileSync(join(dossier, 'gel', 'part-ponderee-gel.json'), '{}');
    writeFileSync(join(dossier, 'gel', 'lisez-moi.txt'), 'pas un gel');

    const { stdout, sorties } = lancer(dossier);

    expect(sorties).toMatchObject({
      date: '2026-11-24',
      echecs: '3',
      bibliotheque: '1',
      donnee: '1',
      indetermine: '1',
      gels: 'part-ponderee-gel.json',
      rouge: 'true',
    });
    expect(sorties.resume).toBe(join(dossier, 'resume-nuit.md'));
    expect(readFileSync(sorties.resume, 'utf-8')).toBe(stdout);

    expect(stdout).toContain('## Nuit du 2026-11-24');
    expect(stdout).toContain('**3 échec(s)**');
    expect(stdout).toContain(
      'Verdicts de la nuit (rapport) : 2 × « bibliothèque », 1 × « indéterminé ».'
    );
    expect(stdout).toContain('| bibliothèque | **1** |');
    expect(stdout).toContain(
      '- `banc-pages/part-ponderee` · `kpi:k-etp` — lib 503 823, oracle 579114, serveur 579114 — affiché 503 823, recalculé 579114'
    );
    expect(stdout).toContain('- `part-ponderee-gel.json`');
    // Le constat vert au verdict bibliothèque n'est pas listé comme échec.
    expect(stdout).not.toContain('`kpi:ok`');
  });

  it('une nuit verte : zéro partout, rouge=false, aucun gel', () => {
    writeFileSync(
      join(dossier, 'report.json'),
      JSON.stringify({
        generatedAt: '2026-11-25T06:40:00.000Z',
        total: 1,
        comparaisons: 1,
        echecs: 0,
        nuit: { verdicts: {}, instables: 0 },
        constats: [constat({})],
      })
    );
    const { stdout, sorties } = lancer(dossier);
    expect(sorties).toMatchObject({ echecs: '0', bibliotheque: '0', gels: '', rouge: 'false' });
    expect(stdout).not.toContain('### ');
  });

  it('sans rapport, le run est rouge et le résumé le dit', () => {
    const { stdout, sorties } = lancer(dossier);
    expect(sorties.rouge).toBe('true');
    expect(sorties.bibliotheque).toBe('0');
    expect(stdout).toContain('**Aucun rapport**');
  });
});
