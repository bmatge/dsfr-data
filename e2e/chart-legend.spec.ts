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

/**
 * #1244 — `color-map` lu par LIBELLÉ D'AXE (une seule série, aucune modalité
 * n'est un nom de série) sur un graphique à points.
 *
 * Mesuré avant correction, `color-map="1:#ff0000,3:#00aa00"` sur quatre
 * points : la courbe traçait son TRAIT entier en rouge (652 px) et ses quatre
 * points à la palette, sans un pixel vert ; le radar remplissait son aire en
 * rouge opaque (6 325 px) ; le nuage ne changeait pas. Attendu : le point « 1 »
 * rouge, le point « 3 » vert, et le reste — trait, aire, autres points — à la
 * couleur de la série. Un point pèse environ 80 px francs : la borne haute
 * écarte un trait ou une aire qui auraient pris la couleur d'une modalité.
 */
const SERIE_PAR_DEFAUT = '92,104,229';

for (const { id, nom } of [
  { id: 'courbe-modalites', nom: 'courbe (line)' },
  { id: 'radar-modalites', nom: 'radar' },
  { id: 'nuage-modalites', nom: 'nuage de points (scatter)' },
]) {
  test(`color-map par libellé d'axe colore chaque point nommé — ${nom}`, async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'warning' && msg.text().includes(id)) warnings.push(msg.text());
    });
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

    // Le vert n'apparaît qu'une fois le recoloriage passé : avant lui, aucun
    // point n'en porte, et avant la correction il n'apparaissait jamais. Les
    // deux couleurs sont attendues ENSEMBLE : le radar se redessine une fois
    // de plus (bornes de l'échelle radiale), et une lecture prise entre deux
    // images ne voit qu'un point sur deux.
    await expect
      .poll(
        async () => {
          const lu = (await compter()) ?? {};
          return Math.min(lu['0,170,0'] ?? 0, lu['255,0,0'] ?? 0);
        },
        { timeout: 10_000 }
      )
      .toBeGreaterThan(40);
    const comptes = (await compter()) ?? {};
    const rouge = comptes['255,0,0'] ?? 0;
    const vert = comptes['0,170,0'] ?? 0;
    expect(rouge, 'le point « 1 » est rouge').toBeGreaterThan(40);
    expect(rouge, 'seul le point est rouge, pas le trait ni l’aire').toBeLessThan(200);
    expect(vert, 'seul le point « 3 » est vert').toBeLessThan(200);
    // Les deux points non cités, et le trait, gardent la couleur de la série.
    expect(comptes[SERIE_PAR_DEFAUT] ?? 0).toBeGreaterThan(100);
    // La pastille de légende est celle de la série : elle n'est pas repeinte,
    // et le composant n'avertit d'aucun décompte de pastilles.
    expect(
      await page.$$eval(`#${id} .legend_dot`, (els) =>
        els.map((el) => getComputedStyle(el).backgroundColor)
      )
    ).toEqual(['rgb(92, 104, 229)']);
    expect(warnings).toEqual([]);
  });
}
