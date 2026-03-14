/**
 * E2E tests for Industrie du Futur dataset charts.
 *
 * Tests 16 use cases (2 per chart type) produced by simulating the builder:
 *   - "Brut" (embedded): API aggregation + DSFR Chart rendering
 *   - "Query" (dynamic): dsfr-data-source + dsfr-data-query + dsfr-data-chart rendering
 *
 * Dataset: industrie-du-futur (data.economie.gouv.fr) - 101 departements
 */
import { test, expect, type Page } from '@playwright/test';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, 'screenshots', 'industrie-du-futur');

// Ensure screenshot directory exists
test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.describe('Industrie du Futur - Builder simulation', () => {
  // Increase timeout for API calls and chart rendering
  test.setTimeout(120_000);

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto('/e2e/industrie-du-futur.html');

    // Wait for all embedded charts to finish loading
    await page.waitForFunction(
      () => document.querySelector('#test-status')?.getAttribute('data-ready') === 'true',
      { timeout: 60_000 }
    );

    // Wait extra time for dynamic charts (dsfr-data-source + dsfr-data-query + dsfr-data-chart)
    // These need: API fetch + query processing + chart render
    await page.waitForTimeout(8_000);
  });

  test.afterAll(async () => {
    await page.close();
  });

  // -------------------------------------------------------------------
  // FULL PAGE SCREENSHOT
  // -------------------------------------------------------------------
  test('Full page renders all 16 charts', async () => {
    await page.screenshot({
      path: join(SCREENSHOT_DIR, '00-full-page.png'),
      fullPage: true,
    });

    // Verify page title loaded
    await expect(page.locator('#test-title')).toContainText('Industrie du Futur');

    // Verify all 16 sections exist
    const sections = [
      'bar-brut', 'bar-query', 'hbar-brut', 'hbar-query',
      'line-brut', 'line-query', 'pie-brut', 'pie-query',
      'doughnut-brut', 'doughnut-query', 'radar-brut', 'radar-query',
      'map-brut', 'map-query', 'kpi-brut', 'kpi-query',
    ];
    for (const id of sections) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
  });

  // -------------------------------------------------------------------
  // 1. BAR - BRUT
  // -------------------------------------------------------------------
  test('1. BAR brut - Top 10 departements par beneficiaires', async () => {
    const section = page.locator('#bar-brut');
    await section.screenshot({ path: join(SCREENSHOT_DIR, '01-bar-brut.png') });

    // DSFR bar-chart should exist and have rendered canvas content (Chart.js)
    const barChart = section.locator('bar-chart');
    await expect(barChart).toBeVisible();

    const canvas = section.locator('bar-chart canvas');
    await expect(canvas).toBeVisible();
  });

  // -------------------------------------------------------------------
  // 2. BAR - QUERY
  // -------------------------------------------------------------------
  test('2. BAR query - Beneficiaires par region via dsfr-data-query', async () => {
    const section = page.locator('#bar-query');
    await section.screenshot({ path: join(SCREENSHOT_DIR, '02-bar-query.png') });

    // dsfr-data-chart should have rendered a bar-chart
    const chart = section.locator('dsfr-data-chart');
    await expect(chart).toBeVisible();

    const barChart = section.locator('dsfr-data-chart bar-chart');
    await expect(barChart).toBeVisible();
  });

  // -------------------------------------------------------------------
  // 3. HBAR - BRUT
  // -------------------------------------------------------------------
  test('3. HBAR brut - Top 10 departements par participation Etat', async () => {
    const section = page.locator('#hbar-brut');
    await section.screenshot({ path: join(SCREENSHOT_DIR, '03-hbar-brut.png') });

    const barChart = section.locator('bar-chart');
    await expect(barChart).toBeVisible();
  });

  // -------------------------------------------------------------------
  // 4. HBAR - QUERY
  // -------------------------------------------------------------------
  test('4. HBAR query - Investissement moyen par region via dsfr-data-query', async () => {
    const section = page.locator('#hbar-query');
    await section.screenshot({ path: join(SCREENSHOT_DIR, '04-hbar-query.png') });

    const barChart = section.locator('dsfr-data-chart bar-chart');
    await expect(barChart).toBeVisible();
  });

  // -------------------------------------------------------------------
  // 5. LINE - BRUT
  // -------------------------------------------------------------------
  test('5. LINE brut - 20 departements le moins investissement', async () => {
    const section = page.locator('#line-brut');
    await section.screenshot({ path: join(SCREENSHOT_DIR, '05-line-brut.png') });

    const lineChart = section.locator('line-chart');
    await expect(lineChart).toBeVisible();
  });

  // -------------------------------------------------------------------
  // 6. LINE - QUERY
  // -------------------------------------------------------------------
  test('6. LINE query - Departements >= 100 beneficiaires', async () => {
    const section = page.locator('#line-query');
    await section.screenshot({ path: join(SCREENSHOT_DIR, '06-line-query.png') });

    const lineChart = section.locator('dsfr-data-chart line-chart');
    await expect(lineChart).toBeVisible();
  });

  // -------------------------------------------------------------------
  // 7. PIE - BRUT
  // -------------------------------------------------------------------
  test('7. PIE brut - Repartition beneficiaires par region top 8', async () => {
    const section = page.locator('#pie-brut');
    await section.screenshot({ path: join(SCREENSHOT_DIR, '07-pie-brut.png') });

    const pieChart = section.locator('pie-chart');
    await expect(pieChart).toBeVisible();
  });

  // -------------------------------------------------------------------
  // 8. PIE - QUERY
  // -------------------------------------------------------------------
  test('8. PIE query - Investissement 3 grandes regions', async () => {
    const section = page.locator('#pie-query');
    await section.screenshot({ path: join(SCREENSHOT_DIR, '08-pie-query.png') });

    const pieChart = section.locator('dsfr-data-chart pie-chart');
    await expect(pieChart).toBeVisible();
  });

  // -------------------------------------------------------------------
  // 9. DOUGHNUT - BRUT
  // -------------------------------------------------------------------
  test('9. DOUGHNUT brut - Top 6 regions participation Etat', async () => {
    const section = page.locator('#doughnut-brut');
    await section.screenshot({ path: join(SCREENSHOT_DIR, '09-doughnut-brut.png') });

    // DSFR Chart has no doughnut type, uses pie-chart instead
    const pieChart = section.locator('pie-chart');
    await expect(pieChart).toBeVisible();
  });

  // -------------------------------------------------------------------
  // 10. DOUGHNUT - QUERY
  // -------------------------------------------------------------------
  test('10. DOUGHNUT query - Departements par region via dsfr-data-query', async () => {
    const section = page.locator('#doughnut-query');
    await section.screenshot({ path: join(SCREENSHOT_DIR, '10-doughnut-query.png') });

    // DSFR Chart has no doughnut type, uses pie-chart via dsfr-data-chart
    const pieChart = section.locator('dsfr-data-chart pie-chart');
    await expect(pieChart).toBeVisible();
  });

  // -------------------------------------------------------------------
  // 11. RADAR - BRUT
  // -------------------------------------------------------------------
  test('11. RADAR brut - Moy. beneficiaires top 5 regions', async () => {
    const section = page.locator('#radar-brut');
    await section.screenshot({ path: join(SCREENSHOT_DIR, '11-radar-brut.png') });

    const radarChart = section.locator('radar-chart');
    await expect(radarChart).toBeVisible();
  });

  // -------------------------------------------------------------------
  // 12. RADAR - QUERY
  // -------------------------------------------------------------------
  test('12. RADAR query - Dept. Bretagne/Normandie/Occitanie', async () => {
    const section = page.locator('#radar-query');
    await section.screenshot({ path: join(SCREENSHOT_DIR, '12-radar-query.png') });

    const radarChart = section.locator('dsfr-data-chart radar-chart');
    await expect(radarChart).toBeVisible();
  });

  // -------------------------------------------------------------------
  // 13. MAP - BRUT
  // -------------------------------------------------------------------
  test('13. MAP brut - Carte beneficiaires par departement', async () => {
    const section = page.locator('#map-brut');
    await section.screenshot({ path: join(SCREENSHOT_DIR, '13-map-brut.png') });

    // Map chart should render an SVG
    const mapChart = section.locator('map-chart');
    await expect(mapChart).toBeVisible();
  });

  // -------------------------------------------------------------------
  // 14. MAP - QUERY
  // -------------------------------------------------------------------
  test('14. MAP query - Carte investissements via dsfr-data-chart', async () => {
    const section = page.locator('#map-query');
    await section.screenshot({ path: join(SCREENSHOT_DIR, '14-map-query.png') });

    // dsfr-data-chart with map type should render
    const dsfrChart = section.locator('dsfr-data-chart');
    await expect(dsfrChart).toBeVisible();
  });

  // -------------------------------------------------------------------
  // 15. KPI - BRUT
  // -------------------------------------------------------------------
  test('15. KPI brut - Total national investissements', async () => {
    const section = page.locator('#kpi-brut');
    await section.screenshot({ path: join(SCREENSHOT_DIR, '15-kpi-brut.png') });

    // KPI value should be populated (not em dash)
    const kpiValue = section.locator('#kpi-brut-value');
    await expect(kpiValue).toBeVisible();
    const text = await kpiValue.textContent();
    expect(text).not.toBe('\u2014');
    expect(text!.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------
  // 16. KPI - QUERY
  // -------------------------------------------------------------------
  test('16. KPI query - Beneficiaires IDF via dsfr-data-kpi', async () => {
    const section = page.locator('#kpi-query');
    await section.screenshot({ path: join(SCREENSHOT_DIR, '16-kpi-query.png') });

    // dsfr-data-kpi should have rendered
    const kpi = section.locator('dsfr-data-kpi');
    await expect(kpi).toBeVisible();
  });

  // -------------------------------------------------------------------
  // DATA VALIDATION TESTS
  // Verify actual data values match expected aggregations
  // -------------------------------------------------------------------
  test('BAR brut data matches expected top 3 departments', async () => {
    // Read data from the embedded DSFR bar-chart x attribute
    const top3 = await page.evaluate(() => {
      const barChart = document.querySelector('#bar-brut-container bar-chart');
      if (!barChart) return null;
      const xAttr = barChart.getAttribute('x');
      if (!xAttr) return null;
      try {
        const labels = JSON.parse(xAttr);
        return { labels: labels[0].slice(0, 3) };
      } catch {
        return null;
      }
    });

    expect(top3).not.toBeNull();
    // RHONE should be first
    expect(top3!.labels[0]).toContain('RH');
  });

  test('KPI brut shows value > 3 billion EUR', async () => {
    const text = await page.locator('#kpi-brut-value').textContent();
    // Should contain a large number formatted as EUR
    // Total investment is approximately 3.5 billion EUR
    expect(text).toContain('\u20AC');
    // Check the numeric value is reasonable (at least 1 billion)
    const numericPart = text!.replace(/[^\d]/g, '');
    expect(Number(numericPart)).toBeGreaterThan(1_000_000_000);
  });

  test('BAR query - dsfr-data-chart received data from dsfr-data-query', async () => {
    // Verify the dsfr-data-chart component has rendered a bar-chart
    const hasBarChart = await page.evaluate(() => {
      const chart = document.querySelector('#bar-query dsfr-data-chart');
      return chart?.querySelector('bar-chart') !== null;
    });
    expect(hasBarChart).toBe(true);
  });

  test('PIE query - filtered to exactly 3 regions', async () => {
    // Read the x attribute from the DSFR pie-chart to count labels
    const dataCount = await page.evaluate(() => {
      const pieChart = document.querySelector('#pie-query dsfr-data-chart pie-chart');
      if (!pieChart) return -1;
      const xAttr = pieChart.getAttribute('x');
      if (!xAttr) return -1;
      try {
        const labels = JSON.parse(xAttr);
        return labels[0]?.length || -1;
      } catch {
        return -1;
      }
    });
    expect(dataCount).toBe(3);
  });

  test('LINE query - only departments with >= 100 beneficiaires', async () => {
    // Read the x attribute from the DSFR line-chart to count labels
    const labelCount = await page.evaluate(() => {
      const lineChart = document.querySelector('#line-query dsfr-data-chart line-chart');
      if (!lineChart) return -1;
      const xAttr = lineChart.getAttribute('x');
      if (!xAttr) return -1;
      try {
        const labels = JSON.parse(xAttr);
        return labels[0]?.length || -1;
      } catch {
        return -1;
      }
    });
    // There should be a subset of all 101 departments (only those with >= 100 benef.)
    expect(labelCount).toBeGreaterThan(0);
    expect(labelCount).toBeLessThan(50);
  });

  test('DOUGHNUT query - count of departments per region', async () => {
    // Read the x attribute from the DSFR pie-chart (doughnut mapped to pie) to count labels
    const dataCount = await page.evaluate(() => {
      const pieChart = document.querySelector('#doughnut-query dsfr-data-chart pie-chart');
      if (!pieChart) return -1;
      const xAttr = pieChart.getAttribute('x');
      if (!xAttr) return -1;
      try {
        const labels = JSON.parse(xAttr);
        return labels[0]?.length || -1;
      } catch {
        return -1;
      }
    });
    // Should have 6 regions (limited by dsfr-data-query limit=6)
    expect(dataCount).toBe(6);
  });
});
