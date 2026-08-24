import { defineConfig } from '@playwright/test';

export default defineConfig({
  // testDir est résolu relativement à CE fichier (qui vit déjà dans e2e/) :
  // './e2e' pointait sur e2e/e2e/ (inexistant) → 0 test découvert (#352)
  testDir: '.',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      // capture-guide est un OUTIL de génération de captures pour
      // USER-GUIDE.md (parcours UI détaillés, à re-synchroniser à la main
      // après chaque évolution des apps), pas un test de régression — il est
      // exclu du run par défaut (#407). Lancement explicite :
      //   npx playwright test --config e2e/playwright.config.ts e2e/capture-guide.spec.ts
      testIgnore: [/.*\.db\.spec\.ts$/, /capture-guide\.spec\.ts$/],
    },
    {
      name: 'chromium-db',
      use: { browserName: 'chromium' },
      testMatch: /.*\.db\.spec\.ts$/,
    },
  ],
});
