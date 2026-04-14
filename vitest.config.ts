import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'packages/core/src'),
      '@dsfr-data/shared': resolve(__dirname, 'packages/shared/src'),
    },
  },
  test: {
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: {
        url: 'http://localhost/',
      },
    },
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
      include: ['packages/core/src/**/*.ts'],
      exclude: [
        'packages/core/src/index.ts',
        'packages/core/src/index-*.ts',
        'packages/core/src/components/layout/**',
      ],
      reporter: ['text', 'html'],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
  },
});
