/**
 * dsfr-data - Bibliothèque de Web Components de dataviz pour sites gouvernementaux
 *
 * Point d'entrée principal - enregistre tous les composants
 */

// Composants de données
export { DsfrDataSource } from './components/dsfr-data-source.js';
export { DsfrDataQuery } from './components/dsfr-data-query.js';
export { DsfrDataJoin } from './components/dsfr-data-join.js';
export { DsfrDataNormalize } from './components/dsfr-data-normalize.js';
export { DsfrDataFacets } from './components/dsfr-data-facets.js';
export { DsfrDataSearch } from './components/dsfr-data-search.js';
export { DsfrDataKpi } from './components/dsfr-data-kpi.js';
export { DsfrDataKpiGroup } from './components/dsfr-data-kpi-group.js';
export { DsfrDataList } from './components/dsfr-data-list.js';
export { DsfrDataDisplay } from './components/dsfr-data-display.js';
export { DsfrDataChart } from './components/dsfr-data-chart.js';
export { DsfrDataWorldMap } from './components/dsfr-data-world-map.js';
export { DsfrDataMap } from './components/dsfr-data-map.js';
export { DsfrDataMapLayer } from './components/dsfr-data-map-layer.js';
export { DsfrDataMapPopup } from './components/dsfr-data-map-popup.js';
export { DsfrDataMapTimeline } from './components/dsfr-data-map-timeline.js';
export { DsfrDataA11y } from './components/dsfr-data-a11y.js';

// Composants de layout
export { AppHeader, AppFooter, AppLayoutBuilder, AppLayoutDemo } from './components/layout/index.js';

// Utilitaires (pour usage avancé)
export {
  DATA_EVENTS,
  subscribeToSource,
  getDataCache,
  dispatchDataLoaded,
  dispatchDataError,
  dispatchDataLoading
} from './utils/data-bridge.js';

export { getByPath, hasPath, getByPathOrDefault } from './utils/json-path.js';
export { formatValue, formatNumber, formatPercentage, formatCurrency, formatDate } from './utils/formatters.js';
export { computeAggregation, parseExpression } from './utils/aggregations.js';
export { processChartData, extractLabelValues, aggregateByLabel, sortByValue } from './utils/chart-data.js';
export { SourceSubscriberMixin } from './utils/source-subscriber.js';

// Adapters (pour usage avance et extensibilite)
export type {
  ApiAdapter, AdapterCapabilities, AdapterParams,
  FetchResult, FacetResult, ServerSideOverlay
} from './adapters/api-adapter.js';
export { getAdapter, registerAdapter } from './adapters/api-adapter.js';
