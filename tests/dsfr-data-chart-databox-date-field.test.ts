import { describe, it, expect, beforeEach } from 'vitest';

/**
 * `databox-date-field` (#661) : la fraîcheur des données est lue dans une
 * colonne de dates ISO — la plus récente est affichée comme date de la
 * DataBox (et des cartes), formatée fr-FR. `databox-date` explicite prime.
 */

import { DsfrDataChart } from '@/components/dsfr-data-chart.js';

/** Vue interne du composant : membres privés inspectés par ces tests. */
interface ChartInternals {
  _data: unknown[];
  _resolveDataboxDate(): string;
  _createDataboxElement(tagName: string, attributes: Record<string, string>): HTMLElement;
  _getTypeSpecificAttributes(): { deferred: Record<string, string> };
}

const CARBURANTS = [
  { station: 'A', gazole_prix: 1.72, gazole_maj: '2024-03-15' },
  { station: 'B', gazole_prix: 1.69, gazole_maj: '2024-05-02' },
  { station: 'C', gazole_prix: 1.75, gazole_maj: '2024-04-28' },
];

function databoxOf(internals: ChartInternals): Element {
  const wrapper = internals._createDataboxElement('bar-chart', { x: '[[]]', y: '[[]]' });
  const db = wrapper.querySelector('data-box');
  if (!db) throw new Error('data-box absent');
  return db;
}

describe('dsfr-data-chart — databox-date-field (#661)', () => {
  let chart: DsfrDataChart;
  let internals: ChartInternals;

  beforeEach(() => {
    chart = new DsfrDataChart();
    internals = chart as unknown as ChartInternals;
    chart.id = 'freshness';
    chart.type = 'bar';
    chart.labelField = 'station';
    chart.valueField = 'gazole_prix';
    chart.databox = true;
    chart.databoxTitle = 'Prix du gazole';
    internals._data = CARBURANTS;
  });

  it('source à 3 dates : la DataBox affiche la plus récente, formatée fr-FR (critère #661)', () => {
    chart.databoxDateField = 'gazole_maj';
    expect(internals._resolveDataboxDate()).toBe('02/05/2024');
    expect(databoxOf(internals).getAttribute('date')).toBe('02/05/2024');
  });

  it('databox-date explicite prime sur databox-date-field', () => {
    chart.databoxDateField = 'gazole_maj';
    chart.databoxDate = 'Mai 2024';
    expect(databoxOf(internals).getAttribute('date')).toBe('Mai 2024');
  });

  it('sans databox-date ni databox-date-field : aucune date (#650 conservé)', () => {
    expect(databoxOf(internals).hasAttribute('date')).toBe(false);
  });

  it('ignore les valeurs non ISO ou invalides, aucune date si rien de valide', () => {
    internals._data = [
      { station: 'A', gazole_prix: 1, gazole_maj: '15/03/2024' },
      { station: 'B', gazole_prix: 2, gazole_maj: '2024-13-45' },
      { station: 'C', gazole_prix: 3, gazole_maj: null },
      { station: 'D', gazole_prix: 4 },
    ];
    chart.databoxDateField = 'gazole_maj';
    expect(internals._resolveDataboxDate()).toBe('');
    expect(databoxOf(internals).hasAttribute('date')).toBe(false);
  });

  it('les valeurs non ISO sont ignorées mais la plus récente des ISO valides est retenue', () => {
    internals._data = [
      { station: 'A', gazole_prix: 1, gazole_maj: 'n/a' },
      { station: 'B', gazole_prix: 2, gazole_maj: '2023-12-31' },
      { station: 'C', gazole_prix: 3, gazole_maj: '2024-01-09T08:30:00Z' },
    ];
    chart.databoxDateField = 'gazole_maj';
    expect(internals._resolveDataboxDate()).toBe('09/01/2024');
  });

  it('accepte des instances Date et des chemins imbriqués', () => {
    internals._data = [
      { station: 'A', gazole_prix: 1, meta: { maj: new Date('2024-02-10T00:00:00Z') } },
      { station: 'B', gazole_prix: 2, meta: { maj: new Date('2024-02-20T00:00:00Z') } },
    ];
    chart.databoxDateField = 'meta.maj';
    expect(internals._resolveDataboxDate()).toBe('20/02/2024');
  });

  it('colonne inconnue : aucune date', () => {
    chart.databoxDateField = 'inexistant';
    expect(internals._resolveDataboxDate()).toBe('');
  });

  it('cartes : la date différée suit la même résolution', () => {
    chart.type = 'map';
    chart.labelField = 'dep';
    internals._data = [
      { dep: '75', gazole_prix: 1, gazole_maj: '2024-03-15' },
      { dep: '13', gazole_prix: 2, gazole_maj: '2024-06-01' },
    ];
    chart.databoxDateField = 'gazole_maj';
    expect(internals._getTypeSpecificAttributes().deferred.date).toBe('01/06/2024');
  });
});
