import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('Hub (index.html) loads correctly', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Charts builder|dsfr-data/i);
    await expect(page.locator('body')).toBeVisible();
  });

  test('Builder app loads', async ({ page }) => {
    await page.goto('/apps/builder/index.html');
    await expect(page.locator('#source-panel-saved')).toBeVisible();
  });

  test('Playground app loads', async ({ page }) => {
    await page.goto('/apps/playground/index.html');
    await expect(page.locator('.CodeMirror')).toBeVisible();
  });

  test('Sources app loads', async ({ page }) => {
    await page.goto('/apps/sources/index.html');
    await expect(page.locator('#connections-list')).toBeVisible();
  });

  test('Favorites app loads', async ({ page }) => {
    await page.goto('/apps/favorites/index.html');
    await expect(page.locator('#favorites-list')).toBeVisible();
  });

  test('Dashboard app loads', async ({ page }) => {
    await page.goto('/apps/dashboard/index.html');
    await expect(page.locator('#dashboard-grid')).toBeVisible();
  });

  test('No native alert() dialogs are triggered on load', async ({ page }) => {
    let alertFired = false;
    page.on('dialog', (dialog) => {
      alertFired = true;
      dialog.dismiss();
    });

    for (const path of ['/', '/apps/builder/index.html', '/apps/playground/index.html', '/apps/sources/index.html', '/apps/favorites/index.html', '/apps/dashboard/index.html']) {
      await page.goto(path);
      await page.waitForTimeout(500);
    }

    expect(alertFired).toBe(false);
  });
});
