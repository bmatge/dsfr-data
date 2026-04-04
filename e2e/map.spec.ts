import { test, expect } from '@playwright/test';

test.describe('dsfr-data-map E2E', () => {
  test.setTimeout(60_000);

  test('map spec page loads (doc-only)', async ({ page }) => {
    await page.goto('/specs/components/dsfr-data-map.html');
    await expect(page.locator('.guide-content, .spec-content, main')).toBeVisible();
  });

  test('guide map page loads and renders map', async ({ page }) => {
    await page.goto('/guide/guide-exemples-map.html');
    await expect(page.locator('h1')).toContainText('dsfr-data-map');

    // Scroll to trigger lazy-loaded examples
    for (let pass = 0; pass < 3; pass++) {
      const totalHeight = await page.evaluate(() => document.body.scrollHeight);
      let scrolled = 0;
      while (scrolled < totalHeight) {
        scrolled += 400;
        await page.evaluate((y) => window.scrollTo(0, y), scrolled);
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(1_000);
    }

    // Wait for Leaflet to load and render
    await page.waitForTimeout(5_000);

    // Verify at least one map container rendered
    const containerCount = await page.locator('.dsfr-data-map__container').count();
    expect(containerCount).toBeGreaterThanOrEqual(1);

    // Verify Leaflet tiles are loading
    const tilePaneCount = await page.locator('.leaflet-tile-pane').count();
    expect(tilePaneCount).toBeGreaterThanOrEqual(1);
  });
});
