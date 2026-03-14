/**
 * Facets configuration: modal field picker, toggle, and input listeners.
 */

import { state, type FacetFieldConfig } from '../state.js';
import { openModal, closeModal, setupModalOverlayClose } from '@dsfr-data/shared';

/**
 * Initialize facets fields from current state.fields (all inactive by default).
 * Preserves existing config if fields haven't changed.
 */
export function initFacetsFields(): void {
  if (state.fields.length === 0) return;

  const currentFieldNames = state.fields.map(f => f.name);
  const existingFieldNames = state.facetsConfig.fields.map(c => c.field);

  // Skip if already initialized with the same fields
  if (
    existingFieldNames.length > 0 &&
    existingFieldNames.length === currentFieldNames.length &&
    existingFieldNames.every((f, i) => f === currentFieldNames[i])
  ) {
    return;
  }

  state.facetsConfig.fields = state.fields.map(f => ({
    field: f.name,
    label: f.name,
    display: 'checkbox' as const,
    searchable: false,
    disjunctive: false,
  }));
}

/**
 * Open the facets field configuration modal.
 */
export function openFacetsModal(): void {
  if (state.facetsConfig.fields.length === 0) {
    initFacetsFields();
  }

  const listEl = document.getElementById('facets-fields-list');
  if (!listEl) return;

  // Find which fields are active (have been selected)
  const activeFieldNames = new Set(
    state.facetsConfig.fields.filter(f => f.field).map(f => f.field)
  );

  const rows = state.fields.map((field) => {
    const config = state.facetsConfig.fields.find(c => c.field === field.name);
    const isActive = config && activeFieldNames.has(field.name);
    const label = config?.label || field.name;
    const display = config?.display || 'checkbox';
    const searchable = config?.searchable || false;
    const disjunctive = config?.disjunctive || false;

    return `
    <tr data-field="${field.name}">
      <td><input type="checkbox" class="facets-field-active" ${isActive ? 'checked' : ''}></td>
      <td><code>${field.name}</code></td>
      <td><input type="text" class="fr-input fr-input--sm facets-field-label" value="${label}" placeholder="Label"></td>
      <td><select class="fr-select fr-select--sm facets-field-display">
        <option value="checkbox" ${display === 'checkbox' ? 'selected' : ''}>Cases a cocher</option>
        <option value="radio" ${display === 'radio' ? 'selected' : ''}>Boutons radio</option>
        <option value="select" ${display === 'select' ? 'selected' : ''}>Liste deroulante</option>
        <option value="multiselect" ${display === 'multiselect' ? 'selected' : ''}>Multi-selection</option>
      </select></td>
      <td class="text-center"><input type="checkbox" class="facets-field-searchable" ${searchable ? 'checked' : ''}></td>
      <td class="text-center"><input type="checkbox" class="facets-field-disjunctive" ${disjunctive ? 'checked' : ''}></td>
    </tr>`;
  }).join('');

  listEl.innerHTML = `
    <div class="facets-toolbar">
      <button class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm" id="facets-select-all" type="button">Tout selectionner</button>
      <button class="fr-btn fr-btn--tertiary-no-outline fr-btn--sm" id="facets-select-none" type="button">Tout deselectionner</button>
    </div>
    <table class="fr-table fr-table--no-caption facets-table">
      <thead>
        <tr>
          <th></th>
          <th>Champ</th>
          <th>Label</th>
          <th>Affichage</th>
          <th>Recherche</th>
          <th>Multi (OU)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  // Toolbar actions
  document.getElementById('facets-select-all')?.addEventListener('click', () => {
    listEl.querySelectorAll<HTMLInputElement>('.facets-field-active').forEach(cb => cb.checked = true);
  });
  document.getElementById('facets-select-none')?.addEventListener('click', () => {
    listEl.querySelectorAll<HTMLInputElement>('.facets-field-active').forEach(cb => cb.checked = false);
  });

  openModal('facets-fields-modal');
}

/**
 * Read modal inputs and save facet field config back to state.
 */
export function saveFacetsModal(): void {
  const rows = document.querySelectorAll('#facets-fields-list tr[data-field]');
  const fields: FacetFieldConfig[] = [];

  rows.forEach(row => {
    const fieldName = row.getAttribute('data-field') || '';
    const active = (row.querySelector('.facets-field-active') as HTMLInputElement)?.checked ?? false;

    if (!active) return; // Only keep active fields

    const label = (row.querySelector('.facets-field-label') as HTMLInputElement)?.value || fieldName;
    const display = (row.querySelector('.facets-field-display') as HTMLSelectElement)?.value as FacetFieldConfig['display'] || 'checkbox';
    const searchable = (row.querySelector('.facets-field-searchable') as HTMLInputElement)?.checked ?? false;
    const disjunctive = (row.querySelector('.facets-field-disjunctive') as HTMLInputElement)?.checked ?? false;

    fields.push({ field: fieldName, label, display, searchable, disjunctive });
  });

  state.facetsConfig.fields = fields;
  closeModal('facets-fields-modal');
  updateFacetsSummary();
}

/**
 * Update the summary text showing how many facets are configured.
 */
export function updateFacetsSummary(): void {
  const summaryEl = document.getElementById('facets-fields-summary');
  if (!summaryEl) return;

  const count = state.facetsConfig.fields.length;
  if (count === 0) {
    summaryEl.textContent = 'Aucun champ configure';
  } else if (count === 1) {
    summaryEl.textContent = `1 facette configuree (${state.facetsConfig.fields[0].field})`;
  } else {
    summaryEl.textContent = `${count} facettes configurees (${state.facetsConfig.fields.map(f => f.field).join(', ')})`;
  }
}

/**
 * Setup event listeners for facets config inputs.
 */
export function setupFacetsListeners(): void {
  const enabledToggle = document.getElementById('facets-enabled') as HTMLInputElement | null;
  const options = document.getElementById('facets-options');

  if (enabledToggle) {
    enabledToggle.addEventListener('change', () => {
      state.facetsConfig.enabled = enabledToggle.checked;
      if (options) options.style.display = enabledToggle.checked ? 'block' : 'none';
    });
  }

  const fieldsBtn = document.getElementById('facets-fields-btn');
  if (fieldsBtn) {
    fieldsBtn.addEventListener('click', openFacetsModal);
  }

  const saveBtn = document.getElementById('facets-fields-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveFacetsModal);
  }

  const closeBtn = document.getElementById('facets-fields-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeModal('facets-fields-modal'));
  }

  setupModalOverlayClose('facets-fields-modal');

  const maxValuesEl = document.getElementById('facets-max-values') as HTMLInputElement | null;
  if (maxValuesEl) {
    maxValuesEl.addEventListener('input', () => {
      state.facetsConfig.maxValues = parseInt(maxValuesEl.value, 10) || 6;
    });
  }

  const sortEl = document.getElementById('facets-sort') as HTMLSelectElement | null;
  if (sortEl) {
    sortEl.addEventListener('change', () => {
      state.facetsConfig.sort = sortEl.value;
    });
  }

  const hideEmptyEl = document.getElementById('facets-hide-empty') as HTMLInputElement | null;
  if (hideEmptyEl) {
    hideEmptyEl.addEventListener('change', () => {
      state.facetsConfig.hideEmpty = hideEmptyEl.checked;
    });
  }
}
