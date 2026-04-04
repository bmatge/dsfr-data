/**
 * E2E tests for specs component pages.
 *
 * Verifies that every specs page loads correctly, renders expected widgets,
 * and takes full-page screenshots for visual verification.
 *
 * - Pages with local data (/mock-api/data.json): 60s timeout
 * - Pages with external API (ODS): 120s timeout
 * - Doc-only pages (no live widgets): 30s timeout
 */
import { test, expect, type Page } from '@playwright/test';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, 'screenshots', 'specs');

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

/** Collect console errors (ignore network/CDN failures) */
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('net::ERR_') && !text.includes('Failed to load resource') && !text.includes('cdn.jsdelivr.net')) {
        errors.push(text);
      }
    }
  });
  return errors;
}

// ===================================================================
// Pages with local data (/mock-api/data.json) — 60s timeout
// ===================================================================
test.describe('Specs — local data widgets', () => {
  test.setTimeout(60_000);

  test('dsfr-data-chart.html — chart types rendered', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/specs/components/dsfr-data-chart.html');
    await page.waitForTimeout(5_000);

    const chartCount = await page.locator('dsfr-data-chart').count();
    expect(chartCount).toBeGreaterThanOrEqual(5);

    // Verify inner DSFR chart types are rendered
    const barCount = await page.locator('dsfr-data-chart bar-chart').count();
    const lineCount = await page.locator('dsfr-data-chart line-chart').count();
    const pieCount = await page.locator('dsfr-data-chart pie-chart').count();
    const radarCount = await page.locator('dsfr-data-chart radar-chart').count();
    expect(barCount + lineCount + pieCount + radarCount).toBeGreaterThanOrEqual(4);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'dsfr-data-chart.png'), fullPage: true });
    expect(errors).toEqual([]);
  });

  test('dsfr-data-kpi.html — KPI widgets rendered', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/specs/components/dsfr-data-kpi.html');
    await page.waitForTimeout(5_000);

    const kpiCount = await page.locator('dsfr-data-kpi').count();
    expect(kpiCount).toBeGreaterThanOrEqual(8);

    const kpiGroupCount = await page.locator('dsfr-data-kpi-group').count();
    expect(kpiGroupCount).toBeGreaterThanOrEqual(3);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'dsfr-data-kpi.png'), fullPage: true });
    expect(errors).toEqual([]);
  });

  test('dsfr-data-list.html — datalist widgets rendered', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/specs/components/dsfr-data-list.html');
    await page.waitForTimeout(5_000);

    const datalistCount = await page.locator('dsfr-data-list').count();
    expect(datalistCount).toBeGreaterThanOrEqual(4);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'dsfr-data-list.png'), fullPage: true });
    expect(errors).toEqual([]);
  });

  test('dsfr-data-display.html — display widgets rendered', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/specs/components/dsfr-data-display.html');
    await page.waitForTimeout(5_000);

    const displayCount = await page.locator('dsfr-data-display').count();
    expect(displayCount).toBeGreaterThanOrEqual(3);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'dsfr-data-display.png'), fullPage: true });
    expect(errors).toEqual([]);
  });

  test('dsfr-data-a11y.html — a11y companions rendered', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/specs/components/dsfr-data-a11y.html');
    await page.waitForTimeout(5_000);

    const a11yCount = await page.locator('dsfr-data-a11y').count();
    expect(a11yCount).toBeGreaterThanOrEqual(2);

    const chartCount = await page.locator('dsfr-data-chart').count();
    expect(chartCount).toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'dsfr-data-a11y.png'), fullPage: true });
    expect(errors).toEqual([]);
  });

  test('dsfr-data-podium.html — podium widget rendered', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/specs/components/dsfr-data-podium.html');
    await page.waitForTimeout(5_000);

    const podiumCount = await page.locator('dsfr-data-podium').count();
    expect(podiumCount).toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'dsfr-data-podium.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
});

// ===================================================================
// Pages with external API (ODS) — 120s timeout
// ===================================================================
test.describe('Specs — external API widgets', () => {
  test.setTimeout(120_000);

  test('dsfr-data-facets.html — facets + datalist + chart + kpi', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/specs/components/dsfr-data-facets.html');
    await page.waitForTimeout(15_000);

    const facetsCount = await page.locator('dsfr-data-facets').count();
    expect(facetsCount).toBeGreaterThanOrEqual(4);

    const datalistCount = await page.locator('dsfr-data-list').count();
    expect(datalistCount).toBeGreaterThanOrEqual(3);

    const chartCount = await page.locator('dsfr-data-chart').count();
    expect(chartCount).toBeGreaterThanOrEqual(1);

    const kpiCount = await page.locator('dsfr-data-kpi').count();
    expect(kpiCount).toBeGreaterThanOrEqual(2);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'dsfr-data-facets.png'), fullPage: true });
    expect(errors).toEqual([]);
  });

  test('dsfr-data-search.html — search + datalist widgets', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/specs/components/dsfr-data-search.html');
    await page.waitForTimeout(15_000);

    const searchCount = await page.locator('dsfr-data-search').count();
    expect(searchCount).toBeGreaterThanOrEqual(3);

    const datalistCount = await page.locator('dsfr-data-list').count();
    expect(datalistCount).toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'dsfr-data-search.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
});

// ===================================================================
// World map (ODS + topojson) — 120s timeout
// ===================================================================
test.describe('Specs — world map', () => {
  test.setTimeout(120_000);

  test('dsfr-data-world-map.html — map with SVG rendered', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/specs/components/dsfr-data-world-map.html');
    await page.waitForTimeout(15_000);

    const worldMapCount = await page.locator('dsfr-data-world-map').count();
    expect(worldMapCount).toBeGreaterThanOrEqual(1);

    // Verify SVG is rendered inside the world-map component
    const svgCount = await page.locator('dsfr-data-world-map svg').count();
    expect(svgCount).toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'dsfr-data-world-map.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
});

// ===================================================================
// Doc-only pages (no live widgets)
// ===================================================================
test.describe('Specs — doc-only pages', () => {
  const docPages = [
    'dsfr-data-source',
    'dsfr-data-query',
    'dsfr-data-normalize',
    'dsfr-data-join',
    'dsfr-data-map',
  ];

  for (const name of docPages) {
    test(`${name}.html — page loads, layout present`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await page.goto(`/specs/components/${name}.html`);
      await page.waitForTimeout(2_000);

      // Verify page loaded with correct layout
      await expect(page.locator('.guide-content, .spec-content, main')).toBeVisible();

      await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
      expect(errors).toEqual([]);
    });
  }
});
