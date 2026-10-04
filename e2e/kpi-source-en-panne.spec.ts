import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #1222 — une tuile de KPI dont la source est en panne, dans un vrai navigateur.
 *
 * Les tests unitaires (`tests/kpi-source-indisponible.test.ts`) portent le
 * balisage par cause. Ce spec porte ce qu'ils ne voient pas :
 *
 * - la HAUTEUR : la forme compacte existe pour qu'une tuile en panne garde
 *   celle de ses voisines. happy-dom ne calcule aucune boîte ; ici on mesure,
 *   en largeur bureau et à 375 px ;
 * - le RÉSEAU : une source qui répond 503, 404, puis un réseau réellement
 *   coupé (`navigator.onLine` faux, et la relance au retour de la connexion) ;
 * - le bandeau à côté des tuiles : une seule région d'annonce, un seul bouton.
 *
 * Déterministe : les deux jeux sont des fichiers du dépôt, la panne est posée
 * par `page.route`. Seule la feuille DSFR vient du CDN, comme pour
 * `layout-grid.spec.ts`.
 *
 * Captures : `KPI_1222_CAPTURES=<dossier>` enregistre les tuiles de chaque cas
 * (hors dépôt, jamais en CI).
 */

const BUREAU = { width: 1280, height: 800 };
const TELEPHONE = { width: 375, height: 800 };
const LARGEURS = [
  ['bureau', BUREAU],
  ['375px', TELEPHONE],
] as const;

const AIDES = '**/e2e/kpi-source-en-panne-aides.json';
const CAPTURES = process.env.KPI_1222_CAPTURES;

/** Fait répondre la source « aides » par un code d'erreur. */
async function panne(page: Page, status: number): Promise<void> {
  await page.route(AIDES, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: '{"error":"panne"}' })
  );
}

async function ouvrir(
  page: Page,
  viewport: { width: number; height: number },
  requete = ''
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto(`/e2e/kpi-source-en-panne.html${requete}`);
  // La feuille DSFR est chargée : sans elle, les hauteurs mesurées ne valent rien.
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).fontFamily))
    .toContain('Marianne');
  await expect(page.locator('#k-entreprises .dsfr-data-kpi__value')).toHaveText('7');
}

/** Hauteur de la carte d'une tuile, en pixels entiers. */
const hauteur = (page: Page, id: string): Promise<number> =>
  page
    .locator(`#${id} .dsfr-data-kpi`)
    .evaluate((el) => Math.round(el.getBoundingClientRect().height));

/**
 * Hauteur d'une tuile NORMALE à cette largeur : la page sans aucune panne.
 * Les tuiles d'une même rangée s'étirent à la hauteur de la plus haute : la
 * voisine d'une tuile en panne grandirait avec elle, et ne prouverait rien.
 */
async function hauteurNormale(
  page: Page,
  viewport: { width: number; height: number }
): Promise<number> {
  await ouvrir(page, viewport);
  await expect(page.locator('#k-beneficiaires .dsfr-data-kpi__value')).toHaveText(/1\s234/);
  return hauteur(page, 'k-beneficiaires');
}

async function capturer(page: Page, nom: string): Promise<void> {
  if (!CAPTURES) return;
  mkdirSync(CAPTURES, { recursive: true });
  await page.locator('#page').screenshot({ path: join(CAPTURES, `${nom}.png`) });
}

/** Une tuile en panne ne montre aucun chiffre hors de son détail technique. */
async function sansChiffre(page: Page, id: string): Promise<void> {
  await expect(page.locator(`#${id} .dsfr-data-kpi__value`)).toHaveText('—');
  const lu = await page.locator(`#${id}`).evaluate((el) => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('style, details').forEach((n) => n.remove());
    const carte = el.querySelector('.dsfr-data-kpi');
    return `${clone.textContent ?? ''} ${carte?.getAttribute('aria-label') ?? ''}`;
  });
  expect(lu).not.toMatch(/\d/);
}

for (const [nom, viewport] of LARGEURS) {
  test.describe(`tuile en panne — ${nom}`, () => {
    test('503 sans bandeau : tiret, libellé, phrase, « Réessayer » — à la hauteur d’une tuile normale', async ({
      page,
    }) => {
      const normale = await hauteurNormale(page, viewport);
      await panne(page, 503);
      await ouvrir(page, viewport);

      for (const [id, libelle] of [
        ['k-beneficiaires', 'Bénéficiaires'],
        ['k-montant', 'Montant investi'],
      ]) {
        const tuile = page.locator(`#${id}`);
        await sansChiffre(page, id);
        await expect(tuile.locator('.dsfr-data-kpi__value')).toHaveAttribute('aria-hidden', 'true');
        await expect(tuile.locator('.dsfr-data-kpi__label')).toHaveText(libelle);
        await expect(tuile.locator('.dsfr-data-status__title')).toHaveText(
          'Chiffre momentanément indisponible'
        );
        await expect(tuile.locator('[role="status"]')).toHaveCount(1);
        await expect(tuile.locator('details')).not.toHaveAttribute('open', /.*/);
      }
      // La tuile de l'autre source n'est pas touchée.
      await expect(page.locator('#k-entreprises [role="status"]')).toHaveCount(0);

      // La forme compacte tient dans la hauteur d'une tuile normale.
      expect(normale).toBe(140);
      for (const id of ['k-beneficiaires', 'k-montant']) {
        expect(await hauteur(page, id), `hauteur de #${id}`).toBeLessThanOrEqual(normale + 1);
      }

      // « Réessayer » : un vrai bouton, 44 px, atteignable au clavier, focus visible.
      const bouton = page.locator('#k-beneficiaires button.dsfr-data-status__retry');
      await expect(bouton).toHaveText('Réessayer');
      const boite = await bouton.boundingBox();
      expect(boite!.height).toBeGreaterThanOrEqual(44);
      await page.keyboard.press('Tab');
      await expect(bouton).toBeFocused();
      const contour = await bouton.evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(contour).not.toBe('none');

      await capturer(page, `503-sans-bandeau-${nom}`);

      // Le détail technique se déplie sur demande, et dit le code.
      await page.locator('#k-beneficiaires summary').click();
      await expect(page.locator('#k-beneficiaires details')).toContainText('Code HTTP : 503');
      await capturer(page, `503-sans-bandeau-details-ouverts-${nom}`);
      await page.locator('#k-beneficiaires summary').click();

      // Le service revient : « Réessayer » rend les chiffres aux DEUX tuiles de la source.
      await page.unroute(AIDES);
      await bouton.click();
      await expect(page.locator('#k-beneficiaires .dsfr-data-kpi__value')).toHaveText(/1\s234/);
      await expect(page.locator('#k-montant .dsfr-data-kpi__value')).toContainText('54');
      await expect(page.locator('.dsfr-data-status--source-error')).toHaveCount(0);
    });

    test('503 avec bandeau : la tuile n’a ni bouton, ni détail ; le bandeau porte le seul « Réessayer »', async ({
      page,
    }) => {
      const normale = await hauteurNormale(page, viewport);
      await panne(page, 503);
      await ouvrir(page, viewport, '?bandeau=1');

      await expect(page.locator('#bandeau .fr-alert')).toHaveCount(1);
      for (const id of ['k-beneficiaires', 'k-montant']) {
        const tuile = page.locator(`#${id}`);
        await sansChiffre(page, id);
        await expect(tuile.locator('.dsfr-data-status__title')).toHaveText(
          'Chiffre momentanément indisponible'
        );
        await expect(tuile.locator('button')).toHaveCount(0);
        await expect(tuile.locator('details')).toHaveCount(0);
        await expect(tuile.locator('[role="status"]')).toHaveCount(0);
      }
      // Une seule région d'annonce, un seul bouton : le bandeau.
      await expect(page.locator('[role="status"]')).toHaveCount(1);
      await expect(page.locator('button.dsfr-data-status__retry')).toHaveCount(0);
      await expect(page.locator('button.dsfr-data-source-status__retry')).toHaveCount(1);

      for (const id of ['k-beneficiaires', 'k-montant']) {
        expect(await hauteur(page, id), `hauteur de #${id}`).toBeLessThanOrEqual(normale + 1);
      }
      await capturer(page, `503-avec-bandeau-${nom}`);

      await page.unroute(AIDES);
      await page.locator('button.dsfr-data-source-status__retry').click();
      await expect(page.locator('#k-beneficiaires .dsfr-data-kpi__value')).toHaveText(/1\s234/);
      await expect(page.locator('#bandeau .fr-alert')).toHaveCount(0);
    });

    test('404 : pas de « Réessayer » ; le lien de source-page dans la tuile, ou dans le bandeau seul', async ({
      page,
    }) => {
      const normale = await hauteurNormale(page, viewport);
      await panne(page, 404);
      await ouvrir(page, viewport, '?page=1');

      const tuile = page.locator('#k-beneficiaires');
      await sansChiffre(page, 'k-beneficiaires');
      await expect(tuile.locator('.dsfr-data-status__title')).toHaveText(
        'Ce chiffre n’est plus publié à cette adresse'
      );
      await expect(tuile.locator('button')).toHaveCount(0);
      const lien = tuile.locator('a.dsfr-data-status__source-page');
      await expect(lien).toHaveText('Consulter la page de ces données');
      await expect(lien).toHaveAttribute('href', '/e2e/kpi-source-en-panne-page.html');
      await expect(lien).toHaveAttribute('rel', 'noopener');
      await capturer(page, `404-lien-sans-bandeau-${nom}`);

      // Sans source-page : aucun lien, nulle part.
      await ouvrir(page, viewport);
      await sansChiffre(page, 'k-beneficiaires');
      await expect(page.locator('a.dsfr-data-status__source-page')).toHaveCount(0);
      await capturer(page, `404-sans-lien-${nom}`);

      // Avec le bandeau : le lien une seule fois, dans le bandeau.
      await ouvrir(page, viewport, '?page=1&bandeau=1');
      await sansChiffre(page, 'k-beneficiaires');
      await expect(page.locator('a.dsfr-data-status__source-page')).toHaveCount(1);
      await expect(page.locator('#bandeau a.dsfr-data-status__source-page')).toHaveAttribute(
        'href',
        '/e2e/kpi-source-en-panne-page.html'
      );
      await expect(page.locator('#bandeau button')).toHaveCount(0);
      expect(await hauteur(page, 'k-beneficiaires')).toBeLessThanOrEqual(normale + 1);
      await capturer(page, `404-lien-avec-bandeau-${nom}`);
    });

    test('hors ligne après un premier chargement : l’ancien chiffre disparaît, puis revient avec le réseau', async ({
      page,
      context,
    }) => {
      const normale = await hauteurNormale(page, viewport);

      await context.setOffline(true);
      await page.evaluate(() =>
        (document.getElementById('aides') as HTMLElement & { reload(): void }).reload()
      );

      for (const id of ['k-beneficiaires', 'k-montant']) {
        await expect(page.locator(`#${id} .dsfr-data-status__title`)).toHaveText(
          'Vous semblez hors connexion'
        );
        await sansChiffre(page, id);
        await expect(page.locator(`#${id} button.dsfr-data-status__retry`)).toHaveCount(1);
      }
      await expect(page.locator('#k-beneficiaires [data-cause]')).toHaveAttribute(
        'data-cause',
        'hors-connexion'
      );
      // La tuile de l'autre source garde le chiffre qu'elle a reçu.
      await expect(page.locator('#k-entreprises .dsfr-data-kpi__value')).toHaveText('7');
      expect(await hauteur(page, 'k-beneficiaires')).toBeLessThanOrEqual(normale + 1);
      await capturer(page, `hors-ligne-${nom}`);

      // Le réseau revient : la source se relance d'elle-même.
      await context.setOffline(false);
      await expect(page.locator('#k-beneficiaires .dsfr-data-kpi__value')).toHaveText(/1\s234/);
      await expect(page.locator('.dsfr-data-status--source-error')).toHaveCount(0);
    });
  });
}

test('error-message de la source remplace la phrase de la tuile', async ({ page }) => {
  await panne(page, 503);
  await ouvrir(page, BUREAU, `?message=${encodeURIComponent('Chiffres en cours de mise à jour')}`);
  await expect(page.locator('#k-beneficiaires .dsfr-data-status__title')).toHaveText(
    'Chiffres en cours de mise à jour'
  );
  await sansChiffre(page, 'k-beneficiaires');
  await capturer(page, 'error-message-bureau');
});
