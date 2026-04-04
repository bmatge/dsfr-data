/**
 * Monitoring app - tracks where dsfr-data are deployed.
 */

import { escapeHtml, checkAuth } from '@dsfr-data/shared';
import type { User } from '@dsfr-data/shared';
import {
  fetchMonitoringData,
  triggerRefresh,
  getMockData,
  extractDomain,
  extractPath,
  decodeUrl,
  isRealOrigin,
  type MonitoringData,
  type MonitoringEntry,
} from './monitoring-data.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GroupedEntry {
  referer: string;
  components: { component: string; chartType: string | null }[];
  firstSeen: string;
  lastSeen: string;
  callCount: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let data: MonitoringData | null = null;
let filteredEntries: MonitoringEntry[] = [];
let groupedEntries: GroupedEntry[] = [];
let sortKey: 'referer' | 'firstSeen' | 'lastSeen' | 'callCount' = 'lastSeen';
let sortDir: 'asc' | 'desc' = 'desc';
let currentUser: User | null = null;
let dbMode = false;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  const errorEl = document.getElementById('load-error');

  // Detect auth state for admin features
  // Read __gwDbMode flag (set by the backend/Docker, not by shared isDbMode which has side effects)
  dbMode = typeof window !== 'undefined' && (window as any).__gwDbMode === true;
  if (dbMode) {
    try {
      const authState = await checkAuth();
      currentUser = authState.user;
    } catch { /* no backend */ }
  }

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

  // Strip non-HTTP entries (local files, srcdoc, null origins)
  data.entries = data.entries.filter((e) => isRealOrigin(e.referer));
  filteredEntries = data.entries;
  applyGrouping();
  renderKpis();
  populateFilters();
  renderTable();
  renderAdminControls();
  setupEventListeners();
});

// ---------------------------------------------------------------------------
// Grouping — aggregate entries by page URL
// ---------------------------------------------------------------------------

function applyGrouping(): void {
  const map = new Map<string, GroupedEntry>();

  for (const e of filteredEntries) {
    const key = e.referer;
    let group = map.get(key);
    if (!group) {
      group = {
        referer: key,
        components: [],
        firstSeen: e.firstSeen,
        lastSeen: e.lastSeen,
        callCount: 0,
      };
      map.set(key, group);
    }
    group.components.push({ component: e.component, chartType: e.chartType });
    group.callCount += e.callCount;
    if (e.firstSeen < group.firstSeen) group.firstSeen = e.firstSeen;
    if (e.lastSeen > group.lastSeen) group.lastSeen = e.lastSeen;
  }

  groupedEntries = [...map.values()];
  applySort();
}

// ---------------------------------------------------------------------------
// KPIs — reactive to current filters
// ---------------------------------------------------------------------------

function renderKpis(): void {
  if (!data) return;
  const row = document.getElementById('kpi-row');
  if (!row) return;

  // Use filtered entries for KPIs so they reflect active filters
  const uniqueSites = new Set(filteredEntries.map((e) => extractDomain(e.referer))).size;
  const uniquePages = new Set(filteredEntries.map((e) => e.referer)).size;
  const totalCalls = filteredEntries.reduce((s, e) => s + e.callCount, 0);
  const generated = data.generated
    ? new Date(data.generated).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

  // Show "X / Y" when filtered
  const isFiltered = filteredEntries.length !== data.entries.length;
  const totalPages = isFiltered ? new Set(data.entries.map((e) => e.referer)).size : uniquePages;
  const totalSites = isFiltered ? new Set(data.entries.map((e) => extractDomain(e.referer))).size : uniqueSites;

  row.innerHTML = `
    <div class="monitoring-kpi">
      <div class="monitoring-kpi__value">${uniqueSites}${isFiltered ? `<span class="monitoring-kpi__total"> / ${totalSites}</span>` : ''}</div>
      <div class="monitoring-kpi__label">Sites</div>
    </div>
    <div class="monitoring-kpi">
      <div class="monitoring-kpi__value">${uniquePages}${isFiltered ? `<span class="monitoring-kpi__total"> / ${totalPages}</span>` : ''}</div>
      <div class="monitoring-kpi__label">Pages</div>
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

  // Preserve current selection
  const prevComponent = componentSelect.value;
  const prevType = typeSelect.value;

  const components = [...new Set(data.entries.map((e) => e.component))].sort();
  const types = [...new Set(data.entries.map((e) => e.chartType).filter(Boolean))].sort();

  componentSelect.innerHTML = '<option value="">Tous</option>';
  for (const c of components) {
    componentSelect.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
  }

  typeSelect.innerHTML = '<option value="">Tous</option>';
  for (const t of types) {
    typeSelect.innerHTML += `<option value="${escapeHtml(t!)}">${escapeHtml(t!)}</option>`;
  }

  // Restore selection if still valid
  componentSelect.value = prevComponent;
  typeSelect.value = prevType;
}

function applyFilters(): void {
  if (!data) return;

  const component = (document.getElementById('filter-component') as HTMLSelectElement).value;
  const chartType = (document.getElementById('filter-type') as HTMLSelectElement).value;
  const search = (document.getElementById('search-referer') as HTMLInputElement).value.toLowerCase().trim();

  filteredEntries = data.entries.filter((e) => {
    if (component && e.component !== component) return false;
    if (chartType && e.chartType !== chartType) return false;
    if (search) {
      const url = decodeUrl(e.referer).toLowerCase();
      const domain = extractDomain(e.referer).toLowerCase();
      const path = extractPath(e.referer).toLowerCase();
      if (!url.includes(search) && !domain.includes(search) && !path.includes(search)) return false;
    }
    return true;
  });

  applyGrouping();
  renderKpis();
  renderTable();
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

function applySort(): void {
  groupedEntries.sort((a, b) => {
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

function toggleSort(key: typeof sortKey): void {
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
// Table rendering — grouped by page
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

function renderComponentBadges(components: GroupedEntry['components']): string {
  // Aggregate by component name, collect chart types per component
  const map = new Map<string, string[]>();
  for (const c of components) {
    const label = c.component.replace('dsfr-data-', '');
    if (!map.has(label)) map.set(label, []);
    if (c.chartType) map.get(label)!.push(c.chartType);
  }

  return [...map.entries()]
    .map(([label, types]) => {
      const n = types.length || 1;
      const countPrefix = n > 1 ? `<span class="monitoring-badge__count">${n}</span>` : '';
      const typeSuffix = types.length
        ? ' ' + types.map((t) => `<span class="monitoring-badge monitoring-badge--type">${escapeHtml(t)}</span>`).join(' ')
        : '';
      return `<span class="monitoring-badge">${countPrefix}${escapeHtml(label)}</span>${typeSuffix}`;
    })
    .join(' ');
}

const isAdmin = () => currentUser?.role === 'admin' && dbMode;

function renderTable(): void {
  const container = document.getElementById('monitoring-table');
  if (!container) return;

  if (groupedEntries.length === 0) {
    container.innerHTML = '<div class="monitoring-empty">Aucun widget trouve</div>';
    return;
  }

  const showDelete = isAdmin();

  const rows = groupedEntries
    .map(
      (e) => `
    <tr>
      <td><a href="${escapeHtml(decodeUrl(e.referer))}" target="_blank" rel="noopener" class="monitoring-link" title="${escapeHtml(decodeUrl(e.referer))}">${escapeHtml(extractDomain(e.referer))}</a></td>
      <td class="monitoring-link" title="${escapeHtml(extractPath(e.referer))}">${escapeHtml(extractPath(e.referer))}</td>
      <td class="monitoring-components">${renderComponentBadges(e.components)}</td>
      <td class="monitoring-date">${formatDate(e.firstSeen)}</td>
      <td class="monitoring-date">${formatDate(e.lastSeen)}</td>
      <td class="monitoring-count">${e.callCount.toLocaleString('fr-FR')}</td>
      ${showDelete ? `<td><button class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm monitoring-delete-btn" data-referer="${escapeHtml(e.referer)}" title="Supprimer"><i class="ri-delete-bin-line"></i></button></td>` : ''}
    </tr>`)
    .join('');

  container.innerHTML = `
    <table class="fr-table monitoring-table">
      <thead>
        <tr>
          <th data-sort="referer">Site ${sortIcon('referer')}</th>
          <th>Page</th>
          <th>Composants</th>
          <th data-sort="firstSeen">Premier appel ${sortIcon('firstSeen')}</th>
          <th data-sort="lastSeen">Dernier appel ${sortIcon('lastSeen')}</th>
          <th data-sort="callCount">Appels ${sortIcon('callCount')}</th>
          ${showDelete ? '<th></th>' : ''}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  // Attach sort handlers
  container.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      toggleSort(th.getAttribute('data-sort') as typeof sortKey);
    });
  });

  // Attach delete handlers
  if (showDelete) {
    container.querySelectorAll('.monitoring-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const referer = btn.getAttribute('data-referer')!;
        deleteByReferer(referer);
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Admin controls — purge & per-page delete
// ---------------------------------------------------------------------------

function renderAdminControls(): void {
  const slot = document.getElementById('admin-controls');
  if (!slot || !isAdmin()) return;

  slot.innerHTML = `
    <button class="fr-btn fr-btn--secondary fr-btn--sm fr-btn--icon-left" id="btn-purge" style="color:var(--text-default-error);">
      <i class="ri-delete-bin-2-line"></i> Purger tout
    </button>
  `;

  document.getElementById('btn-purge')?.addEventListener('click', purgeAll);
}

async function purgeAll(): Promise<void> {
  if (!confirm('Supprimer toutes les donnees de monitoring ? Cette action est irreversible.')) return;

  try {
    const res = await fetch('/api/monitoring/data', {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await refreshData();
  } catch (err) {
    console.error('Purge failed:', err);
    alert('Erreur lors de la purge');
  }
}

async function deleteByReferer(referer: string): Promise<void> {
  const domain = extractDomain(referer);
  const path = extractPath(referer);
  if (!confirm(`Supprimer les donnees de monitoring pour ${domain}${path} ?`)) return;

  try {
    const res = await fetch('/api/monitoring/entries', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referer }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await refreshData();
  } catch (err) {
    console.error('Delete failed:', err);
    alert('Erreur lors de la suppression');
  }
}

// ---------------------------------------------------------------------------
// Shared refresh logic
// ---------------------------------------------------------------------------

async function refreshData(): Promise<void> {
  const errEl = document.getElementById('load-error');

  try {
    data = await fetchMonitoringData();
    if (errEl) {
      errEl.className = 'fr-alert fr-alert--success fr-mb-2w';
      errEl.textContent = `Donnees reelles chargees (${data.entries.length} entrees)`;
      errEl.style.display = 'block';
    }
  } catch (err) {
    data = getMockData();
    const detail = err instanceof Error ? err.message : String(err);
    if (errEl) {
      errEl.className = 'fr-alert fr-alert--warning fr-mb-2w';
      errEl.innerHTML = `<strong>Donnees de demonstration</strong> — ${escapeHtml(detail)}`;
      errEl.style.display = 'block';
    }
  }

  // Strip non-HTTP entries
  data.entries = data.entries.filter((e) => isRealOrigin(e.referer));

  // Re-apply current filters
  applyFilters();
  populateFilters();
  renderKpis();
  renderTable();
}

// ---------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------

function exportCsv(): void {
  const headers = ['Site', 'Page', 'Composants', 'Types', 'Premier appel', 'Dernier appel', 'Appels'];
  const rows = groupedEntries.map((e) => [
    extractDomain(decodeUrl(e.referer)),
    extractPath(decodeUrl(e.referer)),
    e.components.map((c) => c.component).join(', '),
    e.components.map((c) => c.chartType || '').filter(Boolean).join(', '),
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
    btn.disabled = true;
    btn.textContent = 'Mise a jour...';

    await triggerRefresh();
    await refreshData();

    btn.disabled = false;
    btn.innerHTML = '<i class="ri-refresh-line"></i> Actualiser';
  });
}
