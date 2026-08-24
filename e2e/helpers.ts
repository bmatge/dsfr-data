import type { Page } from '@playwright/test';

/**
 * Désactive le tour guidé (product-tour) AVANT le chargement de la page.
 *
 * Sur un profil vierge, le tour démarre automatiquement dans les apps
 * (playground, builders, sources, dashboard…) et son overlay intercepte les
 * clics (#run-btn → timeouts flaky, #407). Le seed doit précéder la
 * navigation : à appeler dans un `test.beforeEach`, avant tout `page.goto`.
 *
 * La clé/format viennent de packages/shared/src/ui/product-tour.ts
 * (STORAGE_KEYS.TOURS, état `{ disabled, tours }`).
 */
export async function disableProductTour(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('dsfr-data-tours', JSON.stringify({ disabled: true, tours: {} }));
  });
}
