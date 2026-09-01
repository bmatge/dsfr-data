/**
 * Export d'image PNG/JPG depuis les apercus — verifie le telechargement REEL
 * (evenement download Playwright) sur les deux mecaniques :
 *   - playground : canvas dans une iframe same-origin ;
 *   - favoris : iframe d'apercu d'un favori seede en localStorage.
 * Le chemin builder / builder-IA passe par le meme module partage
 * (exportPreviewImage) — couvert unitairement.
 */
import { test, expect } from '@playwright/test';
import { disableProductTour } from './helpers';

/** Code d'apercu autonome : un canvas peint (pas de dependance reseau). */
const CANVAS_SNIPPET = `
<canvas id="c" width="300" height="150"></canvas>
<script>
  const ctx = document.getElementById('c').getContext('2d');
  ctx.fillStyle = '#000091';
  ctx.fillRect(10, 10, 200, 100);
</script>`;

test.beforeEach(async ({ page }) => {
  await disableProductTour(page);
});

test.describe('Export image', () => {
  test('playground : PNG puis JPG téléchargés depuis l’aperçu', async ({ page }) => {
    await page.goto('/apps/playground/index.html');
    await page.waitForTimeout(800);

    // Injecte un code minimal avec canvas et execute-le.
    await page.evaluate((code) => {
      const w = window as unknown as { __PLAYGROUND_SET_CODE__?: (c: string) => void };
      if (w.__PLAYGROUND_SET_CODE__) w.__PLAYGROUND_SET_CODE__(code);
    }, CANVAS_SNIPPET);
    // Repli generique : ecrit directement dans l'iframe d'apercu.
    await page.evaluate((code) => {
      const frame = document.getElementById('preview-frame') as HTMLIFrameElement;
      frame.srcdoc = `<!DOCTYPE html><html><body>${code}</body></html>`;
    }, CANVAS_SNIPPET);
    await page.waitForTimeout(500);

    const pngDownload = page.waitForEvent('download');
    await page.click('#export-png-btn');
    expect((await pngDownload).suggestedFilename()).toBe('apercu-playground.png');

    const jpgDownload = page.waitForEvent('download');
    await page.click('#export-jpg-btn');
    expect((await jpgDownload).suggestedFilename()).toBe('apercu-playground.jpg');
  });

  test('favoris : export nommé depuis le favori sélectionné', async ({ page }) => {
    await page.addInitScript((code) => {
      localStorage.setItem(
        'dsfr-data-favorites',
        JSON.stringify([
          {
            id: 'fav-1',
            name: 'Évolution des effectifs',
            code,
            createdAt: new Date().toISOString(),
          },
        ])
      );
    }, CANVAS_SNIPPET);
    await page.goto('/apps/favorites/index.html');
    await page.waitForTimeout(800);

    // Ouvre le panneau d'apercu du favori.
    await page.click('.fav-card');
    await page.waitForTimeout(600);

    const download = page.waitForEvent('download');
    await page.click('#fav-panel-png-btn');
    expect((await download).suggestedFilename()).toBe('evolution-des-effectifs.png');
  });
});
