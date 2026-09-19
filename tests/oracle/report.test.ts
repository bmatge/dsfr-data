import { describe, it, expect } from 'vitest';

import { construireRapport, resumeTexte } from '../../tools/oracle/report.js';
import type { Constat } from '../../tools/oracle/compare.js';

/**
 * Le RÉSUMÉ du rapport — la première ligne que l'on lit après un run.
 *
 * Il compte à part ce qui ne se compte pas ensemble : les valeurs, les
 * invariants (#881), les observations à trois voix (#880), et les verdicts du
 * recoupement serveur (#883) — dont les observations pour lesquelles le
 * serveur n'a rien dit (quota, échec), qui restent à deux voix et doivent se
 * voir comme telles. Un résumé qui les fondrait dans le vert annoncerait un
 * recoupement qui n'a pas eu lieu.
 */

function constat(partiel: Partial<Constat> & Pick<Constat, 'observation'>): Constat {
  return {
    domaine: 'banc-pages',
    controle: 'c',
    mode: 'live',
    rawRows: 10,
    lib: '1',
    oracle: '1',
    ecart: 0,
    comparaisons: 1,
    ok: true,
    message: '',
    ...partiel,
  };
}

describe('construireRapport et resumeTexte', () => {
  it('compte les verdicts du recoupement par phrase, et le serveur muet à part', () => {
    const rapport = construireRapport([
      constat({
        observation: 'kpi:a',
        serveur: '1',
        ecartServeur: 0,
        verdict: 'oracle = serveur, lib = oracle : trois voix',
      }),
      constat({
        observation: 'kpi:b',
        serveur: '1',
        ecartServeur: 0,
        verdict: 'oracle = serveur, lib = oracle : trois voix',
      }),
      constat({
        observation: 'kpi:c',
        lib: '2',
        ok: false,
        message: 'oracle = serveur, lib ≠ oracle : bibliothèque',
        serveur: '1',
        ecartServeur: 1,
        verdict: 'oracle = serveur, lib ≠ oracle : bibliothèque',
      }),
      // Le serveur n'a rien dit : deux voix, et le résumé le compte.
      constat({
        observation: 'kpi:d',
        serveur:
          'quota : 400 requêtes restantes sur data.sports.gouv.fr, sous le seuil de 500 — recoupement arrêté pour ce portail',
        ecartServeur: null,
      }),
      constat({ observation: 'kpi:e' }),
    ]);
    expect(rapport.recoupement.verdicts).toEqual({
      'oracle = serveur, lib = oracle : trois voix': 2,
      'oracle = serveur, lib ≠ oracle : bibliothèque': 1,
    });
    expect(rapport.recoupement.sansServeur).toBe(1);
    expect(rapport.echecs).toBe(1);

    const texte = resumeTexte(rapport);
    expect(texte).toContain('2 × « oracle = serveur, lib = oracle : trois voix »');
    expect(texte).toContain('1 × « oracle = serveur, lib ≠ oracle : bibliothèque »');
    expect(texte).toContain('1 sans réponse du serveur');
    expect(texte).toContain('verdict : oracle = serveur, lib ≠ oracle : bibliothèque');
    expect(texte).toContain('serveur quota : 400 requêtes restantes');
  });

  it('sans recoupement ni invariant, le résumé reste celui de deux voix', () => {
    const texte = resumeTexte(construireRapport([constat({ observation: 'kpi:a' })]));
    expect(texte).toBe(
      'Vérification des données — 1 observations, 1 valeurs comparées, 0 échec(s).\n\n' +
        '  banc-pages/c [live] — 10 lignes brutes\n' +
        '    ok   kpi:a                      lib 1                            oracle 1                            écart 0'
    );
  });

  it('range les invariants à part des valeurs', () => {
    const rapport = construireRapport([
      constat({ observation: 'kpi:a' }),
      constat({ observation: 'kpi:a#count-preserved', invariant: true }),
      constat({
        observation: 'kpi:a#sum-preserved:x',
        invariant: true,
        ok: false,
        attente: 'PG-001',
      }),
      constat({ observation: 'kpi:a#bounded', invariant: true, ok: false, message: 'hors bornes' }),
    ]);
    expect(rapport.total).toBe(1);
    expect(rapport.invariants).toEqual({ tenus: 1, violes: 1, attente: 1 });
    expect(resumeTexte(rapport)).toContain('invariants : 1 tenu(s), 1 violé(s), 1 en attente');
    expect(resumeTexte(rapport)).toContain('ATT. kpi:a#sum-preserved:x');
  });
});
