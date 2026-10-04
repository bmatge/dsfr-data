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

describe('applyColorMap — les points suivent la série (BUG-033 du banc, #1230)', () => {
  /** Jeu de données tel que DSFR Chart le pose sur une courbe : points à part du trait. */
  const courbe = (couleur: string, survol: string): Record<string, unknown> => ({
    data: [1, 2, 3],
    borderColor: couleur,
    backgroundColor: couleur,
    hoverBorderColor: survol,
    hoverBackgroundColor: survol,
    pointBorderColor: couleur,
    pointBackgroundColor: couleur,
    pointHoverBorderColor: survol,
    pointHoverBackgroundColor: survol,
  });

  it('pose la couleur sur les points et leurs variantes de survol', () => {
    const datasets = [courbe('#5C68E5', '#787eff'), courbe('#82B5F2', '#9cceff')];
    const chart: ColorableChart = { data: { labels: ['a', 'b', 'c'], datasets }, update: vi.fn() };

    applyColorMap(chart, parseColorMap('Beta:#00aa00'), ['Alpha', 'Beta']);

    expect(datasets[1]).toMatchObject({
      borderColor: '#00aa00',
      pointBackgroundColor: '#00aa00',
      pointBorderColor: '#00aa00',
      pointHoverBackgroundColor: '#00aa00',
      pointHoverBorderColor: '#00aa00',
    });
    // La série non citée garde la palette, points compris.
    expect(datasets[0].pointBackgroundColor).toBe('#5C68E5');
    expect(datasets[0].pointHoverBorderColor).toBe('#787eff');
  });

  it('n’invente pas de couleurs de point sur un jeu qui n’en porte pas (barres)', () => {
    const datasets: Record<string, unknown>[] = [{ backgroundColor: '#aaa' }];
    applyColorMap({ data: { datasets }, update: vi.fn() }, parseColorMap('A:#111111'), ['A']);

    expect(datasets[0]).not.toHaveProperty('pointBackgroundColor');
    expect(datasets[0]).not.toHaveProperty('pointHoverBorderColor');
  });

  it('redessine par une transition de durée nulle, pas par update("none")', () => {
    // update('none') laisse en place les options PARTAGÉES des points d'une
    // courbe : le trait changeait de couleur, pas les points.
    const update = vi.fn<(mode?: string) => void>();
    const transitions: Record<string, unknown> = {};
    const chart: ColorableChart = {
      data: { datasets: [courbe('#5C68E5', '#787eff')] },
      options: { transitions },
      update,
    };

    applyColorMap(chart, parseColorMap('Alpha:#ff0000'), ['Alpha']);

    expect(update).toHaveBeenCalledTimes(1);
    const mode = update.mock.calls[0][0];
    expect(mode).not.toBe('none');
    expect(transitions[mode as string]).toEqual({ animation: { duration: 0 } });
  });

  it('radar : le fond garde la transparence qu’il avait', () => {
    const datasets: Record<string, unknown>[] = [
      { ...courbe('#5C68E5', '#2846bc'), backgroundColor: '#5C68E54D' },
      { ...courbe('#82B5F2', '#598fc9'), backgroundColor: '#82B5F24D' },
    ];
    applyColorMap(
      { data: { datasets }, update: vi.fn() },
      parseColorMap('Alpha:#ff0000,Beta:#0a0'),
      ['Alpha', 'Beta']
    );

    expect(datasets[0].backgroundColor).toBe('#ff00004D');
    expect(datasets[0].borderColor).toBe('#ff0000');
    // Écriture courte #rgb : dépliée avant de recevoir l'alpha.
    expect(datasets[1].backgroundColor).toBe('#00aa004D');
  });

  it('radar : une couleur nommée, sans alpha calculable, est posée telle quelle', () => {
    const datasets: Record<string, unknown>[] = [
      { ...courbe('#5C68E5', '#2846bc'), backgroundColor: '#5C68E54D' },
    ];
    applyColorMap({ data: { datasets }, update: vi.fn() }, parseColorMap('Alpha:red'), ['Alpha']);

    expect(datasets[0].backgroundColor).toBe('red');
  });
});

/**
 * #1244 — la branche « modalité » (couleur par LIBELLÉ D'AXE) sur un jeu qui
 * dessine des POINTS. Mesuré au navigateur avant correction, sur une courbe à
 * une série et `color-map="1:#ff0000,3:#00aa00"` : le TRAIT entier prenait la
 * couleur de la première modalité (Chart.js lit le premier élément d'un
 * tableau posé sur une option de trait), la pastille de légende aussi, l'aire
 * d'un radar devenait opaque — et aucun point n'était recoloré.
 */
describe('applyColorMap — par libellé d’axe, sur un jeu à points (#1244)', () => {
  const courbe = (): Record<string, unknown> => ({
    data: [10, 20, 15, 30],
    borderColor: '#5C68E5',
    backgroundColor: '#5C68E5',
    hoverBorderColor: '#787eff',
    hoverBackgroundColor: '#787eff',
    pointBorderColor: '#5C68E5',
    pointBackgroundColor: '#5C68E5',
    pointHoverBorderColor: '#787eff',
    pointHoverBackgroundColor: '#787eff',
  });
  const LABELS = ['1', '2', '3', '4'];

  it('chaque point nommé prend sa couleur, les autres gardent la palette', () => {
    const datasets = [courbe()];
    applyColorMap(
      { data: { labels: LABELS, datasets }, update: vi.fn() },
      parseColorMap('1:#ff0000,3:#00aa00'),
      ['a']
    );

    expect(datasets[0].pointBackgroundColor).toEqual(['#ff0000', '#5C68E5', '#00aa00', '#5C68E5']);
    expect(datasets[0].pointBorderColor).toEqual(['#ff0000', '#5C68E5', '#00aa00', '#5C68E5']);
    expect(datasets[0].pointHoverBackgroundColor).toEqual([
      '#ff0000',
      '#787eff',
      '#00aa00',
      '#787eff',
    ]);
    expect(datasets[0].pointHoverBorderColor).toEqual(['#ff0000', '#787eff', '#00aa00', '#787eff']);
  });

  it('le trait et le fond restent ceux de la série : un trait n’a qu’une couleur', () => {
    const datasets = [{ ...courbe(), backgroundColor: '#5C68E54D' }];
    applyColorMap(
      { data: { labels: LABELS, datasets }, update: vi.fn() },
      parseColorMap('1:#ff0000,3:#00aa00'),
      ['a']
    );

    expect(datasets[0].borderColor).toBe('#5C68E5');
    expect(datasets[0].backgroundColor).toBe('#5C68E54D');
    expect(datasets[0].hoverBorderColor).toBe('#787eff');
    expect(datasets[0].hoverBackgroundColor).toBe('#787eff');
  });

  it('la légende, une pastille par SÉRIE, n’est pas recolorée', () => {
    const application = applyColorMap(
      { data: { labels: LABELS, datasets: [courbe()] }, update: vi.fn() },
      parseColorMap('1:#ff0000,3:#00aa00'),
      ['a']
    );

    expect(application).toEqual({ applied: true, legendColors: [undefined] });
  });

  it('redessine une fois, par update("none") : la transition de la branche « série » n’est pas requise', () => {
    // Mesuré au navigateur (e2e/chart-legend.spec.ts) : une couleur par point
    // est un tableau, donc une option que Chart.js ne partage pas entre points.
    const update = vi.fn<(mode?: string) => void>();
    const transitions: Record<string, unknown> = {};
    applyColorMap(
      { data: { labels: LABELS, datasets: [courbe()] }, options: { transitions }, update },
      parseColorMap('1:#ff0000'),
      ['a']
    );

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('none');
    expect(transitions).toEqual({});
  });

  it('barres et courbe (bar-line) : une couleur par barre, une couleur par point', () => {
    const barres: Record<string, unknown> = {
      data: [1, 2, 3, 4],
      backgroundColor: '#5C68E5',
      borderColor: '#5C68E5',
    };
    const datasets = [barres, courbe()];
    const application = applyColorMap(
      { data: { labels: LABELS, datasets }, update: vi.fn() },
      parseColorMap('3:#00aa00'),
      ['x', 'y']
    );

    expect(barres.backgroundColor).toEqual(['#5C68E5', '#5C68E5', '#00aa00', '#5C68E5']);
    expect(datasets[1].borderColor).toBe('#5C68E5');
    expect(datasets[1].pointBackgroundColor).toEqual(['#5C68E5', '#5C68E5', '#00aa00', '#5C68E5']);
    expect(application.legendColors).toEqual([undefined, undefined]);
  });

  it('sans aucun jeu à points (barres, camembert) : le rendu d’avant, une couleur par part', () => {
    const update = vi.fn<(mode?: string) => void>();
    const datasets: Record<string, unknown>[] = [
      { data: [1, 2], backgroundColor: ['#aaa', '#bbb'], borderColor: ['#aaa', '#bbb'] },
    ];
    const application = applyColorMap(
      { data: { labels: ['Paris', 'Lyon'], datasets }, update },
      parseColorMap('Lyon:#0000ff'),
      ['v']
    );

    expect(datasets[0].backgroundColor).toEqual(['#aaa', '#0000ff']);
    expect(application.legendColors).toEqual([undefined, '#0000ff']);
    expect(update).toHaveBeenCalledWith('none');
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
