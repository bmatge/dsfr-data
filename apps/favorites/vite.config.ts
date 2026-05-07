import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname),
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // The favorites app exposes two HTML entry points :
      //   - index.html       : authenticated favorites manager
      //   - public-view.html : anonymous public-share viewer (issue #148)
      input: {
        index: resolve(__dirname, 'index.html'),
        publicView: resolve(__dirname, 'public-view.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@dsfr-data/shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
});
