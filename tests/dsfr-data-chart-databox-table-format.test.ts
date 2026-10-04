import { describe, it, expect } from 'vitest';

/**
 * #1244 — le tableau de la DataBox rend ses nombres en fr-FR, comme le
 * tableau de `dsfr-data-a11y` (#666) : `2.27` s'affichait tel quel d'un côté,
 * « 2,27 » de l'autre, pour les mêmes données. Une seule fonction de format
 * (`formatTableCell`) pour les deux tableaux ; les valeurs passées au
 * graphique ne changent pas.
 */

import { DsfrDataChart } from '@/components/dsfr-data-chart.js';
import { DsfrDataA11y } from '@/components/dsfr-data-a11y.js';

/** Vue interne du composant : membres privés inspectés par ces tests. */
interface ChartInternals {
  _data: unknown[];
  _processData(): { values: Array<number | null>; y: string };
  _databoxTableHtml(): string;
}

/** Espaces insécables (U+202F, U+00A0) ramenées à l'espace ordinaire. */
const plat = (texte: string): string => texte.replace(/[\u202f\u00a0]/g, ' ');

function lignes(html: string): string[][] {
  const corps = /<tbody>(.*)<\/tbody>/s.exec(html)?.[1] ?? '';
  return [...corps.matchAll(/<tr>(.*?)<\/tr>/g)].map((tr) =>
    [...tr[1].matchAll(/<td>([^<]*)<\/td>/g)].map((td) => plat(td[1]))
  );
}

function graphique(data: unknown[]): { chart: DsfrDataChart; internals: ChartInternals } {
  const chart = new DsfrDataChart();
  const internals = chart as unknown as ChartInternals;
  chart.id = 'g';
  chart.type = 'bar';
  chart.databox = true;
  internals._data = data;
  return { chart, internals };
}

describe('dsfr-data-chart — nombres du tableau de la DataBox en fr-FR (#1244)', () => {
  const LIGNES = [
    { dep: 'Ain', taux: 2.27, total: 1234567.891 },
    { dep: 'Aisne', taux: 10, total: 0.5 },
  ];

  it('format large : décimale à la virgule, milliers séparés, au plus 2 décimales', () => {
    const { chart, internals } = graphique(LIGNES);
    chart.labelField = 'dep';
    chart.valueField = 'taux';
    chart.valueFields = 'total';
    expect(lignes(internals._databoxTableHtml())).toEqual([
      ['Ain', '2,27', '1 234 567,89'],
      ['Aisne', '10', '0,5'],
    ]);
  });

  it('même texte que le tableau de dsfr-data-a11y pour la même valeur', () => {
    const { chart, internals } = graphique(LIGNES);
    chart.labelField = 'dep';
    chart.valueField = 'total';
    const a11y = new DsfrDataA11y();
    const cellules = lignes(internals._databoxTableHtml()).map((l) => l[1]);
    expect(cellules).toEqual(LIGNES.map((l) => plat(a11y.formatCellValue(l.total))));
  });

  it('format long : les cellules pivotées sont formatées aussi, une absence reste vide', () => {
    const { chart, internals } = graphique([
      { mois: 'Janvier', groupe: 'Cadres', v: 1200.5 },
      { mois: 'Janvier', groupe: 'Agents', v: 3100 },
      { mois: 'Février', groupe: 'Agents', v: 2.27 },
    ]);
    chart.type = 'line';
    chart.labelField = 'mois';
    chart.valueField = 'v';
    chart.seriesField = 'groupe';
    expect(lignes(internals._databoxTableHtml())).toEqual([
      ['Janvier', '1 200,5', '3 100'],
      ['Février', '', '2,27'],
    ]);
  });

  it('les chaînes restent intactes : un code « 01 » ou un SIREN ne sont pas des nombres', () => {
    const { chart, internals } = graphique([{ code: '01', siren: '552100554', total: '1234.5' }]);
    chart.labelField = 'code';
    chart.valueField = 'siren';
    chart.valueFields = 'total';
    expect(lignes(internals._databoxTableHtml())).toEqual([['01', '552100554', '1234.5']]);
  });

  it('la colonne de libellé porte ce que l’axe affiche : une année numérique sans séparateur', () => {
    const { chart, internals } = graphique([
      { annee: 2024, total: 12 },
      { annee: null, total: 7 },
    ]);
    chart.labelField = 'annee';
    chart.valueField = 'total';
    expect(lignes(internals._databoxTableHtml())).toEqual([
      ['2024', '12'],
      ['Non renseigné', '7'],
    ]);
  });

  it('les valeurs passées au graphique ne changent pas', () => {
    const { chart, internals } = graphique(LIGNES);
    chart.labelField = 'dep';
    chart.valueField = 'total';
    const { values, y } = internals._processData();
    expect(values).toEqual([1234567.891, 0.5]);
    expect(y).toBe('[[1234567.891,0.5]]');
  });
});
