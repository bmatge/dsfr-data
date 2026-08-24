/**
 * Field dropdown population logic.
 * Separated from sources.ts to avoid circular dependencies.
 */

import { state } from './state.js';
import { updateMapCodeFieldWarning } from './ui/ui-helpers.js';
import { fieldCardinality } from './ui/smart-guard.js';

/**
 * Libellé enrichi d'un champ : « nom (type · N valeurs) » (refonte v2).
 * La cardinalité est calculée sur l'échantillon chargé ; on ne l'affiche que
 * pour les champs texte (c'est là qu'elle guide le choix de l'axe X).
 */
function fieldDisplayText(field: { name: string; displayName?: string; type: string }): string {
  const base = field.displayName || field.name;
  if (field.type === 'string') {
    const n = fieldCardinality(field.name);
    if (n > 0) return `${base} (texte · ${n.toLocaleString('fr-FR')} valeur${n > 1 ? 's' : ''})`;
  }
  return `${base} (${field.type})`;
}

/**
 * Populate label/value/code field dropdowns from state.fields.
 */
export function populateFieldSelects(): void {
  const labelSelect = document.getElementById('label-field') as HTMLSelectElement | null;
  const valueSelect = document.getElementById('value-field') as HTMLSelectElement | null;
  const codeSelect = document.getElementById('code-field') as HTMLSelectElement | null;
  const sortFieldSelect = document.getElementById('sort-field') as HTMLSelectElement | null;

  if (!labelSelect || !valueSelect || !codeSelect) return;

  // Clear
  labelSelect.innerHTML = '<option value="">\u2014 S\u00e9lectionner \u2014</option>';
  valueSelect.innerHTML = '<option value="">\u2014 S\u00e9lectionner \u2014</option>';
  codeSelect.innerHTML = '<option value="">\u2014 S\u00e9lectionner \u2014</option>';
  if (sortFieldSelect) sortFieldSelect.innerHTML = '<option value="">Auto (valeur)</option>';

  state.fields.forEach((field) => {
    const displayText = fieldDisplayText(field);

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

    if (sortFieldSelect) {
      const optionSort = document.createElement('option');
      optionSort.value = field.name;
      optionSort.textContent = displayText;
      sortFieldSelect.appendChild(optionSort);
    }
  });

  // Auto-select good candidates
  const fieldNameLower = (f: { displayName?: string; name: string }): string =>
    (f.displayName || f.name).toLowerCase();

  // Smart defaults (T-6 from audit UX 2026-05-26) : 1) prioritise field names
  // matching domain keywords, 2) fall back to "the only candidate" when there
  // is no ambiguity. Saves Marie one click on simple datasets.
  const stringCandidates = state.fields.filter((f) => f.type === 'string');
  const numberCandidates = state.fields.filter((f) => f.type === 'number');

  const stringField =
    stringCandidates.find(
      (f) =>
        fieldNameLower(f).includes('nom') ||
        fieldNameLower(f).includes('region') ||
        fieldNameLower(f).includes('departement') ||
        fieldNameLower(f).includes('label')
    ) ?? (stringCandidates.length === 1 ? stringCandidates[0] : undefined);

  const numberField =
    numberCandidates.find(
      (f) =>
        fieldNameLower(f).includes('prix') ||
        fieldNameLower(f).includes('score') ||
        fieldNameLower(f).includes('valeur') ||
        fieldNameLower(f).includes('value')
    ) ?? (numberCandidates.length === 1 ? numberCandidates[0] : undefined);

  // Auto-select code field for maps (look for code_dept, departement, code_insee, etc.)
  const codeField = state.fields.find(
    (f) =>
      (f.type === 'string' || f.type === 'number') &&
      (fieldNameLower(f).includes('code') ||
        fieldNameLower(f).includes('dept') ||
        fieldNameLower(f).includes('departement') ||
        fieldNameLower(f).includes('insee'))
  );

  if (stringField) {
    labelSelect.value = stringField.name;
    state.labelField = stringField.name;
  }
  if (numberField) {
    valueSelect.value = numberField.name;
    state.valueField = numberField.name;
  }
  if (codeField) {
    codeSelect.value = codeField.name;
    state.codeField = codeField.name;
  }

  // Re-populate existing extra séries selects
  refreshExtraSeriesSelects();

  // Re-evaluate the "no INSEE codes" warning now that the field list changed.
  updateMapCodeFieldWarning();

  // Refonte v2 : une source vient d'être chargée — déplier les étapes
  // suivantes (Type + Données) pour enchaîner sans clic supplémentaire.
  document.getElementById('section-type')?.classList.remove('collapsed');
  document.getElementById('section-data')?.classList.remove('collapsed');

  // Refonte v2 : les consommateurs de la liste de champs (builder de filtres…)
  // se resynchronisent sur cet évènement.
  document.dispatchEvent(new CustomEvent('builder:fields-updated'));
}

/**
 * Build options HTML for an extra séries field select.
 */
export function buildSeriesFieldOptions(): string {
  let html = '<option value="">\u2014 S\u00e9lectionner \u2014</option>';
  state.fields.forEach((field) => {
    html += `<option value="${field.name}">${fieldDisplayText(field)}</option>`;
  });
  return html;
}

/**
 * Refresh all extra séries field selects with current fields.
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
