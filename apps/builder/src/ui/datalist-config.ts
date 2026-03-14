/**
 * Datalist configuration: column modal and feature toggles.
 */

import { state, type DatalistColumn } from '../state.js';
import { openModal, closeModal, setupModalOverlayClose } from '@dsfr-data/shared';

/**
 * Initialize datalist columns from current fields (all visible, labels = names).
 * Only reinitializes if the column list is empty or fields have changed.
 */
export function initDatalistColumns(): void {
  if (state.fields.length === 0) return;

  const currentFieldNames = state.fields.map(f => f.name);
  const existingFieldNames = state.datalistColumns.map(c => c.field);

  // Skip if already initialized with the same fields
  if (
    existingFieldNames.length > 0 &&
    existingFieldNames.length === currentFieldNames.length &&
    existingFieldNames.every((f, i) => f === currentFieldNames[i])
  ) {
    return;
  }

  state.datalistColumns = state.fields.map(f => ({
    field: f.name,
    label: f.name,
    visible: true,
    filtrable: false,
  }));
}

/**
 * Open the columns configuration modal, populating rows from state.
 */
export function openColumnsModal(): void {
  // Ensure columns are initialized
  if (state.datalistColumns.length === 0) {
    initDatalistColumns();
  }

  const listEl = document.getElementById('datalist-columns-list');
  if (!listEl) return;

  listEl.innerHTML = state.datalistColumns.map((col, i) => `
    <div class="datalist-column-row" data-index="${i}">
      <input type="checkbox" class="datalist-col-visible" ${col.visible ? 'checked' : ''}>
      <span class="datalist-col-field">${col.field}</span>
      <input type="text" class="fr-input fr-input--sm datalist-col-label" value="${col.label}" placeholder="Label">
      <input type="checkbox" class="datalist-col-filtrable" ${col.filtrable ? 'checked' : ''}> <small>Filtrable</small>
    </div>
  `).join('');

  openModal('datalist-columns-modal');
}

/**
 * Read modal inputs and save column config back to state.
 */
export function saveColumnsModal(): void {
  const rows = document.querySelectorAll('#datalist-columns-list .datalist-column-row');
  const columns: DatalistColumn[] = [];

  rows.forEach(row => {
    const index = parseInt(row.getAttribute('data-index') || '0', 10);
    const original = state.datalistColumns[index];
    if (!original) return;

    const visible = (row.querySelector('.datalist-col-visible') as HTMLInputElement)?.checked ?? true;
    const label = (row.querySelector('.datalist-col-label') as HTMLInputElement)?.value || original.field;
    const filtrable = (row.querySelector('.datalist-col-filtrable') as HTMLInputElement)?.checked ?? false;

    columns.push({ field: original.field, label, visible, filtrable });
  });

  state.datalistColumns = columns;
  closeModal('datalist-columns-modal');
}

/**
 * Setup event listeners for datalist config checkboxes and columns button.
 */
export function setupDatalistListeners(): void {
  const rechercheEl = document.getElementById('datalist-recherche') as HTMLInputElement | null;
  const filtresEl = document.getElementById('datalist-filtres') as HTMLInputElement | null;
  const exportEl = document.getElementById('datalist-export') as HTMLInputElement | null;
  const exportHtmlEl = document.getElementById('datalist-export-html') as HTMLInputElement | null;
  const columnsBtn = document.getElementById('datalist-columns-btn');
  const saveBtn = document.getElementById('datalist-columns-save');
  const closeBtn = document.getElementById('datalist-columns-close');

  if (rechercheEl) {
    rechercheEl.addEventListener('change', () => {
      state.datalistRecherche = rechercheEl.checked;

    });
  }

  if (filtresEl) {
    filtresEl.addEventListener('change', () => {
      state.datalistFiltres = filtresEl.checked;

    });
  }

  if (exportEl) {
    exportEl.addEventListener('change', () => {
      state.datalistExportCsv = exportEl.checked;

    });
  }

  if (exportHtmlEl) {
    exportHtmlEl.addEventListener('change', () => {
      state.datalistExportHtml = exportHtmlEl.checked;

    });
  }

  if (columnsBtn) {
    columnsBtn.addEventListener('click', openColumnsModal);
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', saveColumnsModal);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeModal('datalist-columns-modal'));
  }

  setupModalOverlayClose('datalist-columns-modal');
}
