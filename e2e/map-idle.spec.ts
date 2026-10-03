import { test, expect, type Page } from '@playwright/test';

/**
 * BUG-039 (banc d'essai open-data-viz, #1229) — une couche de carte gardait les
 * marqueurs du dernier filtre quand son amont en `require-where` repassait en
 * attente, et `dsfr-data-map` n'avait pas d'`idle-message`.
 *
 * Ce que seul un vrai navigateur prouve : la carte Leaflet ne s'initialise
 * qu'à la visibilité, et ce sont ses formes TRACÉES (SVG, marqueurs) qu'on
 * compte — pas l'état interne de la couche, que portent les tests unitaires
 * (`tests/map-layer-idle.test.ts`).
 *
 * Parcours des deux blocs de la fixture : attente au chargement, filtre posé,
 * filtre retiré. Critères du constat : après le retrait, la couche compte
 * 0 forme, et la carte affiche un message d'attente configurable.
 */

const POINTS = [
  { nom: 'Lille', zone: 'Nord', lat: 50.63, lon: 3.06 },
  { nom: 'Rouen', zone: 'Nord', lat: 49.44, lon: 1.1 },
  { nom: 'Lyon', zone: 'Sud', lat: 45.76, lon: 4.84 },
];

/** Amène la carte à l'écran (elle s'initialise à la visibilité) et attend Leaflet. */
async function montrer(page: Page, id: string) {
  await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  await expect(page.locator(`#${id} .leaflet-container`)).toBeVisible({ timeout: 10_000 });
}

test.beforeEach(async ({ page }) => {
  // La source Opendatasoft de la fixture : sa réponse est servie ici, filtrée
  // sur la clause reçue. Aucune requête ne sort de la page.
  await page.route('https://exemple.invalid/**', async (route) => {
    const where = new URL(route.request().url()).searchParams.get('where') ?? '';
    const zone = /zone\s*=\s*"([^"]+)"/.exec(where)?.[1];
    const results = zone ? POINTS.filter((p) => p.zone === zone) : POINTS;
    await route.fulfill({ json: { total_count: results.length, results } });
  });
});

test('query en require-where : filtre posé puis retiré, la couche se vide et la carte le dit', async ({
  page,
}) => {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto('/e2e/map-idle.html');
  await montrer(page, 'q-carte');

  const cercles = page.locator('#q-carte path.idle-cercle');
  const message = page.locator('#q-carte .dsfr-data-map__idle');
  const legende = page.locator('#q-legende .dsfr-data-map-legend');

  // Au chargement : aucune requête n'a de filtre, la carte attend.
  await expect(message).toHaveText('Choisissez un filtre pour afficher les données');
  await expect(cercles).toHaveCount(0);

  // Filtre posé : deux points au Nord, plus de message, une légende.
  await page.evaluate(() =>
    document.getElementById('q-filtre')!.setAttribute('where', 'zone:eq:Nord')
  );
  await expect(cercles).toHaveCount(2);
  await expect(message).toHaveCount(0);
  await expect(legende).toBeVisible();
  await expect(page.locator('#q-liste')).toContainText('Lille');

  // Filtre retiré : le reste de la page repasse en attente — la carte aussi.
  await page.evaluate(() => document.getElementById('q-filtre')!.removeAttribute('where'));
  await expect(page.locator('#q-liste')).toContainText('Choisissez un filtre');
  await expect(cercles).toHaveCount(0);
  await expect(message).toBeVisible();
  await expect(legende).toBeHidden();
  // La description lue par les lecteurs d'écran ne garde pas « 2 cercles ».
  const description = page.locator('#q-carte-desc');
  await expect(description).toContainText('Choisissez un filtre');
  await expect(description).not.toContainText('cercles');

  expect(erreurs).toEqual([]);
});

test('source en require-where : même parcours par commande, message de idle-message', async ({
  page,
}) => {
  await page.goto('/e2e/map-idle.html');
  await montrer(page, 's-carte');

  const marqueurs = page.locator('#s-carte .dsfr-data-map__marker');
  const message = page.locator('#s-carte .dsfr-data-map__idle');
  const commander = (where: string) =>
    page.evaluate((clause) => {
      document.dispatchEvent(
        new CustomEvent('dsfr-data-source-command', {
          detail: { sourceId: 's-points', where: clause, whereKey: 'spec-zone' },
        })
      );
    }, where);

  await expect(message).toHaveText('Choisissez une zone pour afficher ses points');
  await expect(marqueurs).toHaveCount(0);

  await commander('zone = "Nord"');
  await expect(marqueurs).toHaveCount(2);
  await expect(message).toHaveCount(0);

  await commander('');
  await expect(marqueurs).toHaveCount(0);
  await expect(message).toBeVisible();
});
