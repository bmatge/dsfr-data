import { test, expect } from '@playwright/test';
import { disableProductTour } from './helpers';

/**
 * Recette du lot 8 de l'epic UX #546 (issue #545) — audit §G :
 *  - à 375 / 768 / 1024 / 1440 px : aucun bouton, lien-bouton ou barre hors
 *    cadre (x < 0 ou x + w > largeur), pas de défilement horizontal de page ;
 *  - sur mobile, l'action primaire est atteignable sans défilement.
 * Les widgets tiers (Leaflet, CodeMirror, Rete) sont exclus des mesures.
 */

interface PageSpec {
  name: string;
  path: string;
  /** id de l'action primaire de la barre (absent : app conversationnelle / page plein cadre) */
  primary?: string;
  prepare?: (page: import('@playwright/test').Page) => Promise<void>;
}

const PAGES: PageSpec[] = [
  { name: 'Builder', path: '/apps/builder/index.html', primary: 'generate-btn' },
  { name: 'Carto', path: '/apps/builder-carto/index.html', primary: 'btn-execute' },
  { name: 'Pipeline', path: '/apps/pipeline-helper/index.html', primary: 'btn-execute' },
  { name: 'Playground', path: '/apps/playground/index.html', primary: 'run-btn' },
  { name: 'Dashboard', path: '/apps/dashboard/index.html', primary: 'btn-save' },
  { name: 'Assistant IA', path: '/apps/builder-ia/index.html' },
  { name: 'Studio IA', path: '/apps/studio/index.html', primary: 'save-dashboard-btn' },
  { name: 'Sources', path: '/apps/sources/index.html' },
  { name: 'Favoris', path: '/apps/favorites/index.html' },
];

const WIDTHS = [375, 768, 1024, 1440];
const EXCLUDED = '.leaflet-container, .CodeMirror, [class*="rete"], iframe';

test.describe('Responsive (#545)', () => {
  test.beforeEach(async ({ page }) => {
    await disableProductTour(page);
  });

  for (const spec of PAGES) {
    for (const width of WIDTHS) {
      test(`${spec.name} @${width}px : rien hors cadre, primaire atteignable`, async ({ page }) => {
        await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
        await page.goto(spec.path);
        await page.waitForSelector('app-header .fr-header');
        await spec.prepare?.(page);
        await page.waitForTimeout(400);

        const report = await page.evaluate((excluded) => {
          const vw = window.innerWidth;
          const out: string[] = [];
          const candidates = Array.from(
            document.querySelectorAll<HTMLElement>(
              'button, a.fr-btn, [role="toolbar"], [role="tablist"], app-action-bar, .fr-header, select, input:not([type="hidden"])'
            )
          ).filter((el) => el.offsetParent !== null && !el.closest(excluded));
          for (const el of candidates) {
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            if (r.left < -1 || r.right > vw + 1) {
              out.push(
                `${el.tagName.toLowerCase()}#${el.id || el.className.split(' ')[0]} x=${Math.round(r.left)} w=${Math.round(r.width)}`
              );
            }
          }
          return {
            out,
            hScroll: document.documentElement.scrollWidth - vw,
          };
        }, EXCLUDED);

        expect(report.out, `hors cadre à ${width}px :\n${report.out.join('\n')}`).toEqual([]);
        expect(report.hScroll, `défilement horizontal de ${report.hScroll}px`).toBeLessThanOrEqual(
          1
        );

        if (spec.primary) {
          const primary = page.locator(`#${spec.primary}`);
          await expect(primary).toBeVisible();
          const box = (await primary.boundingBox())!;
          const vh = width < 768 ? 812 : 900;
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(
            box.y + box.height,
            'action primaire sous la ligne de flottaison'
          ).toBeLessThanOrEqual(vh);
        }
      });
    }
  }
});
