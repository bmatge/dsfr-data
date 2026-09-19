import { describe, it, expect } from 'vitest';

import {
  evaluerInvariants,
  lignesEmises,
  referenceInvariant,
} from '../../tools/oracle/invariants.js';
import type { Expect, Invariant, Row } from '../../tools/oracle/manifest.js';

/**
 * Les invariants (#881), éprouvés en tableaux nus : la référence vient des
 * lignes BRUTES, l'évaluation porte sur ce que la page a montré, et chaque
 * sorte est vue tenue ET violée ici avant de l'être dans un navigateur.
 */

const BRUTES: Row[] = [
  { code: '01', region: 'nord', montant: 10, part: 0.2 },
  { code: '02', region: 'nord', montant: '', part: 0.5 },
  { code: '03', region: '', montant: 5, part: 1 },
  { code: '04', region: null, montant: null, part: 0 },
];
const DATASETS = { main: BRUTES, autre: [{ code: '05', region: 'sud', montant: 7, part: 0.1 }] };

const ROWS: Expect = { kind: 'rows', id: 'q', key: 'code', columns: ['montant'], pipeline: [] };
const KPI: Expect = { kind: 'kpi', id: 'k', agg: 'sum', field: 'montant' };

function verdict(inv: Invariant, e: Expect, observation: unknown, diagnostics?: unknown) {
  const attendu = referenceInvariant(inv, DATASETS);
  return evaluerInvariants(e, [attendu], observation as never, diagnostics as never)[0];
}

describe('vérification des données — les invariants', () => {
  it('sum-preserved : la somme émise vaut la somme brute, sur un ou plusieurs jeux', () => {
    const inv: Invariant = { kind: 'sum-preserved', field: 'montant' };
    expect(referenceInvariant(inv, DATASETS).reference.sum).toBe(15);
    expect(
      verdict(inv, ROWS, [
        { code: '01', montant: 10 },
        { code: '03', montant: 5 },
      ]).ok
    ).toBe(true);
    // Une relation 1-N gonfle la somme : c'est exactement ce que l'invariant voit.
    const gonfle = verdict(inv, ROWS, [
      { code: '01', montant: 10 },
      { code: '01', montant: 10 },
      { code: '03', montant: 5 },
    ]);
    expect(gonfle.ok).toBe(false);
    expect(gonfle.message).toContain('25');
    expect(referenceInvariant({ ...inv, from: ['main', 'autre'] }, DATASETS).reference.sum).toBe(
      22
    );
  });

  it('count-preserved et count-equals', () => {
    expect(verdict({ kind: 'count-preserved' }, ROWS, BRUTES).ok).toBe(true);
    expect(verdict({ kind: 'count-preserved' }, ROWS, BRUTES.slice(1)).ok).toBe(false);
    expect(verdict({ kind: 'count-equals', n: 2 }, ROWS, BRUTES.slice(0, 2)).ok).toBe(true);
    expect(verdict({ kind: 'count-equals', n: 2 }, ROWS, BRUTES).message).toContain('4 lignes');
  });

  it('null-group : visible avec son compte, ou exclu avec le total des autres', () => {
    const groupes: Expect = { kind: 'rows', id: 'g', key: 'region', columns: ['nb'], pipeline: [] };
    const visible: Invariant = {
      kind: 'null-group',
      field: 'region',
      expect: 'visible',
      count: 'nb',
    };
    const ref = referenceInvariant(visible, DATASETS).reference;
    expect(ref).toEqual({ nullCount: 2, nonNullCount: 2 });
    expect(
      verdict(visible, groupes, [
        { region: 'nord', nb: 2 },
        { region: '', nb: 2 },
      ]).ok
    ).toBe(true);
    // Le groupe null fondu dans un autre : plus de ligne vide.
    const fondu = verdict(visible, groupes, [{ region: 'nord', nb: 4 }]);
    expect(fondu.ok).toBe(false);
    expect(fondu.message).toContain('disparu');
    // Visible mais mal compté.
    expect(
      verdict(visible, groupes, [
        { region: 'nord', nb: 2 },
        { region: '', nb: 1 },
      ]).ok
    ).toBe(false);

    const exclu: Invariant = {
      kind: 'null-group',
      field: 'region',
      expect: 'excluded',
      count: 'nb',
    };
    expect(verdict(exclu, groupes, [{ region: 'nord', nb: 2 }]).ok).toBe(true);
    expect(
      verdict(exclu, groupes, [
        { region: 'nord', nb: 2 },
        { region: null, nb: 2 },
      ]).ok
    ).toBe(false);
    expect(verdict(exclu, groupes, [{ region: 'nord', nb: 3 }]).message).toContain(
      'somme des comptes'
    );
  });

  it('bounded : sur les lignes, ou sur la valeur d’un KPI', () => {
    const inv: Invariant = { kind: 'bounded', field: 'part', min: 0, max: 1 };
    const parts: Expect = { kind: 'rows', id: 'p', key: 'code', columns: ['part'], pipeline: [] };
    expect(verdict(inv, parts, BRUTES).ok).toBe(true);
    const hors = verdict(inv, parts, [{ code: '01', part: 57.24 }]);
    expect(hors.ok).toBe(false);
    expect(hors.message).toContain('57.24');
    // Rien à borner n'est pas un invariant tenu.
    expect(verdict(inv, parts, [{ code: '01', part: null }]).ok).toBe(false);
    // Un KPI : c'est sa valeur qui est bornée, quel que soit `field`.
    expect(
      verdict({ kind: 'bounded', min: 0, max: 100 }, KPI, { text: '28,3 %', value: 28.3 }).ok
    ).toBe(true);
    expect(
      verdict({ kind: 'bounded', min: 0, max: 100 }, KPI, { text: '5 724 %', value: 5724 }).ok
    ).toBe(false);
  });

  it('null-stays-null : par clé, ou par compte', () => {
    const parCle: Invariant = {
      kind: 'null-stays-null',
      field: 'total',
      rawField: 'montant',
      key: 'code',
    };
    expect(referenceInvariant(parCle, DATASETS).reference.nullKeys).toEqual(['02', '04']);
    const sortie: Expect = { kind: 'rows', id: 'n', key: 'code', columns: ['total'], pipeline: [] };
    expect(
      verdict(parCle, sortie, [
        { code: '02', total: null },
        { code: '04', total: '' },
      ]).ok
    ).toBe(true);
    const devenu = verdict(parCle, sortie, [
      { code: '02', total: 0 },
      { code: '04', total: null },
    ]);
    expect(devenu.ok).toBe(false);
    expect(devenu.message).toContain('02 → 0');
    const parCompte: Invariant = { kind: 'null-stays-null', field: 'montant' };
    expect(
      verdict(parCompte, sortie, [
        { code: '02', montant: null },
        { code: '04', montant: null },
      ]).ok
    ).toBe(true);
    expect(
      verdict(parCompte, sortie, [
        { code: '02', montant: 0 },
        { code: '04', montant: null },
      ]).ok
    ).toBe(false);
  });

  it('not-truncated : toutes les lignes, ou un diagnostic', () => {
    const inv: Invariant = { kind: 'not-truncated' };
    const muet = { configError: null, console: [] };
    expect(verdict(inv, ROWS, BRUTES, muet).ok).toBe(true);
    const tronque = verdict(inv, ROWS, BRUTES.slice(0, 3), muet);
    expect(tronque.ok).toBe(false);
    expect(tronque.message).toContain('silencieuse');
    const dit = {
      configError: null,
      console: [
        { level: 'warn', text: 'dsfr-data-source[s]: 3 lignes sur 4, max-records atteint' },
      ],
    };
    expect(verdict(inv, ROWS, BRUTES.slice(0, 3), dit).ok).toBe(true);
    // Sur un KPI `count`, c'est la VALEUR affichée qui compte les lignes.
    const compteur: Expect = { kind: 'kpi', id: 'k', agg: 'count' };
    expect(verdict(inv, compteur, { text: '4', value: 4 }, muet).ok).toBe(true);
    expect(verdict(inv, compteur, { text: '3', value: 3 }, muet).ok).toBe(false);
    expect(verdict(inv, compteur, { text: '3', value: 3 }, dit).lib).toContain('max-records');
    // En attente : évalué, rendu, mais marqué.
    const attente = verdict(
      { kind: 'not-truncated', skip: 'AM-002' },
      ROWS,
      BRUTES.slice(0, 3),
      muet
    );
    expect(attente.ok).toBe(false);
    expect(attente.attente).toBe('AM-002');
  });

  it('lignesEmises : chaque genre d’observation redevient des lignes', () => {
    const liste: Expect = {
      kind: 'list',
      id: 'l',
      columns: [{ column: 'nom' }, { column: 'taux', numeric: true }],
      pipeline: [],
    };
    expect(lignesEmises(liste, { headers: [], rows: [['Arles', '12,5 %']] })).toEqual([
      { nom: 'Arles', taux: 12.5 },
    ]);
    const graphe: Expect = {
      kind: 'chart',
      id: 'g',
      labelColumn: 'zone',
      valueColumns: ['a', 'b'],
      pipeline: [],
    };
    expect(
      lignesEmises(graphe, { tag: 'bar-chart', labels: ['nord'], series: [[1], [2]], names: [] })
    ).toEqual([{ zone: 'nord', a: 1, b: 2 }]);
    const facettes: Expect = {
      kind: 'facets',
      id: 'f',
      group: 'Région',
      valueColumn: 'region',
      countColumn: 'nb',
      pipeline: [],
    };
    expect(
      lignesEmises(facettes, [{ group: 'Région', values: [{ value: 'nord', count: 2 }] }])
    ).toEqual([{ region: 'nord', nb: 2 }]);
    expect(lignesEmises(facettes, [{ group: 'Autre', values: [] }])).toBeNull();
    expect(lignesEmises({ kind: 'urls', id: 'u', contains: 'x', verdict: 'none' }, [])).toBeNull();
  });
});
