import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname),
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@dsfr-data/shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    proxy: {
      '/grist-proxy': {
        target: 'https://docs.getgrist.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/grist-proxy/, ''),
        secure: true,
      },
      '/grist-gouv-proxy': {
        target: 'https://grist.numerique.gouv.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/grist-gouv-proxy/, ''),
        secure: true,
      },
      '/tabular-proxy': {
        target: 'https://tabular-api.data.gouv.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tabular-proxy/, ''),
        secure: true,
      },
    },
  },
});
