/**
 * Chart rendering logic.
 * Renders Chart.js instances, KPI cards, gauges, and map elements.
 */

import {
  formatKPIValue,
  escapeHtml,
  toNumber,
  isValidDeptCode,
  PALETTE_PRIMARY_COLOR,
  PALETTE_COLORS,
} from '@dsfr-data/shared';
import { state } from '../state.js';

// Chart.js loaded via CDN
const ChartJS = (): any => (window as any).Chart;

/**
 * Render the chart preview based on current state.
 */
export function renderChart(): void {
  const canvas = document.getElementById('preview-canvas') as HTMLCanvasElement | null;
  const emptyState = document.getElementById('empty-state') as HTMLElement | null;
  const chartContainer = document.querySelector('.chart-container') as HTMLElement | null;

  if (!canvas || !chartContainer) return;
  if (emptyState) emptyState.style.display = 'none';

  // Destroy previous chart
  if (state.chartInstance) {
    (state.chartInstance as any).destroy();
    state.chartInstance = null;
  }

  // Remove any existing KPI/Gauge/Map/Datalist card
  const existingCard = chartContainer.querySelector('.kpi-card, .gauge-card, .map-card, .datalist-card');
  if (existingCard) existingCard.remove();

  // Handle KPI type differently
  if (state.chartType === 'kpi') {
    canvas.style.display = 'none';

    // Get the single aggregated value
    const value = state.data[0]?.value || 0;
    const variantSelect = document.getElementById('kpi-variant') as HTMLSelectElement | null;
    const unitInput = document.getElementById('kpi-unit') as HTMLInputElement | null;
    const variant = variantSelect?.value || '';
    const unit = unitInput?.value || '';

    // Format the value
    const formattedValue = formatKPIValue(value, unit);

    // Create KPI card
    const kpiCard = document.createElement('div');
    kpiCard.className = `kpi-card${variant ? ' kpi-card--' + variant : ''}`;
    kpiCard.innerHTML = `
      <span class="kpi-value">${formattedValue}</span>
      <span class="kpi-label">${state.title}</span>
    `;
    chartContainer.appendChild(kpiCard);
    return;
  }

  // Handle Gauge type (simple progress indicator)
  if (state.chartType === 'gauge') {
    canvas.style.display = 'none';

    const value = Math.min(100, Math.max(0, Math.round(state.data[0]?.value || 0)));
    const unitInput = document.getElementById('kpi-unit') as HTMLInputElement | null;
    const unit = unitInput?.value || '%';

    const gaugeColor = PALETTE_PRIMARY_COLOR[state.palette] || '#000091';
    const gaugeCard = document.createElement('div');
    gaugeCard.className = 'gauge-card';
    gaugeCard.innerHTML = `
      <div class="gauge-container">
        <svg viewBox="0 0 100 60" class="gauge-svg">
          <path d="M10 55 A40 40 0 0 1 90 55" fill="none" stroke="#e5e5e5" stroke-width="8" stroke-linecap="round"/>
          <path d="M10 55 A40 40 0 0 1 90 55" fill="none" stroke="${gaugeColor}" stroke-width="8" stroke-linecap="round"
            stroke-dasharray="${value * 1.26} 126" class="gauge-fill"/>
        </svg>
        <div class="gauge-value">${value}${unit}</div>
      </div>
      <div class="gauge-label">${state.title}</div>
    `;
    chartContainer.appendChild(gaugeCard);
    return;
  }

  // Handle Map type (uses DSFR map-chart)
  if (state.chartType === 'map') {
    canvas.style.display = 'none';

    // For choropleth maps, use sequential or divergent palette for gradient
    const mapPalette = state.palette.includes('sequential') || state.palette.includes('divergent')
      ? state.palette
      : 'sequentialAscending';

    // Transform data to DSFR format: {"code": value, ...}
    const mapData: Record<string, number> = {};
    let totalValue = 0;
    let count = 0;

    state.data.forEach(d => {
      // Department code can be in codeField or direct key
      const rawCode = (d[state.codeField] ?? (d as any).code ?? '') as string | number;
      // Normalize the code: convert to string and pad if necessary
      let code = String(rawCode).trim();
      // Handle numeric codes (1 -> "01", 34 -> "34")
      if (/^\d+$/.test(code) && code.length < 3) {
        code = code.padStart(2, '0');
      }

      const value = toNumber(d.value);

      if (isValidDeptCode(code) && !isNaN(value)) {
        mapData[code] = Math.round(value * 100) / 100;
        totalValue += value;
        count++;
      }
    });

    // Calculate national average for value attribute
    const avgValue = count > 0 ? Math.round((totalValue / count) * 100) / 100 : 0;
    const today = new Date().toISOString().split('T')[0];

    const mapCard = document.createElement('div');
    mapCard.className = 'map-card';
    const mapEl = document.createElement('map-chart');
    mapEl.setAttribute('data', JSON.stringify(mapData));
    mapEl.setAttribute('name', state.title || 'Donn\u00e9es');
    mapEl.setAttribute('date', today);
    mapEl.setAttribute('value', String(avgValue));
    mapEl.setAttribute('selected-palette', mapPalette);
    mapCard.appendChild(mapEl);
    // Re-apply deferred attributes after Vue mount overwrites them
    customElements.whenDefined('map-chart').then(() => {
      setTimeout(() => {
        mapEl.setAttribute('value', String(avgValue));
        mapEl.setAttribute('date', today);
      }, 500);
    });
    chartContainer.appendChild(mapCard);
    return;
  }

  // Handle Datalist type (DSFR table preview)
  if (state.chartType === 'datalist') {
    canvas.style.display = 'none';

    const rawData = state.localData || [];

    // Use custom column config if available, otherwise auto-detect
    const visibleCols = state.datalistColumns.filter(c => c.visible);
    let columnFields: string[];
    let columnLabels: string[];
    if (visibleCols.length > 0) {
      columnFields = visibleCols.map(c => c.field);
      columnLabels = visibleCols.map(c => c.label);
    } else {
      columnFields = state.fields.length > 0
        ? state.fields.map(f => f.name)
        : (rawData.length > 0 ? Object.keys(rawData[0]) : []);
      columnLabels = columnFields;
    }

    const rows = rawData;

    const headerCells = columnLabels.map(c => `<th>${escapeHtml(c)}</th>`).join('');
    const bodyRows = rows.map(row => {
      const cells = columnFields.map(c => {
        const val = row[c];
        return `<td>${val === null || val === undefined ? '\u2014' : escapeHtml(String(val))}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    // Feature badges
    const badges: string[] = [];
    if (state.datalistRecherche) badges.push('Recherche');
    if (state.datalistFiltres) badges.push('Filtres');
    if (state.datalistExportCsv) badges.push('Export CSV');
    if (state.datalistExportHtml) badges.push('Export HTML');
    const badgesHtml = badges.length > 0
      ? `<p class="fr-text--xs fr-mb-1w" style="color: var(--text-mention-grey);">${badges.join(' \u00b7 ')}</p>`
      : '';

    const datalistCard = document.createElement('div');
    datalistCard.className = 'datalist-card';
    datalistCard.innerHTML = `
      <p class="fr-text--sm fr-mb-1w">${rawData.length} enregistrement(s)${rows.length < rawData.length ? `, ${rows.length} affich\u00e9(s)` : ''}</p>
      ${badgesHtml}
      <div class="fr-table" style="overflow-x: auto;">
        <table>
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    `;
    chartContainer.appendChild(datalistCard);
    return;
  }

  canvas.style.display = 'block';

  const labels = state.data.map(d => (d[state.labelField] as string) || 'N/A');
  const values = state.data.map(d => Math.round(((d.value as number) || 0) * 100) / 100);

  // Determine chart type for Chart.js
  let chartType: string = state.chartType;
  let indexAxis: string = 'x';

  if (state.chartType === 'horizontalBar') {
    chartType = 'bar';
    indexAxis = 'y';
  }

  // Get palette colors
  const primaryColor = PALETTE_PRIMARY_COLOR[state.palette] || '#000091';
  const paletteColors = PALETTE_COLORS[state.palette] || PALETTE_COLORS['categorical'];

  // Handle scatter chart (needs different data format)
  if (state.chartType === 'scatter') {
    const scatterData = state.data.map(d => ({
      x: (d[state.labelField] as number) || 0,
      y: (d.value as number) || 0,
    }));

    state.chartInstance = new (ChartJS())(canvas, {
      type: 'scatter',
      data: {
        datasets: [{
          label: `${state.labelField} vs ${state.valueField}`,
          data: scatterData,
          backgroundColor: primaryColor,
          borderColor: primaryColor,
          pointRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: {
          x: { title: { display: true, text: state.labelField } },
          y: { title: { display: true, text: state.valueField } },
        },
      },
    });
    return;
  }

  // Colors for pie/doughnut/radar (use palette colors)
  const isMultiColor = ['pie', 'doughnut', 'radar'].includes(state.chartType);
  const colors: string | readonly string[] = isMultiColor
    ? paletteColors.slice(0, state.data.length)
    : primaryColor;

  // Build datasets array
  const datasets: any[] = [{
    label: state.valueField,
    data: values,
    backgroundColor: colors,
    borderColor: state.chartType === 'line' ? primaryColor : colors,
    borderWidth: state.chartType === 'line' ? 2 : 1,
    fill: state.chartType !== 'line',
  }];

  // Add extra series if defined
  const activeExtraSeries = state.extraSeries.filter(s => s.field && ['bar', 'horizontalBar', 'line', 'radar'].includes(state.chartType));
  const extraColors = ['#E1000F', '#18753C', '#D64D00', '#0063CB', '#6E445A', '#009081', '#C08C36'];
  activeExtraSeries.forEach((s, i) => {
    const seriesValues = state.data.map(d => Math.round(((d[`value${i + 2}`] as number) || 0) * 100) / 100);
    const seriesColor = extraColors[i % extraColors.length];
    datasets.push({
      label: s.label || s.field,
      data: seriesValues,
      backgroundColor: seriesColor,
      borderColor: seriesColor,
      borderWidth: state.chartType === 'line' ? 2 : 1,
      fill: false,
    });
  });

  state.chartInstance = new (ChartJS())(canvas, {
    type: chartType,
    data: {
      labels: labels,
      datasets: datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: indexAxis,
      plugins: {
        legend: {
          display: isMultiColor || datasets.length > 1,
        },
      },
      scales: isMultiColor ? {} : {
        y: { beginAtZero: chartType !== 'bar' || indexAxis !== 'y' },
        x: { beginAtZero: indexAxis === 'y' },
      },
    },
  });
}
