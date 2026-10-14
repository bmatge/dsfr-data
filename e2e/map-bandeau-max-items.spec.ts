import { test, expect, type Page } from '@playwright/test';

/**
 * #1307 — le bandeau « N affichés sur M » d'une couche tronquée (`max-items`)
 * reste dans l'emprise de la CARTE quand une légende (et des encarts) sont
 * posés dessous.
 *
 * Le bandeau est un frère du conteneur Leaflet, positionné dans l'hôte : une
 * légende sous la carte allonge l'hôte, et un bandeau ancré à `bottom: 10px`
 * se posait sur elle. happy-dom ne calcule aucune hauteur : seul un
 * navigateur mesure où il tombe. Même défaut, même mesure que la ligne d'état
 * de panne (#1297, `_placeLayerStatus`).
 */

const BUREAU = { width: 1280, height: 800 };
const TELEPHONE = { width: 375, height: 812 };

interface Boite {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface Mesure {
  carte: Boite;
  legende: Boite | null;
  bandeaux: Boite[];
}

/** Rectangles du volet Leaflet, de la légende et des bandeaux d'une carte. */
function mesurer(page: Page, id: string): Promise<Mesure> {
  return page.evaluate((idCarte) => {
    const boite = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    const hote = document.getElementById(idCarte)!;
    return {
      carte: boite(hote.querySelector(':scope > .dsfr-data-map__container'))!,
      legende: boite(hote.querySelector(':scope > dsfr-data-map-legend')),
      bandeaux: [...hote.querySelectorAll(':scope > .dsfr-data-map__max-items-banner')].map((b) =>
        boite(b)!
      ),
    };
  }, id);
}

const dedans = (b: Boite, c: Boite) =>
  b.top >= c.top - 0.5 &&
  b.bottom <= c.bottom + 0.5 &&
  b.left >= c.left - 0.5 &&
  b.right <= c.right + 0.5;

const chevauche = (a: Boite, b: Boite) =>
  a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5 && a.left < b.right && b.left < a.right;

/**
 * Amène la carte à l'écran (elle ne s'initialise qu'à la visibilité) et
 * attend ses bandeaux. Le défilement est refait tant que la carte n'est pas
 * initialisée : celles du dessus, en s'initialisant, décalent la page.
 */
async function montrer(page: Page, id: string, bandeaux: number) {
  const hote = page.locator(`#${id}`);
  await expect(async () => {
    await hote.scrollIntoViewIfNeeded();
    await expect(hote.locator(':scope > .leaflet-container')).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await expect(hote.locator(':scope > .dsfr-data-map__max-items-banner')).toHaveCount(bandeaux);
}

for (const [nom, viewport] of [
  ['bureau 1280 px', BUREAU],
  ['téléphone 375 px', TELEPHONE],
] as const) {
  test.describe(`bandeau max-items et légende — ${nom}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/e2e/map-bandeau-max-items.html');
    });

    test('une couche tronquée, légende dessous : le bandeau reste sur la carte', async ({
      page,
    }) => {
      await montrer(page, 'avec-legende', 1);
      await expect(page.locator('#avec-legende dsfr-data-map-legend li')).not.toHaveCount(0);
      // L'état stable est observable : le bandeau DANS la carte, hors de la légende.
      await expect
        .poll(async () => {
          const m = await mesurer(page, 'avec-legende');
          return dedans(m.bandeaux[0], m.carte) && !chevauche(m.bandeaux[0], m.legende!);
        })
        .toBe(true);
      const m = await mesurer(page, 'avec-legende');
      // Garde-fou : la légende est bien SOUS la carte, c'est elle qui allonge l'hôte.
      expect(m.legende!.top).toBeGreaterThanOrEqual(m.carte.bottom - 1);
      // Au bas de la carte, pas en haut : à 10 px de son bord, à 2 px près.
      expect(Math.abs(m.carte.bottom - m.bandeaux[0].bottom - 10)).toBeLessThanOrEqual(2);
    });

    test('deux couches tronquées, légende et encarts dessous : bandeaux empilés sur la carte', async ({
      page,
    }) => {
      await montrer(page, 'deux-couches', 2);
      await expect(page.locator('#deux-couches dsfr-data-map-legend li')).not.toHaveCount(0);
      await expect
        .poll(async () => {
          const m = await mesurer(page, 'deux-couches');
          const [a, b] = m.bandeaux;
          return (
            dedans(a, m.carte) &&
            dedans(b, m.carte) &&
            !chevauche(a, b) &&
            !chevauche(a, m.legende!) &&
            !chevauche(b, m.legende!)
          );
        })
        .toBe(true);
    });

    test('témoin sans légende : le bandeau au bas de la carte, comme avant', async ({ page }) => {
      await montrer(page, 'sans-legende', 1);
      await expect
        .poll(async () => {
          const m = await mesurer(page, 'sans-legende');
          return (
            dedans(m.bandeaux[0], m.carte) &&
            Math.abs(m.carte.bottom - m.bandeaux[0].bottom - 10) <= 2
          );
        })
        .toBe(true);
    });
  });
}
