import { test, expect } from '@playwright/test';
import { disableProductTour } from './helpers';

/**
 * Recette du lot 5 de l'epic UX #546 (issue #542) — audit §B9/§B10/§E3 :
 *  - plus de classe de bouton « maison » : tout bouton visible porte une classe
 *    DSFR (`fr-btn*`, `fr-tabs__tab`, `fr-tag`…) ou une des deux primitives
 *    internes (`app-btn--icon`, `app-card-choice`) ;
 *  - aucune cible interactive visible < 24×24 px (WCAG 2.5.8) ;
 *  - `:focus-visible` visible sur les boutons atteints au clavier.
 * Les widgets tiers (Leaflet, CodeMirror, iframes) et les composants
 * `dsfr-data-*` (bibliothèque, hors périmètre) sont exclus.
 */

const PAGES = [
  '/index.html',
  '/apps/sources/index.html',
  '/apps/builder-ia/index.html',
  '/apps/studio/index.html',
  '/apps/builder/index.html',
  '/apps/builder-carto/index.html',
  '/apps/dashboard/index.html',
  '/apps/playground/index.html',
  '/apps/pipeline-helper/index.html',
  '/apps/monitoring/index.html',
  '/apps/admin/index.html',
  '/apps/favorites/index.html',
  '/guide/guide.html',
  '/specs/index.html',
];

/** Classes qui attestent d'un bouton DSFR ou d'une primitive documentée. */
const ALLOWED = [
  'fr-btn',
  'fr-tabs__tab',
  'fr-tag',
  'fr-breadcrumb__button',
  'fr-accordion__btn',
  'fr-nav__btn',
  'fr-sidemenu__btn',
  'fr-pagination__link',
  'fr-translate__btn',
  'fr-btn--menu',
  'app-btn--icon',
  'app-card-choice',
  'app-menu__item',
  'app-menu__trigger',
  // Déclencheurs d'accordéon des panneaux Carto — conservés (inventaire lot 5).
  'carto-panel__header-toggle',
  'carto-panel__header',
];

// Widgets tiers et carrousel éditorial de l'accueil (hors périmètre de #542).
const EXCLUDED_ANCESTORS =
  '.leaflet-container, .CodeMirror, [class*="rete"], .chart-dots-nav, .chart-panel, .home-carousel';

test.describe('Boutons : DSFR ou primitives, cibles ≥ 24 px, focus visible (#542)', () => {
  test.beforeEach(async ({ page }) => {
    await disableProductTour(page);
  });

  for (const path of PAGES) {
    test(`${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForSelector('app-header .fr-header');
      await page.waitForTimeout(400);

      const report = await page.evaluate(
        ({ allowed, excluded }) => {
          // Composants de la bibliothèque (dsfr-data-*) : hors périmètre.
          const inLibrary = (el: Element) => {
            for (let p: Element | null = el.parentElement; p; p = p.parentElement) {
              if (p.tagName.toLowerCase().startsWith('dsfr-data-')) return true;
            }
            return false;
          };
          const buttons = Array.from(document.querySelectorAll<HTMLElement>('button')).filter(
            (b) => b.offsetParent !== null && !b.closest(excluded) && !inLibrary(b)
          );
          const maison: string[] = [];
          const small: string[] = [];
          for (const b of buttons) {
            const cls = Array.from(b.classList);
            if (!cls.some((c) => allowed.includes(c))) {
              maison.push(`<button class="${b.className}" id="${b.id}">`);
            }
            const r = b.getBoundingClientRect();
            if (r.width < 24 || r.height < 24) {
              small.push(`${b.id || b.className} ${Math.round(r.width)}×${Math.round(r.height)}`);
            }
          }
          return { maison, small, total: buttons.length };
        },
        { allowed: ALLOWED, excluded: EXCLUDED_ANCESTORS }
      );

      expect(report.maison, `boutons hors DSFR/primitives :\n${report.maison.join('\n')}`).toEqual(
        []
      );
      expect(report.small, `cibles < 24px :\n${report.small.join('\n')}`).toEqual([]);

      // focus-visible : on parcourt les premiers boutons au clavier.
      const noOutline: string[] = [];
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el.tagName !== 'BUTTON') return null;
          const cs = getComputedStyle(el);
          const visible =
            (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) ||
            cs.boxShadow !== 'none';
          return { id: el.id || el.className, visible };
        });
        if (info && !info.visible) noOutline.push(info.id);
      }
      expect(noOutline, `boutons sans focus visible : ${noOutline.join(', ')}`).toEqual([]);
    });
  }
});
