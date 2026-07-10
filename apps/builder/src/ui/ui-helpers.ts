/**
 * Small UI helper functions.
 * Handles playground navigation, favorites, tabs, clipboard, and accordion behavior.
 */

import { state, FAVORITES_KEY } from '../state.js';
import {
  loadFromStorage,
  saveToStorage,
  toastWarning,
  toastSuccess,
  toastInfo,
  navigateTo,
  promptDialog,
  PALETTE_COLORS,
  isValidDeptCode,
} from '@dsfr-data/shared';
import type { Favorite } from '../state.js';

/**
 * Build a serializable snapshot of the current builder state.
 * Used for favorites and for round-trip to playground.
 */
export function getBuilderStateToSave(): Record<string, unknown> {
  return {
    chartType: state.chartType,
    labelField: state.labelField,
    labelFieldLabel: state.labelFieldLabel,
    valueField: state.valueField,
    valueFieldLabel: state.valueFieldLabel,
    valueField2: state.valueField2,
    codeField: state.codeField,
    aggregation: state.aggregation,
    sortOrder: state.sortOrder,
    sortField: state.sortField,
    title: state.title,
    subtitle: state.subtitle,
    palette: state.palette,
    color2: state.color2,
    fields: state.fields,
    data: state.data,
    localData: state.localData,
    savedSource: state.savedSource,
    generationMode: state.generationMode,
    refreshInterval: state.refreshInterval,
    advancedMode: state.advancedMode,
    queryFilter: state.queryFilter,
    queryGroupBy: state.queryGroupBy,
    queryAggregate: state.queryAggregate,
    datalistColumns: state.datalistColumns,
    normalizeConfig: state.normalizeConfig,
    facetsConfig: state.facetsConfig,
    a11yEnabled: state.a11yEnabled,
    a11yTable: state.a11yTable,
    a11yDownload: state.a11yDownload,
    a11yDescription: state.a11yDescription,
  };
}

/**
 * Open the current generated code in the playground.
 */
export function openInPlayground(): void {
  const codeEl = document.getElementById('generated-code');
  const code = codeEl?.textContent || '';

  if (!code || code === '// Le code sera g\u00e9n\u00e9r\u00e9 ici...' || code.startsWith('//')) {
    toastWarning(
      'Cliquez d\'abord sur "G\u00e9n\u00e9rer le graphique" pour voir le r\u00e9sultat, puis vous pourrez l\'ouvrir dans le Playground.'
    );
    return;
  }

  // Store builder state so we can restore it on round-trip back
  try {
    sessionStorage.setItem('builder-state', JSON.stringify(getBuilderStateToSave()));
  } catch {
    // QuotaExceededError — proceed without state backup
  }

  // Store the code in sessionStorage
  sessionStorage.setItem('playground-code', code);
  // Redirect to the playground
  navigateTo('playground', { from: 'builder' });
}

/**
 * Render the colour swatches preview right below the palette `<select>`,
 * giving an immediate visual feedback on the selected palette without
 * having to generate the chart (audit UX 2026-05-26 §T-5).
 *
 * Safe to call when the container is not mounted (no-op).
 */
export function renderPaletteSwatches(paletteKey: string = state.palette): void {
  const container = document.getElementById('palette-swatches');
  if (!container) return;
  const colors =
    paletteKey in PALETTE_COLORS
      ? PALETTE_COLORS[paletteKey as keyof typeof PALETTE_COLORS]
      : (PALETTE_COLORS.default ?? []);
  container.innerHTML = colors
    .map((c) => `<span class="palette-swatch" style="background:${c}"></span>`)
    .join('');
}

/**
 * Detect whether the loaded source has a column that *looks like* it contains
 * French INSEE department codes (sample-based validation via `isValidDeptCode`,
 * not just name-matching). Used to warn the user when they pick "Carte
 * départementale" on an incompatible source (audit UX §m-B-6).
 *
 * Returns the name of the best candidate column, or `null` if none qualifies.
 */
export function findDeptCodeField(): string | null {
  const data = (state.data ?? state.localData ?? []) as Record<string, unknown>[];
  if (!Array.isArray(data) || data.length === 0) return null;

  // Only consider string/number fields (codes can be "2A" or numeric)
  const candidates = state.fields.filter((f) => f.type === 'string' || f.type === 'number');
  if (candidates.length === 0) return null;

  const sample = data.slice(0, 50);
  for (const field of candidates) {
    let valid = 0;
    let nonEmpty = 0;
    for (const row of sample) {
      const raw = row[field.name];
      if (raw == null || raw === '') continue;
      nonEmpty++;
      if (isValidDeptCode(String(raw))) valid++;
    }
    // Accept the field if at least 80% of its non-empty sample values are valid codes
    if (nonEmpty > 0 && valid / nonEmpty >= 0.8) return field.name;
  }
  return null;
}

/**
 * Show or hide the warning below the `#code-field` select based on whether
 * the loaded source actually contains valid INSEE department codes.
 * Only relevant when the chart type is "map" (the warning element is hidden
 * by the section toggle when not on map).
 */
export function updateMapCodeFieldWarning(): void {
  const warning = document.getElementById('code-field-warning');
  if (!warning) return;
  if (state.chartType !== 'map' || state.fields.length === 0) {
    warning.hidden = true;
    return;
  }
  warning.hidden = findDeptCodeField() !== null;
}

/**
 * Sync the favorite button icon (filled vs outline) with the current
 * generated code: filled if the code matches an existing favorite, outline otherwise.
 * Safe to call multiple times; resilient to the button not being mounted yet.
 */
export function syncFavoriteIcon(): void {
  const btn = document.querySelector('.preview-panel-save-btn');
  const icon = btn?.querySelector('i');
  if (!icon) return;

  const code = document.getElementById('generated-code')?.textContent || '';
  const favorites = loadFromStorage<Favorite[]>(FAVORITES_KEY, []);
  const isFavorite = !!code && favorites.some((f) => f.code === code);

  icon.classList.toggle('ri-star-fill', isFavorite);
  icon.classList.toggle('ri-star-line', !isFavorite);
}

/**
 * Save the current chart configuration as a favorite.
 */
export async function saveFavorite(): Promise<void> {
  const codeEl = document.getElementById('generated-code');
  const code = codeEl?.textContent || '';

  if (!code || code === '// Le code sera g\u00e9n\u00e9r\u00e9 ici...' || code.startsWith('//')) {
    toastWarning(
      'Cliquez d\'abord sur "G\u00e9n\u00e9rer le graphique" pour voir le r\u00e9sultat, puis vous pourrez le sauvegarder en favori.'
    );
    return;
  }

  const favorites = loadFromStorage<Favorite[]>(FAVORITES_KEY, []);

  // Idempotence \u2014 same generated code = same favorite. No duplicate.
  const existing = favorites.find((f) => f.code === code);
  if (existing) {
    toastInfo(
      `Ce graphique est d\u00e9j\u00e0 dans vos favoris (\u00ab\u00a0${existing.name}\u00a0\u00bb).`
    );
    syncFavoriteIcon();
    return;
  }

  const name = await promptDialog('Sauvegarder en favoris', state.title || 'Mon graphique', {
    label: 'Nom du favori',
    placeholder: 'Ex : Population par r\u00e9gion 2024',
    confirmLabel: 'Sauvegarder',
  });
  if (!name) return;

  const favorite: Favorite = {
    id: crypto.randomUUID(),
    name: name,
    code: code,
    chartType: state.chartType,
    sourceApp: 'builder',
    createdAt: new Date().toISOString(),
    builderStateJson: getBuilderStateToSave(),
  };

  favorites.unshift(favorite);
  saveToStorage(FAVORITES_KEY, favorites);

  syncFavoriteIcon();
  toastSuccess(`Graphique \u00ab\u00a0${name}\u00a0\u00bb ajout\u00e9 \u00e0 vos favoris.`);
}

/**
 * Switch the active tab in the preview panel.
 */
export function switchTab(tabId: string): void {
  const previewPanel = document.querySelector('app-preview-panel') as
    (Element & { setActiveTab?: (id: string) => void }) | null;
  if (previewPanel?.setActiveTab) {
    previewPanel.setActiveTab(tabId);
  }
}

/**
 * Copy generated code to clipboard with visual feedback.
 */
export function copyCode(): void {
  const codeEl = document.getElementById('generated-code');
  const code = codeEl?.textContent || '';

  navigator.clipboard.writeText(code).then(() => {
    toastSuccess('Code copie dans le presse-papiers');
    const btn = document.getElementById('copy-code-btn');
    if (btn) {
      btn.innerHTML = '<i class="ri-check-line"></i> Copi\u00e9 !';
      setTimeout(() => {
        btn.innerHTML = '<i class="ri-file-copy-line"></i> Copier le code';
      }, 2000);
    }
  });
}

/**
 * Toggle a collapsible section (accordion behavior: closes others when opening one).
 */
export function toggleSection(sectionId: string): void {
  const section = document.getElementById(sectionId);
  if (!section) return;

  const isCurrentlyCollapsed = section.classList.contains('collapsed');

  // If opening a section, close all others
  if (isCurrentlyCollapsed) {
    document.querySelectorAll('.config-section:not(#' + sectionId + ')').forEach((s) => {
      // Don't close the generate button section (no header)
      if (s.querySelector('.config-section-header')) {
        s.classList.add('collapsed');
      }
    });
  }

  section.classList.toggle('collapsed');
}
