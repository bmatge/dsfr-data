import { describe, it, expect } from 'vitest';
import {
  parseTargets,
  isTargetsChartType,
  isNativeLinearAxis,
  padSeriesForTargets,
  computeTargetGeometries,
  buildTargetsOverlaySvg,
  buildTargetTooltip,
  buildTargetsLegend,
  parseTargetsLegend,
  formatTargetValue,
  targetsAriaSummary,
  DEFAULT_TARGETS_LEGEND_HISTORICAL,
  DEFAULT_TARGETS_LEGEND_PROJECTED,
  type ChartWithDatasetsLike,
  type TargetsLayout,
} from '@/utils/chart-targets.js';
import { DEFAULT_REF_COLOR } from '@/utils/chart-reference-lines.js';

// --- Chart.js mock (duck-typé), repris de chart-reference-lines.test.ts et
// étendu avec `datasets` (une série finissant par null) ------------------------

function mockChart(
  canvas: HTMLCanvasElement,
  overrides: Partial<ChartWithDatasetsLike> = {}
): ChartWithDatasetsLike {
  return {
    canvas,
    chartArea: { left: 50, right: 450, top: 20, bottom: 320, width: 400, height: 300 },
    data: {
      labels: ['2023', '2024', '2025', '2030'],
      datasets: [
        { label: 'Pétrole', borderColor: '#000091', data: [30, 28, 27, null] },
        { label: 'Gaz naturel', borderColor: '#e1000f', data: [22, 21, null, null] },
      ],
    },
    scales: {
      // catégorielle : pixel par index réparti sur [left, right]
      x: {
        getPixelForValue: (_v: unknown, i?: number) => {
          if (typeof i !== 'number' || !Number.isFinite(i)) return NaN;
          return 50 + (i / 3) * 400; // 4 labels → i ∈ 0..3
        },
      },
      // linéaire : 0..40 → bottom(320)..top(20)
      y: {
        getPixelForValue: (v: unknown) => {
          const n = Number(v);
          if (!Number.isFinite(n)) return NaN;
          return 320 - (n / 40) * 300;
        },
      },
    },
    ...overrides,
  };
}

const canvas = () => document.createElement('canvas');

// --- parseTargets ---------------------------------------------------------------

describe('parseTargets', () => {
  it('vide → pas d erreur, pas de cibles', () => {
    expect(parseTargets('')).toEqual({ targets: [], error: null });
    expect(parseTargets('   ')).toEqual({ targets: [], error: null });
  });

  it('parse un tableau valide avec defaults', () => {
    const { targets, error } = parseTargets(
      '[{"x":"2030","value":26,"label":"Cible 2030 : 26 %"},{"x":2035,"value":10,"series":1,"color":"#123456"}]'
    );
    expect(error).toBeNull();
    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({ x: '2030', value: 26, label: 'Cible 2030 : 26 %' });
    expect(targets[1]).toMatchObject({ x: 2035, value: 10, series: 1, color: '#123456' });
  });

  it('JSON invalide → erreur', () => {
    const r = parseTargets('[{x:2030}]');
    expect(r.targets).toEqual([]);
    expect(r.error).toMatch(/JSON invalide/);
  });

  it('pas un tableau → erreur', () => {
    const r = parseTargets('{"x":2030,"value":26}');
    expect(r.targets).toEqual([]);
    expect(r.error).toMatch(/tableau JSON/);
  });

  it('items invalides ignorés, cibles valides conservées', () => {
    const { targets, error } = parseTargets(
      '[{"x":"","value":26},{"value":26},{"x":2030},{"x":2030,"value":"26"},{"x":2030,"value":26},42,null]'
    );
    expect(error).toBeNull();
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ x: 2030, value: 26 });
  });

  it('aucun item valide dans un tableau non vide → erreur', () => {
    const r = parseTargets('[{"x":2030},{"value":26}]');
    expect(r.targets).toEqual([]);
    expect(r.error).toMatch(/aucune cible valide/);
  });
});

// --- isTargetsChartType ----------------------------------------------------------

describe('isTargetsChartType', () => {
  it('line et bar-line uniquement', () => {
    expect(isTargetsChartType('line')).toBe(true);
    expect(isTargetsChartType('bar-line')).toBe(true);
    expect(isTargetsChartType('bar')).toBe(false);
    expect(isTargetsChartType('scatter')).toBe(false);
    expect(isTargetsChartType('pie')).toBe(false);
    expect(isTargetsChartType('gauge')).toBe(false);
  });
});

// --- isNativeLinearAxis ------------------------------------------------------------

describe('isNativeLinearAxis', () => {
  it('labels numériques → linéaire (heuristique native)', () => {
    expect(isNativeLinearAxis(['2023', '2024'])).toBe(true);
    expect(isNativeLinearAxis([2023, 2024])).toBe(true);
  });

  it('labels catégoriels → non linéaire', () => {
    expect(isNativeLinearAxis(['Jan', 'Fev'])).toBe(false);
    expect(isNativeLinearAxis([])).toBe(false);
  });
});

// --- padSeriesForTargets --------------------------------------------------------------

describe('padSeriesForTargets', () => {
  it('ajoute les échéances absentes et padde chaque série avec null', () => {
    const { labels, series, added } = padSeriesForTargets(
      ['2023', '2024', '2025'],
      [
        [30, 28, 27],
        [22, 21, 20],
      ],
      [2030]
    );
    expect(labels).toEqual(['2023', '2024', '2025', 2030]);
    expect(series).toEqual([
      [30, 28, 27, null],
      [22, 21, 20, null],
    ]);
    expect(added).toEqual([2030]);
  });

  it('pas de doublon si l échéance existe déjà (comparaison String)', () => {
    const { labels, series, added } = padSeriesForTargets(['2023', '2030'], [[1, 2]], [2030]);
    expect(labels).toEqual(['2023', '2030']);
    expect(series).toEqual([[1, 2]]);
    expect(added).toEqual([]);
  });

  it('déduplique et trie numériquement les échéances ajoutées', () => {
    const { labels, added } = padSeriesForTargets(['2023'], [[1]], [2035, 2030, '2035', 2030]);
    expect(added).toEqual([2030, 2035]);
    expect(labels).toEqual(['2023', 2030, 2035]);
  });

  it('échéances non numériques laissées en ordre de déclaration', () => {
    const { added } = padSeriesForTargets(['Jan'], [[1]], ['Zeta', 'Alpha']);
    expect(added).toEqual(['Zeta', 'Alpha']);
  });

  it('est pur : ne mute pas les entrées', () => {
    const labels = ['2023'];
    const series = [[1]];
    padSeriesForTargets(labels, series, [2030]);
    expect(labels).toEqual(['2023']);
    expect(series).toEqual([[1]]);
  });
});

// --- computeTargetGeometries -------------------------------------------------------------

describe('computeTargetGeometries', () => {
  it('place le losange au pixel de l échéance et de la valeur', () => {
    const chart = mockChart(canvas());
    const { markers } = computeTargetGeometries(chart, [{ x: '2030', value: 26 }]);
    expect(markers).toHaveLength(1);
    expect(markers[0].x).toBeCloseTo(450); // index 3 → right
    expect(markers[0].y).toBeCloseTo(320 - (26 / 40) * 300);
  });

  it('trajectoire depuis le dernier point non-null de la série', () => {
    const chart = mockChart(canvas());
    const { markers } = computeTargetGeometries(chart, [{ x: '2030', value: 26 }]);
    // Pétrole (défaut) : dernier non-null à l'index 2 (2025, 27)
    expect(markers[0].fromX).toBeCloseTo(50 + (2 / 3) * 400);
    expect(markers[0].fromY).toBeCloseTo(320 - (27 / 40) * 300);
  });

  it('hérite la couleur de la série, override par la cible', () => {
    const chart = mockChart(canvas());
    const { markers } = computeTargetGeometries(chart, [
      { x: '2030', value: 26 },
      { x: '2030', value: 12, series: 1, color: '#00ff00' },
    ]);
    expect(markers[0].color).toBe('#000091');
    expect(markers[1].color).toBe('#00ff00');
  });

  it('résout la série par nom et par index', () => {
    const chart = mockChart(canvas());
    const { markers } = computeTargetGeometries(chart, [
      { x: '2030', value: 12, series: 'Gaz naturel' },
      { x: '2030', value: 26, series: 0 },
    ]);
    expect(markers[0].seriesName).toBe('Gaz naturel');
    expect(markers[0].seriesIndex).toBe(1);
    // Gaz naturel : dernier non-null à l'index 1 (2024, 21)
    expect(markers[0].fromX).toBeCloseTo(50 + (1 / 3) * 400);
    expect(markers[1].seriesName).toBe('Pétrole');
  });

  it('série introuvable → cible ignorée', () => {
    const chart = mockChart(canvas());
    const { markers } = computeTargetGeometries(chart, [
      { x: '2030', value: 26, series: 'Charbon' },
      { x: '2030', value: 26, series: 99 },
    ]);
    expect(markers).toEqual([]);
  });

  it('fallback Number(value) sur échelle linéaire quand le label est absent', () => {
    const chart = mockChart(canvas(), {
      data: {
        labels: ['2023', '2024', '2025'],
        datasets: [{ label: 'Pétrole', borderColor: '#000091', data: [30, 28, 27] }],
      },
      scales: {
        // linéaire en x : 2020..2032 → left..right
        x: {
          getPixelForValue: (v: unknown, i?: number) => {
            if (typeof i === 'number') return 50 + (i / 2) * 400;
            const n = Number(v);
            if (!Number.isFinite(n)) return NaN;
            return 50 + ((n - 2020) / 12) * 400;
          },
        },
        y: {
          getPixelForValue: (v: unknown) => 320 - (Number(v) / 40) * 300,
        },
      },
    });
    const { markers } = computeTargetGeometries(chart, [{ x: 2030, value: 26 }]);
    expect(markers).toHaveLength(1);
    expect(markers[0].x).toBeCloseTo(50 + (10 / 12) * 400);
  });

  it('boundary = pixel du dernier index réel toutes séries confondues', () => {
    const chart = mockChart(canvas());
    const { boundary } = computeTargetGeometries(chart, [{ x: '2030', value: 26 }]);
    // Pétrole va jusqu'à l'index 2, Gaz jusqu'à 1 → max = 2 (2025)
    expect(boundary).not.toBeNull();
    expect(boundary!.x).toBeCloseTo(50 + (2 / 3) * 400);
    expect(boundary!.top).toBe(20);
    expect(boundary!.bottom).toBe(320);
    expect(boundary!.right).toBe(450);
  });

  it('cible hors chartArea ignorée', () => {
    const chart = mockChart(canvas());
    const { markers } = computeTargetGeometries(chart, [{ x: '2030', value: 999 }]);
    expect(markers).toEqual([]);
  });

  it('résout la série par nom via seriesNames quand les datasets n ont pas de label (dsfr-chart)', () => {
    const chart = mockChart(canvas(), {
      data: {
        labels: ['2023', '2024', '2025', '2030'],
        datasets: [
          { borderColor: '#000091', data: [30, 28, 27, null] },
          { borderColor: '#e1000f', data: [22, 21, null, null] },
        ],
      },
    });
    const { markers } = computeTargetGeometries(
      chart,
      [{ x: '2030', value: 12, series: 'Gaz naturel' }],
      ['Pétrole', 'Gaz naturel']
    );
    expect(markers).toHaveLength(1);
    expect(markers[0].seriesIndex).toBe(1);
    expect(markers[0].seriesName).toBe('Gaz naturel');
  });

  it('utilise l échelle du dataset via yAxisID (bar-line : yLine)', () => {
    const chart = mockChart(canvas(), {
      data: {
        labels: ['2023', '2024', '2025', '2030'],
        datasets: [
          { borderColor: '#000091', data: [10, 12, 14, null] }, // barres → y
          { borderColor: '#e1000f', data: [20, 22, 24, null], yAxisID: 'yLine' },
        ],
      },
      scales: {
        x: {
          getPixelForValue: (_v: unknown, i?: number) =>
            typeof i === 'number' ? 50 + (i / 3) * 400 : NaN,
        },
        // y (barres) : 0..15 → bottom..top — 30 serait TRÈS au-dessus
        y: { getPixelForValue: (v: unknown) => 320 - (Number(v) / 15) * 300 },
        // yLine : 0..30 → bottom..top
        yLine: { getPixelForValue: (v: unknown) => 320 - (Number(v) / 30) * 300 },
      },
    });
    const { markers } = computeTargetGeometries(chart, [{ x: '2030', value: 30, series: 1 }]);
    expect(markers).toHaveLength(1);
    // 30 sur yLine → top (20) ; sur y il serait à -280 (hors zone, ignoré)
    expect(markers[0].y).toBeCloseTo(20);
  });

  it('sans chartArea → layout vide', () => {
    const chart = mockChart(canvas(), { chartArea: undefined });
    expect(computeTargetGeometries(chart, [{ x: '2030', value: 26 }])).toEqual({
      markers: [],
      boundary: null,
    });
  });

  it('anti-collision : deux étiquettes de la même échéance ne se chevauchent pas', () => {
    const chart = mockChart(canvas());
    const { markers } = computeTargetGeometries(chart, [
      { x: '2030', value: 26, label: 'A' },
      { x: '2030', value: 25, label: 'B' }, // valeurs proches → pastilles en conflit
    ]);
    expect(markers).toHaveLength(2);
    const ys = markers.map((m) => m.labelY).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(18); // LABEL_HEIGHT
  });
});

// --- buildTargetsOverlaySvg ------------------------------------------------------------------

function sampleLayout(): TargetsLayout {
  return {
    markers: [
      {
        x: 450,
        y: 125,
        fromX: 316,
        fromY: 117.5,
        color: '#000091',
        label: 'Cible 2030 : 26 %',
        labelX: 450,
        labelY: 109,
        targetX: '2030',
        seriesName: 'Pétrole',
        seriesIndex: 0,
        value: 26,
      },
    ],
    boundary: { x: 316, top: 20, bottom: 320, right: 450 },
  };
}

describe('buildTargetsOverlaySvg', () => {
  it('SVG racine aria-hidden et pointer-events none', () => {
    const svg = buildTargetsOverlaySvg(sampleLayout(), 500, 340);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.style.pointerEvents).toBe('none');
    expect(svg.getAttribute('class')).toBe('dsfr-data-chart__targets');
  });

  it('losange : pointer-events auto + data-target-x, un polygon par marker', () => {
    const svg = buildTargetsOverlaySvg(sampleLayout(), 500, 340);
    const polygons = svg.querySelectorAll('polygon.dsfr-data-chart__target-marker');
    expect(polygons).toHaveLength(1);
    const marker = polygons[0] as SVGPolygonElement;
    expect(marker.style.pointerEvents).toBe('auto');
    expect(marker.getAttribute('data-target-x')).toBe('2030');
    expect(marker.getAttribute('fill')).toBe('#ffffff');
    expect(marker.getAttribute('stroke')).toBe('#000091');
  });

  it('trajectoire pointillée avec la couleur de la série', () => {
    const svg = buildTargetsOverlaySvg(sampleLayout(), 500, 340);
    const path = svg.querySelector('line.dsfr-data-chart__target-path');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('stroke-dasharray')).toBe('5,4');
    expect(path!.getAttribute('stroke')).toBe('#000091');
  });

  it('pas de trajectoire quand fromX/fromY sont null', () => {
    const layout = sampleLayout();
    layout.markers[0].fromX = null;
    layout.markers[0].fromY = null;
    const svg = buildTargetsOverlaySvg(layout, 500, 340);
    expect(svg.querySelector('.dsfr-data-chart__target-path')).toBeNull();
  });

  it('zone on : rect translucide + frontière pointillée', () => {
    const svg = buildTargetsOverlaySvg(sampleLayout(), 500, 340, { zone: true });
    const zone = svg.querySelector('rect.dsfr-data-chart__targets-zone');
    expect(zone).not.toBeNull();
    expect(zone!.getAttribute('opacity')).toBe('0.08');
    expect(Number(zone!.getAttribute('x'))).toBeCloseTo(316);
    expect(Number(zone!.getAttribute('width'))).toBeCloseTo(450 - 316);
    const boundary = svg.querySelector('line.dsfr-data-chart__targets-boundary');
    expect(boundary).not.toBeNull();
    expect(boundary!.getAttribute('stroke-dasharray')).toBe('4,4');
  });

  it('zone off : ni rect ni frontière', () => {
    const svg = buildTargetsOverlaySvg(sampleLayout(), 500, 340, { zone: false });
    expect(svg.querySelector('.dsfr-data-chart__targets-zone')).toBeNull();
    expect(svg.querySelector('.dsfr-data-chart__targets-boundary')).toBeNull();
  });

  it('pastille conditionnelle au label', () => {
    const withLabel = buildTargetsOverlaySvg(sampleLayout(), 500, 340);
    expect(withLabel.querySelector('.dsfr-data-chart__target-label')).not.toBeNull();
    expect(withLabel.querySelector('.dsfr-data-chart__target-label text')!.textContent).toBe(
      'Cible 2030 : 26 %'
    );

    const layout = sampleLayout();
    delete layout.markers[0].label;
    const withoutLabel = buildTargetsOverlaySvg(layout, 500, 340);
    expect(withoutLabel.querySelector('.dsfr-data-chart__target-label')).toBeNull();
  });
});

// --- Builders tooltip / légende ------------------------------------------------------------------

describe('buildTargetTooltip', () => {
  it('titre + une ligne par série avec pastille de couleur', () => {
    const tooltip = buildTargetTooltip('Cible 2030', [
      { color: '#000091', name: 'Pétrole', value: '26 %' },
      { color: '#e1000f', name: 'Gaz naturel', value: '12 %' },
    ]);
    expect(tooltip.className).toBe('dsfr-data-chart__target-tooltip');
    expect(tooltip.getAttribute('aria-hidden')).toBe('true');
    expect(tooltip.querySelector('strong')!.textContent).toBe('Cible 2030');
    const rows = tooltip.querySelectorAll('div');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Pétrole : 26 %');
    expect(rows[1].textContent).toContain('Gaz naturel : 12 %');
  });
});

describe('buildTargetsLegend', () => {
  it('deux entrées aria-hidden avec les libellés fournis', () => {
    const legend = buildTargetsLegend(['Historique', 'Projeté']);
    expect(legend.className).toBe('dsfr-data-chart__targets-legend');
    expect(legend.getAttribute('aria-hidden')).toBe('true');
    expect(legend.textContent).toContain('Historique');
    expect(legend.textContent).toContain('Projeté');
  });
});

describe('parseTargetsLegend', () => {
  it('vide → visible avec libellés par défaut', () => {
    expect(parseTargetsLegend('')).toEqual({
      show: true,
      labels: [DEFAULT_TARGETS_LEGEND_HISTORICAL, DEFAULT_TARGETS_LEGEND_PROJECTED],
    });
  });

  it('off → masquée', () => {
    expect(parseTargetsLegend('off').show).toBe(false);
  });

  it('tableau JSON de deux strings → libellés custom', () => {
    expect(parseTargetsLegend('["Réalisé","À venir"]')).toEqual({
      show: true,
      labels: ['Réalisé', 'À venir'],
    });
  });

  it('JSON invalide → repli sur les défauts', () => {
    expect(parseTargetsLegend('[nope')).toEqual({
      show: true,
      labels: [DEFAULT_TARGETS_LEGEND_HISTORICAL, DEFAULT_TARGETS_LEGEND_PROJECTED],
    });
  });
});

describe('formatTargetValue', () => {
  it('entier → format nombre français', () => {
    // Intl fr-FR utilise l'espace fine insécable comme séparateur de milliers
    expect(formatTargetValue(37849).replace(/[\u202f\u00a0]/g, ' ')).toBe('37 849');
  });

  it('décimal → virgule française', () => {
    expect(formatTargetValue(26.5)).toBe('26,5');
  });

  it('unité collée par espace insécable', () => {
    expect(formatTargetValue(26, '%')).toBe('26\u00a0%');
  });
});

describe('targetsAriaSummary', () => {
  it('label prioritaire, sinon x et valeur', () => {
    const summary = targetsAriaSummary([
      { x: '2030', value: 26, label: 'Cible 2030 : 26 %' },
      { x: 2035, value: 10 },
    ]);
    expect(summary).toBe('Cible : Cible 2030 : 26 %. Cible 2035 : 10');
  });
});

// --- Non-régression : la couleur par défaut vient bien de chart-reference-lines ----

describe('couleur par défaut', () => {
  it('sans couleur de cible ni de série → rouge DSFR', () => {
    const chart = mockChart(canvas(), {
      data: {
        labels: ['2023', '2030'],
        datasets: [{ label: 'S', data: [1, null] }],
      },
    });
    const { markers } = computeTargetGeometries(chart, [{ x: '2030', value: 26 }]);
    expect(markers[0].color).toBe(DEFAULT_REF_COLOR);
  });
});
