import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
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
  // Requires the main dev server (npm run dev) for API proxy support.
  // Start it manually before running tests, or uncomment webServer below:
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: true,
  //   timeout: 30_000,
  // },
});
