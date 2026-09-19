import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  // `api-fixtures.test.ts` vit dans ce dossier mais releve de vitest : sans ce
  // filtre, Playwright le ramasse et la commande documentee plante avant le
  // premier test (« Cannot read properties of undefined (reading 'config') »).
  //
  // Les fichiers `*.tool.ts` sont des OUTILS sans aucune assertion (#867) :
  // ils impriment ou ils generent un rapport, et passent toujours au vert,
  // y compris quand le Builder n'a rien genere. Les compter comme de la
  // couverture etait une illusion — ils restent lancables a la demande :
  //   BUILDER_E2E_OUTILS=1 npx playwright test --config … builder-exhaustive
  testMatch: process.env.BUILDER_E2E_OUTILS ? /.*\.(spec|tool)\.ts$/ : /.*\.spec\.ts$/,
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
