import { test, expect } from '@playwright/test';
import { disableProductTour } from './helpers';

/**
 * Recette du lot 4 de l'epic UX #546 (issue #541) — audit §C / §8 « Aperçu » :
 *  - un seul composant d'onglets, libellés `Aperçu / Code / Données / JSON` ;
 *  - fr-tabs DSFR natifs : role=tablist|tab|tabpanel, aria-selected, flèches ;
 *  - aucune action dans le tablist (C3).
 */

interface TabsSpec {
  name: string;
  path: string;
  /** libellés attendus, dans l'ordre */
  labels: string[];
}

const pages: TabsSpec[] = [
  { name: 'Builder', path: '/apps/builder/index.html', labels: ['Aperçu', 'Code', 'Données'] },
  {
    name: 'Assistant IA',
    path: '/apps/builder-ia/index.html',
    labels: ['Aperçu', 'Code', 'Données'],
  },
  { name: 'Studio IA', path: '/apps/studio/index.html', labels: ['Aperçu', 'Code', 'JSON'] },
  { name: 'Dashboard', path: '/apps/dashboard/index.html', labels: ['Aperçu', 'Code', 'JSON'] },
];

test.describe('Onglets d’aperçu fr-tabs (#541)', () => {
  test.beforeEach(async ({ page }) => {
    await disableProductTour(page);
  });

  for (const spec of pages) {
    test(`${spec.name} : tablist ARIA, libellés canoniques, flèches`, async ({ page }) => {
      await page.goto(spec.path);
      const tablist = page
        .locator('main [role="tablist"], app-preview-panel [role="tablist"]')
        .first();
      await expect(tablist).toBeVisible();
      await expect(tablist).toHaveAttribute('aria-label', /.+/);

      const tabs = tablist.locator('[role="tab"]');
      await expect(tabs).toHaveText(spec.labels);
      // Aucune action dans le tablist : seuls des onglets.
      expect(await tablist.locator('button:not([role="tab"]), a').count()).toBe(0);

      // Premier onglet sélectionné, un seul à la fois, panneau relié.
      await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
      await expect(tablist.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
      const panelId = await tabs.nth(0).getAttribute('aria-controls');
      const panel = page.locator(`#${panelId}`);
      await expect(panel).toHaveAttribute('role', 'tabpanel');
      await expect(panel).toHaveAttribute(
        'aria-labelledby',
        (await tabs.nth(0).getAttribute('id'))!
      );
      await expect(panel).toBeVisible();

      // Clic : le second onglet prend la main, son panneau s'affiche, le premier se masque.
      await tabs.nth(1).click();
      await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
      await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'false');
      const panel2 = page.locator(`#${await tabs.nth(1).getAttribute('aria-controls')}`);
      await expect(panel2).toBeVisible();
      await expect(panel).toBeHidden();

      // Clavier : flèche droite depuis l'onglet actif → onglet suivant sélectionné.
      await tabs.nth(1).focus();
      await page.keyboard.press('ArrowRight');
      await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('ArrowLeft');
      await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    });
  }
});
