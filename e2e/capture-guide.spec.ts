/**
 * Capture screenshots for USER-GUIDE.md
 * Run: npx playwright test e2e/capture-guide.spec.ts
 *
 * Generates annotated, cropped screenshots for each user journey (parcours A-G).
 */
import { test, type Page } from '@playwright/test';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, '..', 'guide', 'images');

// ============================================================================
// TEST DATA
// ============================================================================

const MANUAL_SOURCE = {
  id: 'src-manual-regions',
  name: 'Statistiques regions',
  type: 'manual',
  recordCount: 13,
  data: [
    { region: 'Ile-de-France', PIB: 739, population: 12.4, score_DSFR: 92 },
    { region: 'Auvergne-Rhone-Alpes', PIB: 282, population: 8.1, score_DSFR: 85 },
    { region: 'Nouvelle-Aquitaine', PIB: 181, population: 6.0, score_DSFR: 78 },
    { region: 'Occitanie', PIB: 177, population: 5.9, score_DSFR: 88 },
    { region: 'Hauts-de-France', PIB: 161, population: 6.0, score_DSFR: 72 },
    { region: 'Grand Est', PIB: 157, population: 5.6, score_DSFR: 81 },
    { region: 'Provence-Alpes-Cote d\'Azur', PIB: 168, population: 5.1, score_DSFR: 90 },
    { region: 'Pays de la Loire', PIB: 120, population: 3.8, score_DSFR: 76 },
    { region: 'Bretagne', PIB: 103, population: 3.4, score_DSFR: 83 },
    { region: 'Normandie', PIB: 96, population: 3.3, score_DSFR: 69 },
    { region: 'Centre-Val de Loire', PIB: 76, population: 2.6, score_DSFR: 74 },
    { region: 'Bourgogne-Franche-Comte', PIB: 74, population: 2.8, score_DSFR: 77 },
    { region: 'Corse', PIB: 10, population: 0.3, score_DSFR: 65 },
  ],
};

const GRIST_CONNECTION = {
  id: 'conn-grist-public',
  type: 'grist',
  name: 'Grist Numerique (public)',
  url: 'https://grist.numerique.gouv.fr',
  apiKey: null,
  isPublic: true,
  status: 'connected',
  statusText: 'Mode public',
};

const GRIST_SOURCE = {
  id: 'src-grist-poc2',
  name: 'POC 2 data (Grist)',
  type: 'grist',
  connectionId: 'conn-grist-public',
  documentId: '7u97XuBYFJQw',
  tableId: 'POC_2_data',
  recordCount: 10,
  isPublic: true,
  apiUrl: 'https://grist.numerique.gouv.fr',
  rawRecords: [
    { id: 1, fields: { Pays: 'France', PIB: 2323, Habitants: 72345000 } },
    { id: 2, fields: { Pays: 'Espagne', PIB: 2198, Habitants: 56786432 } },
    { id: 3, fields: { Pays: 'Portugal', PIB: 1321, Habitants: 23145764 } },
    { id: 4, fields: { Pays: 'Allemagne', PIB: 3867, Habitants: 83200000 } },
    { id: 5, fields: { Pays: 'Italie', PIB: 1884, Habitants: 59550000 } },
  ],
  data: [
    { Pays: 'France', PIB: 2323, Habitants: 72345000 },
    { Pays: 'Espagne', PIB: 2198, Habitants: 56786432 },
    { Pays: 'Portugal', PIB: 1321, Habitants: 23145764 },
    { Pays: 'Allemagne', PIB: 3867, Habitants: 83200000 },
    { Pays: 'Italie', PIB: 1884, Habitants: 59550000 },
  ],
};

const API_ODS_CONNECTION = {
  id: 'conn-api-ods',
  type: 'api',
  name: 'API data.economie.gouv.fr',
  apiUrl: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/industrie-du-futur/records',
  method: 'GET',
  headers: null,
  dataPath: 'results',
  status: 'connected',
  statusText: 'OK (101 enregistrements)',
};

const API_ODS_SOURCE = {
  id: 'src-api-ods',
  name: 'Industrie du futur (ODS)',
  type: 'api',
  connectionId: 'conn-api-ods',
  apiUrl: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/industrie-du-futur/records',
  method: 'GET',
  dataPath: 'results',
  recordCount: 101,
  data: [
    { nom_region: 'NORMANDIE', nom_departement: 'ORNE', code_departement: 61, nombre_beneficiaires: 78, montant_investissement: 32073247, montant_participation_etat: 8525121 },
    { nom_region: 'AUVERGNE-RHONE-ALPES', nom_departement: 'AIN', code_departement: 1, nombre_beneficiaires: 251, montant_investissement: 101685903, montant_participation_etat: 30927091 },
    { nom_region: 'ILE-DE-FRANCE', nom_departement: 'PARIS', code_departement: 75, nombre_beneficiaires: 142, montant_investissement: 65432100, montant_participation_etat: 18765000 },
    { nom_region: 'OCCITANIE', nom_departement: 'HAUTE-GARONNE', code_departement: 31, nombre_beneficiaires: 189, montant_investissement: 78654321, montant_participation_etat: 22345678 },
    { nom_region: 'NOUVELLE-AQUITAINE', nom_departement: 'GIRONDE', code_departement: 33, nombre_beneficiaires: 156, montant_investissement: 56789012, montant_participation_etat: 16234567 },
    { nom_region: 'HAUTS-DE-FRANCE', nom_departement: 'NORD', code_departement: 59, nombre_beneficiaires: 312, montant_investissement: 134567890, montant_participation_etat: 38901234 },
    { nom_region: 'GRAND EST', nom_departement: 'BAS-RHIN', code_departement: 67, nombre_beneficiaires: 134, montant_investissement: 48765432, montant_participation_etat: 13567890 },
    { nom_region: 'BRETAGNE', nom_departement: 'FINISTERE', code_departement: 29, nombre_beneficiaires: 98, montant_investissement: 36543210, montant_participation_etat: 10234567 },
    { nom_region: 'PAYS DE LA LOIRE', nom_departement: 'LOIRE-ATLANTIQUE', code_departement: 44, nombre_beneficiaires: 178, montant_investissement: 72345678, montant_participation_etat: 20123456 },
    { nom_region: 'PROVENCE-ALPES-COTE D\'AZUR', nom_departement: 'BOUCHES-DU-RHONE', code_departement: 13, nombre_beneficiaires: 205, montant_investissement: 89012345, montant_participation_etat: 25678901 },
  ],
};

const API_DATAGOUV_CONNECTION = {
  id: 'conn-api-datagouv',
  type: 'api',
  name: 'API tabular data.gouv.fr',
  apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/58075a79-8b16-4004-9640-6413c1dc2d60/data/',
  method: 'GET',
  headers: null,
  dataPath: 'data',
  status: 'connected',
  statusText: 'OK (22958 enregistrements)',
};

const TEST_FAVORITES = [
  {
    id: 'fav-bar-industrie',
    name: 'Beneficiaires par region - Industrie du futur',
    code: `<div style="padding:1rem"><h2>Beneficiaires par region</h2><p>Source : data.economie.gouv.fr</p><bar-chart x='["Hauts-de-France","Auvergne-Rhone-Alpes","PACA","Occitanie","Pays de la Loire"]' y='[312,251,205,189,178]' name="Nombre de beneficiaires" selected-palette="categorical"></bar-chart></div>`,
    chartType: 'bar',
    source: 'builder',
    createdAt: '2025-02-01T10:00:00Z',
  },
  {
    id: 'fav-pie-regions',
    name: 'Repartition PIB par region',
    code: `<div style="padding:1rem"><h2>Repartition du PIB</h2><pie-chart x='["IDF","ARA","NAQ","OCC","HDF"]' y='[739,282,181,177,161]' name="PIB (Mds EUR)" fill="true"></pie-chart></div>`,
    chartType: 'pie',
    source: 'builder',
    createdAt: '2025-01-28T14:30:00Z',
  },
  {
    id: 'fav-line-evolution',
    name: 'Evolution investissements',
    code: `<div style="padding:1rem"><h2>Evolution des investissements</h2><line-chart x='["2020","2021","2022","2023","2024"]' y='[120,245,380,410,520]' name="Montant (M EUR)"></line-chart></div>`,
    chartType: 'line',
    source: 'playground',
    createdAt: '2025-01-15T09:00:00Z',
  },
];

const TEST_DASHBOARD = {
  id: 'dashboard-guide',
  name: 'Industrie du futur - Vue d\'ensemble',
  description: 'Tableau de bord des aides a l\'industrie du futur par region',
  createdAt: '2025-02-01T10:00:00Z',
  updatedAt: '2025-02-08T14:00:00Z',
  layout: { columns: 2, gap: 'fr-grid-row--gutters', rowColumns: { 0: 3 } },
  widgets: [
    { id: 'w-kpi-1', type: 'kpi', title: 'Beneficiaires', position: { row: 0, col: 0 }, config: { valeur: '1743', format: 'nombre', label: 'Beneficiaires totaux', icone: 'ri-team-fill', variant: 'info' } },
    { id: 'w-kpi-2', type: 'kpi', title: 'Investissement', position: { row: 0, col: 1 }, config: { valeur: '715 M', format: 'texte', label: 'Investissement total', icone: 'ri-money-euro-circle-fill', variant: 'success' } },
    { id: 'w-kpi-3', type: 'kpi', title: 'Participation Etat', position: { row: 0, col: 2 }, config: { valeur: '205 M', format: 'texte', label: 'Aide de l\'Etat', icone: 'ri-government-fill', variant: '' } },
    { id: 'w-chart-1', type: 'chart', title: 'Top 5 regions', position: { row: 1, col: 0 }, config: { chartType: 'bar', labelField: 'nom_region', valueField: 'nombre_beneficiaires' }, favoriteId: 'fav-bar-industrie' },
    { id: 'w-chart-2', type: 'chart', title: 'Repartition PIB', position: { row: 1, col: 1 }, config: { chartType: 'pie', labelField: 'region', valueField: 'PIB' }, favoriteId: 'fav-pie-regions' },
  ],
  sources: [],
};

// ============================================================================
// HELPERS
// ============================================================================

test.beforeAll(() => {
  mkdirSync(DIR, { recursive: true });
});

/** Inject all test data into localStorage before page navigation */
async function setupStorage(page: Page) {
  await page.addInitScript((data) => {
    localStorage.setItem('dsfr-data-connections', JSON.stringify(data.connections));
    localStorage.setItem('dsfr-data-sources', JSON.stringify(data.sources));
    localStorage.setItem('dsfr-data-favorites', JSON.stringify(data.favorites));
    localStorage.setItem('dsfr-data-dashboards', JSON.stringify(data.dashboards));
  }, {
    connections: [GRIST_CONNECTION, API_ODS_CONNECTION, API_DATAGOUV_CONNECTION],
    sources: [MANUAL_SOURCE, GRIST_SOURCE, API_ODS_SOURCE],
    favorites: TEST_FAVORITES,
    dashboards: [TEST_DASHBOARD],
  });
}

/** Add a numbered annotation badge on an element */
async function annotate(page: Page, selector: string, number: number, color = '#E1000F') {
  await page.evaluate(({ sel, num, col }) => {
    const el = document.querySelector(sel) as HTMLElement;
    if (!el) return;
    el.style.outline = `3px solid ${col}`;
    el.style.outlineOffset = '3px';
    el.style.position = el.style.position || 'relative';
    const badge = document.createElement('div');
    badge.textContent = String(num);
    badge.style.cssText = `position:absolute;top:-14px;left:-14px;width:28px;height:28px;background:${col};color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;z-index:9999;box-shadow:0 2px 4px rgba(0,0,0,0.3);`;
    el.appendChild(badge);
  }, { sel: selector, num: number, col: color });
}

/** Add outline annotation without number */
async function outline(page: Page, selector: string, color = '#E1000F') {
  await page.evaluate(({ sel, col }) => {
    const el = document.querySelector(sel) as HTMLElement;
    if (!el) return;
    el.style.outline = `3px solid ${col}`;
    el.style.outlineOffset = '3px';
  }, { sel: selector, col: color });
}

/** Clear all annotations */
async function clearAnnotations(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('[style*="outline"]').forEach((el) => {
      (el as HTMLElement).style.outline = '';
      (el as HTMLElement).style.outlineOffset = '';
    });
    document.querySelectorAll('div').forEach((el) => {
      if (el.style.borderRadius === '50%' && el.style.zIndex === '9999') el.remove();
    });
  });
}

/** Take a cropped screenshot of a specific element */
async function cropScreenshot(page: Page, selector: string, name: string, padding = 16) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 10_000 });
  const box = await el.boundingBox();
  if (box) {
    await page.screenshot({
      path: join(DIR, name),
      clip: {
        x: Math.max(0, box.x - padding),
        y: Math.max(0, box.y - padding),
        width: Math.min(box.width + padding * 2, 1400),
        height: Math.min(box.height + padding * 2, 1200),
      },
    });
  }
}

/** Take full page screenshot */
async function fullScreenshot(page: Page, name: string) {
  await page.screenshot({ path: join(DIR, name), fullPage: false });
}

// ============================================================================
// TESTS
// ============================================================================

test.describe('User Guide Screenshots', () => {
  test.setTimeout(180_000);

  // ========================================================================
  // PARCOURS A : Source locale -> Builder -> Code HTML
  // ========================================================================
  test('Parcours A: Source locale + Builder', async ({ page }) => {
    await setupStorage(page);
    await page.setViewportSize({ width: 1400, height: 900 });

    // --- A1: Sources page overview ---
    await page.goto('/apps/sources/');
    await page.waitForTimeout(2000);
    await annotate(page, '#add-source-btn', 1, '#000091');
    await fullScreenshot(page, 'guide-A1-sources-overview.png');
    await clearAnnotations(page);

    // --- A2: Manual source modal ---
    await page.click('#add-source-btn');
    await page.waitForTimeout(500);
    // Fill in the modal with test data
    await page.fill('#source-name', 'Statistiques regions');
    // Fill table headers
    const headers = page.locator('.table-editor thead input[type="text"]');
    if (await headers.count() >= 2) {
      await headers.nth(0).fill('region');
      await headers.nth(1).fill('PIB');
    }
    // Fill first rows
    const cells = page.locator('.table-editor tbody input[type="text"]');
    const rowData = ['Ile-de-France', '739', 'Auvergne-Rhone-Alpes', '282', 'Occitanie', '177'];
    for (let i = 0; i < Math.min(rowData.length, await cells.count()); i++) {
      await cells.nth(i).fill(rowData[i]);
    }
    await page.waitForTimeout(300);
    await annotate(page, '#source-name', 1, '#000091');
    await annotate(page, '.table-editor', 2, '#000091');
    await annotate(page, '#save-source-btn', 3, '#E1000F');
    await cropScreenshot(page, '#manual-source-modal .modal', 'guide-A2-sources-manual-modal.png', 8);
    await clearAnnotations(page);

    // Close modal
    await page.evaluate(() => {
      const overlay = document.querySelector('#manual-source-modal') as HTMLElement;
      if (overlay) overlay.style.display = 'none';
    });

    // --- A3: Builder page - select source ---
    await page.goto('/apps/builder/');
    await page.waitForTimeout(2000);
    // Select the manual source
    const sourceSelect = page.locator('#saved-source');
    await sourceSelect.selectOption('src-manual-regions');
    await page.waitForTimeout(300);
    // Click load
    await page.click('#load-fields-btn');
    await page.waitForTimeout(2000);

    // Annotate step 1
    await annotate(page, '#section-source', 1, '#000091');
    await fullScreenshot(page, 'guide-A3-builder-source-loaded.png');
    await clearAnnotations(page);

    // --- A4: Builder - select chart type ---
    // Expand type section
    await page.evaluate(() => {
      const section = document.querySelector('#section-type') as HTMLElement;
      if (section) section.classList.remove('collapsed');
    });
    await page.waitForTimeout(300);
    // Click "Barres"
    await page.click('.chart-type-btn[data-type="bar"]');
    await page.waitForTimeout(300);
    await annotate(page, '.chart-type-grid', 2, '#000091');
    await cropScreenshot(page, '#section-type', 'guide-A4-builder-chart-type.png');
    await clearAnnotations(page);

    // --- A5: Builder - configure and generate ---
    // Expand data section
    await page.evaluate(() => {
      const section = document.querySelector('#section-data') as HTMLElement;
      if (section) section.classList.remove('collapsed');
    });
    await page.waitForTimeout(300);

    // Select fields
    const labelField = page.locator('#label-field');
    const valueField = page.locator('#value-field');
    const labelOptions = await labelField.locator('option').allTextContents();
    if (labelOptions.some(o => o.includes('region'))) {
      await labelField.selectOption({ label: labelOptions.find(o => o.includes('region'))! });
    }
    const valueOptions = await valueField.locator('option').allTextContents();
    if (valueOptions.some(o => o.includes('PIB'))) {
      await valueField.selectOption({ label: valueOptions.find(o => o.includes('PIB'))! });
    }

    // Set title
    await page.evaluate(() => {
      const section = document.querySelector('#section-appearance') as HTMLElement;
      if (section) section.classList.remove('collapsed');
    });
    await page.fill('#chart-title', 'PIB par region francaise');
    await page.fill('#chart-subtitle', 'Source : donnees manuelles');

    // Click generate
    await page.click('#generate-btn');
    await page.waitForTimeout(3000);

    // Screenshot of the full builder with result
    await annotate(page, '#generate-btn', 3, '#E1000F');
    await fullScreenshot(page, 'guide-A5-builder-generated.png');
    await clearAnnotations(page);

    // --- A6: Builder - preview panel ---
    await cropScreenshot(page, 'app-preview-panel', 'guide-A6-builder-preview.png');

    // --- A7: Builder - code tab ---
    // Click code tab
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('app-preview-panel .tab-btn, app-preview-panel [data-tab="code"]');
      tabs.forEach((t: any) => {
        if (t.textContent?.includes('Code') || t.dataset?.tab === 'code') t.click();
      });
    });
    await page.waitForTimeout(500);
    await annotate(page, '#copy-code-btn', 1, '#000091');
    await cropScreenshot(page, 'app-preview-panel', 'guide-A7-builder-code.png');
    await clearAnnotations(page);
  });

  // ========================================================================
  // PARCOURS B : Source Grist -> Builder dynamique
  // ========================================================================
  test('Parcours B: Grist + Builder dynamique', async ({ page }) => {
    await setupStorage(page);
    await page.setViewportSize({ width: 1400, height: 900 });

    // --- B1: Sources - connection modal Grist ---
    await page.goto('/apps/sources/');
    await page.waitForTimeout(2000);
    await page.click('#add-connection-btn');
    await page.waitForTimeout(500);
    // Fill Grist connection details
    await page.fill('#conn-name', 'Grist Numerique (public)');
    await page.fill('#conn-url', 'https://grist.numerique.gouv.fr');
    await page.locator('label[for="conn-public"]').click();
    await page.waitForTimeout(300);
    await annotate(page, '#conn-name', 1, '#000091');
    await annotate(page, '#conn-url', 2, '#000091');
    await annotate(page, '#conn-public', 3, '#000091');
    await annotate(page, '#save-connection-btn', 4, '#E1000F');
    await cropScreenshot(page, '#connection-modal .modal', 'guide-B1-sources-grist-modal.png', 8);
    await clearAnnotations(page);
    // Close modal
    await page.evaluate(() => {
      const overlay = document.querySelector('#connection-modal') as HTMLElement;
      if (overlay) overlay.style.display = 'none';
    });

    // --- B2: Sources - sidebar with Grist connection ---
    // Click on the Grist connection card if it exists
    await page.waitForTimeout(500);
    const gristCard = page.locator('.connection-card').filter({ hasText: 'Grist' }).first();
    if (await gristCard.isVisible()) {
      await gristCard.click();
      await page.waitForTimeout(3000);
    }
    await annotate(page, '.sidebar', 1, '#000091');
    await outline(page, '#main-content', '#000091');
    await fullScreenshot(page, 'guide-B2-sources-grist-explorer.png');
    await clearAnnotations(page);

    // --- B3: Builder - Grist source + dynamic mode ---
    await page.goto('/apps/builder/');
    await page.waitForTimeout(2000);
    const builderSourceSelect = page.locator('#saved-source');
    await builderSourceSelect.selectOption('src-grist-poc2');
    await page.click('#load-fields-btn');
    await page.waitForTimeout(2000);

    // Show generation mode section (for Grist sources)
    await page.evaluate(() => {
      const section = document.querySelector('#section-generation-mode') as HTMLElement;
      if (section) {
        section.style.display = '';
        section.classList.remove('collapsed');
      }
    });
    // Select dynamic mode
    await page.locator('label[for="mode-dynamic"]').click();
    await page.waitForTimeout(300);
    await annotate(page, '#section-generation-mode', 1, '#E1000F');
    await cropScreenshot(page, '#section-generation-mode', 'guide-B3-builder-dynamic-mode.png', 24);
    await clearAnnotations(page);

    // --- B4: Full builder with Grist in dynamic mode ---
    // Expand sections and configure
    await page.evaluate(() => {
      document.querySelectorAll('.config-section').forEach((s: any) => s.classList.remove('collapsed'));
    });
    await page.waitForTimeout(300);
    await page.click('.chart-type-btn[data-type="bar"]');

    // Select fields
    const gristLabelField = page.locator('#label-field');
    const gristValueField = page.locator('#value-field');
    const gristLabelOptions = await gristLabelField.locator('option').allTextContents();
    if (gristLabelOptions.some(o => o.includes('Pays'))) {
      await gristLabelField.selectOption({ label: gristLabelOptions.find(o => o.includes('Pays'))! });
    }
    const gristValueOptions = await gristValueField.locator('option').allTextContents();
    if (gristValueOptions.some(o => o.includes('PIB'))) {
      await gristValueField.selectOption({ label: gristValueOptions.find(o => o.includes('PIB'))! });
    }

    await page.fill('#chart-title', 'PIB par pays (Grist)');
    await page.fill('#chart-subtitle', 'Source : grist.numerique.gouv.fr');
    await page.click('#generate-btn');
    await page.waitForTimeout(3000);

    // Switch to code tab to show dynamic code
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('app-preview-panel .tab-btn, app-preview-panel [data-tab="code"]');
      tabs.forEach((t: any) => {
        if (t.textContent?.includes('Code') || t.dataset?.tab === 'code') t.click();
      });
    });
    await page.waitForTimeout(500);
    await fullScreenshot(page, 'guide-B4-builder-grist-code.png');
  });

  // ========================================================================
  // PARCOURS C : Builder-IA
  // ========================================================================
  test('Parcours C: Builder-IA', async ({ page }) => {
    await setupStorage(page);
    await page.setViewportSize({ width: 1400, height: 900 });

    await page.goto('/apps/builder-ia/');
    await page.waitForTimeout(2000);

    // --- C1: Builder-IA overview ---
    // Select a source
    const iaSourceSelect = page.locator('#saved-source');
    if (await iaSourceSelect.isVisible()) {
      await iaSourceSelect.selectOption('src-api-ods');
      await page.waitForTimeout(300);
      await page.click('#load-fields-btn');
      await page.waitForTimeout(2000);
    }

    await annotate(page, '#section-source', 1, '#000091');
    await annotate(page, '.chat-container', 2, '#000091');
    await fullScreenshot(page, 'guide-C1-builder-ia-overview.png');
    await clearAnnotations(page);

    // --- C2: Chat area with simulated messages ---
    // Inject fake chat messages to show what a conversation looks like
    await page.evaluate(() => {
      const chat = document.querySelector('#chat-messages') as HTMLElement;
      if (!chat) return;
      chat.innerHTML = '';

      // User message
      const userMsg = document.createElement('div');
      userMsg.className = 'chat-message user';
      userMsg.textContent = 'Fais-moi un graphique en barres des beneficiaires par region';
      chat.appendChild(userMsg);

      // Assistant message
      const assistantMsg = document.createElement('div');
      assistantMsg.className = 'chat-message assistant';
      assistantMsg.innerHTML = `<p>Je cree un graphique en barres montrant le nombre de beneficiaires par region.</p>
<pre><code>{
  "action": "createChart",
  "config": {
    "type": "bar",
    "labelField": "nom_region",
    "valueField": "nombre_beneficiaires",
    "aggregation": "sum",
    "sortOrder": "desc",
    "limit": 10,
    "title": "Beneficiaires par region",
    "subtitle": "Industrie du futur"
  }
}</code></pre>`;
      chat.appendChild(assistantMsg);

      // Suggestions
      const suggestions = document.createElement('div');
      suggestions.className = 'chat-suggestions';
      ['Ajoute un sous-titre', 'Passe en camembert', 'Filtre sur IDF'].forEach(text => {
        const btn = document.createElement('button');
        btn.className = 'chat-suggestion';
        btn.textContent = text;
        suggestions.appendChild(btn);
      });
      chat.appendChild(suggestions);
    });
    await page.waitForTimeout(300);
    await cropScreenshot(page, '.chat-container', 'guide-C2-builder-ia-chat.png', 8);

    // --- C3: Full view with preview ---
    await fullScreenshot(page, 'guide-C3-builder-ia-result.png');
  });

  // ========================================================================
  // PARCOURS D : Playground
  // ========================================================================
  test('Parcours D: Playground', async ({ page }) => {
    await setupStorage(page);
    await page.setViewportSize({ width: 1400, height: 900 });

    await page.goto('/apps/playground/');
    await page.waitForTimeout(3000);

    // --- D1: Playground overview with default example ---
    await annotate(page, '.example-selector', 1, '#000091');
    await annotate(page, '.editor-toolbar', 2, '#000091');
    await fullScreenshot(page, 'guide-D1-playground-overview.png');
    await clearAnnotations(page);

    // --- D2: Select bar chart example (direct mode) ---
    await page.selectOption('#example-select', 'direct-bar');
    // Confirm dialog may appear when switching examples
    const confirm1 = page.locator('[data-action="confirm"]');
    if (await confirm1.isVisible({ timeout: 1000 }).catch(() => false)) await confirm1.click();
    await page.waitForTimeout(500);
    await page.click('#run-btn');
    await page.waitForTimeout(3000);
    await fullScreenshot(page, 'guide-D2-playground-dsfr-bar.png');

    // --- D3: Select query bar example ---
    await page.selectOption('#example-select', 'query-bar');
    const confirm2 = page.locator('[data-action="confirm"]');
    if (await confirm2.isVisible({ timeout: 1000 }).catch(() => false)) await confirm2.click();
    await page.waitForTimeout(500);
    await page.click('#run-btn');
    await page.waitForTimeout(4000);

    await annotate(page, '#run-btn', 1, '#E1000F');
    await annotate(page, '#save-btn', 2, '#000091');
    await fullScreenshot(page, 'guide-D3-playground-dashboard.png');
    await clearAnnotations(page);

    // --- D4: Playground with dsfr-data-source line chart ---
    await page.selectOption('#example-select', 'direct-line');
    const confirm3 = page.locator('[data-action="confirm"]');
    if (await confirm3.isVisible({ timeout: 1000 }).catch(() => false)) await confirm3.click();
    await page.waitForTimeout(500);
    await page.click('#run-btn');
    await page.waitForTimeout(5000);
    await fullScreenshot(page, 'guide-D4-playground-dsfr-data-source.png');
  });

  // ========================================================================
  // PARCOURS E : Dashboard
  // ========================================================================
  test('Parcours E: Dashboard', async ({ page }) => {
    await setupStorage(page);
    await page.setViewportSize({ width: 1400, height: 900 });

    await page.goto('/apps/dashboard/');
    await page.waitForTimeout(2000);

    // --- E1: Dashboard overview (empty) ---
    await annotate(page, '.widget-library', 1, '#000091');
    await annotate(page, '.vde-canvas, .dashboard-grid, .vde-preview', 2, '#000091');
    await fullScreenshot(page, 'guide-E1-dashboard-overview.png');
    await clearAnnotations(page);

    // --- E2: Load saved dashboard ---
    // Try clicking open button if available
    const openBtn = page.locator('button').filter({ hasText: /Ouvrir|Charger/ }).first();
    if (await openBtn.isVisible().catch(() => false)) {
      await openBtn.click();
      await page.waitForTimeout(1000);
      // Select dashboard from list if modal opens
      const dashItem = page.locator('.dashboard-item, [data-dashboard-id]').first();
      if (await dashItem.isVisible().catch(() => false)) {
        await dashItem.click();
        await page.waitForTimeout(1000);
      }
    }
    await fullScreenshot(page, 'guide-E2-dashboard-loaded.png');

    // --- E3: Widget library (sidebar detail) ---
    await cropScreenshot(page, '.vde-sidebar, .sidebar', 'guide-E3-dashboard-sidebar.png', 8);

    // --- E4: Toolbar ---
    const toolbar = page.locator('.vde-toolbar').first();
    if (await toolbar.isVisible().catch(() => false)) {
      await annotate(page, '.vde-toolbar', 0, '#000091');
      await cropScreenshot(page, '.vde-toolbar', 'guide-E4-dashboard-toolbar.png', 8);
      await clearAnnotations(page);
    }
  });

  // ========================================================================
  // PARCOURS F : API REST -> Builder
  // ========================================================================
  test('Parcours F: API externe + Builder', async ({ page }) => {
    await setupStorage(page);
    await page.setViewportSize({ width: 1400, height: 900 });

    // --- F1: Sources - API connection modal ---
    await page.goto('/apps/sources/');
    await page.waitForTimeout(2000);
    await page.click('#add-connection-btn');
    await page.waitForTimeout(500);
    // Switch to API type
    await page.locator('label[for="conn-type-api"]').click();
    await page.waitForTimeout(300);
    await page.fill('#conn-name', 'Industrie du futur (ODS)');
    await page.fill('#api-url', 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/industrie-du-futur/records');
    await page.fill('#api-data-path', 'results');
    await page.waitForTimeout(300);
    await annotate(page, 'input[name="conn-type"][value="api"]', 1, '#000091');
    await annotate(page, '#api-url', 2, '#000091');
    await annotate(page, '#api-data-path', 3, '#000091');
    await annotate(page, '#save-connection-btn', 4, '#E1000F');
    await cropScreenshot(page, '#connection-modal .modal', 'guide-F1-sources-api-modal.png', 8);
    await clearAnnotations(page);
    // Close modal
    await page.evaluate(() => {
      const overlay = document.querySelector('#connection-modal') as HTMLElement;
      if (overlay) overlay.style.display = 'none';
    });

    // --- F2: Builder with API source ---
    await page.goto('/apps/builder/');
    await page.waitForTimeout(2000);
    await page.locator('#saved-source').selectOption('src-api-ods');
    await page.click('#load-fields-btn');
    await page.waitForTimeout(2000);

    // Expand all sections
    await page.evaluate(() => {
      document.querySelectorAll('.config-section').forEach((s: any) => s.classList.remove('collapsed'));
    });
    await page.waitForTimeout(300);

    // Select line chart
    await page.click('.chart-type-btn[data-type="line"]');
    await page.waitForTimeout(300);

    // Configure fields
    const apiLabelField = page.locator('#label-field');
    const apiValueField = page.locator('#value-field');
    const apiLabelOptions = await apiLabelField.locator('option').allTextContents();
    if (apiLabelOptions.some(o => o.includes('nom_region'))) {
      await apiLabelField.selectOption({ label: apiLabelOptions.find(o => o.includes('nom_region'))! });
    }
    const apiValueOptions = await apiValueField.locator('option').allTextContents();
    if (apiValueOptions.some(o => o.includes('nombre_beneficiaires'))) {
      await apiValueField.selectOption({ label: apiValueOptions.find(o => o.includes('nombre_beneficiaires'))! });
    }

    await page.fill('#chart-title', 'Beneficiaires Industrie du futur');
    await page.fill('#chart-subtitle', 'Source : data.economie.gouv.fr');

    // Generate
    await page.click('#generate-btn');
    await page.waitForTimeout(3000);
    await fullScreenshot(page, 'guide-F2-builder-api-chart.png');

    // --- F3: Code tab ---
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('app-preview-panel .tab-btn, app-preview-panel [data-tab="code"]');
      tabs.forEach((t: any) => {
        if (t.textContent?.includes('Code') || t.dataset?.tab === 'code') t.click();
      });
    });
    await page.waitForTimeout(500);
    await cropScreenshot(page, 'app-preview-panel', 'guide-F3-builder-api-code.png');
  });

  // ========================================================================
  // PARCOURS G : Monitoring
  // ========================================================================
  test('Parcours G: Monitoring', async ({ page }) => {
    await setupStorage(page);
    await page.setViewportSize({ width: 1400, height: 900 });

    await page.goto('/apps/monitoring/');
    await page.waitForTimeout(4000);

    // --- G1: Monitoring overview ---
    await fullScreenshot(page, 'guide-G1-monitoring-overview.png');

    // --- G2: KPI row ---
    const kpiRow = page.locator('#kpi-row');
    if (await kpiRow.isVisible().catch(() => false)) {
      await annotate(page, '#kpi-row', 1, '#000091');
      await cropScreenshot(page, '#kpi-row', 'guide-G2-monitoring-kpis.png');
      await clearAnnotations(page);
    }

    // --- G3: Filters and table ---
    await annotate(page, '.monitoring-filters, .fr-card', 2, '#000091');
    await annotate(page, '#monitoring-table, .monitoring-table', 3, '#000091');
    await fullScreenshot(page, 'guide-G3-monitoring-filters-table.png');
    await clearAnnotations(page);
  });

  // ========================================================================
  // BONUS : Component demo pages
  // ========================================================================
  test('Component demo screenshots', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });

    // KPI demo
    await page.goto('/specs/components/dsfr-data-kpi.html');
    await page.waitForTimeout(4000);
    await fullScreenshot(page, 'guide-comp-kpi.png');

    // Datalist demo
    await page.goto('/specs/components/dsfr-data-list.html');
    await page.waitForTimeout(4000);
    await fullScreenshot(page, 'guide-comp-datalist.png');

    // Chart demo
    await page.goto('/specs/components/dsfr-data-chart.html');
    await page.waitForTimeout(6000);
    await fullScreenshot(page, 'guide-comp-chart.png');

    // Query demo
    await page.goto('/specs/components/dsfr-data-query.html');
    await page.waitForTimeout(4000);
    await fullScreenshot(page, 'guide-comp-query.png');
  });

  // ========================================================================
  // Hub / Home page
  // ========================================================================
  test('Hub screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/');
    await page.waitForTimeout(2000);
    await fullScreenshot(page, 'guide-hub.png');
  });
});
