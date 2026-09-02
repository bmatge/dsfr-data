import { test, expect } from '@playwright/test';
import { disableProductTour } from './helpers';

/**
 * Recette du lot 7 de l'epic UX #546 (issue #544) — audit §D :
 *  - aucune modale bloquante à l'arrivée (Carto : état vide dans le panneau) ;
 *  - un seul point d'entrée « Visite guidée » par éditeur, qui ouvre le
 *    TourService partagé (popover) ; plus de bandeau d'aide parallèle ;
 *  - les aides « ? » du Builder sont ramenées aux champs qui en ont besoin.
 */

const TOUR_BUTTONS: Array<[string, string]> = [
  ['/apps/playground/index.html', '#tour-btn'],
  ['/apps/builder/index.html', '#restart-tour-btn'],
  ['/apps/builder-carto/index.html', '#tour-btn'],
  ['/apps/dashboard/index.html', '#tour-btn'],
  ['/apps/pipeline-helper/index.html', '#btn-toggle-help'],
  ['/apps/builder-ia/index.html', '#tour-btn'],
  ['/apps/studio/index.html', '#tour-btn'],
];

test.describe('Onboarding unifié (#544)', () => {
  test.beforeEach(async ({ page }) => {
    await disableProductTour(page);
  });

  test('Carto : pas de modale à l’arrivée, état vide dans le panneau, jeu d’exemple en un clic', async ({
    page,
  }) => {
    await page.goto('/apps/builder-carto/index.html');
    await page.waitForSelector('app-action-bar [role="toolbar"]');
    await expect(page.locator('.carto-modal-overlay')).toHaveCount(0);
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);

    const choose = page.locator('#btn-choose-source');
    const sample = page.locator('#btn-sample-source');
    await expect(choose).toBeVisible();
    await expect(sample).toBeVisible();

    // Le sélecteur de données s'ouvre à la demande seulement, et se ferme.
    await choose.click();
    await expect(page.locator('#onboard-overlay')).toBeVisible();
    await page.keyboard.press('Escape');

    // Jeu d'exemple : la couche a une source, la carte se rend.
    await sample.click();
    await expect(page.locator('.carto-source-ok')).toBeVisible();
    await expect(page.locator('#btn-sample-source')).toHaveCount(0);
  });

  test('Pipeline : plus de bandeau d’aide, « Visite guidée » lance le tour', async ({ page }) => {
    await page.goto('/apps/pipeline-helper/index.html');
    await page.waitForSelector('#btn-toggle-help');
    await expect(page.locator('#onboarding, .onboarding')).toHaveCount(0);
    await page.click('#btn-toggle-help');
    const popover = page.locator('.tour-popover');
    await expect(popover).toBeVisible();
    await expect(popover.locator('.tour-popover-title')).toHaveText('Composer le flux');
    await popover.locator('.tour-popover-next').click();
    await expect(popover.locator('.tour-popover-title')).toHaveText('Connecter les nœuds');
    await popover.locator('.tour-popover-close').click();
    await expect(page.locator('.tour-popover')).toHaveCount(0);
  });

  for (const [path, selector] of TOUR_BUTTONS) {
    test(`${path} : « Visite guidée » ouvre le tour partagé`, async ({ page }) => {
      await page.goto(path);
      const btn = page.locator(selector);
      await expect(btn).toBeAttached();
      // Repli mobile ou desktop : on clique via le DOM pour ne pas dépendre du menu Plus ▾.
      await btn.evaluate((el) => (el as HTMLElement).click());
      const popover = page.locator('.tour-popover');
      await expect(popover).toBeVisible();
      await expect(popover.locator('.tour-popover-close')).toHaveText(/Fermer/);
      await expect(popover.locator('.tour-popover-next')).toHaveClass(/fr-btn/);
      await popover.locator('.tour-popover-close').click();
      await expect(page.locator('.tour-popover')).toHaveCount(0);
    });
  }

  test('Builder : les aides « ? » sont ramenées à 5 champs', async ({ page }) => {
    await page.goto('/apps/builder/index.html');
    await page.waitForSelector('#generate-btn');
    expect(await page.locator('.help-btn').count()).toBeLessThanOrEqual(5);
    // Les sections avancées portent un texte d'aide permanent à la place.
    expect(await page.locator('.config-section-hint').count()).toBeGreaterThanOrEqual(5);
  });
});
