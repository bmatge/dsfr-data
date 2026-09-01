// Utils
export { escapeHtml } from './utils/escape-html.js';
export {
  formatKPIValue,
  formatDateShort,
  formatValue,
  formatNumber,
  formatPercentage,
  formatCurrency,
  formatDecimal,
  formatDate,
} from './utils/formatters.js';
export type { FormatType } from './utils/formatters.js';
export { toNumber, looksLikeNumber } from './utils/number-parser.js';
export { isValidDeptCode } from './utils/dept-codes.js';
export type { JoinType, JoinKey, JoinOptions } from './utils/join.js';
export { parseJoinKeys, performJoin } from './utils/join.js';
export type { UnpivotOptions } from './utils/unpivot.js';
export { performUnpivot, compileColsPattern } from './utils/unpivot.js';
export type { CompiledCompute, CompiledAssignment } from './utils/compute.js';
export { compileCompute, applyCompute } from './utils/compute.js';
export { isUnsafeKey } from './utils/security.js';
export type { CsvColumn, BuildCsvOptions } from './utils/csv.js';
export { buildCsv, CSV_BOM } from './utils/csv.js';
export { escapeColonValue, unescapeColonValue } from './utils/colon-escape.js';

// Constants
export {
  DSFR_COLORS,
  PALETTE_PRIMARY_COLOR,
  PALETTE_COLORS,
  PALETTE_DISPLAY_NAMES,
  CHOROPLETH_SCALES,
  quantileBreaks,
  getColorForValue,
} from './constants/dsfr-palettes.js';
export type { PaletteType } from './constants/dsfr-palettes.js';

// Templates / CDN
export { CDN_URLS, getPreviewHTML } from './templates/cdn-versions.js';

// Charts
export { DSFR_TAG_MAP, MAP_LEVEL_MAP } from './charts/chart-types.js';
export type { DSFRChartType } from './charts/chart-types.js';

// Query / Filters
export { filterToOdsql, applyLocalFilter } from './query/filter-translator.js';

// API / Proxy
export {
  getProxyConfig,
  isViteDevMode,
  DEFAULT_PROXY_CONFIG,
  PROXY_BASE_URL,
  PROXY_BASE_URL_EMBED,
  BEACON_BASE_URL,
  LIB_URL,
} from './api/proxy-config.js';
export type { ProxyConfig, ProxyMode, RuntimeProxyConfig } from './api/proxy-config.js';
export {
  getProxyUrl,
  getProxiedUrl,
  buildCorsProxyRequest,
  buildProxiedRequest,
} from './api/proxy.js';
export { fetchWithTimeout, httpErrorMessage } from './api/fetch-helpers.js';
export { buildGristHeaders } from './api/grist.js';

// Storage
export {
  loadFromStorage,
  saveToStorage,
  saveToStorageQuiet,
  removeFromStorage,
  STORAGE_KEYS,
} from './storage/local-storage.js';

// Storage adapter (async API — supports localStorage and remote backends)
export type { StorageAdapter } from './storage/storage-adapter.js';
export { LocalStorageAdapter } from './storage/storage-adapter.js';
export { ApiStorageAdapter } from './storage/api-storage-adapter.js';
export {
  setStorageAdapter,
  getStorageAdapter,
  loadData,
  saveData,
  removeData,
} from './storage/storage-provider.js';

// Sync queue (reliable background sync with retry)
export type { SyncStatus } from './storage/sync-queue.js';
export { onSyncStatusChange, getSyncStatus } from './storage/sync-queue.js';

// Import/Export
export type { ExportBundle, ImportResult } from './storage/import-export.js';
export {
  exportAllData,
  downloadExport,
  importData,
  importFromFile,
} from './storage/import-export.js';

// Data validation
export {
  validateSource,
  validateConnection,
  validateFavorite,
  validateDashboard,
} from './validation/validators.js';

// Auth
export type {
  User,
  AuthState,
  LoginRequest,
  RegisterRequest,
  ShareTarget,
  ShareInfo,
} from './auth/auth-types.js';
export {
  isDbMode,
  checkAuth,
  login,
  register,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
  authenticatedFetch,
  onAuthChange,
  getAuthState,
  getUser,
  isAuthenticated,
  fetchAuthProviders,
  attemptSilentSso,
  type AuthProvider,
  type AuthProvidersResponse,
} from './auth/auth-service.js';
export { registerServerCacheProvider } from './api/server-cache-provider.js';
export { registerDbBeaconTransport } from './api/beacon-transport.js';
export { initAuth, getApiAdapter } from './auth/init-auth.js';

// Providers
export type {
  ProviderConfig,
  ProviderId,
  ResolvedSourceUrl,
  DataGouvResource,
} from './providers/index.js';
export {
  ODS_CONFIG,
  TABULAR_CONFIG,
  GRIST_CONFIG,
  INSEE_CONFIG,
  GENERIC_CONFIG,
  registerProvider,
  getProvider,
  detectProvider,
  extractResourceIds,
  resolveSourceUrl,
  normalizeProviderAuthHeaders,
  parseDataGouvDataset,
  dataGouvDatasetApiUrl,
  extractDataGouvResources,
} from './providers/index.js';

// Types
export type { Source } from './types/source.js';
export { migrateSource, serializeSourceForServer } from './types/source.js';

// UI
export {
  openModal,
  closeModal,
  setupModalOverlayClose,
  confirmDialog,
  promptDialog,
} from './ui/modal.js';
export type { PromptDialogOptions } from './ui/modal.js';
export { showToast, toastSuccess, toastError, toastWarning, toastInfo } from './ui/toast.js';
export { appHref, navigateTo } from './ui/navigation.js';

// Sample data
export type { SampleDataset } from './data/sample-datasets.js';
export { SAMPLE_DATASETS } from './data/sample-datasets.js';

// Product tour
export type { TourStep, TourConfig, TourState, StoredTourEntry } from './ui/product-tour.js';
export {
  startTour,
  startTourIfFirstVisit,
  shouldShowTour,
  markTourComplete,
  resetTour,
  injectTourStyles,
  getToursState,
  isToursDisabled,
  setToursDisabled,
  isDemoDatasetsDisabled,
  setDemoDatasetsDisabled,
} from './ui/product-tour.js';
export type { TourRegistryEntry } from './tour/tour-configs.js';
export {
  SOURCES_TOUR,
  BUILDER_IA_TOUR,
  BUILDER_CARTO_TOUR,
  PLAYGROUND_TOUR,
  DASHBOARD_TOUR,
  TOURS_REGISTRY,
} from './tour/tour-configs.js';

// --- Modele de document multi-blocs partage dashboard/studio (#515) ---
// App-side uniquement : ne PAS exporter depuis lib.ts (frontiere lib/app #319).
export type { ChartConfig, AggregatedResult } from './dashboard/chart-config.js';
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
  MapLayerType,
  MapLayerSpec,
  MapWidgetConfig,
  DashboardSource,
  DashboardFavorite,
  DashboardData,
} from './dashboard/model.js';
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
  MAP_LAYER_TYPES,
} from './dashboard/model.js';
export {
  generateDashboardHTML,
  generateDashboardBodyHTML,
  generateWidgetHTML,
  generateSourceHTML,
} from './dashboard/export-html.js';

// --- Outils d'introspection de donnees IA (promus du builder-IA, #515) ---
// App-side uniquement (frontiere lib/app #319).
export type { Row, Aggregation, Field, Diagnosis } from './ia/data-tools.js';
export {
  analyzeDataFields,
  aggregateBy,
  buildMultiSeries,
  applyWhereFilter,
  inspectData,
  distinctValues,
  countWhere,
  diagnoseConfig,
} from './ia/data-tools.js';

// --- Vocabulaire et schema JSON de la ChartConfig (promus du builder-IA, #515) ---
export {
  CHART_CONFIG_TYPES,
  AGGREGATIONS,
  SORT_ORDERS,
  VARIANTS,
  CHART_CONFIG_SCHEMA,
} from './ia/chart-schema.js';

// --- Moteur de matching des skills (#514, promu du builder-IA en #515) ---
// Source unique : ZERO import dans skill-matching.ts (copie verbatim vers le MCP).
export type { MatchableSkill, SkillMatch, SearchOptions } from './ia/skill-matching.js';
export {
  normalize,
  tokenize,
  headingsOf,
  scoreSkill,
  searchSkills,
  matchSkills,
} from './ia/skill-matching.js';
