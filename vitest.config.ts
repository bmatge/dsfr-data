import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@dsfr-data/shared': resolve(__dirname, 'packages/shared/src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/server/**'],
    pool: 'threads',
    testTimeout: 10000,
    server: {
      deps: {
        inline: [/lit/, /@lit/],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/components/layout/**'],
      reporter: ['text', 'html'],
      all: true,
    },
  },
});
