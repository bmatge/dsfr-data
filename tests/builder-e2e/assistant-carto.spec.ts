/**
 * Recette MANUELLE de l'assistant contextuel de la carto (#1005, #1016,
 * ADR-143). Hors CI : `builder-e2e.yml` nomme ses trois specs une par une
 * (#869), celui-ci n'en fait pas partie. Il demande le serveur de dev, que
 * Playwright démarre lui-même (ou réutilise).
 *
 *   npx playwright test --config tests/builder-e2e/playwright.config.ts assistant-carto.spec.ts
 *
 * Ce qu'il vérifie dans un vrai navigateur, que les tests happy-dom
 * (`tests/apps/builder-carto/{adaptateur,assistant}.test.ts`) ne voient pas :
 * la surbrillance VISIBLE (CSS réel, panneaux flottants), le focus, le clavier
 * du champ de saisie, et qu'aucune requête ne part vers un modèle.
 */
import { test, expect, type Page, type Request } from '@playwright/test';

const URL_CARTO = '/apps/builder-carto/';
const CLASSE_MONTRE = 'dsfr-data-repere--montre';

/** Chefs-lieux (extrait du jeu d'exemple de la carto). */
const POINTS = [
  { ville: 'Paris', lat: 48.8566, lon: 2.3522 },
  { ville: 'Lyon', lat: 45.764, lon: 4.8357 },
  { ville: 'Marseille', lat: 43.2965, lon: 5.3698 },
  { ville: 'Toulouse', lat: 43.6047, lon: 1.4442 },
  { ville: 'Rennes', lat: 48.1173, lon: -1.6778 },
];

/** État de carte posé avant le chargement : une couche de points sur des données locales. */
async function poserEtat(page: Page, champs: { lat: string; lon: string }): Promise<void> {
  const etat = {
    layers: [
      {
        id: 'layer-1',
        name: 'Chefs-lieux',
        type: 'marker',
        visible: true,
        source: { id: 'sample-layer-1', name: 'Chefs-lieux', type: 'manual', data: POINTS },
        latField: champs.lat,
        lonField: champs.lon,
        popupMode: 'tooltip',
        tooltipField: 'ville',
      },
    ],
    activeLayerId: 'layer-1',
  };
  await page.addInitScript((e) => {
    localStorage.setItem('dsfr-data-tours', JSON.stringify({ disabled: true, tours: {} }));
    localStorage.setItem('dsfr-data-builder-carto-state', JSON.stringify(e));
  }, etat);
}

async function ouvrirLaCarto(page: Page): Promise<void> {
  await page.goto(URL_CARTO, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#assistant-btn')).toBeAttached({ timeout: 20_000 });
  await expect(page.locator('app-assistant')).toBeAttached({ timeout: 20_000 });
  await expect(page.locator('#layers-list [data-layer-id="layer-1"]')).toBeVisible();
  // Pas d'attente de l'analyse des champs (`#source-scan-status`) : quand elle
  // re-rend les panneaux par innerHTML, `montrer()` rejoue la surbrillance sur
  // le nouvel élément.
}

const champAssistant = (page: Page) => page.locator('app-assistant textarea');

/**
 * Clique une action de la barre, où qu'elle soit : `app-action-bar` replie
 * les actions `tertiary` dans le menu « Plus d'actions » (ADR-101), comme dans
 * `layout-diagnostic-recette.spec.ts`.
 */
async function cliquerAction(page: Page, id: string): Promise<void> {
  const bouton = page.locator(`#${id}`);
  if (!(await bouton.isVisible())) {
    await page.getByRole('button', { name: "Plus d'actions" }).click();
    await expect(bouton).toBeVisible();
  }
  await bouton.click();
}

test.describe('assistant contextuel de la carto', () => {
  test('« afficher les POI dans une fiche » sans couche active : prérequis, puis « Comportement au clic », sans modèle', async ({
    page,
  }) => {
    await poserEtat(page, { lat: 'lat', lon: 'lon' });
    const posts: Request[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST') posts.push(r);
    });
    await ouvrirLaCarto(page);

    // Aucune couche active : l'état change sans rendu, l'adaptateur rattrape.
    await page.evaluate(() => {
      const w = window as Window & { __BUILDER_CARTO_STATE__?: { activeLayerId: string } };
      w.__BUILDER_CARTO_STATE__!.activeLayerId = 'aucune';
    });

    await cliquerAction(page, 'assistant-btn');
    await expect(champAssistant(page)).toBeFocused();
    await champAssistant(page).fill('afficher les POI dans une fiche');
    await champAssistant(page).press('Enter');

    // Le prérequis « couche-active » : la liste des couches est désignée.
    await expect(page.locator('#layers-list')).toHaveClass(new RegExp(CLASSE_MONTRE));
    await expect(page.locator('app-assistant')).toContainText('sélectionnez une couche');

    // L'usager sélectionne la couche, puis « Continuer ».
    await page.locator('#layers-list [data-layer-id="layer-1"]').click();
    await page.locator('app-assistant').getByRole('button', { name: 'Continuer' }).click();
    await expect(page.locator('#layer-popup-mode')).toHaveClass(new RegExp(CLASSE_MONTRE));
    await expect(page.locator('#layer-popup-mode')).toBeVisible();

    // Mode « Dire » par défaut : le focus n'a pas quitté le panneau.
    const focusDansLeCanevas = await page.evaluate(
      () => document.activeElement?.id === 'layer-popup-mode'
    );
    expect(focusDansLeCanevas).toBe(false);

    // Zéro appel à un modèle : aucune requête POST pendant tout le parcours.
    expect(posts.map((r) => r.url())).toEqual([]);
  });

  test('constat « lat/lon inversées » : pastille, puis « Me montrer » désigne la latitude', async ({
    page,
  }) => {
    // Latitude et longitude permutées : les points tombent loin de la France.
    await poserEtat(page, { lat: 'lon', lon: 'lat' });
    await ouvrirLaCarto(page);
    await page.locator('#btn-execute').click();

    const bouton = page.locator('#assistant-btn');
    await expect(bouton).toHaveAttribute('data-count', /\d+/, { timeout: 20_000 });
    await cliquerAction(page, 'assistant-btn');

    const constat = page
      .locator('app-assistant .assistant-constats li')
      .filter({ hasText: 'latitude et longitude semblent inversées' });
    await expect(constat).toBeVisible();
    await constat.getByRole('button', { name: 'Me montrer' }).click();
    await expect(page.locator('[data-repere="carto.couches.lat"]')).toHaveClass(
      new RegExp(CLASSE_MONTRE)
    );
  });

  test('volet Diagnostic : « Demander à l’assistant » ouvre le panneau sans quitter la carto', async ({
    page,
  }) => {
    await poserEtat(page, { lat: 'lat', lon: 'lon' });
    await ouvrirLaCarto(page);
    const adresse = page.url();

    await cliquerAction(page, 'diagnostic-btn');
    await page
      .locator('app-diagnostic-panel')
      .getByRole('button', { name: 'Demander à l’assistant' })
      .click();

    await expect(page.locator('app-assistant [role="dialog"]')).toBeVisible();
    expect(page.url()).toBe(adresse);
  });
});
