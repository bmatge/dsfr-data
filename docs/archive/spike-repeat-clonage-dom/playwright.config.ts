import { defineConfig } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * SPIKE #889 — config JETABLE. Port dédié (5197) pour ne jamais réutiliser
 * le serveur de dev d'un autre worktree (le `reuseExistingServer` de la
 * config e2e principale servirait les sources d'un autre checkout).
 *
 *   npx playwright test --config e2e/spike-repeat/playwright.config.ts
 */
const PORT = 5197;

export default defineConfig({
  testDir: '.',
  testMatch: /spike\.spec\.ts$/,
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    browserName: 'chromium',
  },
  webServer: {
    command: `NODE_ENV=production npx vite-node e2e/spike-repeat/build.ts && npx vite --port ${PORT} --strictPort`,
    cwd: resolve(here, '../..'),
    port: PORT,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
