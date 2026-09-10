import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Tests #732 — `color-map` : une seule grammaire, échappée, pour la carte et
 * le graphique.
 *
 * LIM-011 : le parseur de `dsfr-data-map-layer` découpait sur la virgule sans
 * décoder l'échappement percent (#676), donc un libellé métier contenant une
 * virgule cassait tout le mapping. AM-060 : `color-map` n'existait que sur la
 * carte, alors qu'un graphique a le même besoin de fixer la couleur d'une
 * modalité.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { parseColorMap, applyColorMap, type ColorableChart } from '@/utils/color-map.js';
import { escapeColonValue } from '@dsfr-data/shared/lib';
import { DsfrDataChart } from '@/components/dsfr-data-chart.js';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';

/** Vue interne de la couche : ce que les tests injectent ou lisent. */
interface LayerInternals {
  _colorMapParsed: Map<string, string> | null;
  _resolveColor: (record: Record<string, unknown>) => string;
}

/** Vue interne du graphique. */
interface ChartInternals {
  _data: unknown[];
  _applyColorMap: (colorMap: Map<string, string>) => boolean;
  _refreshColorMap: () => void;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('parseColorMap — échappement percent des séparateurs (#676)', () => {
  it('un libellé contenant une virgule échappée ne casse pas le mapping', () => {
    const label = 'Commerce, transport';
    const raw = `${escapeColonValue(label)}:#000091,Industrie:#E1000F`;

    const parsed = parseColorMap(raw);

    expect(parsed.size).toBe(2);
    expect(parsed.get(label)).toBe('#000091');
    expect(parsed.get('Industrie')).toBe('#E1000F');
  });

  it('un libellé contenant un deux-points échappé garde sa couleur', () => {
    const label = 'Ratio 1:2';
    const parsed = parseColorMap(`${escapeColonValue(label)}:#18753C`);

    expect(parsed.get(label)).toBe('#18753C');
    expect(parsed.size).toBe(1);
  });

  it('sans échappement, la virgule coupe la paire — le reste survit', () => {
    const parsed = parseColorMap('Commerce, transport:#000091,Industrie:#E1000F');

    expect(parsed.get('Commerce, transport')).toBeUndefined();
    expect(parsed.get('Industrie')).toBe('#E1000F');
  });

  it('paires inexploitables ignorées, dernière déclaration gagnante', () => {
    const parsed = parseColorMap('sans-separateur,:#111,vide:,a:#111,a:#222');

    expect(parsed.size).toBe(1);
    expect(parsed.get('a')).toBe('#222');
  });
});

describe('dsfr-data-map-layer — color-map échappé bout en bout (LIM-011)', () => {
  it('_resolveColor retrouve un libellé à virgule', () => {
    const layer = new DsfrDataMapLayer();
    layer.colorField = 'secteur';
    layer.color = '#929292';
    const internals = layer as unknown as LayerInternals;
    internals._colorMapParsed = parseColorMap(
      `${escapeColonValue('Commerce, transport')}:#000091,Industrie:#E1000F`
    );

    expect(internals._resolveColor({ secteur: 'Commerce, transport' })).toBe('#000091');
    expect(internals._resolveColor({ secteur: 'Industrie' })).toBe('#E1000F');
    expect(internals._resolveColor({ secteur: 'Autre' })).toBe('#929292');
  });
});

describe('applyColorMap — pose des couleurs sur une instance Chart.js', () => {
  function fakeChart(
    datasets: Record<string, unknown>[],
    labels: string[] = []
  ): ColorableChart & { update: (mode?: string) => void } {
    const update = vi.fn<(mode?: string) => void>();
    return { data: { labels, datasets }, update };
  }

  it('mode série : une couleur scalaire par jeu de données', () => {
    const chart = fakeChart([{ backgroundColor: '#aaa' }, { backgroundColor: '#bbb' }]);

    const result = applyColorMap(chart, parseColorMap('Objectif:#E1000F'), ['Réalisé', 'Objectif']);

    expect(result.applied).toBe(true);
    expect(result.legendColors).toEqual([undefined, '#E1000F']);
    expect(chart.data?.datasets?.[0].backgroundColor).toBe('#aaa');
    expect(chart.data?.datasets?.[1].backgroundColor).toBe('#E1000F');
    expect(chart.data?.datasets?.[1].hoverBorderColor).toBe('#E1000F');
    expect(chart.update).toHaveBeenCalledWith('none');
  });

  it('mode modalité : une couleur par part, la palette reste sur le reste', () => {
    const chart = fakeChart(
      [{ data: [1, 2, 3], backgroundColor: ['#aaa', '#bbb', '#ccc'] }],
      ['Oui', 'Non', 'Sans avis']
    );

    const result = applyColorMap(chart, parseColorMap('Oui:#18753C,Non:#CE0500'), ['Réponses']);

    expect(result.applied).toBe(true);
    expect(chart.data?.datasets?.[0].backgroundColor).toEqual(['#18753C', '#CE0500', '#ccc']);
    expect(result.legendColors).toEqual(['#18753C', '#CE0500', undefined]);
  });

  it('aucune modalité reconnue : rien n’est touché', () => {
    const chart = fakeChart([{ backgroundColor: '#aaa' }], ['A', 'B']);

    const result = applyColorMap(chart, parseColorMap('Inconnu:#111'), ['Série 1']);

    expect(result.applied).toBe(false);
    expect(chart.data?.datasets?.[0].backgroundColor).toBe('#aaa');
    expect(chart.update).not.toHaveBeenCalled();
  });

  it('chart sans dataset : sans effet', () => {
    expect(applyColorMap({ data: { datasets: [] } }, parseColorMap('a:#111'), []).applied).toBe(
      false
    );
  });
});

describe('dsfr-data-chart — color-map (AM-060)', () => {
  /** Graphique rendu factice : wrapper + custom element DSFR + canvas + légende. */
  function renderedChart(
    tag: string,
    dotCount: number,
    chartInstance: Record<string, unknown>
  ): DsfrDataChart {
    const chart = new DsfrDataChart();
    const wrapper = document.createElement('div');
    wrapper.className = 'dsfr-data-chart__wrapper';
    const chartEl = document.createElement(tag);
    const canvas = document.createElement('canvas');
    chartEl.appendChild(canvas);
    for (let i = 0; i < dotCount; i++) {
      const dot = document.createElement('span');
      dot.className = 'legend_dot';
      dot.style.backgroundColor = 'rgb(0, 0, 0)';
      chartEl.appendChild(dot);
    }
    wrapper.appendChild(chartEl);
    chart.appendChild(wrapper);
    document.body.appendChild(chart);
    (chartEl as unknown as { _instance: unknown })._instance = {
      proxy: { chart: { ...chartInstance, canvas, scales: {}, chartArea: { width: 300 } } },
    };
    return chart;
  }

  it('l’attribut existe et vaut la chaîne vide par défaut', () => {
    expect(new DsfrDataChart().colorMap).toBe('');
  });

  it('recolore les séries et les pastilles de légende', () => {
    const datasets = [{ backgroundColor: '#aaa' }, { backgroundColor: '#bbb' }];
    const chart = renderedChart('bar-chart', 2, {
      data: { labels: ['2024', '2025'], datasets },
      update: vi.fn(),
    });
    chart.type = 'bar';
    chart.name = '["Réalisé","Objectif"]';
    chart.colorMap = 'Objectif:#E1000F';

    const applied = (chart as unknown as ChartInternals)._applyColorMap(
      parseColorMap(chart.colorMap)
    );

    expect(applied).toBe(true);
    expect(datasets[1].backgroundColor).toBe('#E1000F');
    const dots = chart.querySelectorAll<HTMLElement>('.legend_dot');
    expect(dots[0].style.backgroundColor).toBe('rgb(0, 0, 0)');
    expect(dots[1].style.backgroundColor.toLowerCase()).toBe('#e1000f');
  });

  it('une modalité à virgule échappée fonctionne aussi sur le graphique', () => {
    const datasets = [{ data: [1, 2], backgroundColor: ['#aaa', '#bbb'] }];
    const chart = renderedChart('pie-chart', 2, {
      data: { labels: ['Commerce, transport', 'Industrie'], datasets },
      update: vi.fn(),
    });
    chart.type = 'pie';
    chart.colorMap = `${escapeColonValue('Commerce, transport')}:#000091`;

    (chart as unknown as ChartInternals)._applyColorMap(parseColorMap(chart.colorMap));

    expect(datasets[0].backgroundColor).toEqual(['#000091', '#bbb']);
  });

  it('sans instance Chart.js prête : false, la palette reste', () => {
    const chart = new DsfrDataChart();
    expect((chart as unknown as ChartInternals)._applyColorMap(parseColorMap('a:#111'))).toBe(
      false
    );
  });

  it('sur une carte, color-map est sans effet et le dit une seule fois', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = new DsfrDataChart();
    chart.type = 'map-reg';
    chart.colorMap = 'IDF:#000091';
    const internals = chart as unknown as ChartInternals;

    internals._refreshColorMap();
    internals._refreshColorMap();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('color-map');
  });
});
