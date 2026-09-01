/**
 * Tests e2e du Studio IA (#515) : parcours dashboard multi-blocs de bout en
 * bout avec LLM MOCKE au niveau reseau (route /ia-server-config +
 * /ia-proxy-default) — aucun appel externe, deterministe.
 *
 * Le mock scripte une session agentique realiste : set_page + add_blocks
 * batch (texte, kpi, chart, filtres) puis finish, et au tour suivant un
 * update_block cible. On verifie l'apercu vivant (iframe srcdoc = export),
 * le code genere et l'enregistrement partage avec l'app dashboard.
 */
import { test, expect, type Page } from '@playwright/test';
import { disableProductTour } from './helpers';

const ROWS = [
  { region: 'Bretagne', annee: 2023, effectif: 1200, lat: 48.11, lon: -1.68 },
  { region: 'PACA', annee: 2023, effectif: 800, lat: 43.3, lon: 5.37 },
  { region: 'Bretagne', annee: 2024, effectif: 1350, lat: 48.39, lon: -4.49 },
  { region: 'PACA', annee: 2024, effectif: 900, lat: 43.7, lon: 7.26 },
];

function toolCallResponse(calls: { name: string; args: Record<string, unknown> }[]) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: calls.map((c, i) => ({
            id: `call-${Date.now()}-${i}`,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          })),
        },
      },
    ],
  };
}

/** Scripte les reponses successives du "modele" (une par appel POST). */
async function mockAlbert(page: Page, responses: unknown[]): Promise<void> {
  let i = 0;
  await page.route('**/ia-server-config', (route) =>
    route.fulfill({ json: { available: true, model: 'mock-model' } })
  );
  await page.route('**/ia-proxy-default', (route) =>
    route.fulfill({ json: responses[Math.min(i++, responses.length - 1)] })
  );
}

test.beforeEach(async ({ page }) => {
  await disableProductTour(page);
  await page.addInitScript((data) => {
    localStorage.setItem(
      'dsfr-data-sources',
      JSON.stringify([
        { id: 'src-e2e', name: 'Effectifs', type: 'manual', data, recordCount: data.length },
      ])
    );
  }, ROWS);
});

test.describe('Studio IA', () => {
  test('compose un dashboard complet puis modifie un bloc cible', async ({ page }) => {
    await mockAlbert(page, [
      // Tour 1 : le modele pose la page et batch 4 blocs, puis finish.
      toolCallResponse([
        {
          name: 'set_page',
          args: { name: 'Effectifs scolaires', description: 'Évolution 2023-2024' },
        },
        {
          name: 'add_blocks',
          args: {
            blocks: [
              { kind: 'text', content: 'Les effectifs progressent dans les deux régions.' },
              { kind: 'filters', fields: ['region'] },
              {
                kind: 'chart',
                title: 'Total',
                config: { type: 'kpi', valueField: 'effectif', aggregation: 'sum' },
              },
              {
                kind: 'chart',
                title: 'Par région',
                config: {
                  type: 'pie',
                  labelField: 'region',
                  valueField: 'effectif',
                  aggregation: 'sum',
                },
              },
              {
                kind: 'map',
                title: 'Implantations',
                layers: [
                  {
                    type: 'circle',
                    latField: 'lat',
                    lonField: 'lon',
                    valueField: 'effectif',
                    tooltipField: 'region',
                  },
                ],
              },
            ],
          },
        },
      ]),
      toolCallResponse([{ name: 'finish', args: { message: 'Votre dashboard est prêt.' } }]),
      // Tour 2 : « passe le camembert en barres » -> update_block cible.
      toolCallResponse([
        { name: 'update_block', args: { block_id: 'b4', kind: 'chart', config: { type: 'bar' } } },
      ]),
      toolCallResponse([{ name: 'finish', args: { message: 'Camembert converti en barres.' } }]),
    ]);

    await page.goto('/apps/studio/index.html');
    await page.waitForTimeout(800);

    // Charge la source.
    await page.selectOption('#saved-source', 'src-e2e');
    await expect(page.locator('#source-summary')).toContainText('Effectifs');

    // Tour 1 : composition.
    await page.fill(
      '#chat-input',
      'Un dashboard des effectifs, avec ce texte : Les effectifs progressent…'
    );
    await page.click('#chat-send-btn');
    await expect(page.locator('.chat-message--assistant').last()).toContainText(
      'Votre dashboard est prêt.',
      { timeout: 10000 }
    );

    // L'apercu vivant est branche et le code genere EST la page exportee.
    // (rendu debounce 150 ms -> assertions auto-retry avant lecture brute)
    await expect(page.locator('#preview-frame')).toBeVisible();
    await expect(page.locator('#generated-code')).toContainText('<h1>Effectifs scolaires</h1>');
    const code = await page.locator('#generated-code').textContent();
    expect(code).toContain('<h1>Effectifs scolaires</h1>');
    expect(code).toContain('Évolution 2023-2024');
    expect(code).toContain('<dsfr-data-source id="src-e2e"');
    expect(code).toContain('<dsfr-data-kpi');
    expect(code).toContain('type="pie"');
    expect(code).toContain('<dsfr-data-context');
    expect(code).toContain('<dsfr-data-context-tags');
    // Bloc carte Leaflet (#531) : couche traduite au vocabulaire map-layer,
    // et bundle complet (Leaflet) selectionne.
    expect(code).toContain('<dsfr-data-map id="map-b5"');
    expect(code).toContain(
      '<dsfr-data-map-layer source="src-e2e" type="circle" lat-field="lat" lon-field="lon" radius-field="effectif" tooltip-field="region">'
    );
    expect(code).toContain('/dsfr-data.esm.js');
    // Options des filtres remplies depuis les donnees, pas par le LLM.
    expect(code).toContain('<option value="Bretagne">');

    const srcdoc = await page.locator('#preview-frame').getAttribute('srcdoc');
    expect(srcdoc).toBe(code);

    // Tour 2 : edition ciblee d'un bloc existant.
    await page.fill('#chat-input', 'Passe le graphique par région en barres');
    await page.click('#chat-send-btn');
    await expect(page.locator('.chat-message--assistant').last()).toContainText(
      'Camembert converti en barres.',
      { timeout: 10000 }
    );
    await expect(page.locator('#generated-code')).toContainText('type="bar"');
    const code2 = await page.locator('#generated-code').textContent();
    expect(code2).not.toContain('type="pie"');

    // Enregistrement : le document rejoint les dashboards partages.
    await page.click('#save-dashboard-btn');
    await page.waitForTimeout(300);
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('dsfr-data-dashboards') ?? '[]')
    );
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('Effectifs scolaires');
    expect(saved[0].widgets).toHaveLength(5);

    // « Effacer » remet conversation ET document a zero : l'apercu disparait…
    await page.click('#clear-chat');
    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#preview-frame')).toBeHidden();
    await expect(page.locator('#generated-code')).not.toContainText('Effectifs scolaires');

    // …et le reset survit a un refresh (le document sessionStorage est vide).
    await page.reload();
    await page.waitForTimeout(500);
    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#preview-frame')).toBeHidden();
  });

  test('sans configuration IA, le chat explique quoi faire au lieu d’échouer', async ({ page }) => {
    await page.route('**/ia-server-config', (route) =>
      route.fulfill({ json: { available: false } })
    );
    await page.goto('/apps/studio/index.html');
    await page.waitForTimeout(500);

    await page.fill('#chat-input', 'Un dashboard');
    await page.click('#chat-send-btn');
    await expect(page.locator('.chat-message--assistant').last()).toContainText(
      'Aucune configuration IA',
      { timeout: 5000 }
    );
  });
});
