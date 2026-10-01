import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour l'attribut `series-field` de dsfr-data-chart : mode multi-series
 * a partir de donnees long/tidy (une colonne-cle de serie).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataChart } from '@/components/dsfr-data-chart.js';

// Donnees tidy : 2 series (A, B) x 3 mois. B n'a pas de valeur en 2023-02 (cellule manquante).
const TIDY = [
  { mois: '2023-01', groupe: 'A', valeur: 10 },
  { mois: '2023-02', groupe: 'A', valeur: 20 },
  { mois: '2023-03', groupe: 'A', valeur: 30 },
  { mois: '2023-01', groupe: 'B', valeur: 1 },
  { mois: '2023-03', groupe: 'B', valeur: 3 },
];

describe('dsfr-data-chart — series-field (mode tidy)', () => {
  let chart: DsfrDataChart;

  beforeEach(() => {
    chart = new DsfrDataChart();
    chart.type = 'line';
    chart.labelField = 'mois';
    chart.valueField = 'valeur';
    chart.seriesField = 'groupe';
    (chart as any)._data = TIDY;
  });

  it("pivote la cle de serie en plusieurs series alignees sur l'axe x", () => {
    const result = (chart as any)._processData();
    // 3 mois distincts, dans l'ordre d'apparition
    expect(result.labels).toEqual(['2023-01', '2023-02', '2023-03']);
    // 2 series → yMulti rempli
    const yMulti = JSON.parse(result.yMulti);
    expect(yMulti).toHaveLength(2);
    expect(yMulti[0]).toEqual([10, 20, 30]); // serie A
    // serie B : cellule manquante en 2023-02 → null, jamais 0 (#1198, BUG-029)
    expect(yMulti[1]).toEqual([1, null, 3]);
  });

  it('expose les noms de series = valeurs distinctes de series-field', () => {
    expect((chart as any)._getSeriesNames()).toEqual(['A', 'B']);
    const attrs = (chart as any)._getCommonAttributes();
    expect(attrs.name).toBe(JSON.stringify(['A', 'B']));
  });

  it('une seule serie distincte → mode mono-serie (pas de yMulti)', () => {
    (chart as any)._data = [
      { mois: '2023-01', groupe: 'A', valeur: 10 },
      { mois: '2023-02', groupe: 'A', valeur: 20 },
    ];
    const result = (chart as any)._processData();
    expect(result.yMulti).toBeUndefined();
    expect(JSON.parse(result.y)).toEqual([[10, 20]]);
  });

  it('sans series-field, le mode large (value-fields) reste inchange', () => {
    const wide = new DsfrDataChart();
    wide.type = 'line';
    wide.labelField = 'mois';
    wide.valueField = 'a';
    wide.valueFields = 'b';
    (wide as any)._data = [
      { mois: 'jan', a: 1, b: 100 },
      { mois: 'fev', a: 2, b: 200 },
    ];
    const result = (wide as any)._processData();
    expect(JSON.parse(result.yMulti)).toEqual([
      [1, 2],
      [100, 200],
    ]);
    expect((wide as any)._getSeriesNames()).toEqual(['a', 'b']);
  });
});
