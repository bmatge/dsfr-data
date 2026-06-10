/**
 * Barrel **lib-safe** de @dsfr-data/shared — frontière officielle entre la
 * bibliothèque publiée (`packages/core`, bundles npm/CDN) et le code
 * applicatif des apps (#319).
 *
 * Règles :
 * - `packages/core/src` ne doit importer QUE cette entrée
 *   (`@dsfr-data/shared/lib`) — une règle ESLint `no-restricted-imports`
 *   interdit le barrel racine (exceptions temporaires : `components/layout/`
 *   en attendant #306, `isAuthenticated` de dsfr-data-source en attendant
 *   #307).
 * - Ne JAMAIS ré-exporter ici de module app-side : auth/, storage/, ui/,
 *   tour/, validation/, templates/, data/ (modales, toasts, sessions,
 *   localStorage, appels /api/*…).
 *
 * Les apps continuent d'importer le barrel racine (`@dsfr-data/shared`), qui
 * ré-exporte aussi cette frontière.
 */

// Utils (purs, sans DOM ni réseau)
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
export { filterToOdsql, applyLocalFilter } from './query/filter-translator.js';

// Constantes DSFR
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

// Charts
export { DSFR_TAG_MAP } from './charts/chart-types.js';
export type { DSFRChartType } from './charts/chart-types.js';

// API / Proxy (config runtime injectable, cf. #319)
export {
  getProxyConfig,
  isViteDevMode,
  isTauriMode,
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
