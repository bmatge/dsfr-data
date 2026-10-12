import { describe, it, expect, vi } from 'vitest';
import {
  planAxisBounds,
  applyAxisBounds,
  isNumericLabelAxis,
  type AxisBoundsInput,
  type AxisChartLike,
} from '@/utils/chart-axis-bounds.js';

/**
 * #1273 — bornes d'axe : pour chaque couple attribut × type, la borne AGIT ou
 * elle est SIGNALÉE. Les valeurs de ce fichier sont celles de la matrice
 * mesurée dans le navigateur (données 12, 18, 27, 33 ; seconde série 120…510).
 */

const SERIE = [12, 18, 27, 33];
const SECONDE = [120, 300, 450, 510];

function entree(partiel: Partial<AxisBoundsInput>): AxisBoundsInput {
  return {
    type: 'bar',
    horizontal: false,
    stacked: false,
    xMin: '',
    xMax: '',
    yMin: '',
    yMax: '',
    labels: ['A', 'B', 'C', 'D'],
    series: [SERIE],
    ...partiel,
  };
}

const codes = (plan: ReturnType<typeof planAxisBounds>) =>
  plan.warnings.map((w) => `${w.attr}:${w.code}`);

describe('chart-axis-bounds — planAxisBounds', () => {
  it('sans borne écrite : rien à relayer, rien à poser, rien à dire', () => {
    for (const type of ['bar', 'line', 'scatter', 'bar-line', 'radar', 'pie', 'gauge', 'map']) {
      expect(planAxisBounds(entree({ type }))).toEqual({ attrs: {}, scales: {}, warnings: [] });
    }
  });

  describe('axe des valeurs (y-min / y-max)', () => {
    it('courbe : la borne est posée exactement, minimum positif compris', () => {
      const plan = planAxisBounds(entree({ type: 'line', yMin: '5', yMax: '37' }));
      expect(plan.scales).toEqual({ y: { min: 5, max: 37 } });
      expect(plan.attrs).toEqual({ 'y-min': '5', 'y-max': '37' });
      expect(plan.warnings).toEqual([]);
    });

    it('nuage : même règle que la courbe', () => {
      const plan = planAxisBounds(
        entree({ type: 'scatter', labels: ['1', '2', '3', '4'], yMin: '-7' })
      );
      expect(plan.scales).toEqual({ y: { min: -7 } });
      expect(plan.warnings).toEqual([]);
    });

    it('une borne qui masquerait une donnée est ignorée et signalée', () => {
      const plan = planAxisBounds(entree({ type: 'line', yMin: '20', yMax: '25' }));
      expect(plan.scales).toEqual({});
      expect(plan.attrs).toEqual({});
      expect(codes(plan)).toEqual(['y-min:masque-des-donnees', 'y-max:masque-des-donnees']);
      expect(plan.warnings[0].message).toContain('y-min="20"');
      expect(plan.warnings[0].message).toContain('12');
      expect(plan.warnings[1].message).toContain('33');
    });

    it('une borne égale à la donnée extrême la laisse visible : elle agit', () => {
      const plan = planAxisBounds(entree({ type: 'line', yMin: '12', yMax: '33' }));
      expect(plan.scales).toEqual({ y: { min: 12, max: 33 } });
      expect(plan.warnings).toEqual([]);
    });

    it('barres : un minimum positif est ignoré et signalé (des barres partent de zéro)', () => {
      const plan = planAxisBounds(entree({ type: 'bar', yMin: '5', yMax: '40' }));
      expect(plan.scales).toEqual({ y: { max: 40 } });
      expect(plan.attrs).toEqual({ 'y-max': '40' });
      expect(codes(plan)).toEqual(['y-min:barres-depuis-zero']);
      expect(plan.warnings[0].message).toContain('des barres partent de zéro');
    });

    it('barres : un minimum négatif ou nul agit', () => {
      expect(planAxisBounds(entree({ type: 'bar', yMin: '-10' })).scales).toEqual({
        y: { min: -10 },
      });
      const zero = planAxisBounds(entree({ type: 'bar', yMin: '0' }));
      expect(zero.scales).toEqual({ y: { min: 0 } });
      expect(zero.warnings).toEqual([]);
    });

    it('barres à valeurs négatives : un minimum nul les masquerait', () => {
      const plan = planAxisBounds(entree({ type: 'bar', series: [[-4, 8]], yMin: '0' }));
      expect(plan.scales).toEqual({});
      expect(codes(plan)).toEqual(['y-min:masque-des-donnees']);
    });

    it('barres empilées : le maximum se compare au CUMUL, pas à la plus grande valeur', () => {
      const sous = planAxisBounds(
        entree({ type: 'bar', stacked: true, series: [SERIE, SECONDE], yMax: '520' })
      );
      expect(sous.scales).toEqual({});
      expect(sous.warnings[0].message).toContain('543');
      const dessus = planAxisBounds(
        entree({ type: 'bar', stacked: true, series: [SERIE, SECONDE], yMax: '600' })
      );
      expect(dessus.scales).toEqual({ y: { max: 600 } });
      // Non empilées, les mêmes séries tiennent sous 520.
      expect(
        planAxisBounds(entree({ type: 'bar', series: [SERIE, SECONDE], yMax: '520' })).scales
      ).toEqual({ y: { max: 520 } });
    });

    it('barres horizontales : y-* borne l’axe des valeurs, qui est l’échelle x', () => {
      const plan = planAxisBounds(
        entree({ type: 'bar', horizontal: true, yMin: '-10', yMax: '40' })
      );
      expect(plan.scales).toEqual({ x: { min: -10, max: 40 } });
      // Relayé sous le nom que DSFR Chart lit pour cette échelle : plus jamais
      // `y-min` vers l'axe des étiquettes (catégories fantômes).
      expect(plan.attrs).toEqual({ 'x-min': '-10', 'x-max': '40' });
      expect(plan.warnings).toEqual([]);
    });

    it('barres horizontales : x-* fait la même chose, et l’emporte si les deux sont écrits', () => {
      const seul = planAxisBounds(entree({ type: 'bar', horizontal: true, xMax: '40' }));
      expect(seul.scales).toEqual({ x: { max: 40 } });
      expect(seul.warnings).toEqual([]);

      const deux = planAxisBounds(
        entree({ type: 'bar', horizontal: true, xMax: '40', yMax: '50' })
      );
      expect(deux.scales).toEqual({ x: { max: 40 } });
      expect(codes(deux)).toEqual(['y-max:doublon-horizontal']);

      const egales = planAxisBounds(
        entree({ type: 'bar', horizontal: true, xMax: '40', yMax: '40' })
      );
      expect(egales.warnings).toEqual([]);
    });

    it('barres + ligne : y-* borne l’axe des BARRES, relayé en y-bar-*', () => {
      const plan = planAxisBounds(
        entree({ type: 'bar-line', series: [SERIE, SECONDE], yMin: '-10', yMax: '37' })
      );
      expect(plan.scales).toEqual({ y: { min: -10, max: 37 } });
      expect(plan.attrs).toEqual({ 'y-bar-min': '-10', 'y-bar-max': '37' });
      expect(plan.warnings).toEqual([]);
    });

    it('barres + ligne : la série de la ligne ne compte pas dans l’étendue des barres', () => {
      // 40 est sous la ligne (510) mais au-dessus des barres (33) : la borne agit.
      const plan = planAxisBounds(
        entree({ type: 'bar-line', series: [SERIE, SECONDE], yMax: '40' })
      );
      expect(plan.scales).toEqual({ y: { max: 40 } });
    });

    it('radar : laissé à chart-radial-scale (aucune borne cartésienne)', () => {
      const plan = planAxisBounds(entree({ type: 'radar', yMin: '0', yMax: '100' }));
      expect(plan).toEqual({ attrs: {}, scales: {}, warnings: [] });
    });
  });

  describe('axe horizontal (x-min / x-max)', () => {
    it('étiquettes numériques : la borne élargit l’axe, exactement', () => {
      const plan = planAxisBounds(
        entree({
          type: 'line',
          labels: ['2020', '2021', '2022', '2023'],
          xMin: '2018',
          xMax: '2030',
        })
      );
      expect(plan.scales).toEqual({ x: { min: 2018, max: 2030 } });
      expect(plan.attrs).toEqual({ 'x-min': '2018', 'x-max': '2030' });
      expect(plan.warnings).toEqual([]);
    });

    it('étiquettes numériques : une borne à l’intérieur des données est ignorée et signalée', () => {
      const plan = planAxisBounds(
        entree({
          type: 'scatter',
          labels: ['2020', '2021', '2022', '2023'],
          xMin: '2021',
          xMax: '2022',
        })
      );
      expect(plan.scales).toEqual({});
      expect(codes(plan)).toEqual(['x-min:masque-des-donnees', 'x-max:masque-des-donnees']);
    });

    it('étiquettes texte : jamais relayé (catégorie fantôme), toujours signalé', () => {
      for (const type of ['line', 'scatter']) {
        const plan = planAxisBounds(entree({ type, xMin: '5', xMax: '40' }));
        expect(plan.attrs).toEqual({});
        expect(plan.scales).toEqual({});
        expect(codes(plan)).toEqual(['x-min:etiquettes-texte', 'x-max:etiquettes-texte']);
      }
    });

    it('barres verticales et barres + ligne : signalé, avec l’attribut qui agit', () => {
      for (const type of ['bar', 'bar-line']) {
        const plan = planAxisBounds(entree({ type, xMin: '5' }));
        expect(plan.attrs).toEqual({});
        expect(codes(plan)).toEqual(['x-min:axe-etiquettes']);
        expect(plan.warnings[0].message).toContain(`type="${type}"`);
        expect(plan.warnings[0].message).toContain('y-min / y-max');
      }
    });

    it('courbe sans donnée encore : ni relais ni avertissement prématuré', () => {
      const plan = planAxisBounds(entree({ type: 'line', labels: [], series: [], xMin: '2018' }));
      expect(plan).toEqual({ attrs: {}, scales: {}, warnings: [] });
    });

    it('radar : signalé, y-min / y-max nommés', () => {
      const plan = planAxisBounds(entree({ type: 'radar', xMin: '0' }));
      expect(codes(plan)).toEqual(['x-min:radar']);
      expect(plan.warnings[0].message).toContain('y-min / y-max');
    });
  });

  it('types sans axe : les quatre bornes sont signalées', () => {
    for (const type of ['pie', 'gauge', 'map', 'map-reg', 'map-aca', 'map-monde']) {
      const plan = planAxisBounds(entree({ type, xMin: '0', xMax: '1', yMin: '0', yMax: '1' }));
      expect(plan.attrs).toEqual({});
      expect(plan.scales).toEqual({});
      expect(codes(plan)).toEqual([
        'x-min:sans-axe',
        'x-max:sans-axe',
        'y-min:sans-axe',
        'y-max:sans-axe',
      ]);
      expect(plan.warnings[0].message).toContain(`type="${type}"`);
    }
  });

  it('valeur non numérique : ignorée et signalée, quel que soit le type', () => {
    const plan = planAxisBounds(entree({ type: 'line', yMin: 'abc' }));
    expect(plan.scales).toEqual({});
    expect(codes(plan)).toEqual(['y-min:non-numerique']);
  });

  it('bornes inversées : les deux sont ignorées', () => {
    const plan = planAxisBounds(entree({ type: 'line', yMin: '-5', yMax: '-10', series: [] }));
    expect(plan.scales).toEqual({});
    expect(codes(plan)).toEqual(['y-min:bornes-inversees']);
  });

  it('le motif d’un avertissement ne dépend pas des données (un seul par composant)', () => {
    const a = planAxisBounds(entree({ type: 'line', yMin: '20' }));
    const b = planAxisBounds(entree({ type: 'line', yMin: '20', series: [[1, 2, 3]] }));
    expect(a.warnings[0].code).toBe(b.warnings[0].code);
    expect(a.warnings[0].message).not.toBe(b.warnings[0].message);
  });

  it('isNumericLabelAxis suit le test de DSFR Chart : la première étiquette décide', () => {
    expect(isNumericLabelAxis(['2020', 'x'])).toBe(true);
    expect(isNumericLabelAxis([2020])).toBe(true);
    expect(isNumericLabelAxis(['1.5'])).toBe(true);
    expect(isNumericLabelAxis(['2020-01'])).toBe(false);
    expect(isNumericLabelAxis(['T1', '2020'])).toBe(false);
    expect(isNumericLabelAxis([''])).toBe(false);
    expect(isNumericLabelAxis([])).toBe(false);
  });
});

describe('chart-axis-bounds — applyAxisBounds', () => {
  function mockChart(partiel: Partial<AxisChartLike> = {}) {
    return {
      options: { scales: { x: {}, y: {} }, transitions: {} },
      scales: { x: { type: 'category' }, y: { type: 'linear' } },
      update: vi.fn(),
      ...partiel,
    } as AxisChartLike & { update: ReturnType<typeof vi.fn> };
  }

  it('pose les bornes dures et redessine par une transition de durée nulle', () => {
    const chart = mockChart();
    expect(applyAxisBounds(chart, { y: { min: 5, max: 37 } })).toBe('changed');
    expect(chart.options?.scales?.y).toEqual({ min: 5, max: 37 });
    // Pas `update('none')` : il laisse courir les animations d'entrée vers la
    // géométrie de l'ancienne échelle (barres décollées de zéro, mesuré).
    expect(chart.update).toHaveBeenCalledTimes(1);
    expect(chart.update).toHaveBeenCalledWith('dsfrDataAxisBounds');
    expect(chart.options?.transitions?.dsfrDataAxisBounds).toEqual({ animation: { duration: 0 } });
  });

  it('idempotent : rien à redessiner quand tout est en place', () => {
    const chart = mockChart();
    applyAxisBounds(chart, { y: { min: 5 } });
    expect(applyAxisBounds(chart, { y: { min: 5 } })).toBe('unchanged');
    expect(chart.update).toHaveBeenCalledTimes(1);
  });

  it('instance pas prête (échelle introuvable) : à retenter', () => {
    expect(applyAxisBounds({}, { y: { min: 5 } })).toBe('pending');
    expect(applyAxisBounds(mockChart(), { yLine: { min: 5 } })).toBe('pending');
  });

  it('ne borne jamais un axe d’étiquettes, même si le plan s’est trompé', () => {
    const chart = mockChart();
    expect(applyAxisBounds(chart, { x: { min: 1, max: 2 } })).toBe('unchanged');
    expect(chart.options?.scales?.x).toEqual({});
    expect(chart.update).not.toHaveBeenCalled();
  });

  it('sans options.transitions atteignable : repli sur update("none")', () => {
    const chart = mockChart({ options: { scales: { y: {} } } });
    applyAxisBounds(chart, { y: { max: 40 } });
    expect(chart.update).toHaveBeenCalledWith('none');
  });
});
