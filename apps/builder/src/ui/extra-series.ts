/**
 * Extra séries management for multi-séries charts.
 * Handles adding, removing, and rendering extra séries field selectors.
 */

import { state } from '../state.js';
import { buildSeriesFieldOptions } from '../sources-fields.js';

let seriesCounter = 0;

/**
 * Add a new extra séries to the UI and state.
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
        Série ${index + 2}
        <span class="fr-hint-text">Champ numérique</span>
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
      <input type="text" class="fr-input fr-input--sm extra-series-label" id="extra-series-label-${seriesCounter}" placeholder="Nom de la série">
    </div>
    <button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline remove-series-btn" title="Supprimer cette série" style="margin-bottom: 2px;">
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
 * Remove an extra séries row from the UI and state.
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
 * Renumber séries labels after removal.
 */
function renumberSeriesRows(): void {
  const container = document.getElementById('extra-series-container');
  if (!container) return;
  Array.from(container.children).forEach((row, index) => {
    const label = row.querySelector('.fr-select-group .fr-label');
    if (label) {
      const hint = label.querySelector('.fr-hint-text');
      label.childNodes[0].textContent = `Série ${index + 2} `;
      if (!hint) {
        label.innerHTML = `Série ${index + 2} <span class="fr-hint-text">Champ numérique</span>`;
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
 * Restore extra séries UI from state (e.g. when loading favorites).
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

  seriesToRestore.forEach((séries) => {
    addExtraSeries();
    const rows = container.children;
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      const fieldSelect = lastRow.querySelector('.extra-series-field') as HTMLSelectElement;
      const labelInput = lastRow.querySelector('.extra-series-label') as HTMLInputElement;
      if (fieldSelect && séries.field) fieldSelect.value = séries.field;
      if (labelInput && séries.label) labelInput.value = séries.label;
      // Update state entry
      const idx = state.extraSeries.length - 1;
      state.extraSeries[idx] = { ...séries };
    }
  });
  syncValueField2();
}
