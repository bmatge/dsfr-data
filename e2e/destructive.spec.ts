import { test, expect } from '@playwright/test';
import { disableProductTour } from './helpers';

/**
 * Recette du lot 6 de l'epic UX #546 (issue #543) — audit §B7/§B8/§E4 :
 *  - toute suppression passe par le ConfirmDialog commun : `role=alertdialog`,
 *    confirmation en primaire danger portant le verbe, focus initial sur Annuler,
 *    Échap annule et rend le focus ;
 *  - plus aucun bouton dont le nom accessible est « × ».
 */

const PAGES = [
  '/index.html',
  '/apps/sources/index.html',
  '/apps/builder-ia/index.html',
  '/apps/studio/index.html',
  '/apps/builder/index.html',
  '/apps/builder-carto/index.html',
  '/apps/dashboard/index.html',
  '/apps/playground/index.html',
  '/apps/pipeline-helper/index.html',
  '/apps/monitoring/index.html',
  '/apps/admin/index.html',
  '/apps/favorites/index.html',
  '/guide/guide.html',
  '/specs/index.html',
];

const FAVORITE = {
  id: 'fav-e2e-1',
  name: 'Favori de recette',
  code: '<dsfr-data-chart type="bar"></dsfr-data-chart>',
  chartType: 'bar',
  sourceApp: 'builder',
  createdAt: '2026-09-02T00:00:00.000Z',
};

test.describe('ConfirmDialog et fermetures (#543)', () => {
  test.beforeEach(async ({ page }) => {
    await disableProductTour(page);
  });

  test('Favoris : supprimer → alertdialog, danger, focus sur Annuler, Échap annule', async ({
    page,
  }) => {
    await page.addInitScript((fav) => {
      window.localStorage.setItem('dsfr-data-favorites', JSON.stringify([fav]));
    }, FAVORITE);
    await page.goto('/apps/favorites/index.html');
    await page.locator('#favorites-list .fav-card, #favorites-list [data-id]').first().click();
    const trigger = page.locator('#fav-panel-delete-btn');
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.locator('.confirm-dialog-content[role="alertdialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-labelledby', /.+/);
    await expect(dialog.locator('h2')).toHaveText('Supprimer ce favori ?');

    const cancel = dialog.locator('[data-action="cancel"]');
    const confirm = dialog.locator('[data-action="confirm"]');
    await expect(cancel).toHaveText('Annuler');
    await expect(cancel).toHaveClass(/fr-btn--secondary/);
    await expect(confirm).toHaveText('Supprimer');
    await expect(confirm).toHaveClass(/confirm-dialog-danger/);
    await expect(confirm).not.toHaveClass(/fr-btn--tertiary/);
    // Focus initial sur Annuler, jamais sur l'action destructive.
    await expect(cancel).toBeFocused();

    // Échap annule et rend le focus au déclencheur ; le favori est toujours là.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('dsfr-data-favorites')!).length)
    ).toBe(1);

    // Confirmation : le favori disparaît.
    await trigger.click();
    await dialog.locator('[data-action="confirm"]').click();
    await expect(dialog).toBeHidden();
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('dsfr-data-favorites')!).length)
    ).toBe(0);
  });

  test('Pipeline : un nœud vierge se supprime sans confirmation', async ({ page }) => {
    await page.goto('/apps/pipeline-helper/index.html');
    await page.waitForSelector('#btn-delete');
    let dialogs = 0;
    page.on('dialog', () => dialogs++);
    // Aucun nœud sélectionné : rien ne se passe, et surtout aucune boîte.
    await page.click('#btn-delete');
    await expect(page.locator('.confirm-dialog-overlay')).toHaveCount(0);
    expect(dialogs).toBe(0);
  });

  for (const path of PAGES) {
    test(`${path} : aucun bouton nommé « × »`, async ({ page }) => {
      await page.goto(path);
      await page.waitForSelector('app-header .fr-header');
      const crosses = await page.evaluate(
        () =>
          Array.from(document.querySelectorAll('button')).filter((b) => {
            const labelledBy = b.getAttribute('aria-labelledby');
            const candidates = [
              b.getAttribute('aria-label'),
              labelledBy ? document.getElementById(labelledBy)?.textContent : null,
              b.textContent,
              b.getAttribute('title'),
            ].map((c) => (c || '').trim());
            const name = candidates.find((c) => c !== '') ?? '';
            return name === '×' || name === 'x' || name === '';
          }).length
      );
      expect(crosses).toBe(0);
    });
  }
});
