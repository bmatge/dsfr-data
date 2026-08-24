/**
 * Grist API interactions: fetch, documents, tables, preview, create, export.
 */

import {
  escapeHtml,
  getProxyUrl,
  buildGristHeaders,
  toastWarning,
  toastSuccess,
  toastError,
} from '@dsfr-data/shared';

import { state } from '../state.js';
import type { GristRecord, Source } from '../state.js';
import {
  switchExplorerTab,
  setDatasetCandidate,
  renderPreviewMeta,
  invalidateGristTables,
} from './connection-manager.js';

// ============================================================
// Grist Fetch helper
// ============================================================

/** Fetch Grist proxifié pour une connexion donnée. */
export async function gristFetchFor(
  conn: Record<string, unknown>,
  endpoint: string
): Promise<unknown> {
  const connUrl = conn.url as string | undefined;
  if (!connUrl) {
    throw new Error('URL du serveur Grist manquante dans la connexion');
  }
  const proxyUrl = getProxyUrl(connUrl, endpoint);
  const apiKey = conn.isPublic ? null : (conn.apiKey as string | null);
  const response = await fetch(proxyUrl, { headers: buildGristHeaders(apiKey) });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

/** Fetch Grist sur la connexion sélectionnée (compat flux d'aperçu). */
export async function gristFetch(endpoint: string): Promise<unknown> {
  if (state.selectedConnectionId === null) {
    throw new Error('Aucune connexion sélectionnée');
  }
  const conn = state.connections.find((c) => c.id === state.selectedConnectionId);
  if (!conn) {
    throw new Error('Connexion introuvable');
  }
  return gristFetchFor(conn as unknown as Record<string, unknown>, endpoint);
}

// ============================================================
// Documents & tables — fetchers v2 (accordéon)
// ============================================================

/** Option de document pour le sélecteur de l'accordéon. */
export interface GristDocOption {
  id: string;
  name: string;
  org: string;
  workspace: string;
}

/**
 * Liste les documents accessibles d'une connexion Grist.
 * - Doc public ciblé (publicDocId) : un seul document, nommé via /docs/{id}.
 * - Connexion à clé : orgs → workspaces → docs, aplatis.
 */
export async function fetchGristDocs(conn: Record<string, unknown>): Promise<GristDocOption[]> {
  const publicDocId = conn.publicDocId as string | null | undefined;
  if (publicDocId) {
    let docName = publicDocId;
    try {
      const meta = (await gristFetchFor(conn, `/docs/${publicDocId}`)) as { name?: string };
      if (meta?.name) docName = meta.name;
    } catch {
      // métadonnées indisponibles → on garde le docId comme libellé
    }
    return [{ id: publicDocId, name: docName, org: '', workspace: '' }];
  }

  const docs: GristDocOption[] = [];
  const orgs = (await gristFetchFor(conn, '/orgs')) as Array<{ id: number; name: string }>;
  for (const org of orgs) {
    const workspaces = (await gristFetchFor(conn, `/orgs/${org.id}/workspaces`)) as Array<{
      id: number;
      name: string;
      docs?: Array<{ id: string; name: string }>;
    }>;
    for (const ws of workspaces) {
      for (const doc of ws.docs ?? []) {
        docs.push({ id: doc.id, name: doc.name, org: org.name, workspace: ws.name });
      }
    }
  }
  return docs;
}

/** Liste les tables d'un document (utilisée par l'accordéon, avec cache amont). */
export async function fetchGristTables(
  conn: Record<string, unknown>,
  docId: string
): Promise<{ id: string }[]> {
  const result = (await gristFetchFor(conn, `/docs/${docId}/tables`)) as {
    tables?: Array<{ id: string; [key: string]: unknown }>;
  };
  const tables = result.tables ?? [];
  // state.tables reste alimenté pour les consommateurs historiques.
  state.tables = tables;
  return tables.map((t) => ({ id: t.id }));
}

export async function selectTable(tableId: string): Promise<void> {
  state.selectedTable = tableId;
  // Ouvre le panneau d'aperçu (compat v1 : « onglet preview ») et charge.
  switchExplorerTab('preview');
  await loadTablePreview();
}

// ============================================================
// Table Preview
// ============================================================

export async function loadTablePreview(): Promise<void> {
  if (!state.selectedDocument || !state.selectedTable) return;

  const info = document.getElementById('preview-info');
  const table = document.getElementById('preview-table');
  if (!info || !table) return;

  info.textContent = 'Chargement...';
  const thead = table.querySelector('thead tr');
  const tbody = table.querySelector('tbody');
  if (thead) thead.innerHTML = '';
  if (tbody) tbody.innerHTML = '';

  try {
    const result = (await gristFetch(
      `/docs/${state.selectedDocument}/tables/${state.selectedTable}/records?limit=20`
    )) as { records?: GristRecord[] };
    state.tableData = result.records || [];

    if (state.tableData.length === 0) {
      info.textContent = 'Table vide';
      return;
    }

    // Get columns from first record
    const firstRecord = state.tableData[0] as GristRecord;
    const columns = Object.keys(firstRecord.fields || {});

    // Header
    let headerHtml = '<th>#</th>';
    columns.forEach((col) => {
      headerHtml += `<th>${escapeHtml(col)}</th>`;
    });
    if (thead) thead.innerHTML = headerHtml;

    // Body
    let bodyHtml = '';
    (state.tableData as GristRecord[]).forEach((record) => {
      bodyHtml += '<tr>';
      bodyHtml += `<td>${record.id}</td>`;
      columns.forEach((col) => {
        const val = record.fields[col];
        bodyHtml += `<td>${escapeHtml(String(val ?? ''))}</td>`;
      });
      bodyHtml += '</tr>';
    });
    if (tbody) tbody.innerHTML = bodyHtml;

    info.textContent = `Table "${state.selectedTable}" -- ${state.tableData.length} lignes affichees`;

    // Ajout explicite (ADR-035) : on arme le jeu candidat ; l'utilisateur clique
    // ensuite « en faire un jeu en ligne / local ». Plus d'auto-création.
    const built = buildGristSource();
    const fieldRows = (state.tableData as GristRecord[]).map((r) => r.fields);
    if (built) {
      setDatasetCandidate({
        name: built.name,
        toOnline: () => built,
        localRows: fieldRows,
      });
    }
    renderPreviewMeta({ kind: 'connexion', url: built?.apiUrl, rows: fieldRows });

    // Show favorite button
    const favBtn = document.getElementById('save-favorite-btn');
    if (favBtn) favBtn.style.display = '';
  } catch (error) {
    info.textContent = `Erreur : ${(error as Error).message}`;
  }
}

// ============================================================
// Create Grist Table
// ============================================================

export async function createGristTable(): Promise<void> {
  if (!state.selectedDocument) {
    toastWarning("Sélectionnez d'abord un document Grist");
    return;
  }

  const tableNameEl = document.getElementById('table-name') as HTMLInputElement | null;
  const tableName = tableNameEl?.value.trim() ?? '';
  if (!tableName) {
    toastWarning('Veuillez entrer un nom de table');
    return;
  }

  // Collect columns
  const columnItems = document.querySelectorAll('#columns-list .column-item');
  const columns: Array<{ id: string; fields: { type: string } }> = [];

  columnItems.forEach((item) => {
    const nameInput = item.querySelector('input') as HTMLInputElement | null;
    const typeSelect = item.querySelector('select') as HTMLSelectElement | null;
    const name = nameInput?.value.trim() ?? '';
    const type = typeSelect?.value ?? 'Text';
    if (name) {
      columns.push({ id: name, fields: { type } });
    }
  });

  if (columns.length === 0) {
    toastWarning('Ajoutez au moins une colonne');
    return;
  }

  try {
    if (state.selectedConnectionId === null) return;
    const conn = state.connections.find((c) => c.id === state.selectedConnectionId);
    if (!conn) return;

    const createUrl = getProxyUrl(
      (conn as Record<string, unknown>).url as string,
      `/docs/${state.selectedDocument}/tables`
    );

    const response = await fetch(createUrl, {
      method: 'POST',
      headers: buildGristHeaders((conn as Record<string, unknown>).apiKey as string, {
        contentType: true,
      }),
      body: JSON.stringify({
        tables: [{ id: tableName, columns }],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        ((error as Record<string, unknown>).error as string) || `HTTP ${response.status}`
      );
    }

    toastSuccess(`Table "${tableName}" créée avec succes !`);
    const { closeModal } = await import('@dsfr-data/shared');
    closeModal('create-table-modal');

    // Refresh : invalide le cache des tables de l'accordéon (v2)
    invalidateGristTables(state.selectedConnectionId, state.selectedDocument);
  } catch (error) {
    toastError(`Erreur : ${(error as Error).message}`);
  }
}

/**
 * Add a column row to the create-table modal columns list
 */
export function addColumnRow(): void {
  const container = document.getElementById('columns-list');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'column-item';
  row.innerHTML = `
    <input class="fr-input fr-input--sm" type="text" placeholder="Nom de colonne">
    <select class="fr-select fr-select--sm" style="width: 120px;">
      <option value="Text">Texte</option>
      <option value="Numeric">Nombre</option>
      <option value="Date">Date</option>
      <option value="Bool">Booleen</option>
    </select>
    <button class="fr-btn fr-btn--sm fr-btn--tertiary" onclick="this.parentElement.remove()">
      <i class="ri-delete-bin-line"></i>
    </button>
  `;
  container.appendChild(row);
}

// ============================================================
// Build a Source from the current Grist table (no side effects)
// ============================================================

/**
 * Construit l'objet Source « en ligne » pour la table Grist prévisualisée,
 * sans l'enregistrer (cf. ADR-035 : l'ajout est explicite via les boutons
 * « en faire un jeu en ligne / local »). Retourne null si l'état est incomplet.
 */
export function buildGristSource(): Source | null {
  if (
    !state.selectedDocument ||
    !state.selectedTable ||
    state.tableData.length === 0 ||
    state.selectedConnectionId === null
  ) {
    return null;
  }

  const conn = state.connections.find((c) => c.id === state.selectedConnectionId);
  if (!conn) return null;
  const doc = state.documents.find((d) => d.id === state.selectedDocument);

  return {
    id: `grist_${state.selectedDocument}_${state.selectedTable}`,
    name: `${doc?.name || 'Doc'} / ${state.selectedTable}`,
    type: 'grist',
    connectionId: conn.id,
    documentId: state.selectedDocument,
    tableId: state.selectedTable,
    apiUrl: `${(conn as Record<string, unknown>).url as string}/api/docs/${state.selectedDocument}/tables/${state.selectedTable}/records`,
    apiKey: (conn as Record<string, unknown>).isPublic
      ? null
      : ((conn as Record<string, unknown>).apiKey as string | null),
    isPublic: !!(conn as Record<string, unknown>).isPublic,
    data: (state.tableData as GristRecord[]).map((r) => r.fields),
    rawRecords: state.tableData as GristRecord[],
    recordCount: state.tableData.length,
  };
}

// ============================================================
// Export to Grist
// ============================================================

export async function loadExportDocuments(): Promise<void> {
  const connSelectEl = document.getElementById('export-connection') as HTMLSelectElement | null;
  const docSelect = document.getElementById('export-document') as HTMLSelectElement | null;
  const docGroup = document.getElementById('export-document-group');

  const connId = connSelectEl?.value ?? '';

  if (!connId || !docSelect || !docGroup) {
    if (docGroup) docGroup.style.display = 'none';
    if (docSelect) docSelect.innerHTML = '<option value="">-- Sélectionner --</option>';
    updateExportButton();
    return;
  }

  const conn = state.connections.find((c) => c.id === connId);
  if (!conn) return;

  try {
    docSelect.innerHTML = '<option value="">Chargement...</option>';
    docGroup.style.display = 'block';

    const orgsUrl = getProxyUrl((conn as Record<string, unknown>).url as string, '/orgs');
    const orgsResponse = await fetch(orgsUrl, {
      headers: buildGristHeaders((conn as Record<string, unknown>).apiKey as string),
    });

    if (!orgsResponse.ok) throw new Error(`HTTP ${orgsResponse.status}`);

    const orgs = (await orgsResponse.json()) as Array<{ id: number; name: string }>;

    // Collect all documents from all workspaces
    const allDocs: Array<{ id: string; name: string; workspace: string; org: string }> = [];

    for (const org of orgs) {
      try {
        const wsUrl = getProxyUrl(
          (conn as Record<string, unknown>).url as string,
          `/orgs/${org.id}/workspaces`
        );
        const wsResponse = await fetch(wsUrl, {
          headers: buildGristHeaders((conn as Record<string, unknown>).apiKey as string),
        });

        if (wsResponse.ok) {
          const workspaces = (await wsResponse.json()) as Array<{
            name: string;
            docs?: Array<{ id: string; name: string }>;
          }>;
          for (const ws of workspaces) {
            if (ws.docs && ws.docs.length > 0) {
              for (const doc of ws.docs) {
                allDocs.push({
                  id: doc.id,
                  name: doc.name,
                  workspace: ws.name,
                  org: org.name,
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn(`Erreur workspace org ${org.id}:`, e);
      }
    }

    docSelect.innerHTML = '<option value="">-- Sélectionner --</option>';
    if (allDocs.length === 0) {
      docSelect.innerHTML = '<option value="">Aucun document trouve</option>';
    } else {
      allDocs.forEach((doc) => {
        const label = `${doc.name} (${doc.workspace})`;
        docSelect.innerHTML += `<option value="${doc.id}">${escapeHtml(label)}</option>`;
      });
    }
  } catch (error) {
    if (docSelect) docSelect.innerHTML = '<option value="">Erreur de chargement</option>';
    console.error('Erreur chargement documents:', error);
  }

  updateExportButton();
}

export function updateExportButton(): void {
  const connEl = document.getElementById('export-connection') as HTMLSelectElement | null;
  const docEl = document.getElementById('export-document') as HTMLSelectElement | null;
  const tableNameEl = document.getElementById('export-table-name') as HTMLInputElement | null;
  const btn = document.getElementById('export-grist-confirm-btn') as HTMLButtonElement | null;

  const connId = connEl?.value ?? '';
  const docId = docEl?.value ?? '';
  const tableName = tableNameEl?.value.trim() ?? '';

  if (btn) {
    btn.disabled = !connId || !docId || !tableName;
  }
}

function sanitizeColumnId(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-zA-Z0-9_]/g, '_') // Replace invalid chars
    .replace(/^(\d)/, '_$1') // Prefix with _ if starts with digit
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, ''); // Trim underscores
}

export async function exportToGrist(): Promise<void> {
  const source = state.previewedSource;
  if (!source || !source.data || source.data.length === 0) {
    toastWarning('Aucune donnee a exporter');
    return;
  }

  const connEl = document.getElementById('export-connection') as HTMLSelectElement | null;
  const docEl = document.getElementById('export-document') as HTMLSelectElement | null;
  const tableNameEl = document.getElementById('export-table-name') as HTMLInputElement | null;

  const connId = connEl?.value ?? '';
  const docId = docEl?.value ?? '';
  const tableName = tableNameEl?.value.trim() ?? '';

  if (!connId || !docId || !tableName) {
    toastWarning('Veuillez remplir tous les champs');
    return;
  }

  const conn = state.connections.find((c) => c.id === connId);
  if (!conn) {
    toastWarning('Connexion introuvable');
    return;
  }
  const btn = document.getElementById('export-grist-confirm-btn') as HTMLButtonElement | null;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line"></i> Creation...';
  }

  try {
    // 1. Build columns from data with sanitized IDs
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

    // 2. Create table
    const createTableUrl = getProxyUrl(
      (conn as Record<string, unknown>).url as string,
      `/docs/${docId}/tables`
    );

    const createResponse = await fetch(createTableUrl, {
      method: 'POST',
      headers: buildGristHeaders((conn as Record<string, unknown>).apiKey as string, {
        contentType: true,
      }),
      body: JSON.stringify({
        tables: [{ id: tableName, columns }],
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(
        ((error as Record<string, unknown>).error as string) ||
          `Erreur creation table: HTTP ${createResponse.status}`
      );
    }

    // 3. Insert records (with sanitized column keys)
    if (btn) {
      btn.innerHTML = '<i class="ri-loader-4-line"></i> Insertion des données...';
    }

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
      headers: buildGristHeaders((conn as Record<string, unknown>).apiKey as string, {
        contentType: true,
      }),
      body: JSON.stringify({ records }),
    });

    if (!insertResponse.ok) {
      const error = await insertResponse.json();
      throw new Error(
        ((error as Record<string, unknown>).error as string) ||
          `Erreur insertion: HTTP ${insertResponse.status}`
      );
    }

    toastSuccess(`Table "${tableName}" créée avec ${source.data.length} enregistrements !`);
    const { closeModal } = await import('@dsfr-data/shared');
    closeModal('export-grist-modal');

    // Refresh : invalide le cache des tables de l'accordéon (v2)
    invalidateGristTables(connId, docId);
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
