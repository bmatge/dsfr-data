import { test, expect } from '@playwright/test';

/**
 * #898 — le `<summary class="fr-accordion__btn">` de `dsfr-data-a11y` était en
 * `content-box` : `width: 100 %` PLUS 16 px de padding de chaque côté, donc
 * 390 px dans un conteneur de 358, et un défilement horizontal de 16 px sur
 * toute page portant un `dsfr-data-a11y` (51 des 66 pages du banc d'essai).
 *
 * happy-dom n'a pas de mise en page : la largeur ne se mesure qu'au navigateur.
 * Le test unitaire `tests/a11y-summary-box-sizing.test.ts` porte, lui, la règle
 * et sa portée.
 */

const TELEPHONE = { width: 390, height: 844 };

test('à 390 px, le bouton d’accordéon tient dans son conteneur et la page ne défile pas', async ({
  page,
}) => {
  await page.setViewportSize(TELEPHONE);
  await page.goto('/e2e/a11y-accordion-mobile.html');
  await expect(page.locator('#a11y summary.fr-accordion__btn')).toBeVisible();

  const mesures = await page.evaluate(() => {
    const summary = document.querySelector('#a11y summary.fr-accordion__btn') as HTMLElement;
    const details = summary.parentElement as HTMLElement;
    return {
      boxSizing: getComputedStyle(summary).boxSizing,
      summary: Math.round(summary.getBoundingClientRect().width),
      details: Math.round(details.getBoundingClientRect().width),
      scrollWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    };
  });

  // Avant : content-box, summary 390 dans un details de 358, scrollWidth 406.
  expect(mesures.boxSizing).toBe('border-box');
  expect(mesures.summary).toBe(mesures.details);
  expect(mesures.scrollWidth).toBe(mesures.viewport);
});
