import { describe, it, expect } from 'vitest';
import { createEmptyDashboard, state, getRowColumns, setRowColumns, removeRowFromLayout } from '../../../apps/dashboard/src/state';
import type { WidgetType, Widget, DashboardData, AppState } from '../../../apps/dashboard/src/state';

describe('dashboard/state', () => {
  describe('createEmptyDashboard', () => {
    it('should return a new dashboard with default values', () => {
      const dashboard = createEmptyDashboard();
      expect(dashboard.id).toBeNull();
      expect(dashboard.name).toBe('Mon tableau de bord');
      expect(dashboard.createdAt).toBeNull();
      expect(dashboard.updatedAt).toBeNull();
      expect(dashboard.layout).toEqual({ columns: 2, gap: 'fr-grid-row--gutters' });
      expect(dashboard.widgets).toEqual([]);
      expect(dashboard.sources).toEqual([]);
    });

    it('should return a new instance each time', () => {
      const a = createEmptyDashboard();
      const b = createEmptyDashboard();
      expect(a).not.toBe(b);
      expect(a.widgets).not.toBe(b.widgets);
    });
  });

  describe('state singleton', () => {
    it('should have a default dashboard', () => {
      expect(state.dashboard).toBeDefined();
      expect(state.dashboard.name).toBe('Mon tableau de bord');
    });

    it('should have empty collections', () => {
      expect(state.selectedWidget).toBeNull();
      expect(state.favorites).toEqual([]);
      expect(state.savedDashboards).toEqual([]);
    });
  });

  describe('types', () => {
    it('should accept valid WidgetType values', () => {
      const types: WidgetType[] = ['kpi', 'chart', 'table', 'text'];
      expect(types).toHaveLength(4);
    });

    it('should allow creating a Widget conforming to the interface', () => {
      const widget: Widget = {
        id: 'w-1',
        type: 'kpi',
        title: 'Test KPI',
        position: { row: 0, col: 0 },
        config: { valeur: '42' },
      };
      expect(widget.id).toBe('w-1');
      expect(widget.type).toBe('kpi');
    });
  });

  describe('getRowColumns', () => {
    it('should return global columns when no rowColumns exists', () => {
      const dashboard = createEmptyDashboard();
      expect(getRowColumns(dashboard, 0)).toBe(2);
      expect(getRowColumns(dashboard, 5)).toBe(2);
    });

    it('should return per-row value when set', () => {
      const dashboard = createEmptyDashboard();
      dashboard.layout.rowColumns = { 0: 3, 1: 4 };
      expect(getRowColumns(dashboard, 0)).toBe(3);
      expect(getRowColumns(dashboard, 1)).toBe(4);
      expect(getRowColumns(dashboard, 2)).toBe(2); // falls back to global
    });
  });

  describe('setRowColumns', () => {
    it('should initialize rowColumns if undefined', () => {
      const dashboard = createEmptyDashboard();
      setRowColumns(dashboard, 0, 3);
      expect(dashboard.layout.rowColumns).toEqual({ 0: 3 });
    });

    it('should update existing rowColumns', () => {
      const dashboard = createEmptyDashboard();
      dashboard.layout.rowColumns = { 0: 2 };
      setRowColumns(dashboard, 1, 4);
      expect(dashboard.layout.rowColumns).toEqual({ 0: 2, 1: 4 });
    });
  });

  describe('removeRowFromLayout', () => {
    it('should remove row and re-index higher rows', () => {
      const dashboard = createEmptyDashboard();
      dashboard.layout.rowColumns = { 0: 3, 1: 2, 2: 4 };
      removeRowFromLayout(dashboard, 1);
      expect(dashboard.layout.rowColumns).toEqual({ 0: 3, 1: 4 });
    });

    it('should set rowColumns to undefined when last row removed', () => {
      const dashboard = createEmptyDashboard();
      dashboard.layout.rowColumns = { 0: 3 };
      removeRowFromLayout(dashboard, 0);
      expect(dashboard.layout.rowColumns).toBeUndefined();
    });

    it('should do nothing when rowColumns is undefined', () => {
      const dashboard = createEmptyDashboard();
      removeRowFromLayout(dashboard, 0);
      expect(dashboard.layout.rowColumns).toBeUndefined();
    });
  });
});
