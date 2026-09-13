import { test, expect } from '@playwright/test';

/**
 * #813 — la légende suit `color-map` sous `databox`, vérifié sur le VRAI
 * DSFR Chart (chargé depuis node_modules, pas reconstruit à la main).
 *
 * Deux garanties que le test unitaire ne donne pas :
 * 1. DSFR Chart produit bien des `span.legend_dot` (une montée de version qui
 *    renomme la classe fait échouer ici, et repasserait au vert là-bas) ;
 * 2. les pastilles portent la couleur de `color-map`, et le composant
 *    n'avertit pas d'un décompte de pastilles inattendu.
 */

test('les pastilles de légende portent les couleurs de color-map (vrai DSFR Chart)', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning' && msg.text().includes('pastille')) warnings.push(msg.text());
  });
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/e2e/chart-legend.html');

  const dots = page.locator('#camembert .legend_dot');
  await expect(dots.first()).toBeVisible({ timeout: 15_000 });
  await expect(dots).toHaveCount(3);
  // Laisser le recoloriage passer (il attend chartArea > 0).
  await expect
    .poll(
      () =>
        page.$$eval('#camembert .legend_dot', (els) =>
          els.map((el) => getComputedStyle(el).backgroundColor)
        ),
      { timeout: 10_000 }
    )
    .toEqual([
      'rgb(255, 0, 0)',
      'rgb(0, 0, 255)',
      expect.not.stringMatching(/^rgb\((255, 0, 0|0, 0, 255)\)$/),
    ]);
  expect(warnings).toEqual([]);
});
