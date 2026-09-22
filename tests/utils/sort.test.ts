import { describe, it, expect } from 'vitest';
import { compareValues, sortRows } from '@/utils/sort.js';

describe('utils/sort — comparateur partagé query / adaptateurs (#278, #1045)', () => {
  it('range null/vide < nombres < chaînes', () => {
    expect(compareValues(null, 1)).toBeLessThan(0);
    expect(compareValues('', 'a')).toBeLessThan(0);
    expect(compareValues(2, 'a')).toBeLessThan(0);
    expect(compareValues('10', 9)).toBeGreaterThan(0);
  });

  it('trie en desc avec les nulls en dernier, sans modifier le tableau reçu', () => {
    const rows = [{ v: 1 }, { v: null }, { v: 3 }];
    const sorted = sortRows(rows, [{ field: 'v', direction: 'desc' }]);
    expect(sorted.map((r) => r.v)).toEqual([3, 1, null]);
    expect(rows.map((r) => r.v)).toEqual([1, null, 3]);
  });

  it('multi-clés et tri stable', () => {
    const rows = [
      { g: 'b', n: 1, id: 1 },
      { g: 'a', n: 2, id: 2 },
      { g: 'a', n: 2, id: 3 },
      { g: 'a', n: 5, id: 4 },
    ];
    const sorted = sortRows(rows, [
      { field: 'g', direction: 'asc' },
      { field: 'n', direction: 'desc' },
    ]);
    expect(sorted.map((r) => r.id)).toEqual([4, 2, 3, 1]);
  });
});
