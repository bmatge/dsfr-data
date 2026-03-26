/**
 * Code generation functions.
 * Contains all code generation paths: local data, dynamic Grist,
 * dynamic API, and standard API-fetched data.
 */

import {
  escapeHtml,
  formatKPIValue,
  toNumber,
  isValidDeptCode,
  toastWarning,
  toastError,
  CDN_URLS,
  DSFR_TAG_MAP,
  filterToOdsql,
  applyLocalFilter,
  detectProvider,
  extractResourceIds,
  getProvider,
} from '@dsfr-data/shared';
import { state, PROXY_BASE_URL, LIB_URL } from '../state.js';
import { renderPreview } from './preview.js';
import { updateAccessibleTable } from './accessible-table.js';

/** Write the generated code to the code panel AND render it in the preview iframe. */
function displayGeneratedCode(code: string): void {
  // Prepend sample data comment if using example data
  const finalCode = state.isSampleData
    ? `<!-- Donnees d'exemple \u2014 remplacez par votre source de donnees -->\n${code}`
    : code;
  const codeEl = document.getElementById('generated-code');
  if (codeEl) codeEl.textContent = finalCode;
  renderPreview(code);
}

const ODS_PAGE_SIZE = 100;
const ODS_MAX_PAGES = 10;

/** Generate DataBox attributes for dsfr-data-chart (dynamic mode) */
function generateDataboxAttrs(): string {
  if (!state.databoxEnabled) return '';
  const attrs: string[] = ['\n    databox'];
  if (state.databoxTitle) attrs.push(`databox-title="${escapeHtml(state.databoxTitle)}"`);
  if (state.databoxSource) attrs.push(`databox-source="${escapeHtml(state.databoxSource)}"`);
  if (state.databoxDate) attrs.push(`databox-date="${escapeHtml(state.databoxDate)}"`);
  if (state.databoxDownload) attrs.push('databox-download');
  if (state.databoxScreenshot) attrs.push('databox-screenshot');
  if (state.databoxFullscreen) attrs.push('databox-fullscreen');
  if (state.databoxTrend) attrs.push(`databox-trend="${escapeHtml(state.databoxTrend)}"`);
  return attrs.join('\n    ');
}

/** Generate optional dsfr-data-a11y element for accessible data companion */
function generateA11yElement(sourceId: string, chartId: string): string {
  if (!state.a11yEnabled) return '';
  const attrs: string[] = [`for="${chartId}"`, `source="${sourceId}"`];
  if (state.a11yTable) attrs.push('table');
  if (state.a11yDownload) attrs.push('download');
  if (state.a11yDescription) attrs.push(`description="${state.a11yDescription.replace(/"/g, '&quot;')}"`);
  return `\n  <dsfr-data-a11y ${attrs.join(' ')}></dsfr-data-a11y>`;
}

/** Generate a11y block for embedded code (inline data via dsfr-data-source) */
function generateEmbeddedA11y(chartId: string): string {
  if (!state.a11yEnabled) return '';
  const dataJson = JSON.stringify(state.data).replace(/'/g, '&#39;');
  const attrs: string[] = [`for="${chartId}"`, `source="a11y-data"`];
  if (state.a11yTable) attrs.push('table');
  if (state.a11yDownload) attrs.push('download');
  if (state.a11yDescription) attrs.push(`description="${state.a11yDescription.replace(/"/g, '&quot;')}"`);
  return `\n  <dsfr-data-source id="a11y-data" data='${dataJson}'></dsfr-data-source>` +
         `\n  <dsfr-data-a11y ${attrs.join(' ')}></dsfr-data-a11y>`;
}

/** dsfr-data dependency line for embedded code when a11y is enabled */
function a11yDep(): string {
  if (!state.a11yEnabled && !state.databoxEnabled) return '';
  return `\n<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>`;
}

/** Wrap an embedded chart element with DataBox markup (open + close tags) */
function wrapWithDatabox(chartHtml: string, chartId: string): string {
  if (!state.databoxEnabled) return chartHtml;
  const dbId = `databox-${chartId}`;
  // DataBox attributes — title, source, date are required
  const dbAttrs: string[] = [`id="${dbId}"`];
  dbAttrs.push(`title="${escapeHtml(state.databoxTitle || ' ')}"`);
  dbAttrs.push(`source="${escapeHtml(state.databoxSource || ' ')}"`);
  dbAttrs.push(`date="${escapeHtml(state.databoxDate || new Date().toISOString().split('T')[0])}"`);
  if (state.databoxDownload) dbAttrs.push('download');
  if (state.databoxScreenshot) dbAttrs.push('screenshot');
  if (state.databoxFullscreen) dbAttrs.push('fullscreen');
  if (state.databoxTrend) dbAttrs.push(`trend="${escapeHtml(state.databoxTrend)}"`);
  dbAttrs.push('segmented-control');

  // Add databox-id, databox-type, databox-source on the chart element
  const chartWithDbAttrs = chartHtml.replace(
    /(<\w[\w-]*)(\s)/,
    `$1 databox-id="${dbId}" databox-type="chart" databox-source="default"$2`
  );

  // DataBox and chart must be SIBLINGS (not parent-child).
  // DataBox uses Vue Teleport: it creates container divs, then chart teleports into them.
  // A hidden table stub lets DataBox create the table container for segmented control.
  return `<data-box ${dbAttrs.join('\n    ')}></data-box>\n  ${chartWithDbAttrs}\n  <div databox-id="${dbId}" databox-type="table" databox-source="default" style="display:none"></div>`;
}

/**
 * Fetch all results from an ODS API URL, handling pagination automatically.
 * ODS APIs cap at 100 records per request. When the URL requests more,
 * this function uses offset-based pagination to accumulate all results.
 */
async function fetchOdsResults(baseUrl: string): Promise<Record<string, unknown>[]> {
  const url = new URL(baseUrl);
  const requestedLimit = parseInt(url.searchParams.get('limit') || '0', 10);

  // limit <= 0 means "fetch all" with auto-pagination
  // limit <= 100 means single page (no pagination needed)
  if (requestedLimit > 0 && requestedLimit <= ODS_PAGE_SIZE) {
    const response = await fetch(baseUrl);
    const json = await response.json();
    return json.results || [];
  }

  const effectiveLimit = requestedLimit > 0 ? requestedLimit : ODS_MAX_PAGES * ODS_PAGE_SIZE;
  let allResults: Record<string, unknown>[] = [];
  let offset = 0;
  let totalCount = -1;

  for (let page = 0; page < ODS_MAX_PAGES; page++) {
    const remaining = effectiveLimit - allResults.length;
    if (remaining <= 0) break;

    const pageUrl = new URL(baseUrl);
    pageUrl.searchParams.set('limit', String(Math.min(ODS_PAGE_SIZE, remaining)));
    pageUrl.searchParams.set('offset', String(offset));

    const response = await fetch(pageUrl.toString());
    const json = await response.json();
    const pageResults = (json.results || []) as Record<string, unknown>[];
    allResults = allResults.concat(pageResults);

    if (typeof json.total_count === 'number') totalCount = json.total_count;

    if (pageResults.length < ODS_PAGE_SIZE) break;
    if (totalCount >= 0 && allResults.length >= totalCount) break;
    offset += pageResults.length;
  }

  // Verify total_count coherence
  if (totalCount >= 0 && allResults.length < totalCount && allResults.length < effectiveLimit) {
    console.warn(
      `fetchOdsResults: pagination incomplete - ${allResults.length}/${totalCount} resultats`
    );
  }

  return allResults;
}

// DSFR_TAG_MAP imported from @dsfr-data/shared

/** Build DSFR Chart specific attributes from builder state */
function dsfrChartAttrs(): string {
  const extra: string[] = [];
  if (state.chartType === 'horizontalBar') extra.push('horizontal');
  if (state.chartType === 'pie') extra.push('fill');
  if (state.chartType === 'doughnut') { /* no fill = donut */ }
  return extra.map(a => `\n    ${a}`).join('');
}

/**
 * Escape single quotes in a string for use inside single-quoted HTML attributes.
 * DSFR Chart x/y attributes contain JSON with French names that may include
 * apostrophes (e.g. "CÔTES-D'ARMOR", "VAL-D'OISE") which would prematurely
 * close the HTML attribute if unescaped.
 */
function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, '&#39;');
}

/**
 * Inline JS helper for ODS pagination in generated code.
 * Handles offset-based pagination (ODS API max 100 records/request).
 */
const ODS_FETCH_HELPER = `// Pagination ODS (max 100 par requete)
async function fetchAllODS(apiUrl) {
  var allResults = [], offset = 0, url = new URL(apiUrl);
  var limit = parseInt(url.searchParams.get('limit') || '100');
  for (var p = 0; p < 10; p++) {
    var rem = limit - allResults.length;
    if (rem <= 0) break;
    var u = new URL(apiUrl);
    u.searchParams.set('limit', String(Math.min(100, rem)));
    u.searchParams.set('offset', String(offset));
    var r = await fetch(u.toString());
    var j = await r.json();
    var d = j.results || [];
    allResults = allResults.concat(d);
    if (d.length < 100 || (j.total_count && allResults.length >= j.total_count)) break;
    offset += d.length;
  }
  return allResults;
}`;

/**
 * DSFR Chart Vue components map-chart and map-chart-reg overwrite `value`
 * and `date` attributes with defaults during Vue mount. This inline script
 * re-applies all attributes after 500ms to work around that.
 * Only needed for map-chart / map-chart-reg — other chart types (bar, line,
 * pie, radar, scatter) do NOT overwrite their attributes.
 */
const DEFERRED_TAGS = new Set(['map-chart', 'map-chart-reg']);

function dsfrDeferredScript(tagName: string): string {
  if (!DEFERRED_TAGS.has(tagName)) return '';
  return `
<script>
(function(){var c=document.querySelector('${tagName}');if(!c)return;var s={};[].forEach.call(c.attributes,function(a){s[a.name]=a.value});customElements.whenDefined('${tagName}').then(function(){setTimeout(function(){Object.keys(s).forEach(function(k){c.setAttribute(k,s[k])})},500)})})();
<\/script>`;
}

// filterToOdsql and applyLocalFilter imported from @dsfr-data/shared

/**
 * Generate optional middleware elements (dsfr-data-normalize, dsfr-data-facets)
 * to insert between dsfr-data-source and dsfr-data-query/dsfr-data-chart.
 * Returns the generated HTML and the final source ID for downstream components.
 */
/**
 * Options pour le mode de fonctionnement des facettes.
 * - serverFacets: mode serveur ODS (fetch depuis /facets API)
 * - staticValues: valeurs pre-calculees avec WHERE en colon syntax (Tabular/Grist)
 */
export interface FacetsMode {
  serverFacets?: boolean;
  staticValues?: Record<string, string[]>;
  /** Prefix to prepend to field names (e.g. "fields." for Grist without flatten) */
  fieldPrefix?: string;
}

/**
 * Generate a <dsfr-data-facets> element if facets are enabled and configured.
 * Returns the generated HTML and the new source ID for downstream components,
 * or empty string/unchanged sourceId if facets are not enabled.
 */
export function generateFacetsElement(
  sourceId: string,
  mode?: FacetsMode
): { element: string; finalSourceId: string } {
  const activeFields = state.facetsConfig.fields.filter(f => f.field);
  if (!state.facetsConfig.enabled || activeFields.length === 0) {
    return { element: '', finalSourceId: sourceId };
  }

  const facetsId = 'faceted-data';
  const attrs: string[] = [`source="${sourceId}"`];
  const pfx = mode?.fieldPrefix || '';

  attrs.push(`fields="${activeFields.map(f => pfx + f.field).join(', ')}"`);

  const labelsWithCustom = activeFields.filter(f => f.label && f.label !== f.field);
  if (labelsWithCustom.length > 0) {
    attrs.push(`labels="${escapeHtml(labelsWithCustom.map(f => `${pfx}${f.field}:${f.label}`).join(' | '))}"`);
  }

  const nonDefaultDisplay = activeFields.filter(f => f.display !== 'checkbox');
  if (nonDefaultDisplay.length > 0) {
    attrs.push(`display="${nonDefaultDisplay.map(f => `${pfx}${f.field}:${f.display}`).join(' | ')}"`);
  }

  const disjunctiveFields = activeFields.filter(f => f.disjunctive);
  if (disjunctiveFields.length > 0) {
    attrs.push(`disjunctive="${disjunctiveFields.map(f => pfx + f.field).join(', ')}"`);
  }

  const searchableFields = activeFields.filter(f => f.searchable);
  if (searchableFields.length > 0) {
    attrs.push(`searchable="${searchableFields.map(f => pfx + f.field).join(', ')}"`);
  }

  if (state.facetsConfig.maxValues !== 6) {
    attrs.push(`max-values="${state.facetsConfig.maxValues}"`);
  }
  if (state.facetsConfig.sort !== 'count') {
    attrs.push(`sort="${state.facetsConfig.sort}"`);
  }
  if (state.facetsConfig.hideEmpty) {
    attrs.push('hide-empty');
  }

  // Mode server-facets (ODS)
  if (mode?.serverFacets) {
    attrs.push('server-facets');
  }

  // Mode static-values (Tabular/Grist) : valeurs pre-calculees
  if (mode?.staticValues) {
    const json = JSON.stringify(mode.staticValues);
    attrs.push(`static-values='${json}'`);
  }

  const element = `
  <!-- Filtres a facettes -->
  <dsfr-data-facets
    id="${facetsId}"
    ${attrs.join('\n    ')}>
  </dsfr-data-facets>`;

  return { element, finalSourceId: facetsId };
}

/**
 * Pre-compute unique values for facet fields from loaded data.
 * Used to generate static-values for non-ODS sources.
 */
export function computeStaticFacetValues(): Record<string, string[]> | null {
  const activeFields = state.facetsConfig.fields.filter(f => f.field);
  if (!state.facetsConfig.enabled || activeFields.length === 0) return null;
  if (!state.localData || state.localData.length === 0) return null;

  const result: Record<string, string[]> = {};
  for (const fieldConfig of activeFields) {
    const field = fieldConfig.field;
    const uniqueValues = new Set<string>();
    for (const row of state.localData) {
      const val = row[field];
      if (val !== null && val !== undefined && val !== '') {
        uniqueValues.add(String(val));
      }
    }
    if (uniqueValues.size > 0 && uniqueValues.size <= 200) {
      result[field] = [...uniqueValues].sort();
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

export function generateMiddlewareElements(
  sourceId: string,
  facetsMode?: FacetsMode
): { elements: string; finalSourceId: string } {
  let currentSourceId = sourceId;
  let elements = '';

  // dsfr-data-normalize
  if (state.normalizeConfig.enabled) {
    const normalizeId = 'normalized-data';
    const attrs: string[] = [`source="${currentSourceId}"`];
    if (state.normalizeConfig.trim) attrs.push('trim');
    if (state.normalizeConfig.numericAuto) attrs.push('numeric-auto');
    if (state.normalizeConfig.numeric) attrs.push(`numeric="${escapeHtml(state.normalizeConfig.numeric)}"`);
    if (state.normalizeConfig.rename) attrs.push(`rename="${escapeHtml(state.normalizeConfig.rename)}"`);
    if (state.normalizeConfig.stripHtml) attrs.push('strip-html');
    if (state.normalizeConfig.replace) attrs.push(`replace="${escapeHtml(state.normalizeConfig.replace)}"`);
    if (state.normalizeConfig.lowercaseKeys) attrs.push('lowercase-keys');
    if (state.normalizeConfig.flatten) attrs.push(`flatten="${escapeHtml(state.normalizeConfig.flatten)}"`);

    elements += `
  <!-- Nettoyage des donnees -->
  <dsfr-data-normalize
    id="${normalizeId}"
    ${attrs.join('\n    ')}>
  </dsfr-data-normalize>`;
    currentSourceId = normalizeId;
  }

  // dsfr-data-facets
  const facets = generateFacetsElement(currentSourceId, facetsMode);
  if (facets.element) {
    elements += facets.element;
    currentSourceId = facets.finalSourceId;
  }

  return { elements, finalSourceId: currentSourceId };
}

/**
 * Build the colonnes attribute for dsfr-data-list.
 * Uses custom column config if available, otherwise auto-detects from fields.
 */
function buildColonnesAttr(): string {
  // Use custom columns if configured
  const visibleCols = state.datalistColumns.filter(c => c.visible);
  if (visibleCols.length > 0) {
    return visibleCols.map(c => `${c.field}:${c.label}`).join(', ');
  }
  // Fallback: auto-detect from fields or raw data
  const fields = state.fields.length > 0
    ? state.fields.map(f => f.name)
    : (state.localData && state.localData.length > 0 ? Object.keys(state.localData[0]) : []);
  return fields.map(f => `${f}:${f}`).join(', ');
}

/**
 * Build optional datalist attributes (recherche, filtres, export) from state.
 */
function buildDatalistAttrs(): string {
  let attrs = '';
  if (state.datalistRecherche) attrs += '\n    recherche';
  const exportFormats: string[] = [];
  if (state.datalistExportCsv) exportFormats.push('csv');
  if (state.datalistExportHtml) exportFormats.push('html');
  if (exportFormats.length > 0) attrs += `\n    export="${exportFormats.join(',')}"`;

  const filtrables = state.datalistColumns.filter(c => c.visible && c.filtrable).map(c => c.field);
  if (state.datalistFiltres && filtrables.length > 0) {
    attrs += `\n    filtres="${filtrables.join(',')}"`;
  }
  return attrs;
}

/**
 * Main orchestrator: reads form state, validates, routes to correct code gen path.
 */
export async function generateChart(): Promise<void> {
  // Get current values from form
  const labelField = document.getElementById('label-field') as HTMLSelectElement | null;
  const valueField = document.getElementById('value-field') as HTMLSelectElement | null;
  const codeField = document.getElementById('code-field') as HTMLSelectElement | null;
  const aggregation = document.getElementById('aggregation') as HTMLSelectElement | null;
  const sortOrder = document.getElementById('sort-order') as HTMLSelectElement | null;

  if (labelField) state.labelField = labelField.value;
  if (valueField) state.valueField = valueField.value;
  // Sync valueField2 from extraSeries for backward compat
  state.valueField2 = state.extraSeries.length > 0 ? state.extraSeries[0].field : '';
  state.codeField = codeField?.value || '';
  if (aggregation) state.aggregation = aggregation.value as typeof state.aggregation;
  if (sortOrder) state.sortOrder = sortOrder.value as typeof state.sortOrder;

  const isKPI = state.chartType === 'kpi';
  const isGauge = state.chartType === 'gauge';
  const isDatalist = state.chartType === 'datalist';
  const isMap = state.chartType === 'map';
  const isSingleValue = isKPI || isGauge;

  // Validation: datalist only needs labelField, KPI/Gauge need valueField, charts need both
  if (isDatalist && !state.labelField) {
    toastWarning('Il manque la s\u00e9lection des colonnes. Ouvrez la section "Configuration des donn\u00e9es" pour choisir le champ principal du tableau.');
    return;
  }
  if (!isSingleValue && !isDatalist && (!state.labelField || !state.valueField)) {
    const missing = !state.labelField && !state.valueField
      ? 'les champs pour l\'axe X (cat\u00e9gories) et l\'axe Y (valeurs num\u00e9riques)'
      : !state.labelField
        ? 'le champ pour l\'axe X (ex\u00a0: r\u00e9gion, ann\u00e9e)'
        : 'le champ pour l\'axe Y (ex\u00a0: population, budget)';
    toastWarning(`Il manque ${missing}. Ouvrez la section "Configuration des donn\u00e9es".`);
    return;
  }
  if (isSingleValue && !state.valueField && state.aggregation !== 'count') {
    toastWarning('Il manque le champ num\u00e9rique \u00e0 mesurer. S\u00e9lectionnez un champ dans "Axe Y / Valeurs" (ex\u00a0: population, budget).');
    return;
  }

  // Datalist: route to local data path (no aggregation needed)
  if (isDatalist) {
    if (state.sourceType === 'saved' && state.localData && state.localData.length > 0) {
      generateChartFromLocalData();
    } else {
      // For API sources, use raw data — limit=200 to fetch all records
      const params = new URLSearchParams({ limit: '200' });
      if (state.advancedMode && state.queryFilter) {
        const odsql = filterToOdsql(state.queryFilter);
        if (odsql) params.set('where', odsql);
      }
      const apiUrl = `${state.apiUrl}?${params}`;
      try {
        state.data = await fetchOdsResults(apiUrl);
        state.localData = state.data as Record<string, unknown>[];
        generateCode(apiUrl);
      } catch (error) {
        toastError('Erreur lors du chargement des donn\u00e9es : ' + (error as Error).message);
      }
    }
    return;
  }

  // Check if using local data
  // For ODS API sources, prefer server-side aggregation (more accurate
  // than client-side aggregation on the limited local data sample).
  // Non-ODS APIs (Tabular, Generic) use client-side aggregation because
  // fetchOdsResults() only handles ODS response format (json.results).
  const isOdsApiSource = state.savedSource?.type === 'api' && state.apiUrl
    && detectProvider(state.apiUrl).id === 'opendatasoft';
  if (state.sourceType === 'saved' && state.localData && state.localData.length > 0 && !isOdsApiSource) {
    generateChartFromLocalData();
    return;
  }

  // Build API URL with aggregation
  const valueExpression = state.aggregation === 'count'
    ? 'count(*) as value'
    : `${state.aggregation}(${state.valueField}) as value`;

  // Handle extra series if defined
  const activeExtraSeries = state.extraSeries.filter(s => s.field && ['bar', 'horizontalBar', 'line', 'radar'].includes(state.chartType));
  let extraValueExpressions = '';
  activeExtraSeries.forEach((s, i) => {
    extraValueExpressions += `, ${state.aggregation}(${s.field}) as value${i + 2}`;
  });

  let params: URLSearchParams;
  if (isSingleValue) {
    // KPI/Gauge: just get the single aggregated value, no group_by
    params = new URLSearchParams({
      select: valueExpression,
      limit: '1',
    });
  } else if (isMap) {
    // Map: group by code field — limit=200 to fetch all departments (API default is 10)
    params = new URLSearchParams({
      select: `${state.codeField}, ${valueExpression}`,
      group_by: state.codeField,
      limit: '200',
    });
  } else {
    // Chart: group by label field — limit=200 to fetch all categories
    params = new URLSearchParams({
      select: `${state.labelField}, ${valueExpression}${extraValueExpressions}`,
      group_by: state.labelField,
      order_by: `value ${state.sortOrder}`,
      limit: '200',
    });
  }

  // Apply advanced mode filter to API request
  if (state.advancedMode && state.queryFilter) {
    const odsql = filterToOdsql(state.queryFilter);
    if (odsql) params.set('where', odsql);
  }

  const apiUrl = `${state.apiUrl}?${params}`;

  try {
    state.data = await fetchOdsResults(apiUrl);

    // Update raw data view
    const rawDataEl = document.getElementById('raw-data');
    if (rawDataEl) rawDataEl.textContent = JSON.stringify(state.data, null, 2);

    // Generate code: dynamic mode uses dsfr-data-source components, embedded uses inline JS
    if (state.generationMode === 'dynamic' && state.savedSource?.type === 'api') {
      generateDynamicCodeForApi();
    } else {
      generateCode(apiUrl);
    }

    // Update accessible table (only for charts)
    if (!isKPI) {
      updateAccessibleTable();
    }
  } catch (error) {
    console.error(error);
    toastError('Erreur lors du chargement des donn\u00e9es : ' + (error as Error).message);
  }
}

/**
 * Aggregate local data client-side, render, and generate code.
 */
export function generateChartFromLocalData(): void {
  // Datalist: skip aggregation, use raw data
  if (state.chartType === 'datalist') {
    let filteredLocal = state.localData || [];
    if (state.advancedMode && state.queryFilter) {
      filteredLocal = applyLocalFilter(filteredLocal as Record<string, unknown>[], state.queryFilter);
    }
    state.data = filteredLocal as any[];

    const rawDataEl = document.getElementById('raw-data');
    if (rawDataEl) rawDataEl.textContent = JSON.stringify(state.data, null, 2);

    if (state.generationMode === 'dynamic') {
      if (state.savedSource?.type === 'grist') {
        generateDynamicCode();
      } else if (state.savedSource?.type === 'api') {
        generateDynamicCodeForApi();
      } else {
        generateCodeForLocalData();
      }
    } else {
      generateCodeForLocalData();
    }
    return;
  }

  // Aggregate local data
  const aggregated: Record<string, { values: number[]; extraValues: number[][]; count: number }> = {};

  // For maps, aggregate by codeField; for other charts, by labelField
  const isMap = state.chartType === 'map';
  const groupField = isMap ? state.codeField : state.labelField;
  const activeExtraSeries = state.extraSeries.filter(s => s.field && ['bar', 'horizontalBar', 'line', 'radar'].includes(state.chartType));

  // Apply advanced mode filter to local data
  let filteredLocal = state.localData || [];
  if (state.advancedMode && state.queryFilter) {
    filteredLocal = applyLocalFilter(filteredLocal as Record<string, unknown>[], state.queryFilter);
  }

  if (filteredLocal) {
    filteredLocal.forEach(record => {
      const rawGroupKey = record[groupField] as string | number | null;
      // For maps, skip records with invalid codes
      if (isMap && (rawGroupKey === null || rawGroupKey === undefined || rawGroupKey === '')) {
        return; // Skip this record
      }
      const groupKey = String(rawGroupKey || 'N/A');
      const value = toNumber(record[state.valueField]);

      if (!aggregated[groupKey]) {
        aggregated[groupKey] = { values: [], extraValues: activeExtraSeries.map(() => []), count: 0 };
      }
      aggregated[groupKey].values.push(value);
      activeExtraSeries.forEach((s, i) => {
        aggregated[groupKey].extraValues[i].push(toNumber(record[s.field]));
      });
      aggregated[groupKey].count++;
    });
  }

  // Apply aggregation function
  function applyAgg(vals: number[], count: number): number {
    switch (state.aggregation) {
      case 'sum': return vals.reduce((a, b) => a + b, 0);
      case 'count': return count;
      case 'min': return Math.min(...vals);
      case 'max': return Math.max(...vals);
      case 'avg':
      default: return vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  }

  let results = Object.entries(aggregated).map(([groupKey, data]) => {
    const value = applyAgg(data.values, data.count);
    const result: Record<string, unknown> = { value };

    // For maps, include codeField; for others, include labelField
    if (isMap) {
      result[state.codeField] = groupKey;
    } else {
      result[state.labelField] = groupKey;
    }

    // Extra series
    activeExtraSeries.forEach((_, i) => {
      if (data.extraValues[i].length > 0) {
        result[`value${i + 2}`] = applyAgg(data.extraValues[i], data.count);
      }
    });

    return result;
  });

  // Sort
  results.sort((a, b) => {
    return state.sortOrder === 'desc'
      ? (b.value as number) - (a.value as number)
      : (a.value as number) - (b.value as number);
  });

  state.data = results;

  // Update raw data view
  const rawDataEl = document.getElementById('raw-data');
  if (rawDataEl) rawDataEl.textContent = JSON.stringify(state.data, null, 2);

  // Generate code based on mode
  if (state.generationMode === 'dynamic') {
    if (state.savedSource?.type === 'grist') {
      generateDynamicCode();
    } else if (state.savedSource?.type === 'api') {
      generateDynamicCodeForApi();
    } else {
      generateCodeForLocalData();
    }
  } else {
    generateCodeForLocalData();
  }

  // Update accessible table
  updateAccessibleTable();
}

/**
 * Generate embedded HTML+JS code for local data.
 */
export function generateCodeForLocalData(): void {
  // Handle KPI type
  if (state.chartType === 'kpi') {
    const value = state.data[0]?.value || 0;
    const variantSelect = document.getElementById('kpi-variant') as HTMLSelectElement | null;
    const unitInput = document.getElementById('kpi-unit') as HTMLInputElement | null;
    const variant = variantSelect?.value || '';
    const unit = unitInput?.value || '';

    const code = `<!-- KPI g\u00e9n\u00e9r\u00e9 avec dsfr-data Builder -->
<!-- Source : ${state.savedSource?.name || 'Donn\u00e9es locales'} -->

<!-- D\u00e9pendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<style>
.kpi-card {
  background: var(--background-default-grey);
  border-left: 4px solid var(--border-default-grey);
  padding: 1.5rem 2rem;
  text-align: center;
  border-radius: 4px;
}
.kpi-card--info { border-left-color: #0063CB; }
.kpi-card--success { border-left-color: #18753C; }
.kpi-card--warning { border-left-color: #D64D00; }
.kpi-card--error { border-left-color: #C9191E; }
.kpi-value { display: block; font-size: 2.5rem; font-weight: 700; color: var(--text-title-grey); }
.kpi-label { display: block; font-size: 0.875rem; color: var(--text-mention-grey); margin-top: 0.5rem; }
</style>

<div class="fr-container fr-my-4w">
  <div class="kpi-card${variant ? ' kpi-card--' + variant : ''}">
    <span class="kpi-value">${formatKPIValue(value, unit)}</span>
    <span class="kpi-label">${escapeHtml(state.title)}</span>
  </div>
</div>`;
    displayGeneratedCode(code);
    return;
  }

  // Handle Gauge type (local data)
  if (state.chartType === 'gauge') {
    const value = Math.round(state.data[0]?.value || 0);
    const code = `<!-- Jauge g\u00e9n\u00e9r\u00e9e avec dsfr-data Builder -->
<!-- Source : ${state.savedSource?.name || 'Donn\u00e9es locales'} -->

<!-- D\u00e9pendances (DSFR Chart) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(state.title)}</h2>
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}
  <gauge-chart percent="${value}" init="0" target="100"></gauge-chart>
</div>`;
    displayGeneratedCode(code);
    return;
  }

  // Handle Datalist type (local data)
  if (state.chartType === 'datalist') {
    const colonnes = buildColonnesAttr();
    const triAttr = state.sortOrder !== 'none' && state.labelField
      ? `\n    tri="${state.labelField}:${state.sortOrder}"` : '';
    const code = `<!-- Tableau genere avec dsfr-data Builder -->
<!-- Source : ${state.savedSource?.name || 'Donnees locales'} -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dependances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

  <dsfr-data-list
    id="my-table"
    colonnes="${colonnes}"${buildDatalistAttrs()}${triAttr}
    pagination="10">
  </dsfr-data-list>${generateEmbeddedA11y('my-table')}
</div>

<script>
// Donnees integrees
const data = ${JSON.stringify(state.localData?.slice(0, 500) || [], null, 2)};

// Injecter les donnees dans le composant
const datalist = document.getElementById('my-table');
datalist.onSourceData(data);
<\/script>`;
    displayGeneratedCode(code);
    return;
  }

  // Handle Scatter type (local data)
  if (state.chartType === 'scatter') {
    const xValues = state.data.map(d => (d[state.labelField] as number) || 0);
    const yValues = state.data.map(d => (d.value as number) || 0);
    const code = `<!-- Nuage de points genere avec dsfr-data Builder -->
<!-- Source : ${state.savedSource?.name || 'Donnees locales'} -->

<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>${a11yDep()}

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(state.title)}</h2>

  ${wrapWithDatabox(`<scatter-chart id="chart"
    x='${escapeSingleQuotes(JSON.stringify([xValues]))}'
    y='${escapeSingleQuotes(JSON.stringify([yValues]))}'
    name='${escapeSingleQuotes(JSON.stringify([`${state.labelField} vs ${state.valueField}`]))}'
    selected-palette="${state.palette}">
  </scatter-chart>`, 'chart')}${generateEmbeddedA11y('chart')}
</div>${dsfrDeferredScript('scatter-chart')}`;
    displayGeneratedCode(code);
    return;
  }

  // Handle Map type (local data)
  if (state.chartType === 'map') {
    // For choropleth maps, use sequential or divergent palette for gradient
    const mapPalette = state.palette.includes('sequential') || state.palette.includes('divergent')
      ? state.palette
      : 'sequentialAscending';

    // Transform data to DSFR format: {"code": value, ...}
    const mapData: Record<string, number> = {};
    let totalValue = 0;
    let count = 0;

    state.data.forEach(d => {
      const rawCode = (d[state.codeField] ?? (d as any).code ?? '') as string | number;
      let code = String(rawCode).trim();
      if (/^\d+$/.test(code) && code.length < 3) {
        code = code.padStart(2, '0');
      }
      const value = (d.value as number) || 0;
      if (isValidDeptCode(code) && !isNaN(value)) {
        mapData[code] = Math.round(value * 100) / 100;
        totalValue += value;
        count++;
      }
    });

    const avgValue = count > 0 ? Math.round((totalValue / count) * 100) / 100 : 0;
    const today = new Date().toISOString().split('T')[0];

    const mapCode = `<!-- Carte g\u00e9n\u00e9r\u00e9e avec dsfr-data Builder -->
<!-- Source : ${state.savedSource?.name || 'Donn\u00e9es locales'} -->
<!-- Palette: ${mapPalette} -->

<!-- D\u00e9pendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>${a11yDep()}

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(state.title)}</h2>
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}
  ${wrapWithDatabox(`<map-chart id="chart"
    data='${JSON.stringify(mapData)}'
    name="${escapeHtml(state.title || 'Donn\u00e9es')}"
    date="${today}"
    value="${avgValue}"
    selected-palette="${mapPalette}"
  ></map-chart>`, 'chart')}${generateEmbeddedA11y('chart')}
</div>${dsfrDeferredScript('map-chart')}`;
    displayGeneratedCode(mapCode);
    return;
  }

  // Build DSFR Chart element for static embed
  const labels = state.data.map(d => (d[state.labelField] as string) || 'N/A');
  const values = state.data.map(d => Math.round(((d.value as number) || 0) * 100) / 100);

  const activeExtraSeries = state.extraSeries.filter(s => s.field && ['bar', 'horizontalBar', 'line', 'radar'].includes(state.chartType));
  const allSeriesValues: number[][] = [values];
  const allSeriesNames: string[] = [state.valueFieldLabel || state.valueField];

  activeExtraSeries.forEach((s, i) => {
    allSeriesValues.push(state.data.map(d => Math.round(((d[`value${i + 2}`] as number) || 0) * 100) / 100));
    allSeriesNames.push(s.label || s.field);
  });

  const dsfrTag = DSFR_TAG_MAP[state.chartType] || 'bar-chart';
  const x = JSON.stringify([labels]);
  const y = allSeriesValues.length > 1 ? JSON.stringify(allSeriesValues) : JSON.stringify([values]);
  const seriesNames = JSON.stringify(allSeriesNames);

  // Build extra attributes
  const extraAttrs: string[] = [];
  if (state.chartType === 'horizontalBar') extraAttrs.push('horizontal');
  if (state.chartType === 'pie') extraAttrs.push('fill');
  const extraStr = extraAttrs.map(a => `\n    ${a}`).join('');

  const code = `<!-- Graphique genere avec dsfr-data Builder -->
<!-- Source : ${state.savedSource?.name || 'Donnees locales'} -->

<!-- Dependances (DSFR + DSFR Chart) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>${a11yDep()}

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(state.title)}</h2>
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

  ${wrapWithDatabox(`<${dsfrTag} id="chart"
    x='${escapeSingleQuotes(x)}'
    y='${escapeSingleQuotes(y)}'
    name='${escapeSingleQuotes(seriesNames)}'
    selected-palette="${state.palette}"${extraStr}>
  </${dsfrTag}>`, 'chart')}${generateEmbeddedA11y('chart')}
</div>${dsfrDeferredScript(dsfrTag)}`;

  displayGeneratedCode(code);
}


/**
 * Generate <dsfr-data-source> + <dsfr-data-query> for ODS sources.
 * Uses server-side aggregation (ODSQL) with automatic pagination.
 */
export function generateOdsQueryCode(
  odsInfo: { baseUrl: string; datasetId: string },
  labelFieldPath: string,
  valueFieldPath: string
): { queryElement: string; chartSource: string; labelField: string; valueField: string; valueField2: string; extraValueFields: string[] } {
  // --- dsfr-data-source attributes (fetch + server-side processing) ---
  const srcAttrs: string[] = [];
  srcAttrs.push('api-type="opendatasoft"');
  srcAttrs.push(`base-url="${odsInfo.baseUrl}"`);
  srcAttrs.push(`dataset-id="${odsInfo.datasetId}"`);

  // Group by
  const groupByField = state.advancedMode && state.queryGroupBy ? state.queryGroupBy : labelFieldPath;
  if (groupByField) {
    srcAttrs.push(`group-by="${groupByField}"`);
  }

  // Build ODSQL select clause with aggregation
  let resultValueField: string;
  let resultValueField2 = '';
  let selectParts: string[] = [];
  if (groupByField) selectParts.push(groupByField);

  const activeExtraSeries = state.extraSeries.filter(s => s.field && ['bar', 'horizontalBar', 'line', 'radar'].includes(state.chartType));
  const extraValueFields: string[] = [];

  if (state.advancedMode && state.queryAggregate) {
    // Advanced mode: parse custom aggregation expressions
    const aggParts = state.queryAggregate.split(',').map(a => a.trim());
    for (const agg of aggParts) {
      const segs = agg.split(':');
      if (segs.length >= 2) {
        const field = segs[0];
        const func = segs[1];
        const alias = segs[2] || `${field}__${func}`;
        selectParts.push(`${func}(${field}) as ${alias}`);
      }
    }
    const firstAgg = aggParts[0].split(':');
    resultValueField = firstAgg[2] || `${firstAgg[0]}__${firstAgg[1]}`;
  } else {
    // Standard mode: use form aggregation
    if (state.aggregation === 'count') {
      selectParts.push('count(*) as count');
      resultValueField = 'count';
    } else {
      const alias = `${valueFieldPath}__${state.aggregation}`;
      selectParts.push(`${state.aggregation}(${valueFieldPath}) as ${alias}`);
      resultValueField = alias;

      // Add extra series aggregations
      activeExtraSeries.forEach(s => {
        const aliasN = `${s.field}__${state.aggregation}`;
        selectParts.push(`${state.aggregation}(${s.field}) as ${aliasN}`);
        extraValueFields.push(aliasN);
      });
      if (extraValueFields.length > 0) resultValueField2 = extraValueFields[0];
    }
  }
  srcAttrs.push(`select="${escapeHtml(selectParts.join(', '))}"`);

  // Where / filter (static clause on source)
  if (state.advancedMode && state.queryFilter) {
    const odsql = filterToOdsql(state.queryFilter);
    if (odsql) srcAttrs.push(`where="${escapeHtml(odsql)}"`);
  }

  // --- dsfr-data-query attributes (client-side post-processing) ---
  const qAttrs: string[] = [];
  qAttrs.push('source="chart-src"');
  if (state.sortOrder && state.sortOrder !== 'none') {
    qAttrs.push(`order-by="${resultValueField}:${state.sortOrder}"`);
  }

  const queryElement = `
  <!-- Source ODS avec agregation serveur et pagination automatique -->
  <dsfr-data-source
    id="chart-src"
    ${srcAttrs.join('\n    ')}>
  </dsfr-data-source>
  <dsfr-data-query
    id="query-data"
    ${qAttrs.join('\n    ')}>
  </dsfr-data-query>`;

  return {
    queryElement,
    chartSource: 'query-data',
    labelField: groupByField,
    valueField: resultValueField,
    valueField2: resultValueField2,
    extraValueFields,
  };
}

/**
 * Generate <dsfr-data-source> + <dsfr-data-query> for Tabular API sources.
 * Source handles pagination (up to 50K records), query handles client-side aggregation.
 */
export function generateTabularQueryCode(
  tabularInfo: { baseUrl: string; resourceId: string },
  labelFieldPath: string,
  valueFieldPath: string
): { queryElement: string; chartSource: string; labelField: string; valueField: string; valueField2: string; extraValueFields: string[] } {
  // --- dsfr-data-source attributes (fetch + auto-pagination) ---
  const srcAttrs: string[] = [];
  srcAttrs.push('api-type="tabular"');
  srcAttrs.push(`base-url="${tabularInfo.baseUrl}"`);
  srcAttrs.push(`resource="${tabularInfo.resourceId}"`);

  // --- dsfr-data-query attributes (client-side aggregation) ---
  const qAttrs: string[] = [];
  qAttrs.push('source="chart-src"');

  // Group by
  const groupByField = state.advancedMode && state.queryGroupBy ? state.queryGroupBy : labelFieldPath;
  if (groupByField) {
    qAttrs.push(`group-by="${groupByField}"`);
  }

  // Aggregation (colon syntax for client-side processing)
  let resultValueField: string;
  let resultValueField2 = '';
  let aggregateExpr: string;

  const activeExtraSeries = state.extraSeries.filter(s => s.field && ['bar', 'horizontalBar', 'line', 'radar'].includes(state.chartType));
  const extraValueFields: string[] = [];

  if (state.advancedMode && state.queryAggregate) {
    aggregateExpr = state.queryAggregate;
    const firstAgg = aggregateExpr.split(',')[0].trim();
    const parts = firstAgg.split(':');
    resultValueField = parts.length >= 2 ? `${parts[0]}__${parts[1]}` : groupByField;
  } else {
    aggregateExpr = `${valueFieldPath}:${state.aggregation}`;
    resultValueField = `${valueFieldPath}__${state.aggregation}`;

    activeExtraSeries.forEach(s => {
      const info = state.fields.find(f => f.name === s.field);
      const path = info?.fullPath || s.field;
      aggregateExpr += `, ${path}:${state.aggregation}`;
      extraValueFields.push(`${path}__${state.aggregation}`);
    });
    if (extraValueFields.length > 0) resultValueField2 = extraValueFields[0];
  }
  qAttrs.push(`aggregate="${escapeHtml(aggregateExpr)}"`);

  // Filter (colon syntax)
  if (state.advancedMode && state.queryFilter) {
    qAttrs.push(`filter="${escapeHtml(state.queryFilter)}"`);
  }

  // Order by
  if (state.sortOrder && state.sortOrder !== 'none') {
    qAttrs.push(`order-by="${resultValueField}:${state.sortOrder}"`);
  }

  const queryElement = `
  <!-- Source Tabular avec pagination automatique -->
  <dsfr-data-source
    id="chart-src"
    ${srcAttrs.join('\n    ')}>
  </dsfr-data-source>
  <!-- Agregation client-side -->
  <dsfr-data-query
    id="query-data"
    ${qAttrs.join('\n    ')}>
  </dsfr-data-query>`;

  return {
    queryElement,
    chartSource: 'query-data',
    labelField: groupByField,
    valueField: resultValueField,
    valueField2: resultValueField2,
    extraValueFields,
  };
}

/**
 * Generate dsfr-data-query HTML for dynamic mode.
 * Always generates a <dsfr-data-query> to handle aggregation, sorting and filtering.
 * Returns { queryElement, chartSource, labelField, valueField }.
 */
export function generateDsfrDataQueryCode(
  sourceId: string,
  labelFieldPath: string,
  valueFieldPath: string
): { queryElement: string; chartSource: string; labelField: string; valueField: string; valueField2: string; extraValueFields: string[] } {
  const attrs: string[] = [];
  attrs.push(`source="${sourceId}"`);

  // Group by: advanced custom field or default labelField
  const groupByField = state.advancedMode && state.queryGroupBy ? state.queryGroupBy : labelFieldPath;
  if (groupByField) {
    attrs.push(`group-by="${groupByField}"`);
  }

  // Filters (advanced mode only)
  if (state.advancedMode && state.queryFilter) {
    attrs.push(`filter="${escapeHtml(state.queryFilter)}"`);
  }

  // Aggregations: advanced custom or default from form
  let aggregateExpr: string;
  let sortField: string;
  let resultValueField: string;
  let resultValueField2 = '';

  const activeExtraSeries = state.extraSeries.filter(s => s.field && ['bar', 'horizontalBar', 'line', 'radar'].includes(state.chartType));
  const extraValueFields: string[] = [];

  if (state.advancedMode && state.queryAggregate) {
    aggregateExpr = state.queryAggregate;
    const firstAgg = aggregateExpr.split(',')[0].trim();
    const parts = firstAgg.split(':');
    sortField = parts.length >= 2 ? `${parts[0]}__${parts[1]}` : groupByField;
    resultValueField = sortField;
  } else {
    aggregateExpr = `${valueFieldPath}:${state.aggregation}`;
    // Add extra series aggregations
    activeExtraSeries.forEach(s => {
      const info = state.fields.find(f => f.name === s.field);
      const path = info?.fullPath || s.field;
      aggregateExpr += `, ${path}:${state.aggregation}`;
      extraValueFields.push(`${path}__${state.aggregation}`);
    });
    if (extraValueFields.length > 0) resultValueField2 = extraValueFields[0];
    sortField = `${valueFieldPath}__${state.aggregation}`;
    resultValueField = sortField;
  }
  attrs.push(`aggregate="${escapeHtml(aggregateExpr)}"`);

  // Sort
  if (state.sortOrder && state.sortOrder !== 'none') {
    attrs.push(`order-by="${sortField}:${state.sortOrder}"`);
  }

  const comment = state.advancedMode
    ? '<!-- Requete avancee (filtrage et agregation) -->'
    : '<!-- Agregation et tri des donnees -->';

  const queryElement = `
  ${comment}
  <dsfr-data-query
    id="query-data"
    ${attrs.join('\n    ')}>
  </dsfr-data-query>`;

  return {
    queryElement,
    chartSource: 'query-data',
    labelField: groupByField,
    valueField: resultValueField,
    valueField2: resultValueField2,
    extraValueFields,
  };
}

/**
 * Generate code using dsfr-data-source + dsfr-data-chart for Grist sources.
 */
export function generateDynamicCode(): void {
  const source = state.savedSource;
  if (!source || source.type !== 'grist') return;

  // Build full proxy URL via ProviderConfig knownHosts
  const gristProvider = getProvider('grist');
  let proxyUrl = source.apiUrl || '';
  let gristHost = 'Grist';

  for (const host of gristProvider.knownHosts) {
    if (source.apiUrl?.includes(host.hostname)) {
      proxyUrl = `${PROXY_BASE_URL}${host.proxyEndpoint}/api/docs/${source.documentId}/tables/${source.tableId}/records`;
      gristHost = host.hostname;
      break;
    }
  }

  // Get field info for labels
  const labelFieldInfo = state.fields.find(f => f.name === state.labelField);
  const valueFieldInfo = state.fields.find(f => f.name === state.valueField);

  // After normalize flatten, data has flat field names (not nested fields.X)
  const isFlattened = state.normalizeConfig.enabled && !!state.normalizeConfig.flatten;
  const labelFieldPath = isFlattened ? state.labelField : (labelFieldInfo?.fullPath || `fields.${state.labelField}`);
  const valueFieldPath = isFlattened ? state.valueField : (valueFieldInfo?.fullPath || `fields.${state.valueField}`);

  const refreshAttr = state.refreshInterval > 0 ? `\n    refresh="${state.refreshInterval}"` : '';

  // Grist data has {fields: {X: ...}} structure — prefix facet field paths when not flattened
  const gristFacetsMode: FacetsMode | undefined = isFlattened ? undefined : { fieldPrefix: 'fields.' };

  // Handle KPI type (no DSFR Chart equivalent, fallback to embedded)
  if (state.chartType === 'kpi') {
    generateCodeForLocalData();
    return;
  }

  // Handle Datalist type (Grist dynamic)
  if (state.chartType === 'datalist') {
    const colonnes = buildColonnesAttr();
    const triAttr = state.sortOrder !== 'none' && state.labelField
      ? `\n    tri="${state.labelField}:${state.sortOrder}"` : '';
    const { elements: middlewareHtml, finalSourceId: datalistSource } = generateMiddlewareElements('table-data', gristFacetsMode);
    const code = `<!-- Tableau dynamique genere avec dsfr-data Builder -->
<!-- Source : ${escapeHtml(source.name)} (chargement dynamique depuis ${gristHost}) -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dependances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

  <dsfr-data-source
    id="table-data"
    url="${proxyUrl}"
    transform="records"${refreshAttr}>
  </dsfr-data-source>
${middlewareHtml}
  <dsfr-data-list
    id="my-datalist"
    source="${datalistSource}"
    colonnes="${colonnes}"${buildDatalistAttrs()}${triAttr}
    pagination="10">
  </dsfr-data-list>${generateA11yElement(datalistSource, 'my-datalist')}
</div>`;
    displayGeneratedCode(code);
    return;
  }

  // Middleware (normalize, facets) between source and query
  const { elements: middlewareHtml, finalSourceId: querySourceId } = generateMiddlewareElements('chart-data', gristFacetsMode);

  // For maps, group by codeField (not labelField)
  const isMap = state.chartType === 'map' || state.chartType === ('mapReg' as any);
  const groupByPath = isMap && state.codeField
    ? (isFlattened ? state.codeField : (`fields.${state.codeField}`))
    : labelFieldPath;

  // Generate dsfr-data-query for aggregation, sorting, filtering
  const { queryElement, chartSource, labelField: queryLabelField, valueField: queryValueField, valueField2: queryValueField2, extraValueFields: queryExtraVFs } =
    generateDsfrDataQueryCode(querySourceId, groupByPath, valueFieldPath);

  // Map palette
  const palette = isMap
    ? (state.palette.includes('sequential') || state.palette.includes('divergent') ? state.palette : 'sequentialAscending')
    : state.palette;

  // Map-specific attributes
  const codeFieldAttr = isMap && state.codeField ? `\n    code-field="${state.codeField}"` : '';

  // Extra series attributes
  const extraVFs = queryExtraVFs;
  let extraFieldsAttr = '';
  let nameAttr = `name="${escapeHtml(state.title || state.valueField)}"`;

  if (extraVFs && extraVFs.length > 0) {
    extraFieldsAttr = `\n    value-fields="${extraVFs.join(',')}"`;
    // Build series names from labels
    const seriesNames = [state.valueFieldLabel || state.valueField, ...state.extraSeries.filter(s => s.field).map(s => s.label || s.field)];
    nameAttr = `name='${escapeSingleQuotes(JSON.stringify(seriesNames))}'`;
  } else if (queryValueField2) {
    extraFieldsAttr = `\n    value-field-2="${queryValueField2}"`;
  }

  const code = `<!-- Graphique dynamique genere avec dsfr-data Builder -->
<!-- Source : ${escapeHtml(source.name)} (chargement dynamique depuis ${gristHost}) -->
<!-- Les donnees sont chargees via le proxy ${PROXY_BASE_URL} -->
${state.advancedMode ? '<!-- Mode avance active : filtrage et agregation via dsfr-data-query -->' : ''}

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">

<!-- Dependances JS -->
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

  <!-- Source de donnees (via proxy CORS) -->
  <dsfr-data-source
    id="chart-data"
    url="${proxyUrl}"
    transform="records"${refreshAttr}>
  </dsfr-data-source>
${middlewareHtml}${queryElement}
  <!-- Graphique DSFR (se met a jour automatiquement) -->
  <dsfr-data-chart
    id="chart"
    source="${chartSource}"
    type="${state.chartType === 'horizontalBar' ? 'bar' : state.chartType === 'doughnut' ? 'pie' : state.chartType}"${dsfrChartAttrs()}${codeFieldAttr}
    label-field="${queryLabelField}"
    value-field="${queryValueField}"${extraFieldsAttr}
    ${nameAttr}
    selected-palette="${palette}"${generateDataboxAttrs()}>
  </dsfr-data-chart>${generateA11yElement(chartSource, 'chart')}
</div>`;

  displayGeneratedCode(code);
}

/**
 * Generate code using dsfr-data-source + dsfr-data-chart for API sources.
 */
export function generateDynamicCodeForApi(): void {
  const source = state.savedSource;
  if (!source || source.type !== 'api') return;

  // Detect provider and extract resource IDs using centralized infrastructure
  const provider = source.apiUrl ? detectProvider(source.apiUrl) : getProvider('generic');
  const resourceIds = source.apiUrl ? extractResourceIds(source.apiUrl, provider) : null;
  const apiBaseUrl = source.apiUrl ? new URL(source.apiUrl).origin : '';

  // Get field paths — after normalize flatten, data has flat field names
  const labelFieldInfo = state.fields.find(f => f.name === state.labelField);
  const valueFieldInfo = state.fields.find(f => f.name === state.valueField);

  const isFlattened = state.normalizeConfig.enabled && !!state.normalizeConfig.flatten;
  const labelFieldPath = isFlattened ? state.labelField : (labelFieldInfo?.fullPath || state.labelField);
  const valueFieldPath = isFlattened ? state.valueField : (valueFieldInfo?.fullPath || state.valueField);

  const refreshAttr = state.refreshInterval > 0 ? `\n    refresh="${state.refreshInterval}"` : '';

  // Handle data path transform
  const transformAttr = source.dataPath ? `\n    transform="${source.dataPath}"` : '';

  // Handle KPI type: use dsfr-data-source + dsfr-data-kpi for ODS/Tabular, fallback to embedded otherwise
  if (state.chartType === 'kpi') {
    if (provider.id === 'opendatasoft' && resourceIds?.datasetId) {
      const selectExpr = state.aggregation === 'count'
        ? 'count(*) as value'
        : `${state.aggregation}(${valueFieldPath}) as value`;
      const whereAttr = state.advancedMode && state.queryFilter
        ? `\n    where="${escapeHtml(filterToOdsql(state.queryFilter))}"` : '';
      const unitInput = document.getElementById('kpi-unit') as HTMLInputElement | null;
      const unit = unitInput?.value || '';
      const formatAttr = unit === '%' ? ' format="pourcentage"'
        : (unit === '\u20ac' || unit === 'EUR') ? ' format="euro"'
        : unit ? ' format="nombre"' : '';
      const code = `<!-- KPI dynamique genere avec dsfr-data Builder -->
<!-- Source : ${escapeHtml(source.name)} (agregation serveur) -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dependances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  <dsfr-data-source
    id="kpi-src"
    api-type="opendatasoft"
    base-url="${apiBaseUrl}"
    dataset-id="${resourceIds.datasetId}"
    select="${escapeHtml(selectExpr)}"${whereAttr}${refreshAttr}>
  </dsfr-data-source>
  <dsfr-data-kpi
    source="kpi-src"
    valeur="value"
    label="${escapeHtml(state.title)}"${formatAttr}>
  </dsfr-data-kpi>
</div>`;
      displayGeneratedCode(code);
      return;
    }
    // Non-ODS: fallback to embedded code with current data
    generateCodeForLocalData();
    return;
  }

  // Handle Datalist type (API dynamic)
  if (state.chartType === 'datalist') {
    const colonnes = buildColonnesAttr();
    const triAttr = state.sortOrder !== 'none' && state.labelField
      ? `\n    tri="${state.labelField}:${state.sortOrder}"` : '';

    if (provider.id === 'opendatasoft' && resourceIds?.datasetId) {
      const whereAttr = state.advancedMode && state.queryFilter
        ? `\n    where="${escapeHtml(filterToOdsql(state.queryFilter))}"` : '';
      // Facettes serveur ODS (fetch depuis l'API /facets)
      const facets = generateFacetsElement('table-query', { serverFacets: true });
      const datalistSource = facets.element ? facets.finalSourceId : 'table-query';
      const code = `<!-- Tableau dynamique genere avec dsfr-data Builder -->
<!-- Source : ${escapeHtml(source.name)} (pagination serveur : une page a la fois) -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dependances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

  <dsfr-data-source
    id="table-data"
    api-type="opendatasoft"
    base-url="${apiBaseUrl}"
    dataset-id="${resourceIds!.datasetId}"${whereAttr}
    server-side
    page-size="20">
  </dsfr-data-source>
  <dsfr-data-query
    id="table-query"
    source="table-data"
    server-side>
  </dsfr-data-query>
${facets.element}
  <dsfr-data-list
    id="my-datalist"
    source="${datalistSource}"
    colonnes="${colonnes}"${buildDatalistAttrs()}${triAttr}
    server-tri
    pagination="20">
  </dsfr-data-list>${generateA11yElement(datalistSource, 'my-datalist')}
</div>`;
      displayGeneratedCode(code);
      return;
    }

    if (provider.id === 'tabular' && resourceIds?.resourceId) {
      const filterAttr = state.advancedMode && state.queryFilter
        ? `\n    where="${escapeHtml(state.queryFilter)}"` : '';
      // Facettes pre-calculees (Tabular ne supporte pas les facettes serveur)
      const staticVals = computeStaticFacetValues();
      const facets = generateFacetsElement('table-query', staticVals ? { staticValues: staticVals } : undefined);
      const datalistSource = facets.element ? facets.finalSourceId : 'table-query';
      const code = `<!-- Tableau dynamique genere avec dsfr-data Builder -->
<!-- Source : ${escapeHtml(source.name)} (pagination serveur : une page a la fois) -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dependances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

  <dsfr-data-source
    id="table-data"
    api-type="tabular"
    base-url="${apiBaseUrl}"
    resource="${resourceIds!.resourceId}"${filterAttr}
    server-side
    page-size="20">
  </dsfr-data-source>
  <dsfr-data-query
    id="table-query"
    source="table-data"
    server-side>
  </dsfr-data-query>
${facets.element}
  <dsfr-data-list
    id="my-datalist"
    source="${datalistSource}"
    colonnes="${colonnes}"${buildDatalistAttrs()}${triAttr}
    server-tri
    pagination="20">
  </dsfr-data-list>${generateA11yElement(datalistSource, 'my-datalist')}
</div>`;
      displayGeneratedCode(code);
      return;
    }

    // Generic API: use dsfr-data-source (no automatic pagination)
    const { elements: middlewareHtml, finalSourceId: datalistSource } = generateMiddlewareElements('table-data');
    const code = `<!-- Tableau dynamique genere avec dsfr-data Builder -->
<!-- Source : ${escapeHtml(source.name)} (chargement dynamique) -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dependances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

  <dsfr-data-source
    id="table-data"
    url="${source.apiUrl}"${transformAttr}${refreshAttr}>
  </dsfr-data-source>
${middlewareHtml}
  <dsfr-data-list
    id="my-datalist"
    source="${datalistSource}"
    colonnes="${colonnes}"${buildDatalistAttrs()}${triAttr}
    pagination="10">
  </dsfr-data-list>${generateA11yElement(datalistSource, 'my-datalist')}
</div>`;
    displayGeneratedCode(code);
    return;
  }

  // For maps, group by codeField (not labelField)
  const isMap = state.chartType === 'map' || state.chartType === ('mapReg' as any);
  const groupByPath = isMap && state.codeField ? state.codeField : labelFieldPath;

  let queryElement: string;
  let chartSource: string;
  let queryLabelField: string;
  let queryValueField: string;
  let queryValueField2 = '';
  let queryExtraVFs: string[] = [];
  let sourceElement: string;
  let middlewareHtml = '';
  let facetsHtml = '';

  if (provider.id === 'opendatasoft' && resourceIds?.datasetId) {
    const odsInfo = { baseUrl: apiBaseUrl, datasetId: resourceIds.datasetId };
    const result = generateOdsQueryCode(odsInfo, groupByPath, valueFieldPath);
    queryElement = result.queryElement;
    chartSource = result.chartSource;
    queryLabelField = result.labelField;
    queryValueField = result.valueField;
    queryValueField2 = result.valueField2 || '';
    queryExtraVFs = result.extraValueFields;
    sourceElement = '';
    const facets = generateFacetsElement(chartSource);
    if (facets.element) { facetsHtml = facets.element; chartSource = facets.finalSourceId; }
  } else if (provider.id === 'tabular' && resourceIds?.resourceId) {
    const tabularInfo = { baseUrl: apiBaseUrl, resourceId: resourceIds.resourceId };
    const result = generateTabularQueryCode(tabularInfo, groupByPath, valueFieldPath);
    queryElement = result.queryElement;
    chartSource = result.chartSource;
    queryLabelField = result.labelField;
    queryValueField = result.valueField;
    queryValueField2 = result.valueField2 || '';
    queryExtraVFs = result.extraValueFields;
    sourceElement = '';
    const facets = generateFacetsElement(chartSource);
    if (facets.element) { facetsHtml = facets.element; chartSource = facets.finalSourceId; }
  } else {
    const mw = generateMiddlewareElements('chart-data');
    middlewareHtml = mw.elements;
    const result = generateDsfrDataQueryCode(mw.finalSourceId, groupByPath, valueFieldPath);
    queryElement = result.queryElement;
    chartSource = result.chartSource;
    queryLabelField = result.labelField;
    queryValueField = result.valueField;
    queryValueField2 = result.valueField2 || '';
    queryExtraVFs = result.extraValueFields;
    sourceElement = `
  <!-- Source de donnees API -->
  <dsfr-data-source
    id="chart-data"
    url="${source.apiUrl}"${transformAttr}${refreshAttr}>
  </dsfr-data-source>`;
  }

  // Map palette
  const palette = isMap
    ? (state.palette.includes('sequential') || state.palette.includes('divergent') ? state.palette : 'sequentialAscending')
    : state.palette;

  // Map-specific attributes
  const codeFieldAttr = isMap && state.codeField ? `\n    code-field="${state.codeField}"` : '';

  // Extra series attributes
  let extraFieldsAttr = '';
  let nameAttr = `name="${escapeHtml(state.title || state.valueField)}"`;

  if (queryExtraVFs.length > 0) {
    extraFieldsAttr = `\n    value-fields="${queryExtraVFs.join(',')}"`;
    const seriesNames = [state.valueFieldLabel || state.valueField, ...state.extraSeries.filter(s => s.field).map(s => s.label || s.field)];
    nameAttr = `name='${escapeSingleQuotes(JSON.stringify(seriesNames))}'`;
  } else if (queryValueField2) {
    extraFieldsAttr = `\n    value-field-2="${queryValueField2}"`;
  }

  const code = `<!-- Graphique dynamique genere avec dsfr-data Builder -->
<!-- Source : ${escapeHtml(source.name)} (chargement dynamique) -->
${state.advancedMode ? '<!-- Mode avance active : filtrage et agregation via dsfr-data-query -->' : ''}

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">

<!-- Dependances JS -->
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}
${sourceElement}${middlewareHtml}${queryElement}${facetsHtml}
  <!-- Graphique DSFR (se met a jour automatiquement) -->
  <dsfr-data-chart
    id="chart"
    source="${chartSource}"
    type="${state.chartType === 'horizontalBar' ? 'bar' : state.chartType === 'doughnut' ? 'pie' : state.chartType}"${dsfrChartAttrs()}${codeFieldAttr}
    label-field="${queryLabelField}"
    value-field="${queryValueField}"${extraFieldsAttr}
    ${nameAttr}
    selected-palette="${palette}"${generateDataboxAttrs()}>
  </dsfr-data-chart>${generateA11yElement(chartSource, 'chart')}
</div>`;

  displayGeneratedCode(code);
}

/**
 * Generate HTML+JS code for API-fetched data.
 */
export function generateCode(apiUrl: string): void {
  // Handle KPI type
  if (state.chartType === 'kpi') {
    const variantSelect = document.getElementById('kpi-variant') as HTMLSelectElement | null;
    const unitInput = document.getElementById('kpi-unit') as HTMLInputElement | null;
    const variant = variantSelect?.value || '';
    const unit = unitInput?.value || '';

    const code = `<!-- KPI g\u00e9n\u00e9r\u00e9 avec dsfr-data Builder -->

<!-- D\u00e9pendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<style>
.kpi-card {
  background: var(--background-default-grey);
  border-left: 4px solid var(--border-default-grey);
  padding: 1.5rem 2rem;
  text-align: center;
  border-radius: 4px;
}
.kpi-card--info { border-left-color: #0063CB; }
.kpi-card--success { border-left-color: #18753C; }
.kpi-card--warning { border-left-color: #D64D00; }
.kpi-card--error { border-left-color: #C9191E; }
.kpi-value { display: block; font-size: 2.5rem; font-weight: 700; color: var(--text-title-grey); }
.kpi-label { display: block; font-size: 0.875rem; color: var(--text-mention-grey); margin-top: 0.5rem; }
</style>

<div class="fr-container fr-my-4w">
  <div class="kpi-card${variant ? ' kpi-card--' + variant : ''}" id="kpi-container">
    <span class="kpi-value" id="kpi-value">\u2014</span>
    <span class="kpi-label">${escapeHtml(state.title)}</span>
  </div>
</div>

<script>
// URL de l'API avec agr\u00e9gation
const API_URL = '${apiUrl}';

function formatKPIValue(value, unit) {
  const num = Math.round(value * 100) / 100;
  if (unit === '\u20ac' || unit === 'EUR') {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  } else if (unit === '%') {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(num) + ' %';
  } else {
    const formatted = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(num);
    return unit ? formatted + ' ' + unit : formatted;
  }
}

async function loadKPI() {
  const response = await fetch(API_URL);
  const json = await response.json();
  const data = json.results || [];
  const value = data[0]?.value || 0;
  document.getElementById('kpi-value').textContent = formatKPIValue(value, '${unit}');
}

loadKPI();
<\/script>`;
    displayGeneratedCode(code);
    return;
  }

  // Handle Gauge type
  if (state.chartType === 'gauge') {
    const code = `<!-- Jauge g\u00e9n\u00e9r\u00e9e avec dsfr-data Builder -->

<!-- D\u00e9pendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(state.title)}</h2>
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}
  <div id="gauge-container"></div>
</div>

<script type="module">
const API_URL = '${apiUrl}';

async function loadGauge() {
  const response = await fetch(API_URL);
  const json = await response.json();
  const value = Math.round(json.results?.[0]?.value || 0);

  document.getElementById('gauge-container').innerHTML = \`
    <gauge-chart percent="\${value}" init="0" target="100"></gauge-chart>
  \`;
}

loadGauge();
<\/script>`;
    displayGeneratedCode(code);
    return;
  }

  // Handle Datalist type (API fetch)
  if (state.chartType === 'datalist') {
    const colonnes = buildColonnesAttr();
    const triAttr = state.sortOrder !== 'none' && state.labelField
      ? `\n    tri="${state.labelField}:${state.sortOrder}"` : '';
    const code = `<!-- Tableau genere avec dsfr-data Builder -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dependances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  ${state.title ? `<h2>${escapeHtml(state.title)}</h2>` : ''}
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}

  <dsfr-data-list
    id="my-table"
    colonnes="${colonnes}"${buildDatalistAttrs()}${triAttr}
    pagination="10">
  </dsfr-data-list>${generateEmbeddedA11y('my-table')}
</div>

<script>
const API_URL = '${apiUrl}';

${ODS_FETCH_HELPER}

async function loadTable() {
  const data = await fetchAllODS(API_URL);
  document.getElementById('my-table').onSourceData(data);
}

loadTable();
<\/script>`;
    displayGeneratedCode(code);
    return;
  }

  // Handle Scatter type
  if (state.chartType === 'scatter') {
    const code = `<!-- Nuage de points genere avec dsfr-data Builder -->

<!-- Dependances (DSFR + DSFR Chart) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>${a11yDep()}

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(state.title)}</h2>
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}
  <div id="scatter-container"></div>${generateEmbeddedA11y('scatter-container')}
</div>

<script type="module">
const API_URL = '${apiUrl}';

${ODS_FETCH_HELPER}

async function loadChart() {
  const data = await fetchAllODS(API_URL);

  const xValues = data.map(d => d['${state.labelField}'] || 0);
  const yValues = data.map(d => d.value || 0);

  var el = document.createElement('scatter-chart');
  el.setAttribute('x', JSON.stringify([xValues]));
  el.setAttribute('y', JSON.stringify([yValues]));
  el.setAttribute('name', ${JSON.stringify(JSON.stringify([`${state.labelField} vs ${state.valueField}`]))});
  el.setAttribute('selected-palette', '${state.palette}');
  document.getElementById('scatter-container').appendChild(el);
}

loadChart();
<\/script>`;
    displayGeneratedCode(code);
    return;
  }

  // Handle Map type
  if (state.chartType === 'map') {
    // For choropleth maps, use sequential or divergent palette for gradient
    const mapPalette = state.palette.includes('sequential') || state.palette.includes('divergent')
      ? state.palette
      : 'sequentialAscending';

    const code = `<!-- Carte g\u00e9n\u00e9r\u00e9e avec dsfr-data Builder -->
<!-- Palette: ${mapPalette} -->

<!-- D\u00e9pendances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>${a11yDep()}

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(state.title)}</h2>
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}
  <div id="map-container"></div>${generateEmbeddedA11y('map-container')}
</div>

<script type="module">
const API_URL = '${apiUrl}';

${ODS_FETCH_HELPER}

// Valide un code de d\u00e9partement fran\u00e7ais
function isValidDeptCode(code) {
  if (!code || typeof code !== 'string') return false;
  if (['N/A', 'null', 'undefined', '00', ''].includes(code)) return false;
  if (code === '2A' || code === '2B') return true;
  if (/^97[1-6]$/.test(code)) return true;
  if (/^(0[1-9]|[1-8]\\d|9[0-5])$/.test(code)) return true;
  return false;
}

async function loadMap() {
  const records = await fetchAllODS(API_URL);

  // Transformer les donn\u00e9es en format carte: {"code": valeur, ...}
  const mapData = {};
  records.forEach(d => {
    let code = String(d['${state.codeField}'] || '').trim();
    if (/^\\d+$/.test(code) && code.length < 3) {
      code = code.padStart(2, '0');
    }
    const value = d.value || 0;
    if (isValidDeptCode(code)) {
      mapData[code] = Math.round(value * 100) / 100;
    }
  });

  var el = document.createElement('map-chart');
  el.setAttribute('data', JSON.stringify(mapData));
  el.setAttribute('name', '${escapeHtml(state.title)}');
  el.setAttribute('selected-palette', '${mapPalette}');
  // Compute national average
  var vals = Object.values(mapData);
  var avg = vals.length ? Math.round(vals.reduce(function(a,b){return a+b},0) / vals.length * 100) / 100 : 0;
  el.setAttribute('value', String(avg));
  el.setAttribute('date', new Date().toISOString().split('T')[0]);
  document.getElementById('map-container').appendChild(el);
}

loadMap();
<\/script>`;
    displayGeneratedCode(code);
    return;
  }

  // Build DSFR Chart type and extra attributes
  const activeExtraSeriesCode = state.extraSeries.filter(s => s.field && ['bar', 'horizontalBar', 'line', 'radar'].includes(state.chartType));
  const dsfrTag = DSFR_TAG_MAP[state.chartType] || 'bar-chart';

  const extraAttrs: string[] = [];
  if (state.chartType === 'horizontalBar') extraAttrs.push('horizontal');
  if (state.chartType === 'pie') extraAttrs.push('fill');

  const seriesNames = activeExtraSeriesCode.length > 0
    ? JSON.stringify([state.valueFieldLabel || state.valueField, ...activeExtraSeriesCode.map(s => s.label || s.field)])
    : JSON.stringify([state.valueFieldLabel || state.valueField]);

  // Generate extra series extraction code
  const extraSeriesExtractCode = activeExtraSeriesCode.map((_, i) =>
    `\n  const values${i + 2} = data.map(d => Math.round((d.value${i + 2} || 0) * 100) / 100);`
  ).join('');
  const allValuesArrayCode = activeExtraSeriesCode.length > 0
    ? `JSON.stringify([values, ${activeExtraSeriesCode.map((_, i) => `values${i + 2}`).join(', ')}])`
    : 'JSON.stringify([values])';

  const code = `<!-- Graphique genere avec dsfr-data Builder -->

<!-- Dependances (DSFR + DSFR Chart) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>${a11yDep()}

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(state.title)}</h2>
  ${state.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(state.subtitle)}</p>` : ''}
  <div id="chart-container"></div>${generateEmbeddedA11y('chart-container')}
</div>

<script type="module">
// URL de l'API avec agregation
const API_URL = '${apiUrl}';

${ODS_FETCH_HELPER}

async function loadChart() {
  const data = await fetchAllODS(API_URL);

  const labels = data.map(d => d['${state.labelField}'] || 'N/A');
  const values = data.map(d => Math.round((d.value || 0) * 100) / 100);${extraSeriesExtractCode}

  const y = ${allValuesArrayCode};

  var el = document.createElement('${dsfrTag}');
  el.setAttribute('x', JSON.stringify([labels]));
  el.setAttribute('y', y);
  el.setAttribute('name', '${escapeSingleQuotes(seriesNames)}');
  el.setAttribute('selected-palette', '${state.palette}');${state.chartType === 'horizontalBar' ? `
  el.setAttribute('horizontal', '');` : ''}${state.chartType === 'pie' ? `
  el.setAttribute('fill', '');` : ''}
  document.getElementById('chart-container').appendChild(el);
}

loadChart();
<\/script>`;

  displayGeneratedCode(code);
}
