import { test, expect } from '@playwright/test';

/**
 * #903 — avec `databox`, `reference-lines` et `targets` doivent être VISIBLES.
 *
 * Les overlays existaient déjà, au bon endroit et aux bonnes dimensions : ce
 * n'est pas la construction du SVG qu'il faut vérifier, c'est l'ordre de
 * PEINTURE. happy-dom n'ayant pas de moteur de rendu, ce spec est la seule
 * preuve possible ; le test unitaire `tests/chart-overlays-databox.test.ts`
 * porte, lui, la règle de placement.
 *
 * Deux sondes, parce qu'`elementFromPoint` ne voit que ce qui prend la souris :
 *  - le LOSANGE d'une cible est le seul élément interactif des overlays
 *    (`pointer-events: auto`) : au milieu de lui, le point doit le renvoyer ;
 *  - la ligne de référence est décorative (`pointer-events: none`) : la sonde
 *    le lui rend le temps du test, ce qui remet le test de survol dans l'ordre
 *    de peinture.
 */

test('avec databox, repères et cibles sont peints au-dessus du graphique', async ({ page }) => {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto('/e2e/chart-overlays-databox.html');

  for (const id of ['avec', 'sans']) {
    await expect(page.locator(`#${id} .dsfr-data-chart__reflines`)).toBeAttached({
      timeout: 10_000,
    });
    await expect(page.locator(`#${id} .dsfr-data-chart__target-marker`)).toBeAttached();
  }

  const auDessus = await page.evaluate(() => {
    const pointSur = (el: Element) => {
      // `elementFromPoint` ne voit que le viewport : sans cela le graphique du
      // bas répond « rien », ce qui n'est pas une réponse.
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    };
    /** Le losange d'une cible : interactif par construction. */
    const losange = (id: string) => {
      const marker = document.querySelector(`#${id} .dsfr-data-chart__target-marker`)!;
      const dessus = pointSur(marker);
      return dessus === marker ? 'overlay' : (dessus?.tagName ?? 'rien');
    };
    /** La ligne de référence : décorative, on lui rend la souris le temps du test. */
    const reperes = (id: string) => {
      const svg = document.querySelector(`#${id} .dsfr-data-chart__reflines`) as SVGSVGElement;
      const avant = svg.style.pointerEvents;
      svg.style.pointerEvents = 'auto';
      const dessus = pointSur(svg);
      svg.style.pointerEvents = avant;
      return dessus && (dessus === svg || svg.contains(dessus))
        ? 'overlay'
        : (dessus?.tagName ?? 'rien');
    };
    return {
      avecCible: losange('avec'),
      sansCible: losange('sans'),
      avecReperes: reperes('avec'),
      sansReperes: reperes('sans'),
    };
  });

  // Avant le correctif : « CANVAS » partout sur `avec` — la carte de la DataBox
  // (z-index 500, fond blanc opaque) était peinte par-dessus les overlays.
  expect(auDessus).toEqual({
    avecCible: 'overlay',
    sansCible: 'overlay',
    avecReperes: 'overlay',
    sansReperes: 'overlay',
  });
  expect(erreurs).toEqual([]);
});
