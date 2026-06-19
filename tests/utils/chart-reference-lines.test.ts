import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  parseReferenceLines,
  isCartesianChartType,
  resolveChartInstance,
  computeReferenceGeometries,
  buildReferenceOverlaySvg,
  referenceLinesAriaSummary,
  DEFAULT_REF_COLOR,
  type ChartLike,
} from '@/utils/chart-reference-lines.js';

// --- Chart.js mock (duck-typed) ----------------------------------------------

function mockChart(canvas: HTMLCanvasElement, overrides: Partial<ChartLike> = {}): ChartLike {
  return {
    canvas,
    chartArea: { left: 50, right: 450, top: 20, bottom: 320, width: 400, height: 300 },
    data: { labels: ['Jan', 'Fev', 'Mar', 'Avr'] },
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

describe('parseReferenceLines', () => {
  it('vide → pas d erreur, pas de lignes', () => {
    expect(parseReferenceLines('')).toEqual({ lines: [], error: null });
    expect(parseReferenceLines('   ')).toEqual({ lines: [], error: null });
  });

  it('parse un tableau valide avec defaults', () => {
    const { lines, error } = parseReferenceLines(
      '[{"axis":"x","value":"Fev","label":"Lancement"},{"axis":"y","value":3000}]'
    );
    expect(error).toBeNull();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ axis: 'x', value: 'Fev', label: 'Lancement' });
    expect(lines[1]).toMatchObject({ axis: 'y', value: 3000 });
  });

  it('JSON invalide → erreur', () => {
    const r = parseReferenceLines('[{axis:x}]');
    expect(r.lines).toEqual([]);
    expect(r.error).toMatch(/JSON invalide/);
  });

  it('pas un tableau → erreur', () => {
    expect(parseReferenceLines('{"axis":"x","value":1}').error).toMatch(/tableau/);
  });

  it('ignore les items invalides (axis manquant, value vide)', () => {
    const { lines, error } = parseReferenceLines(
      '[{"axis":"z","value":1},{"axis":"x"},{"axis":"x","value":""},{"axis":"y","value":5}]'
    );
    expect(error).toBeNull();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ axis: 'y', value: 5 });
  });

  it('tableau non vide mais 100% invalide → erreur', () => {
    expect(parseReferenceLines('[{"axis":"z"}]').error).toMatch(/aucune ligne valide/);
  });

  it('conserve color/dash/position quand fournis', () => {
    const { lines } = parseReferenceLines(
      '[{"axis":"x","value":"Mar","color":"#000","dash":false,"position":"end"}]'
    );
    expect(lines[0]).toMatchObject({ color: '#000', dash: false, position: 'end' });
  });

  it('value NaN/Infinity rejetée', () => {
    // JSON ne supporte pas NaN/Infinity littéral ; on teste null et booléen
    const { lines } = parseReferenceLines('[{"axis":"y","value":null},{"axis":"y","value":true}]');
    expect(lines).toHaveLength(0);
  });
});

describe('isCartesianChartType', () => {
  it('cartésiens supportés', () => {
    for (const t of ['line', 'bar', 'bar-line', 'scatter']) {
      expect(isCartesianChartType(t)).toBe(true);
    }
  });
  it('non cartésiens rejetés', () => {
    for (const t of ['pie', 'gauge', 'radar', 'map', 'map-reg']) {
      expect(isCartesianChartType(t)).toBe(false);
    }
  });
});

describe('resolveChartInstance', () => {
  afterEach(() => {
    delete (window as Record<string, unknown>).Chart;
    vi.restoreAllMocks();
  });

  function fakeEl(instance: unknown): Element {
    return { _instance: instance } as unknown as Element;
  }

  it('null si element ou canvas manquant', () => {
    const canvas = document.createElement('canvas');
    expect(resolveChartInstance(null, canvas)).toBeNull();
    expect(resolveChartInstance(fakeEl({}), null)).toBeNull();
  });

  it('trouve l instance via _instance.proxy.chart (accès direct)', () => {
    const canvas = document.createElement('canvas');
    const chart = mockChart(canvas);
    const el = fakeEl({ proxy: { chart } });
    expect(resolveChartInstance(el, canvas)).toBe(chart);
  });

  it('fallback _instance.ctx.chart', () => {
    const canvas = document.createElement('canvas');
    const chart = mockChart(canvas);
    const el = fakeEl({ ctx: { chart } });
    expect(resolveChartInstance(el, canvas)).toBe(chart);
  });

  it('déréférence un ref Vue ({ __v_isRef, value })', () => {
    const canvas = document.createElement('canvas');
    const chart = mockChart(canvas);
    const el = fakeEl({ proxy: { chart: { __v_isRef: true, value: chart } } });
    expect(resolveChartInstance(el, canvas)).toBe(chart);
  });

  it('rejette un objet dont le canvas ne correspond pas', () => {
    const canvas = document.createElement('canvas');
    const other = document.createElement('canvas');
    const chart = mockChart(other);
    expect(resolveChartInstance(fakeEl({ proxy: { chart } }), canvas)).toBeNull();
  });

  it('utilise window.Chart.getChart si présent et valide', () => {
    const canvas = document.createElement('canvas');
    const chart = mockChart(canvas);
    (window as Record<string, unknown>).Chart = { getChart: () => chart };
    expect(resolveChartInstance(fakeEl({}), canvas)).toBe(chart);
  });

  it('null si rien ne matche', () => {
    const canvas = document.createElement('canvas');
    expect(resolveChartInstance(fakeEl({ proxy: {}, ctx: {} }), canvas)).toBeNull();
  });
});

describe('computeReferenceGeometries', () => {
  const canvas = document.createElement('canvas');

  it('ligne verticale x sur une catégorie (index résolu via data.labels)', () => {
    const chart = mockChart(canvas);
    const [g] = computeReferenceGeometries(chart, [{ axis: 'x', value: 'Fev', label: 'L' }]);
    // index 1 → 50 + (1/3)*400 ≈ 183.33
    expect(g.axis).toBe('x');
    expect(g.x1).toBeCloseTo(183.33, 1);
    expect(g.x1).toBe(g.x2);
    expect(g.y1).toBe(20);
    expect(g.y2).toBe(320);
    expect(g.color).toBe(DEFAULT_REF_COLOR);
    expect(g.dash).toBe(true);
  });

  it('ligne horizontale y sur un seuil', () => {
    const chart = mockChart(canvas);
    const [g] = computeReferenceGeometries(chart, [{ axis: 'y', value: 20 }]);
    // 320 - (20/40)*300 = 170
    expect(g.axis).toBe('y');
    expect(g.y1).toBe(170);
    expect(g.y1).toBe(g.y2);
    expect(g.x1).toBe(50);
    expect(g.x2).toBe(450);
    expect(g.textAnchor).toBe('end'); // défaut côté droit
  });

  it('position start déplace l ancre du libellé y à gauche', () => {
    const chart = mockChart(canvas);
    const [g] = computeReferenceGeometries(chart, [{ axis: 'y', value: 20, position: 'start' }]);
    expect(g.textAnchor).toBe('start');
    expect(g.labelX).toBe(50);
  });

  it('catégorie inconnue → ignorée', () => {
    const chart = mockChart(canvas);
    expect(computeReferenceGeometries(chart, [{ axis: 'x', value: 'Inconnu' }])).toHaveLength(0);
  });

  it('valeur y hors zone → ignorée', () => {
    const chart = mockChart(canvas);
    // 3000 → bien au-dessus du top → skip
    expect(computeReferenceGeometries(chart, [{ axis: 'y', value: 3000 }])).toHaveLength(0);
  });

  it('respecte color et dash=false', () => {
    const chart = mockChart(canvas);
    const [g] = computeReferenceGeometries(chart, [
      { axis: 'y', value: 20, color: '#0a0', dash: false },
    ]);
    expect(g.color).toBe('#0a0');
    expect(g.dash).toBe(false);
  });

  it('sans chartArea → vide', () => {
    const chart = mockChart(canvas, { chartArea: undefined });
    expect(computeReferenceGeometries(chart, [{ axis: 'y', value: 20 }])).toEqual([]);
  });
});

describe('buildReferenceOverlaySvg', () => {
  const canvas = document.createElement('canvas');

  it('produit un svg aria-hidden, pointer-events none, une <line> par géométrie', () => {
    const chart = mockChart(canvas);
    const geos = computeReferenceGeometries(chart, [
      { axis: 'x', value: 'Fev', label: 'Lancement' },
      { axis: 'y', value: 20 },
    ]);
    const svg = buildReferenceOverlaySvg(geos, 500, 340);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.style.pointerEvents).toBe('none');
    expect(svg.querySelectorAll('line')).toHaveLength(2);
    // une seule pastille (seule la 1re a un label)
    expect(svg.querySelectorAll('.dsfr-data-chart__refline-label')).toHaveLength(1);
    const text = svg.querySelector('text');
    expect(text?.textContent).toBe('Lancement');
  });

  it('applique stroke-dasharray seulement si dash', () => {
    const chart = mockChart(canvas);
    const geos = computeReferenceGeometries(chart, [
      { axis: 'y', value: 20, dash: true },
      { axis: 'y', value: 10, dash: false },
    ]);
    const svg = buildReferenceOverlaySvg(geos, 500, 340);
    const lines = svg.querySelectorAll('line');
    expect(lines[0].getAttribute('stroke-dasharray')).toBe('5,4');
    expect(lines[1].getAttribute('stroke-dasharray')).toBeNull();
  });
});

describe('referenceLinesAriaSummary', () => {
  it('résume les repères pour les lecteurs d écran', () => {
    const s = referenceLinesAriaSummary([
      { axis: 'x', value: '2026-02', label: 'Lancement du plan' },
      { axis: 'y', value: 3000, label: 'Objectif' },
    ]);
    expect(s).toContain('Lancement du plan');
    expect(s).toContain('2026-02');
    expect(s).toContain('Objectif');
    expect(s).toContain('3000');
  });
});
