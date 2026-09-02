/**
 * Tests e2e des refontes « v2 » (Claude Design, 2026-08) : Builder graphique,
 * Sources, Favoris, Assistant IA. Couvre les invariants de chaque nouvelle
 * interface (structure, synchronisations, garde-fous) avec des données
 * seedées en localStorage et des mocks réseau — aucun appel externe.
 */
import { test, expect } from '@playwright/test';
import { disableProductTour } from './helpers';

test.beforeEach(async ({ page }) => {
  await disableProductTour(page);
});

// ===================================================================
// Builder graphique v2
// ===================================================================
test.describe('Builder v2', () => {
  test.beforeEach(async ({ page }) => {
    const rows = Array.from({ length: 80 }, (_, i) => ({
      etablissement: `Lycée ${i}`,
      type: ['Collège', 'Lycée', 'École'][i % 3],
      region: ['Bretagne', 'PACA'][i % 2],
      effectif: 100 + i * 7,
    }));
    await page.addInitScript((data) => {
      localStorage.setItem(
        'dsfr-data-sources',
        JSON.stringify([
          { id: 'big', name: 'Etablissements', type: 'manual', data, recordCount: data.length },
        ])
      );
    }, rows);
    await page.goto('/apps/builder/index.html');
    await page.waitForTimeout(1200);
  });

  test('structure v2 : étapes numérotées, groupe avancé, barre d’action épinglée', async ({
    page,
  }) => {
    await expect(page.locator('.step-badge')).toHaveCount(4);
    await expect(page.locator('.advanced-group-label')).toBeVisible();
    await expect(page.locator('app-action-bar #generate-btn')).toBeVisible();
    await expect(page.locator('.empty-state__bars span')).toHaveCount(4);
    // Ancres du tour et des specs historiques
    for (const sel of ['#section-source', '.chart-type-grid', '#section-data', '#generate-btn']) {
      await expect(page.locator(sel)).toBeAttached();
    }
  });

  test('source → cardinalités dans les options, sections dépliées, étape cochée', async ({
    page,
  }) => {
    await page.selectOption('#saved-source', 'big');
    await page.waitForTimeout(1200);
    const opts = await page.locator('#label-field option').allInnerTexts();
    expect(opts.some((t) => /valeurs\)/.test(t))).toBe(true);
    await expect(page.locator('#section-data')).not.toHaveClass(/collapsed/);
    await expect(page.locator('.empty-state-steps li[data-step="source"]')).toHaveClass(/done/);
  });

  test('garde-fou de cardinalité : bandeau + suggestion appliquée', async ({ page }) => {
    await page.selectOption('#saved-source', 'big');
    await page.waitForTimeout(1200);
    await page.selectOption('#label-field', 'etablissement');
    await page.waitForTimeout(400);
    await expect(page.locator('#cardinality-guard')).toBeVisible();
    await page.locator('#cardinality-guard-actions button').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('#cardinality-guard')).toBeHidden();
  });

  test('builder de filtres visuel ⇄ colon-syntax + advancedMode déduit', async ({ page }) => {
    await page.selectOption('#saved-source', 'big');
    await page.waitForTimeout(1200);
    await page.locator('#add-filter-btn').click();
    const row = page.locator('.filter-row').first();
    await row.locator('.filter-row__field').selectOption('region');
    await row.locator('.filter-row__value').fill('Bretagne');
    await page.waitForTimeout(300);
    const sync = await page.evaluate(() => {
      const w = window as unknown as {
        __BUILDER_STATE__: { queryFilter: string; advancedMode: boolean };
      };
      return { state: w.__BUILDER_STATE__.queryFilter, adv: w.__BUILDER_STATE__.advancedMode };
    });
    expect(sync.state).toBe('region:eq:Bretagne');
    expect(sync.adv).toBe(true);
    // Mode texte : édition brute re-parsée au retour en mode visuel
    await page.locator('#filters-mode-toggle').click();
    await page.locator('#query-filter').fill('region:eq:Bretagne, effectif:gte:200');
    await page.locator('#filters-mode-toggle').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.filter-row')).toHaveCount(2);
  });

  test('générer → aperçu + statut à jour ; modification → non généré', async ({ page }) => {
    await page.selectOption('#saved-source', 'big');
    await page.waitForTimeout(1200);
    await page.locator('#generate-btn').click();
    await page.waitForTimeout(2000);
    await expect(page.locator('#preview-iframe')).toBeVisible();
    await expect(page.locator('#builder-dirty-status-text')).toHaveText('Graphique à jour');
    await page.locator('#chart-title').fill('Autre titre');
    await page.waitForTimeout(300);
    await expect(page.locator('#builder-dirty-status-text')).toHaveText(
      'Modifications non générées'
    );
  });
});

// ===================================================================
// Sources v2 (accordéon + panneau d'aperçu)
// ===================================================================
test.describe('Sources v2', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/grist-gouv-proxy/api/docs/testdoc', (r) =>
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ name: 'Doc Test' }) })
    );
    await page.route('**/grist-gouv-proxy/api/docs/testdoc/tables', (r) =>
      r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ tables: [{ id: 'Indicateurs' }, { id: 'Regions' }] }),
      })
    );
    await page.route('**/grist-gouv-proxy/api/docs/testdoc/tables/Regions/records*', (r) =>
      r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ records: [{ id: 1, fields: { nom: 'Bretagne', pop: 3.4 } }] }),
      })
    );
    await page.addInitScript(() => {
      localStorage.setItem(
        'dsfr-data-connections',
        JSON.stringify([
          {
            id: 'c-grist',
            type: 'grist',
            name: 'Grist Test',
            url: 'https://grist.numerique.gouv.fr',
            apiKey: null,
            isPublic: true,
            publicDocId: 'testdoc',
            status: 'connected',
            statusText: 'Doc public',
          },
        ])
      );
      localStorage.setItem(
        'dsfr-data-sources',
        JSON.stringify([
          { id: 'm1', name: 'Local test', type: 'manual', data: [{ a: 1 }], recordCount: 1 },
        ])
      );
    });
    await page.goto('/apps/sources/index.html');
    await page.waitForTimeout(1200);
  });

  test('accordéon : connexion dépliable sur ses tables, badge jeu créé', async ({ page }) => {
    await expect(page.locator('.conn-item')).toHaveCount(1);
    await page.locator('.conn-item__header').click();
    await page.waitForTimeout(1000);
    await expect(page.locator('#conn-body-c-grist .source-row')).toHaveCount(2);
    await expect(page.locator('#conn-body-c-grist .act-create').first()).toBeVisible();
  });

  test('aperçu d’une table dans le panneau latéral + fermeture Échap', async ({ page }) => {
    await page.locator('.conn-item__header').click();
    await page.waitForTimeout(1000);
    await page
      .locator('#conn-body-c-grist .source-row', { hasText: 'Regions' })
      .locator('.act-preview')
      .click();
    await page.waitForTimeout(1200);
    await expect(page.locator('#preview-panel')).toBeVisible();
    await expect(page.locator('#preview-table tbody tr')).toHaveCount(1);
    await expect(page.locator('#add-online-btn')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#preview-panel')).toBeHidden();
  });

  test('jeux locaux : ligne avec aperçu et actions', async ({ page }) => {
    const row = page.locator('#local-sources-list .source-row', { hasText: 'Local test' });
    await expect(row).toBeVisible();
    await row.locator('.act-preview').click();
    await page.waitForTimeout(400);
    await expect(page.locator('#preview-panel')).toBeVisible();
    await expect(page.locator('#export-grist-btn')).toBeVisible();
  });
});

// ===================================================================
// Favoris v2 (grille de vignettes + panneau)
// ===================================================================
test.describe('Favoris v2', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'dsfr-data-favorites',
        JSON.stringify([
          {
            id: 'f1',
            name: 'Graphique test',
            code:
              '<script type="module" src="https://cdn/x.js"></' +
              'script>\n<dsfr-data-chart source="s"\n    type="line" label-field="a" value-field="b">\n</dsfr-data-chart>',
            chartType: 'chart',
            sourceApp: 'builder',
            createdAt: '2026-08-22T10:00:00Z',
          },
          {
            id: 'f2',
            name: 'Carte test',
            code: '<dsfr-data-map><dsfr-data-map-layer type="marker"></dsfr-data-map-layer></dsfr-data-map>',
            chartType: 'chart',
            sourceApp: 'builder-carto',
            createdAt: '2026-08-21T10:00:00Z',
          },
        ])
      );
    });
    await page.goto('/apps/favorites/index.html');
    await page.waitForTimeout(1200);
  });

  test('grille : vignettes typées déduites du code (line, carte à couches)', async ({ page }) => {
    await expect(page.locator('.fav-card')).toHaveCount(2);
    const tags = await page.locator('.fav-card .fav-card__tag:first-child').allInnerTexts();
    expect(tags).toContain('line');
    // <dsfr-data-map> (Géoplateforme + couches) est distinguée de la choroplèthe DSFR (« map »)
    expect(tags).toContain('map · couches');
  });

  test('panneau : rendu iframe, actions, renommage, Échap', async ({ page }) => {
    await page.locator('.fav-card').first().click();
    await page.waitForTimeout(600);
    await expect(page.locator('#fav-panel')).toBeVisible();
    await expect(page.locator('#preview-frame')).toBeVisible();
    await expect(page.locator('#fav-panel-copy-btn')).toBeVisible();
    // Renommage inline depuis l'en-tête
    await page.locator('#fav-panel-rename-btn').click();
    await page.keyboard.type(' 2026');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    await expect(page.locator('#fav-panel-name')).toContainText('2026');
    await page.keyboard.press('Escape');
    await expect(page.locator('#fav-panel')).toBeHidden();
  });

  test('suppression via la modale ferme le panneau', async ({ page }) => {
    await page.locator('.fav-card').first().click();
    await page.waitForTimeout(400);
    await page.locator('#fav-panel-delete-btn').click();
    await expect(page.locator('#delete-modal')).toBeVisible();
    await page.locator('#confirm-delete-btn').click();
    await page.waitForTimeout(400);
    await expect(page.locator('.fav-card')).toHaveCount(1);
    await expect(page.locator('#fav-panel')).toBeHidden();
  });
});

// ===================================================================
// Assistant IA (chat borné, saisie épinglée)
// ===================================================================
test.describe('Assistant IA v2', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/apps/builder-ia/index.html');
    await page.waitForTimeout(1500);
  });

  test('volet borné : saisie épinglée en bas, conversation scrollable', async ({ page }) => {
    const layout = await page.evaluate(() => {
      const input = document.querySelector('.chat-input-container')!.getBoundingClientRect();
      const msgs = document.querySelector('.chat-messages')!;
      return {
        bodyScrollable: document.documentElement.scrollHeight > window.innerHeight + 2,
        inputPinned: Math.abs(input.bottom - window.innerHeight) < 3,
        msgsInternalScroll: getComputedStyle(msgs).overflowY === 'auto',
      };
    });
    expect(layout.bodyScrollable).toBe(false);
    expect(layout.inputPinned).toBe(true);
    expect(layout.msgsInternalScroll).toBe(true);
  });

  test('conversation : bulles asymétriques + chips cliquables', async ({ page }) => {
    await page.fill('#chat-input', 'reset');
    await page.press('#chat-input', 'Enter');
    await page.waitForTimeout(600);
    const userBubble = page.locator('.chat-message.user').last();
    await expect(userBubble).toBeVisible();
    expect(await userBubble.evaluate((el) => getComputedStyle(el).borderRadius)).toContain('2px');
    await expect(page.locator('.chat-suggestion').first()).toBeVisible();
    await expect(page.locator('.chat-input-hint')).toBeVisible();
    // « Effacer la conversation » vit dans l'AppActionBar depuis le lot UX 2 (#539).
    await expect(page.locator('app-action-bar #clear-chat')).toContainText(
      'Effacer la conversation'
    );
  });
});
