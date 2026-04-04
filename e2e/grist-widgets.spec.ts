import { test, expect } from '@playwright/test';

test.describe('Grist widgets - test local', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/apps/grist-widgets/test-local.html');
    // test-local.html auto-injects data after 500ms
    await page.waitForTimeout(1000);
  });

  test('page loads and displays title', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Test local des widgets Grist DSFR');
  });

  test('dsfr-data-chart component is present', async ({ page }) => {
    const chart = page.locator('dsfr-data-chart[source="grist"]');
    await expect(chart).toBeAttached();
  });

  test('dsfr-data-kpi component is present and renders', async ({ page }) => {
    const kpi = page.locator('dsfr-data-kpi[source="grist"]');
    await expect(kpi).toBeAttached();
    // KPI should have rendered a value in shadow DOM
    const shadow = kpi.locator('div').first();
    await expect(shadow).toBeVisible({ timeout: 5000 });
  });

  test('dsfr-data-list component renders rows', async ({ page }) => {
    const datalist = page.locator('dsfr-data-list[source="grist"]');
    await expect(datalist).toBeAttached();
    // Wait for table to render (in shadow DOM, a <table> or <tr>)
    await expect(datalist.locator('table').first()).toBeVisible({ timeout: 5000 });
  });

  test('dsfr-data-chart map component is present', async ({ page }) => {
    const map = page.locator('dsfr-data-chart[source="grist-map"]');
    await expect(map).toBeAttached();
    await expect(map).toHaveAttribute('type', 'map');
  });

  test('inject button dispatches data correctly', async ({ page }) => {
    const status = page.locator('#status');
    await page.click('#btn-inject');
    await expect(status).toContainText('Donnees injectees');
  });

  test('update button changes data', async ({ page }) => {
    await page.click('#btn-update');
    const status = page.locator('#status');
    await expect(status).toContainText('Donnees mises a jour');
  });

  test('error button triggers error state', async ({ page }) => {
    await page.click('#btn-error');
    const status = page.locator('#status');
    await expect(status).toContainText('Erreur envoyee');
  });

  test('no console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/apps/grist-widgets/test-local.html');
    await page.waitForTimeout(1500);

    // Filter out expected CDN/network errors and DSFR Chart internal errors
    const realErrors = errors.filter(
      e => !e.includes('Failed to load resource') && !e.includes('net::') && !e.includes('DSFRChart')
    );
    expect(realErrors).toHaveLength(0);
  });
});

test.describe('Grist widgets - individual widget pages', () => {
  test('chart/index.html loads with empty state', async ({ page }) => {
    // Mock grist API to prevent errors
    await page.addInitScript(() => {
      (window as Record<string, unknown>).grist = {
        ready: () => {},
        onRecords: () => {},
        onOptions: () => {},
        mapColumnNames: (r: unknown) => r,
        setOptions: () => {},
      };
    });

    await page.goto('/apps/grist-widgets/chart/index.html');
    await expect(page.locator('#empty-state')).toBeVisible();
    // Note: dsfr-data-chart is created dynamically by chart.ts when data arrives
  });

  // Note: kpi/ and map/ pages were merged into chart/index.html (unified widget)

  test('datalist/index.html loads with empty state', async ({ page }) => {
    await page.addInitScript(() => {
      (window as Record<string, unknown>).grist = {
        ready: () => {},
        onRecords: () => {},
        onOptions: () => {},
        mapColumnNames: (r: unknown) => r,
        setOptions: () => {},
      };
    });

    await page.goto('/apps/grist-widgets/datalist/index.html');
    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('dsfr-data-list')).toBeAttached();
  });
});
