import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #813 (constat BUG-016 du banc d'essai) — avec `databox`, `color-map`
 * recolorait le graphique mais pas sa légende.
 *
 * DSFR Chart rend alors le canvas ET la légende dans `data-box` ; l'élément
 * `bar-chart` retenu comme hôte reste vide. Le canvas était retrouvé par un
 * repli (barres recolorées), les pastilles `.legend_dot` étaient cherchées
 * dans l'hôte vide : `dots.length !== colors.length`, sortie silencieuse.
 * Sur le banc, les 5 emplois de color-map étaient sous databox : 15 pastilles
 * contraires à leurs barres.
 */

import { DsfrDataChart } from '@/components/dsfr-data-chart.js';

interface ChartInternals {
  _applyColorMap(colorMap: Map<string, string>): boolean;
  _displaySeriesNamesOverride?: string[];
}

afterEach(() => {
  document.body.innerHTML = '';
  delete (window as { Chart?: unknown }).Chart;
  vi.restoreAllMocks();
});

/**
 * Composant avec le DOM que produit DSFR Chart. `databox` : légende et canvas
 * dans `data-box`, `bar-chart` vide. Sans databox : tout dans `bar-chart`.
 */
function mountChart(withDatabox: boolean, dots = 3) {
  const chart = new DsfrDataChart();
  chart.id = withDatabox ? 'avec' : 'sans';
  chart.type = 'bar';
  document.body.appendChild(chart);
  const wrapper = document.createElement('div');
  wrapper.className = withDatabox ? 'dsfr-data-chart__databox-wrapper' : 'dsfr-data-chart__wrapper';
  const barChart = document.createElement('bar-chart');
  const canvas = document.createElement('canvas');
  const legend = document.createElement('div');
  for (let i = 0; i < dots; i++) {
    const dot = document.createElement('span');
    dot.className = 'legend_dot';
    dot.style.backgroundColor = 'rgb(92, 104, 229)'; // palette par défaut
    legend.appendChild(dot);
  }
  if (withDatabox) {
    const dataBox = document.createElement('data-box');
    dataBox.append(canvas, legend);
    wrapper.append(barChart, dataBox);
  } else {
    barChart.append(canvas, legend);
    wrapper.append(barChart);
  }
  chart.appendChild(wrapper);

  // Instance Chart.js trouvée par window.Chart.getChart (premier chemin de
  // resolveChartInstance) : trois séries empilées.
  const instance = {
    canvas,
    scales: {},
    chartArea: { width: 100 },
    data: {
      labels: ['a', 'b'],
      datasets: [{ label: 'haute' }, { label: 'moyenne' }, { label: 'basse' }],
    },
    update: vi.fn(),
  };
  (window as { Chart?: unknown }).Chart = { getChart: () => instance };
  vi.spyOn(
    chart as unknown as { _getDisplaySeriesNames(): string[] },
    '_getDisplaySeriesNames'
  ).mockReturnValue(['haute', 'moyenne', 'basse']);
  return { chart, legend, instance };
}

const COLOR_MAP = new Map([
  ['haute', '#c9191e'],
  ['moyenne', '#e4794a'],
  ['basse', '#929292'],
]);
const dotColors = (legend: HTMLElement) =>
  [...legend.querySelectorAll<HTMLElement>('.legend_dot')].map((d) => d.style.backgroundColor);

describe('#813 — color-map sous databox', () => {
  it('AC : les pastilles de légende portent les couleurs de color-map', () => {
    const { chart, legend, instance } = mountChart(true);
    expect((chart as unknown as ChartInternals)._applyColorMap(COLOR_MAP)).toBe(true);
    expect(instance.data.datasets[0]).toMatchObject({ backgroundColor: '#c9191e' });
    expect(dotColors(legend)).toEqual(['#c9191e', '#e4794a', '#929292']);
  });

  it('sans databox, la légende reste juste (non-régression)', () => {
    const { chart, legend } = mountChart(false);
    (chart as unknown as ChartInternals)._applyColorMap(COLOR_MAP);
    expect(dotColors(legend)).toEqual(['#c9191e', '#e4794a', '#929292']);
  });

  it('un nombre de pastilles qui ne correspond pas : avertissement, plus de sortie silencieuse', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { chart, legend } = mountChart(true, 2);
    const internals = chart as unknown as ChartInternals;
    internals._applyColorMap(COLOR_MAP);
    internals._applyColorMap(COLOR_MAP); // rendu suivant : pas de répétition
    const messages = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes('color-map'));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('2 pastille(s) de légende pour 3 couleur(s)');
    expect(dotColors(legend)).toEqual(['rgb(92, 104, 229)', 'rgb(92, 104, 229)']);
  });
});
