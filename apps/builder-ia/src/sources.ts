/**
 * Data source loading, selection and field analysis
 */

import { loadFromStorage, STORAGE_KEYS, escapeHtml, openModal, closeModal, setupModalOverlayClose, migrateSource, SAMPLE_DATASETS } from '@dsfr-data/shared';
import { state } from './state.js';
import type { Source, Field } from './state.js';
import { addMessage } from './chat/chat.js';

/**
 * Load saved sources from localStorage and populate the dropdown
 */
export function loadSavedSources(): void {
  const select = document.getElementById('saved-source') as HTMLSelectElement;
  select.innerHTML = '<option value="">-- Choisir une source --</option>';

  const sources = loadFromStorage<Source[]>(STORAGE_KEYS.SOURCES, []).map(migrateSource);
  const selectedSource = (() => { const s = loadFromStorage<Source | null>(STORAGE_KEYS.SELECTED_SOURCE, null); return s ? migrateSource(s) : null; })();

  // Add sample datasets
  const sampleGroup = document.createElement('optgroup');
  sampleGroup.label = 'Donn\u00e9es d\'exemple';
  SAMPLE_DATASETS.forEach(ds => {
    const option = document.createElement('option');
    option.value = `sample:${ds.id}`;
    option.textContent = `\uD83D\uDCCA ${ds.name}`;
    const sampleSource: Source = {
      id: `sample-${ds.id}`,
      name: ds.name,
      type: 'manual',
      data: ds.rows as Record<string, unknown>[],
      recordCount: ds.rows.length,
    };
    option.dataset.source = JSON.stringify(sampleSource);
    sampleGroup.appendChild(option);
  });
  select.appendChild(sampleGroup);

  sources.forEach(source => {
    const option = document.createElement('option');
    option.value = source.id;
    const badge = source.type === 'grist' ? '\uD83D\uDFE2' : source.type === 'manual' ? '\uD83D\uDFE3' : '\uD83D\uDD35';
    option.textContent = `${badge} ${source.name}`;
    option.dataset.source = JSON.stringify(source);
    select.appendChild(option);
  });

  // Check for recently selected source
  if (selectedSource && selectedSource.data) {
    let found = false;
    for (const opt of Array.from(select.options)) {
      if (opt.value === selectedSource.id) {
        opt.selected = true;
        found = true;
        break;
      }
    }
    if (!found) {
      const option = document.createElement('option');
      option.value = selectedSource.id;
      const badge = selectedSource.type === 'grist' ? '\uD83D\uDFE2' : '\uD83D\uDFE3';
      option.textContent = `${badge} ${selectedSource.name} (recent)`;
      option.dataset.source = JSON.stringify(selectedSource);
      option.selected = true;
      select.appendChild(option);
    }
    handleSourceChange();
  }
}

/**
 * Handle source dropdown change event
 */
export function handleSourceChange(): void {
  const select = document.getElementById('saved-source') as HTMLSelectElement;
  const selectedOption = select.options[select.selectedIndex];
  const infoEl = document.getElementById('saved-source-info') as HTMLElement;

  if (!selectedOption || !selectedOption.dataset.source) {
    state.source = null;
    state.localData = null;
    state.fields = [];
    infoEl.innerHTML = '';
    updateFieldsList();
    return;
  }

  const source: Source = JSON.parse(selectedOption.dataset.source);
  state.source = source;

  const badge = source.type === 'grist' ? 'source-badge-grist' : source.type === 'manual' ? 'source-badge-manual' : 'source-badge-api';
  const badgeText = source.type === 'grist' ? 'Grist' : source.type === 'manual' ? 'Manuel' : 'API';

  infoEl.innerHTML = `
    <span class="source-badge ${badge}">${badgeText}</span>
    ${source.recordCount || source.data?.length || '?'} enregistrements
  `;

  if (source.data && source.data.length > 0) {
    state.localData = source.data;
    analyzeFields();
    updateFieldsList();
    updateRawData();

    // Build contextual suggestions based on field types
    const numericFields = state.fields.filter(f => f.type === 'numerique');
    const textFields = state.fields.filter(f => f.type === 'texte');
    const dateFields = state.fields.filter(f => f.type === 'date');
    const suggestions: string[] = [];

    if (numericFields.length > 0 && textFields.length > 0) {
      suggestions.push(`Barres de ${numericFields[0].name} par ${textFields[0].name}`);
    }
    if (dateFields.length > 0 && numericFields.length > 0) {
      suggestions.push(`Evolution de ${numericFields[0].name}`);
    }
    if (numericFields.length > 0) {
      suggestions.push(`KPI sur ${numericFields[0].name}`);
    }
    if (textFields.length >= 2) {
      suggestions.push('Tableau avec filtres');
    }
    // Fallback if no smart suggestions could be built
    if (suggestions.length === 0) {
      suggestions.push('Barres', 'Tableau', 'KPI');
    }

    // Inform the chat
    addMessage('assistant', `Source "${source.name}" chargee (${source.data.length} lignes, ${state.fields.length} champs). Que voulez-vous visualiser ?`, suggestions.slice(0, 3));

    // Update status: show "Voir les donnees" button
    const statusEl = document.getElementById('fields-status');
    if (statusEl) {
      statusEl.innerHTML = '<button class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline source-btn" id="show-data-preview-btn"><i class="ri-database-2-line"></i> Voir</button>';
      document.getElementById('show-data-preview-btn')?.addEventListener('click', showDataPreview);
    }
  }
}

/**
 * Button click handler to load saved source data
 */
export function loadSavedSourceData(): void {
  const select = document.getElementById('saved-source') as HTMLSelectElement;
  if (!select.value) {
    const statusEl = document.getElementById('fields-status');
    if (statusEl) {
      statusEl.innerHTML = '<span class="fr-badge fr-badge--warning fr-badge--sm">Selectionner</span>';
    }
    return;
  }
  handleSourceChange();
}

/**
 * Analyze fields from the first record, scanning for types
 */
export function analyzeFields(): void {
  if (!state.localData || state.localData.length === 0) return;

  const record = state.localData[0];
  state.fields = Object.keys(record).map(key => {
    let value = record[key];

    // If first record has null, scan other records to find actual type
    if (value === null && state.localData!.length > 1) {
      for (let i = 1; i < Math.min(state.localData!.length, 100); i++) {
        const val = state.localData![i][key];
        if (val !== null && val !== undefined) {
          value = val;
          break;
        }
      }
    }

    const type = typeof value;
    let fieldType: string;
    if (value === null) {
      fieldType = 'texte'; // Default to text for null-only fields
    } else if (type === 'number') {
      fieldType = 'numerique';
    } else if (type === 'string') {
      if (!isNaN(Date.parse(value as string))) {
        fieldType = 'date';
      } else {
        fieldType = 'texte';
      }
    } else {
      fieldType = 'texte';
    }

    return { name: key, type: fieldType, sample: value } as Field;
  });
}

/**
 * Render field tags in the DOM
 */
export function updateFieldsList(): void {
  const container = document.getElementById('field-list') as HTMLElement;
  if (state.fields.length === 0) {
    container.innerHTML = '<span style="color: var(--text-mention-grey); font-size: 0.8rem;">Selectionnez une source de donnees</span>';
    return;
  }

  container.innerHTML = state.fields.map(f => {
    const isNumeric = f.type === 'numerique';
    return `<span class="field-tag ${isNumeric ? 'numeric' : ''}">${f.name} <small>(${f.type})</small></span>`;
  }).join('');
}

/**
 * Show first 50 records as JSON in the raw data panel
 */
export function updateRawData(): void {
  const pre = document.getElementById('raw-data') as HTMLPreElement;
  if (state.localData) {
    pre.textContent = JSON.stringify(state.localData.slice(0, 50), null, 2);
  }
}

/**
 * Open the data preview modal with a table of the first 20 records
 */
export function showDataPreview(): void {
  const body = document.getElementById('data-preview-body');
  if (!body || !state.localData || state.localData.length === 0) return;

  const data = state.localData;
  const keys = Object.keys(data[0]);
  const previewRows = data.slice(0, 20);

  const headerCells = keys.map(k => `<th style="white-space:nowrap;font-size:0.8rem;">${escapeHtml(k)}</th>`).join('');
  const bodyRows = previewRows.map(row => {
    const cells = keys.map(k => {
      const val = row[k];
      const str = val === null || val === undefined ? '\u2014' : String(val);
      const truncated = str.length > 60 ? str.slice(0, 57) + '...' : str;
      return `<td style="font-size:0.8rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(truncated)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  body.innerHTML = `
    <p class="fr-text--sm fr-mb-1w">${data.length} enregistrement(s), ${keys.length} champs \u2014 apercu des 20 premiers</p>
    <div style="overflow-x:auto;">
      <table class="fr-table fr-table--sm" style="font-size:0.8rem;">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;

  openModal('data-preview-modal');
}

/**
 * Initialize the data preview modal close handlers
 */
export function initDataPreviewModal(): void {
  setupModalOverlayClose('data-preview-modal');
  document.getElementById('data-preview-close')?.addEventListener('click', () => closeModal('data-preview-modal'));
}
