/**
 * Chart type selection logic.
 * Updates state.chartType and toggles visibility of type-specific config options.
 */

import {
  state,
  supportsMultiSeries,
  isMapType,
  SERIES_FIELD_TYPES,
  STACKED_TYPES,
  type ChartType,
} from '../state.js';
import { syncSeriesExclusivity } from './formes.js';
import { updateLectureVisibility } from './lecture.js';
import { REFERENTIELS } from '../geo-codes.js';
import { initDatalistColumns } from './datalist-config.js';
import { renderPaletteSwatches, updateMapCodeFieldWarning } from './ui-helpers.js';
import { updateUrlSyncSection } from './url-sync-config.js';
import { updateNormalizeNote } from './normalize-config.js';

/**
 * Select a chart type and update the UI accordingly.
 */
export function selectChartType(type: ChartType): void {
  document.querySelectorAll('.chart-type-btn').forEach((b) => {
    b.classList.remove('selected');
    b.setAttribute('aria-pressed', 'false');
  });
  const selectedBtn = document.querySelector(`[data-type="${type}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add('selected');
    selectedBtn.setAttribute('aria-pressed', 'true');
  }
  state.chartType = type;

  // Type catégories
  const isKPI = type === 'kpi';
  const isGauge = type === 'gauge';
  const isScatter = type === 'scatter';
  const isMap = isMapType(type);
  const referentiel = isMapType(type) ? REFERENTIELS[type] : null;
  const isDatalist = type === 'datalist';
  const isPieOrDoughnut = ['pie', 'doughnut'].includes(type);
  const isRadar = type === 'radar';
  const isPodium = type === 'podium';
  const isBarLine = type === 'bar-line';
  const isSingleValue = isKPI || isGauge; // Types with a single aggregated value

  // Toggle KPI-specific options (variant selector)
  const kpiConfig = document.getElementById('kpi-config');
  if (kpiConfig) kpiConfig.classList.toggle('visible', isKPI);

  // Toggle datalist-specific options (feature checkboxes + columns)
  const datalistConfig = document.getElementById('datalist-config');
  if (datalistConfig) datalistConfig.classList.toggle('visible', isDatalist);
  if (isDatalist && state.datalistColumns.length === 0) {
    initDatalistColumns();
  }

  // Partage par l'adresse : pertinent pour un tableau (pagination) ou des
  // facettes (#714)
  updateUrlSyncSection();
  // Portée du nettoyage selon le type (#1169)
  updateNormalizeNote();

  // Palette config: hide for KPI, gauge, and datalist
  const paletteConfig = document.getElementById('palette-config') as HTMLElement | null;
  if (paletteConfig) paletteConfig.style.display = isSingleValue || isDatalist ? 'none' : 'block';

  // For maps, force a sequential palette for color gradient
  if (isMap && !state.palette.startsWith('sequential')) {
    state.palette = 'sequentialAscending';
    const paletteSelect = document.getElementById('chart-palette') as HTMLSelectElement | null;
    if (paletteSelect) paletteSelect.value = 'sequentialAscending';
    renderPaletteSwatches(state.palette);
  }

  // Un podium se colore par rang : seules les échelles s'appliquent (#1204)
  if (isPodium && !state.palette.includes('sequential') && !state.palette.includes('divergent')) {
    state.palette = 'sequentialDescending';
    const paletteSelect = document.getElementById('chart-palette') as HTMLSelectElement | null;
    if (paletteSelect) paletteSelect.value = 'sequentialDescending';
    renderPaletteSwatches(state.palette);
  }

  // Un camembert se colore par part (#1174)
  applyPiePalette(isPieOrDoughnut);

  // Warn the user if they pick "Carte départementale" on a source that doesn't
  // actually contain INSEE codes (audit UX §m-B-6). Re-evaluated on every
  // chart-type change since the warning only shows when chartType === 'map'.
  updateMapCodeFieldWarning();

  // Label field: hide for single value types (KPI, gauge)
  const labelField = document.getElementById('label-field');
  const labelFieldGroup = labelField?.closest('.fr-select-group') as HTMLElement | null;
  if (labelFieldGroup) labelFieldGroup.style.display = isSingleValue ? 'none' : 'block';

  // Value field: hide for datalist (no numeric aggregation)
  const valueField = document.getElementById('value-field');
  const valueFieldGroup = valueField?.closest('.fr-select-group') as HTMLElement | null;
  if (valueFieldGroup) valueFieldGroup.style.display = isDatalist ? 'none' : 'block';

  // Sort order: hide for single value types, map, radar, and scatter — et pour
  // le podium, que le composant classe lui-même (tri décroissant).
  const hideSort = isSingleValue || isMap || isRadar || isScatter || isPodium;
  const sortSelect = document.getElementById('sort-order');
  const sortGroup = sortSelect?.closest('.fr-select-group') as HTMLElement | null;
  if (sortGroup) sortGroup.style.display = hideSort ? 'none' : 'block';

  // Aggregation: hide for datalist, update hint text for others.
  // Reset to '' (not 'block') so the CSS-defined display (grid for .agg-row)
  // takes effect.
  const aggSelect = document.getElementById('aggregation');
  const aggGroup = aggSelect?.closest('.fr-select-group') as HTMLElement | null;
  if (aggGroup) aggGroup.style.display = isDatalist ? 'none' : '';

  const aggHint = document.querySelector('label[for="aggregation"] .fr-hint-text');
  if (aggHint) {
    if (isSingleValue) {
      aggHint.textContent = "Calcul sur l'ensemble des données";
    } else if (isMap) {
      aggHint.textContent = `Si plusieurs valeurs par ${referentiel?.unite ?? 'département'}`;
    } else {
      aggHint.textContent = 'Comment combiner les valeurs partageant la même catégorie';
    }
  }

  // Types that support multiple séries (MULTI_SERIES_TYPES, state.ts)
  const multiSeries = supportsMultiSeries(type);
  const extraSeriesGroup = document.getElementById('extra-series-group') as HTMLElement | null;
  if (extraSeriesGroup) extraSeriesGroup.style.display = multiSeries ? 'block' : 'none';
  if (!multiSeries) {
    state.valueField2 = '';
    state.extraSeries = [];
    const container = document.getElementById('extra-series-container');
    if (container) container.innerHTML = '';
  }

  // Format long et empilement (#1204) : selon ce que le type sait lire. Le
  // groupe « Ajouter une série » s'efface quand un champ de séries est choisi.
  const seriesFieldGroup = document.getElementById('series-field-group') as HTMLElement | null;
  if (seriesFieldGroup)
    seriesFieldGroup.style.display = SERIES_FIELD_TYPES.includes(type) ? 'block' : 'none';
  const stackedGroup = document.getElementById('stacked-group') as HTMLElement | null;
  if (stackedGroup) stackedGroup.style.display = STACKED_TYPES.includes(type) ? 'block' : 'none';
  syncSeriesExclusivity();

  // Barres + ligne : la seconde mesure et son libellé (#1204)
  const lineFieldGroup = document.getElementById('line-field-group') as HTMLElement | null;
  if (lineFieldGroup) lineFieldGroup.style.display = isBarLine ? 'flex' : 'none';

  // Podium : nombre de places (#1204)
  const podiumConfig = document.getElementById('podium-config') as HTMLElement | null;
  if (podiumConfig) podiumConfig.style.display = isPodium ? 'block' : 'none';

  // Réglages de lecture (#1218) : unité, bornes, repères, couleurs, synthèse de carte
  updateLectureVisibility(type);

  // DataBox section: hide for non-chart types (KPI, gauge, datalist, podium)
  const databoxSection = document.getElementById('section-databox') as HTMLElement | null;
  if (databoxSection)
    databoxSection.style.display = isSingleValue || isDatalist || isPodium ? 'none' : '';

  // Map chart needs code field for department codes
  const codeFieldGroup = document.getElementById('code-field-group') as HTMLElement | null;
  if (codeFieldGroup) codeFieldGroup.style.display = isMap ? 'block' : 'none';
  // Libellé et aide du champ géographique : ils suivent le découpage (#1204).
  const codeFieldLabel = document.querySelector('label[for="code-field"]');
  if (codeFieldLabel && referentiel) {
    codeFieldLabel.innerHTML = `${referentiel.libelle}<span class="fr-hint-text">${referentiel.aide}</span>`;
  }
  if (!isMap) {
    state.codeField = '';
    const codeSelect = document.getElementById('code-field') as HTMLSelectElement | null;
    if (codeSelect) codeSelect.value = '';
  }

  // Update field labels based on chart type
  const labelFieldLabel = document.querySelector('label[for="label-field"]');
  const valueFieldLabel = document.querySelector('label[for="value-field"]');

  if (labelFieldLabel && valueFieldLabel) {
    if (isDatalist) {
      labelFieldLabel.innerHTML =
        'Colonnes<span class="fr-hint-text">Champ principal du tableau</span>';
      valueFieldLabel.innerHTML =
        'Valeurs<span class="fr-hint-text">Non utilis\u00e9 pour les tableaux</span>';
    } else if (isScatter) {
      labelFieldLabel.innerHTML =
        'Axe X (num\u00e9rique)<span class="fr-hint-text">Valeurs horizontales</span>';
      valueFieldLabel.innerHTML =
        'Axe Y (num\u00e9rique)<span class="fr-hint-text">Valeurs verticales</span>';
    } else if (isMap) {
      labelFieldLabel.innerHTML =
        'Nom (optionnel)<span class="fr-hint-text">Nom affiché à la place du code</span>';
      valueFieldLabel.innerHTML =
        'Valeur<span class="fr-hint-text">Le champ num\u00e9rique \u00e0 visualiser</span>';
    } else if (isPodium) {
      labelFieldLabel.innerHTML =
        'Libellé<span class="fr-hint-text">Ce qui est classé (ex\u00a0: région, établissement)</span>';
      valueFieldLabel.innerHTML =
        'Valeur<span class="fr-hint-text">Le champ numérique qui décide du rang</span>';
    } else if (isBarLine) {
      labelFieldLabel.innerHTML =
        'Étiquettes (axe horizontal)<span class="fr-hint-text">Dates ou catégories communes aux deux mesures</span>';
      valueFieldLabel.innerHTML =
        'Valeur des barres<span class="fr-hint-text">Le premier champ numérique, tracé en barres</span>';
    } else if (isPieOrDoughnut) {
      labelFieldLabel.innerHTML =
        'Segments<span class="fr-hint-text">Cat\u00e9gories du camembert (max 7 recommand\u00e9)</span>';
      valueFieldLabel.innerHTML =
        'Valeurs<span class="fr-hint-text">Taille de chaque segment</span>';
    } else if (isRadar) {
      labelFieldLabel.innerHTML =
        'Crit\u00e8res<span class="fr-hint-text">Axes du radar (ex: Performance, Qualit\u00e9...)</span>';
      valueFieldLabel.innerHTML =
        'Valeurs<span class="fr-hint-text">Score pour chaque crit\u00e8re</span>';
    } else if (type === 'line') {
      labelFieldLabel.innerHTML =
        'Axe X / Temps<span class="fr-hint-text">Dates ou cat\u00e9gories temporelles</span>';
      valueFieldLabel.innerHTML =
        'Valeurs (S\u00e9rie 1)<span class="fr-hint-text">Le champ num\u00e9rique \u00e0 mesurer</span>';
    } else {
      labelFieldLabel.innerHTML =
        'Axe X / Cat\u00e9gories<span class="fr-hint-text">Le champ utilis\u00e9 pour les labels</span>';
      valueFieldLabel.innerHTML =
        'Axe Y / Valeurs (S\u00e9rie 1)<span class="fr-hint-text">Le champ num\u00e9rique \u00e0 mesurer</span>';
    }
  }
}

/** Palette qui colore chaque part d'un camembert : la seule que DSFR Chart applique par part. */
export const PIE_PALETTE = 'categorical';

export const PIE_PALETTE_NOTE =
  'Un camembert se colore par part : DSFR Chart n’applique que la palette « Couleurs distinctes par catégorie ». Les autres rendraient un disque d’une seule couleur.';

/**
 * Camembert et anneau (#1174) : DSFR Chart 2.1.1 ne distribue une couleur par
 * part qu'avec la palette `categorical` ; toute autre (« Bleu France »,
 * dégradés, neutre) colore le disque d'une seule teinte, et la légende ne
 * nomme que la première part. Le Builder pose donc cette palette, verrouille
 * le choix et le dit, au lieu de laisser générer un disque illisible.
 */
export function applyPiePalette(isPieOrDoughnut: boolean): void {
  const paletteSelect = document.getElementById('chart-palette') as HTMLSelectElement | null;
  const note = document.getElementById('palette-note') as HTMLElement | null;
  if (isPieOrDoughnut) {
    if (state.palette !== PIE_PALETTE) {
      state.palette = PIE_PALETTE;
      if (paletteSelect) paletteSelect.value = PIE_PALETTE;
      renderPaletteSwatches(state.palette);
    }
    if (paletteSelect) paletteSelect.disabled = true;
    if (note) {
      note.textContent = PIE_PALETTE_NOTE;
      note.hidden = false;
    }
    return;
  }
  if (paletteSelect) paletteSelect.disabled = false;
  if (note) {
    note.textContent = '';
    note.hidden = true;
  }
}
