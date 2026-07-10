/**
 * Connection CRUD operations: create, read, update, delete, render.
 */

import {
  escapeHtml,
  saveToStorage,
  STORAGE_KEYS,
  openModal,
  closeModal,
  buildProxiedRequest,
  getProxyUrl,
  buildGristHeaders,
  isViteDevMode,
  toastWarning,
  toastSuccess,
  toastError,
  confirmDialog,
  getApiAdapter,
  performJoin,
  isUnsafeKey,
  httpErrorMessage,
  resolveSourceUrl,
  normalizeProviderAuthHeaders,
  parseDataGouvDataset,
  dataGouvDatasetApiUrl,
  looksLikeNumber,
} from '@dsfr-data/shared';
import type { JoinType, Source } from '@dsfr-data/shared';

import { state, EXTERNAL_PROXY } from '../state.js';
import type { StoredConnection } from '../state.js';
import { loadDocuments } from './grist-explorer.js';
import { loadApiData } from './api-explorer.js';
import { loadDataGouvResources } from './datagouv-explorer.js';
import { loadTableData } from '../editors/table-editor.js';

// ============================================================
// Parsing URL doc Grist public
// ============================================================

/**
 * Extrait le serveur (`baseUrl`) et le `docId` d'une référence de document Grist.
 *
 * Accepte :
 *  - URL UI : `https://grist.numerique.gouv.fr/o/mon-org/jGd2ge4dy2ZM/MaPage`
 *  - URL UI sans org : `https://docs.getgrist.com/jGd2ge4dy2ZM/MonDoc`
 *  - URL API : `https://grist.numerique.gouv.fr/api/docs/jGd2ge4dy2ZM/tables/...`
 *  - docId brut : `jGd2ge4dy2ZM` (serveur par défaut grist.numerique.gouv.fr)
 *
 * Retourne `null` si l'entrée est vide ou non parsable.
 */
export function parseGristDocRef(input: string): { baseUrl: string; docId: string } | null {
  const raw = input.trim();
  if (!raw) return null;

  // docId brut (ni schéma ni chemin) → serveur gouv par défaut.
  if (!raw.includes('/') && !raw.includes(' ') && !raw.includes('.')) {
    return { baseUrl: 'https://grist.numerique.gouv.fr', docId: raw };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const baseUrl = `${url.protocol}//${url.host}`;
  const segments = url.pathname.split('/').filter(Boolean);

  const docsIdx = segments.indexOf('docs');
  // Forme API : /api/docs/{docId}/... — sinon forme UI : /o/{org}/{docId}/{page} ou /{docId}/{page}
  const docId =
    docsIdx > 0 && segments[docsIdx - 1] === 'api' && segments[docsIdx + 1]
      ? segments[docsIdx + 1]
      : (segments[segments[0] === 'o' && segments.length >= 2 ? 2 : 0] ?? null);

  if (!docId) return null;
  return { baseUrl, docId };
}

// ============================================================
// Render
// ============================================================

export function renderConnections(): void {
  const container = document.getElementById('connections-list');
  if (!container) return;
  container.innerHTML = '';

  if (state.connections.length === 0) {
    container.innerHTML =
      '<p class="fr-text--sm" style="color: var(--text-mention-grey); text-align: center; padding: 0.5rem 0;"><i class="ri-link" style="display:block;font-size:1.25rem;opacity:0.4;margin-bottom:0.25rem;"></i>Aucune connexion.<br>Ajoutez une connexion Grist ou API.</p>';
    return;
  }

  state.connections.forEach((conn) => {
    const card = document.createElement('div');
    card.className = `connection-card ${state.selectedConnectionId === conn.id ? 'selected' : ''}`;

    const typeBadge =
      conn.type === 'api'
        ? '<span class="badge-source-type badge-api">API</span>'
        : conn.type === 'datagouv'
          ? '<span class="badge-source-type badge-api">data.gouv</span>'
          : '<span class="badge-source-type badge-grist">Grist</span>';

    const isPublic = (conn as Record<string, unknown>).isPublic;
    const publicBadge = isPublic
      ? '<span class="badge-source-type" style="background: #f59e0b; color: white; margin-left: 0.25rem;">Public</span>'
      : '';

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
  const nameEl = document.getElementById('conn-name') as HTMLInputElement | null;
  const name = nameEl?.value.trim() ?? '';

  if (!name) {
    toastWarning('Veuillez entrer un nom pour la connexion');
    return;
  }

  // Édition d'une connexion data.gouv : seul le nom est modifiable.
  const editing = state.editingConnectionId
    ? state.connections.find((c) => c.id === state.editingConnectionId)
    : null;
  if (editing && editing.type === 'datagouv') {
    editing.name = name;
    saveToStorage(STORAGE_KEYS.CONNECTIONS, state.connections);
    renderConnections();
    closeModal('connection-modal');
    resetConnectionForm();
    toastSuccess(`Connexion « ${name} » renommée.`);
    return;
  }

  // Type déterminé par le contexte (plus de bouton radio) : API REST par défaut,
  // Grist seulement pour un doc Grist (clé) ou l'édition d'une connexion Grist.
  const connType = currentManualType;

  const btn = document.getElementById('save-connection-btn') as HTMLButtonElement | null;
  const originalLabel = btn?.textContent ?? 'Tester et sauvegarder';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Test en cours…';
  }

  try {
    const ok =
      connType === 'grist' ? await saveGristConnection(name) : await saveApiConnection(name);
    // ok === false means a validation toastWarning was already shown; skip success toast.
    if (ok) {
      toastSuccess(`Connexion « ${name} » ajoutée.`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    toastError(`Connexion impossible : ${message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }
}

export async function saveGristConnection(name: string): Promise<boolean> {
  const urlEl = document.getElementById('conn-url') as HTMLInputElement | null;
  const apiKeyEl = document.getElementById('conn-api-key') as HTMLInputElement | null;
  const publicEl = document.getElementById('conn-public') as HTMLInputElement | null;
  const publicDocEl = document.getElementById('conn-public-doc-url') as HTMLInputElement | null;

  let url = (urlEl?.value.trim() ?? '').replace(/\/$/, '');
  const apiKey = apiKeyEl?.value.trim() ?? '';
  const isPublic = publicEl?.checked ?? false;

  // Mode "doc public par URL" : on dérive serveur + docId de l'URL collée.
  // Le docId permet de cibler directement le doc, sans énumérer les orgs
  // (qui renvoie vide en anonyme pour un doc partagé hors de notre équipe).
  let publicDocId: string | null = null;
  const publicDocInput = publicDocEl?.value.trim() ?? '';
  if (isPublic && publicDocInput) {
    const ref = parseGristDocRef(publicDocInput);
    if (!ref) {
      toastWarning("URL du document public invalide. Collez l'URL complète d'un doc Grist.");
      return false;
    }
    url = ref.baseUrl;
    publicDocId = ref.docId;
  }

  if (!url) {
    toastWarning("Veuillez remplir l'URL du serveur Grist");
    return false;
  }

  if (!isPublic && !apiKey) {
    toastWarning('Clé API requise (sauf pour les documents publics)');
    return false;
  }

  // Build the test URL using the proxy
  let testUrl: string;
  if (publicDocId) {
    // Doc public ciblé : valide l'accès via /docs/{id}/tables (lisible en anonyme).
    testUrl = getProxyUrl(url, `/docs/${publicDocId}/tables`);
  } else {
    const useLocalProxy = isViteDevMode();
    let hostname: string | null = null;
    try {
      hostname = new URL(url).hostname;
    } catch {
      // malformed URL — leave hostname null, falls through to the else branch
    }
    if (hostname === 'docs.getgrist.com') {
      testUrl = useLocalProxy ? '/grist-proxy/api/orgs' : `${EXTERNAL_PROXY}/grist-proxy/api/orgs`;
    } else if (hostname === 'grist.numerique.gouv.fr') {
      testUrl = useLocalProxy
        ? '/grist-gouv-proxy/api/orgs'
        : `${EXTERNAL_PROXY}/grist-gouv-proxy/api/orgs`;
    } else {
      testUrl = `${url}/api/orgs`;
    }
  }

  const response = await fetch(testUrl, { headers: buildGristHeaders(isPublic ? null : apiKey) });

  if (!response.ok) {
    throw new Error(httpErrorMessage(response.status));
  }

  const payload: unknown = await response.json();

  let statusText: string;
  if (publicDocId) {
    const tables = (payload as { tables?: unknown[] })?.tables;
    const count = Array.isArray(tables) ? tables.length : 0;
    statusText = `Doc public (${count} table${count > 1 ? 's' : ''})`;
  } else if (isPublic) {
    statusText = 'Mode public';
  } else {
    const orgs = Array.isArray(payload) ? payload : [];
    statusText = `Connecte (${orgs.length} org${orgs.length > 1 ? 's' : ''})`;
  }

  const editingConn = state.editingConnectionId
    ? state.connections.find((c) => c.id === state.editingConnectionId)
    : null;

  const connection: StoredConnection = {
    id: editingConn ? editingConn.id : crypto.randomUUID(),
    type: 'grist',
    name,
    url,
    apiKey: isPublic ? null : apiKey,
    isPublic,
    publicDocId,
    status: 'connected',
    statusText,
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
  return true;
}

export async function saveApiConnection(name: string): Promise<boolean> {
  const apiUrlEl = document.getElementById('api-url') as HTMLInputElement | null;
  const methodEl = document.getElementById('api-method') as HTMLSelectElement | null;
  const headersEl = document.getElementById('api-headers') as HTMLTextAreaElement | null;
  const dataPathEl = document.getElementById('api-data-path') as HTMLInputElement | null;

  const apiUrl = apiUrlEl?.value.trim() ?? '';
  const method = methodEl?.value ?? 'GET';
  let headersText = headersEl?.value.trim() ?? '';
  const dataPath = dataPathEl?.value.trim() ?? '';

  if (!apiUrl) {
    toastWarning("Veuillez remplir l'URL de l'API");
    return false;
  }

  // Parse headers
  let headers: Record<string, string> = {};
  if (headersText) {
    try {
      headers = JSON.parse(headersText);
    } catch {
      toastWarning('Les en-tetes doivent etre au format JSON valide');
      return false;
    }
  }

  // Adapte la cle au format d'auth du provider (ex. ODS : une cle fournie via un
  // en-tete `Apikey`/`api-key` est ignoree par ODS, qui attend `Authorization:
  // Apikey <cle>`). On persiste la correction pour que le chargement fonctionne.
  const authNorm = normalizeProviderAuthHeaders(apiUrl, headers);
  if (authNorm.changed) {
    headers = authNorm.headers;
    headersText = JSON.stringify(headers);
    populateApiHeadersFromJson(headersText);
    toastWarning(
      'Cle reformatee en en-tete « Authorization: Apikey … » (format attendu par OpenDataSoft).'
    );
  }

  const { url: testUrl, headers: reqHeaders } = buildProxiedRequest(apiUrl, headers);
  const response = await fetch(testUrl, { method, headers: reqHeaders });

  if (!response.ok) {
    throw new Error(httpErrorMessage(response.status));
  }

  let data: unknown = await response.json();

  // Navigate to data path if specified
  if (dataPath) {
    const parts = dataPath.split('.');
    for (const part of parts) {
      if (isUnsafeKey(part)) {
        data = undefined;
        break;
      }
      if (data && typeof data === 'object') {
        // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop
        data = (data as Record<string, unknown>)[part];
      }
    }
  }

  const isArray = Array.isArray(data);
  const count = isArray ? (data as unknown[]).length : data ? 1 : 0;

  const editingConn = state.editingConnectionId
    ? state.connections.find((c) => c.id === state.editingConnectionId)
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
  return true;
}

// ============================================================
// Edit / Delete / Select
// ============================================================

export function editConnection(id: string): void {
  const conn = state.connections.find((c) => c.id === id);
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

  setManualStatus(null);

  // data.gouv : seul le nom est modifiable (slug figé) → pas de paramètres avancés.
  if (conn.type === 'datagouv') {
    setAdvanced('hidden');
    setConnectionModalStep('manual');
    openModal('connection-modal');
    return;
  }

  if (conn.type === 'api') {
    setConnType('api');

    const apiUrlEl = document.getElementById('api-url') as HTMLInputElement | null;
    const apiMethodEl = document.getElementById('api-method') as HTMLSelectElement | null;
    const apiDataPathEl = document.getElementById('api-data-path') as HTMLInputElement | null;

    if (apiUrlEl) apiUrlEl.value = ((conn as Record<string, unknown>).apiUrl as string) || '';
    if (apiMethodEl)
      apiMethodEl.value = ((conn as Record<string, unknown>).method as string) || 'GET';
    // Headers: populate the key/value editor (which keeps `#api-headers` in sync).
    populateApiHeadersFromJson(((conn as Record<string, unknown>).headers as string) || '');
    if (apiDataPathEl)
      apiDataPathEl.value = ((conn as Record<string, unknown>).dataPath as string) || '';
  } else {
    setConnType('grist');

    const urlEl = document.getElementById('conn-url') as HTMLInputElement | null;
    const publicEl = document.getElementById('conn-public') as HTMLInputElement | null;
    const apiKeyEl = document.getElementById('conn-api-key') as HTMLInputElement | null;

    if (urlEl)
      urlEl.value =
        ((conn as Record<string, unknown>).url as string) || 'https://grist.numerique.gouv.fr';
    if (publicEl) publicEl.checked = !!(conn as Record<string, unknown>).isPublic;
    if (apiKeyEl) apiKeyEl.value = ((conn as Record<string, unknown>).apiKey as string) || '';

    // Pré-remplir l'URL du doc public (forme API round-trippable par parseGristDocRef).
    const publicDocEl = document.getElementById('conn-public-doc-url') as HTMLInputElement | null;
    const storedDocId = (conn as Record<string, unknown>).publicDocId as string | null | undefined;
    if (publicDocEl) {
      const base = ((conn as Record<string, unknown>).url as string) || '';
      publicDocEl.value = storedDocId ? `${base}/api/docs/${storedDocId}` : '';
    }

    // Show/hide API key field + public-doc field based on public mode
    const isPublic = !!(conn as Record<string, unknown>).isPublic;
    const apiKeyGroup = document.getElementById('api-key-group');
    const apiKeyInfo = document.getElementById('api-key-info');
    const publicDocGroup = document.getElementById('public-doc-group');
    if (apiKeyGroup) apiKeyGroup.style.display = isPublic ? 'none' : 'block';
    if (apiKeyInfo) apiKeyInfo.style.display = isPublic ? 'none' : 'block';
    if (publicDocGroup) publicDocGroup.style.display = isPublic ? 'block' : 'none';
  }

  // Édition d'une connexion existante : on saute la détection, et on montre la
  // configuration (paramètres avancés ouverts).
  setAdvanced('open');
  setConnectionModalStep('manual');
  openModal('connection-modal');
}

export function deleteConnection(id: string): void {
  state.connections = state.connections.filter((c) => c.id !== id);
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

  const conn = state.connections.find((c) => c.id === id);
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

  // Show "Rafraîchir" — connections always have remote data.
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) refreshBtn.style.display = '';

  // Show explorer tabs
  const tabsEl = document.getElementById('explorer-tabs');
  if (tabsEl) tabsEl.style.display = '';

  const docTab = document.querySelector('[data-tab="documents"]') as HTMLElement | null;
  const tablesTab = document.querySelector('[data-tab="tables"]') as HTMLElement | null;
  const createTableBtn = document.getElementById('create-table-btn');

  // Pas de jeu candidat tant qu'on n'a pas prévisualisé (boutons en ligne/local masqués).
  setDatasetCandidate(null);
  renderPreviewMeta(null);

  if (conn.type === 'api') {
    if (docTab) docTab.style.display = 'none';
    if (tablesTab) tablesTab.style.display = 'none';
    if (createTableBtn) createTableBtn.style.display = 'none';
    switchExplorerTab('preview');
    await loadApiData();
  } else if (conn.type === 'datagouv') {
    // data.gouv : la connexion = un jeu de données (N ressources). On réutilise
    // l'onglet « Tables » comme liste de ressources.
    if (docTab) docTab.style.display = 'none';
    if (tablesTab) {
      tablesTab.style.display = '';
      tablesTab.textContent = 'Ressources';
    }
    if (createTableBtn) createTableBtn.style.display = 'none';
    switchExplorerTab('tables');
    await loadDataGouvResources();
  } else {
    if (docTab) docTab.style.display = '';
    if (tablesTab) {
      tablesTab.style.display = '';
      tablesTab.textContent = 'Tables';
    }
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

  const publicDocEl = document.getElementById('conn-public-doc-url') as HTMLInputElement | null;
  if (publicDocEl) publicDocEl.value = '';

  const publicDocGroup = document.getElementById('public-doc-group');
  if (publicDocGroup) publicDocGroup.style.display = 'none';

  const apiKeyGroup = document.getElementById('api-key-group');
  if (apiKeyGroup) apiKeyGroup.style.display = 'block';

  const apiKeyInfo = document.getElementById('api-key-info');
  if (apiKeyInfo) apiKeyInfo.style.display = 'block';

  const apiUrlEl = document.getElementById('api-url') as HTMLInputElement | null;
  if (apiUrlEl) apiUrlEl.value = '';

  const apiUrlDetectionEl = document.getElementById('api-url-detection');
  if (apiUrlDetectionEl) {
    apiUrlDetectionEl.style.display = 'none';
    apiUrlDetectionEl.textContent = '';
  }

  const methodEl = document.getElementById('api-method') as HTMLSelectElement | null;
  if (methodEl) methodEl.value = 'GET';

  // Headers: clear the key/value editor (also clears the hidden textarea).
  clearApiHeadersEditor();

  const dataPathEl = document.getElementById('api-data-path') as HTMLInputElement | null;
  if (dataPathEl) dataPathEl.value = '';

  // Type par défaut = API REST (seul cas réellement manuel) ; advanced replié.
  setConnType('api');
  setAdvanced('closed');

  // Reset modal title
  const titleEl = document.querySelector('#connection-modal .modal-header h3');
  if (titleEl) {
    titleEl.innerHTML = '<i class="ri-link"></i> Nouvelle connexion';
  }
  const saveBtnEl = document.getElementById('save-connection-btn');
  if (saveBtnEl) saveBtnEl.textContent = 'Tester et sauvegarder';

  // Retour à l'étape 1 (détection par URL) pour une nouvelle connexion.
  const detectUrlEl = document.getElementById('detect-url') as HTMLInputElement | null;
  if (detectUrlEl) detectUrlEl.value = '';
  setManualStatus(null);
  setConnectionModalStep('detect');
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
    `.explorer-tabs:not(#source-mode-tabs) [data-tab="${tabId}"]`
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

// ============================================================
// API headers — key/value editor
// ============================================================

/**
 * Append an empty header row (name + value + remove button) to the editor.
 * If `name`/`value` are provided, pre-fill them — used by `editConnection()`
 * to populate the editor with the existing headers of a saved API connection.
 */
export function addApiHeaderRow(name = '', value = ''): void {
  const editor = document.getElementById('api-headers-editor');
  if (!editor) return;

  const row = document.createElement('div');
  row.className = 'api-headers-row';
  row.style.cssText = 'display:flex;gap:0.5rem;align-items:center;margin-bottom:0.5rem;';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'fr-input fr-input--sm api-header-name';
  nameInput.placeholder = 'Nom (ex : Authorization)';
  nameInput.value = name;
  nameInput.style.flex = '1';

  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'fr-input fr-input--sm api-header-value';
  valueInput.placeholder = 'Valeur (ex : Bearer votre_token)';
  valueInput.value = value;
  valueInput.style.flex = '2';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'api-header-remove-btn';
  removeBtn.title = 'Supprimer cet en-tête';
  removeBtn.setAttribute('aria-label', 'Supprimer cet en-tête');
  removeBtn.style.cssText =
    'background:none;border:none;color:var(--text-mention-grey);cursor:pointer;padding:0.25rem;font-size:1rem;';
  removeBtn.innerHTML = '<i class="ri-delete-bin-line" aria-hidden="true"></i>';
  removeBtn.addEventListener('click', () => {
    row.remove();
    syncApiHeadersTextarea();
  });

  nameInput.addEventListener('input', syncApiHeadersTextarea);
  valueInput.addEventListener('input', syncApiHeadersTextarea);

  row.appendChild(nameInput);
  row.appendChild(valueInput);
  row.appendChild(removeBtn);
  editor.appendChild(row);

  syncApiHeadersTextarea();
}

/**
 * Serialize all editor rows into the hidden `#api-headers` textarea
 * (which `saveApiConnection` already consumes as JSON).
 */
function syncApiHeadersTextarea(): void {
  const editor = document.getElementById('api-headers-editor');
  const textarea = document.getElementById('api-headers') as HTMLTextAreaElement | null;
  if (!editor || !textarea) return;

  const headers: Record<string, string> = {};
  editor.querySelectorAll('.api-headers-row').forEach((row) => {
    const name = (row.querySelector('.api-header-name') as HTMLInputElement | null)?.value.trim();
    const value = (row.querySelector('.api-header-value') as HTMLInputElement | null)?.value.trim();
    if (name) headers[name] = value ?? '';
  });

  textarea.value = Object.keys(headers).length > 0 ? JSON.stringify(headers) : '';
}

/** Remove all rows from the API headers editor and clear the hidden textarea. */
export function clearApiHeadersEditor(): void {
  const editor = document.getElementById('api-headers-editor');
  if (editor) editor.innerHTML = '';
  const textarea = document.getElementById('api-headers') as HTMLTextAreaElement | null;
  if (textarea) textarea.value = '';
}

/**
 * Parse a JSON object of headers into editor rows. Silently ignores invalid
 * JSON (the legacy textarea allowed any string; we don't want to crash on
 * malformed saved data).
 */
export function populateApiHeadersFromJson(jsonStr: string | null | undefined): void {
  clearApiHeadersEditor();
  if (!jsonStr) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    addApiHeaderRow(String(key), value == null ? '' : String(value));
  }
}

// ============================================================
// API URL auto-détection (plateformes connues)
// ============================================================

/**
 * Inspecte l'URL saisie dans le champ « URL des données » et, si elle
 * correspond à une plateforme connue (OpenDataSoft, data.gouv.fr…), déduit
 * l'URL d'API canonique sans aucun appel réseau (voir `resolveSourceUrl`).
 *
 * - URL de page (ex. .../explore/dataset/{slug}/) → réécrite en URL d'API.
 * - URL d'API déjà correcte → simple confirmation de la plateforme.
 * - Plateforme inconnue → aucun message (comportement « API générique »).
 *
 * Câblé sur l'évènement `change` du champ (déclenché au blur / après collage),
 * pour ne pas réécrire l'URL pendant la frappe.
 */
export function autodetectApiUrl(): void {
  const apiUrlEl = document.getElementById('api-url') as HTMLInputElement | null;
  const detectionEl = document.getElementById('api-url-detection');
  if (!apiUrlEl || !detectionEl) return;

  const raw = apiUrlEl.value.trim();
  if (!raw) {
    detectionEl.style.display = 'none';
    detectionEl.textContent = '';
    return;
  }

  const resolved = resolveSourceUrl(raw);

  // Plateforme non reconnue → on laisse l'utilisateur en mode API générique.
  if (resolved.provider.id === 'generic' || !resolved.apiUrl) {
    detectionEl.style.display = 'none';
    detectionEl.textContent = '';
    return;
  }

  // URL de page → on renseigne l'URL d'API déduite à la place.
  if (resolved.normalized) {
    apiUrlEl.value = resolved.apiUrl;
    detectionEl.textContent = `Plateforme détectée : ${resolved.provider.displayName}. URL d'API renseignée automatiquement.`;
  } else {
    detectionEl.textContent = `Plateforme détectée : ${resolved.provider.displayName}.`;
  }
  detectionEl.style.display = 'block';

  // Suggestion de nom si le champ est encore vide : on part de l'identifiant
  // de ressource (datasetId / resourceId).
  const nameEl = document.getElementById('conn-name') as HTMLInputElement | null;
  const firstId = resolved.ids ? Object.values(resolved.ids)[0] : null;
  if (nameEl && !nameEl.value.trim() && firstId) {
    nameEl.value = firstId;
  }

  // Emplacement des données : les API connues enveloppent leur tableau
  // d'enregistrements sous une clé fixe (ODS → `results`, Tabular → `data`).
  // On pré-remplit le champ s'il est encore vide pour éviter à l'utilisateur
  // de deviner ce chemin.
  const dataPathEl = document.getElementById('api-data-path') as HTMLInputElement | null;
  const dataPath = resolved.provider.response.dataPath;
  if (dataPathEl && !dataPathEl.value.trim() && dataPath) {
    dataPathEl.value = dataPath;
  }
}

// ============================================================
// Modale connexion : étape « détection par URL » → « configuration »
// ============================================================

/** Bascule l'affichage entre l'étape de détection et l'étape de configuration. */
export function setConnectionModalStep(step: 'detect' | 'manual'): void {
  const detectStep = document.getElementById('detect-step');
  const manualConfig = document.getElementById('manual-config');
  const continueBtn = document.getElementById('detect-continue-btn');
  const saveBtn = document.getElementById('save-connection-btn');
  const isManual = step === 'manual';
  if (detectStep) detectStep.style.display = isManual ? 'none' : 'block';
  if (manualConfig) manualConfig.style.display = isManual ? 'block' : 'none';
  if (saveBtn) saveBtn.style.display = isManual ? '' : 'none';
  if (continueBtn) continueBtn.style.display = isManual ? 'none' : '';
}

/**
 * Type de configuration manuelle courant. Remplace l'ancien bouton radio : le
 * type est déterminé par le contexte (détection ou connexion éditée), pas choisi
 * à la main. `api` = API REST standard (seul cas réellement manuel) ; `grist` =
 * doc Grist (clé API à saisir / édition d'une connexion Grist existante).
 */
let currentManualType: 'grist' | 'api' = 'api';

/** Définit le type de config et affiche les champs correspondants. */
function setConnType(type: 'grist' | 'api'): void {
  currentManualType = type;
  const gristFields = document.getElementById('grist-fields');
  const apiFields = document.getElementById('api-fields');
  if (gristFields) gristFields.style.display = type === 'grist' ? 'block' : 'none';
  if (apiFields) apiFields.style.display = type === 'api' ? 'block' : 'none';
}

/** Ouvre / replie / masque la section « Paramètres avancés ». */
function setAdvanced(mode: 'open' | 'closed' | 'hidden'): void {
  const details = document.getElementById('advanced-settings') as HTMLDetailsElement | null;
  if (!details) return;
  details.style.display = mode === 'hidden' ? 'none' : '';
  details.open = mode === 'open';
}

/** Affiche (ou masque si `kind` est null) la bannière de statut de l'étape config. */
function setManualStatus(kind: 'success' | 'info' | null, text = ''): void {
  const el = document.getElementById('manual-status');
  const txt = document.getElementById('manual-status-text');
  if (!el || !txt) return;
  if (!kind) {
    el.style.display = 'none';
    txt.textContent = '';
    return;
  }
  el.classList.remove('fr-alert--success', 'fr-alert--info');
  el.classList.add(kind === 'success' ? 'fr-alert--success' : 'fr-alert--info');
  txt.textContent = text;
  el.style.display = 'block';
}

/**
 * Étape 1 → 2 : analyse l'URL saisie et bascule vers les champs de
 * configuration, pré-remplis quand la plateforme est reconnue.
 *
 *  - Plateforme de données connue (OpenDataSoft, data.gouv.fr) → champs API
 *    pré-remplis (URL d'API déduite, emplacement des données, nom) + message
 *    « tout est prêt, enregistrez pour voir les données ».
 *  - Base Grist → formulaire Grist pré-rempli (clé API / doc public à compléter).
 *  - Page dataset data.gouv.fr (multi-fichiers) → sélection de la ressource.
 *  - Plateforme inconnue → champs à compléter par l'utilisateur (URL conservée).
 */
export async function runUrlDetection(): Promise<void> {
  const urlEl = document.getElementById('detect-url') as HTMLInputElement | null;
  const raw = urlEl?.value.trim() ?? '';
  if (!raw) {
    toastWarning('Veuillez coller une URL.');
    return;
  }

  let host = '';
  try {
    host = new URL(raw).hostname;
  } catch {
    // pas une URL absolue — on laissera l'utilisateur compléter en mode manuel
  }
  const isGrist = /grist/i.test(host) || host === 'getgrist.com' || host.endsWith('.getgrist.com');

  const resolved = resolveSourceUrl(raw);

  // --- Grist ---
  if (isGrist || resolved.provider.id === 'grist') {
    const ref = parseGristDocRef(raw);

    // Document précis : on sonde l'accès public (anonyme) sur /docs/{id}/tables.
    if (ref?.docId) {
      const docName = gristDocNameFromUrl(raw, ref.docId) ?? ref.docId;
      try {
        const probe = await fetch(getProxyUrl(ref.baseUrl, `/docs/${ref.docId}/tables`), {
          headers: buildGristHeaders(null),
        });
        if (probe.ok) {
          // Doc public → connexion publique + navigation des tables dans l'explorateur.
          await createGristConnection(ref.baseUrl, ref.docId, docName);
          return;
        }
        if (probe.status === 401 || probe.status === 403) {
          setConnType('grist');
          const urlField = document.getElementById('conn-url') as HTMLInputElement | null;
          if (urlField) urlField.value = ref.baseUrl;
          setManualStatus(
            'info',
            'Ce document Grist est protégé (accès anonyme refusé). Renseignez votre clé API, puis enregistrez.'
          );
          setAdvanced('open');
          setConnectionModalStep('manual');
          return;
        }
      } catch {
        // réseau / proxy indisponible → on retombe sur le formulaire manuel
      }
    }

    // Racine serveur (sans doc) ou sondage non concluant → formulaire manuel guidé.
    setConnType('grist');
    const urlField = document.getElementById('conn-url') as HTMLInputElement | null;
    if (urlField && ref) urlField.value = ref.baseUrl;
    setManualStatus(
      'info',
      ref?.docId
        ? 'Document Grist détecté mais non lisible en anonyme. Renseignez une clé API, ou cochez « Document public ».'
        : 'Serveur Grist détecté, sans document précis. Renseignez une clé API pour un accès privé, ou collez plutôt l’URL d’une page de partage d’un document.'
    );
    setAdvanced('open');
    setConnectionModalStep('manual');
    return;
  }

  // --- Plateforme de données connue : champs API pré-remplis ---
  if (resolved.provider.id !== 'generic' && resolved.apiUrl) {
    setConnType('api');
    const apiUrlEl = document.getElementById('api-url') as HTMLInputElement | null;
    const dataPathEl = document.getElementById('api-data-path') as HTMLInputElement | null;
    const nameEl = document.getElementById('conn-name') as HTMLInputElement | null;
    if (apiUrlEl) apiUrlEl.value = resolved.apiUrl;
    if (dataPathEl) dataPathEl.value = resolved.provider.response.dataPath || '';
    const firstId = resolved.ids ? Object.values(resolved.ids)[0] : null;
    if (nameEl && !nameEl.value.trim() && firstId) nameEl.value = firstId;
    clearApiHeadersEditor();
    setManualStatus(
      'success',
      `Plateforme détectée : ${resolved.provider.displayName}. Tout est prêt — enregistrez pour récupérer les données.`
    );
    setAdvanced('closed');
    setConnectionModalStep('manual');
    return;
  }

  // --- Page dataset data.gouv.fr : crée une connexion (1→N jeux), browse dans l'explorateur ---
  const dgSlug = parseDataGouvDataset(raw);
  if (dgSlug) {
    await createDataGouvConnection(dgSlug, raw);
    return;
  }

  // --- Racine data.gouv.fr (sans dataset ni ressource) : pas assez d'info → on guide. ---
  if (host.endsWith('data.gouv.fr')) {
    toastWarning(
      "Collez l'URL d'une page de jeu de données data.gouv (ex : data.gouv.fr/datasets/<nom-du-jeu>), pas la racine du site."
    );
    return;
  }

  // --- Aucune correspondance : champs à compléter (URL conservée) ---
  setConnType('api');
  const apiUrlEl = document.getElementById('api-url') as HTMLInputElement | null;
  if (apiUrlEl) apiUrlEl.value = raw;
  setManualStatus(
    'info',
    'Plateforme non reconnue. Complétez la configuration (méthode, authentification, emplacement des données) si nécessaire, puis enregistrez.'
  );
  setAdvanced('open');
  setConnectionModalStep('manual');
}

/** Extrait le nom de doc d'une URL Grist (segment suivant le docId), ou null. */
function gristDocNameFromUrl(url: string, docId: string): string | null {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    const i = segments.indexOf(docId);
    return i >= 0 && segments[i + 1] ? decodeURIComponent(segments[i + 1]) : null;
  } catch {
    return null;
  }
}

/**
 * Document Grist public → crée une **connexion** Grist (doc public ciblé, 1→N
 * tables, cf. ADR-035) et l'ouvre dans l'explorateur. L'accès anonyme a déjà
 * été validé par un sondage de `/docs/{id}/tables`.
 */
async function createGristConnection(baseUrl: string, docId: string, name: string): Promise<void> {
  const connection: StoredConnection = {
    id: crypto.randomUUID(),
    type: 'grist',
    name,
    url: baseUrl,
    apiKey: null,
    isPublic: true,
    publicDocId: docId,
    status: 'connected',
    statusText: 'Doc public',
  } as unknown as StoredConnection;

  state.connections.push(connection);
  saveToStorage(STORAGE_KEYS.CONNECTIONS, state.connections);
  renderConnections();
  closeModal('connection-modal');
  resetConnectionForm();
  await selectConnection(connection.id);
}

/**
 * Page dataset data.gouv.fr → crée une **connexion** data.gouv (1→N jeux, cf.
 * ADR-035) et l'ouvre dans l'explorateur pour choisir les ressources. On tente
 * de récupérer le titre du jeu pour nommer la connexion (sinon le slug).
 */
async function createDataGouvConnection(slug: string, pageUrl: string): Promise<void> {
  let name = slug;
  try {
    const resp = await fetch(dataGouvDatasetApiUrl(slug));
    if (resp.ok) {
      const json = (await resp.json()) as { title?: string };
      if (json?.title) name = json.title;
    }
  } catch {
    // titre indisponible → on garde le slug comme nom
  }

  const connection: StoredConnection = {
    id: crypto.randomUUID(),
    type: 'datagouv',
    name,
    datasetSlug: slug,
    url: pageUrl,
    status: 'connected',
    statusText: 'Jeu data.gouv',
  } as unknown as StoredConnection;

  state.connections.push(connection);
  saveToStorage(STORAGE_KEYS.CONNECTIONS, state.connections);
  renderConnections();
  closeModal('connection-modal');
  resetConnectionForm();
  await selectConnection(connection.id);
}

// ============================================================
// Métadonnées d'aperçu : type, URL, nb lignes/colonnes + typage des colonnes
// ============================================================

type ColType = 'texte' | 'nombre' | 'date' | 'géo';

const GEO_NAME_RE =
  /g[eé]o|coord|geom|\blat\b|\blng\b|\blon\b|latitude|longitude|geo_point|geo_shape|wkt|wgs/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]|$)/;

function classifyColumn(name: string, values: unknown[]): ColType {
  if (GEO_NAME_RE.test(name)) return 'géo';
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (nonNull.length === 0) return 'texte';
  if (nonNull.every((v) => typeof v === 'object')) return 'géo'; // geo_point/shape objets
  if (nonNull.every((v) => typeof v === 'number' || looksLikeNumber(String(v)))) return 'nombre';
  if (nonNull.every((v) => ISO_DATE_RE.test(String(v)))) return 'date';
  return 'texte';
}

/** Déduit le type de chaque colonne à partir d'un échantillon des lignes. */
function inferColumns(rows: Record<string, unknown>[]): { name: string; type: ColType }[] {
  if (rows.length === 0) return [];
  const sample = rows.slice(0, 50);
  return Object.keys(rows[0]).map((name) => ({
    name,
    type: classifyColumn(
      name,
      sample.map((r) => r[name])
    ),
  }));
}

/** « 8 texte · 3 nombre · 1 géo » */
function summarizeColumns(cols: { type: ColType }[]): string {
  const counts: Record<ColType, number> = { texte: 0, nombre: 0, date: 0, géo: 0 };
  cols.forEach((c) => (counts[c.type] += 1));
  return (['texte', 'nombre', 'date', 'géo'] as ColType[])
    .filter((t) => counts[t] > 0)
    .map((t) => `${counts[t]} ${t}`)
    .join(' · ');
}

/**
 * Affiche le bandeau de métadonnées de l'aperçu : badge de catégorie
 * (connexion / jeu en ligne / jeu local), URL (sauf local), nombre de lignes
 * et de colonnes avec leur typage. `null` masque le bandeau.
 */
export function renderPreviewMeta(
  opts: {
    kind: 'connexion' | 'online' | 'local';
    url?: string | null;
    rows: Record<string, unknown>[];
    totalCount?: number;
  } | null
): void {
  const el = document.getElementById('preview-meta');
  if (!el) return;
  if (!opts) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  const { kind, url, rows } = opts;
  const cols = inferColumns(rows);
  const nLines = opts.totalCount && opts.totalCount > rows.length ? opts.totalCount : rows.length;
  const rowLabel = `${nLines} ligne${nLines > 1 ? 's' : ''}`;
  const colTypes = summarizeColumns(cols);
  const colLabel = cols.length
    ? `${cols.length} colonne${cols.length > 1 ? 's' : ''}${colTypes ? ` (${colTypes})` : ''}`
    : '';

  const badge =
    kind === 'connexion'
      ? '<span class="badge-source-type badge-api">Connexion</span>'
      : kind === 'online'
        ? '<span class="badge-source-type badge-grist">Jeu en ligne</span>'
        : '<span class="badge-source-type badge-manual">Jeu local</span>';

  const urlLine =
    kind !== 'local' && url
      ? `<div style="color: var(--text-mention-grey); font-size: 0.75rem; word-break: break-all; margin-top: 0.25rem;">${escapeHtml(url)}</div>`
      : '';

  el.innerHTML = `
    <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
      ${badge}
      <span class="fr-text--sm" style="color: var(--text-mention-grey); margin: 0;">${rowLabel}${colLabel ? ` · ${colLabel}` : ''}</span>
    </div>
    ${urlLine}`;
  el.style.display = '';
}

// ============================================================
// Jeu prévisualisé → ajout explicite « en ligne » / « local » (cf. ADR-035)
// ============================================================

interface DatasetCandidate {
  /** Libellé du jeu (table Grist, ressource data.gouv…). */
  name: string;
  /** Construit le jeu « en ligne » (rattaché à la connexion, rafraîchissable). */
  toOnline: () => Source;
  /** Lignes à matérialiser pour un instantané « local ». */
  localRows: Record<string, unknown>[];
}

let currentCandidate: DatasetCandidate | null = null;

/**
 * Définit (ou efface avec `null`) le jeu actuellement prévisualisé et
 * affiche/masque les boutons « en faire un jeu en ligne / local ».
 */
export function setDatasetCandidate(candidate: DatasetCandidate | null): void {
  currentCandidate = candidate;
  const onlineBtn = document.getElementById('add-online-btn');
  const localBtn = document.getElementById('add-local-btn');
  const display = candidate ? '' : 'none';
  if (onlineBtn) onlineBtn.style.display = display;
  if (localBtn) localBtn.style.display = display;
}

function upsertSource(source: Source): void {
  const idx = state.sources.findIndex((s) => s.id === source.id);
  if (idx >= 0) state.sources[idx] = source;
  else state.sources.push(source);
  saveToStorage(STORAGE_KEYS.SOURCES, state.sources);
  localStorage.setItem(STORAGE_KEYS.SELECTED_SOURCE, JSON.stringify(source));
  renderSources();
}

/** « En faire un jeu de données en ligne » : rattaché à la connexion (rafraîchissable). */
export function addCurrentAsOnline(): void {
  if (!currentCandidate) return;
  const source = currentCandidate.toOnline();
  upsertSource(source);
  toastSuccess(`« ${source.name} » ajouté aux jeux en ligne.`);
}

/** « En faire un jeu de données local » : instantané matérialisé dans le navigateur. */
export function addCurrentAsLocal(): void {
  if (!currentCandidate) return;
  const rows = currentCandidate.localRows;
  const source: Source = {
    id: crypto.randomUUID(),
    name: `${currentCandidate.name} (copie locale)`,
    type: 'manual',
    data: rows,
    recordCount: rows.length,
  };
  upsertSource(source);
  toastSuccess(`« ${source.name} » ajouté aux jeux locaux.`);
}

/** Lien « Configurer manuellement » : ouvre l'étape config sans détection. */
export function openManualConfig(): void {
  const detectUrlEl = document.getElementById('detect-url') as HTMLInputElement | null;
  const raw = detectUrlEl?.value.trim() ?? '';
  setManualStatus(null);
  // Manuel = API REST standard (le seul cas qui se configure vraiment à la main).
  setConnType('api');
  const apiUrlEl = document.getElementById('api-url') as HTMLInputElement | null;
  if (apiUrlEl && raw) apiUrlEl.value = raw;
  setAdvanced('open');
  setConnectionModalStep('manual');
}

/** Lien « Revenir à la détection par URL ». */
export function backToDetect(): void {
  setManualStatus(null);
  setConnectionModalStep('detect');
}

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

/** Construit la carte d'un jeu de données pour la sidebar (même style que les connexions). */
function buildSourceCard(source: (typeof state.sources)[number]): HTMLElement {
  const card = document.createElement('div');
  card.className = 'connection-card';

  const typeBadge =
    source.type === 'api'
      ? '<span class="badge-source-type badge-api">API</span>'
      : source.type === 'grist'
        ? '<span class="badge-source-type badge-grist">Grist</span>'
        : source.type === 'join'
          ? '<span class="badge-source-type badge-join">Jointure</span>'
          : '<span class="badge-source-type badge-manual">Manuel</span>';

  // Edit button: only available on manual sources (API/Grist/join sources
  // are derived from external state, not editable here).
  const editBtn =
    source.type === 'manual'
      ? `<button class="edit-source-btn" title="Modifier" style="background: none; border: none; cursor: pointer; color: var(--text-mention-grey); padding: 0.25rem; font-size: 0.875rem; line-height: 1; border-radius: 3px;">
          <i class="ri-pencil-line"></i>
        </button>`
      : '';

  const count = source.recordCount || source.data?.length || 0;

  card.innerHTML = `
    <div class="name" style="display: flex; align-items: center; gap: 0.5rem;">
      ${typeBadge}
      <span style="flex: 1;">${escapeHtml(source.name)}</span>
      ${editBtn}
      <button class="delete-source-btn" title="Supprimer" style="background: none; border: none; cursor: pointer; color: var(--text-mention-grey); padding: 0.25rem; font-size: 0.875rem; line-height: 1; border-radius: 3px;">
        <i class="ri-delete-bin-line"></i>
      </button>
    </div>
    <div class="status">${count} ligne${count > 1 ? 's' : ''}</div>`;

  card.addEventListener('click', (e: Event) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.delete-source-btn') && !target.closest('.edit-source-btn')) {
      previewSource(source.id);
    }
  });

  card.querySelector('.edit-source-btn')?.addEventListener('click', (e: Event) => {
    e.stopPropagation();
    editSource(source.id);
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

  return card;
}

const EMPTY_ONLINE =
  '<p class="fr-text--sm" style="color: var(--text-mention-grey); text-align: center; padding: 0.5rem 0;"><i class="ri-cloud-line" style="display:block;font-size:1.25rem;opacity:0.4;margin-bottom:0.25rem;"></i>Aucun jeu en ligne.<br>Ajoutez une connexion ci-dessus.</p>';
const EMPTY_LOCAL =
  '<p class="fr-text--sm" style="color: var(--text-mention-grey); text-align: center; padding: 0.5rem 0;"><i class="ri-file-list-3-line" style="display:block;font-size:1.25rem;opacity:0.4;margin-bottom:0.25rem;"></i>Aucun jeu local.<br>Creez une source manuelle (CSV, JSON).</p>';

/**
 * Affiche les sources réparties en deux zones (cf. ADR-035) :
 *  - « Jeux de données en ligne » : sources issues d'une connexion (api / grist) ;
 *  - « Jeux de données locaux » : données saisies / importées / jointures.
 */
export function renderSources(): void {
  const onlineContainer = document.getElementById('online-sources-list');
  const localContainer = document.getElementById('local-sources-list');
  if (!onlineContainer || !localContainer) return;
  onlineContainer.innerHTML = '';
  localContainer.innerHTML = '';

  const online = state.sources.filter((s) => s.type === 'api' || s.type === 'grist');
  const local = state.sources.filter((s) => s.type === 'manual' || s.type === 'join');

  if (online.length === 0) onlineContainer.innerHTML = EMPTY_ONLINE;
  else online.forEach((s) => onlineContainer.appendChild(buildSourceCard(s)));

  if (local.length === 0) localContainer.innerHTML = EMPTY_LOCAL;
  else local.forEach((s) => localContainer.appendChild(buildSourceCard(s)));
}

// ============================================================
// Source CRUD
// ============================================================

export function deleteSource(id: string): void {
  state.sources = state.sources.filter((s) => s.id !== id);
  saveToStorage(STORAGE_KEYS.SOURCES, state.sources);
  getApiAdapter()?.deleteItemFromServer(STORAGE_KEYS.SOURCES, id);
  renderSources();
}

/**
 * Open the "Nouvelle source manuelle" modal in edit mode, pre-filled with the
 * existing source. Only valid for sources of type `manual`. The table editor
 * is used for editing regardless of how the source was originally created
 * (JSON, CSV, or table) — it's the most general view, and the user can still
 * switch modes if they want to paste new JSON or import a new CSV.
 */
export function editSource(id: string): void {
  const source = state.sources.find((s) => s.id === id);
  if (!source || source.type !== 'manual') return;

  state.editingSourceId = id;

  const titleEl = document.querySelector('#manual-source-modal .modal-header h3');
  if (titleEl) {
    titleEl.innerHTML = '<i class="ri-pencil-line"></i> Modifier la source';
  }
  const saveBtnEl = document.getElementById('save-source-btn');
  if (saveBtnEl) {
    saveBtnEl.textContent = 'Enregistrer les modifications';
  }

  const nameEl = document.getElementById('source-name') as HTMLInputElement | null;
  if (nameEl) nameEl.value = source.name || '';

  switchSourceMode('table');
  loadTableData(source.data as Record<string, unknown>[]);

  openModal('manual-source-modal');
}

export function previewSource(id: string): void {
  const source = state.sources.find((s) => s.id === id);
  if (!source) return;

  state.previewedSource = source;
  // Jeu déjà enregistré → pas de boutons « en faire un jeu en ligne/local ».
  setDatasetCandidate(null);

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
  if (exportBtn)
    exportBtn.style.display = source.type === 'manual' || source.type === 'join' ? '' : 'none';

  // Hide "Rafraîchir" for manual/join sources — they have no remote data to refresh.
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn)
    refreshBtn.style.display = source.type === 'manual' || source.type === 'join' ? 'none' : '';

  // Render preview table
  const info = document.getElementById('preview-info');
  const table = document.getElementById('preview-table');
  if (!info || !table) return;

  const data = source.data || [];
  info.textContent = `${data.length} enregistrements`;

  // Bandeau métadonnées : jeu en ligne (api/grist) vs jeu local (manual/join).
  const online = source.type === 'api' || source.type === 'grist';
  renderPreviewMeta({
    kind: online ? 'online' : 'local',
    url: online ? source.apiUrl : null,
    rows: data as Record<string, unknown>[],
    totalCount: source.recordCount,
  });

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
          '</tr>'
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
    toastWarning('Erreur de lecture de la source sélectionnée.');
    return;
  }

  // Check if already exists
  const exists = state.sources.some((s) => s.id === source.id);
  if (exists) {
    toastWarning('Cette source est déjà enregistree.');
    return;
  }

  state.sources.push(source as unknown as (typeof state.sources)[0]);
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
  const conn = state.connections.find((c) => c.id === connId);

  const docSelect = document.getElementById('export-document') as HTMLSelectElement | null;
  if (!docSelect || !conn || conn.type !== 'grist') return;

  docSelect.innerHTML = '<option value="">Chargement...</option>';

  try {
    const gristApiKey = (conn as Record<string, unknown>).isPublic
      ? null
      : ((conn as Record<string, unknown>).apiKey as string | null);

    const proxyUrl = getProxyUrl((conn as Record<string, unknown>).url as string, '/orgs');
    const orgsResp = await fetch(proxyUrl, { headers: buildGristHeaders(gristApiKey) });
    const orgs = (await orgsResp.json()) as Array<{ id: number; name: string }>;

    let options = '<option value="">-- Choisir un document --</option>';

    for (const org of orgs) {
      const wsUrl = getProxyUrl(
        (conn as Record<string, unknown>).url as string,
        `/orgs/${org.id}/workspaces`
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
    docSelect.innerHTML = '<option value="">Erreur de chargement</option>';
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
  const conn = state.connections.find((c) => c.id === connId);

  if (!conn || !docId || !tableName) return;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line"></i> Creation en cours...';
  }

  try {
    const headers = buildGristHeaders(
      (conn as Record<string, unknown>).isPublic
        ? null
        : ((conn as Record<string, unknown>).apiKey as string | null),
      { contentType: true }
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
      `/docs/${docId}/tables`
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
    if (btn) btn.innerHTML = '<i class="ri-loader-4-line"></i> Insertion des données...';

    const records = source.data.map((record) => {
      const sanitizedFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        sanitizedFields[columnMapping[key] || key] = value;
      }
      return { fields: sanitizedFields };
    });

    const insertUrl = getProxyUrl(
      (conn as Record<string, unknown>).url as string,
      `/docs/${docId}/tables/${tableName}/records`
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

    toastSuccess(`Table "${tableName}" créée avec ${source.data.length} enregistrements !`);
    closeModal('export-grist-modal');
  } catch (error) {
    toastError(`Erreur : ${(error as Error).message}`);
    console.error('Erreur export Grist:', error);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-upload-cloud-line"></i> Créer la table';
    }
  }
}

// ============================================================
// Join sources
// ============================================================

export function openJoinModal(): void {
  const sourcesWithData = state.sources.filter((s) => s.data && s.data.length > 0);
  if (sourcesWithData.length < 2) {
    toastWarning('Il faut au moins 2 sources avec des données pour créer une jointure.');
    return;
  }

  const leftSelect = document.getElementById('join-left-source') as HTMLSelectElement | null;
  const rightSelect = document.getElementById('join-right-source') as HTMLSelectElement | null;

  const options =
    '<option value="">-- Sélectionner --</option>' +
    sourcesWithData
      .map(
        (s) =>
          `<option value="${s.id}">${escapeHtml(s.name)} (${s.recordCount || s.data!.length} lignes)</option>`
      )
      .join('');

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

  const leftSource = state.sources.find((s) => s.id === leftId);
  const rightSource = state.sources.find((s) => s.id === rightId);

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
    const common = leftFields.find((f) => rightFields.includes(f));
    if (common) onEl.value = common;
  }
}

/** Preview the join result live. */
export function previewJoinResult(): void {
  const leftId = (document.getElementById('join-left-source') as HTMLSelectElement | null)?.value;
  const rightId = (document.getElementById('join-right-source') as HTMLSelectElement | null)?.value;
  const on = (document.getElementById('join-on') as HTMLInputElement | null)?.value.trim();
  const joinType = (document.getElementById('join-type') as HTMLSelectElement | null)
    ?.value as JoinType;
  const prefixRight =
    (document.getElementById('join-prefix-right') as HTMLInputElement | null)?.value || 'right_';

  const preview = document.getElementById('join-preview');
  if (!preview) return;

  if (!leftId || !rightId || !on) {
    preview.style.display = 'none';
    return;
  }

  const leftSource = state.sources.find((s) => s.id === leftId);
  const rightSource = state.sources.find((s) => s.id === rightId);
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
      if (thead) thead.innerHTML = columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
      if (tbody) {
        tbody.innerHTML = result
          .slice(0, 5)
          .map(
            (row) =>
              '<tr>' +
              columns.map((c) => `<td>${escapeHtml(String(row[c] ?? ''))}</td>`).join('') +
              '</tr>'
          )
          .join('');
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
  const joinType = (document.getElementById('join-type') as HTMLSelectElement | null)
    ?.value as JoinType;
  const prefixRight =
    (document.getElementById('join-prefix-right') as HTMLInputElement | null)?.value || 'right_';

  if (!name) {
    toastWarning('Veuillez saisir un nom.');
    return;
  }
  if (!leftId || !rightId) {
    toastWarning('Veuillez sélectionner les deux sources.');
    return;
  }
  if (leftId === rightId) {
    toastWarning('Les deux sources doivent etre differentes.');
    return;
  }
  if (!on) {
    toastWarning('Veuillez saisir la clé de jointure.');
    return;
  }

  const leftSource = state.sources.find((s) => s.id === leftId);
  const rightSource = state.sources.find((s) => s.id === rightId);
  if (!leftSource?.data || !rightSource?.data) {
    toastWarning("Les sources selectionnees n'ont pas de données.");
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
    toastSuccess(`Source jointe "${name}" créée (${result.length} lignes)`);
  } catch (err) {
    toastError(`Erreur de jointure : ${(err as Error).message}`);
  }
}
