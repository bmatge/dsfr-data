import { test, expect, type Page } from '@playwright/test';

/**
 * Plein écran d'une carte à encarts (#780, #825) et largeur d'encart à un
 * seul point de rupture (#818) — MESURÉS dans un vrai navigateur.
 *
 * CE FICHIER EXISTE PARCE QUE LES TESTS UNITAIRES NE VOIENT PAS LA MISE EN
 * PAGE. #822 puis #825 sont passés au vert sous happy-dom, qui ne calcule ni
 * float, ni flex, ni hauteur : les tests lisaient le texte de la feuille CSS.
 * Ici on lit `getBoundingClientRect()` après l'entrée en plein écran, et
 * on compare à l'écran. Un encart hors cadre, un volet à 0 px ou un volet
 * plus haut que l'écran font échouer.
 *
 * Les tuiles sont coupées (aucune dépendance réseau) : Leaflet s'initialise
 * sans elles, seule la géométrie compte.
 */

const VIEWPORT = { width: 1280, height: 720 };

async function openFixture(page: Page) {
  await page.route(/tile\.openstreetmap\.fr|data\.geopf\.fr/, (route) => route.abort());
  await page.setViewportSize(VIEWPORT);
  await page.goto('/e2e/map-fullscreen.html');
  await expect(page.locator('#carte .leaflet-container').first()).toBeVisible();
  await expect(page.locator('#carte dsfr-data-map-inset .leaflet-container')).toHaveCount(5);
}

const rectOf = (page: Page, selector: string) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
  }, selector);

test.describe('dsfr-data-map — plein écran mesuré (#825)', () => {
  test('height="60%" : en plein écran, volet + encarts tiennent dans l’écran', async ({ page }) => {
    await openFixture(page);

    const avant = await rectOf(page, '#carte .dsfr-data-map__container');
    expect(avant.height).toBeGreaterThan(0);
    // Ratio hors plein écran : 60 % de la largeur de l'hôte.
    const hostWidth = (await rectOf(page, '#carte')).width;
    expect(Math.abs(avant.height - hostWidth * 0.6)).toBeLessThan(2);

    await page.getByRole('button', { name: /plein écran/i }).click();
    await page.waitForFunction(() => document.fullscreenElement?.id === 'carte');
    // Laisser le ResizeObserver et le fullscreenchange se prononcer.
    await page.waitForTimeout(300);

    const ecran = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    const volet = await rectOf(page, '#carte .dsfr-data-map__container');
    const encarts = await page.evaluate(() =>
      [...document.querySelectorAll('#carte > dsfr-data-map-inset')].map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height };
      })
    );

    // Le volet n'est ni à 0 px (#825) ni reposé à largeur × ratio (revue
    // 2026-09-13 : 1152 px sur 1920 de large, plus haut que l'écran).
    expect(volet.height).toBeGreaterThan(ecran.h / 2);
    expect(volet.height).toBeLessThanOrEqual(ecran.h);
    // Les cinq encarts sont sous le volet et ENTIÈREMENT à l'écran.
    expect(encarts).toHaveLength(5);
    for (const encart of encarts) {
      expect(encart.height).toBeGreaterThan(0);
      expect(encart.top).toBeGreaterThanOrEqual(volet.bottom - 1);
      expect(encart.bottom).toBeLessThanOrEqual(ecran.h + 1);
    }

    // Sortie par le bouton (devenu « Quitter le plein écran ») : le ratio
    // reprend la main. Échap n'est PAS simulable ici — la touche synthétique
    // de Playwright n'atteint pas le gestionnaire natif du navigateur, seul
    // un vrai geste le fait ; c'est le point à confirmer à la main (#825).
    await page.getByRole('button', { name: /quitter le plein écran/i }).click();
    await page.waitForFunction(() => document.fullscreenElement === null);
    await page.waitForTimeout(300);
    const apres = await rectOf(page, '#carte .dsfr-data-map__container');
    expect(Math.abs(apres.height - avant.height)).toBeLessThan(2);
  });
});

test.describe('dsfr-data-map-inset — width="md:20%" (#818)', () => {
  test('un seul jeton est une échelle : 20 % de la carte au-dessus de 48em', async ({ page }) => {
    await openFixture(page);
    const carte = await rectOf(page, '#carte-jeton');
    const encart = await rectOf(page, '#encart-jeton');
    const inline = await page.evaluate(
      () => (document.querySelector('#encart-jeton') as HTMLElement).style.width
    );
    expect(inline).toBe('');
    expect(Math.abs(encart.width - carte.width * 0.2)).toBeLessThan(2);
  });
});
