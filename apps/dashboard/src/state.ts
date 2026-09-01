/**
 * Dashboard app - State management and types
 *
 * Le modele (types, normalisation, defauts) vit desormais dans
 * `@dsfr-data/shared` (`packages/shared/src/dashboard/model.ts`, #515) : il est
 * partage entre le dashboard et le studio. Ce module re-exporte l'integralite
 * du modele — c'est le point d'entree historique des autres fichiers de l'app
 * et des tests — et ne garde en propre que l'etat applicatif.
 */

import { createEmptyDashboard } from '@dsfr-data/shared';
import type { DashboardData, DashboardFavorite, Widget } from '@dsfr-data/shared';

export type {
  WidgetType,
  WidgetConfig,
  Widget,
  KpiWidgetConfig,
  KpiFormat,
  ChartWidgetType,
  ChartPalette,
  ManualChartWidgetConfig,
  FavoriteChartWidgetConfig,
  BuilderChartWidgetConfig,
  ChartWidgetConfig,
  TableWidgetConfig,
  TextStyle,
  TextWidgetConfig,
  FilterOperator,
  DashboardFilterSpec,
  FiltersWidgetConfig,
  DashboardSource,
  DashboardFavorite,
  DashboardData,
} from '@dsfr-data/shared';

export {
  isFavoriteChart,
  isBuilderChart,
  createEmptyDashboard,
  getRowColumns,
  setRowColumns,
  removeRowFromLayout,
  normalizeWidget,
  normalizeDashboard,
  oneOf,
  getDefaultTitle,
  getDefaultConfig,
  createWidget,
  KPI_FORMATS,
  CHART_TYPES,
  CHART_PALETTES,
  TEXT_STYLES,
  FILTER_OPERATORS,
} from '@dsfr-data/shared';

export interface AppState {
  dashboard: DashboardData;
  selectedWidget: Widget | null;
  favorites: DashboardFavorite[];
  savedDashboards: DashboardData[];
}

export const state: AppState = {
  dashboard: createEmptyDashboard(),
  selectedWidget: null,
  favorites: [],
  savedDashboards: [],
};
