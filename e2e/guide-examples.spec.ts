/**
 * E2E tests for guide example pages.
 *
 * Two categories:
 * 1. Lazy-loaded pages: use IntersectionObserver to load examples on scroll.
 *    Strategy: scroll incrementally multiple times (content grows as examples load).
 * 2. Direct pages: widgets are in the HTML directly (no lazy loading).
 *
 * All pages use external APIs (ODS/Tabular) — 120s timeout.
 */
import { test, expect, type Page } from '@playwright/test';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, 'screenshots', 'guide');

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

/**
 * Scroll to bottom incrementally to trigger IntersectionObserver lazy loading.
 * Repeats multiple passes because loaded examples increase the page height.
 */
async function scrollAllExamples(page: Page): Promise<void> {
  for (let pass = 0; pass < 3; pass++) {
    const totalHeight = await page.evaluate(() => document.body.scrollHeight);
    let scrolled = 0;
    while (scrolled < totalHeight) {
      scrolled += 400;
      await page.evaluate((y) => window.scrollTo(0, y), scrolled);
      await page.waitForTimeout(150);
    }
    // Small pause between passes for IntersectionObserver callbacks to fire
    await page.waitForTimeout(1_000);
  }
  // Final scroll to absolute bottom after all content has loaded
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  // Scroll back to top for screenshot
  await page.evaluate(() => window.scrollTo(0, 0));
}

// ===================================================================
// Lazy-loaded guide pages (IntersectionObserver + data-example)
// ===================================================================
test.describe('Guide — lazy-loaded example pages', () => {
  test.setTimeout(120_000);

  const lazyPages: { name: string; expectedExamples: number }[] = [
    { name: 'guide-exemples-source', expectedExamples: 11 },
    { name: 'guide-exemples-query', expectedExamples: 15 },
    { name: 'guide-exemples-normalize', expectedExamples: 3 },
    { name: 'guide-exemples-search', expectedExamples: 4 },
    { name: 'guide-exemples-facets', expectedExamples: 5 },
    { name: 'guide-exemples-display', expectedExamples: 4 },
  ];

  for (const { name, expectedExamples } of lazyPages) {
    test(`${name}.html — examples loaded via IntersectionObserver`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await page.goto(`/guide/${name}.html`);

      // Wait for initial page load
      await page.waitForTimeout(3_000);

      // Scroll multiple passes to trigger all IntersectionObservers
      await scrollAllExamples(page);

      // Wait for examples to render (API calls + component init)
      await page.waitForTimeout(8_000);

      // Check how many containers were created (some placeholders may remain
      // at the very bottom if the page is very long — that's acceptable)
      const containerCount = await page.locator('.example-container').count();
      expect(containerCount).toBeGreaterThanOrEqual(expectedExamples);

      // Each container should have at least one dsfr-data-source
      const sourceCount = await page.locator('.example-container dsfr-data-source').count();
      expect(sourceCount).toBeGreaterThanOrEqual(expectedExamples);

      await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
      expect(errors).toEqual([]);
    });
  }
});

// ===================================================================
// Direct guide pages (widgets in HTML, no lazy loading)
// ===================================================================
test.describe('Guide — direct widget pages', () => {
  test.setTimeout(120_000);

  test('guide-exemples-chart-a11y.html — a11y + chart widgets', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/guide/guide-exemples-chart-a11y.html');
    await page.waitForTimeout(10_000);

    const a11yCount = await page.locator('dsfr-data-a11y').count();
    expect(a11yCount).toBeGreaterThanOrEqual(1);

    const chartCount = await page.locator('dsfr-data-chart').count();
    expect(chartCount).toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'guide-exemples-chart-a11y.png'), fullPage: true });
    expect(errors).toEqual([]);
  });

  test('guide-exemples-ghibli.html — kpi + chart widgets', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/guide/guide-exemples-ghibli.html');
    await page.waitForTimeout(10_000);

    const kpiCount = await page.locator('dsfr-data-kpi').count();
    expect(kpiCount).toBeGreaterThanOrEqual(1);

    const chartCount = await page.locator('dsfr-data-chart').count();
    expect(chartCount).toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'guide-exemples-ghibli.png'), fullPage: true });
    expect(errors).toEqual([]);
  });

  test('guide-exemples-maires.html — kpi + chart + search widgets', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/guide/guide-exemples-maires.html');
    await page.waitForTimeout(15_000);

    const kpiCount = await page.locator('dsfr-data-kpi').count();
    expect(kpiCount).toBeGreaterThanOrEqual(1);

    const chartCount = await page.locator('dsfr-data-chart').count();
    expect(chartCount).toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'guide-exemples-maires.png'), fullPage: true });
    expect(errors).toEqual([]);
  });

  test('guide-exemples-world-map.html — world-map + chart widgets', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/guide/guide-exemples-world-map.html');
    await page.waitForTimeout(15_000);

    const worldMapCount = await page.locator('dsfr-data-world-map').count();
    expect(worldMapCount).toBeGreaterThanOrEqual(1);

    const chartCount = await page.locator('dsfr-data-chart').count();
    expect(chartCount).toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'guide-exemples-world-map.png'), fullPage: true });
    expect(errors).toEqual([]);
  });

  test('guide-exemples-insee-erfs.html — chart + kpi widgets', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/guide/guide-exemples-insee-erfs.html');
    await page.waitForTimeout(15_000);

    const chartCount = await page.locator('dsfr-data-chart').count();
    expect(chartCount).toBeGreaterThanOrEqual(1);

    const kpiCount = await page.locator('dsfr-data-kpi').count();
    expect(kpiCount).toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'guide-exemples-insee-erfs.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
});
