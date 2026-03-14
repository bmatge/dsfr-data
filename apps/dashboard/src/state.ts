/**
 * Dashboard app - State management and types
 */

export type WidgetType = 'kpi' | 'chart' | 'table' | 'text';

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  position: { row: number; col: number };
  config: Record<string, any>;
}

export interface DashboardData {
  id: string | null;
  name: string;
  description: string;
  createdAt: string | null;
  updatedAt: string | null;
  layout: {
    columns: number;
    gap: string;
    rowColumns?: Record<number, number>;
  };
  widgets: Widget[];
  sources: any[];
}

export interface AppState {
  dashboard: DashboardData;
  selectedWidget: Widget | null;
  favorites: any[];
  savedDashboards: DashboardData[];
}

export function createEmptyDashboard(): DashboardData {
  return {
    id: null,
    name: 'Mon tableau de bord',
    description: '',
    createdAt: null,
    updatedAt: null,
    layout: {
      columns: 2,
      gap: 'fr-grid-row--gutters'
    },
    widgets: [],
    sources: []
  };
}

/** Returns the column count for a specific row, falling back to global default. */
export function getRowColumns(dashboard: DashboardData, rowIndex: number): number {
  return dashboard.layout.rowColumns?.[rowIndex] ?? dashboard.layout.columns ?? 2;
}

/** Sets the column count for a specific row. */
export function setRowColumns(dashboard: DashboardData, rowIndex: number, columns: number): void {
  if (!dashboard.layout.rowColumns) {
    dashboard.layout.rowColumns = {};
  }
  dashboard.layout.rowColumns[rowIndex] = columns;
}

/** Removes a row from rowColumns and re-indexes all rows above the deleted index. */
export function removeRowFromLayout(dashboard: DashboardData, rowIndex: number): void {
  if (!dashboard.layout.rowColumns) return;

  const updated: Record<number, number> = {};
  for (const [key, value] of Object.entries(dashboard.layout.rowColumns)) {
    const idx = Number(key);
    if (idx < rowIndex) {
      updated[idx] = value;
    } else if (idx > rowIndex) {
      updated[idx - 1] = value;
    }
  }
  dashboard.layout.rowColumns = Object.keys(updated).length > 0 ? updated : undefined;
}

export const state: AppState = {
  dashboard: createEmptyDashboard(),
  selectedWidget: null,
  favorites: [],
  savedDashboards: []
};
