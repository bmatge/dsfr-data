/**
 * Configuration de vite-node pour le banc du Studio (#1112).
 *
 * Memes alias que `vitest.config.ts` : `@dsfr-data/shared` pointe sur les
 * SOURCES, pas sur `packages/shared/dist`. Le banc mesure ainsi le code de la
 * branche, sans dependre d'un `build:shared` a jour.
 */
import { defineConfig } from 'vite';
import { resolve } from 'path';

const racine = resolve(import.meta.dirname, '../..');

export default defineConfig({
  root: racine,
  resolve: {
    alias: {
      '@': resolve(racine, 'packages/core/src'),
      '@dsfr-data/shared': resolve(racine, 'packages/shared/src'),
    },
  },
});
