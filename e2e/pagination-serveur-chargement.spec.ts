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
    // Les sources des boutons de bord (`/bords…`) sont servies tout de suite,
    // sur 7 lignes : trois pages, la dernière incomplète.
    const bords = url.pathname.includes('/bords');
    const lignes = bords ? COMMUNES.slice(0, 7) : COMMUNES;
    if (p > 1 && !bords) await new Promise<void>((suite) => enAttente.push(suite));
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: lignes.slice((p - 1) * taille, p * taille),
        meta: { page: p, page_size: taille, total: lignes.length },
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

/**
 * Boutons de BORD (première, précédente, suivante, dernière) : à la première
 * et à la dernière page, ils restent focalisables, portent
 * `aria-disabled="true"`, prennent l'apparence inactive du DSFR et ignorent
 * clic et Entrée. Avant : `disabled` — arrivé sur la dernière page par
 * « Page suivante », le bouton se désactivait sous le focus, et le focus
 * clavier retombait sur le corps de la page.
 *
 * Mesuré en navigateur : le focus réel (`document.activeElement`), et la
 * couleur calculée par la feuille DSFR, que happy-dom n'applique pas.
 */
const focusSur = (page: Page, id: string, classe: string) =>
  page.evaluate(([i, c]) => document.activeElement === document.querySelector(`#${i} .${c}`), [
    id,
    classe,
  ] as const);

const couleur = (page: Page, id: string, classe: string) =>
  page.evaluate(([i, c]) => getComputedStyle(document.querySelector(`#${i} .${c}`)!).color, [
    id,
    classe,
  ] as const);

for (const [nom, viewport] of [
  ['bureau 1280 px', BUREAU],
  ['téléphone 375 px', TELEPHONE],
] as const) {
  test.describe(`pagination, boutons de bord — ${nom}`, () => {
    for (const [id, ligne, tag, mode] of [
      ['liste-client', 'tbody tr td:first-child', 'dsfr-data-list', 'cliente'],
      ['fiches-client', '.fiche', 'dsfr-data-display', 'cliente'],
      ['liste-serveur', 'tbody tr td:first-child', 'dsfr-data-list', 'serveur'],
      ['fiches-serveur', '.fiche', 'dsfr-data-display', 'serveur'],
    ] as const) {
      test(`${tag}, pagination ${mode} : Entrée jusqu'au bord, le focus reste sur le bouton`, async ({
        page,
      }) => {
        await serveur(page);
        await page.setViewportSize(viewport);
        await page.goto('/e2e/pagination-serveur-chargement.html');
        const bloc = page.locator(`#${id}`);
        await expect(bloc.locator(ligne).first()).toContainText('Commune 01');

        const premiere = bloc.locator('.fr-pagination__link--first');
        const precedente = bloc.locator('.fr-pagination__link--prev');
        const suivante = bloc.locator('.fr-pagination__link--next');
        const derniere = bloc.locator('.fr-pagination__link--last');
        const actif = await couleur(page, id, 'fr-pagination__link--next');

        // Page 1 : les boutons de début sont inactifs, mais là — jamais `disabled`
        for (const bouton of [premiere, precedente]) {
          await expect(bouton).toHaveAttribute('aria-disabled', 'true');
          await expect(bouton).not.toHaveAttribute('disabled', /.*/);
        }
        const inactif = await couleur(page, id, 'fr-pagination__link--prev');
        expect(inactif).not.toBe(actif);

        // Clavier seul : Entrée répétée sur « Page suivante » jusqu'à la dernière page
        await suivante.scrollIntoViewIfNeeded();
        await suivante.focus();
        await page.keyboard.press('Enter');
        await expect(bloc.locator(ligne).first()).toContainText('Commune 04');
        expect(await focusSur(page, id, 'fr-pagination__link--next')).toBe(true);
        await page.keyboard.press('Enter');
        await expect(bloc.locator(ligne).first()).toContainText('Commune 07');
        await expect(bloc.locator('[aria-current="page"]')).toHaveText('3');

        // Dernière page : le bouton n'a pas lâché le focus, il se dit inactif
        expect(await focusSur(page, id, 'fr-pagination__link--next')).toBe(true);
        for (const bouton of [suivante, derniere]) {
          await expect(bouton).toHaveAttribute('aria-disabled', 'true');
          await expect(bouton).not.toHaveAttribute('disabled', /.*/);
        }
        expect(await couleur(page, id, 'fr-pagination__link--next')).toBe(inactif);
        for (const bouton of [premiere, precedente]) {
          await expect(bouton).not.toHaveAttribute('aria-disabled', /.*/);
        }

        // Entrée et clic de plus ignorés : on reste sur la page 3, focus compris
        // (`force` : Playwright tient un `aria-disabled` pour non cliquable et
        // attendrait ; c'est justement le clic d'un usager qu'on veut voir ignoré.)
        await page.keyboard.press('Enter');
        await derniere.click({ force: true });
        await expect(bloc.locator('[aria-current="page"]')).toHaveText('3');
        await expect(bloc.locator(ligne).first()).toContainText('Commune 07');
        await suivante.focus();
        expect(await focusSur(page, id, 'fr-pagination__link--next')).toBe(true);

        // Retour par « Page précédente » jusqu'à la première page
        await precedente.focus();
        await page.keyboard.press('Enter');
        await expect(bloc.locator(ligne).first()).toContainText('Commune 04');
        await page.keyboard.press('Enter');
        await expect(bloc.locator(ligne).first()).toContainText('Commune 01');
        expect(await focusSur(page, id, 'fr-pagination__link--prev')).toBe(true);
        await expect(precedente).toHaveAttribute('aria-disabled', 'true');
        await page.keyboard.press('Enter');
        await expect(bloc.locator('[aria-current="page"]')).toHaveText('1');
        expect(await focusSur(page, id, 'fr-pagination__link--prev')).toBe(true);
      });
    }
  });
}
