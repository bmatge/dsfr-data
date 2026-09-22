/**
 * Banc « zone visible » simulee (#1023) — configuration AUTONOME.
 *
 * Ne reutilise pas le serveur de dev (5173) : la page d'exactitude est servie
 * en statique par `python3 -m http.server` sur le port 5191, demarre et arrete
 * par Playwright. Voir README.md.
 */
import { defineConfig } from '@playwright/test';
import { PORT } from './commun';

export default defineConfig({
  testDir: '.',
  testMatch: /banc\.spec\.ts$/,
  outputDir: './out/test-results',
  timeout: 20 * 60_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  globalSetup: './setup.ts',
  globalTeardown: './rapport.ts',
  use: { headless: true, browserName: 'chromium' },
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    cwd: './page',
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
