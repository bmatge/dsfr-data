import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #968 (constat BUG-022 du banc d'essai) — `color-map` recolorait les barres
 * et la légende, mais PAS les pastilles de l'infobulle, qui gardaient la
 * palette `categorical` par défaut (`#5C68E5` / `#82B5F2`).
 *
 * Troisième surface de la famille de #813 (légende) — et, contrairement à
 * elle, le défaut ne demande pas `databox` : il se produit sur un graphique nu.
 *
 * CAUSE COMMUNE : le composant Vue de DSFR Chart tient une seule source de
 * vérité, `colorParse`, dont dérivent le canvas (`datasets[d].borderColor`),
 * la légende (`legendColors`) et l'infobulle. `applyColorMap` n'écrivait que
 * sur les datasets de l'instance Chart.js — une COPIE. L'infobulle, elle,
 * relit `colorParse` AU SURVOL (`data-color="${colorParse[d][i]}"` dans le
 * `external` du tooltip) : son DOM n'existe pas avant le survol et se réécrit
 * à chaque mouvement, donc aucun rattrapage de DOM ne peut la tenir.
 *
 * L'infobulle ne nomme pas les séries : la couleur est le seul lien entre une
 * ligne et la série qu'elle décrit. Fausse, elle apparie la mauvaise valeur à
 * la mauvaise série.
 */

import { DsfrDataChart } from '@/components/dsfr-data-chart.js';

interface ChartInternals {
  _applyColorMap(colorMap: Map<string, string>): boolean;
}

afterEach(() => {
  document.body.innerHTML = '';
  delete (window as { Chart?: unknown }).Chart;
  vi.restoreAllMocks();
});

/** Modèle de couleurs tel que `loadColors()` le laisse dans le composant Vue. */
interface FakeColorModel {
  colorParse: unknown[];
  colorHover: unknown[];
  colorBarParse?: unknown[];
  colorBarHover?: unknown[];
}

/**
 * Graphique nu (SANS databox) avec le DOM et les internes que produit DSFR
 * Chart : `bar-chart` porte `_instance.proxy`, où vit `colorParse`.
 */
function mountChart(options: {
  tag?: string;
  type?: string;
  series: string[];
  labels: string[];
  /** Forme de `colorParse` : un tableau par point (bar/pie) ou un scalaire. */
  model: FakeColorModel | null;
}) {
  const chart = new DsfrDataChart();
  chart.id = 'graphique';
  chart.type = options.type ?? 'bar';
  document.body.appendChild(chart);

  const wrapper = document.createElement('div');
  wrapper.className = 'dsfr-data-chart__wrapper';
  const chartEl = document.createElement(options.tag ?? 'bar-chart');
  const canvas = document.createElement('canvas');
  const legend = document.createElement('div');
  for (const _ of options.series) {
    const dot = document.createElement('span');
    dot.className = 'legend_dot';
    dot.style.backgroundColor = 'rgb(92, 104, 229)';
    legend.appendChild(dot);
  }
  chartEl.append(canvas, legend);
  wrapper.append(chartEl);
  chart.appendChild(wrapper);

  if (options.model) {
    (chartEl as unknown as { _instance: { proxy: FakeColorModel } })._instance = {
      proxy: options.model,
    };
  }

  const datasets = options.series.map((label, i) => ({
    label,
    data: options.labels.map(() => i + 1),
    backgroundColor: (options.model?.colorParse ?? [])[i],
    borderColor: (options.model?.colorParse ?? [])[i],
    hoverBackgroundColor: (options.model?.colorHover ?? [])[i],
    hoverBorderColor: (options.model?.colorHover ?? [])[i],
  }));
  const instance = {
    canvas,
    scales: {},
    chartArea: { width: 100 },
    data: { labels: options.labels, datasets },
    update: vi.fn(),
  };
  (window as { Chart?: unknown }).Chart = { getChart: () => instance };
  vi.spyOn(
    chart as unknown as { _getDisplaySeriesNames(): string[] },
    '_getDisplaySeriesNames'
  ).mockReturnValue(options.series);

  return { chart: chart as unknown as ChartInternals, model: options.model, instance, legend };
}

/** Le cas de l'issue : deux séries empilées, deux années. */
const SERIES = ['Commune rurale', 'Commune urbaine'];
const LABELS = ['2025', '2026'];
const COLOR_MAP = new Map([
  ['Commune rurale', '#00a95f'],
  ['Commune urbaine', '#000091'],
]);
/** Palette `categorical` par défaut, celle que les pastilles affichaient. */
const paletteParPoint = (): FakeColorModel => ({
  colorParse: [
    ['#5C68E5', '#5C68E5'],
    ['#82B5F2', '#82B5F2'],
  ],
  colorHover: [
    ['#1b1f5c', '#1b1f5c'],
    ['#123a63', '#123a63'],
  ],
});

describe("#968 — color-map et les pastilles de l'infobulle", () => {
  it('AC — cas A : `colorParse` porte les couleurs de color-map, à la forme près', () => {
    const { chart, model } = mountChart({
      series: SERIES,
      labels: LABELS,
      model: paletteParPoint(),
    });

    expect(chart._applyColorMap(COLOR_MAP)).toBe(true);

    // L'infobulle lit colorParse[datasetIndex][dataIndex] : la forme « un
    // tableau par point » doit être conservée, sinon indexer une CHAÎNE
    // rendrait « # ».
    expect(model!.colorParse).toEqual([
      ['#00a95f', '#00a95f'],
      ['#000091', '#000091'],
    ]);
    expect(model!.colorHover).toEqual([
      ['#00a95f', '#00a95f'],
      ['#000091', '#000091'],
    ]);
  });

  it("cas B — sans color-map applicable, le modèle n'est pas touché (témoin)", () => {
    const { chart, model } = mountChart({
      series: SERIES,
      labels: LABELS,
      model: paletteParPoint(),
    });
    const avant = JSON.parse(JSON.stringify(model));

    // Aucune modalité ne correspond : applyColorMap ne s'applique pas.
    chart._applyColorMap(new Map([['Autre chose', '#00a95f']]));

    expect(model).toEqual(avant);
  });

  it('cas C — une seule série recolorée : les autres gardent la palette', () => {
    const { chart, model } = mountChart({
      series: SERIES,
      labels: LABELS,
      model: paletteParPoint(),
    });

    chart._applyColorMap(new Map([['Commune rurale', '#00a95f']]));

    expect(model!.colorParse).toEqual([
      ['#00a95f', '#00a95f'],
      ['#82B5F2', '#82B5F2'],
    ]);
  });

  it('mode « libellé » (camembert) : une couleur par part, dans le même tableau', () => {
    const { chart, model } = mountChart({
      tag: 'pie-chart',
      type: 'pie',
      series: ['Série 1'],
      labels: ['Commune rurale', 'Commune urbaine'],
      model: { colorParse: [['#5C68E5', '#82B5F2']], colorHover: [['#1b1f5c', '#123a63']] },
    });

    chart._applyColorMap(COLOR_MAP);

    expect(model!.colorParse).toEqual([['#00a95f', '#000091']]);
  });

  it('forme scalaire (line / radar / scatter) : elle reste scalaire', () => {
    const { chart, model } = mountChart({
      tag: 'line-chart',
      type: 'line',
      series: SERIES,
      labels: LABELS,
      model: { colorParse: ['#5C68E5', '#82B5F2'], colorHover: ['#1b1f5c', '#123a63'] },
    });

    chart._applyColorMap(COLOR_MAP);

    expect(model!.colorParse).toEqual(['#00a95f', '#000091']);
  });

  it('bar-line : la barre va dans colorBarParse, la courbe dans colorParse', () => {
    const { chart, model } = mountChart({
      tag: 'bar-line-chart',
      type: 'bar-line',
      series: SERIES,
      labels: LABELS,
      model: {
        colorParse: ['#82B5F2'],
        colorHover: ['#123a63'],
        colorBarParse: ['#5C68E5'],
        colorBarHover: ['#1b1f5c'],
      },
    });
    // Le modèle bar-line sépare les deux séries : les datasets, eux, restent
    // dans l'ordre barre puis courbe.
    chart._applyColorMap(COLOR_MAP);

    expect(model!.colorBarParse).toEqual(['#00a95f']);
    expect(model!.colorParse).toEqual(['#000091']);
  });

  it("modèle hors d'atteinte : un avertissement, une seule fois", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { chart } = mountChart({ series: SERIES, labels: LABELS, model: null });

    chart._applyColorMap(COLOR_MAP);
    chart._applyColorMap(COLOR_MAP);

    const messages = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes('modèle de couleurs'));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('infobulle');
  });
});
