/**
 * Code generation - produces embeddable HTML+JS code for each chart type
 */

import {
  escapeHtml, DSFR_COLORS, isValidDeptCode, LIB_URL, CDN_URLS,
  detectProvider, extractResourceIds, filterToOdsql, formatKPIValue,
} from '@dsfr-data/shared';
import { state } from '../state.js';
import type { ChartConfig, AggregatedResult } from '../state.js';

/**
 * Build ODSQL select expression from aggregation config + group-by field.
 * Example: aggregation="sum", valueField="montant", groupBy="dept"
 * => "sum(montant) as montant__sum, dept"
 * This outputs the native ODS select param so the component doesn't need
 * to do aggregate-to-select conversion (works with any UMD version).
 */
function buildOdsSelect(aggregation: string, valueField: string, groupByField: string): { selectExpr: string; resultField: string } {
  const func = aggregation || 'sum';
  const odsFunc = func === 'count' ? 'count(*)' : `${func}(${valueField})`;
  const alias = func === 'count' ? 'count__count' : `${valueField}__${func}`;
  return {
    selectExpr: `${odsFunc} as ${alias}, ${groupByField}`,
    resultField: alias,
  };
}

/**
 * Auto-detect a geographic code field from the available fields.
 * Looks for common patterns: code_departement, code_dep, code_region, etc.
 */
function autoDetectCodeField(): string | undefined {
  const patterns = [
    /^code.?dep/i, /^dep.?code/i, /^code.?region/i, /^reg.?code/i,
    /^departement$/i, /^region$/i, /^code_geo/i, /^code_insee/i,
  ];
  for (const f of state.fields) {
    for (const p of patterns) {
      if (p.test(f.name)) return f.name;
    }
  }
  return undefined;
}

/**
 * Returns true if the current source has more records than we fetched locally
 * (e.g. ODS returned total_count > 100). This means generated code should use
 * dsfr-data-query with pagination instead of raw fetch or embedded data.
 */
function needsPagination(): boolean {
  return !!(state.source?.recordCount
    && state.localData
    && state.source.recordCount > state.localData.length);
}

/**
 * Generate embeddable HTML+JS code for the given chart config and data.
 * Supports different templates for: KPI, gauge, scatter, map, standard charts.
 * For API sources, generates dynamic code; otherwise, embeds data.
 */
export function generateCode(config: ChartConfig, data: AggregatedResult[]): void {
  const codeEl = document.getElementById('generated-code') as HTMLPreElement;

  // Handle KPI type
  if (config.type === 'kpi') {
    codeEl.textContent = generateKPICode(config, data);
    return;
  }

  // Handle gauge type
  if (config.type === 'gauge') {
    codeEl.textContent = generateGaugeCode(config, data);
    return;
  }

  // Handle scatter type
  if (config.type === 'scatter') {
    codeEl.textContent = generateScatterCode(config, data);
    return;
  }

  // Handle map type (department or region)
  if (config.type === 'map' || config.type === 'map-reg') {
    codeEl.textContent = generateMapCode(config, data);
    return;
  }

  // Handle datalist type
  if (config.type === 'datalist') {
    codeEl.textContent = generateDatalistCode(config);
    return;
  }

  // Handle podium type
  if (config.type === 'podium') {
    codeEl.textContent = generatePodiumCode(config, data);
    return;
  }

  // Handle standard chart types (bar, line, pie, doughnut, radar, horizontalBar, bar-line)
  codeEl.textContent = generateStandardChartCode(config, data);
}

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------

function generateKPICode(config: ChartConfig, data: AggregatedResult[]): string {
  const kpiValue = data[0]?.value || 0;
  const variant = config.variant || '';
  const unit = config.unit || '';

  // API-dynamic variant
  if (state.source?.type === 'api' && state.source?.apiUrl) {
    const valueExpr = config.aggregation === 'count'
      ? 'count(*) as value'
      : `${config.aggregation}(${config.valueField}) as value`;

    const params = new URLSearchParams({ select: valueExpr });
    if (config.where) {
      params.set('where', filterToOdsql(config.where));
    }
    const apiUrl = `${state.source.apiUrl}?${params}`;

    return `<!-- KPI genere avec dsfr-data Builder IA -->
<!-- Source API dynamique : les donnees se mettent a jour automatiquement -->

<!-- Dependances CSS (DSFR) -->
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
    <span class="kpi-label">${escapeHtml(config.title || 'Indicateur')}</span>
  </div>
</div>

<script>
// URL de l'API avec agregation ODSQL
const API_URL = '${apiUrl}';

function formatKPIValue(value, unit) {
  const num = Math.round(value * 100) / 100;
  if (unit === '\u20AC' || unit === 'EUR') {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  } else if (unit === '%') {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(num) + ' %';
  } else {
    const formatted = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(num);
    return unit ? formatted + ' ' + unit : formatted;
  }
}

async function loadKPI() {
  try {
    const response = await fetch(API_URL);
    const json = await response.json();
    const data = json.results || [];
    const value = data[0]?.value || 0;
    document.getElementById('kpi-value').textContent = formatKPIValue(value, '${unit}');
  } catch (error) {
    console.error('Erreur chargement KPI:', error);
    document.getElementById('kpi-value').textContent = 'Erreur';
  }
}

loadKPI();
<\/script>`;
  }

  // Embedded-data variant
  return `<!-- KPI genere avec dsfr-data Builder IA -->
<!-- Source : ${state.source?.name || 'Donnees locales'} - valeur embarquee -->

<!-- Dependances CSS (DSFR) -->
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
    <span class="kpi-value">${formatKPIValue(kpiValue, unit)}</span>
    <span class="kpi-label">${escapeHtml(config.title || 'Indicateur')}</span>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Gauge
// ---------------------------------------------------------------------------

function generateGaugeCode(config: ChartConfig, data: AggregatedResult[]): string {
  const gaugeValue = Math.round(data[0]?.value || 0);

  return `<!-- Jauge generee avec dsfr-data Builder IA -->
<!-- Source : ${state.source?.name || 'Donnees locales'} -->

<!-- Dependances (DSFR Chart) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(config.title || 'Jauge')}</h2>
  ${config.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(config.subtitle)}</p>` : ''}
  <gauge-chart percent="${gaugeValue}" init="0" target="100"></gauge-chart>
</div>`;
}

// ---------------------------------------------------------------------------
// Scatter
// ---------------------------------------------------------------------------

function generateScatterCode(config: ChartConfig, data: AggregatedResult[]): string {
  const scatterData = data.map(d => ({ x: parseFloat(d.label) || 0, y: d.value }));

  return `<!-- Nuage de points genere avec dsfr-data Builder IA -->
<!-- Source : ${state.source?.name || 'Donnees locales'} -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dependances JS -->
<script src="${CDN_URLS.chartJs}"><\/script>

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(config.title || 'Nuage de points')}</h2>
  ${config.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(config.subtitle)}</p>` : ''}

  <div id="chart-container" style="height: 400px; position: relative;">
    <canvas id="myChart"></canvas>
  </div>
</div>

<script>
// Donnees embarquees
const scatterData = ${JSON.stringify(scatterData, null, 2)};

new Chart(document.getElementById('myChart'), {
  type: 'scatter',
  data: {
    datasets: [{
      label: '${config.valueField}',
      data: scatterData,
      backgroundColor: '${config.color || '#000091'}',
      borderColor: '${config.color || '#000091'}',
      pointRadius: 6
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false
  }
});
<\/script>`;
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

function generateMapCode(config: ChartConfig, data: AggregatedResult[]): string {
  // Fallback: use labelField if codeField is missing (same as chart-renderer)
  const codeField = config.codeField || config.labelField || autoDetectCodeField();

  // Transform data to DSFR format: {"code": value, ...}
  const mapData: Record<string, number> = {};
  data.forEach(d => {
    let code = String(d.code || d.label || '').trim();
    if (/^\d+$/.test(code) && code.length < 3) {
      code = code.padStart(2, '0');
    }
    const value = d.value || 0;
    if (isValidDeptCode(code)) {
      mapData[code] = Math.round(value * 100) / 100;
    }
  });

  // API-dynamic variant using dsfr-data-query + dsfr-data-chart (auto-pagination)
  if (state.source?.type === 'api' && state.source?.apiUrl) {
    const provider = detectProvider(state.source.apiUrl);
    const resourceIds = extractResourceIds(state.source.apiUrl, provider);
    const apiBaseUrl = new URL(state.source.apiUrl).origin;

    if (provider.id === 'opendatasoft' && resourceIds?.datasetId && needsPagination()) {
      // ODS source: use dsfr-data-source + dsfr-data-query for automatic pagination
      const baseUrl = apiBaseUrl;
      const datasetId = resourceIds.datasetId;
      const { selectExpr, resultField } = buildOdsSelect(config.aggregation || 'sum', config.valueField, codeField!);
      const whereAttr = config.where
        ? `\n    where="${filterToOdsql(config.where)}"` : '';

      return `<!-- Carte generee avec dsfr-data Builder IA -->
<!-- Source API dynamique avec pagination automatique -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script src="${CDN_URLS.chartJs}"><\/script>
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(config.title || 'Carte de France')}</h2>
  ${config.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(config.subtitle)}</p>` : ''}

  <dsfr-data-source
    id="map-src"
    api-type="opendatasoft"
    base-url="${baseUrl}"
    dataset-id="${datasetId}"
    select="${selectExpr}"
    group-by="${codeField}"${whereAttr}>
  </dsfr-data-source>
  <dsfr-data-query
    id="map-data"
    source="map-src">
  </dsfr-data-query>

  <dsfr-data-chart
    source="map-data"
    type="${config.type}"
    code-field="${codeField}"
    value-field="${resultField}"
    name="${escapeHtml(config.title || 'Carte')}"
    selected-palette="${config.palette || 'sequentialAscending'}">
  </dsfr-data-chart>
</div>`;
    }

    // Tabular source with pagination needed: use dsfr-data-source + dsfr-data-query
    if (provider.id === 'tabular' && resourceIds?.resourceId && needsPagination()) {
      const aggregateExpr = config.aggregation === 'count'
        ? `${codeField}:count`
        : `${config.valueField}:${config.aggregation || 'sum'}`;
      const resultField = config.aggregation === 'count'
        ? `${codeField}__count`
        : `${config.valueField}__${config.aggregation || 'sum'}`;
      const filterAttr = config.where
        ? `\n    filter="${config.where}"` : '';

      return `<!-- Carte generee avec dsfr-data Builder IA -->
<!-- Source API Tabular avec pagination automatique -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script src="${CDN_URLS.chartJs}"><\/script>
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(config.title || 'Carte de France')}</h2>
  ${config.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(config.subtitle)}</p>` : ''}

  <dsfr-data-source
    id="map-src"
    api-type="tabular"
    base-url="${apiBaseUrl}"
    resource="${resourceIds.resourceId}">
  </dsfr-data-source>
  <dsfr-data-query
    id="map-data"
    source="map-src"
    group-by="${codeField}"
    aggregate="${aggregateExpr}"${filterAttr}>
  </dsfr-data-query>

  <dsfr-data-chart
    source="map-data"
    type="${config.type}"
    code-field="${codeField}"
    value-field="${resultField}"
    name="${escapeHtml(config.title || 'Carte')}"
    selected-palette="${config.palette || 'sequentialAscending'}">
  </dsfr-data-chart>
</div>`;
    }

    // Non-ODS/Tabular API: fall back to dsfr-data-source + dsfr-data-chart
    let sourceUrl = state.source.apiUrl;
    if (config.where) {
      const url = new URL(sourceUrl);
      url.searchParams.set('where', filterToOdsql(config.where));
      sourceUrl = url.toString();
    }

    return `<!-- Carte generee avec dsfr-data Builder IA -->
<!-- Source API dynamique -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script src="${CDN_URLS.chartJs}"><\/script>
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(config.title || 'Carte de France')}</h2>
  ${config.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(config.subtitle)}</p>` : ''}

  <dsfr-data-source
    id="map-data"
    url="${sourceUrl}"
    transform="results">
  </dsfr-data-source>

  <dsfr-data-chart
    source="map-data"
    type="${config.type}"
    code-field="${codeField}"
    value-field="${config.valueField}"
    name="${escapeHtml(config.title || 'Carte')}"
    selected-palette="${config.palette || 'sequentialAscending'}">
  </dsfr-data-chart>
</div>`;
  }

  // Embedded-data variant
  const mapTagEmbed = config.type === 'map-reg' ? 'map-chart-reg' : 'map-chart';
  return `<!-- Carte generee avec dsfr-data Builder IA -->
<!-- Source : ${state.source?.name || 'Donnees locales'} -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(config.title || 'Carte de France')}</h2>
  ${config.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(config.subtitle)}</p>` : ''}
  <${mapTagEmbed}
    data='${JSON.stringify(mapData)}'
    name="${escapeHtml(config.title || 'Carte')}"
    selected-palette="${config.palette || 'sequentialAscending'}"
  ></${mapTagEmbed}>
</div>`;
}

// ---------------------------------------------------------------------------
// Datalist (table)
// ---------------------------------------------------------------------------

function generateDatalistCode(config: ChartConfig): string {
  // Build colonnes attribute: from config or auto-detect from fields
  let colonnes: string;
  if (config.colonnes) {
    colonnes = config.colonnes;
  } else {
    colonnes = state.fields.map(f => `${f.name}:${f.name}`).join(', ');
  }

  const triAttr = config.sortOrder && config.labelField
    ? `\n    tri="${config.labelField}:${config.sortOrder}"` : '';
  const pagination = config.pagination || 10;

  // API-dynamic variant
  if (state.source?.type === 'api' && state.source?.apiUrl) {
    const whereOds = config.where ? filterToOdsql(config.where) : '';
    const provider = detectProvider(state.source.apiUrl);
    const resourceIds = extractResourceIds(state.source.apiUrl, provider);
    const apiBaseUrl = new URL(state.source.apiUrl).origin;

    // ODS with pagination: use dsfr-data-source + dsfr-data-query for server-side pagination
    if (provider.id === 'opendatasoft' && resourceIds?.datasetId && needsPagination()) {
      const whereAttr = whereOds ? `\n    where="${whereOds}"` : '';

      return `<!-- Tableau dynamique genere avec dsfr-data Builder IA -->
<!-- Source API dynamique avec pagination serveur -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dependances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  ${config.title ? `<h2>${escapeHtml(config.title)}</h2>` : ''}
  ${config.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(config.subtitle)}</p>` : ''}

  <dsfr-data-source
    id="table-src"
    api-type="opendatasoft"
    base-url="${apiBaseUrl}"
    dataset-id="${resourceIds.datasetId}"${whereAttr}
    server-side
    page-size="${pagination}">
  </dsfr-data-source>
  <dsfr-data-query
    id="table-data"
    source="table-src"
    server-side>
  </dsfr-data-query>

  <dsfr-data-list
    source="table-data"
    colonnes="${colonnes}"
    recherche
    server-tri${triAttr}
    pagination="${pagination}"
    export="csv">
  </dsfr-data-list>
</div>`;
    }

    // Tabular with pagination: use dsfr-data-source + dsfr-data-query for server-side pagination
    if (provider.id === 'tabular' && resourceIds?.resourceId && needsPagination()) {
      const whereAttr = config.where ? `\n    where="${config.where}"` : '';

      return `<!-- Tableau dynamique genere avec dsfr-data Builder IA -->
<!-- Source API Tabular avec pagination serveur -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dependances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  ${config.title ? `<h2>${escapeHtml(config.title)}</h2>` : ''}
  ${config.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(config.subtitle)}</p>` : ''}

  <dsfr-data-source
    id="table-src"
    api-type="tabular"
    base-url="${apiBaseUrl}"
    resource="${resourceIds.resourceId}"${whereAttr}
    server-side
    page-size="${pagination}">
  </dsfr-data-source>
  <dsfr-data-query
    id="table-data"
    source="table-src"
    server-side>
  </dsfr-data-query>

  <dsfr-data-list
    source="table-data"
    colonnes="${colonnes}"
    recherche
    server-tri${triAttr}
    pagination="${pagination}"
    export="csv">
  </dsfr-data-list>
</div>`;
    }

    // Standard API: use dsfr-data-source
    let sourceUrl = state.source.apiUrl;
    if (whereOds) {
      const url = new URL(sourceUrl);
      url.searchParams.set('where', whereOds);
      sourceUrl = url.toString();
    }

    return `<!-- Tableau dynamique genere avec dsfr-data Builder IA -->
<!-- Source API dynamique : les donnees se mettent a jour automatiquement -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dependances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  ${config.title ? `<h2>${escapeHtml(config.title)}</h2>` : ''}
  ${config.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(config.subtitle)}</p>` : ''}

  <dsfr-data-source
    id="table-data"
    url="${sourceUrl}"
    transform="records">
  </dsfr-data-source>

  <dsfr-data-list
    source="table-data"
    colonnes="${colonnes}"
    recherche${triAttr}
    pagination="${pagination}"
    export="csv">
  </dsfr-data-list>
</div>`;
  }

  // Embedded-data variant
  const rawData = state.localData || [];
  return `<!-- Tableau genere avec dsfr-data Builder IA -->
<!-- Source : ${state.source?.name || 'Donnees locales'} - donnees embarquees -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dependances JS -->
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  ${config.title ? `<h2>${escapeHtml(config.title)}</h2>` : ''}
  ${config.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(config.subtitle)}</p>` : ''}

  <dsfr-data-list
    id="my-table"
    colonnes="${colonnes}"
    recherche${triAttr}
    pagination="${pagination}"
    export="csv">
  </dsfr-data-list>
</div>

<script>
// Donnees integrees
const data = ${JSON.stringify(rawData.slice(0, 500), null, 2)};

// Injecter les donnees dans le composant
document.getElementById('my-table').onSourceData(data);
<\/script>`;
}

// ---------------------------------------------------------------------------
// Standard chart types (bar, line, pie, doughnut, radar, horizontalBar)
// ---------------------------------------------------------------------------

function generateStandardChartCode(config: ChartConfig, data: AggregatedResult[]): string {
  const isMultiColor = ['pie', 'doughnut', 'radar'].includes(config.type);
  const colorsArray = JSON.stringify(DSFR_COLORS.slice(0, data.length || 10));

  // ODS/Tabular with pagination needed: use dsfr-data-query + dsfr-data-chart
  if (state.source?.type === 'api' && state.source?.apiUrl && needsPagination()) {
    const provider = detectProvider(state.source.apiUrl);
    const resourceIds = extractResourceIds(state.source.apiUrl, provider);
    const apiBaseUrl = new URL(state.source.apiUrl).origin;
    if (provider.id === 'opendatasoft' && resourceIds?.datasetId) {
      return generateStandardChartCodeODS(config, apiBaseUrl, resourceIds.datasetId);
    }
    if (provider.id === 'tabular' && resourceIds?.resourceId) {
      return generateStandardChartCodeTabular(config, apiBaseUrl, resourceIds.resourceId);
    }
  }

  // API-dynamic variant (single-page fetch)
  if (state.source?.type === 'api' && state.source?.apiUrl) {
    return generateStandardChartCodeAPI(config, isMultiColor, colorsArray);
  }

  // Embedded-data variant
  return generateStandardChartCodeEmbedded(config, data, isMultiColor, colorsArray);
}

function generateStandardChartCodeODS(config: ChartConfig, baseUrl: string, datasetId: string): string {
  const { selectExpr, resultField } = buildOdsSelect(config.aggregation || 'sum', config.valueField, config.labelField!);
  const whereAttr = config.where
    ? `\n    where="${filterToOdsql(config.where)}"` : '';
  const orderAttr = config.sortOrder && config.labelField
    ? `\n    order-by="${resultField}:${config.sortOrder}"` : '';
  const chartType = config.type === 'horizontalBar' ? 'bar' : (config.type === 'bar-line' ? 'bar' : config.type);
  const horizontalAttr = config.type === 'horizontalBar' ? '\n    horizontal' : '';

  return `<!-- Graphique genere avec dsfr-data Builder IA -->
<!-- Source API dynamique avec pagination automatique -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script src="${CDN_URLS.chartJs}"><\/script>
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(config.title || 'Mon graphique')}</h2>
  ${config.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(config.subtitle)}</p>` : ''}

  <dsfr-data-source
    id="chart-src"
    api-type="opendatasoft"
    base-url="${baseUrl}"
    dataset-id="${datasetId}"
    select="${selectExpr}"
    group-by="${config.labelField}"${whereAttr}>
  </dsfr-data-source>
  <dsfr-data-query
    id="chart-data"
    source="chart-src"${orderAttr}>
  </dsfr-data-query>

  <dsfr-data-chart
    source="chart-data"
    type="${chartType}"
    label-field="${config.labelField}"
    value-field="${resultField}"
    name="${escapeHtml(config.title || 'Mon graphique')}"${horizontalAttr}
    selected-palette="${config.palette || 'categorical'}">
  </dsfr-data-chart>
</div>`;
}

function generateStandardChartCodeTabular(config: ChartConfig, baseUrl: string, resourceId: string): string {
  const aggregateExpr = config.aggregation === 'count'
    ? `${config.labelField}:count`
    : `${config.valueField}:${config.aggregation || 'sum'}`;
  const resultField = config.aggregation === 'count'
    ? `${config.labelField}__count`
    : `${config.valueField}__${config.aggregation || 'sum'}`;
  const filterAttr = config.where
    ? `\n    filter="${config.where}"` : '';
  const orderAttr = config.sortOrder && config.labelField
    ? `\n    order-by="${resultField}:${config.sortOrder}"` : '';
  const chartType = config.type === 'horizontalBar' ? 'bar' : (config.type === 'bar-line' ? 'bar' : config.type);
  const horizontalAttr = config.type === 'horizontalBar' ? '\n    horizontal' : '';

  return `<!-- Graphique genere avec dsfr-data Builder IA -->
<!-- Source API Tabular avec pagination automatique -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrChartCss}">
<script src="${CDN_URLS.chartJs}"><\/script>
<script type="module" src="${CDN_URLS.dsfrChartJs}"><\/script>
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(config.title || 'Mon graphique')}</h2>
  ${config.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(config.subtitle)}</p>` : ''}

  <dsfr-data-source
    id="chart-src"
    api-type="tabular"
    base-url="${baseUrl}"
    resource="${resourceId}">
  </dsfr-data-source>
  <dsfr-data-query
    id="chart-data"
    source="chart-src"
    group-by="${config.labelField}"
    aggregate="${aggregateExpr}"${filterAttr}${orderAttr}>
  </dsfr-data-query>

  <dsfr-data-chart
    source="chart-data"
    type="${chartType}"
    label-field="${config.labelField}"
    value-field="${resultField}"
    name="${escapeHtml(config.title || 'Mon graphique')}"${horizontalAttr}
    selected-palette="${config.palette || 'categorical'}">
  </dsfr-data-chart>
</div>`;
}

function generateStandardChartCodeAPI(config: ChartConfig, isMultiColor: boolean, colorsArray: string): string {
  const valueExpr = config.aggregation === 'count'
    ? 'count(*) as value'
    : `${config.aggregation}(${config.valueField}) as value`;

  const params = new URLSearchParams({
    select: `${config.labelField}, ${valueExpr}`,
    group_by: config.labelField!,
    order_by: `value ${config.sortOrder || 'desc'}`,
  });
  if (config.where) {
    params.set('where', filterToOdsql(config.where));
  }

  const apiUrl = `${state.source!.apiUrl}?${params}`;

  return `<!-- Graphique genere avec dsfr-data Builder IA -->
<!-- Source API dynamique : les donnees se mettent a jour automatiquement -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dependances JS -->
<script src="${CDN_URLS.chartJs}"><\/script>

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(config.title || 'Mon graphique')}</h2>
  ${config.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(config.subtitle)}</p>` : ''}

  <div id="chart-container" style="height: 400px; position: relative;">
    <canvas id="myChart"></canvas>
  </div>

  <!-- Alternative accessible (RGAA) -->
  <details class="fr-accordion fr-mt-2w">
    <summary class="fr-accordion__btn">Voir les donnees en tableau</summary>
    <div class="fr-accordion__content">
      <table class="fr-table" id="data-table">
        <thead><tr><th>${escapeHtml(config.labelField || '')}</th><th>Valeur</th></tr></thead>
        <tbody id="table-body"></tbody>
      </table>
    </div>
  </details>
</div>

<script>
// URL de l'API avec agregation ODSQL
const API_URL = '${apiUrl}';

// Palette DSFR
const DSFR_COLORS = ${colorsArray};

async function loadChart() {
  try {
    const response = await fetch(API_URL);
    const json = await response.json();
    const data = json.results || [];

    const labels = data.map(d => d['${config.labelField}'] || 'N/A');
    const values = data.map(d => Math.round((d.value || 0) * 100) / 100);

    new Chart(document.getElementById('myChart'), {
      type: '${config.type === 'horizontalBar' || config.type === 'bar-line' ? 'bar' : config.type}',
      data: {
        labels: labels,
        datasets: [{
          label: '${config.valueField}',
          data: values,
          backgroundColor: ${isMultiColor ? 'DSFR_COLORS.slice(0, data.length)' : `'${config.color || '#000091'}'`},
          borderColor: '${config.color || '#000091'}',
          borderWidth: ${config.type === 'line' ? 2 : 1}
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false${config.type === 'horizontalBar' ? ",\n        indexAxis: 'y'" : ''},
        plugins: { legend: { display: ${isMultiColor} } }
      }
    });

    // Remplir le tableau accessible
    const tbody = document.getElementById('table-body');
    data.forEach(d => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + (d['${config.labelField}'] || 'N/A') + '</td><td>' + (d.value?.toFixed(2) || '\u2014') + '</td>';
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error('Erreur chargement donnees:', error);
    document.getElementById('chart-container').innerHTML = '<p class="fr-text--error">Erreur de chargement des donnees</p>';
  }
}

loadChart();
<\/script>`;
}

function generateStandardChartCodeEmbedded(config: ChartConfig, data: AggregatedResult[], isMultiColor: boolean, colorsArray: string): string {
  const sourceName = state.source?.name || 'Donnees locales';
  const sourceType = state.source?.type === 'grist' ? 'Grist' : 'source manuelle';
  const hasSecondSeries = !!(config.valueField2 && config.data2 && config.data2.length > 0);
  const isBarLine = config.type === 'bar-line';

  // Build datasets code
  let datasetsCode = `[{
      label: '${config.valueField}',
      data: values,
      backgroundColor: ${isMultiColor ? 'DSFR_COLORS.slice(0, data.length)' : `'${config.color || '#000091'}'`},
      borderColor: '${config.color || '#000091'}',
      borderWidth: ${config.type === 'line' ? 2 : 1}${isBarLine ? ",\n      type: 'bar'" : ''}
    }`;

  if (hasSecondSeries) {
    datasetsCode += `, {
      label: '${config.valueField2}',
      data: values2,
      backgroundColor: '${isBarLine ? 'transparent' : (config.color2 || '#E1000F')}',
      borderColor: '${config.color2 || '#E1000F'}',
      borderWidth: 2${isBarLine ? ",\n      type: 'line'" : ''}
    }`;
  }
  datasetsCode += ']';

  return `<!-- Graphique genere avec dsfr-data Builder IA -->
<!-- Source : ${sourceName} (${sourceType}) - donnees embarquees -->
${hasSecondSeries ? '<!-- Note: Graphique multi-series -->' : ''}

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">

<!-- Dependances JS -->
<script src="${CDN_URLS.chartJs}"><\/script>

<div class="fr-container fr-my-4w">
  <h2>${escapeHtml(config.title || 'Mon graphique')}</h2>
  ${config.subtitle ? `<p class="fr-text--sm fr-text--light">${escapeHtml(config.subtitle)}</p>` : ''}

  <div id="chart-container" style="height: 400px; position: relative;">
    <canvas id="myChart"></canvas>
  </div>
</div>

<script>
// Donnees embarquees (depuis ${sourceType})
const data = ${JSON.stringify(data, null, 2)};
${hasSecondSeries ? `const data2 = ${JSON.stringify(config.data2, null, 2)};` : ''}

// Palette DSFR
const DSFR_COLORS = ${colorsArray};

const labels = data.map(d => d.label);
const values = data.map(d => Math.round(d.value * 100) / 100);
${hasSecondSeries ? 'const values2 = data2.map(d => Math.round(d.value * 100) / 100);' : ''}

new Chart(document.getElementById('myChart'), {
  type: '${config.type === 'horizontalBar' || config.type === 'bar-line' ? 'bar' : config.type}',
  data: {
    labels: labels,
    datasets: ${datasetsCode}
  },
  options: {
    responsive: true,
    maintainAspectRatio: false${config.type === 'horizontalBar' ? ",\n    indexAxis: 'y'" : ''},
    plugins: { legend: { display: ${hasSecondSeries || isMultiColor || isBarLine} } }
  }
});
<\/script>`;
}

// ---------------------------------------------------------------------------
// Podium
// ---------------------------------------------------------------------------

function generatePodiumCode(config: ChartConfig, data: AggregatedResult[]): string {
  const maxItems = config.limit || 5;
  const palette = config.palette || 'sequentialDescending';
  const unitAttr = config.unit ? `\n    value-unit="${escapeHtml(config.unit)}"` : '';
  const subtitleAttr = config.subtitle ? `\n    subtitle="${escapeHtml(config.subtitle)}"` : '';

  // API-dynamic variant (ODS)
  if (state.source?.type === 'api' && state.source?.apiUrl) {
    const provider = detectProvider(state.source.apiUrl);
    const resourceIds = extractResourceIds(state.source.apiUrl, provider);
    const apiBaseUrl = new URL(state.source.apiUrl).origin;

    if (provider.id === 'opendatasoft' && resourceIds?.datasetId) {
      const { selectExpr, resultField } = buildOdsSelect(config.aggregation || 'sum', config.valueField, config.labelField!);
      const whereAttr = config.where ? `\n    where="${filterToOdsql(config.where)}"` : '';

      return `<!-- Podium genere avec dsfr-data Builder IA -->
<!-- Source API dynamique -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  ${config.title ? `<h2>${escapeHtml(config.title)}</h2>` : ''}

  <dsfr-data-source
    id="podium-src"
    api-type="opendatasoft"
    base-url="${apiBaseUrl}"
    dataset-id="${resourceIds.datasetId}"
    select="${selectExpr}"
    group-by="${config.labelField}"${whereAttr}>
  </dsfr-data-source>

  <dsfr-data-podium
    source="podium-src"
    label-field="${config.labelField}"
    value-field="${resultField}"${subtitleAttr}${unitAttr}
    selected-palette="${palette}"
    max-items="${maxItems}">
  </dsfr-data-podium>
</div>`;
    }

    if (provider.id === 'tabular' && resourceIds?.resourceId) {
      const aggregateExpr = config.aggregation === 'count'
        ? `${config.labelField}:count:total`
        : `${config.valueField}:${config.aggregation || 'sum'}:total`;
      const whereAttr = config.where ? `\n    where="${config.where}"` : '';

      return `<!-- Podium genere avec dsfr-data Builder IA -->
<!-- Source API Tabular dynamique -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  ${config.title ? `<h2>${escapeHtml(config.title)}</h2>` : ''}

  <dsfr-data-source
    id="podium-src"
    api-type="tabular"
    base-url="${apiBaseUrl}"
    resource="${resourceIds.resourceId}"
    server-side${whereAttr}>
  </dsfr-data-source>
  <dsfr-data-query
    id="podium-data"
    source="podium-src"
    server-side
    group-by="${config.labelField}"
    aggregate="${aggregateExpr}"
    order-by="total:desc">
  </dsfr-data-query>

  <dsfr-data-podium
    source="podium-data"
    label-field="${config.labelField}"
    value-field="total"${subtitleAttr}${unitAttr}
    selected-palette="${palette}"
    max-items="${maxItems}">
  </dsfr-data-podium>
</div>`;
    }
  }

  // Embedded data variant
  const sourceName = state.source?.name || 'Donnees locales';
  const sourceType = state.source?.type === 'grist' ? 'Grist' : 'source manuelle';

  return `<!-- Podium genere avec dsfr-data Builder IA -->
<!-- Source : ${sourceName} (${sourceType}) - donnees embarquees -->

<!-- Dependances CSS (DSFR) -->
<link rel="stylesheet" href="${CDN_URLS.dsfrCss}">
<link rel="stylesheet" href="${CDN_URLS.dsfrUtilityCss}">
<script src="${LIB_URL}/dsfr-data.core.umd.js"><\/script>

<div class="fr-container fr-my-4w">
  ${config.title ? `<h2>${escapeHtml(config.title)}</h2>` : ''}

  <dsfr-data-source
    id="podium-src"
    data='${JSON.stringify(data.map(d => ({ [config.labelField!]: d.label, [config.valueField]: d.value })))}'>
  </dsfr-data-source>

  <dsfr-data-podium
    source="podium-src"
    label-field="${config.labelField}"
    value-field="${config.valueField}"${subtitleAttr}${unitAttr}
    selected-palette="${palette}"
    max-items="${maxItems}">
  </dsfr-data-podium>
</div>`;
}
