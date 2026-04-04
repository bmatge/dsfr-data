import { test, expect } from '@playwright/test';

const apps = [
  { name: 'Hub', path: '/', selector: 'body', title: /Charts builder|dsfr-data/i },
  { name: 'Builder', path: '/apps/builder/index.html', selector: '#source-panel-saved' },
  { name: 'Builder IA', path: '/apps/builder-ia/index.html', selector: '#section-source' },
  { name: 'Builder Carto', path: '/apps/builder-carto/index.html', selector: '#layers-list' },
  { name: 'Playground', path: '/apps/playground/index.html', selector: '.CodeMirror, .cm-editor' },
  { name: 'Sources', path: '/apps/sources/index.html', selector: '#connections-list' },
  { name: 'Favorites', path: '/apps/favorites/index.html', selector: '#favorites-list' },
  { name: 'Dashboard', path: '/apps/dashboard/index.html', selector: '#dashboard-grid' },
  { name: 'Monitoring', path: '/apps/monitoring/index.html', selector: '#kpi-row' },
  { name: 'Pipeline Helper', path: '/apps/pipeline-helper/index.html', selector: '.pipeline-page' },
  { name: 'Admin', path: '/apps/admin/index.html', selector: '#main-content' },
];

test.describe('Smoke tests', () => {
  for (const { name, path, selector, title } of apps) {
    test(`${name} app loads`, async ({ page }) => {
      await page.goto(path);
      if (title) {
        await expect(page).toHaveTitle(title);
      }
      await expect(page.locator(selector)).toBeVisible();
    });
  }

  test('No native alert() dialogs are triggered on load', async ({ page }) => {
    let alertFired = false;
    page.on('dialog', (dialog) => {
      alertFired = true;
      dialog.dismiss();
    });

    for (const { path } of apps) {
      await page.goto(path);
      await page.waitForTimeout(500);
    }

    expect(alertFired).toBe(false);
  });
});
