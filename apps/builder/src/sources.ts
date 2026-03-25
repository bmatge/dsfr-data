/**
 * Source loading and management.
 * Handles saved sources from localStorage, field extraction,
 * and favorite state restoration.
 */

import { loadFromStorage, STORAGE_KEYS, appHref, fetchWithTimeout, httpErrorMessage, escapeHtml, openModal, closeModal, setupModalOverlayClose, migrateSource } from '@dsfr-data/shared';
import { state, type Source, type Field } from './state.js';
import { selectChartType } from './ui/chart-type-selector.js';
import { populateFieldSelects } from './sources-fields.js';
import { generateCodeForLocalData } from './ui/code-generator.js';
import { updateMiddlewareSections, autoEnableNormalizeForGrist } from './ui/normalize-config.js';
import { restoreExtraSeriesFromState } from './ui/extra-series.js';

/**
 * Load saved sources from localStorage and populate the dropdown.
 */
export function loadSavedSources(): void {
  const panel = document.getElementById('source-panel-saved');
  if (!panel) return;

  const sources = loadFromStorage<Source[]>(STORAGE_KEYS.SOURCES, []).map(migrateSource);
  const selectedSource = (() => { const s = loadFromStorage<Source | null>(STORAGE_KEYS.SELECTED_SOURCE, null); return s ? migrateSource(s) : null; })();

  // Check if there are any sources
  const hasAnySources = sources.length > 0 ||
    (selectedSource && selectedSource.data && selectedSource.data.length > 0);

  if (!hasAnySources) {
    // Show empty state message
    const selectGroup = panel.querySelector('.fr-select-group') as HTMLElement | null;
    const infoEl = document.getElementById('saved-source-info');
    if (selectGroup) selectGroup.style.display = 'none';
    if (infoEl) infoEl.innerHTML = '';

    // Add empty message if not already present
    if (!panel.querySelector('.empty-sources-message')) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'empty-sources-message fr-mt-1w';
      emptyMsg.innerHTML = `
        <p><i class="ri-database-2-line" style="font-size: 2rem; display: block; margin-bottom: 0.5rem;"></i></p>
        <p>Aucune source de donn\u00e9es enregistr\u00e9e</p>
        <a href="${appHref('sources')}" class="fr-btn fr-btn--sm fr-btn--secondary fr-mt-1w">
          <i class="ri-add-line"></i> Ajouter une source
        </a>
      `;
      panel.insertBefore(emptyMsg, panel.firstChild);
    }
    return;
  }

  // Remove empty message if present
  const emptyMsg = panel.querySelector('.empty-sources-message');
  if (emptyMsg) emptyMsg.remove();

  // Show select group
  const selectGroup = panel.querySelector('.fr-select-group') as HTMLElement | null;
  if (selectGroup) selectGroup.style.display = 'block';

  const select = document.getElementById('saved-source') as HTMLSelectElement | null;
  if (!select) return;

  select.innerHTML = '<option value="">\u2014 Choisir une source \u2014</option>';

  // Add saved sources
  sources.forEach((source: Source) => {
    const option = document.createElement('option');
    option.value = source.id;
    const badge = source.type === 'grist' ? '\uD83D\uDFE2 Grist' : source.type === 'manual' ? '\uD83D\uDFE3 Manuel' : '\uD83D\uDD35 API';
    option.textContent = `${badge} ${source.name}`;
    option.dataset.source = JSON.stringify(source);
    select.appendChild(option);
  });

  // If we have a selected source from sources.html, add it too if not already there
  if (selectedSource && !sources.find(s => s.id === selectedSource.id)) {
    const option = document.createElement('option');
    option.value = selectedSource.id;
    const badge = selectedSource.type === 'grist' ? '\uD83D\uDFE2 Grist' : selectedSource.type === 'manual' ? '\uD83D\uDFE3 Manuel' : '\uD83D\uDD35 API';
    option.textContent = `${badge} ${selectedSource.name} (r\u00e9cent)`;
    option.dataset.source = JSON.stringify(selectedSource);
    option.selected = true;
    select.appendChild(option);
  }
}

/**
 * Auto-select source if one was pre-selected from sources.html
 */
export function checkSelectedSource(): void {
  const rawSelected = loadFromStorage<Source | null>(STORAGE_KEYS.SELECTED_SOURCE, null);
  const selectedSource = rawSelected ? migrateSource(rawSelected) : null;

  if (selectedSource && selectedSource.data && selectedSource.data.length > 0) {
    // Select the source
    const select = document.getElementById('saved-source') as HTMLSelectElement | null;
    if (!select) return;

    for (const option of Array.from(select.options)) {
      if (option.value === selectedSource.id) {
        option.selected = true;
        break;
      }
    }

    // Trigger the change
    handleSavedSourceChange();

    // Show "Voir les donnees" button
    showDataPreviewButton();
  }
}

/**
 * Handle saved source dropdown change event.
 */
export function handleSavedSourceChange(): void {
  const select = document.getElementById('saved-source') as HTMLSelectElement | null;
  if (!select) return;

  const selectedOption = select.options[select.selectedIndex];
  const infoEl = document.getElementById('saved-source-info');

  if (!selectedOption || !selectedOption.dataset.source) {
    if (infoEl) infoEl.innerHTML = '';
    return;
  }

  const source: Source = JSON.parse(selectedOption.dataset.source);
  state.savedSource = source;

  // Show info
  const badge = source.type === 'grist' ? 'source-badge-grist' : source.type === 'manual' ? 'source-badge-manual' : 'source-badge-api';
  const badgeText = source.type === 'grist' ? 'Grist' : source.type === 'manual' ? 'Manuel' : 'API';

  if (infoEl) {
    infoEl.innerHTML = `
      <span class="source-badge ${badge}">${badgeText}</span>
      ${source.recordCount || '?'} enregistrements
    `;
  }

  // Set apiUrl for API sources (used by generateChart for server-side aggregation)
  if (source.type === 'api' && source.apiUrl) {
    state.apiUrl = source.apiUrl;
  } else {
    state.apiUrl = '';
  }

  // If it has local data, load fields directly
  if (source.data && source.data.length > 0) {
    state.localData = source.data;
    loadFieldsFromLocalData();
  }
}

/**
 * Extract field metadata from local data.
 * Supports Grist raw records and flat data structures.
 */
export function loadFieldsFromLocalData(): void {
  if (!state.localData || state.localData.length === 0) return;

  const source = state.savedSource;
  const record = state.localData[0];

  // Check if this is Grist data with raw records
  if (source?.type === 'grist' && source.rawRecords && source.rawRecords.length > 0) {
    const rawRecord = source.rawRecords[0];
    if (rawRecord && rawRecord.fields) {
      // Use flat field names — dsfr-data-normalize flatten="fields" will promote them
      state.fields = Object.keys(rawRecord.fields).map((key): Field => ({
        name: key,
        fullPath: key,
        displayName: key,
        type: typeof rawRecord.fields[key],
        sample: rawRecord.fields[key],
      }));
      // Auto-enable normalize with flatten for Grist sources
      autoEnableNormalizeForGrist();
    }
  } else {
    // Flat data structure
    // Scan multiple records to find actual type (first non-null value)
    state.fields = Object.keys(record).map((key): Field => {
      let detectedType = typeof record[key];
      let sample = record[key];

      // If first record has null, scan other records to find actual type
      if (sample === null && state.localData && state.localData.length > 1) {
        for (let i = 1; i < Math.min(state.localData.length, 100); i++) {
          const val = state.localData[i][key];
          if (val !== null && val !== undefined) {
            detectedType = typeof val;
            sample = val;
            break;
          }
        }
        // If still null after scanning, assume string (most common for codes)
        if (sample === null) {
          detectedType = 'string';
        }
      }

      return {
        name: key,
        fullPath: key,
        displayName: key,
        type: detectedType,
        sample: sample,
      };
    });
  }

  populateFieldSelects();

  // Show/hide generation mode section based on source type
  const generationModeSection = document.getElementById('section-generation-mode') as HTMLElement | null;
  const dynamicWarning = document.getElementById('dynamic-warning') as HTMLElement | null;

  if (source?.type === 'grist' || source?.type === 'api') {
    if (generationModeSection) generationModeSection.style.display = 'block';
    // Show warning if Grist and not public
    if (dynamicWarning) {
      dynamicWarning.style.display = (source.type === 'grist' && !source.isPublic) ? 'block' : 'none';
    }
    // Default to dynamic mode for sources that support it
    state.generationMode = 'dynamic';
    const dynamicRadio = document.getElementById('mode-dynamic') as HTMLInputElement | null;
    const dynamicOptions = document.getElementById('dynamic-options') as HTMLElement | null;
    if (dynamicRadio) dynamicRadio.checked = true;
    const embeddedRadio = document.getElementById('mode-embedded') as HTMLInputElement | null;
    if (embeddedRadio) embeddedRadio.checked = false;
    if (dynamicOptions) dynamicOptions.style.display = 'none';
  } else {
    if (generationModeSection) generationModeSection.style.display = 'none';
  }

  // Accessibility option is always visible (works for all source types)
  updateMiddlewareSections();

  showDataPreviewButton();
}

/**
 * Load fields by fetching from an API endpoint (fallback when no local data).
 */
export async function loadFields(): Promise<void> {
  const statusEl = document.getElementById('fields-status');

  // Check if we're using saved source with local data
  if (state.localData && state.localData.length > 0) {
    loadFieldsFromLocalData();
    return;
  }

  // Check if we have an API URL (from a saved API source)
  if (!state.apiUrl) {
    if (statusEl) {
      statusEl.innerHTML = '<span class="fr-badge fr-badge--warning fr-badge--sm">S\u00e9lectionner</span>';
    }
    return;
  }

  if (statusEl) {
    statusEl.innerHTML = '<span class="fr-badge fr-badge--info fr-badge--sm">Chargement...</span>';
  }

  try {
    // Fetch one record to get field names
    const url = state.apiUrl + '?limit=1';
    const response = await fetchWithTimeout(url);

    if (!response.ok) throw new Error(httpErrorMessage(response.status));

    const json = await response.json();

    if (!json.results || json.results.length === 0) {
      throw new Error('Aucune donn\u00e9e trouv\u00e9e');
    }

    // Extract fields from first record
    const record = json.results[0] as Record<string, unknown>;
    state.fields = Object.keys(record).map((key): Field => ({
      name: key,
      type: typeof record[key],
      sample: record[key],
    }));

    // Populate dropdowns
    populateFieldSelects();

    if (statusEl) {
      statusEl.innerHTML = `<span class="fr-badge fr-badge--success fr-badge--sm">Source charg\u00e9e</span>`;
    }
  } catch (error) {
    console.error(error);
    const msg = error instanceof Error ? error.message : 'Erreur inconnue';
    if (statusEl) {
      statusEl.innerHTML = `<span class="fr-badge fr-badge--error fr-badge--sm">${msg}</span>`;
    }
  }
}

/**
 * Restore builder state from sessionStorage.
 * Works when coming back from favorites (from=favorites) or playground (from=playground).
 */
export function loadFavoriteState(): void {
  const urlParams = new URLSearchParams(window.location.search);
  const from = urlParams.get('from');
  if (from !== 'favorites' && from !== 'playground') return;

  const savedState = sessionStorage.getItem('builder-state');
  if (!savedState) return;

  try {
    const favoriteState = JSON.parse(savedState);
    sessionStorage.removeItem('builder-state');

    // Restore state
    Object.assign(state, favoriteState);

    // Restore source dropdown selection
    if (state.savedSource) {
      const sourceSelect = document.getElementById('saved-source') as HTMLSelectElement | null;
      if (sourceSelect) {
        let found = false;
        for (const option of Array.from(sourceSelect.options)) {
          if (option.value === state.savedSource.id) {
            option.selected = true;
            found = true;
            break;
          }
        }
        // If source not in dropdown, add it
        if (!found && state.savedSource.id) {
          const option = document.createElement('option');
          option.value = state.savedSource.id;
          option.textContent = state.savedSource.name || state.savedSource.id;
          option.dataset.source = JSON.stringify(state.savedSource);
          option.selected = true;
          sourceSelect.appendChild(option);
        }
        // Update source info display
        const infoEl = document.getElementById('saved-source-info');
        if (infoEl) {
          const source = state.savedSource;
          const badge = source.type === 'grist' ? 'source-badge-grist' : source.type === 'manual' ? 'source-badge-manual' : 'source-badge-api';
          const badgeText = source.type === 'grist' ? 'Grist' : source.type === 'manual' ? 'Manuel' : 'API';
          infoEl.innerHTML = `<span class="source-badge ${badge}">${badgeText}</span> ${source.recordCount || '?'} enregistrements`;
        }
      }
    }

    // Update UI
    selectChartType(state.chartType);

    const titleInput = document.getElementById('chart-title') as HTMLInputElement | null;
    const subtitleInput = document.getElementById('chart-subtitle') as HTMLInputElement | null;
    const paletteSelect = document.getElementById('chart-palette') as HTMLSelectElement | null;

    if (titleInput) titleInput.value = state.title || '';
    if (subtitleInput) subtitleInput.value = state.subtitle || '';
    if (paletteSelect) paletteSelect.value = state.palette || 'categorical';

    // Restore generation mode
    const generationRadio = document.querySelector(`input[name="generation-mode"][value="${state.generationMode}"]`) as HTMLInputElement | null;
    if (generationRadio) {
      generationRadio.checked = true;
      const dynamicOptions = document.getElementById('dynamic-options') as HTMLElement | null;
      if (dynamicOptions) dynamicOptions.style.display = state.generationMode === 'dynamic' ? 'block' : 'none';
    }
    const refreshInput = document.getElementById('refresh-interval') as HTMLInputElement | null;
    if (refreshInput && state.refreshInterval) refreshInput.value = String(state.refreshInterval);

    // Restore accessibility toggles
    const a11yToggle = document.getElementById('a11y-toggle') as HTMLInputElement | null;
    if (a11yToggle) a11yToggle.checked = state.a11yEnabled || false;
    const a11yOpts = document.getElementById('a11y-options') as HTMLElement | null;
    if (a11yOpts) a11yOpts.style.display = state.a11yEnabled ? 'block' : 'none';
    const a11yTableEl = document.getElementById('a11y-table') as HTMLInputElement | null;
    if (a11yTableEl) a11yTableEl.checked = state.a11yTable;
    const a11yDownloadEl = document.getElementById('a11y-download') as HTMLInputElement | null;
    if (a11yDownloadEl) a11yDownloadEl.checked = state.a11yDownload;
    const a11yDescEl = document.getElementById('a11y-description') as HTMLTextAreaElement | null;
    if (a11yDescEl) a11yDescEl.value = state.a11yDescription || '';

    // Restore DataBox toggles
    const databoxToggle = document.getElementById('databox-toggle') as HTMLInputElement | null;
    if (databoxToggle) databoxToggle.checked = state.databoxEnabled || false;
    const databoxOpts = document.getElementById('databox-options') as HTMLElement | null;
    if (databoxOpts) databoxOpts.style.display = state.databoxEnabled ? 'block' : 'none';
    const databoxTitleEl = document.getElementById('databox-title') as HTMLInputElement | null;
    if (databoxTitleEl) databoxTitleEl.value = state.databoxTitle || '';
    const databoxSourceEl = document.getElementById('databox-source') as HTMLInputElement | null;
    if (databoxSourceEl) databoxSourceEl.value = state.databoxSource || '';
    const databoxDateEl = document.getElementById('databox-date') as HTMLInputElement | null;
    if (databoxDateEl) databoxDateEl.value = state.databoxDate || '';
    const databoxTrendEl = document.getElementById('databox-trend') as HTMLInputElement | null;
    if (databoxTrendEl) databoxTrendEl.value = state.databoxTrend || '';
    const databoxDownloadEl = document.getElementById('databox-download') as HTMLInputElement | null;
    if (databoxDownloadEl) databoxDownloadEl.checked = state.databoxDownload ?? true;
    const databoxScreenshotEl = document.getElementById('databox-screenshot') as HTMLInputElement | null;
    if (databoxScreenshotEl) databoxScreenshotEl.checked = state.databoxScreenshot || false;
    const databoxFullscreenEl = document.getElementById('databox-fullscreen') as HTMLInputElement | null;
    if (databoxFullscreenEl) databoxFullscreenEl.checked = state.databoxFullscreen || false;
    if (state.databoxEnabled) {
      if (a11yTableEl) (a11yTableEl.closest('.fr-checkbox-group') as HTMLElement | null)!.style.display = 'none';
      if (a11yDownloadEl) (a11yDownloadEl.closest('.fr-checkbox-group') as HTMLElement | null)!.style.display = 'none';
    }

    // Update fields if available
    if (state.fields && state.fields.length > 0) {
      populateFieldSelects();

      // Select saved fields (after DOM update)
      setTimeout(() => {
        const labelSelect = document.getElementById('label-field') as HTMLSelectElement | null;
        const valueSelect = document.getElementById('value-field') as HTMLSelectElement | null;
        const codeSelect = document.getElementById('code-field') as HTMLSelectElement | null;
        const aggSelect = document.getElementById('aggregation') as HTMLSelectElement | null;
        const sortSelect = document.getElementById('sort-order') as HTMLSelectElement | null;

        if (state.labelField && labelSelect) labelSelect.value = state.labelField;
        const labelFieldLabelInput = document.getElementById('label-field-label') as HTMLInputElement | null;
        if (labelFieldLabelInput) labelFieldLabelInput.value = state.labelFieldLabel || '';
        if (state.valueField && valueSelect) valueSelect.value = state.valueField;
        const valueFieldLabelInput = document.getElementById('value-field-label') as HTMLInputElement | null;
        if (valueFieldLabelInput) valueFieldLabelInput.value = state.valueFieldLabel || '';
        if (state.codeField && codeSelect) codeSelect.value = state.codeField;
        if (state.aggregation && aggSelect) aggSelect.value = state.aggregation;
        if (state.sortOrder && sortSelect) sortSelect.value = state.sortOrder;

        // Restore extra series (migrates old valueField2 if needed)
        restoreExtraSeriesFromState();
      }, 0);
    }

    // Restore advanced mode
    if (state.advancedMode) {
      const toggleEl = document.getElementById('advanced-mode-toggle') as HTMLInputElement | null;
      const queryOptionsEl = document.getElementById('advanced-query-options') as HTMLElement | null;
      const filterEl = document.getElementById('query-filter') as HTMLInputElement | null;
      const groupByEl = document.getElementById('query-group-by') as HTMLInputElement | null;
      const aggregateEl = document.getElementById('query-aggregate') as HTMLInputElement | null;

      if (toggleEl) toggleEl.checked = true;
      if (queryOptionsEl) queryOptionsEl.style.display = 'block';
      if (state.queryFilter && filterEl) filterEl.value = state.queryFilter;
      if (state.queryGroupBy && groupByEl) groupByEl.value = state.queryGroupBy;
      if (state.queryAggregate && aggregateEl) aggregateEl.value = state.queryAggregate;
    }

    // Re-generate the chart (with delay for DOM to update)
    if (state.data && state.data.length > 0) {
      setTimeout(() => {
        generateCodeForLocalData();

        // Show "Voir les donnees" button
        showDataPreviewButton();

        // Open relevant sections
        const chartTypeSection = document.getElementById('section-chart-type');
        const fieldsSection = document.getElementById('section-fields');
        if (chartTypeSection) chartTypeSection.classList.remove('collapsed');
        if (fieldsSection) fieldsSection.classList.remove('collapsed');
      }, 100);
    }
  } catch (e) {
    console.error('Erreur restauration etat builder:', e);
  }
}

/**
 * Show the "Voir les donnees" button in the status area
 */
function showDataPreviewButton(): void {
  const statusEl = document.getElementById('fields-status');
  if (statusEl) {
    statusEl.innerHTML = '<button class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline source-btn" id="show-data-preview-btn"><i class="ri-database-2-line"></i> Voir</button>';
    document.getElementById('show-data-preview-btn')?.addEventListener('click', showDataPreview);
  }
}

/**
 * Open the data preview modal with a table of the first 20 records
 */
function showDataPreview(): void {
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
