/**
 * Extra series management for multi-series charts.
 * Handles adding, removing, and rendering extra series field selectors.
 */

import { state } from '../state.js';
import { buildSeriesFieldOptions } from '../sources-fields.js';

let seriesCounter = 0;

/**
 * Add a new extra series to the UI and state.
 */
export function addExtraSeries(): void {
  seriesCounter++;
  const index = state.extraSeries.length;
  state.extraSeries.push({ field: '', label: '' });

  const container = document.getElementById('extra-series-container');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'extra-series-row fr-mt-1w';
  row.dataset.seriesIndex = String(index);
  row.style.cssText = 'display: flex; gap: 0.5rem; align-items: flex-end;';

  row.innerHTML = `
    <div class="fr-select-group fr-select-group--sm" style="flex: 1; margin-bottom: 0;">
      <label class="fr-label" for="extra-series-field-${seriesCounter}">
        Serie ${index + 2}
        <span class="fr-hint-text">Champ numerique</span>
      </label>
      <select class="fr-select extra-series-field" id="extra-series-field-${seriesCounter}">
        ${buildSeriesFieldOptions()}
      </select>
    </div>
    <div class="fr-input-group fr-input-group--sm" style="flex: 1; margin-bottom: 0;">
      <label class="fr-label" for="extra-series-label-${seriesCounter}">
        Libelle
        <span class="fr-hint-text">Nom affiche (vide = nom du champ)</span>
      </label>
      <input type="text" class="fr-input fr-input--sm extra-series-label" id="extra-series-label-${seriesCounter}" placeholder="Nom de la serie">
    </div>
    <button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline remove-series-btn" title="Supprimer cette serie" style="margin-bottom: 2px;">
      <i class="ri-delete-bin-line"></i>
    </button>
  `;

  // Event listeners
  const fieldSelect = row.querySelector('.extra-series-field') as HTMLSelectElement;
  const labelInput = row.querySelector('.extra-series-label') as HTMLInputElement;
  const removeBtn = row.querySelector('.remove-series-btn') as HTMLButtonElement;

  fieldSelect.addEventListener('change', () => {
    const idx = getRowIndex(row);
    if (idx >= 0 && idx < state.extraSeries.length) {
      state.extraSeries[idx].field = fieldSelect.value;
      syncValueField2();
    }
  });

  labelInput.addEventListener('input', () => {
    const idx = getRowIndex(row);
    if (idx >= 0 && idx < state.extraSeries.length) {
      state.extraSeries[idx].label = labelInput.value;
    }
  });

  removeBtn.addEventListener('click', () => {
    removeExtraSeries(row);
  });

  container.appendChild(row);
}

/**
 * Remove an extra series row from the UI and state.
 */
function removeExtraSeries(row: HTMLElement): void {
  const idx = getRowIndex(row);
  if (idx >= 0 && idx < state.extraSeries.length) {
    state.extraSeries.splice(idx, 1);
  }
  row.remove();
  renumberSeriesRows();
  syncValueField2();
}

/**
 * Get the current index of a row within the container.
 */
function getRowIndex(row: HTMLElement): number {
  const container = document.getElementById('extra-series-container');
  if (!container) return -1;
  return Array.from(container.children).indexOf(row);
}

/**
 * Renumber series labels after removal.
 */
function renumberSeriesRows(): void {
  const container = document.getElementById('extra-series-container');
  if (!container) return;
  Array.from(container.children).forEach((row, index) => {
    const label = row.querySelector('.fr-select-group .fr-label');
    if (label) {
      const hint = label.querySelector('.fr-hint-text');
      label.childNodes[0].textContent = `Serie ${index + 2} `;
      if (!hint) {
        label.innerHTML = `Serie ${index + 2} <span class="fr-hint-text">Champ numerique</span>`;
      }
    }
  });
}

/**
 * Keep state.valueField2 in sync with extraSeries[0] for backward compatibility.
 */
function syncValueField2(): void {
  state.valueField2 = state.extraSeries.length > 0 ? state.extraSeries[0].field : '';
}

/**
 * Restore extra series UI from state (e.g. when loading favorites).
 */
export function restoreExtraSeriesFromState(): void {
  const container = document.getElementById('extra-series-container');
  if (!container) return;
  container.innerHTML = '';
  seriesCounter = 0;

  // Migrate from old valueField2 if extraSeries is empty
  if (state.extraSeries.length === 0 && state.valueField2) {
    state.extraSeries = [{ field: state.valueField2, label: '' }];
  }

  const seriesToRestore = [...state.extraSeries];
  state.extraSeries = [];

  seriesToRestore.forEach((series) => {
    addExtraSeries();
    const rows = container.children;
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      const fieldSelect = lastRow.querySelector('.extra-series-field') as HTMLSelectElement;
      const labelInput = lastRow.querySelector('.extra-series-label') as HTMLInputElement;
      if (fieldSelect && series.field) fieldSelect.value = series.field;
      if (labelInput && series.label) labelInput.value = series.label;
      // Update state entry
      const idx = state.extraSeries.length - 1;
      state.extraSeries[idx] = { ...series };
    }
  });
  syncValueField2();
}
