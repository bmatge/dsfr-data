/**
 * Dashboard app - Dashboard CRUD operations
 */

import {
  escapeHtml,
  saveToStorage,
  STORAGE_KEYS,
  toastWarning,
  toastSuccess,
  navigateTo,
  confirmDialog,
  getApiAdapter,
} from '@dsfr-data/shared';
import { state, createEmptyDashboard } from './state.js';
import { resetGrid, rebuildGrid } from './grid.js';
import { updateGeneratedCode, generateHTMLCode } from './code-generator.js';

/** Opens the save modal pre-filled with current dashboard name & description */
export function openSaveModal(): void {
  const modal = document.getElementById('save-modal');
  const nameInput = document.getElementById('save-dashboard-name') as HTMLInputElement | null;
  const descInput = document.getElementById(
    'save-dashboard-description'
  ) as HTMLTextAreaElement | null;
  if (!modal) return;

  if (nameInput) nameInput.value = state.dashboard.name;
  if (descInput) descInput.value = state.dashboard.description || '';

  modal.classList.add('active');
  nameInput?.focus();
}

/** Closes the save modal */
export function closeSaveModal(): void {
  document.getElementById('save-modal')?.classList.remove('active');
}

/** Confirms save from the modal form */
export function confirmSave(): void {
  const nameInput = document.getElementById('save-dashboard-name') as HTMLInputElement | null;
  const descInput = document.getElementById(
    'save-dashboard-description'
  ) as HTMLTextAreaElement | null;

  const name = nameInput?.value.trim() || '';
  if (!name) {
    toastWarning('Veuillez donner un nom au tableau de bord');
    nameInput?.focus();
    return;
  }

  state.dashboard.name = name;
  state.dashboard.description = descInput?.value.trim() || '';
  state.dashboard.updatedAt = new Date().toISOString();

  if (!state.dashboard.id) {
    state.dashboard.id = crypto.randomUUID();
    state.dashboard.createdAt = state.dashboard.updatedAt;
  }

  const clone = JSON.parse(JSON.stringify(state.dashboard));
  const index = state.savedDashboards.findIndex((d) => d.id === state.dashboard.id);
  if (index > -1) {
    state.savedDashboards[index] = clone;
  } else {
    state.savedDashboards.push(clone);
  }

  saveToStorage(STORAGE_KEYS.DASHBOARDS, state.savedDashboards);

  // Sync title input in toolbar
  const titleInput = document.getElementById('dashboard-title') as HTMLInputElement | null;
  if (titleInput) titleInput.value = state.dashboard.name;

  closeSaveModal();
  toastSuccess('Tableau de bord sauvegarde !');
}

export async function newDashboard(): Promise<void> {
  if (state.dashboard.widgets.length > 0) {
    if (
      !(await confirmDialog(
        'Creer un nouveau tableau de bord ? Les modifications non sauvegardees seront perdues.'
      ))
    ) {
      return;
    }
  }

  state.dashboard = createEmptyDashboard();
  const titleInput = document.getElementById('dashboard-title') as HTMLInputElement | null;
  if (titleInput) titleInput.value = state.dashboard.name;
  resetGrid();
  updateGeneratedCode();
}

export function openDashboardsList(): void {
  const modal = document.getElementById('dashboards-modal');
  const list = document.getElementById('dashboards-list');
  if (!modal || !list) return;

  if (state.savedDashboards.length === 0) {
    list.innerHTML =
      '<p class="favorites-empty">Aucun tableau de bord sauvegarde.<br><span class="fr-text--sm" style="color:var(--text-mention-grey);">Utilisez la barre d\'outils pour en creer un.</span></p>';
  } else {
    list.innerHTML = state.savedDashboards
      .map(
        (d) => `
      <div class="dashboard-list-item" onclick="loadDashboard('${d.id}')">
        <i class="ri-dashboard-line"></i>
        <div class="dashboard-list-item-info">
          <div class="dashboard-list-item-name">${escapeHtml(d.name)}</div>
          ${d.description ? `<div class="dashboard-list-item-desc">${escapeHtml(d.description)}</div>` : ''}
        </div>
        <span class="dashboard-list-item-date">
          ${new Date(d.updatedAt || '').toLocaleDateString('fr-FR')}
        </span>
        <button class="dashboard-list-item-delete" onclick="event.stopPropagation(); deleteDashboard('${d.id}')" title="Supprimer">
          <i class="ri-delete-bin-line"></i>
        </button>
      </div>
    `
      )
      .join('');
  }

  modal.classList.add('active');
}

export async function deleteDashboard(id: string): Promise<void> {
  const dashboard = state.savedDashboards.find((d) => d.id === id);
  if (!dashboard) return;

  if (!(await confirmDialog(`Supprimer le tableau de bord "${dashboard.name}" ?`))) return;

  state.savedDashboards = state.savedDashboards.filter((d) => d.id !== id);
  saveToStorage(STORAGE_KEYS.DASHBOARDS, state.savedDashboards);
  getApiAdapter()?.deleteItemFromServer(STORAGE_KEYS.DASHBOARDS, id);

  // If the deleted dashboard is the currently loaded one, reset its id
  if (state.dashboard.id === id) {
    state.dashboard.id = null;
  }

  // Re-render the list
  openDashboardsList();
  toastSuccess('Tableau de bord supprime');
}

export function loadDashboard(id: string): void {
  const dashboard = state.savedDashboards.find((d) => d.id === id);
  if (!dashboard) return;

  state.dashboard = JSON.parse(JSON.stringify(dashboard));
  const titleInput = document.getElementById('dashboard-title') as HTMLInputElement | null;
  const columnsSelect = document.getElementById('grid-columns') as HTMLSelectElement | null;
  if (titleInput) titleInput.value = state.dashboard.name;
  if (columnsSelect) columnsSelect.value = String(state.dashboard.layout.columns || 2);

  rebuildGrid();
  document.getElementById('dashboards-modal')?.classList.remove('active');
  updateGeneratedCode();
}

export function exportHTML(): void {
  const code = generateHTMLCode();
  const blob = new Blob([code], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.dashboard.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.html`;
  a.click();
  URL.revokeObjectURL(url);
  toastSuccess('Fichier HTML telecharge');
}

export function navigateToSources(): void {
  navigateTo('sources');
}
