/**
 * Recette des 16 types de l'Assistant IA (#615).
 *
 * Complement E2E de `tests/apps/builder-ia/code-generator-recette.test.ts` :
 * celui-ci eprouve la FORME du code hors ligne, celui-la verifie qu'il REND.
 * C'est la moitie qu'aucune assertion de chaine ne peut couvrir — le podium
 * de #617 produisait un code parfaitement bien forme.
 *
 * Le chemin exerce est le vrai : `applyChartConfig` de l'app, qui genere le
 * code puis alimente `#preview-frame` via `getPreviewHTML`. Depuis #609 c'est
 * le SEUL chemin — il n'existe plus de rendu parallele a comparer.
 *
 * PORTEE, a ne pas surestimer : les 16 types sont rendus sur une source
 * LOCALE. Les trois variantes API demanderaient le reseau ; leur forme est
 * verifiee hors ligne, leur rendu ne l'est pas. Les deux defauts que ce spec
 * a trouves (podium vide, datalist pilotee par script) etaient bien du cote
 * embarque, mais rien ne garantit que le cote API en soit exempt.
 *
 * Requiert `npm run dev` actif (voir tests/builder-e2e/README.md) :
 *   npx playwright test --config tests/builder-e2e/playwright.config.ts \
 *     builder-ia-recette
 */

import { test, expect, type ConsoleMessage } from '@playwright/test';

const APP_URL = 'http://localhost:5173/apps/builder-ia/';

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

/**
 * Jeu volontairement piegeux : apostrophes (« Val-d'Oise »), esperluette et
 * chevron. Ce sont eux qui cassaient les attributs `data='…'` (#615).
 */
const LIGNES = [
  { region: "Provence-Alpes-Cote d'Azur", code_dept: '13', population: 5098666 },
  { region: "Val-d'Oise", code_dept: '95', population: 1249674 },
  { region: 'Recherche & Developpement', code_dept: '75', population: 2161000 },
  { region: 'Nord', code_dept: '59', population: 2604000 },
  { region: 'Rhone', code_dept: '69', population: 1876000 },
];

/**
 * Erreurs console tolerees : dependances tierces chargees depuis un CDN dans
 * un apercu isole. Tout le reste est un defaut de notre code.
 */
const TOLEREES = [
  /favicon/i,
  /net::ERR_/i,
  /Failed to load resource/i,
  /remixicon/i,
  /Content Security Policy/i,
];

test.describe('recette des 16 types — l’apercu rend', () => {
  for (const type of TYPES) {
    test(`${type} : code genere et apercu visible`, async ({ page }) => {
      const erreurs: string[] = [];
      page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() !== 'error') return;
        const texte = msg.text();
        if (!TOLEREES.some((r) => r.test(texte))) erreurs.push(texte);
      });
      page.on('pageerror', (err) => erreurs.push(`pageerror: ${err.message}`));

      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

      // Chemin reel de l'app : on pose une source locale puis on applique la
      // config, exactement comme le fait l'assistant apres une reponse.
      const codeGenere = await page.evaluate(
        async ({ type, lignes }) => {
          // Chemins resolus par le serveur de dev, pas par tsc : on les
          // construit pour que le typage ne tente pas de les suivre.
          const module = (chemin: string) =>
            import(/* @vite-ignore */ `/apps/builder-ia/src/${chemin}`);
          const { state } = await module('state.ts');
          const { applyChartConfig } = await module('ui/preview.ts');

          state.source = {
            id: 'recette',
            name: 'Recette locale',
            type: 'manual',
            recordCount: lignes.length,
          };
          state.localData = lignes;
          state.fields = [
            { name: 'region', type: 'string', sample: lignes[0].region },
            { name: 'code_dept', type: 'string', sample: lignes[0].code_dept },
            { name: 'population', type: 'number', sample: lignes[0].population },
          ];

          applyChartConfig({
            type,
            labelField: 'region',
            valueField: 'population',
            codeField: 'code_dept',
            aggregation: 'sum',
            title: `Recette ${type}`,
          });

          return document.getElementById('generated-code')?.textContent ?? '';
        },
        { type, lignes: LIGNES }
      );

      // 1. Le code existe — un echec de rendu ne doit jamais en priver
      //    l'utilisateur (#617).
      expect(codeGenere.trim(), 'aucun code genere').not.toBe('');

      // 2. L'apercu est monte et affiche quelque chose.
      const frame = page.locator('#preview-frame');
      await expect(frame).toBeVisible();
      const contenu = page.frameLocator('#preview-frame').locator('.fr-container');
      await expect(contenu).toBeVisible({ timeout: 20_000 });

      // 3. Le rendu produit des pixels, pas un titre seul. Mesure ATTENTISTE :
      //    les composants se peuplent apres le chargement du module, la source
      //    et l'evenement de bus — une mesure unique attraperait le `<h2>` seul.
      await expect
        .poll(() => contenu.evaluate((el) => el.getBoundingClientRect().height), {
          timeout: 20_000,
          message: 'l’apercu se limite a son titre',
        })
        .toBeGreaterThan(80);

      // 4. Les etiquettes piegeuses ont traverse intactes (#615).
      if (/podium|datalist/.test(type)) {
        await expect(
          page.frameLocator('#preview-frame').getByText("Val-d'Oise", { exact: false }).first()
        ).toBeVisible({ timeout: 20_000 });
      }

      expect(erreurs, `erreurs console pour ${type}`).toEqual([]);
    });
  }
});
