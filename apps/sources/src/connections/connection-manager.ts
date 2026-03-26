/**
 * Connection CRUD operations: create, read, update, delete, render.
 */

import {
  escapeHtml,
  saveToStorage,
  STORAGE_KEYS,
  openModal,
  closeModal,
  getProxiedUrl,
  getProxyUrl,
  buildGristHeaders,
  isViteDevMode,
  toastWarning,
  toastSuccess,
  toastError,
  confirmDialog,
  getApiAdapter,
  performJoin,
} from '@dsfr-data/shared';
import type { JoinType, Source } from '@dsfr-data/shared';

import { state, EXTERNAL_PROXY } from '../state.js';
import type { StoredConnection } from '../state.js';
import { loadDocuments } from './grist-explorer.js';
import { loadApiData } from './api-explorer.js';

// ============================================================
// Render
// ============================================================

export function renderConnections(): void {
  const container = document.getElementById('connections-list');
  if (!container) return;
  container.innerHTML = '';

  if (state.connections.length === 0) {
    container.innerHTML =
      '<p class="fr-text--sm" style="color: var(--text-mention-grey);">Aucune connexion</p>';
    return;
  }

  state.connections.forEach((conn) => {
    const card = document.createElement('div');
    card.className = `connection-card ${state.selectedConnectionId === conn.id ? 'selected' : ''}`;

    const typeBadge =
      conn.type === 'api'
        ? '<span class="badge-source-type badge-api">API</span>'
        : '<span class="badge-source-type badge-grist">Grist</span>';

    const isPublic = (conn as Record<string, unknown>).isPublic;
    const publicBadge = isPublic
      ? '<span class="badge-source-type" style="background: #f59e0b; color: white; margin-left: 0.25rem;">Public</span>'
      : '';

    const connUrl = (conn as Record<string, unknown>).url || (conn as Record<string, unknown>).apiUrl || '';

    card.innerHTML = `
      <div class="name" style="display: flex; align-items: center; gap: 0.5rem;">
        ${typeBadge}${publicBadge}
        <span style="flex: 1;">${escapeHtml(conn.name)}</span>
        <button class="edit-conn-btn" title="Modifier cette connexion" style="background: none; border: none; cursor: pointer; color: var(--text-mention-grey); padding: 0.25rem; font-size: 0.875rem; line-height: 1; border-radius: 3px;">
          <i class="ri-pencil-line"></i>
        </button>
        <button class="delete-conn-btn" title="Supprimer cette connexion" style="background: none; border: none; cursor: pointer; color: var(--text-mention-grey); padding: 0.25rem; font-size: 0.875rem; line-height: 1; border-radius: 3px;">
          <i class="ri-delete-bin-line"></i>
        </button>
      </div>
      <div class="url">${escapeHtml(String(connUrl))}</div>
      <div class="status ${conn.status || ''}">${conn.statusText || 'Non teste'}</div>
    `;

    // Click on card to select
    card.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.delete-conn-btn') && !target.closest('.edit-conn-btn')) {
        selectConnection(conn.id);
      }
    });

    // Edit button
    card.querySelector('.edit-conn-btn')?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      editConnection(conn.id);
    });

    // Delete button
    card.querySelector('.delete-conn-btn')?.addEventListener('click', async (e: Event) => {
      e.stopPropagation();
      if (await confirmDialog(`Supprimer la connexion "${conn.name}" ?`)) {
        deleteConnection(conn.id);
      }
    });

    // Context menu (right-click to delete)
    card.addEventListener('contextmenu', async (e: Event) => {
      e.preventDefault();
      if (await confirmDialog(`Supprimer la connexion "${conn.name}" ?`)) {
        deleteConnection(conn.id);
      }
    });

    container.appendChild(card);
  });
}

// ============================================================
// Save
// ============================================================

export async function saveConnection(): Promise<void> {
  const connTypeEl = document.querySelector('input[name="conn-type"]:checked') as HTMLInputElement | null;
  const connType = connTypeEl?.value ?? 'grist';
  const nameEl = document.getElementById('conn-name') as HTMLInputElement | null;
  const name = nameEl?.value.trim() ?? '';

  if (!name) {
    toastWarning('Veuillez entrer un nom pour la connexion');
    return;
  }

  const btn = document.getElementById('save-connection-btn') as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Test en cours...';
  }

  try {
    if (connType === 'grist') {
      await saveGristConnection(name);
    } else {
      await saveApiConnection(name);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Tester et sauvegarder';
    }
  }
}

export async function saveGristConnection(name: string): Promise<void> {
  const urlEl = document.getElementById('conn-url') as HTMLInputElement | null;
  const apiKeyEl = document.getElementById('conn-api-key') as HTMLInputElement | null;
  const publicEl = document.getElementById('conn-public') as HTMLInputElement | null;

  const url = (urlEl?.value.trim() ?? '').replace(/\/$/, '');
  const apiKey = apiKeyEl?.value.trim() ?? '';
  const isPublic = publicEl?.checked ?? false;

  if (!url) {
    toastWarning("Veuillez remplir l'URL du serveur Grist");
    return;
  }

  if (!isPublic && !apiKey) {
    toastWarning('Cle API requise (sauf pour les documents publics)');
    return;
  }

  // Build the test URL using the proxy
  const useLocalProxy = isViteDevMode();
  let testUrl: string;
  if (url.includes('docs.getgrist.com')) {
    testUrl = useLocalProxy
      ? '/grist-proxy/api/orgs'
      : `${EXTERNAL_PROXY}/grist-proxy/api/orgs`;
  } else if (url.includes('grist.numerique.gouv.fr')) {
    testUrl = useLocalProxy
      ? '/grist-gouv-proxy/api/orgs'
      : `${EXTERNAL_PROXY}/grist-gouv-proxy/api/orgs`;
  } else {
    testUrl = `${url}/api/orgs`;
  }

  const response = await fetch(testUrl, { headers: buildGristHeaders(isPublic ? null : apiKey) });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const orgs: unknown[] = await response.json();

  const editingConn = state.editingConnectionId
    ? state.connections.find(c => c.id === state.editingConnectionId)
    : null;

  const connection: StoredConnection = {
    id: editingConn ? editingConn.id : crypto.randomUUID(),
    type: 'grist',
    name,
    url,
    apiKey: isPublic ? null : apiKey,
    isPublic,
    status: 'connected',
    statusText: isPublic
      ? 'Mode public'
      : `Connecte (${orgs.length} org${orgs.length > 1 ? 's' : ''})`,
  };

  if (editingConn) {
    const idx = state.connections.indexOf(editingConn);
    if (idx >= 0) state.connections[idx] = connection;
  } else {
    state.connections.push(connection);
  }

  saveToStorage(STORAGE_KEYS.CONNECTIONS, state.connections);
  renderConnections();
  closeModal('connection-modal');
  resetConnectionForm();
  selectConnection(connection.id);
}

export async function saveApiConnection(name: string): Promise<void> {
  const apiUrlEl = document.getElementById('api-url') as HTMLInputElement | null;
  const methodEl = document.getElementById('api-method') as HTMLSelectElement | null;
  const headersEl = document.getElementById('api-headers') as HTMLTextAreaElement | null;
  const dataPathEl = document.getElementById('api-data-path') as HTMLInputElement | null;

  const apiUrl = apiUrlEl?.value.trim() ?? '';
  const method = methodEl?.value ?? 'GET';
  const headersText = headersEl?.value.trim() ?? '';
  const dataPath = dataPathEl?.value.trim() ?? '';

  if (!apiUrl) {
    toastWarning("Veuillez remplir l'URL de l'API");
    return;
  }

  // Parse headers
  let headers: Record<string, string> = {};
  if (headersText) {
    try {
      headers = JSON.parse(headersText);
    } catch {
      toastWarning('Les en-tetes doivent etre au format JSON valide');
      return;
    }
  }

  const response = await fetch(getProxiedUrl(apiUrl), { method, headers });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  let data: unknown = await response.json();

  // Navigate to data path if specified
  if (dataPath) {
    const parts = dataPath.split('.');
    for (const part of parts) {
      if (data && typeof data === 'object') {
        data = (data as Record<string, unknown>)[part];
      }
    }
  }

  const isArray = Array.isArray(data);
  const count = isArray ? (data as unknown[]).length : data ? 1 : 0;

  const editingConn = state.editingConnectionId
    ? state.connections.find(c => c.id === state.editingConnectionId)
    : null;

  const connection: StoredConnection = {
    id: editingConn ? editingConn.id : crypto.randomUUID(),
    type: 'api',
    name,
    apiUrl,
    method,
    headers: headersText || null,
    dataPath: dataPath || null,
    status: 'connected',
    statusText: `Connecte (${count} ${isArray ? 'elements' : 'objet'})`,
  };

  if (editingConn) {
    const idx = state.connections.indexOf(editingConn);
    if (idx >= 0) state.connections[idx] = connection;
  } else {
    state.connections.push(connection);
  }

  saveToStorage(STORAGE_KEYS.CONNECTIONS, state.connections);
  renderConnections();
  closeModal('connection-modal');
  resetConnectionForm();
  selectConnection(connection.id);
}

// ============================================================
// Edit / Delete / Select
// ============================================================

export function editConnection(id: string): void {
  const conn = state.connections.find(c => c.id === id);
  if (!conn) return;

  state.editingConnectionId = id;

  // Update modal title
  const titleEl = document.querySelector('#connection-modal .modal-header h3');
  if (titleEl) {
    titleEl.innerHTML = '<i class="ri-pencil-line"></i> Modifier la connexion';
  }
  const saveBtnEl = document.getElementById('save-connection-btn');
  if (saveBtnEl) {
    saveBtnEl.textContent = 'Enregistrer les modifications';
  }

  // Common fields
  const nameEl = document.getElementById('conn-name') as HTMLInputElement | null;
  if (nameEl) nameEl.value = conn.name || '';

  if (conn.type === 'api') {
    const apiRadio = document.getElementById('conn-type-api') as HTMLInputElement | null;
    if (apiRadio) apiRadio.checked = true;

    const gristFields = document.getElementById('grist-fields');
    const apiFields = document.getElementById('api-fields');
    if (gristFields) gristFields.style.display = 'none';
    if (apiFields) apiFields.style.display = 'block';

    const apiUrlEl = document.getElementById('api-url') as HTMLInputElement | null;
    const apiMethodEl = document.getElementById('api-method') as HTMLSelectElement | null;
    const apiHeadersEl = document.getElementById('api-headers') as HTMLTextAreaElement | null;
    const apiDataPathEl = document.getElementById('api-data-path') as HTMLInputElement | null;

    if (apiUrlEl) apiUrlEl.value = (conn as Record<string, unknown>).apiUrl as string || '';
    if (apiMethodEl) apiMethodEl.value = (conn as Record<string, unknown>).method as string || 'GET';
    if (apiHeadersEl) apiHeadersEl.value = (conn as Record<string, unknown>).headers as string || '';
    if (apiDataPathEl) apiDataPathEl.value = (conn as Record<string, unknown>).dataPath as string || '';
  } else {
    const gristRadio = document.getElementById('conn-type-grist') as HTMLInputElement | null;
    if (gristRadio) gristRadio.checked = true;

    const gristFields = document.getElementById('grist-fields');
    const apiFields = document.getElementById('api-fields');
    if (gristFields) gristFields.style.display = 'block';
    if (apiFields) apiFields.style.display = 'none';

    const urlEl = document.getElementById('conn-url') as HTMLInputElement | null;
    const publicEl = document.getElementById('conn-public') as HTMLInputElement | null;
    const apiKeyEl = document.getElementById('conn-api-key') as HTMLInputElement | null;

    if (urlEl) urlEl.value = (conn as Record<string, unknown>).url as string || 'https://grist.numerique.gouv.fr';
    if (publicEl) publicEl.checked = !!(conn as Record<string, unknown>).isPublic;
    if (apiKeyEl) apiKeyEl.value = (conn as Record<string, unknown>).apiKey as string || '';

    // Show/hide API key field based on public mode
    const apiKeyGroup = document.getElementById('api-key-group');
    const apiKeyInfo = document.getElementById('api-key-info');
    if ((conn as Record<string, unknown>).isPublic) {
      if (apiKeyGroup) apiKeyGroup.style.display = 'none';
      if (apiKeyInfo) apiKeyInfo.style.display = 'none';
    } else {
      if (apiKeyGroup) apiKeyGroup.style.display = 'block';
      if (apiKeyInfo) apiKeyInfo.style.display = 'block';
    }
  }

  openModal('connection-modal');
}

export function deleteConnection(id: string): void {
  state.connections = state.connections.filter(c => c.id !== id);
  saveToStorage(STORAGE_KEYS.CONNECTIONS, state.connections);
  getApiAdapter()?.deleteItemFromServer(STORAGE_KEYS.CONNECTIONS, id);
  if (state.selectedConnectionId === id) {
    state.selectedConnectionId = null;
    showExplorerEmpty();
  }
  renderConnections();
}

export async function selectConnection(id: string): Promise<void> {
  state.selectedConnectionId = id;
  state.selectedDocument = null;
  state.selectedTable = null;
  state.previewedSource = null;
  renderConnections();

  const conn = state.connections.find(c => c.id === id);
  if (!conn) return;
  const titleEl = document.getElementById('explorer-title');
  const emptyEl = document.getElementById('explorer-empty');
  const contentEl = document.getElementById('explorer-content');

  if (titleEl) titleEl.textContent = conn.name;
  if (emptyEl) emptyEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'block';

  // Hide export button (only for local sources)
  const exportBtn = document.getElementById('export-grist-btn');
  if (exportBtn) exportBtn.style.display = 'none';

  // Show explorer tabs
  const tabsEl = document.getElementById('explorer-tabs');
  if (tabsEl) tabsEl.style.display = '';

  const docTab = document.querySelector('[data-tab="documents"]') as HTMLElement | null;
  const tablesTab = document.querySelector('[data-tab="tables"]') as HTMLElement | null;
  const createTableBtn = document.getElementById('create-table-btn');

  if (conn.type === 'api') {
    if (docTab) docTab.style.display = 'none';
    if (tablesTab) tablesTab.style.display = 'none';
    if (createTableBtn) createTableBtn.style.display = 'none';
    switchExplorerTab('preview');
    await loadApiData();
  } else {
    if (docTab) docTab.style.display = '';
    if (tablesTab) tablesTab.style.display = '';
    if (createTableBtn) createTableBtn.style.display = '';
    switchExplorerTab('documents');
    await loadDocuments();
  }
}

export function resetConnectionForm(): void {
  state.editingConnectionId = null;

  const nameEl = document.getElementById('conn-name') as HTMLInputElement | null;
  if (nameEl) nameEl.value = '';

  const urlEl = document.getElementById('conn-url') as HTMLInputElement | null;
  if (urlEl) urlEl.value = 'https://grist.numerique.gouv.fr';

  const apiKeyEl = document.getElementById('conn-api-key') as HTMLInputElement | null;
  if (apiKeyEl) apiKeyEl.value = '';

  const publicEl = document.getElementById('conn-public') as HTMLInputElement | null;
  if (publicEl) publicEl.checked = false;

  const apiKeyGroup = document.getElementById('api-key-group');
  if (apiKeyGroup) apiKeyGroup.style.display = 'block';

  const apiKeyInfo = document.getElementById('api-key-info');
  if (apiKeyInfo) apiKeyInfo.style.display = 'block';

  const apiUrlEl = document.getElementById('api-url') as HTMLInputElement | null;
  if (apiUrlEl) apiUrlEl.value = '';

  const methodEl = document.getElementById('api-method') as HTMLSelectElement | null;
  if (methodEl) methodEl.value = 'GET';

  const headersEl = document.getElementById('api-headers') as HTMLTextAreaElement | null;
  if (headersEl) headersEl.value = '';

  const dataPathEl = document.getElementById('api-data-path') as HTMLInputElement | null;
  if (dataPathEl) dataPathEl.value = '';

  const gristRadio = document.getElementById('conn-type-grist') as HTMLInputElement | null;
  if (gristRadio) gristRadio.checked = true;

  const gristFields = document.getElementById('grist-fields');
  if (gristFields) gristFields.style.display = 'block';

  const apiFields = document.getElementById('api-fields');
  if (apiFields) apiFields.style.display = 'none';

  // Reset modal title
  const titleEl = document.querySelector('#connection-modal .modal-header h3');
  if (titleEl) {
    titleEl.innerHTML = '<i class="ri-link"></i> Nouvelle connexion';
  }
  const saveBtnEl = document.getElementById('save-connection-btn');
  if (saveBtnEl) saveBtnEl.textContent = 'Tester et sauvegarder';
}

// ============================================================
// UI Helpers (used by selectConnection and main)
// ============================================================

export function switchExplorerTab(tabId: string): void {
  if (!tabId) return;

  // Only affect explorer tabs, not modal tabs
  document.querySelectorAll('.explorer-tabs:not(#source-mode-tabs) .explorer-tab').forEach((t) => {
    t.classList.remove('active');
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    (p as HTMLElement).style.display = 'none';
  });

  const tabBtn = document.querySelector(
    `.explorer-tabs:not(#source-mode-tabs) [data-tab="${tabId}"]`,
  );
  const tabPanel = document.getElementById(`tab-${tabId}`);

  if (tabBtn) tabBtn.classList.add('active');
  if (tabPanel) tabPanel.style.display = 'block';
}

export function showExplorerEmpty(): void {
  const emptyEl = document.getElementById('explorer-empty');
  const contentEl = document.getElementById('explorer-content');
  if (emptyEl) emptyEl.style.display = 'block';
  if (contentEl) contentEl.style.display = 'none';
}

export function refreshCurrentView(): void {
  if (state.selectedConnectionId !== null) {
    loadDocuments();
  }
}

// ============================================================
// Source mode switching (manual source modal)
// ============================================================

export function switchSourceMode(mode: string): void {
  import('../state.js').then(({ setCurrentSourceMode }) => {
    setCurrentSourceMode(mode);
  });

  document.querySelectorAll('[data-source-mode]').forEach((tab) => {
    tab.classList.toggle('active', (tab as HTMLElement).dataset.sourceMode === mode);
  });
  document.querySelectorAll('.source-mode-panel').forEach((panel) => {
    (panel as HTMLElement).style.display = 'none';
  });
  const activePanel = document.getElementById(`source-mode-${mode}`);
  if (activePanel) activePanel.style.display = 'block';
}

// ============================================================
// Render sources list (sidebar)
// ============================================================

export function renderSources(): void {
  const container = document.getElementById('sources-list');
  if (!container) return;
  container.innerHTML = '';

  if (state.sources.length === 0) {
    container.innerHTML =
      '<p class="fr-text--sm" style="color: var(--text-mention-grey);">Aucune source</p>';
    return;
  }

  state.sources.forEach((source) => {
    const card = document.createElement('div');
    card.className = 'source-card';

    const typeBadge =
      source.type === 'api'
        ? '<span class="badge-source-type badge-api">API</span>'
        : source.type === 'grist'
          ? '<span class="badge-source-type badge-grist">Grist</span>'
          : source.type === 'join'
            ? '<span class="badge-source-type badge-join">Jointure</span>'
            : '<span class="badge-source-type badge-manual">Manuel</span>';

    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        ${typeBadge}
        <span style="flex: 1; font-weight: 500;">${escapeHtml(source.name)}</span>
        <span class="count">${source.recordCount || 0} lignes</span>
        <button class="delete-source-btn" title="Supprimer"
          style="background: none; border: none; cursor: pointer; color: var(--text-mention-grey); padding: 0.25rem; font-size: 0.875rem; border-radius: 3px;">
          <i class="ri-delete-bin-line"></i>
        </button>
      </div>`;

    card.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.delete-source-btn')) {
        previewSource(source.id);
      }
    });

    card.querySelector('.delete-source-btn')?.addEventListener('click', async (e: Event) => {
      e.stopPropagation();
      if (await confirmDialog(`Supprimer la source "${source.name}" ?`)) {
        deleteSource(source.id);
      }
    });

    card.addEventListener('contextmenu', async (e: Event) => {
      e.preventDefault();
      if (await confirmDialog(`Supprimer la source "${source.name}" ?`)) {
        deleteSource(source.id);
      }
    });

    container.appendChild(card);
  });
}

// ============================================================
// Source CRUD
// ============================================================

export function deleteSource(id: string): void {
  state.sources = state.sources.filter(s => s.id !== id);
  saveToStorage(STORAGE_KEYS.SOURCES, state.sources);
  getApiAdapter()?.deleteItemFromServer(STORAGE_KEYS.SOURCES, id);
  renderSources();
}

export function previewSource(id: string): void {
  const source = state.sources.find(s => s.id === id);
  if (!source) return;

  state.previewedSource = source;

  // Show in explorer
  const emptyEl = document.getElementById('explorer-empty');
  const contentEl = document.getElementById('explorer-content');
  if (emptyEl) emptyEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'block';

  const titleEl = document.getElementById('explorer-title');
  if (titleEl) titleEl.textContent = source.name;

  // Hide tabs
  const tabsEl = document.getElementById('explorer-tabs');
  if (tabsEl) tabsEl.style.display = 'none';

  // Show preview tab directly
  document.querySelectorAll('.tab-panel').forEach((p) => {
    (p as HTMLElement).style.display = 'none';
  });
  const previewPanel = document.getElementById('tab-preview');
  if (previewPanel) previewPanel.style.display = 'block';

  // Show export button for manual and join sources (local data)
  const exportBtn = document.getElementById('export-grist-btn');
  if (exportBtn) exportBtn.style.display = (source.type === 'manual' || source.type === 'join') ? '' : 'none';

  // Render preview table
  const info = document.getElementById('preview-info');
  const table = document.getElementById('preview-table');
  if (!info || !table) return;

  const data = source.data || [];
  info.textContent = `${data.length} enregistrements`;

  if (data.length === 0) return;

  const columns = Object.keys(data[0]);
  const thead = table.querySelector('thead tr');
  const tbody = table.querySelector('tbody');

  if (thead) {
    thead.innerHTML = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('');
  }

  if (tbody) {
    tbody.innerHTML = data
      .slice(0, 20)
      .map(
        (record) =>
          '<tr>' +
          columns.map((col) => `<td>${escapeHtml(String(record[col] ?? ''))}</td>`).join('') +
          '</tr>',
      )
      .join('');
  }

  // Save as selected source for builder
  localStorage.setItem(STORAGE_KEYS.SELECTED_SOURCE, JSON.stringify(source));
}

export function saveAsFavorite(): void {
  if (!state.previewedSource && state.selectedConnectionId === null) return;

  const selectedSourceStr = localStorage.getItem(STORAGE_KEYS.SELECTED_SOURCE);
  if (!selectedSourceStr) return;

  let source: Record<string, unknown>;
  try {
    source = JSON.parse(selectedSourceStr);
  } catch {
    toastWarning('Erreur de lecture de la source selectionnee.');
    return;
  }

  // Check if already exists
  const exists = state.sources.some((s) => s.id === source.id);
  if (exists) {
    toastWarning('Cette source est deja enregistree.');
    return;
  }

  state.sources.push(source as unknown as typeof state.sources[0]);
  saveToStorage(STORAGE_KEYS.SOURCES, state.sources);
  renderSources();
  toastSuccess('Source enregistree !');
}

// ============================================================
// Export to Grist
// ============================================================

export function openExportGristModal(): void {
  if (!state.previewedSource) {
    toastWarning('Aucune source a exporter.');
    return;
  }

  // Populate connections dropdown
  const select = document.getElementById('export-connection') as HTMLSelectElement | null;
  if (!select) return;

  select.innerHTML = '<option value="">-- Choisir --</option>';
  state.connections.forEach((conn) => {
    if (conn.type === 'grist') {
      select.innerHTML += `<option value="${conn.id}">${escapeHtml(conn.name)}</option>`;
    }
  });

  // Reset other fields
  const docSelect = document.getElementById('export-document') as HTMLSelectElement | null;
  if (docSelect) docSelect.innerHTML = '<option value="">-- Choisir --</option>';

  const tableNameEl = document.getElementById('export-table-name') as HTMLInputElement | null;
  if (tableNameEl) tableNameEl.value = state.previewedSource.name.replace(/[^a-zA-Z0-9_]/g, '_');

  updateExportButton();
  openModal('export-grist-modal');
}

export async function loadExportDocuments(): Promise<void> {
  const selectEl = document.getElementById('export-connection') as HTMLSelectElement | null;
  const connId = selectEl?.value ?? '';
  const conn = state.connections.find(c => c.id === connId);

  const docSelect = document.getElementById('export-document') as HTMLSelectElement | null;
  if (!docSelect || !conn || conn.type !== 'grist') return;

  docSelect.innerHTML = '<option value="">Chargement...</option>';

  try {
    const gristApiKey = (conn as Record<string, unknown>).isPublic ? null : (conn as Record<string, unknown>).apiKey as string | null;

    const proxyUrl = getProxyUrl(
      (conn as Record<string, unknown>).url as string,
      '/orgs',
    );
    const orgsResp = await fetch(proxyUrl, { headers: buildGristHeaders(gristApiKey) });
    const orgs = (await orgsResp.json()) as Array<{ id: number; name: string }>;

    let options = '<option value="">-- Choisir un document --</option>';

    for (const org of orgs) {
      const wsUrl = getProxyUrl(
        (conn as Record<string, unknown>).url as string,
        `/orgs/${org.id}/workspaces`,
      );
      const wsResp = await fetch(wsUrl, { headers: buildGristHeaders(gristApiKey) });
      const workspaces = (await wsResp.json()) as Array<{
        name: string;
        docs?: Array<{ id: string; name: string }>;
      }>;

      for (const ws of workspaces) {
        if (ws.docs) {
          for (const doc of ws.docs) {
            options += `<option value="${doc.id}">[${escapeHtml(org.name)} / ${escapeHtml(ws.name)}] ${escapeHtml(doc.name)}</option>`;
          }
        }
      }
    }

    docSelect.innerHTML = options;
  } catch (err) {
    docSelect.innerHTML =
      '<option value="">Erreur de chargement</option>';
    console.error('Erreur chargement documents export:', err);
  }

  updateExportButton();
}

export function updateExportButton(): void {
  const btn = document.getElementById('export-grist-confirm-btn') as HTMLButtonElement | null;
  const connEl = document.getElementById('export-connection') as HTMLSelectElement | null;
  const docEl = document.getElementById('export-document') as HTMLSelectElement | null;
  const nameEl = document.getElementById('export-table-name') as HTMLInputElement | null;

  if (btn) {
    btn.disabled = !connEl?.value || !docEl?.value || !nameEl?.value.trim();
  }
}

export async function exportToGrist(): Promise<void> {
  const source = state.previewedSource;
  if (!source || !source.data) return;

  const connEl = document.getElementById('export-connection') as HTMLSelectElement | null;
  const docEl = document.getElementById('export-document') as HTMLSelectElement | null;
  const nameEl = document.getElementById('export-table-name') as HTMLInputElement | null;
  const btn = document.getElementById('export-grist-confirm-btn') as HTMLButtonElement | null;

  const connId = connEl?.value ?? '';
  const docId = docEl?.value ?? '';
  const tableName = nameEl?.value.trim() ?? '';
  const conn = state.connections.find(c => c.id === connId);

  if (!conn || !docId || !tableName) return;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line"></i> Creation en cours...';
  }

  try {
    const headers = buildGristHeaders(
      (conn as Record<string, unknown>).isPublic ? null : (conn as Record<string, unknown>).apiKey as string | null,
      { contentType: true },
    );

    // Sanitize column IDs for Grist
    function sanitizeColumnId(name: string): string {
      return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^(\d)/, '_$1')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
    }

    const firstRecord = source.data[0];
    const columnMapping: Record<string, string> = {};
    const columns = Object.keys(firstRecord).map((key) => {
      const sanitizedId = sanitizeColumnId(key);
      columnMapping[key] = sanitizedId;
      const value = firstRecord[key];
      let type = 'Text';
      if (typeof value === 'number') type = 'Numeric';
      else if (typeof value === 'boolean') type = 'Bool';
      return { id: sanitizedId, fields: { type, label: key } };
    });

    // Create table
    const createTableUrl = getProxyUrl(
      (conn as Record<string, unknown>).url as string,
      `/docs/${docId}/tables`,
    );
    const createResponse = await fetch(createTableUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tables: [{ id: tableName, columns }] }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(error.error || `Erreur creation table: HTTP ${createResponse.status}`);
    }

    // Insert records
    if (btn) btn.innerHTML = '<i class="ri-loader-4-line"></i> Insertion des donnees...';

    const records = source.data.map((record) => {
      const sanitizedFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        sanitizedFields[columnMapping[key] || key] = value;
      }
      return { fields: sanitizedFields };
    });

    const insertUrl = getProxyUrl(
      (conn as Record<string, unknown>).url as string,
      `/docs/${docId}/tables/${tableName}/records`,
    );
    const insertResponse = await fetch(insertUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ records }),
    });

    if (!insertResponse.ok) {
      const error = await insertResponse.json();
      throw new Error(error.error || `Erreur insertion: HTTP ${insertResponse.status}`);
    }

    toastSuccess(`Table "${tableName}" creee avec ${source.data.length} enregistrements !`);
    closeModal('export-grist-modal');
  } catch (error) {
    toastError(`Erreur : ${(error as Error).message}`);
    console.error('Erreur export Grist:', error);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-upload-cloud-line"></i> Creer la table';
    }
  }
}

// ============================================================
// Join sources
// ============================================================

export function openJoinModal(): void {
  const sourcesWithData = state.sources.filter(s => s.data && s.data.length > 0);
  if (sourcesWithData.length < 2) {
    toastWarning('Il faut au moins 2 sources avec des donnees pour creer une jointure.');
    return;
  }

  const leftSelect = document.getElementById('join-left-source') as HTMLSelectElement | null;
  const rightSelect = document.getElementById('join-right-source') as HTMLSelectElement | null;

  const options = '<option value="">-- Selectionner --</option>' +
    sourcesWithData.map(s =>
      `<option value="${s.id}">${escapeHtml(s.name)} (${s.recordCount || s.data!.length} lignes)</option>`,
    ).join('');

  if (leftSelect) leftSelect.innerHTML = options;
  if (rightSelect) rightSelect.innerHTML = options;

  // Reset fields
  const nameEl = document.getElementById('join-name') as HTMLInputElement | null;
  const onEl = document.getElementById('join-on') as HTMLInputElement | null;
  const typeEl = document.getElementById('join-type') as HTMLSelectElement | null;
  const prefixEl = document.getElementById('join-prefix-right') as HTMLInputElement | null;
  if (nameEl) nameEl.value = '';
  if (onEl) onEl.value = '';
  if (typeEl) typeEl.value = 'left';
  if (prefixEl) prefixEl.value = 'right_';

  const fieldsInfo = document.getElementById('join-fields-info');
  if (fieldsInfo) fieldsInfo.style.display = 'none';

  const preview = document.getElementById('join-preview');
  if (preview) preview.style.display = 'none';

  openModal('join-source-modal');
}

/** Show fields of selected sources to help the user pick join keys. */
export function updateJoinFieldsInfo(): void {
  const leftId = (document.getElementById('join-left-source') as HTMLSelectElement | null)?.value;
  const rightId = (document.getElementById('join-right-source') as HTMLSelectElement | null)?.value;
  const fieldsInfo = document.getElementById('join-fields-info');

  if (!leftId || !rightId || !fieldsInfo) {
    if (fieldsInfo) fieldsInfo.style.display = 'none';
    return;
  }

  const leftSource = state.sources.find(s => s.id === leftId);
  const rightSource = state.sources.find(s => s.id === rightId);

  if (!leftSource?.data?.length || !rightSource?.data?.length) {
    fieldsInfo.style.display = 'none';
    return;
  }

  const leftFields = Object.keys(leftSource.data[0]);
  const rightFields = Object.keys(rightSource.data[0]);

  const leftEl = document.getElementById('join-left-fields');
  const rightEl = document.getElementById('join-right-fields');
  if (leftEl) leftEl.textContent = leftFields.join(', ');
  if (rightEl) rightEl.textContent = rightFields.join(', ');

  fieldsInfo.style.display = 'block';

  // Auto-suggest join key: first common field name
  const onEl = document.getElementById('join-on') as HTMLInputElement | null;
  if (onEl && !onEl.value) {
    const common = leftFields.find(f => rightFields.includes(f));
    if (common) onEl.value = common;
  }
}

/** Preview the join result live. */
export function previewJoinResult(): void {
  const leftId = (document.getElementById('join-left-source') as HTMLSelectElement | null)?.value;
  const rightId = (document.getElementById('join-right-source') as HTMLSelectElement | null)?.value;
  const on = (document.getElementById('join-on') as HTMLInputElement | null)?.value.trim();
  const joinType = (document.getElementById('join-type') as HTMLSelectElement | null)?.value as JoinType;
  const prefixRight = (document.getElementById('join-prefix-right') as HTMLInputElement | null)?.value || 'right_';

  const preview = document.getElementById('join-preview');
  if (!preview) return;

  if (!leftId || !rightId || !on) {
    preview.style.display = 'none';
    return;
  }

  const leftSource = state.sources.find(s => s.id === leftId);
  const rightSource = state.sources.find(s => s.id === rightId);
  if (!leftSource?.data?.length || !rightSource?.data?.length) {
    preview.style.display = 'none';
    return;
  }

  try {
    const result = performJoin(leftSource.data, rightSource.data, {
      on,
      type: joinType,
      prefixRight,
    });

    const countEl = document.getElementById('join-preview-count');
    if (countEl) countEl.textContent = String(result.length);

    // Render preview table (first 5 rows)
    const table = document.getElementById('join-preview-table');
    if (table && result.length > 0) {
      const columns = Object.keys(result[0]);
      const thead = table.querySelector('thead tr');
      const tbody = table.querySelector('tbody');
      if (thead) thead.innerHTML = columns.map(c => `<th>${escapeHtml(c)}</th>`).join('');
      if (tbody) {
        tbody.innerHTML = result.slice(0, 5).map(row =>
          '<tr>' + columns.map(c => `<td>${escapeHtml(String(row[c] ?? ''))}</td>`).join('') + '</tr>',
        ).join('');
      }
    }

    preview.style.display = 'block';
  } catch {
    preview.style.display = 'none';
  }
}

export function saveJoinSource(): void {
  const name = (document.getElementById('join-name') as HTMLInputElement | null)?.value.trim();
  const leftId = (document.getElementById('join-left-source') as HTMLSelectElement | null)?.value;
  const rightId = (document.getElementById('join-right-source') as HTMLSelectElement | null)?.value;
  const on = (document.getElementById('join-on') as HTMLInputElement | null)?.value.trim();
  const joinType = (document.getElementById('join-type') as HTMLSelectElement | null)?.value as JoinType;
  const prefixRight = (document.getElementById('join-prefix-right') as HTMLInputElement | null)?.value || 'right_';

  if (!name) { toastWarning('Veuillez saisir un nom.'); return; }
  if (!leftId || !rightId) { toastWarning('Veuillez selectionner les deux sources.'); return; }
  if (leftId === rightId) { toastWarning('Les deux sources doivent etre differentes.'); return; }
  if (!on) { toastWarning('Veuillez saisir la cle de jointure.'); return; }

  const leftSource = state.sources.find(s => s.id === leftId);
  const rightSource = state.sources.find(s => s.id === rightId);
  if (!leftSource?.data || !rightSource?.data) {
    toastWarning('Les sources selectionnees n\'ont pas de donnees.');
    return;
  }

  try {
    const result = performJoin(leftSource.data, rightSource.data, {
      on,
      type: joinType,
      prefixRight,
    });

    const source: Source = {
      id: crypto.randomUUID(),
      name,
      type: 'join',
      data: result,
      recordCount: result.length,
      leftSourceId: leftId,
      rightSourceId: rightId,
      joinOn: on,
      joinType,
      joinPrefixRight: prefixRight,
    };

    state.sources.push(source);
    saveToStorage(STORAGE_KEYS.SOURCES, state.sources);
    renderSources();
    closeModal('join-source-modal');
    toastSuccess(`Source jointe "${name}" creee (${result.length} lignes)`);
  } catch (err) {
    toastError(`Erreur de jointure : ${(err as Error).message}`);
  }
}
