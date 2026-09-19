import { test, expect } from '@playwright/test';

/**
 * #897 — une jointure dont une entrée est en `require-where` ne doit pas rester
 * sur « Chargement… » selon l'ordre des balises.
 *
 * Ce que seul un vrai navigateur prouve : la variable du défaut est l'ordre des
 * deux `dsfr-data-source` dans le document, donc l'ordre des callbacks de cycle
 * de vie — et happy-dom les ordonne à l'envers de Chromium. Les tests unitaires
 * (`tests/join-etat-multi-entrees.test.ts`) portent la règle d'agrégation des
 * états ; ce spec porte le symptôme tel que l'intégrateur le voit.
 *
 * Avant le correctif, la moitié haute de la fixture affichait « Chargement… »
 * indéfiniment ; la moitié basse, l'`idle-message`.
 */

test('les deux ordres de déclaration affichent l’attente, jamais un chargement sans fin', async ({
  page,
}) => {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto('/e2e/join-require-where.html');

  for (const id of ['a-kpi', 'b-kpi']) {
    const kpi = page.locator(`#${id}`);
    await expect(kpi).toContainText('Choisissez une région', { timeout: 7_000 });
    await expect(kpi).not.toContainText('Chargement');
  }

  expect(erreurs).toEqual([]);
});
