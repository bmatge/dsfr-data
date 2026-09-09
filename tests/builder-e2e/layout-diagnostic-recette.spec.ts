/**
 * Recette de cloture de l'epic #614 — volets gauche/droite et volet Diagnostic.
 *
 * Les lots (#611 editeur du Playground, #612 empilement de la Carto, #613
 * modes de hauteur) sont chacun garde par des tests unitaires. Ce qu'aucun ne
 * peut affirmer, c'est le critere de fin de l'epic, qui porte sur le RENDU :
 *
 *   - la zone de travail exploite la hauteur disponible ;
 *   - le scroll est soit page, soit interne, jamais les deux en concurrence ;
 *   - le volet Diagnostic est visible et utilisable dans TOUTES les apps ou
 *     il est monte, Carto comprise.
 *
 * L'empilement en est l'exemple : `.carto-panels` est passe de `z-index: 1000`
 * a `600`, un test statique le verifie — mais seul un navigateur dit si le
 * tiroir recoit vraiment le clic. C'est la question que #612 posait.
 *
 * Requiert `npm run dev` actif :
 *   npx playwright test --config tests/builder-e2e/playwright.config.ts \
 *     layout-diagnostic-recette
 */

import { test, expect, type Page } from '@playwright/test';

interface AppSousTest {
  nom: string;
  url: string;
  /** Mode declare a `app-layout-builder`, ou `null` pour un layout maison. */
  mode: 'page-scroll' | 'fullscreen' | 'sticky-left' | null;
  /**
   * Mobilier ancre en bas et HORS FLUX (`position: fixed/absolute`), qui doit
   * donc reserver le rail par lui-meme. Seule la Carto en a.
   */
  mobilierFlottant?: string;
}

const APPS: AppSousTest[] = [
  { nom: 'Builder', url: '/apps/builder/', mode: 'fullscreen' },
  { nom: 'Assistant IA', url: '/apps/builder-ia/', mode: 'fullscreen' },
  { nom: 'Playground', url: '/apps/playground/', mode: 'sticky-left' },
  { nom: 'Studio', url: '/apps/studio/', mode: 'page-scroll' },
  // La Carto assume un layout maison (canevas plein ecran + panneaux
  // flottants) : l'epic la sort de l'harmonisation, mais pas du critere sur
  // le volet.
  { nom: 'Carto', url: '/apps/builder-carto/', mode: null, mobilierFlottant: '.carto-status' },
];

const BASE = 'http://localhost:5173';

/**
 * Clique l'entree Diagnostic, ou qu'elle soit.
 *
 * `app-action-bar` replie les actions de rang `tertiary` dans le menu « Plus
 * d'actions » (ADR-101) : le bouton existe toujours dans le DOM, mais dans une
 * liste `hidden` tant que le menu n'est pas ouvert. Le tester sans ouvrir le
 * menu ne prouverait rien sur ce que l'utilisateur peut atteindre.
 */
async function basculerLeVolet(page: Page): Promise<void> {
  const bouton = page.locator('#diagnostic-btn');
  if (!(await bouton.isVisible())) {
    await page.getByRole('button', { name: "Plus d'actions" }).click();
    await expect(bouton).toBeVisible();
  }
  await bouton.click();
}

/** Le corps du tiroir — `hidden` tant qu'il est replie. */
const corpsDuVolet = (page: Page) => page.locator('app-diagnostic-panel .app-diag__body');

/** Ouvre le volet et attend qu'il ait fini de se poser. */
async function ouvrirLeVolet(page: Page): Promise<void> {
  await basculerLeVolet(page);
  await expect(corpsDuVolet(page)).toBeVisible();
  // Laisse la transition de hauteur s'achever avant toute mesure.
  await page.waitForTimeout(400);
}

for (const app of APPS) {
  test.describe(app.nom, () => {
    test.beforeEach(async ({ page }) => {
      // Le tour d'accueil se lance au premier passage et pose un voile qui
      // intercepte tous les clics. On mesure l'app telle que la voit un
      // utilisateur qui revient, pas son onboarding.
      await page.addInitScript(() => {
        localStorage.setItem('dsfr-data-tours', JSON.stringify({ disabled: true, tours: {} }));
      });
      await page.goto(BASE + app.url, { waitUntil: 'domcontentloaded' });
      // La barre d'actions doit avoir adopte le bouton avant toute mesure.
      await expect(page.locator('#diagnostic-btn')).toBeAttached({ timeout: 20_000 });
      await expect(page.locator('app-action-bar')).toBeVisible({ timeout: 20_000 });
    });

    test('la page ne defile jamais horizontalement', async ({ page }) => {
      // Un debordement lateral est le symptome classique d'une colonne qui ne
      // sait pas se contraindre.
      const deborde = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );

      expect(deborde, 'la page deborde en largeur').toBe(false);
    });

    if (app.mode) {
      test(`declare mode="${app.mode}" sur le layout partage`, async ({ page }) => {
        // Le mode vit dans le composant : plus aucune app ne style ses
        // classes internes (#613).
        await expect(page.locator('app-layout-builder')).toHaveAttribute('mode', app.mode!);
      });
    }

    if (app.mode === 'fullscreen') {
      test('la zone de travail occupe la hauteur, sans scroll de page', async ({ page }) => {
        const { scrollPage, hauteurTravail, hauteurVue } = await page.evaluate(() => {
          const doc = document.documentElement;
          const zone = document.querySelector('.builder-layout-container');
          return {
            scrollPage: doc.scrollHeight - doc.clientHeight,
            hauteurTravail: zone ? zone.getBoundingClientRect().height : 0,
            hauteurVue: window.innerHeight,
          };
        });

        // Plein ecran : le scroll est INTERNE, la page ne bouge pas.
        expect(scrollPage, 'la page defile alors que le mode est plein ecran').toBeLessThan(4);
        // Et la zone de travail occupe l'essentiel de la fenetre.
        expect(hauteurTravail / hauteurVue, 'zone de travail trop courte').toBeGreaterThan(0.5);
      });
    }

    test('le volet Diagnostic s’ouvre et recoit le clic', async ({ page }) => {
      await ouvrirLeVolet(page);
      const volet = page.locator('app-diagnostic-panel');
      await expect(volet).toBeVisible();
      await expect(page.locator('#diagnostic-btn')).toHaveAttribute('aria-expanded', 'true');

      // LE point de #612 : au-dela de la visibilite, l'element qui occupe
      // reellement chaque pixel doit etre le tiroir. Sur la Carto, les
      // panneaux flottants le recouvraient tout en le laissant « visible ».
      //
      // BALAYAGE sur toute la largeur, et non un seul point au centre : le
      // recouvrement etait LATERAL (`.carto-panels` tient la bande gauche,
      // `left: 16px; width: 344px`). Une sonde centrale passait a cote du
      // defaut et rendait ce test decoratif — verifie en le reintroduisant.
      const boite = (await volet.boundingBox())!;
      const intrus = await page.evaluate(
        ([x0, largeur, y]) => {
          const trouves: string[] = [];
          for (let i = 0; i <= 12; i++) {
            const x = x0 + (largeur * i) / 12;
            const cible = document.elementFromPoint(Math.min(x, x0 + largeur - 1), y);
            if (!cible?.closest('app-diagnostic-panel')) {
              trouves.push(
                `x=${Math.round(x)} → ${cible?.tagName.toLowerCase()}.${cible?.className}`
              );
            }
          }
          return trouves;
        },
        [boite.x, boite.width, boite.y + 12] as [number, number, number]
      );

      expect(intrus, 'un autre element recouvre le volet').toEqual([]);
    });

    test('la fin du document s’arrete au rail, reserve UNE seule fois', async ({ page }) => {
      // `app-diagnostic-panel` pose
      // `body:has(app-diagnostic-panel){padding-bottom:var(--app-diagnostic-h)}` :
      // le flux s'arrete pile au sommet du rail replie. Rien ne doit passer
      // dessous, et rien ne doit s'arreter une hauteur de rail trop tot — la
      // Carto reservait la place DEUX fois (#612).
      //
      // Mesure volet FERME (ouvert, le tiroir se superpose au contenu, c'est
      // voulu) et EN BAS DE PAGE (les modes `page-scroll` et `sticky-left`
      // laissent volontairement le document depasser la fenetre).
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(200);
      const { basContenu, hautRail } = await page.evaluate(() => {
        const corps = document.body;
        const reserve = parseFloat(getComputedStyle(corps).paddingBottom) || 0;
        return {
          basContenu: corps.getBoundingClientRect().bottom - reserve,
          hautRail: document.querySelector('app-diagnostic-panel')!.getBoundingClientRect().top,
        };
      });

      expect(Math.abs(basContenu - hautRail), 'le flux ne borde pas le rail').toBeLessThan(8);
    });

    if (app.mobilierFlottant) {
      test('le mobilier flottant se pose sur le rail, pas 40 px plus haut', async ({ page }) => {
        // Hors flux, le `padding-bottom` du corps ne le concerne pas : il
        // reserve le rail lui-meme. La Carto ajoutait `--app-diagnostic-h` a
        // son `bottom` alors que le corps l'avait deja fait — 52 px mesures
        // la ou 16 etaient prevus, et une pastille de statut en apesanteur.
        const { basMobilier, hautRail } = await page.evaluate((selecteur) => {
          const mobilier = document.querySelector(selecteur)!;
          return {
            basMobilier: mobilier.getBoundingClientRect().bottom,
            hautRail: document.querySelector('app-diagnostic-panel')!.getBoundingClientRect().top,
          };
        }, app.mobilierFlottant!);

        expect(basMobilier, 'le mobilier passe sous le rail').toBeLessThanOrEqual(hautRail);
        expect(hautRail - basMobilier, 'le rail est reserve deux fois').toBeLessThan(40);
      });
    }

    test('le volet se referme', async ({ page }) => {
      await ouvrirLeVolet(page);
      await basculerLeVolet(page);

      await expect(corpsDuVolet(page)).toBeHidden();
      await expect(page.locator('#diagnostic-btn')).toHaveAttribute('aria-expanded', 'false');
    });
  });
}
