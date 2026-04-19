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
import { initHelpTooltips, updatePreviewSteps } from './ui/help-tooltips.js';
import { startTourIfFirstVisit, injectTourStyles, resetTour, startTour } from '@dsfr-data/shared';
import { BUILDER_TOUR } from './ui/tour.js';

// Expose functions called from inline onclick in HTML
(window as Window & { toggleSection?: typeof toggleSection }).toggleSection = toggleSection;

// Expose state for E2E tests
(window as Window & { __BUILDER_STATE__?: typeof state }).__BUILDER_STATE__ = state;

document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();

  // Tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabId = (btn as HTMLElement).dataset.tab;
      if (tabId) switchTab(tabId);
    });
  });

  // Saved sources dropdown
  const savedSourceSelect = document.getElementById('saved-source');
  if (savedSourceSelect) {
    savedSourceSelect.addEventListener('change', () => {
      handleSavedSourceChange();
      updatePreviewSteps();
    });
  }

  // Chart type
  document.querySelectorAll('.chart-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = (btn as HTMLElement).dataset.type as ChartType | undefined;
      if (type) {
        selectChartType(type);
        updatePreviewSteps();
      }
    });
  });

  // Palette selector
  const paletteSelect = document.getElementById('chart-palette') as HTMLSelectElement | null;
  if (paletteSelect) {
    paletteSelect.addEventListener('change', (e) => {
      state.palette = (e.target as HTMLSelectElement).value;
    });
  }

  // Field selects — track changes for preview steps
  const labelFieldSelect = document.getElementById('label-field') as HTMLSelectElement | null;
  if (labelFieldSelect) {
    labelFieldSelect.addEventListener('change', (e) => {
      state.labelField = (e.target as HTMLSelectElement).value;
      updatePreviewSteps();
    });
  }
  const valueFieldSelect = document.getElementById('value-field') as HTMLSelectElement | null;
  if (valueFieldSelect) {
    valueFieldSelect.addEventListener('change', (e) => {
      state.valueField = (e.target as HTMLSelectElement).value;
      updatePreviewSteps();
    });
  }

  // Note: le bouton "Charger" a ete retire — handleSavedSourceChange()
  // appelle loadFields() automatiquement sur chaque changement de source.

  const generateBtn = document.getElementById('generate-btn');
  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      await generateChart();
      // Refresh stepper so the "Generate" step ticks once the preview iframe
      // is visible (empty-state hidden). generateChart() renders synchronously
      // in most paths but may be async for server-side aggregations.
      updatePreviewSteps();
    });
  }

  const copyCodeBtn = document.getElementById('copy-code-btn');
  if (copyCodeBtn) copyCodeBtn.addEventListener('click', copyCode);

  // Label field label input
  const labelFieldLabelInput = document.getElementById(
    'label-field-label'
  ) as HTMLInputElement | null;
  if (labelFieldLabelInput) {
    labelFieldLabelInput.addEventListener('input', (e) => {
      state.labelFieldLabel = (e.target as HTMLInputElement).value;
    });
  }

  // Value field label input (Serie 1)
  const valueFieldLabelInput = document.getElementById(
    'value-field-label'
  ) as HTMLInputElement | null;
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
  document.querySelectorAll('input[name="generation-mode"]').forEach((radio) => {
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

  const refreshIntervalInput = document.getElementById(
    'refresh-interval'
  ) as HTMLInputElement | null;
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

  // DataBox toggle + sub-options
  const databoxToggle = document.getElementById('databox-toggle') as HTMLInputElement | null;
  const databoxOptions = document.getElementById('databox-options') as HTMLElement | null;
  if (databoxToggle) {
    databoxToggle.addEventListener('change', (e) => {
      state.databoxEnabled = (e.target as HTMLInputElement).checked;
      if (databoxOptions) databoxOptions.style.display = state.databoxEnabled ? 'block' : 'none';
      const a11yTableEl = document.getElementById('a11y-table') as HTMLInputElement | null;
      const a11yDownloadEl = document.getElementById('a11y-download') as HTMLInputElement | null;
      if (a11yTableEl)
        (a11yTableEl.closest('.fr-checkbox-group') as HTMLElement | null)!.style.display =
          state.databoxEnabled ? 'none' : '';
      if (a11yDownloadEl)
        (a11yDownloadEl.closest('.fr-checkbox-group') as HTMLElement | null)!.style.display =
          state.databoxEnabled ? 'none' : '';
    });
  }
  const databoxTitleEl = document.getElementById('databox-title') as HTMLInputElement | null;
  if (databoxTitleEl) {
    databoxTitleEl.addEventListener('input', (e) => {
      state.databoxTitle = (e.target as HTMLInputElement).value;
    });
  }
  const databoxSourceEl = document.getElementById('databox-source') as HTMLInputElement | null;
  if (databoxSourceEl) {
    databoxSourceEl.addEventListener('input', (e) => {
      state.databoxSource = (e.target as HTMLInputElement).value;
    });
  }
  const databoxDateEl = document.getElementById('databox-date') as HTMLInputElement | null;
  if (databoxDateEl) {
    databoxDateEl.addEventListener('input', (e) => {
      state.databoxDate = (e.target as HTMLInputElement).value;
    });
  }
  const databoxTrendEl = document.getElementById('databox-trend') as HTMLInputElement | null;
  if (databoxTrendEl) {
    databoxTrendEl.addEventListener('input', (e) => {
      state.databoxTrend = (e.target as HTMLInputElement).value;
    });
  }
  const databoxDownloadEl = document.getElementById('databox-download') as HTMLInputElement | null;
  if (databoxDownloadEl) {
    databoxDownloadEl.addEventListener('change', (e) => {
      state.databoxDownload = (e.target as HTMLInputElement).checked;
    });
  }
  const databoxScreenshotEl = document.getElementById(
    'databox-screenshot'
  ) as HTMLInputElement | null;
  if (databoxScreenshotEl) {
    databoxScreenshotEl.addEventListener('change', (e) => {
      state.databoxScreenshot = (e.target as HTMLInputElement).checked;
    });
  }
  const databoxFullscreenEl = document.getElementById(
    'databox-fullscreen'
  ) as HTMLInputElement | null;
  if (databoxFullscreenEl) {
    databoxFullscreenEl.addEventListener('change', (e) => {
      state.databoxFullscreen = (e.target as HTMLInputElement).checked;
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

  // Initialize UI for the default chart type (bar)
  selectChartType(state.chartType);

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

  // Initialize help tooltips
  initHelpTooltips();

  // Update preview steps based on current state
  updatePreviewSteps();

  // Product tour (first visit only, or forced via ?tour=restart)
  injectTourStyles();
  startTourIfFirstVisit(BUILDER_TOUR);

  // Tour restart button
  const restartTourBtn = document.getElementById('restart-tour-btn');
  if (restartTourBtn) {
    restartTourBtn.addEventListener('click', () => {
      resetTour(BUILDER_TOUR.id);
      startTour(BUILDER_TOUR);
    });
  }
});
