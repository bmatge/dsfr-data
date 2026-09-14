import { describe, it, expect } from 'vitest';
import {
  absent,
  aggregate,
  aggregateText,
  applyFilter,
  closeEnough,
  countDistinct,
  diff,
  egal,
  equalIntervalBreaks,
  evolution,
  groupBy,
  isoToFrDate,
  joinRows,
  legendClasses,
  orderBy,
  parseCsv,
  parseDisplayedNumber,
  quantileBreaks,
  ratioColumn,
  roundTo,
  runPipeline,
  runningSum,
  toNum,
  toRgb,
  weightedAverage,
} from '../../tools/oracle/compute.js';

/** Le recalcul de l'oracle doit être juste par lui-même : il n'a pas la lib pour le corriger. */
describe('oracle — recalcul indépendant', () => {
  const rows = [
    { s: 'public', ips: 96, uai: 'A' },
    { s: 'public', ips: '104,2', uai: 'B' },
    { s: 'privé', ips: 119.4, uai: 'C' },
    { s: 'privé', ips: null, uai: 'D' },
    { s: 'privé', ips: 'NC', uai: '' },
  ];

  it('toNum : nombre, chaîne à virgule, sinon null', () => {
    expect(toNum(3)).toBe(3);
    expect(toNum('104,2')).toBe(104.2);
    expect(toNum('1 234')).toBe(1234);
    expect(toNum('NC')).toBeNull();
    expect(toNum(null)).toBeNull();
    expect(toNum(NaN)).toBeNull();
  });

  it('absent : null, undefined et chaîne blanche — mais pas le zéro', () => {
    expect(absent(null)).toBe(true);
    expect(absent(undefined)).toBe(true);
    expect(absent('  ')).toBe(true);
    expect(absent(0)).toBe(false);
    expect(absent('0')).toBe(false);
  });

  it('égalité : une valeur vide n’est égale qu’à une autre valeur vide', () => {
    // Le piège de #846 : en JavaScript, `'' == 0` est vrai.
    expect(egal('', 0)).toBe(false);
    expect(egal(0, '')).toBe(false);
    expect(egal('', null)).toBe(true);
    expect(egal(0, '0')).toBe(true);
    expect(egal('FR', 'FR')).toBe(true);
    expect(egal('FR', 'DE')).toBe(false);
  });

  it('agrégats : count lignes / count champ non vide / sum avg min max sur les seuls nombres', () => {
    expect(aggregate(rows, 'count')).toBe(5);
    expect(aggregate(rows, 'count', 'uai')).toBe(4);
    expect(aggregate(rows, 'sum', 'ips')).toBeCloseTo(319.6);
    expect(aggregate(rows, 'avg', 'ips')).toBeCloseTo(319.6 / 3);
    expect(aggregate(rows, 'min', 'ips')).toBe(96);
    expect(aggregate(rows, 'max', 'ips')).toBe(119.4);
    expect(aggregate([{ ips: 'NC' }], 'avg', 'ips')).toBeNull();
  });

  it('count(distinct) : null et chaîne vide exclus, comparaison en chaîne', () => {
    expect(countDistinct(rows, 's')).toBe(2);
    expect(countDistinct(rows, 'uai')).toBe(4);
    expect(countDistinct([{ x: 1 }, { x: '1' }, { x: null }, { x: '' }], 'x')).toBe(1);
    expect(aggregate(rows, 'distinct', 's')).toBe(2);
  });

  it('moyenne pondérée : somme(v×p)/somme(p), poids total nul = null', () => {
    const pesees = [
      { v: 100, p: 1000 },
      { v: 120, p: 200 },
      { v: 90, p: 400 },
    ];
    expect(weightedAverage(pesees, 'v', 'p')).toBeCloseTo(100, 9);
    // La moyenne SIMPLE vaudrait 103,33 : la pondération n'est pas cosmétique.
    expect(aggregate(pesees, 'avg', 'v')).toBeCloseTo(103.333333, 5);
    expect(weightedAverage([{ v: 1, p: 0 }], 'v', 'p')).toBeNull();
    expect(aggregate(pesees, 'wavg', 'v', 'p')).toBeCloseTo(100, 9);
  });

  it('filtres : eq, neq, isnotnull, gte, contains', () => {
    expect(applyFilter(rows, { field: 's', op: 'eq', value: 'privé' })).toHaveLength(3);
    expect(applyFilter(rows, { field: 's', op: 'neq', value: 'privé' })).toHaveLength(2);
    expect(applyFilter(rows, { field: 'ips', op: 'isnotnull' })).toHaveLength(4);
    expect(applyFilter(rows, { field: 'ips', op: 'gte', value: 100 })).toHaveLength(2);
    expect(applyFilter(rows, { field: 's', op: 'contains', value: 'PUB' })).toHaveLength(2);
  });

  it('group-by : une ligne par clé, colonnes agrégées, puis tri et limite', () => {
    const groupes = groupBy(rows, 's', {
      moy: { agg: 'avg', field: 'ips' },
      nb: { agg: 'count', field: 'uai' },
    });
    const trie = orderBy(groupes, 'moy', 'desc').slice(0, 1);
    expect(trie).toEqual([{ s: 'privé', moy: 119.4, nb: 2 }]);
  });

  it('cumul et écart : le premier écart vaut null, jamais 0', () => {
    const serie = [{ t: 10 }, { t: 20 }, { t: 5 }];
    expect(runningSum(serie, 't', 'c').map((r) => r.c)).toEqual([10, 30, 35]);
    expect(diff(serie, 't', 'e').map((r) => r.e)).toEqual([null, 10, -15]);
    expect(diff([{ t: 1 }, { t: 'NC' }, { t: 9 }], 't', 'e').map((r) => r.e)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('jointure : une clé vide n’apparie rien, pas même une autre clé vide', () => {
    const gauche = [
      { code: '01', v: 1 },
      { code: '', v: 2 },
      { code: null, v: 3 },
    ];
    const droite = [
      { code: '01', nom: 'Ain' },
      { code: '', nom: 'Nulle part' },
    ];
    expect(joinRows(gauche, droite, 'code', 'inner')).toEqual([{ code: '01', v: 1, nom: 'Ain' }]);
    expect(joinRows(gauche, droite, 'code', 'left')).toHaveLength(3);
    // Comparaison EN CHAÎNE, sans complétion : « 1 » et « 01 » ne s'apparient pas.
    expect(joinRows([{ code: 1 }], [{ code: '01', nom: 'x' }], 'code', 'inner')).toEqual([]);
    expect(joinRows([{ code: 1 }], [{ code: '1', nom: 'x' }], 'code', 'inner')).toHaveLength(1);
  });

  it('jointure : paire de champs et préfixe sur collision', () => {
    const out = joinRows(
      [{ code: '2', v: 7 }],
      [{ insee: '2', v: 9, nom: 'B' }],
      'code=insee',
      'inner'
    );
    expect(out).toEqual([{ code: '2', v: 7, right_v: 9, nom: 'B' }]);
  });

  it('classes à intervalles égaux : bornes et extrémités', () => {
    expect(equalIntervalBreaks([60, 140], 4)).toEqual([80, 100, 120]);
    expect(equalIntervalBreaks([], 4)).toEqual([]);
    expect(legendClasses([60, 100, 140], 4)).toEqual([
      { from: 60, to: 80 },
      { from: 80, to: 100 },
      { from: 100, to: 120 },
      { from: 120, to: 140 },
    ]);
  });

  it('pipeline : les étapes s’enchaînent, la jointure va chercher son jeu', () => {
    const out = runPipeline(
      {
        main: [
          { c: 'a', z: 'n', v: 1 },
          { c: 'b', z: 'n', v: 3 },
          { c: 'x', z: 's', v: 10 },
        ],
        ref: [
          { c: 'a', lib: 'Alpha' },
          { c: 'b', lib: 'Beta' },
        ],
      },
      [
        { op: 'join', right: 'ref', on: 'c', type: 'inner' },
        { op: 'group-by', by: 'z', columns: { total: { agg: 'sum', field: 'v' } } },
        { op: 'order-by', column: 'total', dir: 'desc' },
        { op: 'limit', n: 1 },
      ]
    );
    expect(out).toEqual([{ z: 'n', total: 4 }]);
  });

  it('nombre affiché fr-FR : espaces fines, virgule, unité', () => {
    expect(parseDisplayedNumber('6 971')).toBe(6971);
    expect(parseDisplayedNumber('104,7')).toBe(104.7);
    expect(parseDisplayedNumber('1 234,5 €')).toBe(1234.5);
    expect(parseDisplayedNumber('−3')).toBe(-3);
    expect(parseDisplayedNumber('—')).toBeNull();
  });

  it('égalité à la précision affichée', () => {
    expect(roundTo(104.74999, 1)).toBe(104.7);
    expect(closeEnough(104.7, 104.7, 1)).toBe(true);
    expect(closeEnough(104.7, 104.76, 1)).toBe(false);
    expect(closeEnough(6971, 6971.4)).toBe(true);
    expect(closeEnough(6971, 6972)).toBe(false);
  });

  // --- Lot AFFICHAGES (L5) : ce que ce lot a dû ajouter au moteur ----------

  it('first / last : le bout de la table dans l’ordre reçu, pas le minimum', () => {
    const serie = [{ v: 120 }, { v: 200 }, { v: 168 }];
    expect(aggregate(serie, 'first', 'v')).toBe(120);
    expect(aggregate(serie, 'last', 'v')).toBe(168);
    expect(aggregate([], 'first', 'v')).toBeNull();
  });

  it('evolution : (dernière − première) / première, null si première nulle', () => {
    expect(evolution([{ v: 120 }, { v: 168 }], 'v')).toBeCloseTo(0.4, 10);
    expect(evolution([{ v: 100 }, { v: 'NC' }, { v: 80 }], 'v')).toBeCloseTo(-0.2, 10);
    expect(evolution([{ v: 120 }], 'v')).toBeNull();
    expect(evolution([{ v: 0 }, { v: 5 }], 'v')).toBeNull();
  });

  it('date ISO rendue à la française', () => {
    expect(isoToFrDate('2026-12-15')).toBe('15/12/2026');
    expect(isoToFrDate('2026-01-05T08:30:00Z')).toBe('05/01/2026');
    expect(isoToFrDate('hier')).toBeNull();
    expect(aggregateText([{ d: '2026-03-01' }, { d: '2026-01-09' }], 'min', 'd')).toBe(
      '2026-01-09'
    );
    expect(aggregateText([{ d: '2026-03-01' }, { d: '2026-01-09' }], 'last', 'd')).toBe(
      '2026-01-09'
    );
  });

  it('filtre par colonne agrégée : chaque côté d’un ratio a le sien', () => {
    const lignes = [
      { z: 'nord', v: 10 },
      { z: 'sud', v: 30 },
      { z: 'nord', v: 20 },
    ];
    const out = runPipeline({ main: lignes }, [
      {
        op: 'global',
        columns: {
          nord: { agg: 'sum', field: 'v', filter: [{ field: 'z', op: 'eq', value: 'nord' }] },
          tout: { agg: 'sum', field: 'v' },
        },
      },
      { op: 'ratio', numerator: 'nord', denominator: 'tout', as: 'part' },
    ]);
    expect(out).toEqual([{ nord: 30, tout: 60, part: 0.5 }]);
  });

  it('ratio : dénominateur nul ou illisible donne null, jamais l’infini', () => {
    expect(ratioColumn([{ a: 3, b: 0 }], 'a', 'b', 'r')[0].r).toBeNull();
    expect(ratioColumn([{ a: 3, b: 'NC' }], 'a', 'b', 'r')[0].r).toBeNull();
    expect(ratioColumn([{ a: 3, b: 4 }], 'a', 'b', 'r')[0].r).toBe(0.75);
  });

  it('page : la tranche affichée, pas les premières lignes', () => {
    const lignes = Array.from({ length: 25 }, (_, i) => ({ i }));
    expect(runPipeline({ main: lignes }, [{ op: 'page', size: 10, number: 2 }])).toEqual(
      lignes.slice(10, 20)
    );
    expect(runPipeline({ main: lignes }, [{ op: 'page', size: 10, number: 3 }])).toHaveLength(5);
  });

  it('quantiles : chaque classe couvre le même nombre de valeurs', () => {
    const valeurs = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(quantileBreaks(valeurs, 4)).toEqual([3, 5, 7]);
    expect(quantileBreaks(valeurs, 2)).toEqual([5]);
    expect(quantileBreaks([], 4)).toEqual([]);
    // … et ce ne sont PAS les bornes des intervalles égaux sur un jeu tassé.
    expect(quantileBreaks([1, 2, 3, 100], 2)).toEqual([3]);
    expect(equalIntervalBreaks([1, 2, 3, 100], 2)).toEqual([50.5]);
  });

  it('classes de légende : la méthode déclarée décide des bornes', () => {
    const valeurs = [1, 2, 3, 100];
    expect(legendClasses(valeurs, 2, 'quantile')).toEqual([
      { from: 1, to: 3 },
      { from: 3, to: 100 },
    ]);
    expect(legendClasses(valeurs, 4, 'manual', [2, 50])).toEqual([
      { from: 1, to: 2 },
      { from: 2, to: 50 },
      { from: 50, to: 100 },
    ]);
    expect(legendClasses([], 4, 'equal')).toEqual([]);
  });

  it('CSV relu : BOM retiré, guillemets RFC 4180, séparateur point-virgule', () => {
    expect(parseCsv('﻿a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('"Nord; et Sud";2\n"Dit ""oui""";3')).toEqual([
      ['Nord; et Sud', '2'],
      ['Dit "oui"', '3'],
    ]);
    expect(parseCsv('')).toEqual([]);
  });

  it('couleur ramenée à r,g,b — sinon null plutôt qu’une comparaison à tort', () => {
    expect(toRgb('#000091')).toBe('0,0,145');
    expect(toRgb('#FFF')).toBe('255,255,255');
    expect(toRgb('rgb(0, 0, 145)')).toBe('0,0,145');
    expect(toRgb('rgba(225, 0, 15, 0.5)')).toBe('225,0,15');
    expect(toRgb('rebeccapurple')).toBeNull();
  });
});
