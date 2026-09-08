import { test, expect, type Page } from '@playwright/test';

/**
 * Le chrome partage sur telephone (#signalement « barre de titre sticky »).
 *
 * CE FICHIER EXISTE PARCE QU'AUCUNE RECETTE NE REGARDAIT UN PETIT ECRAN.
 * `e2e/playwright.config.ts` ne pose pas de viewport (1280x720 par defaut) et
 * `tests/builder-e2e/playwright.config.ts` est fige a 1920x1080 : le chrome
 * mobile n'avait strictement aucune couverture, et le defaut a survecu depuis
 * #539.
 *
 * Ce qu'il verrouille : sur telephone, RIEN n'est epingle en haut. Ni
 * l'en-tete (dont la garde etait a 48em, laissant une bande 768-900 px ou il
 * etait clou sur une page qui defile — un telephone en PAYSAGE y tombe), ni
 * la barre de titre (qui s'ancrait a `top: var(--app-header-h)` sans aucune
 * media query, restant plantee a 189 px du haut pendant que son referent
 * sortait de l'ecran).
 */

const TELEPHONE = { width: 390, height: 844 };
/** Bande 768-900 px : telephone en paysage. Le seul cas ou l'en-tete etait VRAIMENT epingle. */
const PAYSAGE = { width: 844, height: 390 };
const BUREAU = { width: 1024, height: 800 };

/**
 * Les apps qui portent le chrome applicatif.
 *
 * `grist-widgets` en est exclu a dessein : ses pages sont embarquees dans
 * l'iframe d'un widget Grist, sans en-tete ni barre d'actions (verifie :
 * aucune occurrence d'`app-header` dans son index.html). Le chrome partage
 * n'a rien a y epingler.
 */
const APPS = [
  'builder',
  'builder-ia',
  'playground',
  'studio',
  'builder-carto',
  'dashboard',
  'sources',
  'favorites',
  'pipeline-helper',
  'admin',
  'monitoring',
];

/** Les 4 apps a barre d'actions dont la page defile en mobile. */
const AVEC_BARRE_DEFILANTE = ['builder', 'builder-ia', 'playground', 'dashboard'];

async function ouvrir(page: Page, app: string) {
  await page.addInitScript(() => {
    localStorage.setItem('dsfr-data-tours', JSON.stringify({ disabled: true, tours: {} }));
  });
  await page.goto(`/apps/${app}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('app-header')).toBeVisible({ timeout: 20_000 });
  // Laisser le ResizeObserver publier --app-header-h.
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--app-header-h') !== '',
    { timeout: 10_000 }
  );
}

const hauteurEnTete = (page: Page) =>
  page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-h'))
  );

test.describe('telephone 390x844', () => {
  test.use({ viewport: TELEPHONE });

  for (const app of APPS) {
    test(`${app} : en-tete dans le flux, compact, badge visible`, async ({ page }) => {
      await ouvrir(page, app);

      // E1. L'en-tete defile avec la page, comme sur tout site de l'Etat.
      expect(
        await page.evaluate(() => getComputedStyle(document.querySelector('app-header')!).position)
      ).toBe('static');

      // Il pesait 189px sur 844, soit 22% de l'ecran. La tagline en faisait 48.
      expect(await hauteurEnTete(page), 'l’en-tete a regrossi').toBeLessThanOrEqual(150);

      // La tagline est masquee, mais le signal « outil en evolution » reste :
      // le badge a rejoint le titre, son emplacement DSFR officiel.
      await expect(page.locator('.fr-header__service-tagline')).toBeHidden();
      await expect(page.locator('.fr-header__service-title .fr-badge')).toBeVisible();
    });
  }

  for (const app of AVEC_BARRE_DEFILANTE) {
    test(`${app} : la barre de titre part avec la page`, async ({ page }) => {
      // E2. LE test du signalement. La barre restait epinglee a 189px du haut,
      // avec 189px de contenu defilant AU-DESSUS d'elle.
      await ouvrir(page, app);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.evaluate(() => new Promise(requestAnimationFrame));

      const bas = await page.evaluate(
        () => document.querySelector('app-action-bar')!.getBoundingClientRect().bottom
      );
      expect(bas, 'la barre de titre est restee epinglee en haut').toBeLessThan(0);
    });

    test(`${app} : plus rien n’est epingle en haut apres defilement`, async ({ page }) => {
      // E3. Filet large : re-epingler N'IMPORTE QUOI en haut de ces pages le
      // ferait echouer, pas seulement la barre d'actions.
      await ouvrir(page, app);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.evaluate(() => new Promise(requestAnimationFrame));

      const epingles = await page.evaluate(() =>
        [...document.querySelectorAll('*')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.height < 4 || r.width < 4 || r.top < 0) return false;
            return getComputedStyle(el).position === 'sticky';
          })
          .map(
            (el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 40)}`
          )
      );

      expect(epingles, 'element epingle en haut sur telephone').toEqual([]);
    });
  }
});

test.describe('telephone en paysage 844x390 (bande 768-900)', () => {
  test.use({ viewport: PAYSAGE });

  for (const app of ['builder', 'playground']) {
    test(`${app} : l’en-tete n’est plus clou dans la bande`, async ({ page }) => {
      // E4. Le seul endroit du produit ou un en-tete etait VRAIMENT epingle sur
      // une page qui defile : sa garde etait a 48em, l'empilement du layout a
      // 900px. 169px cloues sur 390 de haut, soit 43% de l'ecran.
      await ouvrir(page, app);

      expect(
        await page.evaluate(() => getComputedStyle(document.querySelector('app-header')!).position)
      ).toBe('static');
      expect(await hauteurEnTete(page), 'la tagline est revenue dans la bande').toBeLessThanOrEqual(
        160
      );

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const bas = await page.evaluate(
        () => document.querySelector('.fr-header')!.getBoundingClientRect().bottom
      );
      expect(bas, 'l’en-tete est reste clou en paysage').toBeLessThanOrEqual(0);
    });
  }
});

test.describe('bureau 1024x800', () => {
  test.use({ viewport: BUREAU });

  test('la tagline revient et le badge reste', async ({ page }) => {
    // E6. Contre-epreuve : masquer la tagline PARTOUT serait une regression de
    // bureau que les tests telephone ne verraient pas.
    await ouvrir(page, 'builder');

    await expect(page.locator('.fr-header__service-tagline')).toBeVisible();
    await expect(page.locator('.fr-header__service-title .fr-badge')).toBeVisible();
  });
});
