/**
 * Recette des 16 types dans le Studio IA — pendant de `builder-ia-recette`.
 *
 * Le Studio remplace l'Assistant IA comme entree usager (#1081) : chaque type
 * que l'Assistant savait rendre doit rendre aussi comme bloc `chart` d'un
 * document du Studio. Le chemin exerce est le vrai : un document pose dans
 * l'etat de l'app, puis `renderPreview`, qui alimente `#preview-frame` avec
 * `generateDashboardHTML` — le code meme que l'usager copie.
 *
 * Requiert `npm run dev` (Playwright le demarre, ou reutilise le tien) :
 *   npx playwright test --config tests/builder-e2e/playwright.config.ts \
 *     studio-recette
 */

import { test, expect, type ConsoleMessage } from '@playwright/test';

const APP_URL = 'http://localhost:5173/apps/studio/';

const TYPES = [
  'bar',
  'line',
  'pie',
  'doughnut',
  'radar',
  'horizontalBar',
  'scatter',
  'gauge',
  'kpi',
  'map',
  'bar-line',
  'map-reg',
  'map-aca',
  'map-monde',
  'datalist',
  'podium',
] as const;

/** Meme jeu piegeux que la recette de l'Assistant (#615). */
const LIGNES = [
  { region: "Provence-Alpes-Cote d'Azur", code_dept: '13', population: 5098666 },
  { region: "Val-d'Oise", code_dept: '95', population: 1249674 },
  { region: 'Recherche & Developpement', code_dept: '75', population: 2161000 },
  { region: 'Nord', code_dept: '59', population: 2604000 },
  { region: 'Rhone', code_dept: '69', population: 1876000 },
];

const TOLEREES = [
  /favicon/i,
  /net::ERR_/i,
  /Failed to load resource/i,
  /remixicon/i,
  /Content Security Policy/i,
];

test.describe('recette des 16 types dans le Studio — l’apercu rend', () => {
  for (const type of TYPES) {
    test(`${type} : bloc chart, code genere et apercu visible`, async ({ page }) => {
      const erreurs: string[] = [];
      page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() !== 'error') return;
        const texte = msg.text();
        if (!TOLEREES.some((r) => r.test(texte))) erreurs.push(texte);
      });
      page.on('pageerror', (err) => erreurs.push(`pageerror: ${err.message}`));

      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

      const codeGenere = await page.evaluate(
        async ({ type, lignes }) => {
          const module = (chemin: string) =>
            import(/* @vite-ignore */ `/apps/studio/src/${chemin}`);
          const { state } = await module('state.ts');
          const { renderPreview } = await module('ui/preview.ts');

          state.document.sources = [
            {
              id: 'recette',
              name: 'Recette locale',
              type: 'manual',
              data: lignes,
              recordCount: lignes.length,
            },
          ];
          state.document.widgets = [
            {
              id: 'b1',
              type: 'chart',
              title: `Recette ${type}`,
              position: { row: 0, col: 0 },
              config: {
                fromBuilder: true,
                sourceId: 'recette',
                chart: {
                  type,
                  labelField: 'region',
                  valueField: 'population',
                  codeField: 'code_dept',
                  aggregation: 'sum',
                  title: `Recette ${type}`,
                },
              },
            },
          ];
          renderPreview();
          return document.getElementById('generated-code')?.textContent ?? '';
        },
        { type, lignes: LIGNES }
      );

      expect(codeGenere.trim(), 'aucun code genere').not.toBe('');

      const frame = page.locator('#preview-frame');
      await expect(frame).toBeVisible();
      const contenu = page.frameLocator('#preview-frame').locator('.fr-container');
      await expect(contenu).toBeVisible({ timeout: 20_000 });

      // 3. Le composant d'affichage produit des pixels. Mesure sur LE
      //    composant, pas sur la page : le titre du document et celui du bloc
      //    depassent a eux seuls le seuil, un composant vide passerait.
      const affichage = page
        .frameLocator('#preview-frame')
        .locator('dsfr-data-chart, dsfr-data-kpi, dsfr-data-list, dsfr-data-podium')
        .first();
      await expect
        .poll(() => affichage.evaluate((el) => el.getBoundingClientRect().height), {
          timeout: 20_000,
          message: 'le composant d’affichage reste vide',
        })
        .toBeGreaterThan(60);

      if (/podium|datalist/.test(type)) {
        await expect(
          page.frameLocator('#preview-frame').getByText("Val-d'Oise", { exact: false }).first()
        ).toBeVisible({ timeout: 20_000 });
      }

      expect(erreurs, `erreurs console pour ${type}`).toEqual([]);
    });
  }
});
