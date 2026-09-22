// Utils
export {
  escapeHtml,
  escapeText,
  singleQuoteAttr,
  jsonAttr,
  jsonLiteral,
  jsStringLiteral,
} from './utils/escape-html.js';
export {
  formatKPIValue,
  formatDateShort,
  formatValue,
  formatNumber,
  formatNumberFr,
  formatPercentage,
  formatCurrency,
  formatDecimal,
  formatDate,
  FORMAT_TYPES,
  isFormatType,
} from './utils/formatters.js';
export type { FormatType, FormatValueOptions } from './utils/formatters.js';
export { toNumber, looksLikeNumber } from './utils/number-parser.js';
export { isIsoDateString } from './utils/iso-date.js';
export { stripAccents } from './utils/strip-accents.js';
export {
  looseEquals,
  looseNotEquals,
  resetArrayEqualityTransitionWarnings,
  resetNeqNullTransitionWarnings,
} from './query/filter-translator.js';
export { isValidDeptCode, normalizeDeptCode } from './utils/dept-codes.js';
export type { JoinType, JoinKey, JoinOptions, JoinStats, JoinResult } from './utils/join.js';
export { parseJoinKeys, performJoin, performJoinWithStats } from './utils/join.js';
export type { UnpivotOptions } from './utils/unpivot.js';
export { performUnpivot, compileColsPattern } from './utils/unpivot.js';
export type {
  PivotOptions,
  PivotStats,
  PivotResult,
  PivotAggregate,
  PivotErrorCode,
} from './utils/pivot.js';
export {
  performPivot,
  parsePivotLabels,
  isPivotAggregate,
  PivotError,
  PIVOT_AGGREGATES,
  PIVOT_DEFAULT_MAX_COLUMNS,
} from './utils/pivot.js';
export type { CompiledCompute, CompiledAssignment } from './utils/compute.js';
export {
  compileCompute,
  applyCompute,
  computeTargets,
  COMPUTE_FUNCTIONS,
  COMPUTE_MAX_DEPTH,
  COMPUTE_MAX_EXPRESSION_LENGTH,
} from './utils/compute.js';
export { isUnsafeKey } from './utils/security.js';
export type { CsvColumn, BuildCsvOptions } from './utils/csv.js';
export { buildCsv, CSV_BOM } from './utils/csv.js';
export {
  escapeColonValue,
  unescapeColonValue,
  splitColonFields,
  isMultiFieldClause,
} from './utils/colon-escape.js';
export { toBoolean } from './utils/to-boolean.js';
export type { AliasedColumn } from './utils/aliased-columns.js';
export { parseAliasedColumn, parseAliasedColumns } from './utils/aliased-columns.js';

// Constants
export {
  DSFR_COLORS,
  PALETTE_PRIMARY_COLOR,
  PALETTE_COLORS,
  PALETTE_DISPLAY_NAMES,
} from './constants/palette-colors.js';
export type { PaletteType } from './constants/palette-colors.js';
export {
  CHOROPLETH_SCALES,
  quantileBreaks,
  getColorForValue,
  equalIntervalBreaks,
  parseManualBreaks,
  samplePalette,
  classifyValues,
  choroplethLegendEntries,
  formatLegendNumber,
} from './constants/choropleth-scales.js';
export type {
  ClassificationMethod,
  ClassificationOptions,
  LegendEntry,
} from './constants/choropleth-scales.js';

// Templates / CDN
export { CDN_URLS, getPreviewHTML } from './templates/cdn-versions.js';

// Charts
export { DSFR_TAG_MAP, MAP_LEVEL_MAP } from './charts/chart-types.js';
export type { DSFRChartType } from './charts/chart-types.js';

// Query / Filters
export {
  filterToOdsql,
  applyLocalFilter,
  validateColonFilter,
  COLON_FILTER_OPERATORS,
} from './query/filter-translator.js';
export type { ContextFilterLike } from './query/context-filter.js';

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
export { appendQuery } from './api/url.js';
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
  FlatRecord,
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
  flattenInseeObservation,
  flattenNestedKey,
  flattenProviderRecords,
  buildInseeLabelIndex,
  applyInseeLabels,
  fetchInseeLabelIndex,
  clearInseeLabelCache,
  INSEE_CODE_SUFFIX,
} from './providers/index.js';

// Types
export type { Source } from './types/source.js';
export {
  migrateSource,
  serializeSourceForServer,
  toSourcePointer,
  resolveSelectedSource,
} from './types/source.js';

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
export {
  CLE_ETAT_BUILDER,
  CLE_CODE_CONFIE,
  CLE_CODE_RAPPORTE,
  normaliserCode,
  verdictRetourPlayground,
  AVERTISSEMENT_RETOUR_PLAYGROUND,
} from './ui/passation.js';
export type { VerdictRetour } from './ui/passation.js';

// Repères d'interface : contrat du registre généré (#997, ADR-143) — app-side, types seuls
export type {
  GenreRepere,
  AttributRepere,
  Repere,
  RegistreReperes,
  Prerequis,
  PrerequisParId,
  HelperRepere,
  ExceptionRepere,
  ReperesConfig,
} from './ui/reperes-types.js';

// Révélation d'un repère : montrer(), modes « dire » / « guider » (#1003, app-side)
export type {
  ModeReperage,
  AdaptateurReperage,
  OptionsMontrer,
  ResultatMontrer,
} from './ui/reperage.js';
export {
  montrer,
  chemin,
  prerequisManquants,
  indexerReperes,
  estIdRepere,
  selecteurRepere,
  getReperageMode,
  setReperageMode,
  regionReperage,
  annoncerReperage,
  injectReperageStyles,
  effacerSurbrillance,
  mouvementReduit,
  SEPARATEUR_CHEMIN,
  ID_REGION_REPERAGE,
  CLASSE_REPERE_MONTRE,
  CLASSE_REPERE_ANIME,
  DUREE_SURBRILLANCE_MS,
} from './ui/reperage.js';

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
  PIPELINE_TOUR,
  STUDIO_TOUR,
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

// --- Outils de diagnostic du socle IA (#607, partagés par #1010, ADR-143) ---
// App-side (ils pilotent un aperçu et partent vers un modèle) : JAMAIS dans
// lib.ts (frontière lib/app #319).
export type { DiagnosticContext, FormaterConstatsOptions } from './ia/diagnostic-tools.js';
export {
  DIAGNOSTIC_TOOLS,
  DIAGNOSTIC_TOOL_NAMES,
  REPEATABLE_TOOLS,
  PREUVE_MASQUEE,
  formaterConstats,
  runDiagnosticTool,
  humanizeDiagnosticStep,
} from './ia/diagnostic-tools.js';

// --- Boucle agentique generique (#1004, ADR-143) — app-side, jamais dans lib.ts ---
// Les types du dialogue (PostChat, OpenAIResponse...) sont exportes par le bloc
// du transport (#998), depuis chat-types.js.
export type { AgentLoopEnd, AgentLoopOptions, AgentLoopResult } from './ia/agent-loop.js';
export { runAgentLoop, parseToolArgs, DEFAULT_DUPLICATE_MESSAGE } from './ia/agent-loop.js';

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

// --- Correspondance sans modele : phrase -> repere d'interface (#1012, app-side) ---
export type {
  OptionsCorrespondance,
  RepereMatchable,
  CorrespondanceRepere,
  ResultatCorrespondance,
} from './ia/reperes-matching.js';
export {
  SEUIL_REPERE,
  ECART_AMBIGUITE,
  MAX_CANDIDATS,
  projeterReperes,
  trouverRepere,
  formulerCorrespondance,
} from './ia/reperes-matching.js';

// --- Export d'image PNG/JPG depuis un apercu (app-side) ---
export type {
  ImageExportFormat,
  ImageExportFailure,
  ExportRoot,
  ImageRenderers,
} from './ui/image-export.js';
export {
  ImageExportError,
  IMAGE_EXPORT_MESSAGES,
  resolveCaptureNode,
  imageFilename,
  downloadDataUrl,
  exportPreviewImage,
} from './ui/image-export.js';

// --- Diagnostic du pipeline (#604) : collecteur de trace, app-side ---
//
// Re-export en bloc du sous-barrel : maintenir DEUX listes explicites les
// faisait deja diverger (frame/mount ajoutes d'un cote seulement). Une seule
// source de verite, `debug/index.ts`, qui sert aussi de point d'entree au
// bundle autonome de #608.
export * from './debug/index.js';

// --- Transport IA commun et capacites Albert (#998, ADR-143) ---
// App-side (fetch, localStorage) : JAMAIS dans lib.ts (frontiere lib/app #319).
// Les types du dialogue viennent de chat-types.ts SEULEMENT (partages avec la
// boucle agentique, #1004) : transport.ts les importe sans les re-exporter.
export type { ToolCall, ChatMessage, OpenAIResponse, PostChat } from './ia/chat-types.js';
export type {
  UserIAConfig,
  ServerIAConfig,
  ProxyFetchInit,
  ResolvedTransport,
  ResolveTransportOptions,
} from './ia/transport.js';
export {
  IA_PROXY_DEFAULT_ENDPOINT,
  IA_PROXY_ENDPOINT,
  IA_CONFIG_KEY,
  userProxyHeaders,
  proxyFetch,
  postProxy,
  fetchServerConfig,
  getServerConfig,
  resetServerConfigCache,
  loadUserConfig,
  isServerMode,
  isAlbertUrl,
  resolveTransport,
} from './ia/transport.js';
export type { AlbertCapabilities } from './ia/albert-capabilities.js';
export {
  DEFAULT_CAPABILITIES,
  ALBERT_DEFAULT_CAPABILITIES,
  getCapabilities,
  setCapabilities,
  resetCapabilities,
  effectiveCapabilities,
} from './ia/albert-capabilities.js';
