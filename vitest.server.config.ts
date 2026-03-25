import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@dsfr-data/shared': resolve(__dirname, 'packages/shared/src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/server/**/*.test.ts'],
    pool: 'forks',
    testTimeout: 15000,
    fileParallelism: false, // Run test files sequentially (shared DB)
  },
});
