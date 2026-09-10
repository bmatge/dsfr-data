import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Alias inline `champ:Libellé` sur value-field / value-field-2 / value-fields
 * de dsfr-data-chart (#668, cas #640 pt 6) : la légende affiche le libellé,
 * les valeurs sont lues sur le chemin. `name` explicite prime sur l'alias.
 */

import { DsfrDataChart } from '@/components/dsfr-data-chart.js';

/** Vue interne du composant : membres privés inspectés par ces tests. */
interface ChartInternals {
  _data: unknown[];
  _getAllValueFields(): string[];
  _getSeriesNames(): string[];
  _getCommonAttributes(): Record<string, string>;
  _processData(): { labels: string[]; values: number[]; allSeries: number[][] };
  _processMapData(): string;
  _getTypeSpecificAttributes(): { attrs: Record<string, string> };
  _targetSeriesIndex(target: { series?: string | number }): number;
}

const PANIERS = [
  { mois: '2024-01', Panier_moyen: 42, Panier_median: 30 },
  { mois: '2024-02', Panier_moyen: 45, Panier_median: 31 },
];

describe('dsfr-data-chart — alias inline champ:Libellé (#668)', () => {
  let chart: DsfrDataChart;
  let internals: ChartInternals;

  beforeEach(() => {
    chart = new DsfrDataChart();
    internals = chart as unknown as ChartInternals;
    chart.type = 'bar';
    chart.labelField = 'mois';
    internals._data = PANIERS;
  });

  it('value-field="Panier_moyen:Panier moyen" : légende « Panier moyen », valeurs lues sur Panier_moyen', () => {
    chart.valueField = 'Panier_moyen:Panier moyen';
    expect(internals._getAllValueFields()).toEqual(['Panier_moyen']);
    expect(internals._getSeriesNames()).toEqual(['Panier moyen']);
    expect(internals._getCommonAttributes().name).toBe(JSON.stringify(['Panier moyen']));
    expect(internals._processData().values).toEqual([42, 45]);
  });

  it('value-fields multi-séries : un alias par série, mélange possible', () => {
    chart.valueField = 'Panier_moyen:Panier moyen';
    chart.valueFields = 'Panier_median';
    expect(internals._getSeriesNames()).toEqual(['Panier moyen', 'Panier_median']);
    const { allSeries } = internals._processData();
    expect(allSeries).toEqual([
      [42, 45],
      [30, 31],
    ]);
  });

  it('value-field-2 accepte aussi un alias', () => {
    chart.valueField = 'Panier_moyen';
    chart.valueField2 = 'Panier_median:Panier médian';
    expect(internals._getAllValueFields()).toEqual(['Panier_moyen', 'Panier_median']);
    expect(internals._getSeriesNames()).toEqual(['Panier_moyen', 'Panier médian']);
  });

  it('sans alias, rien ne change (nom du champ dans la légende)', () => {
    chart.valueField = 'Panier_moyen';
    expect(internals._getSeriesNames()).toEqual(['Panier_moyen']);
    expect(internals._getCommonAttributes().name).toBe(JSON.stringify(['Panier_moyen']));
  });

  it('`name` explicite prime sur l’alias inline', () => {
    chart.valueField = 'Panier_moyen:Panier moyen';
    chart.name = 'Montant';
    expect(internals._getCommonAttributes().name).toBe(JSON.stringify(['Montant']));
    // les valeurs restent lues sur le chemin
    expect(internals._processData().values).toEqual([42, 45]);
  });

  it('un `:` échappé (%3A) dans le chemin est décodé avant la lecture', () => {
    internals._data = [{ mois: 'a', 'ratio:2024': 7 }];
    chart.valueField = 'ratio%3A2024:Ratio 2024';
    expect(internals._getAllValueFields()).toEqual(['ratio:2024']);
    expect(internals._getSeriesNames()).toEqual(['Ratio 2024']);
    expect(internals._processData().values).toEqual([7]);
  });

  it('carte : name = libellé de l’alias, valeurs lues sur le chemin', () => {
    chart.type = 'map';
    chart.labelField = 'dep';
    chart.valueField = 'Panier_moyen:Panier moyen';
    internals._data = [{ dep: '75', Panier_moyen: 12 }];
    expect(internals._getCommonAttributes().name).toBe('Panier moyen');
    expect(JSON.parse(internals._processMapData())).toEqual({ '75': 12 });
  });

  it('bar-line : name-bar / name-line dérivés des alias quand `name` est absent', () => {
    chart.type = 'bar-line';
    chart.valueField = 'Panier_moyen:Panier moyen';
    chart.valueField2 = 'Panier_median:Panier médian';
    const { attrs } = internals._getTypeSpecificAttributes();
    expect(attrs['name-bar']).toBe('Panier moyen');
    expect(attrs['name-line']).toBe('Panier médian');
    expect(JSON.parse(attrs['y-bar'])).toEqual([42, 45]);
    expect(JSON.parse(attrs['y-line'])).toEqual([30, 31]);
  });

  it('bar-line : `name` explicite prime toujours', () => {
    chart.type = 'bar-line';
    chart.valueField = 'Panier_moyen:Panier moyen';
    chart.valueField2 = 'Panier_median';
    chart.name = '["Moyen","Médian"]';
    const { attrs } = internals._getTypeSpecificAttributes();
    expect(attrs['name-bar']).toBe('Moyen');
    expect(attrs['name-line']).toBe('Médian');
  });

  it('une cible peut viser la série par son libellé ou par son chemin', () => {
    chart.valueField = 'Panier_moyen:Panier moyen';
    chart.valueFields = 'Panier_median:Panier médian';
    expect(internals._targetSeriesIndex({ series: 'Panier médian' })).toBe(1);
    expect(internals._targetSeriesIndex({ series: 'Panier_median' })).toBe(1);
  });
});
