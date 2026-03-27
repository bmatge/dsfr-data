/**
 * Chart rendering - applies chart configuration to generate visual output
 */

import { escapeHtml, DSFR_COLORS, PALETTE_COLORS, isValidDeptCode } from '@dsfr-data/shared';
import { state } from '../state.js';
import type { ChartConfig, AggregatedResult } from '../state.js';
import { addMessage } from '../chat/chat.js';
import { generateCode } from './code-generator.js';

/** Chart.js loaded via CDN - access from window */
const Chart = (window as unknown as Record<string, unknown>).Chart as unknown;

/**
 * Resolve a palette name to an array of colors, cycling if needed.
 * Falls back to DSFR_COLORS if the palette name is unknown.
 */
function resolvePalette(paletteName: string | undefined, count: number): string[] {
  const base = (paletteName && PALETTE_COLORS[paletteName])
    ? [...PALETTE_COLORS[paletteName]]
    : [...DSFR_COLORS];
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(base[i % base.length]);
  }
  return result;
}

/**
 * Apply a where filter to data (same syntax as dsfr-data-query: "field:op:value")
 * Multiple filters separated by comma (AND logic).
 */
function applyWhereFilter(data: Record<string, unknown>[], where: string): Record<string, unknown>[] {
  const parts = where.split(',').map(p => p.trim()).filter(Boolean);

  return data.filter(record => {
    return parts.every(part => {
      const segments = part.split(':');
      if (segments.length < 2) return true;
      const field = segments[0];
      const op = segments[1];
      const rawValue = segments.slice(2).join(':');
      const itemValue = record[field];

      switch (op) {
        case 'eq':
          return String(itemValue) === rawValue || Number(itemValue) === Number(rawValue);
        case 'neq':
          return String(itemValue) !== rawValue && Number(itemValue) !== Number(rawValue);
        case 'gt':
          return Number(itemValue) > Number(rawValue);
        case 'gte':
          return Number(itemValue) >= Number(rawValue);
        case 'lt':
          return Number(itemValue) < Number(rawValue);
        case 'lte':
          return Number(itemValue) <= Number(rawValue);
        case 'contains':
          return String(itemValue).toLowerCase().includes(rawValue.toLowerCase());
        case 'notcontains':
          return !String(itemValue).toLowerCase().includes(rawValue.toLowerCase());
        case 'in':
          return rawValue.split('|').some(v => String(itemValue) === v || Number(itemValue) === Number(v));
        case 'notin':
          return !rawValue.split('|').some(v => String(itemValue) === v || Number(itemValue) === Number(v));
        case 'isnull':
          return itemValue === null || itemValue === undefined;
        case 'isnotnull':
          return itemValue !== null && itemValue !== undefined;
        default:
          return true;
      }
    });
  });
}

/**
 * Format a KPI value with optional unit (local version that supports unit appending)
 */
function formatKPIValueLocal(value: number, unit?: string): string {
  const num = Math.round(value * 100) / 100;
  if (unit === '\u20AC' || unit === 'EUR') {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num);
  } else if (unit === '%') {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(num) + ' %';
  } else {
    const formatted = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(num);
    return unit ? `${formatted} ${unit}` : formatted;
  }
}

/**
 * Reset the chart preview to its empty state (no chart, no config)
 */
export function resetChartPreview(): void {
  const canvas = document.getElementById('preview-canvas') as HTMLCanvasElement;
  const emptyState = document.getElementById('empty-state') as HTMLElement;
  const chartWrapper = document.querySelector('.chart-wrapper') as HTMLElement;

  // Destroy Chart.js instance
  if (state.chart) {
    (state.chart as { destroy(): void }).destroy();
    state.chart = null;
  }

  // Remove special cards (KPI, gauge, map, datalist)
  for (const sel of ['.kpi-card', '.gauge-card', '.map-card', '.datalist-card']) {
    const el = chartWrapper.querySelector(sel);
    if (el) el.remove();
  }

  // Reset canvas and empty state
  canvas.style.display = 'none';
  emptyState.style.display = '';

  // Reset titles
  (document.getElementById('preview-title') as HTMLElement).textContent = 'Mon graphique';
  (document.getElementById('preview-subtitle') as HTMLElement).textContent = '';

  // Clear chart config and generated code
  state.chartConfig = null;

  // Reset code tab
  const previewPanel = document.querySelector('app-preview-panel');
  if (previewPanel) {
    (previewPanel as HTMLElement & { code: string }).code = '';
  }
}

/**
 * Main orchestrator: aggregates data and calls the appropriate renderer
 */
export function applyChartConfig(config: ChartConfig): void {
  state.chartConfig = config;

  // Update UI
  (document.getElementById('preview-title') as HTMLElement).textContent = config.title || 'Mon graphique';
  (document.getElementById('preview-subtitle') as HTMLElement).textContent = config.subtitle || '';

  // Generate chart data
  if (!state.localData || state.localData.length === 0) {
    addMessage('assistant', 'Aucune donnee disponible. Veuillez selectionner une source de donnees.');
    return;
  }

  // Validate that fields exist in data
  const dataKeys = Object.keys(state.localData[0]);
  if (config.labelField && !dataKeys.includes(config.labelField)) {
    addMessage('assistant', `Le champ "${config.labelField}" n'existe pas dans les donnees. Champs disponibles : ${dataKeys.join(', ')}`);
    return;
  }
  if (config.valueField && !dataKeys.includes(config.valueField)) {
    addMessage('assistant', `Le champ "${config.valueField}" n'existe pas dans les donnees. Champs disponibles : ${dataKeys.join(', ')}`);
    return;
  }

  // Apply where filter if specified
  let workingData = state.localData;
  if (config.where) {
    workingData = applyWhereFilter(state.localData, config.where);
    if (workingData.length === 0) {
      addMessage('assistant', `Aucun enregistrement ne correspond au filtre "${config.where}". Verifiez les noms de champs et les valeurs.`);
      return;
    }
  }

  // For datalist, skip aggregation - use raw data directly
  if (config.type === 'datalist') {
    renderDatalist(config, workingData);
    generateCode(config, []);
    return;
  }

  // For KPI, aggregate all values into a single result
  if (config.type === 'kpi') {
    let kpiValue: number;
    const values = workingData.map(r => parseFloat(String(r[config.valueField])) || 0);

    switch (config.aggregation) {
      case 'sum':
        kpiValue = values.reduce((a, b) => a + b, 0);
        break;
      case 'count':
        kpiValue = workingData.length;
        break;
      case 'min':
        kpiValue = Math.min(...values);
        break;
      case 'max':
        kpiValue = Math.max(...values);
        break;
      case 'avg':
      default:
        kpiValue = values.reduce((a, b) => a + b, 0) / values.length;
    }

    const results: AggregatedResult[] = [{ label: config.title || 'Valeur', value: kpiValue }];
    renderKPI(config, kpiValue);
    generateCode(config, results);
    return;
  }

  // Aggregate data for charts
  const aggregated: Record<string, { values: number[]; count: number; code: string | null }> = {};
  const isMap = config.type === 'map' || config.type === 'map-reg';
  const codeField = config.codeField || config.labelField;

  workingData.forEach(record => {
    const label = isMap
      ? String(record[codeField!] || 'N/A')
      : String(record[config.labelField!] || 'N/A');
    const value = parseFloat(String(record[config.valueField])) || 0;

    if (!aggregated[label]) {
      aggregated[label] = { values: [], count: 0, code: isMap ? String(record[codeField!] || '') : null };
    }
    aggregated[label].values.push(value);
    aggregated[label].count++;
  });

  let results: AggregatedResult[] = Object.entries(aggregated).map(([label, data]) => {
    let value: number;
    switch (config.aggregation) {
      case 'sum':
        value = data.values.reduce((a, b) => a + b, 0);
        break;
      case 'count':
        value = data.count;
        break;
      case 'min':
        value = Math.min(...data.values);
        break;
      case 'max':
        value = Math.max(...data.values);
        break;
      case 'avg':
      default:
        value = data.values.reduce((a, b) => a + b, 0) / data.values.length;
    }
    return { label, value, code: data.code };
  });

  // Sort
  results.sort((a, b) => {
    return config.sortOrder === 'asc' ? a.value - b.value : b.value - a.value;
  });

  // Render chart
  renderChart(config, results);

  // Generate code
  generateCode(config, results);
}

/**
 * Render a KPI card in the preview panel
 */
function renderKPI(config: ChartConfig, value: number): void {
  const canvas = document.getElementById('preview-canvas') as HTMLCanvasElement;
  const emptyState = document.getElementById('empty-state') as HTMLElement;
  const chartWrapper = document.querySelector('.chart-wrapper') as HTMLElement;

  emptyState.style.display = 'none';
  canvas.style.display = 'none';

  if (state.chart) {
    (state.chart as { destroy(): void }).destroy();
    state.chart = null;
  }

  // Remove any existing special cards
  const existingKpi = chartWrapper.querySelector('.kpi-card');
  if (existingKpi) existingKpi.remove();
  const existingDatalist2 = chartWrapper.querySelector('.datalist-card');
  if (existingDatalist2) existingDatalist2.remove();

  const variant = config.variant || '';
  const unit = config.unit || '';
  const formattedValue = formatKPIValueLocal(value, unit);

  const kpiCard = document.createElement('div');
  kpiCard.className = `kpi-card${variant ? ' kpi-card--' + variant : ''}`;
  kpiCard.style.marginTop = '2rem';
  kpiCard.innerHTML = `
    <span class="kpi-value">${formattedValue}</span>
    <span class="kpi-label">${escapeHtml(config.title || 'Indicateur')}</span>
  `;
  chartWrapper.appendChild(kpiCard);
}

/**
 * Render a Chart.js chart (or gauge/map special types) in the preview panel
 */
function renderChart(config: ChartConfig, data: AggregatedResult[]): void {
  const canvas = document.getElementById('preview-canvas') as HTMLCanvasElement;
  const emptyState = document.getElementById('empty-state') as HTMLElement;
  const chartWrapper = document.querySelector('.chart-wrapper') as HTMLElement;

  // Remove any existing special cards
  const existingKpi = chartWrapper.querySelector('.kpi-card');
  if (existingKpi) existingKpi.remove();
  const existingGauge = chartWrapper.querySelector('.gauge-card');
  if (existingGauge) existingGauge.remove();
  const existingMap = chartWrapper.querySelector('.map-card');
  if (existingMap) existingMap.remove();
  const existingDatalist = chartWrapper.querySelector('.datalist-card');
  if (existingDatalist) existingDatalist.remove();

  if (state.chart) {
    (state.chart as { destroy(): void }).destroy();
    state.chart = null;
  }

  // Handle gauge type specially (no Chart.js canvas)
  if (config.type === 'gauge') {
    canvas.style.display = 'none';
    emptyState.style.display = 'none';

    const gaugeValue = data[0]?.value || 0;
    const gaugeCard = document.createElement('div');
    gaugeCard.className = 'gauge-card';
    gaugeCard.innerHTML = `
      <div class="gauge-container">
        <svg viewBox="0 0 200 120" class="gauge-svg">
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e0e0e0" stroke-width="20" stroke-linecap="round"/>
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="${config.color || '#000091'}" stroke-width="20" stroke-linecap="round"
                stroke-dasharray="${(gaugeValue / 100) * 251.2} 251.2"/>
        </svg>
        <div class="gauge-value">${Math.round(gaugeValue)}%</div>
        <div class="gauge-label">${escapeHtml(config.title || 'Jauge')}</div>
      </div>
    `;
    chartWrapper.appendChild(gaugeCard);
    return;
  }

  // Handle map type (uses DSFR map-chart / map-chart-reg)
  if (config.type === 'map' || config.type === 'map-reg') {
    canvas.style.display = 'none';
    emptyState.style.display = 'none';

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

    const mapTag = config.type === 'map-reg' ? 'map-chart-reg' : 'map-chart';
    const mapCard = document.createElement('div');
    mapCard.className = 'map-card';
    mapCard.innerHTML = `
      <${mapTag}
        data='${JSON.stringify(mapData)}'
        name="${escapeHtml(config.title || 'Carte')}"
        selected-palette="${config.palette || 'sequentialAscending'}"
      ></${mapTag}>
    `;
    chartWrapper.appendChild(mapCard);
    return;
  }

  emptyState.style.display = 'none';
  canvas.style.display = 'block';

  const labels = data.map(d => d.label);
  const values = data.map(d => Math.round(d.value * 100) / 100);

  // Handle scatter type
  if (config.type === 'scatter') {
    const scatterData = data.map(d => ({
      x: parseFloat(d.label) || 0,
      y: d.value,
    }));

    state.chart = new (Chart as any)(canvas, {
      type: 'scatter',
      data: {
        datasets: [{
          label: config.valueField,
          data: scatterData,
          backgroundColor: config.color || '#000091',
          borderColor: config.color || '#000091',
          pointRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
      },
    });
    return;
  }

  const chartType = config.type === 'horizontalBar' ? 'bar' : (config.type === 'bar-line' ? 'bar' : config.type);
  const isMultiColor = ['pie', 'doughnut', 'radar'].includes(config.type);
  const isBarLine = config.type === 'bar-line';

  // Resolve colors: palette > color > default
  const paletteColors = resolvePalette(config.palette, data.length);
  const primaryColor = config.color || paletteColors[0] || '#000091';

  // Build datasets array
  const datasets: Record<string, unknown>[] = [{
    label: config.valueField,
    data: values,
    backgroundColor: isMultiColor ? paletteColors : primaryColor,
    borderColor: primaryColor,
    borderWidth: config.type === 'line' ? 2 : 1,
    type: isBarLine ? 'bar' : undefined,
  }];

  // Handle multi-series (valueField2) or bar-line second series
  if (config.valueField2 && config.data2 && config.data2.length > 0) {
    const values2 = config.data2.map(d => Math.round(d.value * 100) / 100);
    datasets.push({
      label: config.valueField2,
      data: values2,
      backgroundColor: isBarLine ? 'transparent' : (config.color2 || '#E1000F'),
      borderColor: config.color2 || '#E1000F',
      borderWidth: 2,
      type: isBarLine ? 'line' : undefined,
    });
  }

  state.chart = new (Chart as any)(canvas, {
    type: chartType,
    data: {
      labels: labels,
      datasets: datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: config.type === 'horizontalBar' ? 'y' : 'x',
      plugins: {
        legend: {
          display: isMultiColor || datasets.length > 1,
        },
      },
    },
  });
}

/**
 * Render a datalist (table) preview in the preview panel
 */
function renderDatalist(config: ChartConfig, data: Record<string, unknown>[]): void {
  const canvas = document.getElementById('preview-canvas') as HTMLCanvasElement;
  const emptyState = document.getElementById('empty-state') as HTMLElement;
  const chartWrapper = document.querySelector('.chart-wrapper') as HTMLElement;

  // Cleanup
  const existingKpi = chartWrapper.querySelector('.kpi-card');
  if (existingKpi) existingKpi.remove();
  const existingGauge = chartWrapper.querySelector('.gauge-card');
  if (existingGauge) existingGauge.remove();
  const existingMap = chartWrapper.querySelector('.map-card');
  if (existingMap) existingMap.remove();
  const existingDatalist = chartWrapper.querySelector('.datalist-card');
  if (existingDatalist) existingDatalist.remove();

  if (state.chart) {
    (state.chart as { destroy(): void }).destroy();
    state.chart = null;
  }

  emptyState.style.display = 'none';
  canvas.style.display = 'none';

  // Determine columns: from config.colonnes or auto-detect from data keys
  let columns: string[];
  if (config.colonnes) {
    columns = config.colonnes.split(',').map(c => c.split(':')[0].trim());
  } else {
    columns = data.length > 0 ? Object.keys(data[0]) : [];
  }

  const rows = data;

  const headerCells = columns.map(c => `<th>${escapeHtml(c)}</th>`).join('');
  const bodyRows = rows.map(row => {
    const cells = columns.map(c => {
      const val = row[c];
      return `<td>${val === null || val === undefined ? '\u2014' : escapeHtml(String(val))}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const datalistCard = document.createElement('div');
  datalistCard.className = 'datalist-card';
  datalistCard.innerHTML = `
    <p class="fr-text--sm fr-mb-1w">${data.length} enregistrement(s)${rows.length < data.length ? `, ${rows.length} affich\u00e9(s)` : ''}</p>
    <div class="fr-table" style="overflow-x: auto;">
      <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
  chartWrapper.appendChild(datalistCard);
}
