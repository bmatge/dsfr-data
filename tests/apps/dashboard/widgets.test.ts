import { describe, it, expect } from 'vitest';
import { getDefaultTitle, getDefaultConfig, getWidgetIcon } from '../../../apps/dashboard/src/widgets';
import type { WidgetType } from '../../../apps/dashboard/src/state';

describe('dashboard/widgets', () => {
  describe('getDefaultTitle', () => {
    it('should return "Indicateur" for kpi', () => {
      expect(getDefaultTitle('kpi')).toBe('Indicateur');
    });

    it('should return "Graphique" for chart', () => {
      expect(getDefaultTitle('chart')).toBe('Graphique');
    });

    it('should return "Tableau de donnees" for table', () => {
      expect(getDefaultTitle('table')).toBe('Tableau de donnees');
    });

    it('should return "Texte" for text', () => {
      expect(getDefaultTitle('text')).toBe('Texte');
    });

    it('should return "Widget" for unknown type', () => {
      expect(getDefaultTitle('unknown' as WidgetType)).toBe('Widget');
    });
  });

  describe('getDefaultConfig', () => {
    it('should return KPI config for kpi type', () => {
      const config = getDefaultConfig('kpi');
      expect(config.valeur).toBe('');
      expect(config.format).toBe('nombre');
      expect(config.icone).toBe('');
      expect(config.label).toBe('Mon KPI');
    });

    it('should return chart config for chart type', () => {
      const config = getDefaultConfig('chart');
      expect(config.chartType).toBe('bar');
      expect(config.labelField).toBe('');
      expect(config.valueField).toBe('');
      expect(config.palette).toBe('categorical');
    });

    it('should return table config for table type', () => {
      const config = getDefaultConfig('table');
      expect(config.columns).toEqual([]);
      expect(config.searchable).toBe(true);
      expect(config.sortable).toBe(true);
    });

    it('should return text config for text type', () => {
      const config = getDefaultConfig('text');
      expect(config.content).toBe('<p>Votre texte ici...</p>');
      expect(config.style).toBe('paragraph');
    });

    it('should return empty object for unknown type', () => {
      expect(getDefaultConfig('unknown' as WidgetType)).toEqual({});
    });
  });

  describe('getWidgetIcon', () => {
    it('should return correct icon for kpi', () => {
      expect(getWidgetIcon('kpi')).toBe('ri-number-1');
    });

    it('should return correct icon for chart', () => {
      expect(getWidgetIcon('chart')).toBe('ri-bar-chart-box-line');
    });

    it('should return correct icon for table', () => {
      expect(getWidgetIcon('table')).toBe('ri-table-line');
    });

    it('should return correct icon for text', () => {
      expect(getWidgetIcon('text')).toBe('ri-text');
    });

    it('should return fallback icon for unknown type', () => {
      expect(getWidgetIcon('unknown' as WidgetType)).toBe('ri-question-line');
    });
  });
});
