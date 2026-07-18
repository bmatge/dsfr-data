import { describe, it, expect, vi } from 'vitest';
import {
  computeRadialScaleBounds,
  applyRadialScaleBounds,
  isRadialChartType,
  type RadialChartLike,
} from '@/utils/chart-radial-scale.js';

// --- Chart.js mock (duck-typed) ----------------------------------------------

function mockRadarChart(overrides: Partial<RadialChartLike> = {}): RadialChartLike & {
  update: ReturnType<typeof vi.fn>;
} {
  return {
    options: { scales: { r: {} } },
    update: vi.fn(),
    ...overrides,
  } as RadialChartLike & { update: ReturnType<typeof vi.fn> };
}

describe('chart-radial-scale', () => {
  describe('isRadialChartType', () => {
    it('accepte radar uniquement', () => {
      expect(isRadialChartType('radar')).toBe(true);
      expect(isRadialChartType('line')).toBe(false);
      expect(isRadialChartType('bar')).toBe(false);
      expect(isRadialChartType('pie')).toBe(false);
      expect(isRadialChartType('')).toBe(false);
    });
  });

  describe('computeRadialScaleBounds', () => {
    it('retourne null sans aucune borne', () => {
      expect(computeRadialScaleBounds('', '')).toBeNull();
      expect(computeRadialScaleBounds('  ', '')).toBeNull();
    });

    it('retourne null pour des valeurs non numériques', () => {
      expect(computeRadialScaleBounds('abc', 'xyz')).toBeNull();
    });

    it('calcule min et max entiers avec stepSize 1 (amplitude <= 10)', () => {
      expect(computeRadialScaleBounds('0', '4')).toEqual({ min: 0, max: 4, stepSize: 1 });
      expect(computeRadialScaleBounds('0', '10')).toEqual({ min: 0, max: 10, stepSize: 1 });
      expect(computeRadialScaleBounds('-5', '5')).toEqual({ min: -5, max: 5, stepSize: 1 });
    });

    it('pas de stepSize si amplitude > 10', () => {
      expect(computeRadialScaleBounds('0', '100')).toEqual({ min: 0, max: 100 });
    });

    it('pas de stepSize pour des bornes non entières', () => {
      expect(computeRadialScaleBounds('0.5', '4')).toEqual({ min: 0.5, max: 4 });
      expect(computeRadialScaleBounds('0', '4.5')).toEqual({ min: 0, max: 4.5 });
    });

    it('pas de stepSize avec une seule borne', () => {
      expect(computeRadialScaleBounds('0', '')).toEqual({ min: 0 });
      expect(computeRadialScaleBounds('', '4')).toEqual({ max: 4 });
    });

    it('pas de stepSize si amplitude nulle ou négative', () => {
      expect(computeRadialScaleBounds('4', '4')).toEqual({ min: 4, max: 4 });
      expect(computeRadialScaleBounds('5', '2')).toEqual({ min: 5, max: 2 });
    });

    it('borne partiellement invalide : seule la valide est conservée', () => {
      expect(computeRadialScaleBounds('abc', '4')).toEqual({ max: 4 });
    });
  });

  describe('applyRadialScaleBounds', () => {
    it('pose min, max et stepSize sur scales.r puis update("none")', () => {
      const chart = mockRadarChart();
      const ok = applyRadialScaleBounds(chart, { min: 0, max: 4, stepSize: 1 });
      expect(ok).toBe(true);
      expect(chart.options!.scales!.r).toEqual({ min: 0, max: 4, ticks: { stepSize: 1 } });
      expect(chart.update).toHaveBeenCalledWith('none');
    });

    it('pose seulement les bornes fournies (pas de stepSize)', () => {
      const chart = mockRadarChart();
      applyRadialScaleBounds(chart, { max: 4.5 });
      expect(chart.options!.scales!.r).toEqual({ max: 4.5 });
      expect(chart.update).toHaveBeenCalledWith('none');
    });

    it('préserve les ticks existants (display: false upstream)', () => {
      const chart = mockRadarChart({
        options: { scales: { r: { ticks: { display: false } as never } } },
      });
      applyRadialScaleBounds(chart, { min: 0, max: 4, stepSize: 1 });
      expect(chart.options!.scales!.r).toEqual({
        min: 0,
        max: 4,
        ticks: { display: false, stepSize: 1 },
      });
    });

    it('idempotent : pas de update() si rien ne change', () => {
      const chart = mockRadarChart({
        options: { scales: { r: { min: 0, max: 4, ticks: { stepSize: 1 } } } },
      });
      const ok = applyRadialScaleBounds(chart, { min: 0, max: 4, stepSize: 1 });
      expect(ok).toBe(true);
      expect(chart.update).not.toHaveBeenCalled();
    });

    it('retourne false si scales.r est introuvable (instance pas prête)', () => {
      expect(applyRadialScaleBounds({}, { min: 0 })).toBe(false);
      expect(applyRadialScaleBounds({ options: {} }, { min: 0 })).toBe(false);
      expect(applyRadialScaleBounds({ options: { scales: {} } }, { min: 0 })).toBe(false);
    });
  });
});
