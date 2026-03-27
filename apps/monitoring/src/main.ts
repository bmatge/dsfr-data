/**
 * Monitoring app - tracks where dsfr-data are deployed.
 */

import { escapeHtml } from '@dsfr-data/shared';
import {
  fetchMonitoringData,
  triggerRefresh,
  getMockData,
  extractDomain,
  extractPath,
  decodeUrl,
  type MonitoringData,
  type MonitoringEntry,
} from './monitoring-data.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let data: MonitoringData | null = null;
let filteredEntries: MonitoringEntry[] = [];
let sortKey: keyof MonitoringEntry = 'lastSeen';
let sortDir: 'asc' | 'desc' = 'desc';

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  const errorEl = document.getElementById('load-error');

  try {
    data = await fetchMonitoringData();
    if (errorEl) {
      errorEl.className = 'fr-alert fr-alert--success fr-mb-2w';
      errorEl.textContent = `Donnees reelles chargees (${data.entries.length} entrees)`;
      errorEl.style.display = 'block';
    }
  } catch (err) {
    data = getMockData();
    const detail = err instanceof Error ? err.message : String(err);
    if (errorEl) {
      errorEl.className = 'fr-alert fr-alert--warning fr-mb-2w';
      errorEl.innerHTML = `<strong>Donnees de demonstration</strong> — Impossible de charger les donnees reelles : <code>${escapeHtml(detail)}</code>`;
      errorEl.style.display = 'block';
    }
    console.warn('[monitoring] fetch failed, using mock data:', detail);
  }

  filteredEntries = data.entries;
  renderKpis();
  populateFilters();
  renderTable();
  setupEventListeners();
});

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

function renderKpis(): void {
  if (!data) return;
  const row = document.getElementById('kpi-row');
  if (!row) return;

  const uniqueSites = new Set(data.entries.map((e) => extractDomain(e.referer))).size;
  const totalComponents = data.entries.length;
  const totalCalls = data.entries.reduce((s, e) => s + e.callCount, 0);
  const generated = data.generated
    ? new Date(data.generated).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

  row.innerHTML = `
    <div class="monitoring-kpi">
      <div class="monitoring-kpi__value">${uniqueSites}</div>
      <div class="monitoring-kpi__label">Sites deployes</div>
    </div>
    <div class="monitoring-kpi">
      <div class="monitoring-kpi__value">${totalComponents}</div>
      <div class="monitoring-kpi__label">Widgets actifs</div>
    </div>
    <div class="monitoring-kpi">
      <div class="monitoring-kpi__value">${totalCalls.toLocaleString('fr-FR')}</div>
      <div class="monitoring-kpi__label">Appels totaux</div>
    </div>
    <div class="monitoring-kpi">
      <div class="monitoring-kpi__value" style="font-size:1rem">${generated}</div>
      <div class="monitoring-kpi__label">Derniere mise a jour</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function populateFilters(): void {
  if (!data) return;

  const componentSelect = document.getElementById('filter-component') as HTMLSelectElement;
  const typeSelect = document.getElementById('filter-type') as HTMLSelectElement;

  const components = [...new Set(data.entries.map((e) => e.component))].sort();
  const types = [...new Set(data.entries.map((e) => e.chartType).filter(Boolean))].sort();

  for (const c of components) {
    componentSelect.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
  }
  for (const t of types) {
    typeSelect.innerHTML += `<option value="${escapeHtml(t!)}">${escapeHtml(t!)}</option>`;
  }
}

function applyFilters(): void {
  if (!data) return;

  const component = (document.getElementById('filter-component') as HTMLSelectElement).value;
  const chartType = (document.getElementById('filter-type') as HTMLSelectElement).value;
  const search = (document.getElementById('search-referer') as HTMLInputElement).value.toLowerCase();

  filteredEntries = data.entries.filter((e) => {
    if (component && e.component !== component) return false;
    if (chartType && e.chartType !== chartType) return false;
    if (search && !decodeUrl(e.referer).toLowerCase().includes(search)) return false;
    return true;
  });

  applySort();
  renderTable();
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

function applySort(): void {
  filteredEntries.sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;

    let cmp: number;
    if (typeof av === 'number' && typeof bv === 'number') {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv), 'fr');
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });
}

function toggleSort(key: keyof MonitoringEntry): void {
  if (sortKey === key) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey = key;
    sortDir = key === 'callCount' || key === 'lastSeen' ? 'desc' : 'asc';
  }
  applySort();
  renderTable();
}

// ---------------------------------------------------------------------------
// Table rendering
// ---------------------------------------------------------------------------

function sortIcon(key: string): string {
  const active = sortKey === key;
  const arrow = active ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u25BC';
  return `<span class="sort-icon ${active ? 'active' : ''}">${arrow}</span>`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function renderTable(): void {
  const container = document.getElementById('monitoring-table');
  if (!container) return;

  if (filteredEntries.length === 0) {
    container.innerHTML = '<div class="monitoring-empty">Aucun widget trouve</div>';
    return;
  }

  const rows = filteredEntries
    .map(
      (e) => `
    <tr>
      <td><a href="${escapeHtml(decodeUrl(e.referer))}" target="_blank" rel="noopener" class="monitoring-link" title="${escapeHtml(decodeUrl(e.referer))}">${escapeHtml(extractDomain(e.referer))}</a></td>
      <td class="monitoring-link" title="${escapeHtml(extractPath(e.referer))}">${escapeHtml(extractPath(e.referer))}</td>
      <td><span class="monitoring-badge">${escapeHtml(e.component)}</span></td>
      <td>${e.chartType ? `<span class="monitoring-badge monitoring-badge--type">${escapeHtml(e.chartType)}</span>` : '-'}</td>
      <td class="monitoring-date">${formatDate(e.firstSeen)}</td>
      <td class="monitoring-date">${formatDate(e.lastSeen)}</td>
      <td class="monitoring-count">${e.callCount.toLocaleString('fr-FR')}</td>
    </tr>`
    )
    .join('');

  container.innerHTML = `
    <table class="fr-table monitoring-table">
      <thead>
        <tr>
          <th data-sort="referer">Site ${sortIcon('referer')}</th>
          <th>Page</th>
          <th data-sort="component">Composant ${sortIcon('component')}</th>
          <th data-sort="chartType">Type ${sortIcon('chartType')}</th>
          <th data-sort="firstSeen">Premier appel ${sortIcon('firstSeen')}</th>
          <th data-sort="lastSeen">Dernier appel ${sortIcon('lastSeen')}</th>
          <th data-sort="callCount">Appels ${sortIcon('callCount')}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  // Attach sort handlers
  container.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      toggleSort(th.getAttribute('data-sort') as keyof MonitoringEntry);
    });
  });
}

// ---------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------

function exportCsv(): void {
  const headers = ['Site', 'Page', 'Composant', 'Type', 'Premier appel', 'Dernier appel', 'Appels'];
  const rows = filteredEntries.map((e) => [
    extractDomain(decodeUrl(e.referer)),
    extractPath(decodeUrl(e.referer)),
    e.component,
    e.chartType || '',
    e.firstSeen,
    e.lastSeen,
    String(e.callCount),
  ]);

  const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `monitoring-widgets-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

function setupEventListeners(): void {
  document.getElementById('filter-component')?.addEventListener('change', applyFilters);
  document.getElementById('filter-type')?.addEventListener('change', applyFilters);

  let searchTimeout: ReturnType<typeof setTimeout>;
  document.getElementById('search-referer')?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(applyFilters, 300);
  });

  document.getElementById('btn-export')?.addEventListener('click', exportCsv);
  document.getElementById('btn-refresh')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh') as HTMLButtonElement;
    const errEl = document.getElementById('load-error');
    btn.disabled = true;
    btn.textContent = 'Mise a jour...';

    // Trigger server-side parsing then fetch fresh data
    await triggerRefresh();

    try {
      data = await fetchMonitoringData();
      filteredEntries = data.entries;
      if (errEl) {
        errEl.className = 'fr-alert fr-alert--success fr-mb-2w';
        errEl.textContent = `Donnees reelles chargees (${data.entries.length} entrees)`;
        errEl.style.display = 'block';
      }
    } catch (err) {
      data = getMockData();
      filteredEntries = data.entries;
      const detail = err instanceof Error ? err.message : String(err);
      if (errEl) {
        errEl.className = 'fr-alert fr-alert--warning fr-mb-2w';
        errEl.innerHTML = `<strong>Donnees de demonstration</strong> — ${escapeHtml(detail)}`;
        errEl.style.display = 'block';
      }
    }
    renderKpis();
    renderTable();
    btn.disabled = false;
    btn.innerHTML = '<i class="ri-refresh-line"></i> Actualiser';
  });
}
