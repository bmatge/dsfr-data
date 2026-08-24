import { test, expect } from '@playwright/test';
import { disableProductTour } from './helpers';
import AxeBuilder from '@axe-core/playwright';

const pages = [
  { name: 'Hub', path: '/' },
  { name: 'Builder', path: '/apps/builder/index.html' },
  { name: 'Builder IA', path: '/apps/builder-ia/index.html' },
  { name: 'Builder Carto', path: '/apps/builder-carto/index.html' },
  { name: 'Playground', path: '/apps/playground/index.html' },
  { name: 'Sources', path: '/apps/sources/index.html' },
  { name: 'Favorites', path: '/apps/favorites/index.html' },
  { name: 'Dashboard', path: '/apps/dashboard/index.html' },
  { name: 'Monitoring', path: '/apps/monitoring/index.html' },
  { name: 'Pipeline Helper', path: '/apps/pipeline-helper/index.html' },
  { name: 'Admin', path: '/apps/admin/index.html' },
];

test.describe('Accessibility tests', () => {
  // Tour guide desactive avant chaque chargement (helper partage, #407)
  test.beforeEach(async ({ page }) => {
    await disableProductTour(page);
  });

  for (const { name, path } of pages) {
    test(`${name} page is accessible`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

      expect(results.violations).toEqual([]);
    });
  }
});
