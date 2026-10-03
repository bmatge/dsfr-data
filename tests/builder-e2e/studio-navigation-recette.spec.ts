/**
 * Le Studio IA remplace l'Assistant IA comme entree usager (#1081).
 *
 * Ce que l'usager doit constater, et qu'aucun test unitaire ne voit :
 *   - la navigation principale mene au « Studio IA », plus a l'Assistant ;
 *   - l'accueil n'offre plus qu'une entree IA, le Studio.
 *
 * L'app `apps/builder-ia` est retiree (etape 2) : son adresse n'est plus servie
 * par le serveur de dev. En deploiement, `scripts/build-app.js` y laisse une
 * page de redirection statique vers le Studio.
 *
 * Requiert `npm run dev` (Playwright le demarre, ou reutilise le tien) :
 *   npx playwright test --config tests/builder-e2e/playwright.config.ts \
 *     studio-navigation-recette
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

test.describe('le Studio IA remplace l’Assistant IA', () => {
  test('la navigation principale mene au Studio IA, plus a l’Assistant', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const nav = page.locator('app-header .fr-nav');
    const studio = nav.getByRole('link', { name: 'Studio IA', exact: true });
    await expect(studio).toHaveAttribute('href', /apps\/studio\/index\.html$/);
    await expect(nav.getByRole('link', { name: 'Assistant IA' })).toHaveCount(0);
    await expect(nav.locator('a[href*="builder-ia"]')).toHaveCount(0);
  });

  test('l’accueil n’a plus qu’une entree IA : le Studio', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('a[href*="builder-ia"]')).toHaveCount(0);
    await expect(page.locator('a.home-tool[href="apps/studio/index.html"]')).toHaveCount(1);
    await expect(page.getByRole('link', { name: /Démarrer avec l'IA/ })).toHaveAttribute(
      'href',
      'apps/studio/index.html'
    );
  });

  test('dans le Studio, l’entree « Studio IA » est la page courante', async ({ page }) => {
    await page.goto(`${BASE}/apps/studio/`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.locator('app-header .fr-nav').getByRole('link', { name: 'Studio IA', exact: true })
    ).toHaveAttribute('aria-current', 'page');
  });
});
