import { test, expect, type Page } from '@playwright/test';

/**
 * #1305 — pagination serveur : pendant le chargement d'une page, le sablier
 * ne remplace que les lignes.
 *
 * Mesuré dans un navigateur, ce que happy-dom ne sait pas : la HAUTEUR de
 * l'afficheur avant et pendant le chargement (aucun saut de mise en page),
 * le focus clavier réellement tenu par le bouton « Page suivante » (Entrée,
 * puis Entrée de nouveau), et l'adresse écrite par `url-sync`. Le faux
 * serveur retient chaque page demandée jusqu'à ce que le test la libère :
 * l'état « en chargement » est observé, pas deviné par un délai.
 */

const BUREAU = { width: 1280, height: 900 };
const TELEPHONE = { width: 375, height: 812 };

const COMMUNES = Array.from({ length: 13 }, (_, i) => ({
  nom: `Commune ${String(i + 1).padStart(2, '0')}`,
  population: 1000 * (i + 1),
}));

/** Le faux serveur : la page 1 part tout de suite, les suivantes attendent `liberer()`. */
async function serveur(page: Page) {
  const enAttente: Array<() => void> = [];
  await page.route('**/e2e/pagination-serveur/**', async (route) => {
    const url = new URL(route.request().url());
    const p = Number(url.searchParams.get('page') ?? 1);
    const taille = Number(url.searchParams.get('page_size') ?? 3);
    if (p > 1) await new Promise<void>((suite) => enAttente.push(suite));
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: COMMUNES.slice((p - 1) * taille, p * taille),
        meta: { page: p, page_size: taille, total: COMMUNES.length },
      }),
    });
  });
  return {
    async liberer() {
      await expect.poll(() => enAttente.length).toBeGreaterThan(0);
      enAttente.splice(0).forEach((suite) => suite());
    },
  };
}

/**
 * Les deux hauteurs de l'afficheur : ce qui précède la pagination (compte et
 * lignes — là où le sablier se pose), et la pagination elle-même. Mesurées à
 * part : à 375 px, la pagination des fiches passe de une à deux rangées en
 * page 2 (« 1 2 3 4 » au lieu de « 1 2 3 ») — c'est la page qui change, pas
 * le chargement, et la pagination pendant le chargement est déjà celle de la
 * page demandée.
 */
const hauteurs = (page: Page, id: string) =>
  page.evaluate((i) => {
    const hote = document.getElementById(i)!.getBoundingClientRect();
    const nav = document.querySelector(`#${i} .fr-pagination`)!.getBoundingClientRect();
    return { corps: nav.top - hote.top, pagination: nav.height };
  }, id);

const focusSurSuivante = (page: Page, id: string) =>
  page.evaluate(
    (i) => document.activeElement === document.querySelector(`#${i} .fr-pagination__link--next`),
    id
  );

for (const [nom, viewport] of [
  ['bureau 1280 px', BUREAU],
  ['téléphone 375 px', TELEPHONE],
] as const) {
  test.describe(`pagination serveur, page en chargement — ${nom}`, () => {
    for (const [id, ligne, tag, urlSync] of [
      ['liste', 'tbody tr td:first-child', 'dsfr-data-list', false],
      ['fiches', '.fiche', 'dsfr-data-display', true],
    ] as const) {
      test(`${tag}${urlSync ? ' (url-sync)' : ''} : sablier à la place des lignes, focus et hauteur gardés`, async ({
        page,
      }) => {
        const srv = await serveur(page);
        await page.setViewportSize(viewport);
        await page.goto('/e2e/pagination-serveur-chargement.html');
        const bloc = page.locator(`#${id}`);
        await expect(bloc.locator(ligne).first()).toContainText('Commune 01');
        const compte = bloc.locator('p[role="status"]').first();
        await expect(compte).toHaveText('13 résultats');

        const suivante = bloc.locator('.fr-pagination__link--next');
        await suivante.scrollIntoViewIfNeeded();
        const avant = await hauteurs(page, id);

        // Clavier seul : focus sur « Page suivante », Entrée
        await suivante.focus();
        await page.keyboard.press('Enter');

        const sablier = bloc.locator(`.${tag}__page-loading`);
        await expect(sablier).toBeVisible();
        await expect(sablier).toHaveText('Chargement de la page 2…');
        // Rien n'a bougé autour : la pagination ne descend pas d'un pixel
        // (compte et lignes gardent leur hauteur), le bouton garde le focus
        const pendant = await hauteurs(page, id);
        expect(pendant.corps).toBeCloseTo(avant.corps, 0);
        expect(await focusSurSuivante(page, id)).toBe(true);
        await expect(bloc.locator('.fr-pagination')).toBeVisible();
        await expect(bloc.locator('[aria-current="page"]')).toHaveText('2');
        await expect(compte).toHaveText('13 résultats');
        await expect(bloc.locator(`.${tag}__loading`)).toHaveCount(0);
        // Les lignes de la page 1 sont masquées, pas lisibles
        await expect(bloc.locator(ligne).first()).toBeHidden();
        // La région live de l'afficheur annonce la page demandée
        await expect(bloc.locator('.fr-sr-only[aria-live]')).toHaveText('Page 2 sur 5');
        if (urlSync) expect(new URL(page.url()).searchParams.get('p')).toBe('2');

        await srv.liberer();
        await expect(bloc.locator(ligne).first()).toContainText('Commune 04');
        await expect(sablier).toHaveCount(0);
        expect(await focusSurSuivante(page, id)).toBe(true);
        // La pagination du chargement était déjà celle de la page arrivée
        expect((await hauteurs(page, id)).pagination).toBeCloseTo(pendant.pagination, 0);

        // Entrée de nouveau : la page d'après, toujours sans perdre le focus
        await page.keyboard.press('Enter');
        await expect(sablier).toHaveText('Chargement de la page 3…');
        expect(await focusSurSuivante(page, id)).toBe(true);
        await srv.liberer();
        await expect(bloc.locator(ligne).first()).toContainText('Commune 07');
        expect(await focusSurSuivante(page, id)).toBe(true);
        if (urlSync) expect(new URL(page.url()).searchParams.get('p')).toBe('3');
      });
    }
  });
}
