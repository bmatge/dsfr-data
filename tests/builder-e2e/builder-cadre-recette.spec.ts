/**
 * Recette du cadre officiel DSFR dans le Builder « Créer un graphique » (#1263).
 *
 * `tests/apps/builder/cadre-1263.test.ts` vérifie la FORME du code généré. Ce
 * qu'il ne peut pas dire : qu'un réglage posé dans la section « Cadre officiel
 * DSFR » change vraiment ce que l'aperçu AFFICHE, sur le vrai DSFR Chart.
 * Chaque cas rouvre un état déposé (le chemin d'un favori), pose les réglages
 * PAR L'INTERFACE, clique « Générer », puis lit le cadre dans l'aperçu : date
 * au pied, bouton et contenu de l'infobulle, fenêtre d'information ouverte par
 * son bouton, entrées du menu « Plus d'actions ».
 *
 * C'est aussi ce qui garde trois faits MESURÉS (DSFR Chart 2.1.1, 2026-10-12)
 * sur lesquels le Builder s'appuie :
 * - le menu « Plus d'actions », l'infobulle et la fenêtre ne s'ouvrent qu'avec
 *   le JavaScript du DSFR, que le code généré charge désormais quand le cadre
 *   est actif (sans lui, « Télécharger en CSV » restait hors d'atteinte) ;
 * - le contenu de la fenêtre est injecté comme du HTML par DSFR Chart : le
 *   Builder l'échappe, une balise saisie s'affiche et ne s'exécute pas ;
 * - le bouton « plein écran » n'existe qu'avec un titre de fenêtre.
 *
 * RECETTE MANUELLE, HORS CI : l'aperçu du Builder charge DSFR et DSFR Chart
 * depuis leur CDN, donc le réseau. `builder-e2e.yml` nomme ses specs une par
 * une et ne lance pas celui-ci.
 *
 *   npm run build:shared && npm run build:app-ui && npm run build
 *   npx playwright test --config tests/builder-e2e/playwright.config.ts \
 *     builder-cadre-recette
 */

import { test, expect, type FrameLocator, type Page } from '@playwright/test';

type Ligne = Record<string, string | number>;

const REGIONS: Ligne[] = [
  { region: 'Bretagne', taux: 10, maj: '2024-03-01' },
  { region: 'Bretagne', taux: 4, maj: '2025-06-15T10:00:00' },
  { region: 'Corse', taux: 14, maj: '2023-11-30' },
  { region: 'Occitanie', taux: 12, maj: '2023-01-20' },
];

/** Champs d'un jeu, déduits de sa première ligne. */
function champs(lignes: Ligne[]): { name: string; type: string; sample: string | number }[] {
  return Object.entries(lignes[0]).map(([name, sample]) => ({
    name,
    type: typeof sample === 'number' ? 'number' : 'string',
    sample,
  }));
}

/** État déposé comme le fait la page Favoris, AVANT #1263 : aucune clé du cadre. */
function etat(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    chartType: 'bar',
    labelField: 'region',
    valueField: 'taux',
    aggregation: 'sum',
    sortOrder: 'none',
    title: 'Recette du cadre officiel',
    palette: 'default',
    fields: champs(REGIONS),
    localData: REGIONS,
    data: [],
    savedSource: { id: 'recette-1263', name: 'Jeu de recette', type: 'manual' },
    generationMode: 'embedded',
    ...extra,
  };
}

/** Ouvre le Builder sur un état déposé, section « Cadre officiel DSFR » dépliée. */
async function ouvrir(page: Page, depose: Record<string, unknown>): Promise<string[]> {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.addInitScript((etatDepose) => {
    // Dans la page seulement : l'iframe d'aperçu partage l'origine. Redéposé à
    // chaque chargement — à froid, Vite recharge la page après avoir optimisé
    // ses dépendances, et le premier dépôt a déjà été consommé.
    if (window.top !== window) return;
    sessionStorage.setItem('builder-state', JSON.stringify(etatDepose));
    // La visite guidée du premier passage pose un voile qui intercepte les clics.
    localStorage.setItem('dsfr-data-tours', JSON.stringify({ disabled: true, tours: {} }));
  }, depose);
  await page.goto('/apps/builder/?from=favorites');
  await expect(page.locator('#generate-btn')).toBeEnabled();
  await page.evaluate(() => {
    for (const s of document.querySelectorAll('.config-section')) s.classList.add('collapsed');
    document.getElementById('section-databox')?.classList.remove('collapsed');
  });
  return erreurs;
}

async function generer(page: Page): Promise<string> {
  await page.locator('#generate-btn').click();
  await expect(page.locator('#builder-dirty-status-text')).toHaveText('Graphique à jour');
  return (await page.locator('#generated-code').textContent()) ?? '';
}

/** L'aperçu, une fois le cadre rendu par DSFR Chart. */
async function cadre(page: Page): Promise<FrameLocator> {
  const apercu = page.frameLocator('#preview-iframe');
  await expect(apercu.locator('data-box .databox').first()).toBeVisible({ timeout: 20_000 });
  // Le JavaScript du DSFR, chargé en module, se lie au cadre après son rendu :
  // un clic plus tôt tomberait sur un bouton encore inerte.
  await expect(apercu.locator('.more-actions-menu button[data-fr-js-collapse-button]')).toHaveCount(
    1,
    { timeout: 20_000 }
  );
  return apercu;
}

/** Active le cadre par sa case : c'est elle qui fait apparaître les réglages. */
async function activer(page: Page): Promise<void> {
  await expect(page.locator('#databox-options')).toBeHidden();
  // La case DSFR est recouverte par son libellé : c'est lui qu'on clique.
  await page.locator('label[for="databox-toggle"]').click();
  await expect(page.locator('#databox-toggle')).toBeChecked();
  await expect(page.locator('#databox-options')).toBeVisible();
}

test.describe('cadre officiel : le volet change ce que l’aperçu affiche (#1263)', () => {
  test('ancien favori : rouvert sans cadre, balise DSFR Chart nue, réglages masqués', async ({
    page,
  }) => {
    const erreurs = await ouvrir(page, etat());
    const code = await generer(page);
    expect(code).toContain('<bar-chart id="chart"');
    expect(code).not.toContain('data-box');
    expect(code).not.toContain('dsfr.module.min.js');
    await expect(page.locator('#databox-toggle')).not.toBeChecked();
    // Les réglages qui dépendent du cadre n'apparaissent pas tant qu'il est désactivé.
    for (const id of ['databox-title', 'databox-date-field', 'databox-info-details']) {
      await expect(page.locator(`#${id}`)).toBeHidden();
    }
    expect(erreurs).toEqual([]);
  });

  test('cadre activé : le menu « Plus d’actions » s’ouvre et porte le CSV', async ({ page }) => {
    const erreurs = await ouvrir(page, etat());
    await activer(page);
    await page.fill('#databox-title', 'Taux par région');
    await page.fill('#databox-source', 'INSEE, 2024');
    // L'essentiel est visible, le reste replié.
    await expect(page.locator('#databox-date-field')).toBeVisible();
    await expect(page.locator('#databox-tooltip-title')).toBeHidden();
    await expect(page.locator('#add-databox-action-btn')).toBeHidden();
    const code = await generer(page);
    expect(code).toContain('dsfr.module.min.js');
    const apercu = await cadre(page);
    const menu = apercu.locator('.more-actions-menu button[aria-controls]');
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(apercu.getByRole('button', { name: 'Télécharger en CSV' })).toBeVisible();
    // Ni infobulle ni fenêtre tant que rien n'est saisi.
    await expect(apercu.locator('data-box .fr-btn--tooltip')).toHaveCount(0);
    await expect(apercu.locator('.fr-icon-fullscreen-line')).toHaveCount(0);
    expect(erreurs).toEqual([]);
  });

  test('infobulle : un bouton dans l’en-tête, le texte rendu tel quel', async ({ page }) => {
    const erreurs = await ouvrir(page, etat());
    await activer(page);
    await page.click('#databox-info-details > summary');
    await page.fill('#databox-tooltip-title', 'Méthode');
    await page.fill(
      '#databox-tooltip-content',
      'Taux "brut" de l\'Insee <b>non corrigé</b>.\nSeconde ligne.'
    );
    const code = await generer(page);
    // Données intégrées, type historique : les réglages sont ceux de la balise data-box.
    expect(code).toContain('tooltip-title="Méthode"');
    const apercu = await cadre(page);
    const bouton = apercu.locator('data-box .fr-btn--tooltip');
    await expect(bouton).toHaveCount(1);
    await bouton.focus();
    const bulle = apercu.locator('.fr-tooltip');
    await expect(bulle).toHaveClass(/fr-tooltip--shown/);
    await expect(bulle).toContainText('Méthode');
    // Guillemets, apostrophe et chevrons arrivent intacts ; la balise est du texte.
    await expect(bulle).toContainText('Taux "brut" de l\'Insee <b>non corrigé</b>. Seconde ligne.');
    await expect(bulle.locator('b')).toHaveCount(0);
    expect(erreurs).toEqual([]);
  });

  test('fenêtre d’information : ouverte par son bouton, contenu échappé', async ({ page }) => {
    const erreurs = await ouvrir(page, etat());
    await activer(page);
    await page.click('#databox-info-details > summary');
    // Un contenu sans titre : ni bouton ni fenêtre.
    await page.fill('#databox-modal-content', 'Sans titre.');
    let code = await generer(page);
    expect(code).not.toContain('databox-modal');
    expect(code).not.toMatch(/\bfullscreen\b/);
    let apercu = await cadre(page);
    await expect(apercu.locator('.fr-icon-fullscreen-line')).toHaveCount(0);

    await page.fill('#databox-modal-title', 'En savoir plus');
    await page.fill(
      '#databox-modal-content',
      'Premier paragraphe "cité".\nSuite <b>sans gras</b>.\n\n<img src=x onerror="window.__injection = 1"> Second paragraphe.'
    );
    code = await generer(page);
    expect(code).toMatch(/\n\s+fullscreen\n/);
    apercu = await cadre(page);
    const bouton = apercu.locator('.fr-icon-fullscreen-line');
    await expect(bouton).toHaveAttribute('title', 'Afficher la modale En savoir plus');
    await bouton.click();
    const fenetre = apercu.locator('dialog.fr-modal');
    await expect(fenetre).toHaveClass(/fr-modal--opened/);
    await expect(fenetre.locator('.fr-modal__title')).toContainText('En savoir plus');
    const contenu = fenetre.locator('.fr-modal__content > div');
    await expect(contenu.locator('p')).toHaveCount(2);
    await expect(contenu.locator('p').first()).toContainText('Premier paragraphe "cité".');
    await expect(contenu.locator('p').first()).toContainText('Suite <b>sans gras</b>.');
    await expect(contenu.locator('p').nth(1)).toContainText('onerror=');
    // Aucune balise née de la saisie, aucun script exécuté.
    await expect(contenu.locator('b, img')).toHaveCount(0);
    const injection = await page
      .frames()
      .find((f) => f !== page.mainFrame())!
      .evaluate(() => (window as Window & { __injection?: number }).__injection ?? null);
    expect(injection).toBeNull();
    expect(erreurs).toEqual([]);
  });

  test('actions : chaque libellé devient une entrée du menu, reconnaissable par data-action', async ({
    page,
  }) => {
    const erreurs = await ouvrir(page, etat());
    await activer(page);
    await page.click('#databox-actions-details > summary');
    await page.click('#add-databox-action-btn');
    await page.fill('#databox-action-0', 'Voir la méthode');
    await page.click('#add-databox-action-btn');
    await page.fill('#databox-action-1', 'Signaler l\'erreur "x"');
    const code = await generer(page);
    expect(code).toContain('<!-- Actions du cadre :');
    const apercu = await cadre(page);
    await apercu.locator('.more-actions-menu button[aria-controls]').click();
    const entrees = apercu.locator('.more-actions-menu .fr-menu__list button');
    await expect(entrees).toHaveText([
      'Télécharger en CSV',
      'Voir la méthode',
      'Signaler l\'erreur "x"',
    ]);
    await expect(entrees.nth(1)).toHaveAttribute('data-action', 'voir-la-methode');
    await expect(entrees.nth(1)).toBeVisible();
    // Supprimer une action la retire du menu.
    await page.locator('#databox-actions-container [data-action="remove"]').first().click();
    await generer(page);
    const apres = await cadre(page);
    await apres.locator('.more-actions-menu button[aria-controls]').click();
    await expect(apres.locator('.more-actions-menu .fr-menu__list button')).toHaveText([
      'Télécharger en CSV',
      'Signaler l\'erreur "x"',
    ]);
    expect(erreurs).toEqual([]);
  });

  test('date lue dans les données : la plus récente, puis la date saisie qui prime', async ({
    page,
  }) => {
    const erreurs = await ouvrir(page, etat());
    await activer(page);
    // La liste est remplie depuis les champs de la source.
    await expect(page.locator('#databox-date-field option')).toHaveText([
      '— Aucun —',
      'region (string)',
      'taux (number)',
      'maj (string)',
    ]);
    await page.selectOption('#databox-date-field', 'maj');
    await expect(page.locator('#databox-date-field-note')).toBeHidden();
    let code = await generer(page);
    // Données intégrées : le graphique passe par la bibliothèque, qui lit la colonne.
    expect(code).toContain('databox-date-field="maj__max"');
    let apercu = await cadre(page);
    await expect(apercu.locator('data-box')).toHaveAttribute('date', '15/06/2025');
    await expect(apercu.locator('data-box')).toContainText('15/06/2025');

    // Un champ sans date : la note le dit avant de générer.
    await page.selectOption('#databox-date-field', 'region');
    await expect(page.locator('#databox-date-field-note')).toContainText('AAAA-MM-JJ');
    await page.selectOption('#databox-date-field', 'maj');

    // Une date saisie prime, et la note le dit.
    await page.fill('#databox-date', 'Mars 2024');
    await expect(page.locator('#databox-date-field-note')).toContainText('date saisie');
    code = await generer(page);
    expect(code).not.toContain('databox-date-field');
    apercu = await cadre(page);
    await expect(apercu.locator('data-box')).toHaveAttribute('date', 'Mars 2024');
    expect(erreurs).toEqual([]);
  });

  test('chargement dynamique (API) : la date traverse l’agrégation de dsfr-data-query', async ({
    page,
  }) => {
    const url = 'https://recette-1263.exemple.test/lignes.json';
    await page.route('https://recette-1263.exemple.test/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(REGIONS),
      })
    );
    const erreurs = await ouvrir(
      page,
      etat({
        apiUrl: url,
        generationMode: 'dynamic',
        savedSource: { id: 'recette-1263-api', name: 'API de recette', type: 'api', apiUrl: url },
      })
    );
    await activer(page);
    await page.selectOption('#databox-date-field', 'maj');
    const code = await generer(page);
    expect(code).toContain('aggregate="taux:sum, maj:max"');
    expect(code).toContain('databox-date-field="maj__max"');
    const apercu = await cadre(page);
    await expect(apercu.locator('data-box')).toHaveAttribute('date', '15/06/2025');
    // La colonne ajoutée n'est pas tracée : trois barres, une série.
    await expect(apercu.locator('data-box')).toContainText('15/06/2025');
    expect(erreurs).toEqual([]);
  });

  test('favori d’après : enregistré puis rouvert, il garde son cadre et régénère le même code', async ({
    page,
    context,
  }) => {
    const erreurs = await ouvrir(page, etat());
    await activer(page);
    await page.fill('#databox-title', 'Taux par région');
    await page.selectOption('#databox-date-field', 'maj');
    await page.click('#databox-info-details > summary');
    await page.fill('#databox-tooltip-title', 'Méthode');
    await page.fill('#databox-modal-title', 'En savoir plus');
    await page.fill('#databox-modal-content', 'Un texte.\n\nUn second.');
    await page.click('#databox-actions-details > summary');
    await page.click('#add-databox-action-btn');
    await page.fill('#databox-action-0', 'Voir la méthode');
    const code = await generer(page);
    // L'instantané que « Ajouter aux favoris » enregistre, lu dans la page.
    const instantane = await page.evaluate(async (module) => {
      // Le module que la page a déjà chargé : même instance, même état.
      const m = (await import(/* @vite-ignore */ module)) as {
        getBuilderStateToSave: () => Record<string, unknown>;
      };
      return JSON.parse(JSON.stringify(m.getBuilderStateToSave())) as Record<string, unknown>;
    }, '/apps/builder/src/ui/ui-helpers.ts');
    expect(instantane).toMatchObject({
      databoxEnabled: true,
      databoxTitle: 'Taux par région',
      databoxDateField: 'maj',
      databoxActions: ['Voir la méthode'],
    });

    const seconde = await context.newPage();
    const erreurs2 = await ouvrir(seconde, instantane);
    await expect(seconde.locator('#databox-toggle')).toBeChecked();
    await expect(seconde.locator('#databox-title')).toHaveValue('Taux par région');
    await expect(seconde.locator('#databox-date-field')).toHaveValue('maj');
    // Les divulgations qui portent un réglage se rouvrent dépliées.
    await expect(seconde.locator('#databox-modal-content')).toBeVisible();
    await expect(seconde.locator('#databox-modal-content')).toHaveValue('Un texte.\n\nUn second.');
    await expect(seconde.locator('#databox-action-0')).toHaveValue('Voir la méthode');
    expect(await generer(seconde)).toBe(code);
    const apercu = await cadre(seconde);
    await expect(apercu.locator('data-box')).toHaveAttribute('date', '15/06/2025');
    await expect(apercu.locator('data-box .fr-btn--tooltip')).toHaveCount(1);
    expect([...erreurs, ...erreurs2]).toEqual([]);
  });

  test('téléphone (375 px) : pas de débordement horizontal, « Générer » reste à l’écran', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await ouvrir(page, etat());
    await activer(page);
    await page.fill('#databox-title', 'Taux par région');
    await page.selectOption('#databox-date-field', 'maj');
    await page.click('#databox-info-details > summary');
    await page.fill('#databox-tooltip-content', 'Une précision.');
    await page.fill('#databox-modal-title', 'En savoir plus');
    await page.click('#databox-actions-details > summary');
    await page.click('#add-databox-action-btn');
    await page.fill('#databox-action-0', 'Voir la méthode');
    const mesure = await page.evaluate(() => {
      const r = document.getElementById('generate-btn')!.getBoundingClientRect();
      const champsTropLarges = [
        ...document.querySelectorAll<HTMLElement>(
          '#databox-options input, #databox-options textarea, #databox-options select'
        ),
      ].filter(
        (c) => c.offsetParent !== null && c.getBoundingClientRect().right > window.innerWidth
      );
      return {
        debordement: document.documentElement.scrollWidth - window.innerWidth,
        haut: r.top,
        bas: r.bottom,
        hauteur: window.innerHeight,
        champsTropLarges: champsTropLarges.map((c) => c.id),
      };
    });
    expect(mesure.debordement).toBeLessThanOrEqual(0);
    expect(mesure.champsTropLarges).toEqual([]);
    expect(mesure.haut).toBeGreaterThanOrEqual(0);
    expect(mesure.bas).toBeLessThanOrEqual(mesure.hauteur);
    await generer(page);
    await cadre(page);
  });

  test('bureau : la page ne défile pas, le volet défile seul', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await ouvrir(page, etat());
    const avant = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight
    );
    await activer(page);
    await page.click('#databox-info-details > summary');
    await page.click('#databox-actions-details > summary');
    for (let i = 0; i < 4; i++) await page.click('#add-databox-action-btn');
    const apres = await page.evaluate(() => ({
      page: document.documentElement.scrollHeight - window.innerHeight,
      volet: (() => {
        const v = document.querySelector('.builder-scroll')!;
        return v.scrollHeight - v.clientHeight;
      })(),
    }));
    // Tous les réglages dépliés : la hauteur de la PAGE n'a pas bougé.
    expect(apres.page).toBe(avant);
    expect(apres.volet).toBeGreaterThan(0);
    await expect(page.locator('#generate-btn')).toBeInViewport();
  });
});
