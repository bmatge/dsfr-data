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
      // `packages/shared/src` etait hors seuil alors que la lib y vit autant que
      // dans core (debug/, compute, pivot, join, export-html) : rien n'empechait
      // sa couverture de s'eroder (revue du 2026-09-13). Mesure a l'ajout :
      // 89.6 / 83.7 / 91.8 / 91.2 — les seuils tiennent sans etre abaisses.
      include: ['packages/core/src/**/*.ts', 'packages/shared/src/**/*.ts'],
      exclude: [
        'packages/core/src/index.ts',
        'packages/core/src/index-*.ts',
        'packages/core/src/components/layout/**',
        'packages/shared/src/index.ts',
        'packages/shared/src/lib.ts',
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
