import { describe, it, expect } from 'vitest';

import { comparer } from '../../tools/oracle/compare.js';
import { cleAttendu, computeExpectedFor } from '../../tools/oracle/expected.js';
import type { ObservationDiagnostic } from '../../tools/oracle/observe.js';
import type { Check, ExpectDiagnostic } from '../../tools/oracle/manifest.js';

/**
 * Le lecteur de SILENCES et ses trois verdicts (#878).
 *
 * Les trois chiffres faux du 18/09 avaient la même signature : plausibles, et
 * aucune erreur. Ce test fixe le contrat du verdict — ce que « la bibliothèque
 * a parlé » veut dire, ce qu'un fragment restreint, et surtout qu'un silence
 * CONSTATÉ compte comme une observation (jamais zéro comparaison, sinon le
 * spec le refuserait comme un vert vide).
 */

const CTX = { domaine: 'test', controle: 'c', mode: 'deterministic' as const, rawRows: 0 };

function constat(expect_: ExpectDiagnostic, obs: ObservationDiagnostic) {
  const check: Check = {
    id: 'c',
    mode: 'deterministic',
    origin: 'test',
    feed: { kind: 'fixture', datasets: { main: [] } },
    markup: '',
    expects: [expect_],
  };
  const attendu = computeExpectedFor(check, {}).values[cleAttendu(expect_)];
  return comparer(CTX, expect_, attendu, obs);
}

const MUET: ObservationDiagnostic = { configError: null, console: [] };
const PARLE: ObservationDiagnostic = {
  configError: 'attribut "sources" : l’id « s1,s2 » ne désigne aucune source',
  console: [
    {
      level: 'error',
      text: 'dsfr-data-context: attribut "sources" : l’id « s1,s2 » ne désigne aucune source',
    },
    { level: 'warn', text: 'dsfr-data-context[ctx]: le champ "x" n’existe pas sur la source "s3"' },
  ],
};

describe('vérification des données — les silences', () => {
  it('la clé distingue deux verdicts sur le même élément', () => {
    expect(cleAttendu({ kind: 'diagnostic', id: 'ctx', expect: 'silence' })).toBe(
      'diagnostic:ctx:silence'
    );
    expect(cleAttendu({ kind: 'diagnostic', id: 'ctx', expect: 'warning' })).toBe(
      'diagnostic:ctx:warning'
    );
  });

  it('silence : ni marqueur ni message — et le constat compte quand même', () => {
    const ok = constat({ kind: 'diagnostic', id: 'ctx', expect: 'silence' }, MUET);
    expect(ok.ok).toBe(true);
    expect(ok.comparaisons).toBeGreaterThan(0);

    const rompu = constat({ kind: 'diagnostic', id: 'ctx', expect: 'silence' }, PARLE);
    expect(rompu.ok).toBe(false);
    expect(rompu.message).toContain('a parlé');
  });

  it('silence restreint à un fragment : un message sur un autre sujet ne le rompt pas', () => {
    const autreSujet: ObservationDiagnostic = {
      configError: null,
      console: [{ level: 'warn', text: 'dsfr-data-facets[f]: attribut "display" — séparateur' }],
    };
    expect(
      constat({ kind: 'diagnostic', id: 'ctx', expect: 'silence', contains: 'sources' }, autreSujet)
        .ok
    ).toBe(true);
    expect(
      constat({ kind: 'diagnostic', id: 'ctx', expect: 'silence', contains: 'display' }, autreSujet)
        .ok
    ).toBe(false);
  });

  it('warning : au moins un message de la bibliothèque, portant le fragment s’il est donné', () => {
    expect(constat({ kind: 'diagnostic', id: 'ctx', expect: 'warning' }, MUET).ok).toBe(false);
    expect(constat({ kind: 'diagnostic', id: 'ctx', expect: 'warning' }, MUET).message).toContain(
      'rien dit'
    );
    expect(constat({ kind: 'diagnostic', id: 'ctx', expect: 'warning' }, PARLE).ok).toBe(true);
    expect(
      constat({ kind: 'diagnostic', id: 'ctx', expect: 'warning', contains: 's1,s2' }, PARLE).ok
    ).toBe(true);
    const absent = constat(
      { kind: 'diagnostic', id: 'ctx', expect: 'warning', contains: 'max-records' },
      PARLE
    );
    expect(absent.ok).toBe(false);
    expect(absent.message).toContain('max-records');
  });

  it('config-error : le marqueur de l’élément, avec le fragment', () => {
    expect(constat({ kind: 'diagnostic', id: 'ctx', expect: 'config-error' }, MUET).ok).toBe(false);
    expect(constat({ kind: 'diagnostic', id: 'ctx', expect: 'config-error' }, PARLE).ok).toBe(true);
    expect(
      constat({ kind: 'diagnostic', id: 'ctx', expect: 'config-error', contains: 's1,s2' }, PARLE)
        .ok
    ).toBe(true);
    // Un message console ne vaut pas un marqueur : les deux canaux sont distincts.
    const consoleSeule: ObservationDiagnostic = { configError: null, console: PARLE.console };
    expect(
      constat({ kind: 'diagnostic', id: 'ctx', expect: 'config-error' }, consoleSeule).ok
    ).toBe(false);
  });

  it('rien à observer : un constat en échec, pas un vert vide', () => {
    const check: Check = {
      id: 'c',
      mode: 'deterministic',
      origin: 'test',
      feed: { kind: 'fixture', datasets: { main: [] } },
      markup: '',
      expects: [{ kind: 'diagnostic', id: 'ctx', expect: 'silence' }],
    };
    const attendu = computeExpectedFor(check, {}).values['diagnostic:ctx:silence'];
    const c = comparer(CTX, check.expects[0], attendu, null);
    expect(c.ok).toBe(false);
    expect(c.comparaisons).toBe(0);
  });
});
