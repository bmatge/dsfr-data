/**
 * Entry point for the Builder app.
 * Registers all event listeners and initializes the application.
 */

import './styles/builder.css';
import { initAuth } from '@dsfr-data/shared';
import { state } from './state.js';
import {
  loadSavedSources,
  checkSelectedSource,
  handleSavedSourceChange,
  loadFields,
  loadFavoriteState,
  initDataPreviewModal,
} from './sources.js';
import { selectChartType } from './ui/chart-type-selector.js';
import { generateChart } from './ui/code-generator.js';
import {
  openInPlayground,
  saveFavorite,
  switchTab,
  copyCode,
  toggleSection,
} from './ui/ui-helpers.js';
import type { ChartType } from './state.js';
import { setupDatalistListeners } from './ui/datalist-config.js';
import { setupNormalizeListeners, updateMiddlewareSections } from './ui/normalize-config.js';
import { setupFacetsListeners } from './ui/facets-config.js';
import { addExtraSeries } from './ui/extra-series.js';

// Expose functions called from inline onclick in HTML
(window as any).toggleSection = toggleSection;

// Expose state for E2E tests
(window as any).__BUILDER_STATE__ = state;

document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = (btn as HTMLElement).dataset.tab;
      if (tabId) switchTab(tabId);
    });
  });

  // Saved sources dropdown
  const savedSourceSelect = document.getElementById('saved-source');
  if (savedSourceSelect) {
    savedSourceSelect.addEventListener('change', handleSavedSourceChange);
  }

  // Chart type
  document.querySelectorAll('.chart-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = (btn as HTMLElement).dataset.type as ChartType | undefined;
      if (type) selectChartType(type);
    });
  });

  // Palette selector
  const paletteSelect = document.getElementById('chart-palette') as HTMLSelectElement | null;
  if (paletteSelect) {
    paletteSelect.addEventListener('change', (e) => {
      state.palette = (e.target as HTMLSelectElement).value;
    });
  }

  // Buttons
  const loadFieldsBtn = document.getElementById('load-fields-btn');
  if (loadFieldsBtn) loadFieldsBtn.addEventListener('click', loadFields);

  const generateBtn = document.getElementById('generate-btn');
  if (generateBtn) generateBtn.addEventListener('click', generateChart);

  const copyCodeBtn = document.getElementById('copy-code-btn');
  if (copyCodeBtn) copyCodeBtn.addEventListener('click', copyCode);

  // Label field label input
  const labelFieldLabelInput = document.getElementById('label-field-label') as HTMLInputElement | null;
  if (labelFieldLabelInput) {
    labelFieldLabelInput.addEventListener('input', (e) => {
      state.labelFieldLabel = (e.target as HTMLInputElement).value;
    });
  }

  // Value field label input (Serie 1)
  const valueFieldLabelInput = document.getElementById('value-field-label') as HTMLInputElement | null;
  if (valueFieldLabelInput) {
    valueFieldLabelInput.addEventListener('input', (e) => {
      state.valueFieldLabel = (e.target as HTMLInputElement).value;
    });
  }

  // Input changes (title/subtitle update state only — preview updates on "Generer")
  const chartTitleInput = document.getElementById('chart-title') as HTMLInputElement | null;
  if (chartTitleInput) {
    chartTitleInput.addEventListener('input', (e) => {
      state.title = (e.target as HTMLInputElement).value;
    });
  }

  const chartSubtitleInput = document.getElementById('chart-subtitle') as HTMLInputElement | null;
  if (chartSubtitleInput) {
    chartSubtitleInput.addEventListener('input', (e) => {
      state.subtitle = (e.target as HTMLInputElement).value;
    });
  }

  // Generation mode radio buttons
  document.querySelectorAll('input[name="generation-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.generationMode = (e.target as HTMLInputElement).value as typeof state.generationMode;
      const dynamicOptions = document.getElementById('dynamic-options') as HTMLElement | null;
      if (dynamicOptions) {
        dynamicOptions.style.display =
          (e.target as HTMLInputElement).value === 'dynamic' ? 'block' : 'none';
      }
      updateMiddlewareSections();
    });
  });

  const refreshIntervalInput = document.getElementById('refresh-interval') as HTMLInputElement | null;
  if (refreshIntervalInput) {
    refreshIntervalInput.addEventListener('input', (e) => {
      state.refreshInterval = parseInt((e.target as HTMLInputElement).value) || 0;
    });
  }

  // Accessibility companion toggle + sub-options
  const a11yToggle = document.getElementById('a11y-toggle') as HTMLInputElement | null;
  const a11yOptions = document.getElementById('a11y-options') as HTMLElement | null;
  if (a11yToggle) {
    a11yToggle.addEventListener('change', (e) => {
      state.a11yEnabled = (e.target as HTMLInputElement).checked;
      if (a11yOptions) a11yOptions.style.display = state.a11yEnabled ? 'block' : 'none';
    });
  }
  const a11yTableEl = document.getElementById('a11y-table') as HTMLInputElement | null;
  if (a11yTableEl) {
    a11yTableEl.addEventListener('change', (e) => {
      state.a11yTable = (e.target as HTMLInputElement).checked;
    });
  }
  const a11yDownloadEl = document.getElementById('a11y-download') as HTMLInputElement | null;
  if (a11yDownloadEl) {
    a11yDownloadEl.addEventListener('change', (e) => {
      state.a11yDownload = (e.target as HTMLInputElement).checked;
    });
  }
  const a11yDescEl = document.getElementById('a11y-description') as HTMLTextAreaElement | null;
  if (a11yDescEl) {
    a11yDescEl.addEventListener('input', (e) => {
      state.a11yDescription = (e.target as HTMLTextAreaElement).value;
    });
  }

  // Advanced mode toggle
  const advancedToggle = document.getElementById('advanced-mode-toggle') as HTMLInputElement | null;
  if (advancedToggle) {
    advancedToggle.addEventListener('change', (e) => {
      state.advancedMode = (e.target as HTMLInputElement).checked;
      const queryOptions = document.getElementById('advanced-query-options') as HTMLElement | null;
      if (queryOptions) {
        queryOptions.style.display = (e.target as HTMLInputElement).checked ? 'block' : 'none';
      }
    });
  }

  // Advanced query inputs
  const queryFilterInput = document.getElementById('query-filter') as HTMLInputElement | null;
  if (queryFilterInput) {
    queryFilterInput.addEventListener('input', (e) => {
      state.queryFilter = (e.target as HTMLInputElement).value;
    });
  }

  const queryGroupByInput = document.getElementById('query-group-by') as HTMLInputElement | null;
  if (queryGroupByInput) {
    queryGroupByInput.addEventListener('input', (e) => {
      state.queryGroupBy = (e.target as HTMLInputElement).value;
    });
  }

  const queryAggregateInput = document.getElementById('query-aggregate') as HTMLInputElement | null;
  if (queryAggregateInput) {
    queryAggregateInput.addEventListener('input', (e) => {
      state.queryAggregate = (e.target as HTMLInputElement).value;
    });
  }

  // Extra series "add" button
  const addSeriesBtn = document.getElementById('add-series-btn');
  if (addSeriesBtn) addSeriesBtn.addEventListener('click', addExtraSeries);

  // Datalist config listeners
  setupDatalistListeners();

  // Normalize & facets config listeners
  setupNormalizeListeners();
  setupFacetsListeners();

  // Load saved sources and check for selected source from sources.html
  loadSavedSources();
  checkSelectedSource();
  initDataPreviewModal();

  // Listen for save-favorite and open-playground events from preview panel
  const previewPanel = document.querySelector('app-preview-panel');
  if (previewPanel) {
    previewPanel.addEventListener('save-favorite', saveFavorite);
    previewPanel.addEventListener('open-playground', openInPlayground);
  }

  // Load a favorite if coming from the favorites page
  loadFavoriteState();
});
