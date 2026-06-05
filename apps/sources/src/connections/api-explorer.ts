/**
 * REST API data loading with paginated previews.
 *
 * Loads ONE page by default and surfaces a banner with explicit
 * "Charger plus" / "Tout charger" / "Stop" actions when the API
 * exposes pagination metadata. Default cap on `Tout charger` is 5 pages
 * to protect the user from accidentally pulling tens of thousands of records.
 */

import {
  escapeHtml,
  buildProxiedRequest,
  httpErrorMessage,
  isUnsafeKey,
  saveToStorage,
  STORAGE_KEYS,
  toastError,
} from '@dsfr-data/shared';

import { state } from '../state.js';
import type { Source } from '../state.js';
import { renderSources, renderPreviewMeta } from './connection-manager.js';

// ============================================================
// Configuration
// ============================================================

/** Hard cap when the user clicks "Tout charger". Above this we stop and warn. */
const HARD_MAX_PAGES = 100;

/** Default soft cap used by the "Charger plus" button. */
const SOFT_MAX_PAGES = 5;

// ============================================================
// In-progress load state (module-level, single-active-load model)
// ============================================================

interface LoadContext {
  conn: Record<string, unknown>;
  connHeaders: Record<string, string>;
  allData: Record<string, unknown>[];
  nextUrl: string | null;
  pageCount: number;
  apiTotalCount: number;
  controller: AbortController;
}

let activeLoad: LoadContext | null = null;

// ============================================================
// Helpers — pagination patterns
// ============================================================

function extractDataFromPage(jsonResponse: unknown, dataPath: string | null): unknown {
  if (!dataPath) return jsonResponse;
  let data: unknown = jsonResponse;
  const parts = dataPath.split('.');
  for (const part of parts) {
    if (isUnsafeKey(part)) return undefined;
    if (data && typeof data === 'object') {
      // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop
      data = (data as Record<string, unknown>)[part];
    }
  }
  return data;
}

function detectNextUrl(
  jsonResponse: Record<string, unknown>,
  currentUrl: string,
  conn: Record<string, unknown>
): string | null {
  // Pattern 1: links.next (REST APIs like tabular-api.data.gouv.fr)
  const links = jsonResponse.links as Record<string, unknown> | undefined;
  if (links && typeof links === 'object' && links.next) {
    let next = links.next as string;
    if (next && !next.startsWith('http')) {
      try {
        const baseUrl = new URL(conn.apiUrl as string);
        next = new URL(next, baseUrl.origin).href;
      } catch {
        return null;
      }
    }
    return next;
  }
  // Pattern 2: meta with page info
  const meta = jsonResponse.meta as Record<string, number> | undefined;
  if (meta && typeof meta === 'object' && meta.total && meta.page_size) {
    const currentPage = meta.page || 1;
    const totalPages = Math.ceil(meta.total / meta.page_size);
    if (currentPage < totalPages) {
      const pageUrl: URL = new URL(currentUrl);
      pageUrl.searchParams.set('page', String(currentPage + 1));
      return pageUrl.href;
    }
    return null;
  }
  // Pattern 3: next_page or nextPage field at root level
  if (jsonResponse.next_page || jsonResponse.nextPage) {
    return (jsonResponse.next_page || jsonResponse.nextPage) as string;
  }
  return null;
}

function captureTotalCount(jsonResponse: Record<string, unknown>, response: Response): number {
  if (typeof jsonResponse.total_count === 'number') return jsonResponse.total_count;
  if (typeof jsonResponse.count === 'number') return jsonResponse.count;
  const headerTotal = response.headers.get('X-Total-Count') || response.headers.get('X-Total');
  if (headerTotal) {
    const n = parseInt(headerTotal, 10);
    if (!Number.isNaN(n)) return n;
  }
  return -1;
}

// ============================================================
// Helpers — DOM rendering
// ============================================================

function getPreviewElements(): {
  info: HTMLElement | null;
  thead: Element | null;
  tbody: Element | null;
} {
  const info = document.getElementById('preview-info');
  const table = document.getElementById('preview-table');
  const thead = table?.querySelector('thead tr') ?? null;
  const tbody = table?.querySelector('tbody') ?? null;
  return { info, thead, tbody };
}

function renderPreviewTable(data: Record<string, unknown>[]): void {
  const { thead, tbody } = getPreviewElements();
  if (!thead || !tbody) return;

  if (data.length === 0) {
    thead.innerHTML = '';
    tbody.innerHTML = '';
    return;
  }

  const columns = Object.keys(data[0]);
  let headerHtml = '';
  columns.forEach((col) => {
    headerHtml += `<th>${escapeHtml(col)}</th>`;
  });
  thead.innerHTML = headerHtml;

  let bodyHtml = '';
  data.slice(0, 20).forEach((record) => {
    bodyHtml += '<tr>';
    columns.forEach((col) => {
      const val = record[col];
      bodyHtml += `<td>${escapeHtml(String(val ?? ''))}</td>`;
    });
    bodyHtml += '</tr>';
  });
  tbody.innerHTML = bodyHtml;
}

function ensurePaginationBanner(): HTMLElement {
  let banner = document.getElementById('pagination-banner');
  if (banner) return banner;
  banner = document.createElement('div');
  banner.id = 'pagination-banner';
  banner.style.cssText =
    'margin:0.5rem 0 1rem;padding:0.75rem 1rem;border:1px solid #cfd5e4;border-left:4px solid #6a6af4;background:#f5f5fe;border-radius:4px;display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;font-size:0.875rem;';
  const info = document.getElementById('preview-info');
  info?.parentElement?.insertBefore(banner, info.nextSibling);

  // Delegate clicks for action buttons
  banner.addEventListener('click', (e: Event) => {
    const target = e.target as HTMLElement;
    const action = target.dataset.action;
    if (!action) return;
    if (action === 'load-more') loadMoreApiPages(SOFT_MAX_PAGES);
    else if (action === 'load-all') loadMoreApiPages(HARD_MAX_PAGES);
    else if (action === 'stop') stopApiLoading();
  });

  return banner;
}

function hidePaginationBanner(): void {
  const banner = document.getElementById('pagination-banner');
  if (banner) banner.style.display = 'none';
}

function renderPaginationBanner(opts: {
  pagesLoaded: number;
  recordsLoaded: number;
  apiTotalCount: number;
  hasMore: boolean;
  loading: boolean;
}): void {
  const banner = ensurePaginationBanner();
  banner.style.display = '';

  const { pagesLoaded, recordsLoaded, apiTotalCount, hasMore, loading } = opts;
  const totalSuffix = apiTotalCount > recordsLoaded ? ` sur ${apiTotalCount}` : '';

  if (loading) {
    banner.innerHTML = `
      <span><strong>Chargement…</strong> page ${pagesLoaded + 1} (${recordsLoaded}${totalSuffix} enregistrements jusqu'ici).</span>
      <button class="fr-btn fr-btn--sm fr-btn--secondary" data-action="stop" type="button">Stop</button>
    `;
    return;
  }

  if (!hasMore) {
    banner.innerHTML = `<span>${recordsLoaded} enregistrements chargés${totalSuffix} (${pagesLoaded} page${pagesLoaded > 1 ? 's' : ''}). Tout est récupéré.</span>`;
    return;
  }

  banner.innerHTML = `
    <span><strong>${recordsLoaded} enregistrements chargés${totalSuffix}</strong> (page ${pagesLoaded}). D'autres pages sont disponibles :</span>
    <button class="fr-btn fr-btn--sm" data-action="load-more" type="button">Charger ${SOFT_MAX_PAGES} pages de plus</button>
    <button class="fr-btn fr-btn--sm fr-btn--secondary" data-action="load-all" type="button">Tout charger</button>
  `;
}

// ============================================================
// Core fetch loop
// ============================================================

async function fetchOnePage(ctx: LoadContext, rawUrl: string): Promise<Response> {
  const method = (ctx.conn.method as string) || 'GET';
  // `rawUrl` est l'URL cible brute (non proxifiée). On la route au moment du
  // fetch via le proxy adéquat (dédié, direct ou CORS générique) en injectant
  // les en-têtes utilisateur — indispensable pour les API à clé en en-tête.
  const { url, headers } = buildProxiedRequest(rawUrl, ctx.connHeaders);
  return fetch(url, {
    method,
    headers,
    signal: ctx.controller.signal,
  });
}

/**
 * Run the fetch loop until `maxAdditionalPages` are loaded or no more pages.
 * Renders progress as it goes. Throws on HTTP error or on abort.
 */
async function runFetchLoop(ctx: LoadContext, maxAdditionalPages: number): Promise<void> {
  const startCount = ctx.pageCount;
  while (ctx.nextUrl && ctx.pageCount - startCount < maxAdditionalPages) {
    renderPaginationBanner({
      pagesLoaded: ctx.pageCount,
      recordsLoaded: ctx.allData.length,
      apiTotalCount: ctx.apiTotalCount,
      hasMore: true,
      loading: true,
    });

    const response = await fetchOnePage(ctx, ctx.nextUrl);
    if (!response.ok) {
      throw new Error(httpErrorMessage(response.status));
    }
    const jsonResponse = (await response.json()) as Record<string, unknown>;

    if (ctx.apiTotalCount < 0) {
      ctx.apiTotalCount = captureTotalCount(jsonResponse, response);
    }

    const dataPath = (ctx.conn.dataPath as string | null) ?? null;
    const pageData = extractDataFromPage(jsonResponse, dataPath);
    if (Array.isArray(pageData)) {
      ctx.allData = ctx.allData.concat(pageData as Record<string, unknown>[]);
    } else if (pageData) {
      ctx.allData.push(pageData as Record<string, unknown>);
    }

    ctx.pageCount++;
    // On stocke l'URL de page suivante BRUTE : fetchOnePage la proxifiera.
    ctx.nextUrl = detectNextUrl(jsonResponse, ctx.nextUrl, ctx.conn);
  }
}

function commitLoadedData(ctx: LoadContext): void {
  state.tableData = ctx.allData;
  state.apiTotalCount = ctx.apiTotalCount;
  renderPreviewTable(ctx.allData);
  renderPreviewMeta({
    kind: 'connexion',
    url: ctx.conn.apiUrl as string | undefined,
    rows: ctx.allData,
    totalCount: ctx.apiTotalCount > 0 ? ctx.apiTotalCount : undefined,
  });
  const { info } = getPreviewElements();
  if (info) {
    const totalInfo = ctx.apiTotalCount > ctx.allData.length ? ` / ${ctx.apiTotalCount} total` : '';
    info.textContent = `${ctx.allData.length} enregistrements${totalInfo}`;
  }
  renderPaginationBanner({
    pagesLoaded: ctx.pageCount,
    recordsLoaded: ctx.allData.length,
    apiTotalCount: ctx.apiTotalCount,
    hasMore: !!ctx.nextUrl,
    loading: false,
  });
  if (ctx.pageCount <= 1 && !ctx.nextUrl) {
    hidePaginationBanner();
  }
  saveApiAsSource();
  const favBtn = document.getElementById('save-favorite-btn');
  if (favBtn) favBtn.style.display = '';
}

// ============================================================
// Public API
// ============================================================

/**
 * Cancel any in-flight pagination load. Safe to call when nothing is loading.
 */
export function stopApiLoading(): void {
  if (activeLoad) {
    activeLoad.controller.abort();
  }
}

/**
 * Load the first page of an API source and set up the pagination banner
 * if additional pages are detected. Replaces any previous in-flight load.
 */
export async function loadApiData(): Promise<void> {
  if (state.selectedConnectionId === null) return;

  const conn = state.connections.find((c) => c.id === state.selectedConnectionId);
  if (!conn || conn.type !== 'api') return;

  const { info, thead, tbody } = getPreviewElements();
  if (!info) return;

  // Cancel any previous load before starting a new one
  if (activeLoad) {
    activeLoad.controller.abort();
    activeLoad = null;
  }
  hidePaginationBanner();

  info.textContent = 'Chargement…';
  if (thead) thead.innerHTML = '';
  if (tbody) tbody.innerHTML = '';

  const connRecord = conn as unknown as Record<string, unknown>;
  const apiUrl = connRecord.apiUrl as string | undefined;
  if (!apiUrl) {
    info.textContent = 'Erreur : URL API manquante dans la connexion';
    return;
  }

  let connHeaders: Record<string, string> = {};
  const headersStr = connRecord.headers as string | null;
  if (headersStr) {
    try {
      connHeaders = JSON.parse(headersStr) as Record<string, string>;
    } catch {
      info.textContent = 'Erreur : en-têtes JSON invalides dans la connexion';
      return;
    }
  }

  const ctx: LoadContext = {
    conn: connRecord,
    connHeaders,
    allData: [],
    nextUrl: apiUrl,
    pageCount: 0,
    apiTotalCount: -1,
    controller: new AbortController(),
  };
  activeLoad = ctx;

  try {
    await runFetchLoop(ctx, 1);
    if (activeLoad !== ctx) return; // a newer load took over; bail out silently
    commitLoadedData(ctx);
    if (ctx.allData.length === 0) {
      info.textContent = 'Aucune donnée';
    }
  } catch (error) {
    if (activeLoad !== ctx) return; // superseded by a newer load
    if ((error as Error).name === 'AbortError') {
      info.textContent = ctx.allData.length
        ? `${ctx.allData.length} enregistrements (chargement interrompu)`
        : 'Chargement interrompu';
      if (ctx.allData.length) commitLoadedData(ctx);
    } else {
      info.textContent = `Erreur : ${(error as Error).message}`;
      toastError(`Impossible de charger les données : ${(error as Error).message}`);
      activeLoad = null;
      return;
    }
  }

  // Keep activeLoad set if there's more to fetch so the user can click "Charger plus".
  // Otherwise free it to release the reference.
  if (activeLoad === ctx && !ctx.nextUrl) {
    activeLoad = null;
  }
}

/**
 * Continue loading additional pages from where `loadApiData` left off.
 * Triggered by user clicks on the pagination banner.
 */
export async function loadMoreApiPages(maxAdditionalPages: number): Promise<void> {
  if (!activeLoad) {
    // The original load completed and freed the context. Walk it back from
    // current state: we need a fresh AbortController and re-derive nextUrl
    // is impossible without persisting it. So: instruct user to reload.
    toastError(
      'Le contexte de chargement a été perdu. Cliquez sur « Rafraîchir » pour recommencer.'
    );
    return;
  }
  if (!activeLoad.nextUrl) return; // nothing more to load

  // Re-claim the controller (the previous one is already used/aborted)
  activeLoad.controller = new AbortController();

  const ctx = activeLoad;
  try {
    await runFetchLoop(ctx, maxAdditionalPages);
    if (activeLoad !== ctx) return;
    commitLoadedData(ctx);
  } catch (error) {
    if (activeLoad !== ctx) return;
    if ((error as Error).name === 'AbortError') {
      commitLoadedData(ctx);
      const { info } = getPreviewElements();
      if (info) info.textContent = `${ctx.allData.length} enregistrements (chargement interrompu)`;
    } else {
      toastError(`Erreur de chargement : ${(error as Error).message}`);
      activeLoad = null;
      return;
    }
  }

  if (activeLoad === ctx && !ctx.nextUrl) {
    activeLoad = null;
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
