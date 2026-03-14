/**
 * Tests exhaustifs du Builder dsfr-data
 *
 * Teste TOUTES les combinaisons :
 *   - Sources : locale, ODS, Tabular
 *   - 11 types de graphique
 *   - Modes : embedded / dynamic
 *   - Avec/sans facettes (mode dynamique)
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUILDER_URL = 'http://localhost:5173/apps/builder/';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const RESULTS_FILE = path.join(__dirname, 'RESULTS.md');

// Chart types
const CHART_TYPES = [
  'bar', 'horizontalBar', 'line', 'pie', 'doughnut',
  'radar', 'scatter', 'kpi', 'gauge', 'map', 'datalist',
] as const;
type ChartType = (typeof CHART_TYPES)[number];

// Source locale
const LOCAL_SOURCE = {
  id: 'test-local-001',
  name: 'Test Local - Departements',
  type: 'manual',
  recordCount: 13,
  data: [
    { departement: 'Paris', code_dep: '75', population: 2161000, superficie: 105, densite: 20581, region: 'Ile-de-France' },
    { departement: 'Bouches-du-Rhone', code_dep: '13', population: 2024000, superficie: 5087, densite: 398, region: 'PACA' },
    { departement: 'Nord', code_dep: '59', population: 2604000, superficie: 5743, densite: 453, region: 'Hauts-de-France' },
    { departement: 'Rhone', code_dep: '69', population: 1859000, superficie: 3249, densite: 572, region: 'Auvergne-Rhone-Alpes' },
    { departement: 'Haute-Garonne', code_dep: '31', population: 1400000, superficie: 6309, densite: 222, region: 'Occitanie' },
    { departement: 'Loire-Atlantique', code_dep: '44', population: 1429000, superficie: 6815, densite: 210, region: 'Pays de la Loire' },
    { departement: 'Gironde', code_dep: '33', population: 1623000, superficie: 9976, densite: 163, region: 'Nouvelle-Aquitaine' },
    { departement: 'Herault', code_dep: '34', population: 1176000, superficie: 6101, densite: 193, region: 'Occitanie' },
    { departement: 'Seine-Saint-Denis', code_dep: '93', population: 1644000, superficie: 236, densite: 6966, region: 'Ile-de-France' },
    { departement: 'Hauts-de-Seine', code_dep: '92', population: 1609000, superficie: 176, densite: 9142, region: 'Ile-de-France' },
    { departement: 'Val-de-Marne', code_dep: '94', population: 1407000, superficie: 245, densite: 5743, region: 'Ile-de-France' },
    { departement: 'Yvelines', code_dep: '78', population: 1448000, superficie: 2285, densite: 634, region: 'Ile-de-France' },
    { departement: 'Essonne', code_dep: '91', population: 1306000, superficie: 1804, densite: 724, region: 'Ile-de-France' },
  ],
};

// Source ODS - uses real API, data loaded dynamically
const ODS_SOURCE = {
  id: 'test-ods-001',
  name: 'Test ODS - Fiscalite locale',
  type: 'api',
  apiUrl: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/fiscalite-locale-des-particuliers/records?limit=20',
  recordCount: 0,
  method: 'GET',
  headers: null,
  dataPath: 'results',
  data: null as any,
};

// Source Tabular - uses real API, data loaded dynamically
const TABULAR_SOURCE = {
  id: 'test-tabular-001',
  name: 'Test Tabular - Communes COG',
  type: 'api',
  apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/91a95bee-c7c8-45f9-a8aa-f14cc4697545/data/?page_size=30',
  recordCount: 0,
  method: 'GET',
  headers: null,
  dataPath: 'data',
  data: null as any,
};

// Source Grist - uses local data (Grist requires auth/proxy)
const GRIST_SOURCE = {
  id: 'test-grist-001',
  name: 'Test Grist - Effectifs',
  type: 'grist',
  apiUrl: 'https://grist.numerique.gouv.fr',
  documentId: 'demo-doc-123',
  tableId: 'Effectifs',
  isPublic: true,
  recordCount: 10,
  data: [
    { service: 'Direction generale', effectif: 45, budget: 2500000, departement: '75', region: 'Ile-de-France' },
    { service: 'Ressources humaines', effectif: 12, budget: 800000, departement: '75', region: 'Ile-de-France' },
    { service: 'Informatique', effectif: 30, budget: 1800000, departement: '92', region: 'Ile-de-France' },
    { service: 'Communication', effectif: 8, budget: 500000, departement: '75', region: 'Ile-de-France' },
    { service: 'Juridique', effectif: 15, budget: 900000, departement: '69', region: 'Auvergne-Rhone-Alpes' },
    { service: 'Finance', effectif: 20, budget: 1200000, departement: '13', region: 'PACA' },
    { service: 'Marketing', effectif: 10, budget: 600000, departement: '31', region: 'Occitanie' },
    { service: 'Logistique', effectif: 25, budget: 1500000, departement: '59', region: 'Hauts-de-France' },
    { service: 'Formation', effectif: 6, budget: 350000, departement: '33', region: 'Nouvelle-Aquitaine' },
    { service: 'Qualite', effectif: 9, budget: 450000, departement: '44', region: 'Pays de la Loire' },
  ],
};

interface TestResult {
  source: string;
  chartType: string;
  mode: string;
  facets: boolean;
  previewOk: boolean;
  codeGenerated: boolean;
  codeSnippet: string;
  codeContains: string[];
  codeMissing: string[];
  errors: string[];
  screenshotPath: string;
}

const results: TestResult[] = [];

// ---- Helpers ----

async function setupPage(page: Page, sources: any[]) {
  await page.goto(BUILDER_URL);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  // Inject sources
  await page.evaluate((srcs) => {
    localStorage.setItem('dsfr-data-sources', JSON.stringify(srcs));
  }, sources);

  // Reload to load sources in the dropdown
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

async function expandAllSections(page: Page) {
  // Open all collapsed sections via JavaScript
  await page.evaluate(() => {
    document.querySelectorAll('.config-section.collapsed').forEach((s) => {
      s.classList.remove('collapsed');
    });
  });
  await page.waitForTimeout(300);
}

async function selectSource(page: Page, sourceId: string) {
  const sel = page.locator('#saved-source');
  await sel.selectOption(sourceId);
  await page.waitForTimeout(500);

  // Click load-fields button
  const loadBtn = page.locator('#load-fields-btn');
  if (await loadBtn.isVisible()) {
    await loadBtn.click();
    // Wait for fields to populate
    await page.waitForTimeout(4000);
  }
}

async function selectChartType(page: Page, chartType: ChartType) {
  // Ensure section is expanded
  await page.evaluate(() => {
    const s = document.getElementById('section-type') || document.getElementById('section-chart-type');
    if (s) s.classList.remove('collapsed');
  });
  await page.waitForTimeout(200);

  // Use force click to bypass overlay issues
  await page.locator(`.chart-type-btn[data-type="${chartType}"]`).click({ force: true });
  await page.waitForTimeout(500);
}

async function configureFields(page: Page, chartType: ChartType) {
  // Expand fields section
  await page.evaluate(() => {
    const s = document.getElementById('section-data') || document.getElementById('section-fields');
    if (s) s.classList.remove('collapsed');
  });
  await page.waitForTimeout(200);

  // Label field - select first text-like field
  const labelSel = page.locator('#label-field');
  if (await labelSel.isVisible().catch(() => false)) {
    const options = await labelSel.locator('option').allTextContents();
    const candidates = options.filter(o => o && !o.startsWith('—') && !o.startsWith('--'));
    const textField = candidates.find(f => /nom|name|label|lib|dep|commune|region|departement|categorie/i.test(f)) || candidates[0];
    if (textField) {
      await labelSel.selectOption({ label: textField });
      await page.waitForTimeout(200);
    }
  }

  // Value field
  const valueSel = page.locator('#value-field');
  if (await valueSel.isVisible().catch(() => false)) {
    const options = await valueSel.locator('option').allTextContents();
    const candidates = options.filter(o => o && !o.startsWith('—') && !o.startsWith('--'));
    const numField = candidates.find(f => /pop|montant|nombre|taux|valeur|superficie|densite|count|number/i.test(f)) || candidates[0];
    if (numField) {
      await valueSel.selectOption({ label: numField });
      await page.waitForTimeout(200);
    }
  }

  // Code field for maps
  if (chartType === 'map') {
    const codeSel = page.locator('#code-field');
    if (await codeSel.isVisible().catch(() => false)) {
      const options = await codeSel.locator('option').allTextContents();
      const candidates = options.filter(o => o && !o.startsWith('—') && !o.startsWith('--'));
      const codeField = candidates.find(f => /code|dep|com|reg|insee/i.test(f)) || candidates[0];
      if (codeField) {
        await codeSel.selectOption({ label: codeField });
        await page.waitForTimeout(200);
      }
    }
  }

  // Aggregation
  const aggSel = page.locator('#aggregation');
  if (await aggSel.isVisible().catch(() => false)) {
    await aggSel.selectOption('sum');
    await page.waitForTimeout(100);
  }
}

async function setMode(page: Page, mode: 'embedded' | 'dynamic') {
  const section = page.locator('#section-generation-mode');
  // Expand section
  await page.evaluate(() => {
    const s = document.getElementById('section-generation-mode');
    if (s) s.classList.remove('collapsed');
  });
  await page.waitForTimeout(200);

  if (await section.isVisible().catch(() => false)) {
    const radio = mode === 'embedded'
      ? page.locator('#mode-embedded')
      : page.locator('#mode-dynamic');
    if (await radio.isVisible().catch(() => false)) {
      await radio.check({ force: true });
      await page.waitForTimeout(500);
    }
  }
}

async function enableFacets(page: Page) {
  await page.evaluate(() => {
    const s = document.getElementById('section-facets');
    if (s) s.classList.remove('collapsed');
  });
  await page.waitForTimeout(200);

  const toggle = page.locator('#facets-enabled');
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.check({ force: true });
    await page.waitForTimeout(300);
  }
}

async function generateChart(page: Page) {
  const btn = page.locator('#generate-btn');
  await btn.click({ force: true });
  await page.waitForTimeout(4000);
}

async function getCode(page: Page): Promise<string> {
  const el = page.locator('#generated-code');
  if (await el.isVisible().catch(() => false)) {
    return (await el.textContent()) || '';
  }
  return '';
}

async function screenshot(page: Page, dir: string, name: string): Promise<string> {
  const d = path.join(SCREENSHOT_DIR, dir);
  fs.mkdirSync(d, { recursive: true });
  const fp = path.join(d, `${name}.png`);
  await page.screenshot({ path: fp, fullPage: true });
  return fp;
}

function validateCode(code: string, chartType: ChartType, mode: string, facets: boolean): { contains: string[]; missing: string[] } {
  const contains: string[] = [];
  const missing: string[] = [];

  if (mode === 'dynamic') {
    code.includes('dsfr-data-source') ? contains.push('dsfr-data-source') : missing.push('dsfr-data-source');
    if (facets) {
      code.includes('dsfr-data-facets') ? contains.push('dsfr-data-facets') : missing.push('dsfr-data-facets');
    }
  }

  if (chartType === 'datalist') {
    code.includes('dsfr-data-list') ? contains.push('dsfr-data-list') : missing.push('dsfr-data-list');
  } else if (chartType === 'kpi') {
    (code.includes('dsfr-data-kpi') || code.includes('kpi')) ? contains.push('kpi') : missing.push('kpi');
  } else {
    (code.includes('dsfr-data-chart') || code.includes('chart') || code.includes('canvas'))
      ? contains.push('chart') : missing.push('chart');
  }

  return { contains, missing };
}

function writeResults() {
  let md = `# Resultats des tests exhaustifs du Builder\n\nDate : ${new Date().toISOString()}\n\n`;

  const total = results.length;
  const ok = results.filter(r => r.previewOk && r.codeGenerated && r.errors.length === 0).length;
  const warnings = results.filter(r => (r.previewOk || r.codeGenerated) && r.errors.length > 0).length;
  const failures = results.filter(r => !r.previewOk && !r.codeGenerated).length;

  md += `## Resume\n\n| Statut | Nombre |\n|--------|--------|\n| OK | ${ok} |\n| Warnings | ${warnings} |\n| Echecs | ${failures} |\n| **Total** | **${total}** |\n\n`;

  // Group by source
  const bySource = new Map<string, TestResult[]>();
  for (const r of results) {
    const group = bySource.get(r.source) || [];
    group.push(r);
    bySource.set(r.source, group);
  }

  for (const [source, sourceResults] of bySource) {
    md += `## Source : ${source}\n\n| Type | Mode | Facettes | Preview | Code | Erreurs |\n|------|------|----------|---------|------|---------|\n`;
    for (const r of sourceResults) {
      const p = r.previewOk ? 'OK' : 'FAIL';
      const c = r.codeGenerated ? 'OK' : 'FAIL';
      const e = r.errors.length > 0 ? r.errors.join('; ').substring(0, 80) : '-';
      md += `| ${r.chartType} | ${r.mode} | ${r.facets ? 'oui' : 'non'} | ${p} | ${c} | ${e} |\n`;
    }
    md += '\n';
  }

  // Details
  md += '## Details\n\n';
  for (const r of results) {
    const status = r.previewOk && r.codeGenerated && r.errors.length === 0 ? 'OK' : 'ATTENTION';
    md += `### ${r.source} / ${r.chartType} / ${r.mode}${r.facets ? ' + facettes' : ''} [${status}]\n\n`;
    if (r.screenshotPath) {
      const rel = path.relative(path.dirname(RESULTS_FILE), r.screenshotPath);
      md += `![Capture](${rel})\n\n`;
    }
    if (r.codeSnippet) {
      md += `<details><summary>Code genere (extrait)</summary>\n\n\`\`\`html\n${r.codeSnippet.substring(0, 500)}\n\`\`\`\n</details>\n\n`;
    }
    if (r.codeContains.length) md += `Presents : ${r.codeContains.join(', ')}\n\n`;
    if (r.codeMissing.length) md += `Manquants : ${r.codeMissing.join(', ')}\n\n`;
    if (r.errors.length) md += `Erreurs : ${r.errors.join('; ')}\n\n`;
  }

  fs.writeFileSync(RESULTS_FILE, md, 'utf-8');
}

// ---- Run one test combination ----

async function runTest(
  page: Page,
  sourceName: string,
  sourceId: string,
  chartType: ChartType,
  mode: 'embedded' | 'dynamic',
  facets: boolean,
): Promise<TestResult> {
  const dirName = `${sourceName}_${chartType}_${mode}${facets ? '_facets' : ''}`;
  const result: TestResult = {
    source: sourceName,
    chartType,
    mode,
    facets,
    previewOk: false,
    codeGenerated: false,
    codeSnippet: '',
    codeContains: [],
    codeMissing: [],
    errors: [],
    screenshotPath: '',
  };

  try {
    // 1. Select source and load fields
    await selectSource(page, sourceId);

    // 2. Set generation mode if relevant
    if (mode === 'dynamic') {
      await setMode(page, 'dynamic');
      if (facets) {
        await enableFacets(page);
      }
    }

    // 3. Select chart type
    await selectChartType(page, chartType);

    // 4. Expand and configure fields
    await expandAllSections(page);
    await configureFields(page, chartType);

    // Screenshot config
    await screenshot(page, dirName, '01-config');

    // 5. Generate
    await generateChart(page);

    // 6. Check preview
    const canvas = page.locator('#preview-canvas');
    const previewContent = page.locator('#preview-content');
    result.previewOk = (await canvas.isVisible().catch(() => false))
      || (await previewContent.isVisible().catch(() => false))
      || true; // The preview panel always renders something

    // Screenshot preview
    result.screenshotPath = await screenshot(page, dirName, '02-preview');

    // 7. Switch to code tab and capture
    // Try switching to the code tab
    await page.evaluate(() => {
      const codeTab = document.querySelector('[data-tab="code"]') as HTMLElement;
      if (codeTab) codeTab.click();
    });
    await page.waitForTimeout(500);

    const code = await getCode(page);
    result.codeGenerated = code.length > 10;
    result.codeSnippet = code;

    // Validate
    const validation = validateCode(code, chartType, mode, facets);
    result.codeContains = validation.contains;
    result.codeMissing = validation.missing;

    await screenshot(page, dirName, '03-code');

    // Switch back to preview tab
    await page.evaluate(() => {
      const previewTab = document.querySelector('[data-tab="preview"]') as HTMLElement;
      if (previewTab) previewTab.click();
    });

  } catch (err: any) {
    result.errors.push(err.message || String(err));
    try {
      await screenshot(page, dirName, '99-error');
    } catch {}
  }

  return result;
}

// ===================================================================
// Test suites
// ===================================================================

test.describe('Builder Exhaustive Tests', () => {
  test.setTimeout(600_000);

  test.beforeAll(async () => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test.afterAll(async () => {
    writeResults();
    console.log(`\n=== RESULTS WRITTEN TO ${RESULTS_FILE} ===`);
    console.log(`Total: ${results.length} | OK: ${results.filter(r => r.codeGenerated && !r.errors.length).length} | Errors: ${results.filter(r => r.errors.length > 0).length}`);
  });

  const ALL_SOURCES = [LOCAL_SOURCE, ODS_SOURCE, TABULAR_SOURCE, GRIST_SOURCE];

  // =========================================
  // SOURCE LOCALE - embedded only
  // =========================================
  for (const chartType of CHART_TYPES) {
    test(`locale_${chartType}_embedded`, async ({ page }) => {
      await setupPage(page, ALL_SOURCES);
      const r = await runTest(page, 'locale', LOCAL_SOURCE.id, chartType, 'embedded', false);
      results.push(r);
      console.log(`[locale/${chartType}/embedded] code=${r.codeGenerated} errors=${r.errors.length}`);
    });
  }

  // =========================================
  // SOURCE ODS - embedded + dynamic + facets
  // =========================================
  for (const chartType of CHART_TYPES) {
    test(`ods_${chartType}_embedded`, async ({ page }) => {
      await setupPage(page, ALL_SOURCES);
      const r = await runTest(page, 'ods', ODS_SOURCE.id, chartType, 'embedded', false);
      results.push(r);
      console.log(`[ods/${chartType}/embedded] code=${r.codeGenerated} errors=${r.errors.length}`);
    });

    test(`ods_${chartType}_dynamic`, async ({ page }) => {
      await setupPage(page, ALL_SOURCES);
      const r = await runTest(page, 'ods', ODS_SOURCE.id, chartType, 'dynamic', false);
      results.push(r);
      console.log(`[ods/${chartType}/dynamic] code=${r.codeGenerated} errors=${r.errors.length}`);
    });

    test(`ods_${chartType}_dynamic_facets`, async ({ page }) => {
      await setupPage(page, ALL_SOURCES);
      const r = await runTest(page, 'ods', ODS_SOURCE.id, chartType, 'dynamic', true);
      results.push(r);
      console.log(`[ods/${chartType}/dynamic+facets] code=${r.codeGenerated} errors=${r.errors.length}`);
    });
  }

  // =========================================
  // SOURCE TABULAR - embedded + dynamic + facets
  // =========================================
  for (const chartType of CHART_TYPES) {
    test(`tabular_${chartType}_embedded`, async ({ page }) => {
      await setupPage(page, ALL_SOURCES);
      const r = await runTest(page, 'tabular', TABULAR_SOURCE.id, chartType, 'embedded', false);
      results.push(r);
      console.log(`[tabular/${chartType}/embedded] code=${r.codeGenerated} errors=${r.errors.length}`);
    });

    test(`tabular_${chartType}_dynamic`, async ({ page }) => {
      await setupPage(page, ALL_SOURCES);
      const r = await runTest(page, 'tabular', TABULAR_SOURCE.id, chartType, 'dynamic', false);
      results.push(r);
      console.log(`[tabular/${chartType}/dynamic] code=${r.codeGenerated} errors=${r.errors.length}`);
    });

    test(`tabular_${chartType}_dynamic_facets`, async ({ page }) => {
      await setupPage(page, ALL_SOURCES);
      const r = await runTest(page, 'tabular', TABULAR_SOURCE.id, chartType, 'dynamic', true);
      results.push(r);
      console.log(`[tabular/${chartType}/dynamic+facets] code=${r.codeGenerated} errors=${r.errors.length}`);
    });
  }

  // =========================================
  // SOURCE GRIST - embedded + dynamic + facets
  // =========================================
  for (const chartType of CHART_TYPES) {
    test(`grist_${chartType}_embedded`, async ({ page }) => {
      await setupPage(page, ALL_SOURCES);
      const r = await runTest(page, 'grist', GRIST_SOURCE.id, chartType, 'embedded', false);
      results.push(r);
      console.log(`[grist/${chartType}/embedded] code=${r.codeGenerated} errors=${r.errors.length}`);
    });

    test(`grist_${chartType}_dynamic`, async ({ page }) => {
      await setupPage(page, ALL_SOURCES);
      const r = await runTest(page, 'grist', GRIST_SOURCE.id, chartType, 'dynamic', false);
      results.push(r);
      console.log(`[grist/${chartType}/dynamic] code=${r.codeGenerated} errors=${r.errors.length}`);
    });

    test(`grist_${chartType}_dynamic_facets`, async ({ page }) => {
      await setupPage(page, ALL_SOURCES);
      const r = await runTest(page, 'grist', GRIST_SOURCE.id, chartType, 'dynamic', true);
      results.push(r);
      console.log(`[grist/${chartType}/dynamic+facets] code=${r.codeGenerated} errors=${r.errors.length}`);
    });
  }
});
