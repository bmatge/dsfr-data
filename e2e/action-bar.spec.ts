import { test, expect } from '@playwright/test';
import { disableProductTour } from './helpers';

/**
 * Recette de la barre d'actions v2 (docs/ux/actions.md §5) — patron
 * « ? · Plus d'actions ▾ · secondaire · PRIMAIRE » :
 *  - un seul `[role=toolbar]` par éditeur, collé sous le header ;
 *  - exactement une action primaire, à l'extrême droite ;
 *  - une seule secondaire visible ; le reste dans `Plus d'actions ▾` ;
 *  - `Visite guidée` en tête, icône seule avec libellé sr-only ;
 *  - mobile (375px) : mêmes contrôles, primaire atteignable sans défilement,
 *    rien hors écran.
 * Les ids historiques restent la clé d'accès (ADR-096).
 */

interface EditorSpec {
  name: string;
  path: string;
  /** id du bouton primaire attendu */
  primary: string;
  primaryLabel: string;
  /** id de la secondaire visible (bouton ou app-menu) */
  secondary: string;
  /** ids attendus dans Plus d'actions ▾, dans l'ordre */
  more: string[];
  /** id du bouton « Visite guidée » */
  help: string;
  /** Préparation après chargement (ex. : fermer la modale d'arrivée). */
  prepare?: (page: import('@playwright/test').Page) => Promise<void>;
}

const editors: EditorSpec[] = [
  {
    name: 'Playground',
    path: '/apps/playground/index.html',
    primary: 'run-btn',
    primaryLabel: 'Exécuter',
    secondary: 'copy-btn',
    more: ['save-btn', 'pipeline-btn', 'export-png-btn', 'export-jpg-btn', 'deps-btn', 'reset-btn'],
    help: 'tour-btn',
  },
  {
    name: 'Builder',
    path: '/apps/builder/index.html',
    primary: 'generate-btn',
    primaryLabel: 'Générer',
    secondary: 'footer-copy-btn',
    more: [
      'save-favorite-btn',
      'open-playground-btn',
      'open-pipeline-btn',
      'export-png-btn',
      'export-jpg-btn',
    ],
    help: 'restart-tour-btn',
  },
  {
    name: 'Carto',
    path: '/apps/builder-carto/index.html',
    primary: 'btn-execute',
    primaryLabel: 'Générer',
    secondary: 'btn-export',
    more: ['save-favorite-btn', 'open-playground-btn', 'btn-reset'],
    help: 'tour-btn',
    // Modale d'arrivée « D'où viennent vos données ? » (D2, lot 7) : on prend
    // le jeu d'exemple pour libérer l'interface.
    prepare: async (page) => {
      const choice = page.locator('.carto-choice').first();
      if (await choice.isVisible({ timeout: 3000 }).catch(() => false)) await choice.click();
    },
  },
  {
    name: 'Dashboard',
    path: '/apps/dashboard/index.html',
    primary: 'btn-save',
    primaryLabel: 'Enregistrer',
    secondary: 'btn-load',
    more: ['btn-export', 'btn-preview', 'btn-new'],
    help: 'tour-btn',
  },
  {
    name: 'Pipeline',
    path: '/apps/pipeline-helper/index.html',
    primary: 'btn-execute',
    primaryLabel: 'Exécuter',
    secondary: 'btn-add-source', // entrée du menu « Ajouter une étape ▾ »
    more: ['btn-generate', 'open-playground-btn', 'btn-delete', 'btn-arrange', 'btn-fit'],
    help: 'btn-toggle-help',
  },
  {
    name: 'Assistant IA',
    path: '/apps/builder-ia/index.html',
    primary: 'clear-chat',
    primaryLabel: 'Effacer la conversation',
    secondary: 'copy-code-btn',
    more: ['save-favorite-btn', 'open-playground-btn', 'export-png-btn', 'export-jpg-btn'],
    help: 'tour-btn',
  },
  {
    name: 'Studio IA',
    path: '/apps/studio/index.html',
    primary: 'save-dashboard-btn',
    primaryLabel: 'Enregistrer',
    secondary: 'copy-code-btn',
    more: ['open-dashboard-link', 'clear-chat'],
    help: 'tour-btn',
  },
];

const PRIMARY_SELECTOR =
  '[role="toolbar"] .fr-btn:not(.fr-btn--secondary):not(.fr-btn--tertiary):not(.fr-btn--tertiary-no-outline):not(.app-menu__trigger)';

test.describe('AppActionBar v2 (docs/ux/actions.md §5)', () => {
  test.beforeEach(async ({ page }) => {
    await disableProductTour(page);
  });

  for (const ed of editors) {
    test(`${ed.name} : ? · Plus d'actions ▾ · secondaire · primaire`, async ({ page }) => {
      await page.goto(ed.path);
      await page.waitForSelector('app-action-bar [role="toolbar"]');
      await ed.prepare?.(page);

      await expect(page.locator('[role="toolbar"]')).toHaveCount(1);
      const toolbar = page.locator('app-action-bar [role="toolbar"]');
      await expect(toolbar).toHaveAttribute('aria-label', 'Actions de la page');

      // Une seule primaire, dernier bouton visible de la barre.
      const primaries = page.locator(PRIMARY_SELECTOR);
      await expect(primaries).toHaveCount(1);
      await expect(primaries).toHaveId(ed.primary);
      await expect(primaries).toHaveText(new RegExp(ed.primaryLabel));
      const visibleIds = await toolbar.evaluate((tb) =>
        Array.from(tb.querySelectorAll<HTMLElement>('button, a'))
          .filter((b) => !b.closest('.app-menu__list') && b.offsetParent !== null)
          .map((b) => b.id || b.className)
      );
      expect(visibleIds[visibleIds.length - 1]).toBe(ed.primary);
      // Visite guidée en tête, icône seule, nom accessible conservé.
      expect(visibleIds[0]).toBe(ed.help);
      const help = page.locator(`#${ed.help}`);
      await expect(help).toHaveClass(/fr-btn--tertiary-no-outline/);
      await expect(help.locator('.fr-sr-only')).toHaveText('Visite guidée');
      await expect(help).toHaveAttribute('title', /visite guidée/i);

      // Ordre : ? · Plus d'actions · secondaire · primaire (4 contrôles visibles).
      expect(visibleIds).toHaveLength(4);
      expect(visibleIds[1]).toMatch(/app-menu__trigger/);

      // Le titre de la zone de travail est le h1 de la page.
      await expect(page.locator('h1:visible')).toHaveCount(1);
      await expect(page.locator('app-action-bar h1')).toBeVisible();

      // La secondaire visible est un bouton secondaire (ou l'entrée d'un menu secondaire).
      const secondary = page.locator(`#${ed.secondary}`);
      const secondaryMenu = page.locator('app-action-bar app-menu:not(.app-action-bar__more)', {
        has: secondary,
      });
      if ((await secondaryMenu.count()) > 0) {
        await expect(secondaryMenu.locator('.app-menu__trigger')).toHaveClass(/fr-btn--secondary/);
        await secondaryMenu.locator('.app-menu__trigger').click();
        await expect(secondary).toBeVisible();
        await page.keyboard.press('Escape');
      } else {
        await expect(secondary).toBeVisible();
        await expect(secondary).toHaveClass(/fr-btn--secondary/);
      }

      // Plus d'actions ▾ : libellé texte en desktop, entrées attendues dans l'ordre.
      const more = page.locator('app-action-bar .app-action-bar__more');
      await expect(more).toBeVisible();
      await expect(more.locator('.app-menu__trigger')).toHaveText("Plus d'actions");
      await more.locator('.app-menu__trigger').click();
      await expect(more.locator('[role="menu"]')).toBeVisible();
      const ids = await more
        .locator('[role="menuitem"]')
        .evaluateAll((els) => els.map((e) => e.id));
      expect(ids).toEqual(ed.more);
      await page.keyboard.press('Escape');
      await expect(more.locator('[role="menu"]')).toBeHidden();

      // Collée sous le header : après défilement (quand la page défile), la barre
      // reste juste sous lui.
      const gap = await page.evaluate(async () => {
        const scrollable = document.documentElement.scrollHeight > window.innerHeight + 50;
        if (scrollable) {
          window.scrollTo(0, document.documentElement.scrollHeight);
          await new Promise((r) => requestAnimationFrame(() => r(null)));
        }
        const barTop = document.querySelector('app-action-bar')!.getBoundingClientRect().top;
        const headerBottom = document.querySelector('app-header')!.getBoundingClientRect().bottom;
        return Math.abs(barTop - headerBottom);
      });
      expect(gap).toBeLessThanOrEqual(1);
    });

    test(`${ed.name} @375px : mêmes contrôles, primaire atteignable, rien hors écran`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(ed.path);
      await page.waitForSelector('app-action-bar [role="toolbar"]');
      await ed.prepare?.(page);

      const primary = page.locator(`#${ed.primary}`);
      await expect(primary).toBeVisible();
      await expect(primary).toHaveText(new RegExp(ed.primaryLabel));
      const box = (await primary.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(812);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);

      // Plus d'actions en bouton icône, nom accessible conservé, mêmes entrées.
      const more = page.locator('app-action-bar .app-action-bar__more');
      await expect(more).toBeVisible();
      await expect(more.locator('.app-menu__trigger .fr-sr-only')).toHaveText("Plus d'actions");
      await more.locator('.app-menu__trigger').click();
      await expect(more.locator('[role="menu"]')).toBeVisible();
      const ids = await more
        .locator('[role="menuitem"]')
        .evaluateAll((els) => els.map((e) => e.id));
      expect(ids).toEqual(ed.more);
      const menuBox = (await more.locator('[role="menu"]').boundingBox())!;
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(375);
      await page.keyboard.press('Escape');

      // Aucun contrôle de la barre ne dépasse de l'écran.
      const overflow = await page.locator('app-action-bar [role="toolbar"]').evaluate(
        (tb) =>
          Array.from(tb.querySelectorAll<HTMLElement>('button, a'))
            .filter((b) => !b.closest('.app-menu__list') && b.offsetParent !== null)
            .map((b) => b.getBoundingClientRect())
            .filter((r) => r.left < 0 || r.right > 375).length
      );
      expect(overflow).toBe(0);
    });
  }
});
