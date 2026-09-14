import { describe, it, expect } from 'vitest';
import {
  aggregate,
  applyFilter,
  closeEnough,
  groupBy,
  parseDisplayedNumber,
  roundTo,
  toNum,
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

  it('agrégats : count lignes / count champ non vide / sum avg min max sur les seuls nombres', () => {
    expect(aggregate(rows, 'count')).toBe(5);
    expect(aggregate(rows, 'count', 'uai')).toBe(4);
    expect(aggregate(rows, 'sum', 'ips')).toBeCloseTo(319.6);
    expect(aggregate(rows, 'avg', 'ips')).toBeCloseTo(319.6 / 3);
    expect(aggregate(rows, 'min', 'ips')).toBe(96);
    expect(aggregate(rows, 'max', 'ips')).toBe(119.4);
    expect(aggregate([{ ips: 'NC' }], 'avg', 'ips')).toBeNull();
  });

  it('filtre eq / isnotnull', () => {
    expect(applyFilter(rows, { field: 's', op: 'eq', value: 'privé' })).toHaveLength(3);
    expect(applyFilter(rows, { field: 'ips', op: 'isnotnull' })).toHaveLength(4);
  });

  it('group-by : une ligne par clé, colonnes agrégées, tri et limite', () => {
    const out = groupBy(rows, {
      kind: 'group-by',
      id: 'q',
      by: 's',
      columns: { moy: { agg: 'avg', field: 'ips' }, nb: { agg: 'count', field: 'uai' } },
      orderBy: { column: 'moy', dir: 'desc' },
      limit: 1,
    });
    expect(out).toEqual([{ s: 'privé', moy: 119.4, nb: 2 }]);
  });

  it('nombre affiché fr-FR : espaces fines, virgule, unité', () => {
    expect(parseDisplayedNumber('6 971')).toBe(6971);
    expect(parseDisplayedNumber('104,7')).toBe(104.7);
    expect(parseDisplayedNumber('1 234,5 €')).toBe(1234.5);
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
});
