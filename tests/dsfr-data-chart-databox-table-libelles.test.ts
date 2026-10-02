import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Tableau de la DataBox (#1179) : l'en-tête d'une colonne de valeur est ce que
 * la légende affiche — alias inline, sinon nom de série de `name`, sinon le
 * chemin. Le cadre officiel montrait `nombre_beneficiaires__sum` quand la
 * légende disait « Bénéficiaires ».
 */

import { DsfrDataChart } from '@/components/dsfr-data-chart.js';

/** Vue interne du composant : membres privés inspectés par ces tests. */
interface ChartInternals {
  _data: unknown[];
  _databoxColumns(): Array<{ key: string; label: string }>;
  _databoxTableHtml(): string;
}

const LIGNES = [
  { nom_region: 'Bretagne', nombre_beneficiaires__sum: 78, montant__sum: 1200 },
  { nom_region: 'Normandie', nombre_beneficiaires__sum: 41, montant__sum: 900 },
];

function headers(html: string): string[] {
  return [...html.matchAll(/<th scope="col">([^<]*)<\/th>/g)].map((m) => m[1]);
}

describe('dsfr-data-chart — en-têtes du tableau de la DataBox (#1179)', () => {
  let chart: DsfrDataChart;
  let internals: ChartInternals;

  beforeEach(() => {
    chart = new DsfrDataChart();
    internals = chart as unknown as ChartInternals;
    chart.id = 'cadre';
    chart.type = 'bar';
    chart.databox = true;
    chart.labelField = 'nom_region';
    chart.valueField = 'nombre_beneficiaires__sum';
    internals._data = LIGNES;
  });

  it('une série nommée par name : l’en-tête est le nom de série, pas le chemin', () => {
    chart.name = 'Bénéficiaires';
    expect(headers(internals._databoxTableHtml())).toEqual(['nom_region', 'Bénéficiaires']);
  });

  it('sans name ni alias : le chemin reste l’en-tête (rendu historique)', () => {
    expect(headers(internals._databoxTableHtml())).toEqual([
      'nom_region',
      'nombre_beneficiaires__sum',
    ]);
  });

  it('l’alias inline prime sur name (#668)', () => {
    chart.valueField = 'nombre_beneficiaires__sum:Bénéficiaires';
    chart.name = 'Titre du graphique';
    expect(headers(internals._databoxTableHtml())).toEqual(['nom_region', 'Bénéficiaires']);
  });

  it('plusieurs séries : une colonne par champ de valeur, nommée par name', () => {
    chart.valueFields = 'montant__sum';
    chart.name = '["Bénéficiaires", "Montant"]';
    const html = internals._databoxTableHtml();
    expect(headers(html)).toEqual(['nom_region', 'Bénéficiaires', 'Montant']);
    // Les cellules lisent toujours le chemin
    expect(html).toContain('<td>78</td><td>1200</td>');
  });

  it('camembert : name nomme les parts, pas la colonne — le chemin reste', () => {
    chart.type = 'pie';
    chart.name = '["Bretagne", "Normandie"]';
    expect(headers(internals._databoxTableHtml())).toEqual([
      'nom_region',
      'nombre_beneficiaires__sum',
    ]);
  });

  it('format long (series-field) : name ne nomme aucune colonne', () => {
    chart.seriesField = 'annee';
    chart.name = '["2023", "2024"]';
    expect(internals._databoxColumns().map((c) => c.label)).toEqual([
      'nom_region',
      'nombre_beneficiaires__sum',
    ]);
  });

  it('sans aucune colonne : chaîne vide, rien à injecter', () => {
    chart.labelField = '';
    chart.valueField = '';
    expect(internals._databoxTableHtml()).toBe('');
  });
});
