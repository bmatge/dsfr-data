import { defineConfig } from 'vite';
import { resolve } from 'path';
import { cpSync, mkdirSync, existsSync, readFileSync } from 'fs';

const umdSource = resolve(__dirname, '../../dist/dsfr-data.umd.js');

export default defineConfig({
  root: resolve(__dirname),
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        chart: resolve(__dirname, 'chart/index.html'),
        datalist: resolve(__dirname, 'datalist/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@dsfr-data/shared': resolve(__dirname, '../../packages/shared/src'),
    }
  },
  plugins: [
    {
      name: 'dsfr-data-umd',
      // Dev : sert le UMD a /lib/dsfr-data.umd.js
      configureServer(server) {
        server.middlewares.use('/lib/dsfr-data.umd.js', (_req, res) => {
          if (!existsSync(umdSource)) {
            res.statusCode = 404;
            res.end('UMD not found. Run "npm run build" at root first.');
            return;
          }
          res.setHeader('Content-Type', 'application/javascript');
          res.end(readFileSync(umdSource));
        });
      },
      // Build : copie le UMD dans dist/lib/ et le manifest.json
      closeBundle() {
        const libDir = resolve(__dirname, 'dist/lib');
        if (!existsSync(libDir)) {
          mkdirSync(libDir, { recursive: true });
        }
        if (existsSync(umdSource)) {
          cpSync(umdSource, resolve(libDir, 'dsfr-data.umd.js'));
        }
        const manifest = resolve(__dirname, 'manifest.json');
        if (existsSync(manifest)) {
          cpSync(manifest, resolve(__dirname, 'dist/manifest.json'));
        }
      },
    },
  ],
  server: {
    fs: {
      allow: [resolve(__dirname, '../..')]
    }
  }
});
