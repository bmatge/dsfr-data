// Utils
export { escapeHtml } from './utils/escape-html.js';
export { formatKPIValue, formatDateShort } from './utils/formatters.js';
export { toNumber, looksLikeNumber } from './utils/number-parser.js';
export { isValidDeptCode } from './utils/dept-codes.js';
export type { JoinType, JoinKey, JoinOptions } from './utils/join.js';
export { parseJoinKeys, performJoin } from './utils/join.js';

// Constants
export { DSFR_COLORS, PALETTE_PRIMARY_COLOR, PALETTE_COLORS } from './constants/dsfr-palettes.js';
export type { PaletteType } from './constants/dsfr-palettes.js';

// Templates / CDN
export { CDN_VERSIONS, CDN_URLS, getPreviewHTML } from './templates/cdn-versions.js';

// Charts
export { DSFR_TAG_MAP, normalizeChartType, isValidChartType } from './charts/chart-types.js';
export type { DSFRChartType } from './charts/chart-types.js';

// Query / Filters
export { filterToOdsql, applyLocalFilter } from './query/filter-translator.js';

// API / Proxy
export { getProxyConfig, isViteDevMode, isTauriMode, DEFAULT_PROXY_CONFIG, PROXY_BASE_URL, LIB_URL } from './api/proxy-config.js';
export type { ProxyConfig } from './api/proxy-config.js';
export { getProxyUrl, getProxiedUrl, getExternalProxyUrl, buildCorsProxyRequest } from './api/proxy.js';
export { fetchWithTimeout, httpErrorMessage } from './api/fetch-helpers.js';
export { buildGristHeaders } from './api/grist.js';

// Storage
export { loadFromStorage, saveToStorage, removeFromStorage, STORAGE_KEYS } from './storage/local-storage.js';
export { migrateStorageKeys } from './storage/migration.js';

// Storage adapter (async API — supports localStorage and remote backends)
export type { StorageAdapter } from './storage/storage-adapter.js';
export { LocalStorageAdapter } from './storage/storage-adapter.js';
export { ApiStorageAdapter } from './storage/api-storage-adapter.js';
export { setStorageAdapter, getStorageAdapter, loadData, saveData, removeData } from './storage/storage-provider.js';

// Sync queue (reliable background sync with retry)
export type { SyncStatus } from './storage/sync-queue.js';
export { onSyncStatusChange, getSyncStatus } from './storage/sync-queue.js';

// Import/Export
export type { ExportBundle, ImportResult } from './storage/import-export.js';
export { exportAllData, downloadExport, importData, importFromFile } from './storage/import-export.js';

// Data validation
export { validateSource, validateConnection, validateFavorite, validateDashboard, validateAndFilterArray } from './validation/validators.js';

// Auth
export type { User, AuthState, LoginRequest, RegisterRequest, ShareTarget, ShareInfo } from './auth/auth-types.js';
export {
  setAuthBaseUrl, isDbMode, checkAuth, login, register, logout,
  onAuthChange, getAuthState, getUser, isAuthenticated,
} from './auth/auth-service.js';
export { initAuth, getApiAdapter } from './auth/init-auth.js';

// Providers
export type { ProviderConfig, ProviderId } from './providers/index.js';
export {
  ODS_CONFIG, TABULAR_CONFIG, GRIST_CONFIG, INSEE_CONFIG, GENERIC_CONFIG,
  registerProvider, getProvider, getAllProviders,
  detectProvider, extractResourceIds,
} from './providers/index.js';

// Types
export type { Source } from './types/source.js';
export { migrateSource, serializeSourceForServer } from './types/source.js';

// UI
export { openModal, closeModal, setupModalOverlayClose, confirmDialog } from './ui/modal.js';
export { showToast, toastSuccess, toastError, toastWarning, toastInfo } from './ui/toast.js';
export { appHref, navigateTo } from './ui/navigation.js';

// Sample data
export type { SampleDataset } from './data/sample-datasets.js';
export { SAMPLE_DATASETS } from './data/sample-datasets.js';

// Product tour
export type { TourStep, TourConfig } from './ui/product-tour.js';
export { startTour, startTourIfFirstVisit, shouldShowTour, markTourComplete, resetTour, resetAllTours, injectTourStyles } from './ui/product-tour.js';
export { SOURCES_TOUR, BUILDER_IA_TOUR, BUILDER_CARTO_TOUR, PLAYGROUND_TOUR, DASHBOARD_TOUR } from './tour/tour-configs.js';
