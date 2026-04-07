/**
 * Widget Grist : Graphique / Carte / KPI DSFR (multi-types)
 *
 * Widget unique supportant :
 * - Graphiques : bar, line, pie, radar, scatter, gauge, bar-line
 * - Cartes : map (departements), map-reg (regions)
 * - KPI : indicateur cle de performance
 *
 * L'utilisateur choisit le type dans les options et mappe les colonnes necessaires.
 * Les composants gouv-* sont charges via script tag UMD (DsfrData global).
 */

import './styles/grist-widgets.css';
import { initGristBridge, onGristOptions, getGristApiInfo } from './shared/grist-bridge.js';
import { createOptionsPanel, type OptionDef } from './shared/grist-options-panel.js';
import { PROXY_BASE_URL } from '@dsfr-data/shared';

const ALL_OPTIONS: OptionDef[] = [
  {
    key: 'type',
    label: 'Type de visualisation',
    type: 'select',
    defaultValue: 'bar',
    options: [
      { value: 'bar', label: 'Barres verticales' },
      { value: 'line', label: 'Lignes' },
      { value: 'pie', label: 'Camembert' },
      { value: 'radar', label: 'Radar' },
      { value: 'scatter', label: 'Nuage de points' },
      { value: 'gauge', label: 'Jauge' },
      { value: 'bar-line', label: 'Barres + Lignes' },
      { value: 'map', label: 'Carte departements' },
      { value: 'map-reg', label: 'Carte regions' },
      { value: 'kpi', label: 'KPI' },
    ],
  },
  {
    key: 'palette',
    label: 'Palette de couleurs',
    type: 'select',
    defaultValue: 'default',
    options: [
      { value: 'default', label: 'Bleu France' },
      { value: 'categorical', label: 'Categorielle' },
      { value: 'sequentialAscending', label: 'Sequentielle asc.' },
      { value: 'sequentialDescending', label: 'Sequentielle desc.' },
      { value: 'divergentAscending', label: 'Divergente asc.' },
      { value: 'divergentDescending', label: 'Divergente desc.' },
      { value: 'neutral', label: 'Neutre' },
    ],
  },
  {
    key: 'horizontal',
    label: 'Barres horizontales',
    type: 'checkbox',
    defaultValue: false,
    hint: 'Pour types bar/line uniquement',
  },
  {
    key: 'stacked',
    label: 'Barres empilees',
    type: 'checkbox',
    defaultValue: false,
    hint: 'Pour types bar/line uniquement',
  },
  {
    key: 'aggregation',
    label: 'Agregation',
    type: 'select',
    defaultValue: 'avg',
    hint: 'Pour type KPI uniquement',
    options: [
      { value: 'avg', label: 'Moyenne' },
      { value: 'sum', label: 'Somme' },
      { value: 'count', label: 'Comptage' },
      { value: 'min', label: 'Minimum' },
      { value: 'max', label: 'Maximum' },
    ],
  },
  {
    key: 'format',
    label: 'Format',
    type: 'select',
    defaultValue: 'nombre',
    hint: 'Pour type KPI uniquement',
    options: [
      { value: 'nombre', label: 'Nombre' },
      { value: 'pourcentage', label: 'Pourcentage' },
      { value: 'euro', label: 'Euro' },
      { value: 'decimal', label: 'Decimal' },
    ],
  },
  {
    key: 'label',
    label: 'Libelle KPI',
    type: 'text',
    defaultValue: 'Indicateur',
    hint: 'Texte affiche sous la valeur (KPI uniquement)',
  },
  {
    key: 'icone',
    label: 'Icone KPI',
    type: 'text',
    defaultValue: '',
    hint: 'Classe Remix Icon, ex: ri-line-chart-line (KPI uniquement)',
  },
  {
    key: 'couleur',
    label: 'Couleur KPI',
    type: 'select',
    defaultValue: '',
    hint: 'Pour type KPI uniquement',
    options: [
      { value: '', label: 'Automatique (seuils)' },
      { value: 'bleu', label: 'Bleu' },
      { value: 'vert', label: 'Vert' },
      { value: 'orange', label: 'Orange' },
      { value: 'rouge', label: 'Rouge' },
    ],
  },
  {
    key: 'unitTooltip',
    label: 'Unite (tooltip)',
    type: 'text',
    defaultValue: '',
    hint: 'Ex: EUR, %, habitants',
  },
];

let currentOptions: Record<string, unknown> = {};
let currentType: string = 'bar';

function renderWidget(type: string) {
  const container = document.getElementById('widget-container');
  if (!container) return;

  container.innerHTML = '';

  if (type === 'kpi') {
    const kpi = document.createElement('dsfr-data-kpi');
    kpi.setAttribute('source', 'grist');
    kpi.setAttribute('valeur', 'avg:Value');
    kpi.setAttribute('label', 'Indicateur');
    kpi.setAttribute('format', 'nombre');
    container.appendChild(kpi);
  } else {
    const chart = document.createElement('dsfr-data-chart');
    chart.setAttribute('source', 'grist');
    chart.setAttribute('type', type);
    chart.setAttribute('label-field', 'Label');
    chart.setAttribute('value-field', 'Value');
    if (type === 'map' || type === 'map-reg') {
      chart.setAttribute('code-field', 'Code');
    }
    container.appendChild(chart);
  }
}

function applyOptions(opts: Record<string, unknown>) {
  currentOptions = { ...currentOptions, ...opts };
  const type = (opts.type || 'bar') as string;

  // Re-render si le type change
  if (type !== currentType) {
    currentType = type;
    renderWidget(type);
  }

  const empty = document.getElementById('empty-state');
  const container = document.getElementById('widget-container');
  if (empty) empty.style.display = 'none';
  if (container) container.style.display = 'block';

  // Appliquer les options selon le type
  if (type === 'kpi') {
    const kpi = document.querySelector('dsfr-data-kpi');
    if (!kpi) return;

    const agg = (opts.aggregation || 'avg') as string;
    kpi.setAttribute('valeur', `${agg}:Value`);

    if (opts.format) kpi.setAttribute('format', String(opts.format));
    if (opts.label) kpi.setAttribute('label', String(opts.label));
    if (opts.icone) kpi.setAttribute('icone', String(opts.icone));
    if (opts.couleur) {
      kpi.setAttribute('couleur', String(opts.couleur));
    } else {
      kpi.removeAttribute('couleur');
    }
  } else {
    const chart = document.querySelector('dsfr-data-chart');
    if (!chart) return;

    chart.setAttribute('type', type);
    if (opts.palette) chart.setAttribute('selected-palette', String(opts.palette));
    if (opts.horizontal !== undefined) {
      chart.setAttribute('horizontal', opts.horizontal === true ? '' : 'false');
    }
    if (opts.stacked !== undefined) {
      chart.setAttribute('stacked', opts.stacked === true ? '' : 'false');
    }
    if (opts.unitTooltip) chart.setAttribute('unit-tooltip', String(opts.unitTooltip));
  }
}

// --- Export HTML ---

let activeTab: 'fixed' | 'dynamic' = 'fixed';

function generateFixedHtml(): string {
  const data = DsfrData.getDataCache('grist') as Record<string, unknown>[] | undefined;
  if (!data || data.length === 0) return '';

  const type = currentType;
  const opts = currentOptions;
  const jsonData = JSON.stringify(data);

  // Dependances CDN (a ajouter dans le <head> de la page hote)
  const deps = [
    '<!-- Dependances dsfr-data (a ajouter dans le <head> si absentes) -->',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.4/dist/dsfr.min.css">',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.4/dist/utility/utility.min.css">',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css">',
  ];

  if (type === 'kpi') {
    const agg = (opts.aggregation || 'avg') as string;
    const format = (opts.format || 'nombre') as string;
    const label = (opts.label || 'Indicateur') as string;
    const icone = opts.icone ? ` icone="${opts.icone}"` : '';
    const couleur = opts.couleur ? ` couleur="${opts.couleur}"` : '';

    deps.push(
      '<script src="https://cdn.jsdelivr.net/gh/bmatge/dsfr-data@main/dist/dsfr-data.umd.js"><\/script>'
    );

    return `${deps.join('\n')}

<!-- Widget KPI -->
<dsfr-data-kpi source="export" valeur="${agg}:Value" format="${format}" label="${label}"${icone}${couleur}></dsfr-data-kpi>
<script>
  customElements.whenDefined('dsfr-data-kpi').then(function() {
    DsfrData.dispatchDataLoaded('export', ${jsonData});
  });
<\/script>`;
  }

  // Chart types: bar, line, pie, radar, scatter, gauge, bar-line, map, map-reg
  deps.push(
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@2.0.4/dist/DSFRChart/DSFRChart.css">'
  );
  deps.push(
    '<script type="module" src="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@2.0.4/dist/DSFRChart/DSFRChart.js"><\/script>'
  );
  deps.push(
    '<script src="https://cdn.jsdelivr.net/gh/bmatge/dsfr-data@main/dist/dsfr-data.umd.js"><\/script>'
  );

  const palette = opts.palette ? ` selected-palette="${opts.palette}"` : '';
  const horizontal = opts.horizontal === true ? ' horizontal' : '';
  const stacked = opts.stacked === true ? ' stacked' : '';
  const unitTooltip = opts.unitTooltip ? ` unit-tooltip="${opts.unitTooltip}"` : '';
  const codeField = type === 'map' || type === 'map-reg' ? ' code-field="Code"' : '';
  const hasValue2 = data.length > 0 && 'Value2' in data[0];
  const valueField2 = hasValue2 ? ' value-field-2="Value2"' : '';

  return `${deps.join('\n')}

<!-- Widget graphique -->
<dsfr-data-chart source="export" type="${type}" label-field="Label" value-field="Value"${codeField}${palette}${horizontal}${stacked}${unitTooltip}${valueField2}></dsfr-data-chart>
<script>
  customElements.whenDefined('dsfr-data-chart').then(function() {
    DsfrData.dispatchDataLoaded('export', ${jsonData});
  });
<\/script>`;
}

function generateDynamicHtml(): string {
  const { apiBaseUrl, tableId, columnMappings } = getGristApiInfo();
  if (!apiBaseUrl || !tableId)
    return "(Information API Grist non disponible.\nLe widget doit etre charge dans Grist pour detecter l'URL du document.)";

  const match = apiBaseUrl.match(/\/api\/docs\/([^/]+)/);
  if (!match) return '(URL API Grist non reconnue)';
  const docId = match[1];

  const proxyUrl = `${PROXY_BASE_URL}/grist-gouv-proxy/api/docs/${docId}/tables/${tableId}/records`;

  const type = currentType;
  const opts = currentOptions;

  const labelCol = columnMappings?.Label || 'Label';
  const valueCol = columnMappings?.Value || 'Value';
  const value2Col = columnMappings?.Value2 as string | undefined;
  const codeCol = columnMappings?.Code as string | undefined;

  const deps = [
    '<!-- Dependances dsfr-data (a ajouter dans le <head> si absentes) -->',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.4/dist/dsfr.min.css">',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.4/dist/utility/utility.min.css">',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css">',
  ];

  if (type === 'kpi') {
    const agg = (opts.aggregation || 'avg') as string;
    const format = (opts.format || 'nombre') as string;
    const label = (opts.label || 'Indicateur') as string;
    const icone = opts.icone ? ` icone="${opts.icone}"` : '';
    const couleur = opts.couleur ? ` couleur="${opts.couleur}"` : '';

    deps.push(
      '<script src="https://cdn.jsdelivr.net/gh/bmatge/dsfr-data@main/dist/dsfr-data.umd.js"><\/script>'
    );

    return `${deps.join('\n')}

<!-- Source Grist (document public requis) -->
<dsfr-data-source
  id="grist-data"
  url="${proxyUrl}"
  transform="records">
</dsfr-data-source>

<!-- Widget KPI -->
<dsfr-data-kpi source="grist-data" valeur="${agg}:fields.${valueCol}" format="${format}" label="${label}"${icone}${couleur}></dsfr-data-kpi>`;
  }

  deps.push(
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@2.0.4/dist/DSFRChart/DSFRChart.css">'
  );
  deps.push(
    '<script type="module" src="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@2.0.4/dist/DSFRChart/DSFRChart.js"><\/script>'
  );
  deps.push(
    '<script src="https://cdn.jsdelivr.net/gh/bmatge/dsfr-data@main/dist/dsfr-data.umd.js"><\/script>'
  );

  const palette = opts.palette ? ` selected-palette="${opts.palette}"` : '';
  const horizontal = opts.horizontal === true ? ' horizontal' : '';
  const stacked = opts.stacked === true ? ' stacked' : '';
  const unitTooltip = opts.unitTooltip ? ` unit-tooltip="${opts.unitTooltip}"` : '';
  const codeFieldAttr =
    (type === 'map' || type === 'map-reg') && codeCol ? ` code-field="fields.${codeCol}"` : '';
  const valueField2 = value2Col ? ` value-field-2="fields.${value2Col}"` : '';

  return `${deps.join('\n')}

<!-- Source Grist (document public requis) -->
<dsfr-data-source
  id="grist-data"
  url="${proxyUrl}"
  transform="records">
</dsfr-data-source>

<!-- Widget graphique -->
<dsfr-data-chart source="grist-data" type="${type}" label-field="fields.${labelCol}" value-field="fields.${valueCol}"${codeFieldAttr}${palette}${horizontal}${stacked}${unitTooltip}${valueField2}></dsfr-data-chart>`;
}

let codeVisible = false;

function updateCodePanel() {
  const codeContent = document.getElementById('code-content');
  if (!codeContent) return;
  const htmlContent = activeTab === 'dynamic' ? generateDynamicHtml() : generateFixedHtml();
  codeContent.textContent = htmlContent || '(aucune donnee)';
}

function switchTab(tab: 'fixed' | 'dynamic') {
  activeTab = tab;
  document.getElementById('tab-fixed')?.classList.toggle('active', tab === 'fixed');
  document.getElementById('tab-dynamic')?.classList.toggle('active', tab === 'dynamic');
  updateCodePanel();
}

function toggleCode() {
  const codePanel = document.getElementById('code-panel');
  const btn = document.getElementById('btn-toggle-code');
  if (!codePanel || !btn) return;

  codeVisible = !codeVisible;
  if (codeVisible) {
    updateCodePanel();
    codePanel.style.display = 'block';
    btn.innerHTML = '<span class="ri-code-s-slash-line" aria-hidden="true"></span> Masquer le code';
  } else {
    codePanel.style.display = 'none';
    btn.innerHTML = '<span class="ri-code-s-slash-line" aria-hidden="true"></span> Voir le code';
  }
}

function copyCode() {
  const codeContent = document.getElementById('code-content');
  const btn = document.getElementById('btn-copy-code');
  if (!codeContent || !btn) return;

  const text = codeContent.textContent || '';
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.innerHTML;
    btn.innerHTML = '<span class="ri-check-line" aria-hidden="true"></span> Copie !';
    setTimeout(() => {
      btn.innerHTML = original;
    }, 1500);
  });
}

function showOptionsPanel() {
  const panel = document.getElementById('options-panel');
  const content = document.getElementById('widget-container');
  const toolbar = document.getElementById('chart-toolbar');
  const codePanel = document.getElementById('code-panel');
  if (!panel || !content) return;

  panel.classList.add('visible');
  content.style.display = 'none';
  if (toolbar) toolbar.style.display = 'none';
  if (codePanel) codePanel.style.display = 'none';

  createOptionsPanel(panel, ALL_OPTIONS, currentOptions, () => {
    // Fermer le panneau apres sauvegarde
    panel.classList.remove('visible');
    content.style.display = 'block';
    // Re-afficher la toolbar si des donnees sont presentes
    const hasData = DsfrData.getDataCache('grist');
    if (toolbar && hasData) toolbar.style.display = 'flex';
    if (codePanel && codeVisible && hasData) {
      updateCodePanel();
      codePanel.style.display = 'block';
    }
  });
}

// Initialisation : toutes les colonnes possibles (flexibilite maximale)
initGristBridge(
  [
    { name: 'Label', title: 'Etiquettes (graphiques) ou Nom (cartes)', optional: true },
    { name: 'Value', title: 'Valeur numerique', type: 'Numeric' },
    { name: 'Value2', title: 'Serie 2 (graphiques multi-series)', type: 'Numeric', optional: true },
    { name: 'Code', title: 'Code geo INSEE (cartes uniquement)', type: 'Text', optional: true },
  ],
  {
    onEditOptions: showOptionsPanel,
  }
);

onGristOptions((opts) => {
  applyOptions(opts);
});

// Render initial
renderWidget(currentType);

document.addEventListener('dsfr-data-loaded', () => {
  const empty = document.getElementById('empty-state');
  const container = document.getElementById('widget-container');
  const panel = document.getElementById('options-panel');
  const toolbar = document.getElementById('chart-toolbar');
  const codePanel = document.getElementById('code-panel');
  if (empty) empty.style.display = 'none';
  if (container) container.style.display = 'block';
  if (toolbar) toolbar.style.display = 'flex';
  if (panel) panel.classList.remove('visible');
  // Mettre a jour le code si le panneau est visible
  if (codePanel && codeVisible) updateCodePanel();
});

// Bind buttons
document.getElementById('btn-toggle-code')?.addEventListener('click', toggleCode);
document.getElementById('btn-copy-code')?.addEventListener('click', copyCode);
document.getElementById('tab-fixed')?.addEventListener('click', () => switchTab('fixed'));
document.getElementById('tab-dynamic')?.addEventListener('click', () => switchTab('dynamic'));
