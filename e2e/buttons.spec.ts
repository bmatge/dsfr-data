import { test, expect, type Page } from '@playwright/test';
import { disableProductTour } from './helpers';

/**
 * Recette du lot 5 de l'epic UX #546 (issue #542) — audit §B9/§B10/§E3 :
 *  - plus de classe de bouton « maison » : tout bouton visible porte une classe
 *    DSFR (`fr-btn*`, `fr-tabs__tab`, `fr-tag`…) ou une primitive déclarée
 *    dans `ALLOWED`, avec sa raison ;
 *  - aucune cible interactive visible < 24×24 px (WCAG 2.5.8) ;
 *  - `:focus-visible` visible sur les boutons atteints au clavier.
 * Les widgets tiers (Leaflet, CodeMirror, iframes) et les composants
 * `dsfr-data-*` (bibliothèque, hors périmètre) sont exclus.
 *
 * Deux passes par page (#1118) : l'état d'arrivée, puis les panneaux que l'app
 * ouvre à la demande — l'assistant contextuel (conversation et onglet
 * Diagnostic, #1011, #1086) et le tiroir Diagnostic (#605). Ces boutons
 * n'existaient pas au moment du lot 5 et échappaient à la recette.
 *
 * Bloquant en CI dans `e2e-layout.yml` (#1118) : le spec n'était lancé nulle
 * part, et `app-diag__rail` l'avait fait rougir sans que personne le voie.
 */

const PAGES = [
  '/index.html',
  '/apps/sources/index.html',
  // Sans `?ancien=1`, l'ancien Assistant IA redirige vers le Studio (#1081) :
  // la page doublait alors celle du Studio et l'Assistant n'était plus audité.
  '/apps/builder-ia/index.html?ancien=1',
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

/**
 * Classes qui attestent d'un bouton DSFR ou d'une primitive documentée
 * (`docs/ux/actions.md` §5.4). Une primitive n'entre ici qu'avec sa raison :
 * pourquoi aucun bouton DSFR ne convient, et où sont son `:focus-visible` et
 * sa cible (≥ 24 px, mesurés ci-dessous).
 */
const ALLOWED = [
  // --- DSFR ---
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
  // Le composant Lien du DSFR se pose aussi sur un <button> (action d'aspect
  // lien) : « Construire pour moi dans le Studio », « Voir le détail ».
  'fr-link',
  // --- Primitives de l'app (packages/app-ui/src/app-primitives.ts) ---
  'app-btn--icon',
  'app-card-choice',
  'app-menu__item',
  'app-menu__trigger',
  // --- Contrôles propres à un composant, sans équivalent DSFR ---
  // Rail de la Carto (#1088) : icône + libellé en colonne, ouvre un volet.
  'carto-rail__btn',
  // Rail du tiroir Diagnostic (#605) : poignée pleine largeur d'un tiroir fixé
  // en bas d'écran, qui porte le résumé du pipeline (titre, pastille, compte
  // de lignes, chevron) et `aria-expanded`. Un `fr-btn` est un bouton inline
  // coloré, un `fr-accordion__btn` exige la structure d'accordéon du DSFR et
  // son script ; aucune primitive ne couvre une poignée de tiroir. Cible :
  // `min-height: 2.25rem`, `:focus-visible` : contour 2 px intérieur.
  'app-diag__rail',
  // Onglets du tiroir Diagnostic : tablist dans un tiroir de hauteur bornée.
  // `fr-tabs` impose ses panneaux `fr-tabs__panel` et le calcul de hauteur de
  // son script, que le tiroir (corps défilant unique) ne peut pas accueillir.
  'app-diag__tab',
  // Panneau de l'assistant contextuel (#1011) : reprise du format des
  // assistants `proto-ecosysteme-sircom` / `proto-catalogue-donnees`
  // (docs/ux/actions.md §2.2), sur les tokens DSFR, cibles de 44 px
  // (WCAG 2.5.5), focus par la règle `:focus-visible` du cœur DSFR.
  'assistant-lanceur', // languette fixée au bord droit, texte vertical
  'assistant-onglet', // onglets Conversation / Diagnostic de l'en-tête
  'assistant-icone', // « Nouvelle conversation », « Réduire l'assistant »
  'assistant-suggestion', // suggestions de l'accueil, pleine largeur, multi-lignes
  'assistant-bouton', // « Continuer », « Me montrer » dans une bulle
  'assistant-envoi', // bouton rond d'envoi, dans le composeur
  'assistant-mode-bouton', // bascule « Dire » · « Guider », sous le composeur
];

// Widgets tiers et carrousel éditorial de l'accueil (hors périmètre de #542).
const EXCLUDED_ANCESTORS =
  '.leaflet-container, .CodeMirror, [class*="rete"], .chart-dots-nav, .chart-panel, .home-carousel';

interface Report {
  maison: string[];
  small: string[];
  total: number;
}

/**
 * Boutons visibles de `scope` : hors DSFR/primitives, et cibles < 24 px.
 * La visibilité se lit par `checkVisibility()` et non `offsetParent` : ce
 * dernier vaut `null` pour tout élément en `position: fixed`, et la languette
 * de l'assistant (#1011) échappait ainsi à la recette.
 */
async function auditButtons(page: Page, scope: string): Promise<Report> {
  return page.evaluate(
    ({ allowed, excluded, scope }) => {
      const inLibrary = (el: Element) => {
        for (let p: Element | null = el.parentElement; p; p = p.parentElement) {
          if (p.tagName.toLowerCase().startsWith('dsfr-data-')) return true;
        }
        return false;
      };
      const roots = Array.from(document.querySelectorAll(scope));
      const buttons = roots
        .flatMap((r) => Array.from(r.querySelectorAll<HTMLElement>('button')))
        .filter((b) => {
          if (b.closest(excluded) || inLibrary(b)) return false;
          const r = b.getBoundingClientRect();
          return b.checkVisibility({ visibilityProperty: true }) && r.width > 0 && r.height > 0;
        });
      const maison: string[] = [];
      const small: string[] = [];
      for (const b of buttons) {
        const cls = Array.from(b.classList);
        if (!cls.some((c) => allowed.includes(c))) {
          maison.push(`<button class="${b.className}" id="${b.id}">${b.textContent?.trim()}`);
        }
        const r = b.getBoundingClientRect();
        if (r.width < 24 || r.height < 24) {
          small.push(`${b.id || b.className} ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
      }
      return { maison, small, total: buttons.length };
    },
    { allowed: ALLOWED, excluded: EXCLUDED_ANCESTORS, scope }
  );
}

function expectClean(report: Report, where: string): void {
  expect(
    report.maison,
    `${where} — boutons hors DSFR/primitives :\n${report.maison.join('\n')}`
  ).toEqual([]);
  expect(report.small, `${where} — cibles < 24px :\n${report.small.join('\n')}`).toEqual([]);
}

/**
 * Focus visible de chaque bouton visible de `scope`. Une touche d'abord, pour
 * que le navigateur soit en modalité clavier : le focus posé ensuite par
 * script déclenche alors `:focus-visible`, comme une tabulation.
 */
async function auditFocus(page: Page, scope: string): Promise<string[]> {
  await page.keyboard.press('Shift');
  return page.evaluate(
    ({ excluded, scope }) => {
      const faults: string[] = [];
      const buttons = Array.from(document.querySelectorAll(scope))
        .flatMap((r) => Array.from(r.querySelectorAll<HTMLElement>('button')))
        .filter(
          (b) =>
            !b.closest(excluded) &&
            !b.hasAttribute('disabled') &&
            b.checkVisibility({ visibilityProperty: true }) &&
            b.getBoundingClientRect().width > 0
        );
      for (const b of buttons) {
        b.focus();
        if (document.activeElement !== b) continue;
        const cs = getComputedStyle(b);
        const visible =
          (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) ||
          cs.boxShadow !== 'none';
        if (!b.matches(':focus-visible') || !visible) faults.push(b.id || b.className);
      }
      return faults;
    },
    { excluded: EXCLUDED_ANCESTORS, scope }
  );
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForSelector('app-header .fr-header');
  await page.waitForTimeout(400);
}

test.describe('Boutons : DSFR ou primitives, cibles ≥ 24 px, focus visible (#542)', () => {
  test.beforeEach(async ({ page }) => {
    await disableProductTour(page);
  });

  for (const path of PAGES) {
    test(`${path}`, async ({ page }) => {
      await open(page, path);
      expectClean(await auditButtons(page, 'body'), path);

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

    test(`${path} — panneaux ouverts`, async ({ page }) => {
      await open(page, path);
      const lanceur = page.locator('app-assistant .assistant-lanceur');
      const rail = page.locator('app-diagnostic-panel .app-diag__rail');
      const hasAssistant = await lanceur.isVisible();
      const hasDrawer = await rail.isVisible();
      test.skip(!hasAssistant && !hasDrawer, 'ni assistant contextuel ni tiroir Diagnostic');

      if (hasAssistant) {
        expect(await auditFocus(page, 'app-assistant'), 'languette sans focus visible').toEqual([]);
        await lanceur.click();
        const panneau = page.locator('app-assistant .assistant-panneau');
        await expect(panneau).toBeVisible();
        expectClean(await auditButtons(page, 'app-assistant'), `${path} assistant`);
        expect(
          await auditFocus(page, 'app-assistant'),
          'assistant : boutons sans focus visible'
        ).toEqual([]);

        const ongletDiag = panneau.locator('.assistant-onglet', { hasText: 'Diagnostic' });
        if (await ongletDiag.isVisible()) {
          await ongletDiag.click();
          expectClean(await auditButtons(page, 'app-assistant'), `${path} assistant/Diagnostic`);
          expect(
            await auditFocus(page, 'app-assistant'),
            'onglet Diagnostic : boutons sans focus visible'
          ).toEqual([]);
        }
      }

      if (hasDrawer) {
        expect(await auditFocus(page, 'app-diagnostic-panel'), 'rail sans focus visible').toEqual(
          []
        );
        if ((await rail.getAttribute('aria-expanded')) !== 'true') await rail.click();
        await expect(page.locator('app-diagnostic-panel .app-diag__body')).toBeVisible();
        expectClean(await auditButtons(page, 'app-diagnostic-panel'), `${path} tiroir Diagnostic`);
        expect(
          await auditFocus(page, 'app-diagnostic-panel'),
          'tiroir Diagnostic : boutons sans focus visible'
        ).toEqual([]);
      }
    });
  }
});
