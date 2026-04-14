/**
 * Widget Grist : Tableau DSFR
 *
 * Affiche les donnees Grist dans un tableau DSFR filtreable,
 * triable avec export CSV. Toutes les colonnes de la table sont
 * affichees automatiquement.
 *
 * Les composants gouv-* sont charges via script tag UMD (DsfrData global).
 */

import './styles/grist-widgets.css';
import { onGristOptions, detectGristApi, getGristApiInfo } from './shared/grist-bridge.js';
import { createOptionsPanel, type OptionDef } from './shared/grist-options-panel.js';
import { PROXY_BASE_URL } from '@dsfr-data/shared';

const GRIST_SOURCE_ID = 'grist';

const DATALIST_OPTIONS: OptionDef[] = [
  {
    key: 'pagination',
    label: 'Lignes par page',
    type: 'select',
    defaultValue: '20',
    options: [
      { value: '10', label: '10' },
      { value: '20', label: '20' },
      { value: '50', label: '50' },
      { value: '0', label: 'Tout afficher' },
    ],
  },
  {
    key: 'recherche',
    label: 'Barre de recherche',
    type: 'checkbox',
    defaultValue: true,
  },
  {
    key: 'export',
    label: 'Export CSV',
    type: 'checkbox',
    defaultValue: true,
  },
  {
    key: 'exportHtml',
    label: 'Export HTML',
    type: 'checkbox',
    defaultValue: false,
  },
];

let currentOptions: Record<string, unknown> = {};
let columnsDetermined = false;

function applyOptions(opts: Record<string, unknown>) {
  currentOptions = { ...currentOptions, ...opts };
  const datalist = document.querySelector('dsfr-data-list');
  if (!datalist) return;

  if (opts.pagination !== undefined) datalist.setAttribute('pagination', String(opts.pagination));

  if (opts.recherche === true) {
    datalist.setAttribute('recherche', '');
  } else if (opts.recherche === false) {
    datalist.removeAttribute('recherche');
  }

  if (opts.export !== undefined || opts.exportHtml !== undefined) {
    const formats: string[] = [];
    const csvEnabled = opts.export !== undefined ? opts.export : currentOptions.export;
    const htmlEnabled = opts.exportHtml !== undefined ? opts.exportHtml : currentOptions.exportHtml;
    if (csvEnabled) formats.push('csv');
    if (htmlEnabled) formats.push('html');
    if (formats.length > 0) {
      datalist.setAttribute('export', formats.join(','));
    } else {
      datalist.removeAttribute('export');
    }
  }

  const empty = document.getElementById('empty-state');
  const container = document.getElementById('datalist-container');
  if (empty) empty.style.display = 'none';
  if (container) container.style.display = 'block';
}

// --- Code HTML panel ---

let codeVisible = false;
let activeTab: 'fixed' | 'dynamic' = 'fixed';
let dataColumnKeys: string[] = [];

function generateFixedHtml(): string {
  const data = DsfrData.getDataCache(GRIST_SOURCE_ID) as Record<string, unknown>[] | undefined;
  if (!data || data.length === 0) return '';

  const datalist = document.querySelector('dsfr-data-list');
  const colonnes = datalist?.getAttribute('colonnes') || '';
  const pagination = datalist?.getAttribute('pagination') || '20';
  const hasRecherche = datalist?.hasAttribute('recherche');
  const exportAttr = datalist?.getAttribute('export') || '';

  const recherche = hasRecherche ? ' recherche' : '';
  const exportPart = exportAttr ? ` export="${exportAttr}"` : '';
  const jsonData = JSON.stringify(data);

  const deps = [
    '<!-- Dependances dsfr-data (a ajouter dans le <head> si absentes) -->',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.4/dist/dsfr.min.css">',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.4/dist/utility/utility.min.css">',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css">',
    '<script src="https://cdn.jsdelivr.net/gh/bmatge/dsfr-data@main/dist/dsfr-data.umd.js"></script>',
  ];

  return `${deps.join('\n')}

<!-- Widget tableau -->
<dsfr-data-list source="export" colonnes="${colonnes}" pagination="${pagination}"${recherche}${exportPart}></dsfr-data-list>
<script>
  customElements.whenDefined('dsfr-data-list').then(function() {
    DsfrData.dispatchDataLoaded('export', ${jsonData});
  });
</script>`;
}

function generateDynamicHtml(): string {
  const { apiBaseUrl, tableId } = getGristApiInfo();
  if (!apiBaseUrl || !tableId)
    return "(Information API Grist non disponible.\nLe widget doit etre charge dans Grist pour detecter l'URL du document.)";

  const match = apiBaseUrl.match(/\/api\/docs\/([^/]+)/);
  if (!match) return '(URL API Grist non reconnue)';
  const docId = match[1];

  const proxyUrl = `${PROXY_BASE_URL}/grist-gouv-proxy/api/docs/${docId}/tables/${tableId}/records`;

  const datalist = document.querySelector('dsfr-data-list');
  const pagination = datalist?.getAttribute('pagination') || '20';
  const hasRecherche = datalist?.hasAttribute('recherche');
  const exportAttr = datalist?.getAttribute('export') || '';

  const recherche = hasRecherche ? ' recherche' : '';
  const exportPart = exportAttr ? ` export="${exportAttr}"` : '';

  // Colonnes avec prefix fields. pour le format Grist API
  const colonnes = dataColumnKeys.map((k) => `fields.${k}:${k}`).join(' | ');

  const deps = [
    '<!-- Dependances dsfr-data (a ajouter dans le <head> si absentes) -->',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.4/dist/dsfr.min.css">',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.4/dist/utility/utility.min.css">',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css">',
    '<script src="https://cdn.jsdelivr.net/gh/bmatge/dsfr-data@main/dist/dsfr-data.umd.js"></script>',
  ];

  return `${deps.join('\n')}

<!-- Source Grist (document public requis) -->
<dsfr-data-source
  id="grist-data"
  url="${proxyUrl}"
  transform="records">
</dsfr-data-source>

<!-- Widget tableau -->
<dsfr-data-list source="grist-data" colonnes="${colonnes}" pagination="${pagination}"${recherche}${exportPart}></dsfr-data-list>`;
}

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
  const content = document.getElementById('datalist-container');
  const toolbar = document.getElementById('datalist-toolbar');
  const codePanel = document.getElementById('code-panel');
  if (!panel || !content) return;

  panel.classList.add('visible');
  content.style.display = 'none';
  if (toolbar) toolbar.style.display = 'none';
  if (codePanel) codePanel.style.display = 'none';

  createOptionsPanel(panel, DATALIST_OPTIONS, currentOptions, () => {
    // Fermer le panneau apres sauvegarde
    panel.classList.remove('visible');
    content.style.display = 'block';
    const hasData = DsfrData.getDataCache(GRIST_SOURCE_ID);
    if (toolbar && hasData) toolbar.style.display = 'flex';
    if (codePanel && codeVisible && hasData) {
      updateCodePanel();
      codePanel.style.display = 'block';
    }
  });
}

/**
 * Genere automatiquement le mapping colonnes a partir
 * des cles du premier record recu.
 */
function autoConfigureColumns(data: Record<string, unknown>[]) {
  if (columnsDetermined || data.length === 0) return;
  columnsDetermined = true;

  const first = data[0];
  const keys = Object.keys(first).filter((k) => k !== 'id');
  const colonnes = keys.map((k) => `${k}:${k}`).join(' | ');

  const datalist = document.querySelector('dsfr-data-list');
  if (datalist) {
    datalist.setAttribute('colonnes', colonnes);
  }
}

// Initialisation : acces complet a la table (toutes les colonnes)
grist.ready({
  requiredAccess: 'full',
  onEditOptions: showOptionsPanel,
});

detectGristApi();
DsfrData.dispatchDataLoading(GRIST_SOURCE_ID);

grist.onRecords((records) => {
  // Filtrer les metadonnees Grist (id, manualSort...)
  const cleaned = records.map((r) => {
    const row: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(r)) {
      if (key === 'id' || key === 'manualSort') continue;
      row[key] = val;
    }
    return row;
  });

  // Stocker les noms de colonnes pour l'export dynamique
  if (cleaned.length > 0 && dataColumnKeys.length === 0) {
    dataColumnKeys = Object.keys(cleaned[0]);
  }

  autoConfigureColumns(cleaned);
  DsfrData.dispatchDataLoaded(GRIST_SOURCE_ID, cleaned);
});

onGristOptions((opts) => {
  applyOptions(opts);
});

document.addEventListener('dsfr-data-loaded', () => {
  const empty = document.getElementById('empty-state');
  const container = document.getElementById('datalist-container');
  const panel = document.getElementById('options-panel');
  const toolbar = document.getElementById('datalist-toolbar');
  const codePanel = document.getElementById('code-panel');
  if (empty) empty.style.display = 'none';
  if (container) container.style.display = 'block';
  if (toolbar) toolbar.style.display = 'flex';
  if (panel) panel.classList.remove('visible');
  if (codePanel && codeVisible) updateCodePanel();
});

// Bind buttons
document.getElementById('btn-toggle-code')?.addEventListener('click', toggleCode);
document.getElementById('btn-copy-code')?.addEventListener('click', copyCode);
document.getElementById('tab-fixed')?.addEventListener('click', () => switchTab('fixed'));
document.getElementById('tab-dynamic')?.addEventListener('click', () => switchTab('dynamic'));
