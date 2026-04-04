/**
 * Field dropdown population logic.
 * Separated from sources.ts to avoid circular dependencies.
 */

import { state } from './state.js';

/**
 * Populate label/value/code field dropdowns from state.fields.
 */
export function populateFieldSelects(): void {
  const labelSelect = document.getElementById('label-field') as HTMLSelectElement | null;
  const valueSelect = document.getElementById('value-field') as HTMLSelectElement | null;
  const codeSelect = document.getElementById('code-field') as HTMLSelectElement | null;

  if (!labelSelect || !valueSelect || !codeSelect) return;

  // Clear
  labelSelect.innerHTML = '<option value="">\u2014 S\u00e9lectionner \u2014</option>';
  valueSelect.innerHTML = '<option value="">\u2014 S\u00e9lectionner \u2014</option>';
  codeSelect.innerHTML = '<option value="">\u2014 S\u00e9lectionner \u2014</option>';

  state.fields.forEach((field) => {
    const displayText = field.displayName
      ? `${field.displayName} (${field.type})`
      : `${field.name} (${field.type})`;

    const optionLabel = document.createElement('option');
    optionLabel.value = field.name;
    optionLabel.textContent = displayText;
    labelSelect.appendChild(optionLabel);

    const optionValue = document.createElement('option');
    optionValue.value = field.name;
    optionValue.textContent = displayText;
    valueSelect.appendChild(optionValue);

    // Add string/number fields to code select (department codes can be strings like "2A" or numbers)
    if (field.type === 'string' || field.type === 'number') {
      const optionCode = document.createElement('option');
      optionCode.value = field.name;
      optionCode.textContent = displayText;
      codeSelect.appendChild(optionCode);
    }
  });

  // Auto-select good candidates
  const fieldNameLower = (f: { displayName?: string; name: string }): string =>
    (f.displayName || f.name).toLowerCase();

  const stringField = state.fields.find(
    (f) =>
      f.type === 'string' &&
      (fieldNameLower(f).includes('nom') ||
        fieldNameLower(f).includes('region') ||
        fieldNameLower(f).includes('departement') ||
        fieldNameLower(f).includes('label'))
  );
  const numberField = state.fields.find(
    (f) =>
      f.type === 'number' &&
      (fieldNameLower(f).includes('prix') ||
        fieldNameLower(f).includes('score') ||
        fieldNameLower(f).includes('valeur') ||
        fieldNameLower(f).includes('value'))
  );
  // Auto-select code field for maps (look for code_dept, departement, code_insee, etc.)
  const codeField = state.fields.find(
    (f) =>
      (f.type === 'string' || f.type === 'number') &&
      (fieldNameLower(f).includes('code') ||
        fieldNameLower(f).includes('dept') ||
        fieldNameLower(f).includes('departement') ||
        fieldNameLower(f).includes('insee'))
  );

  if (stringField) labelSelect.value = stringField.name;
  if (numberField) valueSelect.value = numberField.name;
  if (codeField) codeSelect.value = codeField.name;

  // Re-populate existing extra series selects
  refreshExtraSeriesSelects();
}

/**
 * Build options HTML for an extra series field select.
 */
export function buildSeriesFieldOptions(): string {
  let html = '<option value="">\u2014 S\u00e9lectionner \u2014</option>';
  state.fields.forEach((field) => {
    const displayText = field.displayName
      ? `${field.displayName} (${field.type})`
      : `${field.name} (${field.type})`;
    html += `<option value="${field.name}">${displayText}</option>`;
  });
  return html;
}

/**
 * Refresh all extra series field selects with current fields.
 */
export function refreshExtraSeriesSelects(): void {
  const container = document.getElementById('extra-series-container');
  if (!container) return;
  const selects = container.querySelectorAll<HTMLSelectElement>('.extra-series-field');
  selects.forEach((select) => {
    const currentValue = select.value;
    select.innerHTML = buildSeriesFieldOptions();
    if (currentValue) select.value = currentValue;
  });
}
