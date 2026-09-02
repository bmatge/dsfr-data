import { test, expect } from '@playwright/test';
import { disableProductTour } from './helpers';

/**
 * Recette du lot 2 de l'epic UX #546 (issue #539) — audit §8 « Actions » :
 *  - un seul `[role=toolbar]` par éditeur, collé sous le header ;
 *  - exactement une action primaire, à l'extrême droite ;
 *  - `Ouvrir dans ▾` présent, entrées atteignables ;
 *  - mobile (375px) : la primaire est atteignable sans défilement, la barre
 *    ne déborde pas de l'écran.
 * Une entrée par app migrée ; les ids historiques restent la clé d'accès.
 */

interface EditorSpec {
  name: string;
  path: string;
  /** id du bouton primaire attendu */
  primary: string;
  /** libellé de la primaire */
  primaryLabel: string;
  /** ids attendus dans le menu « Ouvrir dans ▾ » */
  openIn: string[];
}

const editors: EditorSpec[] = [
  {
    name: 'Playground',
    path: '/apps/playground/index.html',
    primary: 'run-btn',
    primaryLabel: 'Exécuter',
    openIn: ['pipeline-btn'],
  },
  {
    name: 'Builder',
    path: '/apps/builder/index.html',
    primary: 'generate-btn',
    primaryLabel: 'Générer',
    openIn: ['open-playground-btn', 'open-pipeline-btn'],
  },
];

const PRIMARY_SELECTOR =
  '[role="toolbar"] .fr-btn:not(.fr-btn--secondary):not(.fr-btn--tertiary):not(.fr-btn--tertiary-no-outline):not(.app-menu__trigger)';

test.describe('AppActionBar (#539)', () => {
  test.beforeEach(async ({ page }) => {
    await disableProductTour(page);
  });

  for (const ed of editors) {
    test(`${ed.name} : une barre, une primaire à droite, Ouvrir dans ▾`, async ({ page }) => {
      await page.goto(ed.path);
      await page.waitForSelector('app-action-bar [role="toolbar"]');

      await expect(page.locator('[role="toolbar"]')).toHaveCount(1);
      const toolbar = page.locator('app-action-bar [role="toolbar"]');
      await expect(toolbar).toHaveAttribute('aria-label', 'Actions de la page');

      const primaries = page.locator(PRIMARY_SELECTOR);
      await expect(primaries).toHaveCount(1);
      await expect(primaries).toHaveId(ed.primary);
      await expect(primaries).toHaveText(new RegExp(ed.primaryLabel));

      // La primaire est le dernier bouton visible de la barre.
      const lastVisible = await toolbar.evaluate((tb) => {
        const btns = Array.from(tb.querySelectorAll<HTMLElement>('button')).filter(
          (b) => !b.closest('.app-menu__list') && b.offsetParent !== null
        );
        return btns[btns.length - 1]?.id;
      });
      expect(lastVisible).toBe(ed.primary);

      // Le titre de la zone de travail est le h1 de la page.
      await expect(page.locator('h1:visible')).toHaveCount(1);
      await expect(page.locator('app-action-bar h1')).toBeVisible();

      // Ouvrir dans ▾ : menu ARIA, entrées attendues.
      const openIn = page.locator('app-action-bar app-menu', { hasText: 'Ouvrir dans' });
      await expect(openIn).toHaveCount(1);
      await openIn.locator('.app-menu__trigger').click();
      await expect(openIn.locator('[role="menu"]')).toBeVisible();
      for (const id of ed.openIn) {
        await expect(openIn.locator(`#${id}[role="menuitem"]`)).toBeVisible();
      }
      await page.keyboard.press('Escape');
      await expect(openIn.locator('[role="menu"]')).toBeHidden();

      // Collée sous le header : après défilement, la barre reste juste sous lui.
      await page.evaluate(() => {
        document.body.style.minHeight = '5000px';
        window.scrollTo(0, 1500);
      });
      await page.waitForFunction(() => window.scrollY >= 1000);
      const { barTop, headerBottom } = await page.evaluate(() => ({
        barTop: document.querySelector('app-action-bar')!.getBoundingClientRect().top,
        headerBottom: document.querySelector('app-header')!.getBoundingClientRect().bottom,
      }));
      expect(Math.abs(barTop - headerBottom)).toBeLessThanOrEqual(1);
    });

    test(`${ed.name} @375px : primaire atteignable sans défilement, rien hors écran`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(ed.path);
      await page.waitForSelector('app-action-bar [role="toolbar"]');

      const primary = page.locator(`#${ed.primary}`);
      await expect(primary).toBeVisible();
      const box = (await primary.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(812);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);

      // Tout le reste est replié dans Plus ▾.
      const more = page.locator('app-action-bar .app-action-bar__more');
      await expect(more).toBeVisible();
      await more.locator('.app-menu__trigger').click();
      await expect(more.locator('[role="menu"]')).toBeVisible();
      for (const id of ed.openIn) {
        await expect(more.locator(`#${id}[role="menuitem"]`)).toBeVisible();
      }
      const menuBox = (await more.locator('[role="menu"]').boundingBox())!;
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(375);
    });
  }
});
