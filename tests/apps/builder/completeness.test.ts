import { describe, it, expect } from 'vitest';
import { getCompleteness, state } from '../../../apps/builder/src/state';
import type { BuilderState, ChartType } from '../../../apps/builder/src/state';

// Deep-clone the singleton so each test gets a fresh canvas without polluting
// the app-level state used elsewhere in the suite.
function baseState(): BuilderState {
  return JSON.parse(JSON.stringify(state));
}

function withFields(s: BuilderState): BuilderState {
  s.fields = [
    { name: 'region', type: 'string', sample: 'Île-de-France' },
    { name: 'population', type: 'number', sample: 12000 },
    { name: 'code', type: 'string', sample: '75' },
  ];
  return s;
}

describe('getCompleteness', () => {
  describe('empty state', () => {
    it('reports all gates as incomplete and lists both missing', () => {
      const s = baseState();
      s.fields = [];
      s.chartType = '' as ChartType;
      const c = getCompleteness(s);
      expect(c.source).toBe(false);
      expect(c.type).toBe(false);
      expect(c.config).toBe(false);
      expect(c.generate).toBe(false);
      expect(c.missing).toContain('une source de données');
      expect(c.missing).toContain('un type de graphique');
    });
  });

  describe('after loading a source', () => {
    it('unlocks `source` and keeps `config` blocked until fields are picked', () => {
      const s = withFields(baseState());
      s.chartType = 'bar';
      s.labelField = '';
      s.valueField = '';
      const c = getCompleteness(s);
      expect(c.source).toBe(true);
      expect(c.type).toBe(true);
      expect(c.config).toBe(false);
      expect(c.missing).toEqual(['le champ catégorie (axe X)', 'le champ numérique (axe Y)']);
    });
  });

  describe('per chart-type config rules', () => {
    it('bar/line/pie/doughnut/horizontalBar/radar/scatter require labelField + valueField', () => {
      for (const t of [
        'bar',
        'line',
        'pie',
        'doughnut',
        'horizontalBar',
        'radar',
        'scatter',
      ] as const) {
        const s = withFields(baseState());
        s.chartType = t;
        s.labelField = 'region';
        s.valueField = 'population';
        expect(getCompleteness(s).config, `config for ${t}`).toBe(true);

        s.valueField = '';
        expect(getCompleteness(s).config, `missing valueField for ${t}`).toBe(false);
      }
    });

    it('kpi and gauge require only valueField', () => {
      for (const t of ['kpi', 'gauge'] as const) {
        const s = withFields(baseState());
        s.chartType = t;
        s.labelField = '';
        s.valueField = 'population';
        expect(getCompleteness(s).config, `config for ${t}`).toBe(true);

        s.valueField = '';
        expect(getCompleteness(s).config, `missing valueField for ${t}`).toBe(false);
      }
    });

    it('datalist requires only labelField', () => {
      const s = withFields(baseState());
      s.chartType = 'datalist';
      s.labelField = 'region';
      s.valueField = '';
      expect(getCompleteness(s).config).toBe(true);

      s.labelField = '';
      expect(getCompleteness(s).config).toBe(false);
      expect(getCompleteness(s).missing).toContain('le champ à afficher');
    });

    it('map requires codeField + valueField', () => {
      const s = withFields(baseState());
      s.chartType = 'map';
      s.codeField = 'code';
      s.valueField = 'population';
      expect(getCompleteness(s).config).toBe(true);

      s.codeField = '';
      const c = getCompleteness(s);
      expect(c.config).toBe(false);
      expect(c.missing).toContain('le champ code (département/région)');
    });
  });

  describe('`generate` gate', () => {
    it('stays false while the chart has not been rendered', () => {
      const s = withFields(baseState());
      s.chartType = 'bar';
      s.labelField = 'region';
      s.valueField = 'population';
      expect(getCompleteness(s, false).generate).toBe(false);
    });

    it('flips to true only when generated=true AND config is complete', () => {
      const s = withFields(baseState());
      s.chartType = 'bar';
      s.labelField = 'region';
      s.valueField = 'population';
      expect(getCompleteness(s, true).generate).toBe(true);
    });

    it('remains false if generated=true but config is still incomplete', () => {
      const s = withFields(baseState());
      s.chartType = 'bar';
      s.labelField = '';
      expect(getCompleteness(s, true).generate).toBe(false);
    });
  });

  describe('missing list', () => {
    it('is empty when every gate up to `config` is satisfied', () => {
      const s = withFields(baseState());
      s.chartType = 'bar';
      s.labelField = 'region';
      s.valueField = 'population';
      expect(getCompleteness(s).missing).toEqual([]);
    });

    it('is purely informational — does not include the "generate" step', () => {
      const s = withFields(baseState());
      s.chartType = 'bar';
      s.labelField = 'region';
      s.valueField = 'population';
      const c = getCompleteness(s, false);
      expect(c.generate).toBe(false);
      expect(c.missing).not.toContain('Générer');
      expect(c.missing).toEqual([]);
    });
  });
});
