import { describe, it, expect } from 'vitest';

import { comparer } from '../../tools/oracle/compare.js';
import { computeExpectedFor } from '../../tools/oracle/expected.js';
import { lireUrls } from '../../tools/oracle/observe.js';
import type { Check, ExpectUrls } from '../../tools/oracle/manifest.js';

/**
 * Le lecteur d'URL et son verdict (#836, #838).
 *
 * Deux balisages peuvent montrer les mêmes chiffres en demandant au serveur
 * des choses opposées : qu'une `dsfr-data-query` délègue ou non son `group_by`
 * ne se lit que dans les URL appelées. Ce test fixe le contrat des cinq
 * verdicts et, surtout, le cas où le contrôle ne juge RIEN — aucune URL
 * retenue, zéro comparaison, constat en échec plutôt qu'un vert vide.
 */

const CTX = { domaine: 'test', controle: 'c', mode: 'deterministic' as const, rawRows: 0 };

function constat(expect_: ExpectUrls, urls: string[]) {
  const check: Check = {
    id: 'c',
    mode: 'deterministic',
    origin: 'test',
    feed: { kind: 'fixture', datasets: { main: [] } },
    markup: '',
    expects: [expect_],
  };
  const attendu = computeExpectedFor(check, {}).values[`urls:${expect_.id}`];
  return comparer(CTX, expect_, attendu, urls);
}

const RECORDS = '/datasets/jeu/records';

describe('vérification des données — les URL appelées', () => {
  const appelees = [
    `https://ods.invalid${RECORDS}?limit=100&offset=0`,
    `https://ods.invalid${RECORDS}?group_by=academie&select=sum(population) as pop`,
    'https://autre.invalid/ping',
  ];

  it('none : aucune URL retenue ne porte le fragment', () => {
    const sans = constat(
      { kind: 'urls', id: 'u', among: RECORDS, contains: 'group_by=', verdict: 'none' },
      [appelees[0]]
    );
    expect(sans.ok).toBe(true);
    expect(sans.comparaisons).toBe(1);

    const avec = constat(
      { kind: 'urls', id: 'u', among: RECORDS, contains: 'group_by=', verdict: 'none' },
      appelees
    );
    expect(avec.ok).toBe(false);
    expect(avec.message).toContain('none');
  });

  it('some et all : au moins une, ou toutes', () => {
    const some = constat(
      { kind: 'urls', id: 'u', among: RECORDS, contains: 'group_by=', verdict: 'some' },
      appelees
    );
    expect(some.ok).toBe(true);
    // `among` a bien écarté l'URL hors sujet : deux retenues, pas trois.
    expect(some.comparaisons).toBe(2);

    const all = constat(
      { kind: 'urls', id: 'u', among: RECORDS, contains: 'group_by=', verdict: 'all' },
      appelees
    );
    expect(all.ok).toBe(false);
  });

  it('last et notLast : l’état où la page s’est arrêtée', () => {
    // Délégation retirée en cours de route (renégociation #765) : le group_by
    // a bien été demandé une fois, mais plus a la fin.
    const renegociee = [appelees[1], appelees[0]];
    expect(
      constat(
        { kind: 'urls', id: 'u', among: RECORDS, contains: 'group_by=', verdict: 'notLast' },
        renegociee
      ).ok
    ).toBe(true);
    expect(
      constat(
        { kind: 'urls', id: 'u', among: RECORDS, contains: 'group_by=', verdict: 'some' },
        renegociee
      ).ok
    ).toBe(true);
    expect(
      constat(
        { kind: 'urls', id: 'u', among: RECORDS, contains: 'group_by=', verdict: 'last' },
        renegociee
      ).ok
    ).toBe(false);
  });

  it('aucune URL retenue : le contrôle ne juge rien, et le dit', () => {
    const rien = constat(
      { kind: 'urls', id: 'u', among: '/introuvable', contains: 'group_by=', verdict: 'none' },
      appelees
    );
    expect(rien.ok).toBe(false);
    expect(rien.comparaisons).toBe(0);
    expect(rien.message).toContain('ne juge rien');
  });

  it('le lecteur rend les URL DÉCODÉES, dans l’ordre, ou rien', () => {
    const w = window as unknown as { __verifUrls?: unknown };
    expect(lireUrls()).toEqual([]);
    w.__verifUrls = [
      'https://ods.invalid/records?select=sum%28population%29+as+pop',
      new URL('https://ods.invalid/records?group_by=academie'),
    ];
    // `URLSearchParams` encode l'espace en `+` et les parenthèses : un fragment
    // cherché sur l'URL brute ne trouverait rien.
    expect(lireUrls()[0]).toContain('select=sum(population) as pop');
    expect(lireUrls()[1]).toContain('group_by=academie');
    delete w.__verifUrls;
  });
});
