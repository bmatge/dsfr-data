import { test, expect } from '@playwright/test';
import { disableProductTour } from './helpers';

/**
 * Recette du lot 1 de l'epic UX #546 (issue #538) — audit §A / §8 :
 *  - `<title>` au format « Charts builder — <Page> » ;
 *  - un seul `<h1>` visible par page ;
 *  - `aria-current="page"` présent et unique dans le header (nav + tools) ;
 *  - header collant, encore visible après un long défilement ;
 *  - hauteur du header publiée dans `--app-header-h` (compensation des
 *    panneaux sticky des éditeurs).
 */

interface PageSpec {
  name: string;
  path: string;
  /** Titre attendu après « Charts builder — ». */
  title: string;
  /** false : page volontairement hors nav (Studio IA, statu quo #547). */
  inNav?: boolean;
}

const pages: PageSpec[] = [
  { name: 'Accueil', path: '/index.html', title: 'Accueil' },
  { name: 'Sources', path: '/apps/sources/index.html', title: 'Sources' },
  { name: 'Assistant IA', path: '/apps/builder-ia/index.html', title: 'Assistant IA' },
  { name: 'Studio IA', path: '/apps/studio/index.html', title: 'Studio IA', inNav: false },
  { name: 'Créer un graphique', path: '/apps/builder/index.html', title: 'Créer un graphique' },
  { name: 'Créer une carte', path: '/apps/builder-carto/index.html', title: 'Créer une carte' },
  {
    name: 'Créer un tableau de bord',
    path: '/apps/dashboard/index.html',
    title: 'Créer un tableau de bord',
  },
  { name: 'Playground', path: '/apps/playground/index.html', title: 'Playground' },
  { name: 'Pipeline', path: '/apps/pipeline-helper/index.html', title: 'Pipeline' },
  { name: 'Suivi', path: '/apps/monitoring/index.html', title: 'Suivi' },
  { name: 'Admin', path: '/apps/admin/index.html', title: 'Admin' },
  { name: 'Favoris', path: '/apps/favorites/index.html', title: 'Favoris' },
  { name: 'Guide', path: '/guide/guide.html', title: 'Guide' },
  { name: 'Composants', path: '/specs/index.html', title: 'Composants' },
];

const CURRENT_LINK =
  '.fr-nav__link[aria-current="page"], .fr-header__tools-links a[aria-current="page"]';

test.describe('Navigation — titres, h1, état actif (#538)', () => {
  test.beforeEach(async ({ page }) => {
    await disableProductTour(page);
  });

  for (const { name, path, title, inNav = true } of pages) {
    test(`${name} : title, h1 unique, aria-current`, async ({ page }) => {
      await page.goto(path);
      await page.waitForSelector('app-header .fr-header');

      await expect(page).toHaveTitle(`Charts builder — ${title}`);

      // Un seul h1 visible (les titres de modales fermées ne comptent pas).
      const h1 = page.locator('h1:visible');
      await expect(h1).toHaveCount(1);
      await expect(h1).not.toBeEmpty();

      const current = page.locator(CURRENT_LINK);
      if (!inNav) {
        await expect(current).toHaveCount(0);
        return;
      }
      await expect(current).toHaveCount(1);
      const href = await current.getAttribute('href');
      expect(href).toBeTruthy();
      const target = new URL(href!, page.url()).pathname;
      expect(target).toBe(path);

      // La hauteur du header est publiée pour les layouts qui s'y calent.
      const headerVar = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--app-header-h').trim()
      );
      expect(parseInt(headerVar, 10)).toBeGreaterThan(0);
    });
  }
});

test.describe('Header collant (A2)', () => {
  test.beforeEach(async ({ page }) => {
    await disableProductTour(page);
  });

  for (const path of ['/apps/sources/index.html', '/guide/guide.html']) {
    test(`${path} : header visible après 2000 px de défilement`, async ({ page }) => {
      await page.goto(path);
      const header = page.locator('app-header .fr-header');
      await expect(header).toBeVisible();
      expect(await page.locator('app-header').evaluate((el) => getComputedStyle(el).position)).toBe(
        'sticky'
      );

      await page.evaluate(() => {
        document.body.style.minHeight = '5000px';
        window.scrollTo(0, 2000);
      });
      await page.waitForFunction(() => window.scrollY >= 1500);
      const box = await header.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.round(box!.y)).toBe(0);
    });
  }

  test('Playground : le panneau sticky se cale sous le header', async ({ page }) => {
    await page.goto('/apps/playground/index.html');
    await page.waitForSelector('.builder-layout-left');
    const { top, headerH } = await page.evaluate(() => ({
      top: getComputedStyle(document.querySelector('.builder-layout-left')!).top,
      headerH: getComputedStyle(document.documentElement).getPropertyValue('--app-header-h').trim(),
    }));
    expect(top).toBe(headerH);
  });
});
