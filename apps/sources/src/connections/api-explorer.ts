/**
 * REST API data loading with full pagination support.
 */

import {
  escapeHtml,
  getProxiedUrl,
  isUnsafeKey,
  saveToStorage,
  STORAGE_KEYS,
} from '@dsfr-data/shared';

import { state } from '../state.js';
import type { Source } from '../state.js';
import { renderSources } from './connection-manager.js';

// ============================================================
// Load API Data (with pagination)
// ============================================================

export async function loadApiData(): Promise<void> {
  if (state.selectedConnectionId === null) return;

  const conn = state.connections.find((c) => c.id === state.selectedConnectionId);
  if (!conn || conn.type !== 'api') return;

  const info = document.getElementById('preview-info');
  const table = document.getElementById('preview-table');
  if (!info || !table) return;

  info.textContent = 'Chargement...';
  const thead = table.querySelector('thead tr');
  const tbody = table.querySelector('tbody');
  if (thead) thead.innerHTML = '';
  if (tbody) tbody.innerHTML = '';

  try {
    const connHeaders: Record<string, string> = conn.headers
      ? JSON.parse(conn.headers as string)
      : {};

    const connApiUrl = (conn as Record<string, unknown>).apiUrl as string | undefined;
    if (!connApiUrl) {
      info.textContent = 'Erreur : URL API manquante dans la connexion';
      return;
    }

    // Fetch all pages if pagination is detected
    let allData: Record<string, unknown>[] = [];
    let currentUrl: string | null = getProxiedUrl(connApiUrl);
    let pageCount = 0;
    let apiTotalCount = -1; // Total records reported by API (e.g. ODS total_count)
    const maxPages = 100; // Safety limit

    while (currentUrl && pageCount < maxPages) {
      pageCount++;
      info.textContent = pageCount > 1 ? `Chargement... (page ${pageCount})` : 'Chargement...';

      const response = await fetch(currentUrl, {
        method: ((conn as Record<string, unknown>).method as string) || 'GET',
        headers: connHeaders,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const jsonResponse = await response.json();

      // Capture total count from response body (ODS: total_count) or headers
      if (apiTotalCount < 0) {
        if (typeof jsonResponse.total_count === 'number') {
          apiTotalCount = jsonResponse.total_count;
        } else if (typeof jsonResponse.count === 'number') {
          apiTotalCount = jsonResponse.count;
        } else {
          const headerTotal =
            response.headers.get('X-Total-Count') || response.headers.get('X-Total');
          if (headerTotal) apiTotalCount = parseInt(headerTotal, 10);
        }
      }

      // Extract data using dataPath
      let pageData: unknown = jsonResponse;
      const dataPath = (conn as Record<string, unknown>).dataPath as string | null;
      if (dataPath) {
        const parts = dataPath.split('.');
        for (const part of parts) {
          if (isUnsafeKey(part)) {
            pageData = undefined;
            break;
          }
          if (pageData && typeof pageData === 'object') {
            // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop
            pageData = (pageData as Record<string, unknown>)[part];
          }
        }
      }

      // Normalize to array and add to allData
      if (Array.isArray(pageData)) {
        allData = allData.concat(pageData as Record<string, unknown>[]);
      } else if (pageData) {
        allData.push(pageData as Record<string, unknown>);
      }

      // Check for pagination patterns
      let nextUrl: string | null = null;

      // Pattern 1: links.next (common in REST APIs like tabular-api.data.gouv.fr)
      if (jsonResponse.links && typeof jsonResponse.links === 'object' && jsonResponse.links.next) {
        nextUrl = jsonResponse.links.next as string;
        // Handle relative URLs
        if (nextUrl && !nextUrl.startsWith('http')) {
          const baseUrl = new URL((conn as Record<string, unknown>).apiUrl as string);
          nextUrl = new URL(nextUrl, baseUrl.origin).href;
        }
      }
      // Pattern 2: meta with page info
      else if (
        jsonResponse.meta &&
        typeof jsonResponse.meta === 'object' &&
        jsonResponse.meta.total &&
        jsonResponse.meta.page_size
      ) {
        const meta = jsonResponse.meta as Record<string, number>;
        const currentPage = meta.page || 1;
        const totalPages = Math.ceil(meta.total / meta.page_size);

        if (currentPage < totalPages) {
          const pageUrl: URL = new URL(currentUrl);
          pageUrl.searchParams.set('page', String(currentPage + 1));
          nextUrl = pageUrl.href;
        }
      }
      // Pattern 3: next_page or nextPage field at root level
      else if (jsonResponse.next_page || jsonResponse.nextPage) {
        nextUrl = (jsonResponse.next_page || jsonResponse.nextPage) as string;
      }

      // Apply proxy to next URL if needed
      currentUrl = nextUrl ? getProxiedUrl(nextUrl) : null;
    }

    // Normalize to array
    let data = allData;
    if (!Array.isArray(data)) {
      data = data ? [data as unknown as Record<string, unknown>] : [];
    }

    state.tableData = data;
    state.apiTotalCount = apiTotalCount;

    if (data.length === 0) {
      info.textContent = 'Aucune donnee';
      return;
    }

    // Get columns from first record
    const columns = Object.keys(data[0]);

    // Header
    let headerHtml = '';
    columns.forEach((col) => {
      headerHtml += `<th>${escapeHtml(col)}</th>`;
    });
    if (thead) thead.innerHTML = headerHtml;

    // Body (show first 20 for preview)
    let bodyHtml = '';
    data.slice(0, 20).forEach((record) => {
      bodyHtml += '<tr>';
      columns.forEach((col) => {
        const val = record[col];
        bodyHtml += `<td>${escapeHtml(String(val ?? ''))}</td>`;
      });
      bodyHtml += '</tr>';
    });
    if (tbody) tbody.innerHTML = bodyHtml;

    const paginationInfo = pageCount > 1 ? ` (${pageCount} pages)` : '';
    const totalInfo = apiTotalCount > data.length ? ` / ${apiTotalCount} total` : '';
    info.textContent = `${data.length} enregistrements${totalInfo}${paginationInfo}`;

    // Save as current source for builder
    saveApiAsSource();

    // Show favorite button
    const favBtn = document.getElementById('save-favorite-btn');
    if (favBtn) favBtn.style.display = '';
  } catch (error) {
    info.textContent = `Erreur : ${(error as Error).message}`;
  }
}

// ============================================================
// Save API data as source (for builder)
// ============================================================

export function saveApiAsSource(): void {
  if (state.selectedConnectionId === null) return;

  const conn = state.connections.find((c) => c.id === state.selectedConnectionId);
  if (!conn) return;

  const source: Source = {
    id: `api_${conn.id}`,
    name: conn.name,
    type: 'api',
    connectionId: conn.id,
    apiUrl: (conn as Record<string, unknown>).apiUrl as string,
    method: (conn as Record<string, unknown>).method as string,
    headers: (conn as Record<string, unknown>).headers as string | null,
    dataPath: (conn as Record<string, unknown>).dataPath as string | null,
    data: state.tableData as Record<string, unknown>[],
    recordCount: state.apiTotalCount > 0 ? state.apiTotalCount : state.tableData.length,
  };

  localStorage.setItem(STORAGE_KEYS.SELECTED_SOURCE, JSON.stringify(source));

  // Auto-save to sources list (upsert)
  const idx = state.sources.findIndex((s) => s.id === source.id);
  if (idx >= 0) {
    state.sources[idx] = source;
  } else {
    state.sources.push(source);
  }
  saveToStorage(STORAGE_KEYS.SOURCES, state.sources);
  renderSources();
}
