import { defineConfig } from '@playwright/test';

/**
 * Extensions ramassees par Playwright. Trois familles cohabitent dans ce
 * dossier, et deux d'entre elles ne sont PAS de la couverture :
 *
 *  - `*.spec.ts`    — les specs, seule famille ramassee par defaut ;
 *  - `*.tool.ts`    — des OUTILS sans aucune assertion (#867) : ils impriment
 *    ou ils generent un rapport, et passent toujours au vert, y compris quand
 *    le Builder n'a rien genere ;
 *  - `*.archive.ts` — les specs HISTORIQUES du Builder (#868). Ils assertent,
 *    eux, mais ils pilotent l'UI par ses `id` HTML et par des
 *    `waitForTimeout` fixes : chaque refonte les decale, et 56 de leurs
 *    72 cas sont rouges. Archives plutot que supprimes — leur contenu reste
 *    la trace de ce qui etait couvert, et `typecheck:tests` continue de les
 *    compiler.
 *
 * `api-fixtures.test.ts` vit aussi ici mais releve de vitest : sans ce filtre,
 * Playwright le ramasse et la commande documentee plante avant le premier test
 * (« Cannot read properties of undefined (reading 'config') »).
 *
 * Les deux familles exclues restent lancables a la demande :
 *   BUILDER_E2E_OUTILS=1   npx playwright test --config … builder-exhaustive
 *   BUILDER_E2E_ARCHIVES=1 npx playwright test --config … quick-audit
 */
const extensionsRamassees = ['spec'];
if (process.env.BUILDER_E2E_OUTILS) extensionsRamassees.push('tool');
if (process.env.BUILDER_E2E_ARCHIVES) extensionsRamassees.push('archive');

export default defineConfig({
  testDir: '.',
  testMatch: new RegExp(`.*\\.(${extensionsRamassees.join('|')})\\.ts$`),
  timeout: 120_000,
  retries: 0,
  workers: 1, // Sequential: shared results array + avoid port conflicts
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: './report' }],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    screenshot: 'off', // We take manual screenshots
    trace: 'off',
  },
  projects: [
    {
      name: 'builder-exhaustive',
      use: { browserName: 'chromium' },
    },
  ],
  // Tous les specs sauf `export-html-api-recette` (qui sert tout par
  // `page.route()`) demandent le serveur de dev. Playwright le demarre
  // lui-meme, et REUTILISE celui qui tourne deja : l'habitude locale
  // (`npm run dev` dans un autre terminal) est preservee, et le workflow
  // `builder-e2e.yml` n'a rien a lancer de son cote (#869).
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
