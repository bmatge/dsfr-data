import { test, expect, type Page } from '@playwright/test';

/**
 * Géométrie de la carte MESURÉE : sélecteur de fonds dans la carte (#744),
 * encarts flottants à 10rem sur une même rangée (#643), légende sous les
 * encarts (`clear: both`), volet latéral borné à la largeur de la carte (#782).
 *
 * Les tests unitaires de ces quatre points lisent le TEXTE de la feuille
 * injectée (`position: absolute`, `float: left`, `clear: both`,
 * `max-width: 100%`) : ils ne verraient ni une règle écrasée par une plus
 * spécifique, ni un float annulé par un conteneur flex (#825). Ici on lit
 * des rectangles.
 */

const BUREAU = { width: 1000, height: 800 };
const TELEPHONE = { width: 390, height: 844 };

async function ouvrir(page: Page, viewport: { width: number; height: number }) {
  await page.route(/tile\.openstreetmap\.fr|data\.geopf\.fr/, (route) => route.abort());
  await page.setViewportSize(viewport);
  await page.goto('/e2e/layout-map.html');
  await expect(page.locator('#carte .leaflet-container').first()).toBeVisible();
  await expect(page.locator('#carte dsfr-data-map-inset .leaflet-container')).toHaveCount(3);
  // Les encarts clonent la couche : on ne compte que les marqueurs du volet principal.
  await expect
    .poll(() => page.locator(MARQUEURS_PRINCIPAUX).count(), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);
}

/** Marqueurs du volet principal (le conteneur Leaflet enfant direct de l'hôte). */
const MARQUEURS_PRINCIPAUX = '#carte > .dsfr-data-map__container .leaflet-marker-icon';

const rect = (page: Page, selector: string) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return {
      top: r.top,
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  }, selector);

test.describe('dsfr-data-map — géométrie mesurée', () => {
  test('le sélecteur de fonds est posé DANS la carte (#744)', async ({ page }) => {
    await ouvrir(page, BUREAU);
    const carte = await rect(page, '#carte .dsfr-data-map__container');
    const sel = await rect(page, '#carte .dsfr-data-map__tiles-switcher');
    expect(sel.width).toBeGreaterThan(0);
    expect(sel.top).toBeGreaterThanOrEqual(carte.top);
    expect(sel.bottom).toBeLessThanOrEqual(carte.bottom);
    expect(sel.left).toBeGreaterThanOrEqual(carte.left);
    expect(sel.right).toBeLessThanOrEqual(carte.right);
  });

  test('les encarts flottent à 10rem, sur une même rangée, sous le volet (#643)', async ({
    page,
  }) => {
    await ouvrir(page, BUREAU);
    const volet = await rect(page, '#carte .dsfr-data-map__container');
    const encarts = await page.$$eval('#carte > dsfr-data-map-inset', (els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left, width: r.width, bottom: r.bottom };
      })
    );
    expect(encarts).toHaveLength(3);
    for (const e of encarts) {
      expect(Math.abs(e.width - 160)).toBeLessThan(2); // 10rem
      expect(e.top).toBeGreaterThanOrEqual(volet.bottom - 1);
      expect(Math.abs(e.top - encarts[0].top)).toBeLessThan(2); // même rangée : le float agit
    }
    expect(encarts[1].left).toBeGreaterThan(encarts[0].left);
  });

  test('la légende passe SOUS la rangée d’encarts (clear: both)', async ({ page }) => {
    await ouvrir(page, BUREAU);
    const legende = page.locator('#carte dsfr-data-map-legend');
    await expect(legende).toBeVisible();
    await expect(legende).toContainText('Catégorie');
    const l = await rect(page, '#carte dsfr-data-map-legend');
    const basEncarts = await page.$$eval('#carte > dsfr-data-map-inset', (els) =>
      Math.max(...els.map((el) => el.getBoundingClientRect().bottom))
    );
    expect(l.top).toBeGreaterThanOrEqual(basEncarts - 1);
  });

  /**
   * Le volet latéral est du MOBILIER de premier plan : il doit recouvrir le
   * sélecteur de fonds, pas l'inverse. Aucune valeur de `z-index` ne le dit —
   * le volet vit DANS le conteneur Leaflet, le sélecteur en est un frère : dès
   * que le conteneur ouvre un contexte d'empilement, tout son sous-arbre passe
   * en bloc sous le sélecteur, quel que soit son `z-index`. On mesure donc
   * l'empilement RÉEL, par `elementFromPoint`, et non le texte de la feuille.
   */
  test('le volet latéral recouvre le sélecteur de fonds', async ({ page }) => {
    await ouvrir(page, BUREAU);
    await page.locator(MARQUEURS_PRINCIPAUX).first().click();
    const panel = page.locator('#carte .dsfr-data-map-popup__panel');
    await expect(panel).toHaveClass(/dsfr-data-map-popup__panel--open/);
    const carte = await rect(page, '#carte .dsfr-data-map__container');
    await expect
      .poll(async () => (await rect(page, '#carte .dsfr-data-map-popup__panel')).right, {
        timeout: 3_000,
      })
      .toBeLessThanOrEqual(carte.right + 1);

    // Les deux se chevauchent bien : sinon le test ne prouverait rien.
    const sel = await rect(page, '#carte .dsfr-data-map__tiles-switcher');
    const p = await rect(page, '#carte .dsfr-data-map-popup__panel');
    expect(sel.left).toBeLessThan(p.right);
    expect(sel.right).toBeGreaterThan(p.left);
    expect(sel.top).toBeLessThan(p.bottom);

    // Au centre du sélecteur, c'est le volet qu'on touche.
    const dessus = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x as number, y as number);
        return {
          dansLeVolet: !!el?.closest('.dsfr-data-map-popup__panel'),
          classe: el?.className ?? null,
        };
      },
      [(sel.left + sel.right) / 2, (sel.top + sel.bottom) / 2]
    );
    expect(dessus.dansLeVolet, `element touche : ${dessus.classe}`).toBe(true);
  });

  test('volet latéral width="380px" borné à la carte sur 390 px (#782)', async ({ page }) => {
    await ouvrir(page, TELEPHONE);
    await page.locator(MARQUEURS_PRINCIPAUX).first().click();
    const panel = page.locator('#carte .dsfr-data-map-popup__panel');
    await expect(panel).toHaveClass(/dsfr-data-map-popup__panel--open/);
    const carte = await rect(page, '#carte .dsfr-data-map__container');
    // Le volet glisse depuis la droite (transition 0.2 s) : on attend qu'il soit posé.
    await expect
      .poll(async () => (await rect(page, '#carte .dsfr-data-map-popup__panel')).right, {
        timeout: 3_000,
      })
      .toBeLessThanOrEqual(carte.right + 1);
    const p = await rect(page, '#carte .dsfr-data-map-popup__panel');
    expect(p.width).toBeLessThanOrEqual(carte.width + 1);
    expect(p.width).toBeGreaterThan(carte.width * 0.5);
  });
});
