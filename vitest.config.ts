import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // `import.meta.dirname` plutot que `__dirname` (#639) : ce dernier est
      // signale incompatible avec `configLoader: 'native'`, futur defaut de Vite.
      '@': resolve(import.meta.dirname, 'packages/core/src'),
      '@dsfr-data/shared': resolve(import.meta.dirname, 'packages/shared/src'),
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
        branches: 77,
        functions: 82,
        lines: 85,
      },
    },
  },
});
