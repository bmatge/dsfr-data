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

  it('value-field-2 (bar-line) : la seconde série a sa colonne, sous son alias', () => {
    chart.type = 'bar-line';
    chart.valueField = 'nombre_beneficiaires__sum:Bénéficiaires';
    chart.valueField2 = 'montant__sum:Montant';
    const html = internals._databoxTableHtml();
    expect(headers(html)).toEqual(['nom_region', 'Bénéficiaires', 'Montant']);
    expect(html).toContain('<td>Bretagne</td><td>78</td><td>1200</td>');
  });

  it('sans aucune colonne : chaîne vide, rien à injecter', () => {
    chart.labelField = '';
    chart.valueField = '';
    expect(internals._databoxTableHtml()).toBe('');
  });
});

/**
 * BUG-035 du banc (#1230), ce qui restait en 0.44.0 : au format long, le
 * tableau n'avait pas de colonne de série, et il était coupé à 100 lignes
 * sans le dire.
 */
describe('dsfr-data-chart — tableau de la DataBox au format long et coupe annoncée (#1230)', () => {
  const LONG = [
    { mois: 'Janvier', groupe: 'Cadres', v: 120 },
    { mois: 'Janvier', groupe: 'Agents', v: 310 },
    { mois: 'Février', groupe: 'Cadres', v: 145 },
    { mois: 'Février', groupe: 'Agents', v: 288 },
    { mois: 'Mars', groupe: 'Agents', v: 341 },
  ];

  function lignes(html: string): string[][] {
    const corps = /<tbody>(.*)<\/tbody>/s.exec(html)?.[1] ?? '';
    return [...corps.matchAll(/<tr>(.*?)<\/tr>/g)].map((tr) =>
      [...tr[1].matchAll(/<td>([^<]*)<\/td>/g)].map((td) => td[1])
    );
  }

  function graphique(data: unknown[]): { chart: DsfrDataChart; internals: ChartInternals } {
    const chart = new DsfrDataChart();
    const internals = chart as unknown as ChartInternals;
    chart.id = 'cadre';
    chart.type = 'line';
    chart.databox = true;
    internals._data = data;
    return { chart, internals };
  }

  it('series-field : une ligne par libellé, une colonne par série', () => {
    const { chart, internals } = graphique(LONG);
    chart.labelField = 'mois';
    chart.valueField = 'v';
    chart.seriesField = 'groupe';

    const html = internals._databoxTableHtml();

    expect(headers(html)).toEqual(['mois', 'Cadres', 'Agents']);
    expect(lignes(html)).toEqual([
      ['Janvier', '120', '310'],
      ['Février', '145', '288'],
      // Cadres n'a pas d'observation en mars : cellule vide, jamais 0 (#1198).
      ['Mars', '', '341'],
    ]);
  });

  it('series-field : une série sans nom porte empty-label en en-tête', () => {
    const { chart, internals } = graphique([
      { mois: 'Janvier', groupe: null, v: 1 },
      { mois: 'Janvier', groupe: 'Agents', v: 2 },
    ]);
    chart.labelField = 'mois';
    chart.valueField = 'v';
    chart.seriesField = 'groupe';

    expect(headers(internals._databoxTableHtml())).toEqual(['mois', 'Non renseigné', 'Agents']);
  });

  it('jusqu’à 100 lignes : aucune mention', () => {
    const { chart, internals } = graphique(
      Array.from({ length: 100 }, (_, i) => ({ rang: `L${i + 1}`, v: i }))
    );
    chart.labelField = 'rang';
    chart.valueField = 'v';

    const html = internals._databoxTableHtml();
    expect(lignes(html)).toHaveLength(100);
    expect(html).not.toContain('dsfr-data-chart__databox-truncation');
  });

  it('au-delà de 100 lignes : la coupe est dite, avec le total', () => {
    const { chart, internals } = graphique(
      Array.from({ length: 1234 }, (_, i) => ({ rang: `L${i + 1}`, v: i }))
    );
    chart.labelField = 'rang';
    chart.valueField = 'v';

    const html = internals._databoxTableHtml();
    expect(lignes(html)).toHaveLength(100);
    const mention = /databox-truncation">([^<]*)</.exec(html)?.[1] ?? '';
    expect(mention.replace(/[\u202f\u00a0]/g, ' ')).toBe(
      'Affichage limité aux 100 premières lignes sur 1 234.'
    );
  });

  it('format long : le plafond porte sur les lignes PIVOTÉES, pas sur les couples', () => {
    // 60 libellés × 2 séries = 120 enregistrements, mais 60 lignes de tableau.
    const data = Array.from({ length: 60 }, (_, i) => [
      { mois: `M${i}`, groupe: 'A', v: i },
      { mois: `M${i}`, groupe: 'B', v: i * 2 },
    ]).flat();
    const { chart, internals } = graphique(data);
    chart.labelField = 'mois';
    chart.valueField = 'v';
    chart.seriesField = 'groupe';

    const html = internals._databoxTableHtml();
    expect(lignes(html)).toHaveLength(60);
    expect(html).not.toContain('dsfr-data-chart__databox-truncation');
  });
});
