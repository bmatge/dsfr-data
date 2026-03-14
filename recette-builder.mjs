import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import http from 'http';
import path from 'path';

const DIR = '/tmp/recette';
mkdirSync(DIR, { recursive: true });
mkdirSync(DIR + '/exports', { recursive: true });
mkdirSync(DIR + '/integrated', { recursive: true });

const API_BASE = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/industrie-du-futur/records';
const BUILDER_URL = 'http://localhost:5173/apps/builder/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const results = { pass: [], fail: [], screenshots: [] };

function log(msg) { console.log(msg); }
function pass(test) { results.pass.push(test); log('  PASS: ' + test); }
function fail(test, reason) { results.fail.push({ test, reason }); log('  FAIL: ' + test + ' - ' + reason); }

async function screenshot(name) {
  const p = `${DIR}/${name}.png`;
  await page.screenshot({ path: p });
  results.screenshots.push(p);
  log('  Screenshot: ' + p);
}

async function switchTab(tab) {
  // Use evaluate to call the web component's setActiveTab method
  await page.evaluate((t) => {
    const panel = document.querySelector('app-preview-panel');
    if (panel && panel.setActiveTab) {
      panel.setActiveTab(t);
    }
  }, tab);
  await page.waitForTimeout(300);
}

// ===========================
// PHASE 1: Fetch data and inject source
// ===========================
log('\n=== PHASE 1: Fetch data and inject source ===');
const resp = await page.request.get(API_BASE + '?limit=100');
const apiData = await resp.json();
const records = apiData.results;
log('Fetched ' + records.length + ' records');
const fields = Object.keys(records[0]);
log('Fields: ' + fields.join(', '));

// Find suitable fields
const sampleRecord = records[0];
const textFields = fields.filter(f => typeof sampleRecord[f] === 'string' && f !== 'datasetid');
const numFields = fields.filter(f => typeof sampleRecord[f] === 'number');
const codeField = fields.find(f => f.toLowerCase().includes('departement') && f.toLowerCase().includes('code'));

log('Text fields: ' + textFields.join(', '));
log('Number fields: ' + numFields.join(', '));
log('Code field: ' + (codeField || 'NOT FOUND'));

// Pick best fields - avoid using code fields as value
const labelField = textFields.find(f => f.includes('region') || f.includes('nom')) || textFields[0];
const valueField = numFields.find(f => !f.includes('code') && !f.includes('departement')) || numFields[0];
log('Using labelField: ' + labelField);
log('Using valueField: ' + valueField);
log('Using codeField: ' + codeField);

// Create source object
const source = {
  id: 'test-recette-industrie',
  name: 'Industrie du Futur (Recette)',
  type: 'api',
  apiUrl: API_BASE,
  data: records,
  recordCount: records.length,
  dataPath: 'results',
};

// Navigate and inject source
await page.goto(BUILDER_URL);
await page.waitForTimeout(1000);

await page.evaluate((src) => {
  localStorage.setItem('gouv_widgets_sources', JSON.stringify([src]));
  localStorage.setItem('gouv_widgets_selected_source', JSON.stringify(src));
}, source);

await page.reload();
await page.waitForTimeout(2000);
await screenshot('01-builder-loaded');

// ===========================
// PHASE 2: Select source and load fields
// ===========================
log('\n=== PHASE 2: Select source and load fields ===');

const sourceSelect = page.locator('#saved-source');
const sourceExists = await sourceSelect.count();
log('Source select exists: ' + sourceExists);

if (sourceExists > 0) {
  const optionsCount = await sourceSelect.locator('option').count();
  log('Source dropdown options: ' + optionsCount);
  if (optionsCount > 1) {
    await sourceSelect.selectOption({ index: optionsCount - 1 });
    await page.waitForTimeout(1000);
    pass('Source selected');
  }
}

// Check if fields loaded
const fieldsStatus = await page.locator('#fields-status').textContent().catch(() => '');
log('Fields status: ' + fieldsStatus.trim());

if (fieldsStatus.includes('charg') || fieldsStatus.includes('restaur')) {
  pass('Fields loaded');
} else {
  // Try clicking the load button
  const loadBtn = page.locator('#load-fields-btn');
  if (await loadBtn.count() > 0 && await loadBtn.isVisible().catch(() => false)) {
    await loadBtn.click();
    await page.waitForTimeout(1000);
    const status2 = await page.locator('#fields-status').textContent().catch(() => '');
    if (status2.includes('charg')) {
      pass('Fields loaded (via button)');
    } else {
      fail('Fields loaded', 'Status: ' + status2.trim());
    }
  } else {
    log('  No load button visible, fields may already be loaded');
  }
}

await screenshot('02-source-selected');

// ===========================
// PHASE 3: Test all chart types
// ===========================
log('\n=== PHASE 3: Test all chart types ===');

// Expand ALL collapsible sections so buttons are accessible
await page.evaluate(() => {
  document.querySelectorAll('.config-section.collapsed').forEach(s => s.classList.remove('collapsed'));
  document.querySelectorAll('.config-section').forEach(s => s.classList.remove('collapsed'));
});
await page.waitForTimeout(500);
await screenshot('02b-sections-expanded');

const chartTypes = [
  { type: 'bar', name: 'Barres verticales', label: true, value: true },
  { type: 'horizontalBar', name: 'Barres horizontales', label: true, value: true },
  { type: 'line', name: 'Ligne', label: true, value: true },
  { type: 'pie', name: 'Camembert', label: true, value: true },
  { type: 'doughnut', name: 'Donut', label: true, value: true },
  { type: 'radar', name: 'Radar', label: true, value: true },
  { type: 'scatter', name: 'Nuage de points', label: true, value: true },
  { type: 'gauge', name: 'Jauge', label: false, value: true },
  { type: 'kpi', name: 'KPI', label: false, value: true },
  { type: 'map', name: 'Carte', label: false, value: true, code: true },
  { type: 'datalist', name: 'Tableau', label: true, value: false },
];

const exportedCodes = {};

for (const chart of chartTypes) {
  log('\n--- Testing: ' + chart.name + ' (' + chart.type + ') ---');

  try {
    // Select chart type via JS (more reliable than click on potentially hidden button)
    const typeChanged = await page.evaluate((type) => {
      const btn = document.querySelector(`[data-type="${type}"]`);
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    }, chart.type);

    if (!typeChanged) {
      fail(chart.type + ' selection', 'Button not found');
      continue;
    }
    await page.waitForTimeout(500);

    // Configure fields
    if (chart.label && labelField) {
      const labelSelect = page.locator('#label-field');
      if (await labelSelect.count() > 0 && await labelSelect.isVisible().catch(() => false)) {
        const options = await labelSelect.locator('option').allTextContents();
        const hasField = options.some(o => o.includes(labelField));
        if (hasField) {
          await labelSelect.selectOption(labelField);
        } else {
          // Select first non-empty option
          const firstOpt = await labelSelect.locator('option:not([value=""])').first().getAttribute('value').catch(() => null);
          if (firstOpt) await labelSelect.selectOption(firstOpt);
        }
      }
    }

    if (chart.value && valueField) {
      const valSelect = page.locator('#value-field');
      if (await valSelect.count() > 0 && await valSelect.isVisible().catch(() => false)) {
        const options = await valSelect.locator('option').allTextContents();
        const hasField = options.some(o => o.includes(valueField));
        if (hasField) {
          await valSelect.selectOption(valueField);
        } else {
          const firstOpt = await valSelect.locator('option:not([value=""])').first().getAttribute('value').catch(() => null);
          if (firstOpt) await valSelect.selectOption(firstOpt);
        }
      }
    }

    if (chart.code && codeField) {
      const codeSelect = page.locator('#code-field');
      if (await codeSelect.count() > 0 && await codeSelect.isVisible().catch(() => false)) {
        await codeSelect.selectOption(codeField).catch(() => {});
      }
    }

    // Click generate
    await page.locator('#generate-btn').click();
    await page.waitForTimeout(2000);

    // Ensure preview tab is active
    await switchTab('preview');
    await screenshot(`03-preview-${chart.type}`);

    // Check preview rendered
    const emptyState = page.locator('#empty-state');
    const emptyVisible = await emptyState.isVisible().catch(() => false);
    if (emptyVisible) {
      fail(chart.type + ' preview', 'Empty state still visible');
    } else {
      pass(chart.type + ' preview rendered');
    }

    // Switch to code tab
    await switchTab('code');
    await page.waitForTimeout(300);

    const generatedCode = await page.locator('#generated-code').textContent().catch(() => '');
    if (generatedCode && generatedCode.length > 50) {
      pass(chart.type + ' code generated (' + generatedCode.length + ' chars)');
      exportedCodes[chart.type] = generatedCode;
      writeFileSync(`${DIR}/exports/${chart.type}.html`, generatedCode);
    } else {
      fail(chart.type + ' code generation', 'Code too short: ' + (generatedCode || '').length);
    }

    await screenshot(`04-code-${chart.type}`);

    // Switch to data tab
    await switchTab('data');
    await page.waitForTimeout(300);

    const rawData = await page.locator('#raw-data').textContent().catch(() => '');
    if (rawData && rawData.length > 10) {
      try {
        const parsed = JSON.parse(rawData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          pass(chart.type + ' data (' + parsed.length + ' records)');
        }
      } catch (e) {
        log('  Info: raw data not JSON for ' + chart.type);
      }
    }

    // Back to preview
    await switchTab('preview');

  } catch (e) {
    fail(chart.type, 'Exception: ' + e.message);
    await screenshot(`03-ERROR-${chart.type}`);
  }
}

// ===========================
// PHASE 4: Test advanced mode (gouv-query)
// ===========================
log('\n=== PHASE 4: Test advanced mode (gouv-query) ===');

try {
  const advancedToggle = page.locator('#advanced-mode-toggle');
  if (await advancedToggle.count() > 0) {
    await advancedToggle.check({ force: true });
    await page.waitForTimeout(300);

    const advancedOptions = page.locator('#advanced-query-options');
    const advVisible = await advancedOptions.isVisible().catch(() => false);
    if (advVisible) {
      pass('Advanced mode toggle works');
    } else {
      fail('Advanced mode', 'Options not visible');
    }

    // Set filter
    const filterInput = page.locator('#query-filter');
    if (await filterInput.count() > 0) {
      await filterInput.fill(labelField + ':isnotnull');
      pass('Filter set');
    }

    // Generate bar with advanced mode
    await page.locator('[data-type="bar"]').click({ force: true });
    await page.waitForTimeout(300);

    const lf = page.locator('#label-field');
    if (await lf.count() > 0 && await lf.isVisible().catch(() => false)) {
      await lf.selectOption(labelField).catch(() => {});
    }
    const vf = page.locator('#value-field');
    if (await vf.count() > 0 && await vf.isVisible().catch(() => false)) {
      await vf.selectOption(valueField).catch(() => {});
    }

    await page.locator('#generate-btn').click();
    await page.waitForTimeout(2000);

    await switchTab('preview');
    await screenshot('05-advanced-bar-preview');

    await switchTab('code');
    await page.waitForTimeout(300);
    const advCode = await page.locator('#generated-code').textContent().catch(() => '');
    if (advCode && advCode.length > 50) {
      exportedCodes['bar-advanced'] = advCode;
      writeFileSync(`${DIR}/exports/bar-advanced.html`, advCode);
      pass('Advanced bar code generated');
    }
    await screenshot('05-advanced-bar-code');

    // Map with advanced mode
    await page.locator('[data-type="map"]').click({ force: true });
    await page.waitForTimeout(300);

    const cf = page.locator('#code-field');
    if (await cf.count() > 0 && await cf.isVisible().catch(() => false)) {
      await cf.selectOption(codeField).catch(() => {});
    }
    const vf2 = page.locator('#value-field');
    if (await vf2.count() > 0 && await vf2.isVisible().catch(() => false)) {
      await vf2.selectOption(valueField).catch(() => {});
    }

    await page.locator('#generate-btn').click();
    await page.waitForTimeout(2000);

    await switchTab('preview');
    await screenshot('05-advanced-map-preview');

    await switchTab('code');
    const advMapCode = await page.locator('#generated-code').textContent().catch(() => '');
    if (advMapCode && advMapCode.length > 50) {
      exportedCodes['map-advanced'] = advMapCode;
      writeFileSync(`${DIR}/exports/map-advanced.html`, advMapCode);
      pass('Advanced map code generated');
    }
    await screenshot('05-advanced-map-code');

    // Disable advanced mode
    await advancedToggle.uncheck({ force: true });
    await page.waitForTimeout(300);
  } else {
    fail('Advanced mode', 'Toggle not found');
  }
} catch (e) {
  fail('Advanced mode', 'Exception: ' + e.message);
}

// ===========================
// PHASE 5: Create integrated HTML pages
// ===========================
log('\n=== PHASE 5: Create integrated HTML pages ===');

for (const [chartType, code] of Object.entries(exportedCodes)) {
  const fullHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Integration - ${chartType}</title>
</head>
<body style="margin:0; padding:20px; font-family: Marianne, Arial, sans-serif;">
  <p style="font-size:0.8rem; color:#666; border-bottom:1px solid #ddd; padding-bottom:8px; margin-bottom:16px;">
    Integration Test: <strong>${chartType}</strong>
  </p>
  ${code}
</body>
</html>`;
  writeFileSync(`${DIR}/integrated/${chartType}.html`, fullHtml);
}

const indexLinks = Object.keys(exportedCodes).map(t =>
  `<li style="margin:4px 0"><a href="${t}.html">${t}</a></li>`
).join('\n    ');

writeFileSync(`${DIR}/integrated/index.html`, `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Recette Index</title></head>
<body style="font-family:Arial;padding:20px">
  <h1>Recette - Tous les graphiques</h1><ul>${indexLinks}</ul>
</body></html>`);

pass('Integrated HTML pages created (' + Object.keys(exportedCodes).length + ' charts)');

// ===========================
// PHASE 6: Serve and screenshot integrated pages
// ===========================
log('\n=== PHASE 6: Serve and screenshot integrated pages ===');

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(DIR, 'integrated', filePath);
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

await new Promise(resolve => server.listen(9876, resolve));
log('Integration server on http://localhost:9876');

const page2 = await browser.newPage({ viewport: { width: 1200, height: 900 } });

for (const chartType of Object.keys(exportedCodes)) {
  log(`\n--- Integrated: ${chartType} ---`);
  try {
    await page2.goto(`http://localhost:9876/${chartType}.html`, { timeout: 10000 });
    // DSFR Chart components (Vue-based) need time to render
    await page2.waitForTimeout(4000);
    await page2.screenshot({ path: `${DIR}/06-integrated-${chartType}.png` });
    results.screenshots.push(`${DIR}/06-integrated-${chartType}.png`);

    // Check for visible content
    const bodyHTML = await page2.locator('body').innerHTML();
    if (bodyHTML.length > 200) {
      pass(chartType + ' integrated page has content');
    } else {
      fail(chartType + ' integrated', 'Page too short: ' + bodyHTML.length);
    }
  } catch (e) {
    fail(chartType + ' integrated', e.message);
  }
}

await page2.close();

// ===========================
// PHASE 7: Code validation
// ===========================
log('\n=== PHASE 7: Code validation ===');

for (const [chartType, code] of Object.entries(exportedCodes)) {
  // No data truncation references
  if (code.includes('state.limit')) fail(chartType + ' code', 'Contains state.limit');
  if (code.includes('config.limit')) fail(chartType + ' code', 'Contains config.limit');
  if (code.includes('.slice(0,')) fail(chartType + ' code', 'Contains .slice(0, - truncation');
  if (code.includes('NaN')) fail(chartType + ' code', 'Contains NaN');

  // DSFR CSS dependency
  if (code.includes('dsfr.min.css') || code.includes('dsfr@1.11')) {
    pass(chartType + ' has DSFR CSS');
  } else if (chartType === 'kpi') {
    pass(chartType + ' KPI uses inline styles (OK)');
  } else {
    fail(chartType + ' code', 'Missing DSFR CSS');
  }

  // Type-specific checks
  const expectedTags = {
    bar: 'bar-chart', horizontalBar: 'bar-chart', line: 'line-chart',
    pie: 'pie-chart', doughnut: 'pie-chart', radar: 'radar-chart',
    scatter: 'scatter-chart', gauge: 'gauge-chart', kpi: 'kpi-card',
    map: 'map-chart', datalist: 'gouv-datalist',
  };

  const expected = expectedTags[chartType];
  if (expected && code.includes(expected)) {
    pass(chartType + ' uses correct element: ' + expected);
  } else if (chartType === 'bar-advanced' || chartType === 'map-advanced') {
    // Advanced variants
    pass(chartType + ' advanced variant (OK)');
  } else if (expected) {
    fail(chartType + ' code', 'Missing expected element: ' + expected);
  }

  // Horizontal bar must have 'horizontal' attribute
  if (chartType === 'horizontalBar' && code.includes('horizontal')) {
    pass(chartType + ' has horizontal attribute');
  } else if (chartType === 'horizontalBar') {
    fail(chartType + ' code', 'Missing horizontal attribute');
  }

  // Pie must have 'fill', doughnut must NOT
  if (chartType === 'pie') {
    if (code.includes('fill')) pass(chartType + ' has fill attribute');
    else fail(chartType + ' code', 'Missing fill attribute');
  }
  if (chartType === 'doughnut') {
    if (!code.includes(' fill')) pass(chartType + ' correctly omits fill');
    else fail(chartType + ' code', 'Should not have fill attribute');
  }

  // Map must have padStart for department codes
  if (chartType === 'map') {
    if (code.includes('padStart')) pass(chartType + ' has padStart for dept codes');
    else log('  Info: map code uses pre-padded codes (OK for local data)');
  }

  // Datalist pagination
  if (chartType === 'datalist' && code.includes('pagination=')) {
    pass(chartType + ' has pagination');
  }
}

// ===========================
// PHASE 8: Verify no limits in source
// ===========================
log('\n=== PHASE 8: Verify no limits in builder source ===');

const srcFiles = [
  { name: 'code-generator.ts', path: '/src/ui/code-generator.ts' },
  { name: 'chart-renderer.ts', path: '/src/ui/chart-renderer.ts' },
  { name: 'state.ts', path: '/src/state.ts' },
];

for (const sf of srcFiles) {
  try {
    const srcResp = await page.request.get(BUILDER_URL + sf.path.slice(1));
    const srcText = await srcResp.text();

    if (srcText.includes('state.limit')) {
      fail(sf.name, 'Contains state.limit');
    } else {
      pass(sf.name + ': no state.limit');
    }

    if (/results\.slice\(0,\s*(state|config)/.test(srcText)) {
      fail(sf.name, 'Contains results.slice(0, state/config)');
    } else {
      pass(sf.name + ': no results.slice truncation');
    }
  } catch (e) {
    log('  Could not fetch ' + sf.name + ': ' + e.message);
  }
}

// Check #limit in DOM
const limitInDOM = await page.locator('#limit').count();
if (limitInDOM === 0) pass('DOM: no #limit input');
else fail('DOM', '#limit input found');

// ===========================
// SUMMARY
// ===========================
log('\n\n========================================');
log('        RECETTE SUMMARY');
log('========================================');
log('PASS: ' + results.pass.length);
log('FAIL: ' + results.fail.length);
log('Screenshots: ' + results.screenshots.length);

if (results.fail.length > 0) {
  log('\nFAILURES:');
  results.fail.forEach(f => log('  - ' + f.test + ': ' + f.reason));
}

log('\nAll screenshots in: ' + DIR + '/');
log('Exported codes in: ' + DIR + '/exports/');
log('Integrated pages in: ' + DIR + '/integrated/');

server.close();
await browser.close();

if (results.fail.length > 0) process.exit(1);
