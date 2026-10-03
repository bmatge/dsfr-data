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

/**
 * BUG-033 du banc (#1230) — `color-map` recolore aussi les POINTS.
 *
 * Le trait et la légende suivaient déjà ; les points d'une courbe gardaient la
 * palette par défaut. On compte donc les pixels du canvas, comme le fait le
 * banc : ceux des couleurs demandées, et ceux des deux premières couleurs de
 * la palette catégorielle de DSFR Chart, qui ne doivent plus apparaître nulle
 * part. Un point est un disque plein de 5 px de rayon : il pèse bien plus de
 * pixels francs qu'un trait de 2 px lissé, c'est lui que le compte attrape.
 */
const PALETTE_PAR_DEFAUT = ['92,104,229', '130,181,242'];

for (const { id, nom } of [
  { id: 'courbe', nom: 'courbe (line)' },
  { id: 'radar', nom: 'radar' },
  { id: 'nuage', nom: 'nuage de points (scatter)' },
  { id: 'barres-courbe', nom: 'barres et courbe (bar-line)' },
]) {
  test(`color-map recolore les points — ${nom}`, async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto('/e2e/chart-legend.html');
    await expect(page.locator(`#${id} canvas`)).toBeVisible({ timeout: 15_000 });

    const compter = () =>
      page.evaluate((cible) => {
        const canvas = document.querySelector<HTMLCanvasElement>(`#${cible} canvas`);
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return null;
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const comptes: Record<string, number> = {};
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] !== 255) continue;
          const cle = `${data[i]},${data[i + 1]},${data[i + 2]}`;
          comptes[cle] = (comptes[cle] ?? 0) + 1;
        }
        return comptes;
      }, id);

    // Le recoloriage attend que l'aire du graphique existe, puis une image.
    await expect
      .poll(async () => (await compter())?.['0,170,0'] ?? 0, { timeout: 10_000 })
      .toBeGreaterThan(100);
    const comptes = (await compter()) ?? {};
    for (const couleur of PALETTE_PAR_DEFAUT) {
      expect(comptes[couleur] ?? 0, `pixels restés à la palette (${couleur})`).toBe(0);
    }
    expect(comptes['255,0,0'] ?? 0).toBeGreaterThan(100);
  });
}
