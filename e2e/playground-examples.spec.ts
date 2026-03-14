/**
 * E2E tests for the Playground app.
 *
 * Tests:
 * 1. Structural: select has 25 options, toolbar buttons present
 * 2. Per-example: for each of 25 examples, load via ?example=<key>,
 *    verify CodeMirror has code, iframe has dsfr-data-source and main widget.
 *
 * Examples using inline data (direct-worldmap) hard-fail.
 * Examples using external APIs soft-fail with warning.
 */
import { test, expect } from '@playwright/test';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, 'screenshots', 'playground');

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

// ===================================================================
// Structural tests
// ===================================================================
test.describe('Playground — structure', () => {
  test('example select has 25 options', async ({ page }) => {
    await page.goto('/apps/playground/index.html');
    await page.waitForTimeout(2_000);

    const optionCount = await page.locator('#example-select option').count();
    expect(optionCount).toBe(25);
  });

  test('toolbar buttons are present', async ({ page }) => {
    await page.goto('/apps/playground/index.html');
    await page.waitForTimeout(2_000);

    await expect(page.locator('#run-btn')).toBeVisible();
    await expect(page.locator('#reset-btn')).toBeVisible();
    await expect(page.locator('#deps-btn')).toBeVisible();
    await expect(page.locator('#copy-btn')).toBeVisible();
    await expect(page.locator('#save-btn')).toBeVisible();
  });
});

// ===================================================================
// Per-example tests (25 examples)
// ===================================================================

/** Map of example keys to their expected main visual widget tag */
const EXAMPLES: Record<string, { widget: string; usesApi: boolean }> = {
  // Direct
  'direct-bar':                { widget: 'dsfr-data-chart', usesApi: true },
  'direct-kpi':                { widget: 'dsfr-data-kpi',        usesApi: true },
  'direct-datalist':           { widget: 'dsfr-data-list',   usesApi: true },
  // Pagination serveur
  'server-paginate-datalist':  { widget: 'dsfr-data-list',   usesApi: true },
  'server-paginate-display':   { widget: 'dsfr-data-display',    usesApi: true },
  'paginate-kpi-global':       { widget: 'dsfr-data-list',   usesApi: true },
  // Query
  'query-bar':                 { widget: 'dsfr-data-chart', usesApi: true },
  'query-pie':                 { widget: 'dsfr-data-chart', usesApi: true },
  'query-map':                 { widget: 'dsfr-data-chart', usesApi: true },
  // Normalize
  'normalize-bar':             { widget: 'dsfr-data-chart', usesApi: true },
  'normalize-pie':             { widget: 'dsfr-data-chart', usesApi: true },
  'normalize-datalist':        { widget: 'dsfr-data-list',   usesApi: true },
  // Display
  'direct-display':            { widget: 'dsfr-data-display',    usesApi: true },
  'query-display':             { widget: 'dsfr-data-display',    usesApi: true },
  'normalize-display':         { widget: 'dsfr-data-display',    usesApi: true },
  // Search
  'search-datalist':           { widget: 'dsfr-data-list',   usesApi: true },
  'search-display':            { widget: 'dsfr-data-display',    usesApi: true },
  'search-kpi-chart':          { widget: 'dsfr-data-chart', usesApi: true },
  // Facets
  'facets-datalist':           { widget: 'dsfr-data-list',   usesApi: true },
  'facets-bar':                { widget: 'dsfr-data-chart', usesApi: true },
  'facets-map':                { widget: 'dsfr-data-chart', usesApi: true },
  // Server-side
  'server-side-ods':           { widget: 'dsfr-data-display',    usesApi: true },
  'server-side-tabular-tri':   { widget: 'dsfr-data-list',   usesApi: true },
  'server-facets-display':     { widget: 'dsfr-data-display',    usesApi: true },
  // World map (inline data)
  'direct-worldmap':           { widget: 'dsfr-data-world-map',  usesApi: false },
};

test.describe('Playground — examples', () => {
  test.setTimeout(120_000);

  for (const [key, { widget, usesApi }] of Object.entries(EXAMPLES)) {
    test(`${key} — renders ${widget}`, async ({ page }) => {
      await page.goto(`/apps/playground/index.html?example=${key}`);

      // Wait for CodeMirror to initialize and load the example code
      await page.waitForTimeout(3_000);

      // Verify CodeMirror has code loaded
      const hasCode = await page.evaluate(() => {
        const cm = document.querySelector('.CodeMirror') as any;
        return cm?.CodeMirror?.getValue()?.length > 10;
      });
      expect(hasCode).toBe(true);

      // Click run button to execute the code
      await page.locator('#run-btn').click();

      // Wait for the iframe to render (API calls + component init)
      await page.waitForTimeout(usesApi ? 15_000 : 8_000);

      // Access the iframe content
      const frame = page.frameLocator('#preview-frame');

      // Verify dsfr-data-source is present in the iframe
      const sourceCount = await frame.locator('dsfr-data-source').count();

      // Verify the main visual widget is present
      const widgetCount = await frame.locator(widget).count();

      if (usesApi) {
        // Soft-fail for API-dependent examples (network may be slow/unavailable)
        if (sourceCount === 0) {
          console.warn(`[WARN] ${key}: dsfr-data-source not found in iframe (API may be unavailable)`);
        }
        if (widgetCount === 0) {
          console.warn(`[WARN] ${key}: ${widget} not found in iframe (API may be unavailable)`);
        }
        // Still expect at least the source to be present (it's in the HTML)
        expect(sourceCount).toBeGreaterThanOrEqual(1);
      } else {
        // Hard-fail for inline data examples
        expect(sourceCount).toBeGreaterThanOrEqual(1);
        expect(widgetCount).toBeGreaterThanOrEqual(1);
      }

      await page.screenshot({ path: join(SCREENSHOT_DIR, `${key}.png`) });
    });
  }
});
