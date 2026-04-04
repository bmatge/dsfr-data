/**
 * Dashboard app - Main entry point
 */

import {
  escapeHtml,
  loadFromStorage,
  STORAGE_KEYS,
  confirmDialog,
  initAuth,
  injectTourStyles,
  startTourIfFirstVisit,
  DASHBOARD_TOUR,
} from '@dsfr-data/shared';
import { state } from './state.js';
import { createEmptyDashboard } from './state.js';
import { initDragAndDrop, handleFavoriteDragStart } from './drag-drop.js';
import { editWidget, deleteWidget, openInBuilder, duplicateWidget } from './widgets.js';
import { closeConfigModal, applyConfig } from './widget-config.js';
import {
  addRow,
  resetGrid,
  rebuildGrid,
  addColumnToRow,
  removeColumnFromRow,
  deleteRow,
} from './grid.js';
import { updateGeneratedCode } from './code-generator.js';
import {
  openSaveModal,
  closeSaveModal,
  confirmSave,
  newDashboard,
  openDashboardsList,
  loadDashboard,
  deleteDashboard,
  exportHTML,
  navigateToSources,
} from './dashboards.js';
import { openPreviewModal, closePreviewModal } from './preview.js';

function loadFavorites(): void {
  state.favorites = loadFromStorage<any[]>(STORAGE_KEYS.FAVORITES, []);
  renderFavorites();
}

function loadSavedDashboards(): void {
  state.savedDashboards = loadFromStorage<any[]>(STORAGE_KEYS.DASHBOARDS, []);
}

function loadSources(): void {
  const sources = loadFromStorage<any[]>(STORAGE_KEYS.SOURCES, []);
  renderSources(sources);
}

function renderFavorites(): void {
  const container = document.getElementById('favorites-list');
  if (!container) return;

  if (state.favorites.length === 0) {
    container.innerHTML =
      '<p class="favorites-empty"><i class="ri-star-line" style="display:block;font-size:1.5rem;opacity:0.4;margin-bottom:0.25rem;"></i>Aucun favori.<br><a href="../builder/index.html" class="fr-link fr-link--sm">Creer un graphique</a> dans le Builder pour l\'ajouter ici.</p>';
    return;
  }

  container.innerHTML = state.favorites
    .map(
      (fav) => `
    <div class="favorite-item" draggable="true" data-favorite-id="${fav.id}">
      <i class="ri-star-fill"></i>
      <span>${escapeHtml(fav.name)}</span>
    </div>
  `
    )
    .join('');

  container.querySelectorAll('.favorite-item').forEach((item) => {
    item.addEventListener('dragstart', handleFavoriteDragStart as EventListener);
    item.addEventListener('dragend', (e) => {
      (e.target as HTMLElement).classList.remove('dragging');
    });
  });
}

function renderSources(sources: any[]): void {
  const container = document.getElementById('sources-list');
  if (!container) return;

  if (!sources || sources.length === 0) {
    container.innerHTML =
      '<p class="favorites-empty"><i class="ri-database-2-line" style="display:block;font-size:1.5rem;opacity:0.4;margin-bottom:0.25rem;"></i>Aucune source.<br><a href="../sources/index.html" class="fr-link fr-link--sm">Ajouter une source</a> pour integrer des donnees.</p>';
    return;
  }

  container.innerHTML = sources
    .slice(0, 5)
    .map(
      (src) => `
    <div class="favorite-item source-item-readonly">
      <i class="ri-database-2-line"></i>
      <span>${escapeHtml(src.name)}</span>
    </div>
  `
    )
    .join('');
}

async function loadTemplate(name: string): Promise<void> {
  if (state.dashboard.widgets.length > 0) {
    if (
      !(await confirmDialog(
        'Charger un template ? Les modifications non sauvegardees seront perdues.'
      ))
    )
      return;
  }
  state.dashboard = createEmptyDashboard();

  switch (name) {
    case 'kpi-chart':
      state.dashboard.name = 'KPIs + Graphique';
      state.dashboard.layout.columns = 3;
      state.dashboard.layout.rowColumns = { 0: 3, 1: 1 };
      state.dashboard.widgets = [
        {
          id: crypto.randomUUID(),
          type: 'kpi',
          title: 'Indicateur 1',
          position: { row: 0, col: 0 },
          config: { valeur: '', format: 'nombre', icone: '', label: 'KPI 1' },
        },
        {
          id: crypto.randomUUID(),
          type: 'kpi',
          title: 'Indicateur 2',
          position: { row: 0, col: 1 },
          config: { valeur: '', format: 'nombre', icone: '', label: 'KPI 2' },
        },
        {
          id: crypto.randomUUID(),
          type: 'kpi',
          title: 'Indicateur 3',
          position: { row: 0, col: 2 },
          config: { valeur: '', format: 'nombre', icone: '', label: 'KPI 3' },
        },
        {
          id: crypto.randomUUID(),
          type: 'chart',
          title: 'Graphique',
          position: { row: 1, col: 0 },
          config: { chartType: 'bar', labelField: '', valueField: '', palette: 'categorical' },
        },
      ];
      break;
    case 'two-charts':
      state.dashboard.name = 'Deux graphiques';
      state.dashboard.layout.columns = 2;
      state.dashboard.layout.rowColumns = { 0: 2 };
      state.dashboard.widgets = [
        {
          id: crypto.randomUUID(),
          type: 'chart',
          title: 'Graphique 1',
          position: { row: 0, col: 0 },
          config: { chartType: 'bar', labelField: '', valueField: '', palette: 'categorical' },
        },
        {
          id: crypto.randomUUID(),
          type: 'chart',
          title: 'Graphique 2',
          position: { row: 0, col: 1 },
          config: { chartType: 'line', labelField: '', valueField: '', palette: 'categorical' },
        },
      ];
      break;
    case 'full':
      state.dashboard.name = 'Dashboard complet';
      state.dashboard.layout.columns = 2;
      state.dashboard.layout.rowColumns = { 0: 2, 1: 2 };
      state.dashboard.widgets = [
        {
          id: crypto.randomUUID(),
          type: 'kpi',
          title: 'Indicateur',
          position: { row: 0, col: 0 },
          config: { valeur: '', format: 'nombre', icone: '', label: 'Mon KPI' },
        },
        {
          id: crypto.randomUUID(),
          type: 'text',
          title: 'Description',
          position: { row: 0, col: 1 },
          config: { content: '<p>Description du dashboard</p>', style: 'callout' },
        },
        {
          id: crypto.randomUUID(),
          type: 'chart',
          title: 'Graphique',
          position: { row: 1, col: 0 },
          config: { chartType: 'bar', labelField: '', valueField: '', palette: 'categorical' },
        },
        {
          id: crypto.randomUUID(),
          type: 'table',
          title: 'Tableau',
          position: { row: 1, col: 1 },
          config: { columns: [], searchable: true, sortable: true },
        },
      ];
      break;
  }

  const titleInput = document.getElementById('dashboard-title') as HTMLInputElement | null;
  const columnsSelect = document.getElementById('grid-columns') as HTMLSelectElement | null;
  if (titleInput) titleInput.value = state.dashboard.name;
  if (columnsSelect) columnsSelect.value = String(state.dashboard.layout.columns);
  rebuildGrid();
  updateGeneratedCode();
}

function initEventListeners(): void {
  document.getElementById('btn-new')?.addEventListener('click', newDashboard);
  document.getElementById('btn-load')?.addEventListener('click', openDashboardsList);
  document.getElementById('btn-save')?.addEventListener('click', openSaveModal);
  document.getElementById('btn-export')?.addEventListener('click', exportHTML);
  document.getElementById('btn-preview')?.addEventListener('click', openPreviewModal);
  document.getElementById('add-row-btn')?.addEventListener('click', addRow);
  document.getElementById('close-modal')?.addEventListener('click', closeConfigModal);
  document.getElementById('cancel-config')?.addEventListener('click', closeConfigModal);
  document.getElementById('apply-config')?.addEventListener('click', applyConfig);

  document.getElementById('close-save-modal')?.addEventListener('click', closeSaveModal);
  document.getElementById('cancel-save')?.addEventListener('click', closeSaveModal);
  document.getElementById('confirm-save')?.addEventListener('click', confirmSave);

  document.getElementById('close-dashboards-modal')?.addEventListener('click', () => {
    document.getElementById('dashboards-modal')?.classList.remove('active');
  });

  document.getElementById('close-preview-modal')?.addEventListener('click', closePreviewModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePreviewModal();
    }
  });

  document.querySelectorAll('.vde-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab;

      document.querySelectorAll('.vde-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.vde-tab-panel').forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`tab-${tabName}`)?.classList.add('active');
    });
  });

  document.getElementById('grid-columns')?.addEventListener('change', (e) => {
    state.dashboard.layout.columns = parseInt((e.target as HTMLSelectElement).value);
    if (state.dashboard.widgets.length === 0) {
      resetGrid();
    }
  });

  document.getElementById('grid-gap')?.addEventListener('change', (e) => {
    state.dashboard.layout.gap = (e.target as HTMLSelectElement).value;
    updateGeneratedCode();
  });

  document.getElementById('dashboard-title')?.addEventListener('input', (e) => {
    state.dashboard.name = (e.target as HTMLInputElement).value;
    updateGeneratedCode();
  });

  document.getElementById('add-source-btn')?.addEventListener('click', navigateToSources);

  document.getElementById('template-select')?.addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value;
    if (value) {
      loadTemplate(value);
      (e.target as HTMLSelectElement).value = '';
    }
  });

  document.querySelectorAll('.config-modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        (modal as HTMLElement).classList.remove('active');
      }
    });
  });
}

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();

  loadFavorites();
  loadSavedDashboards();
  loadSources();
  resetGrid();
  initDragAndDrop();
  initEventListeners();
  updateGeneratedCode();

  // Product tour
  injectTourStyles();
  startTourIfFirstVisit(DASHBOARD_TOUR);
});

// Expose functions globally for onclick handlers
declare global {
  interface Window {
    editWidget: typeof editWidget;
    deleteWidget: typeof deleteWidget;
    loadDashboard: typeof loadDashboard;
    openInBuilder: typeof openInBuilder;
    loadTemplate: typeof loadTemplate;
    duplicateWidget: typeof duplicateWidget;
    addColumnToRow: typeof addColumnToRow;
    removeColumnFromRow: typeof removeColumnFromRow;
    deleteRow: typeof deleteRow;
    deleteDashboard: typeof deleteDashboard;
  }
}

window.editWidget = editWidget;
window.deleteWidget = deleteWidget;
window.loadDashboard = loadDashboard;
window.openInBuilder = openInBuilder;
window.loadTemplate = loadTemplate;
window.duplicateWidget = duplicateWidget;
window.addColumnToRow = addColumnToRow;
window.removeColumnFromRow = removeColumnFromRow;
window.deleteRow = deleteRow;
window.deleteDashboard = deleteDashboard;
