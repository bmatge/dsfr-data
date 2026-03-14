/**
 * Chart type selection logic.
 * Updates state.chartType and toggles visibility of type-specific config options.
 */

import { state, type ChartType } from '../state.js';
import { initDatalistColumns } from './datalist-config.js';

/**
 * Select a chart type and update the UI accordingly.
 */
export function selectChartType(type: ChartType): void {
  document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('selected'));
  const selectedBtn = document.querySelector(`[data-type="${type}"]`);
  if (selectedBtn) selectedBtn.classList.add('selected');
  state.chartType = type;

  // Type categories
  const isKPI = type === 'kpi';
  const isGauge = type === 'gauge';
  const isScatter = type === 'scatter';
  const isMap = type === 'map';
  const isDatalist = type === 'datalist';
  const isPieOrDoughnut = ['pie', 'doughnut'].includes(type);
  const isRadar = type === 'radar';
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

  // Palette config: hide for KPI, gauge, and datalist
  const paletteConfig = document.getElementById('palette-config') as HTMLElement | null;
  if (paletteConfig) paletteConfig.style.display = (isSingleValue || isDatalist) ? 'none' : 'block';

  // For maps, force a sequential palette for color gradient
  if (isMap && !state.palette.startsWith('sequential')) {
    state.palette = 'sequentialAscending';
    const paletteSelect = document.getElementById('chart-palette') as HTMLSelectElement | null;
    if (paletteSelect) paletteSelect.value = 'sequentialAscending';
  }

  // Label field: hide for single value types (KPI, gauge)
  const labelField = document.getElementById('label-field');
  const labelFieldGroup = labelField?.closest('.fr-select-group') as HTMLElement | null;
  if (labelFieldGroup) labelFieldGroup.style.display = isSingleValue ? 'none' : 'block';

  // Value field: hide for datalist (no numeric aggregation)
  const valueField = document.getElementById('value-field');
  const valueFieldGroup = valueField?.closest('.fr-select-group') as HTMLElement | null;
  if (valueFieldGroup) valueFieldGroup.style.display = isDatalist ? 'none' : 'block';

  // Sort order: hide for single value types, map, radar, and scatter
  const hideSort = isSingleValue || isMap || isRadar || isScatter;
  const sortSelect = document.getElementById('sort-order');
  const sortGroup = sortSelect?.closest('.fr-select-group') as HTMLElement | null;
  if (sortGroup) sortGroup.style.display = hideSort ? 'none' : 'block';

  // Aggregation: hide for datalist, update hint text for others
  const aggSelect = document.getElementById('aggregation');
  const aggGroup = aggSelect?.closest('.fr-select-group') as HTMLElement | null;
  if (aggGroup) aggGroup.style.display = isDatalist ? 'none' : 'block';

  const aggLabel = document.querySelector('label[for="aggregation"]');
  if (aggLabel) {
    if (isSingleValue) {
      aggLabel.innerHTML = 'Agr\u00e9gation<span class="fr-hint-text">Calcul sur l\'ensemble des donn\u00e9es</span>';
    } else if (isMap) {
      aggLabel.innerHTML = 'Agr\u00e9gation<span class="fr-hint-text">Si plusieurs valeurs par d\u00e9partement</span>';
    } else {
      aggLabel.innerHTML = 'Agr\u00e9gation<span class="fr-hint-text">Comment regrouper les valeurs</span>';
    }
  }

  // Types that support multiple series: bar, horizontalBar, line, radar
  const supportsMultiSeries = ['bar', 'horizontalBar', 'line', 'radar'].includes(type);
  const valueField2Group = document.getElementById('value-field-2-group') as HTMLElement | null;
  if (valueField2Group) valueField2Group.style.display = supportsMultiSeries ? 'block' : 'none';
  if (!supportsMultiSeries) {
    state.valueField2 = '';
    const vf2Select = document.getElementById('value-field-2') as HTMLSelectElement | null;
    if (vf2Select) vf2Select.value = '';
  }

  // Map chart needs code field for department codes
  const codeFieldGroup = document.getElementById('code-field-group') as HTMLElement | null;
  if (codeFieldGroup) codeFieldGroup.style.display = isMap ? 'block' : 'none';
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
      labelFieldLabel.innerHTML = 'Colonnes<span class="fr-hint-text">Champ principal du tableau</span>';
      valueFieldLabel.innerHTML = 'Valeurs<span class="fr-hint-text">Non utilis\u00e9 pour les tableaux</span>';
    } else if (isScatter) {
      labelFieldLabel.innerHTML = 'Axe X (num\u00e9rique)<span class="fr-hint-text">Valeurs horizontales</span>';
      valueFieldLabel.innerHTML = 'Axe Y (num\u00e9rique)<span class="fr-hint-text">Valeurs verticales</span>';
    } else if (isMap) {
      labelFieldLabel.innerHTML = 'Nom (optionnel)<span class="fr-hint-text">Nom du d\u00e9partement pour l\'affichage</span>';
      valueFieldLabel.innerHTML = 'Valeur<span class="fr-hint-text">Le champ num\u00e9rique \u00e0 visualiser</span>';
    } else if (isPieOrDoughnut) {
      labelFieldLabel.innerHTML = 'Segments<span class="fr-hint-text">Cat\u00e9gories du camembert (max 7 recommand\u00e9)</span>';
      valueFieldLabel.innerHTML = 'Valeurs<span class="fr-hint-text">Taille de chaque segment</span>';
    } else if (isRadar) {
      labelFieldLabel.innerHTML = 'Crit\u00e8res<span class="fr-hint-text">Axes du radar (ex: Performance, Qualit\u00e9...)</span>';
      valueFieldLabel.innerHTML = 'Valeurs<span class="fr-hint-text">Score pour chaque crit\u00e8re</span>';
    } else if (type === 'line') {
      labelFieldLabel.innerHTML = 'Axe X / Temps<span class="fr-hint-text">Dates ou cat\u00e9gories temporelles</span>';
      valueFieldLabel.innerHTML = 'Valeurs (S\u00e9rie 1)<span class="fr-hint-text">Le champ num\u00e9rique \u00e0 mesurer</span>';
    } else {
      labelFieldLabel.innerHTML = 'Axe X / Cat\u00e9gories<span class="fr-hint-text">Le champ utilis\u00e9 pour les labels</span>';
      valueFieldLabel.innerHTML = 'Axe Y / Valeurs (S\u00e9rie 1)<span class="fr-hint-text">Le champ num\u00e9rique \u00e0 mesurer</span>';
    }
  }
}
