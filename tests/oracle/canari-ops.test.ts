import { describe, it, expect } from 'vitest';

import { explodeRows, passeFiltre, runPipeline } from '../../tools/oracle/compute.js';
import type { Row } from '../../tools/oracle/manifest.js';

/**
 * Les deux opérations que le canari (#882) a ajoutées au moteur, en tableaux
 * nus : l'éclatement d'un champ multivalué (ce qu'une facette fait d'un
 * tableau, BUG-006) et l'égalité TYPÉE d'un serveur (PG-030).
 */
describe('oracle / explode', () => {
  const rows: Row[] = [
    { id: 'a', tags: ['eau', 'air'] },
    { id: 'b', tags: [] },
    { id: 'c', tags: null },
    { id: 'd', tags: 'eau' },
    { id: 'e', tags: ['sol'] },
  ];

  it('une ligne par valeur, rien pour un tableau vide, absent ou une valeur nue', () => {
    expect(explodeRows(rows, 'tags')).toEqual([
      { id: 'a', tags: 'eau' },
      { id: 'a', tags: 'air' },
      { id: 'e', tags: 'sol' },
    ]);
  });

  it('se compose avec un regroupement : les comptes d’une facette', () => {
    const comptes = runPipeline({ main: rows }, [
      { op: 'explode', field: 'tags' },
      { op: 'group-by', by: 'tags', columns: { n: { agg: 'count' } } },
      { op: 'order-by', column: 'n', dir: 'desc' },
    ]);
    expect(comptes.map((r) => [r.tags, r.n])).toEqual([
      ['eau', 1],
      ['air', 1],
      ['sol', 1],
    ]);
  });
});

describe('oracle / égalité de la forme texte', () => {
  it("eq-strict : `1` et `'1'` s’écrivent pareil, `'01'` non, un absent jamais", () => {
    expect(passeFiltre({ code: '1' }, { field: 'code', op: 'eq-strict', value: '1' })).toBe(true);
    expect(passeFiltre({ code: 1 }, { field: 'code', op: 'eq-strict', value: '1' })).toBe(true);
    expect(passeFiltre({ code: '01' }, { field: 'code', op: 'eq-strict', value: '1' })).toBe(false);
    expect(passeFiltre({ code: '01' }, { field: 'code', op: 'eq-strict', value: '01' })).toBe(true);
    expect(passeFiltre({ code: '' }, { field: 'code', op: 'eq-strict', value: '' })).toBe(false);
    expect(passeFiltre({ code: null }, { field: 'code', op: 'eq-strict', value: '' })).toBe(false);
    // Là où l'égalité lâche du client dit oui : `'01'` vaut `1`.
    expect(passeFiltre({ code: '01' }, { field: 'code', op: 'eq', value: '1' })).toBe(true);
  });
});
