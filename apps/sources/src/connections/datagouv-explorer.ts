/**
 * data.gouv.fr explorer : parcourt les ressources d'une connexion `datagouv`
 * (cf. ADR-035). Une connexion data.gouv = 1 jeu de données (slug) exposant N
 * ressources ; seules celles interrogeables via l'API Tabular sont listées.
 *
 * Réutilise l'onglet « Ressources » (#tables-tree) et l'aperçu (#preview-table)
 * de l'explorateur. La sélection d'une ressource n'ajoute rien automatiquement :
 * l'utilisateur clique ensuite « en faire un jeu en ligne / local ».
 */

import {
  escapeHtml,
  httpErrorMessage,
  getProxiedUrl,
  dataGouvDatasetApiUrl,
  extractDataGouvResources,
  TABULAR_CONFIG,
} from '@dsfr-data/shared';
import type { DataGouvResource, Source } from '@dsfr-data/shared';

import { state } from '../state.js';
import { switchExplorerTab, setDatasetCandidate, renderPreviewMeta } from './connection-manager.js';

/**
 * Liste les ressources interrogeables (API Tabular) d'une connexion data.gouv.
 * Utilisé par l'accordéon v2 (cache géré par l'appelant).
 */
export async function fetchDataGouvResources(
  conn: Record<string, unknown>
): Promise<DataGouvResource[]> {
  const slug = conn.datasetSlug;
  if (typeof slug !== 'string') {
    throw new Error('Connexion data.gouv invalide (slug manquant).');
  }
  const resp = await fetch(dataGouvDatasetApiUrl(slug));
  if (!resp.ok) throw new Error(httpErrorMessage(resp.status));
  const json: unknown = await resp.json();
  return extractDataGouvResources(json).filter((r) => r.tabularApiUrl);
}

/** Prévisualise une ressource data.gouv (via Tabular) et arme les boutons d'ajout. */
export async function selectDataGouvResource(resource: DataGouvResource): Promise<void> {
  if (!resource?.tabularApiUrl) return;

  switchExplorerTab('preview');
  const info = document.getElementById('preview-info');
  const table = document.getElementById('preview-table');
  if (!info || !table) return;
  info.textContent = 'Chargement…';
  const thead = table.querySelector('thead tr');
  const tbody = table.querySelector('tbody');
  if (thead) thead.innerHTML = '';
  if (tbody) tbody.innerHTML = '';

  try {
    const resp = await fetch(getProxiedUrl(`${resource.tabularApiUrl}?page_size=20`));
    if (!resp.ok) throw new Error(httpErrorMessage(resp.status));
    const json = (await resp.json()) as { data?: Record<string, unknown>[] };
    const rows = json.data ?? [];
    state.tableData = rows;

    if (rows.length === 0) {
      info.textContent = 'Aucune donnée';
      setDatasetCandidate(null);
      renderPreviewMeta(null);
      return;
    }

    const columns = Object.keys(rows[0]);
    if (thead) thead.innerHTML = columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
    if (tbody) {
      tbody.innerHTML = rows
        .slice(0, 20)
        .map(
          (r) =>
            '<tr>' +
            columns.map((c) => `<td>${escapeHtml(String(r[c] ?? ''))}</td>`).join('') +
            '</tr>'
        )
        .join('');
    }
    info.textContent = `${resource.title} — aperçu (${rows.length} lignes)`;
    renderPreviewMeta({ kind: 'connexion', url: resource.tabularApiUrl, rows });

    const connectionId = state.selectedConnectionId;
    setDatasetCandidate({
      name: resource.title,
      toOnline: (): Source => ({
        id: `api_${connectionId}_${resource.id}`,
        name: resource.title,
        type: 'api',
        connectionId: connectionId ?? undefined,
        provider: 'tabular',
        apiUrl: resource.tabularApiUrl!,
        method: 'GET',
        headers: null,
        dataPath: TABULAR_CONFIG.response.dataPath,
        data: rows,
        recordCount: rows.length,
      }),
      localRows: rows,
    });
  } catch (error) {
    info.textContent = `Erreur : ${(error as Error).message}`;
    setDatasetCandidate(null);
    renderPreviewMeta(null);
  }
}
