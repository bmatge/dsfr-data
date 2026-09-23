/**
 * Le Studio IA remplace l'Assistant IA comme entree usager (#1081).
 *
 * Ce que l'usager doit constater, et qu'aucun test unitaire ne voit :
 *   - la navigation principale mene au « Studio IA », plus a l'Assistant ;
 *   - l'accueil n'offre plus qu'une entree IA, le Studio ;
 *   - `apps/builder-ia/` REDIRIGE vers le Studio en gardant requete et ancre ;
 *   - `?ancien=1` garde l'ancien Assistant joignable (comparer, revenir en
 *     arriere) — c'est par lui que passe `builder-ia-recette`.
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

  test('apps/builder-ia/ redirige vers le Studio, requete et ancre conservees', async ({
    page,
  }) => {
    await page.goto(`${BASE}/apps/builder-ia/?from=playground#chat`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForURL(/\/apps\/studio\/index\.html\?from=playground#chat$/);
    await expect(page.locator('app-action-bar[heading="Studio IA"]')).toHaveCount(1);
  });

  test('?ancien=1 garde l’ancien Assistant joignable', async ({ page }) => {
    await page.goto(`${BASE}/apps/builder-ia/?ancien=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('app-action-bar[heading="Assistant IA (ancien)"]')).toHaveCount(1);
    expect(new URL(page.url()).pathname).toBe('/apps/builder-ia/');
    // Et il pointe vers son remplacant.
    await expect(page.locator('.builder-ia-ancien a')).toHaveAttribute(
      'href',
      '../studio/index.html'
    );
  });
});
