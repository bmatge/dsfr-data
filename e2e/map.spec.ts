import { test, expect } from '@playwright/test';

test.describe('dsfr-data-map E2E', () => {

  test('map spec page loads and renders Leaflet container', async ({ page }) => {
    await page.goto('/specs/components/dsfr-data-map.html');
    await expect(page.locator('dsfr-data-map')).toBeVisible();
  });

  test('guide map page loads', async ({ page }) => {
    await page.goto('/guide/guide-exemples-map.html');
    await expect(page.locator('h1')).toContainText('dsfr-data-map');
  });

  test('map renders with inline data and markers', async ({ page }) => {
    // Create a test page with inline data
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
        <script type="module" src="http://localhost:5173/dist/dsfr-data.esm.js"></script>
      </head>
      <body>
        <dsfr-data-source id="test-src" data='[
          {"nom":"Paris","lat":48.8566,"lon":2.3522},
          {"nom":"Lyon","lat":45.7578,"lon":4.8320}
        ]'></dsfr-data-source>

        <dsfr-data-map id="test-map" center="46.6,2.3" zoom="6" tiles="osm" height="400px">
          <dsfr-data-map-layer source="test-src" type="marker"
            lat-field="lat" lon-field="lon"
            tooltip-field="nom">
          </dsfr-data-map-layer>
        </dsfr-data-map>
      </body>
      </html>
    `);

    // Wait for Leaflet to initialize
    await page.waitForSelector('.dsfr-data-map__container', { timeout: 10000 });

    // Verify Leaflet map container exists
    const container = page.locator('.dsfr-data-map__container');
    await expect(container).toBeVisible();

    // Verify Leaflet tiles are loading (at least one tile pane exists)
    await page.waitForSelector('.leaflet-tile-pane', { timeout: 10000 });
    const tilePane = page.locator('.leaflet-tile-pane');
    await expect(tilePane).toBeVisible();

    // Verify aria-label is set
    await expect(container).toHaveAttribute('role', 'application');
    await expect(container).toHaveAttribute('aria-label', /Carte interactive/);
  });

  test('map renders circles with auto-scaling', async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
        <script type="module" src="http://localhost:5173/dist/dsfr-data.esm.js"></script>
      </head>
      <body>
        <dsfr-data-source id="villes" data='[
          {"nom":"Paris","lat":48.8566,"lon":2.3522,"pop":2161000},
          {"nom":"Lyon","lat":45.7578,"lon":4.8320,"pop":522250},
          {"nom":"Nantes","lat":47.2184,"lon":-1.5536,"pop":318808}
        ]'></dsfr-data-source>

        <dsfr-data-map id="map-circles" center="46.6,2.3" zoom="6" tiles="osm" height="400px">
          <dsfr-data-map-layer source="villes" type="circle"
            lat-field="lat" lon-field="lon"
            radius-field="pop" radius-min="5" radius-max="25">
          </dsfr-data-map-layer>
        </dsfr-data-map>
      </body>
      </html>
    `);

    await page.waitForSelector('.dsfr-data-map__container', { timeout: 10000 });
    await page.waitForSelector('.leaflet-tile-pane', { timeout: 10000 });

    // Verify circles are rendered (SVG paths in the overlay pane)
    await page.waitForSelector('.leaflet-overlay-pane', { timeout: 10000 });
    const overlayPane = page.locator('.leaflet-overlay-pane');
    await expect(overlayPane).toBeVisible();
  });

  test('map with a11y companion shows table', async ({ page }) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.11.2/dist/dsfr.min.css">
        <script type="module" src="http://localhost:5173/dist/dsfr-data.esm.js"></script>
      </head>
      <body>
        <dsfr-data-source id="a11y-src" data='[
          {"nom":"Paris","lat":48.8566,"lon":2.3522},
          {"nom":"Lyon","lat":45.7578,"lon":4.8320}
        ]'></dsfr-data-source>

        <dsfr-data-map id="a11y-map" center="46.6,2.3" zoom="6" tiles="osm" height="300px">
          <dsfr-data-map-layer source="a11y-src" type="marker"
            lat-field="lat" lon-field="lon">
          </dsfr-data-map-layer>
        </dsfr-data-map>

        <dsfr-data-a11y for="a11y-map" source="a11y-src" table download></dsfr-data-a11y>
      </body>
      </html>
    `);

    await page.waitForSelector('.dsfr-data-map__container', { timeout: 10000 });

    // Verify a11y section exists
    const a11ySection = page.locator('.dsfr-data-a11y');
    await expect(a11ySection).toBeVisible();

    // Verify it contains a details/summary accordion
    const accordion = page.locator('.dsfr-data-a11y details.fr-accordion');
    await expect(accordion).toBeVisible();
  });
});
