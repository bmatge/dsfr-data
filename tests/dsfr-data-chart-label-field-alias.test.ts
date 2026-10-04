import { describe, it, expect } from 'vitest';

/**
 * #1244 — `label-field` de `dsfr-data-chart` accepte l'alias inline
 * `champ:Libellé`, la grammaire que `dsfr-data-a11y` accepte depuis la 0.45.0
 * (#1239, PG-032 du banc). Recopié du tableau équivalent vers le graphique,
 * `label-field="dep:Département"` cherchait une colonne « dep:Département » :
 * tous les libellés de l'axe devenaient « Non renseigné ».
 */

import { DsfrDataChart } from '@/components/dsfr-data-chart.js';

/** Vue interne du composant : membres privés inspectés par ces tests. */
interface ChartInternals {
  _data: unknown[];
  _processData(): { labels: string[]; values: Array<number | null> };
  _processMapData(): string;
  _databoxTableHtml(): string;
}

const LIGNES = [
  { dep: 'Ain', total: 12 },
  { dep: 'Aisne', total: 7 },
];

function headers(html: string): string[] {
  return [...html.matchAll(/<th scope="col">([^<]*)<\/th>/g)].map((m) => m[1]);
}

function graphique(data: unknown[]): { chart: DsfrDataChart; internals: ChartInternals } {
  const chart = new DsfrDataChart();
  const internals = chart as unknown as ChartInternals;
  chart.id = 'g';
  chart.type = 'bar';
  chart.valueField = 'total';
  internals._data = data;
  return { chart, internals };
}

describe('dsfr-data-chart — alias inline sur label-field (#1244)', () => {
  it('`champ:Libellé` : la colonne lue est `champ`, les libellés ne sont pas vidés', () => {
    const { chart, internals } = graphique(LIGNES);
    chart.labelField = 'dep:Département';
    expect(internals._processData().labels).toEqual(['Ain', 'Aisne']);
  });

  it('le libellé va en en-tête de la colonne de libellé du tableau de la DataBox', () => {
    const { chart, internals } = graphique(LIGNES);
    chart.databox = true;
    chart.labelField = 'dep:Département';
    chart.valueField = 'total:Total';
    const html = internals._databoxTableHtml();
    expect(headers(html)).toEqual(['Département', 'Total']);
    expect(html).toContain('<td>Ain</td><td>12</td>');
  });

  it('format long : le libellé va en en-tête du tableau pivoté', () => {
    const { chart, internals } = graphique([
      { dep: 'Ain', an: '2023', total: 12 },
      { dep: 'Ain', an: '2024', total: 14 },
    ]);
    chart.databox = true;
    chart.labelField = 'dep:Département';
    chart.seriesField = 'an';
    expect(headers(internals._databoxTableHtml())).toEqual(['Département', '2023', '2024']);
    expect(internals._processData().labels).toEqual(['Ain']);
  });

  it('sans deux-points : rien ne change, l’en-tête reste le nom de la colonne', () => {
    const { chart, internals } = graphique(LIGNES);
    chart.databox = true;
    chart.labelField = 'dep';
    expect(internals._processData().labels).toEqual(['Ain', 'Aisne']);
    expect(headers(internals._databoxTableHtml())).toEqual(['dep', 'total']);
  });

  it('une colonne dont le nom contient réellement un deux-points est lue telle quelle', () => {
    const { chart, internals } = graphique([
      { 'geo:dep': 'Ain', total: 12 },
      { 'geo:dep': 'Aisne', total: 7 },
    ]);
    chart.databox = true;
    chart.labelField = 'geo:dep';
    expect(internals._processData().labels).toEqual(['Ain', 'Aisne']);
    expect(headers(internals._databoxTableHtml())).toEqual(['geo:dep', 'total']);
  });

  it('un chemin pointé garde son alias : `fields.dep:Département`', () => {
    const { chart, internals } = graphique([
      { fields: { dep: 'Ain', total: 12 } },
      { fields: { dep: 'Aisne', total: 7 } },
    ]);
    chart.databox = true;
    chart.labelField = 'fields.dep:Département';
    chart.valueField = 'fields.total';
    expect(internals._processData().labels).toEqual(['Ain', 'Aisne']);
    expect(headers(internals._databoxTableHtml())).toEqual(['Département', 'fields.total']);
  });

  it('carte sans code-field : le code géographique est lu dans la colonne, pas dans l’entrée entière', () => {
    const { chart, internals } = graphique([
      { code: '01', total: 12 },
      { code: '02', total: 7 },
    ]);
    chart.type = 'map';
    chart.labelField = 'code:Département';
    expect(JSON.parse(internals._processMapData())).toEqual({ '01': 12, '02': 7 });
  });
});
