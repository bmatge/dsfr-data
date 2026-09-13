import { test, expect, type Page } from '@playwright/test';

/**
 * Colonnage MESURÉ : kpi-group (`cols` historique, `span`, échelle `per-row`),
 * display (`per-row`), facets (`cols`, #788).
 *
 * CE FICHIER EXISTE PARCE QUE #822 EST PASSÉ AU VERT SOUS happy-dom : les tests
 * de #790 lisaient le texte de la feuille du groupe (`cssText`), jamais le
 * style calculé d'un KPI. `span=""` reflété sur chaque instance désactivait
 * `::slotted(*:not([span]))`, tous les KPI tombaient à une colonne sur douze
 * — et sous 768 px un `!important` masquait tout. D'où trois largeurs
 * d'écran, et des rectangles : on compte les éléments par RANGÉE (même
 * ordonnée) et on compare les largeurs entre elles, ce qui est insensible aux
 * gouttières.
 */

const BUREAU = { width: 1280, height: 800 }; // ≥ lg (62em = 992 px)
const TABLETTE = { width: 800, height: 800 }; // md (48em = 768 px) sans lg
const TELEPHONE = { width: 390, height: 844 };

async function ouvrir(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto('/e2e/layout-grid.html');
  await expect(page.locator('#grp-cols dsfr-data-kpi').first()).toBeVisible();
  await expect(page.locator('#fac')).toBeVisible();
}

interface Boite {
  top: number;
  width: number;
}

/** Boîtes des éléments visibles d'un locator (perce le shadow DOM). */
const boites = (page: Page, selector: string): Promise<Boite[]> =>
  page.locator(selector).evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetHeight > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), width: Math.round(r.width) };
      })
  );

/** Nombre d'éléments par rangée, dans l'ordre des rangées. */
function parRangee(b: Boite[]): number[] {
  const rangs = new Map<number, number>();
  for (const { top } of b) rangs.set(top, (rangs.get(top) ?? 0) + 1);
  return [...rangs.entries()].sort((x, y) => x[0] - y[0]).map(([, n]) => n);
}

const memeLargeur = (b: Boite[]) => b.every((x) => Math.abs(x.width - b[0].width) <= 2);

test.describe('dsfr-data-kpi-group — colonnage mesuré', () => {
  test('cols="3" historique : trois par ligne à ≥ 768 px, span="6" prend la moitié (#822)', async ({
    page,
  }) => {
    await ouvrir(page, BUREAU);
    const kpis = await boites(page, '#grp-cols > dsfr-data-kpi');
    expect(kpis).toHaveLength(4);
    // Le défaut de #822 : chaque KPI à 1/12, douze par rangée. Ici trois, puis le span="6".
    expect(parRangee(kpis)).toEqual([3, 1]);
    expect(memeLargeur(kpis.slice(0, 3))).toBe(true);
    // span="6" (moitié) vaut une fois et demie un tiers, gouttières comprises.
    expect(kpis[3].width / kpis[0].width).toBeGreaterThan(1.45);
    expect(kpis[3].width / kpis[0].width).toBeLessThan(1.6);
    // Aucun KPI ne porte un span vide reflété.
    const spans = await page.$$eval('#grp-cols > dsfr-data-kpi', (els) =>
      els.map((el) => el.getAttribute('span'))
    );
    expect(spans).toEqual([null, null, null, '6']);
  });

  test('cols="3" sous 768 px : un par ligne, pleine largeur', async ({ page }) => {
    await ouvrir(page, TELEPHONE);
    const kpis = await boites(page, '#grp-cols > dsfr-data-kpi');
    expect(parRangee(kpis)).toEqual([1, 1, 1, 1]);
    const groupe = (await page.locator('#grp-cols').boundingBox())!.width;
    for (const k of kpis) expect(Math.abs(k.width - groupe)).toBeLessThanOrEqual(2);
  });

  test('per-row="1 md:2 lg:4" : 4 par ligne en bureau, 2 en tablette, 1 en téléphone', async ({
    page,
  }) => {
    await ouvrir(page, BUREAU);
    expect(parRangee(await boites(page, '#grp-scale > dsfr-data-kpi'))).toEqual([4]);
    await ouvrir(page, TABLETTE);
    expect(parRangee(await boites(page, '#grp-scale > dsfr-data-kpi'))).toEqual([2, 2]);
    await ouvrir(page, TELEPHONE);
    expect(parRangee(await boites(page, '#grp-scale > dsfr-data-kpi'))).toEqual([1, 1, 1, 1]);
  });
});

/** La feuille DSFR est chargée du CDN : son absence doit être un échec visible, pas un faux vert. */
async function exigerDsfr(page: Page) {
  const display = await page
    .locator('#disp .fr-grid-row')
    .first()
    .evaluate((el) => getComputedStyle(el).display);
  expect(display, 'feuille DSFR absente (CDN ?) : la grille fr-grid-row ne rend pas').toBe('flex');
}

test.describe('dsfr-data-display — per-row mesuré', () => {
  test('per-row="1 md:3" : trois cartes par ligne en bureau, une en téléphone', async ({
    page,
  }) => {
    await ouvrir(page, BUREAU);
    await expect(page.locator('#disp .fr-card')).toHaveCount(6);
    await exigerDsfr(page);
    expect(parRangee(await boites(page, '#disp .fr-card'))).toEqual([3, 3]);

    await ouvrir(page, TELEPHONE);
    expect(parRangee(await boites(page, '#disp .fr-card'))).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

test.describe('dsfr-data-facets — cols mesuré (#788)', () => {
  test('cols="4" : un tiers de la largeur en bureau, pleine largeur sous 768 px', async ({
    page,
  }) => {
    await ouvrir(page, BUREAU);
    await exigerDsfr(page);
    const groupes = '#fac .dsfr-data-facets__group';
    await expect(page.locator(groupes)).toHaveCount(2);
    const conteneur = (await page.locator('#fac').boundingBox())!.width;
    const bureau = await boites(page, groupes);
    expect(parRangee(bureau)).toEqual([2]);
    for (const g of bureau) {
      expect(g.width).toBeLessThan(conteneur / 2);
      expect(g.width).toBeGreaterThan(conteneur / 4);
    }

    await ouvrir(page, TELEPHONE);
    const mobile = await boites(page, groupes);
    const conteneurMobile = (await page.locator('#fac').boundingBox())!.width;
    expect(parRangee(mobile)).toEqual([1, 1]);
    for (const g of mobile) expect(g.width).toBeGreaterThan(conteneurMobile * 0.9);
  });
});
