import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { request as httpsRequest } from 'https';
import { request as httpRequest } from 'http';
import { existsSync, readFileSync, readdirSync } from 'fs';

// Load .env so IA_DEFAULT_* vars are available in server plugins
const rootEnv = loadEnv('development', __dirname, '');
for (const [key, val] of Object.entries(rootEnv)) {
  if (key.startsWith('IA_DEFAULT_') && !process.env[key]) {
    process.env[key] = val;
  }
}

export default defineConfig({
  esbuild: {
    keepNames: true,
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'packages/core/src/index.ts'),
      name: 'DsfrData',
      fileName: (format) => `dsfr-data.${format === 'es' ? 'esm' : format}.js`,
      formats: ['es', 'umd'],
    },
    // Prevent Vite from inlining the TopoJSON as base64 (105 KB)
    assetsInlineLimit: 0,
    rollupOptions: {
      external: [],
      output: {
        globals: {},
        // Keep the TopoJSON asset with a predictable name
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'packages/core/src'),
    },
  },
  server: {
    proxy: {
      // Le proxy /api est gere par le plugin 'api-proxy-silent' ci-dessous
      // pour eviter les logs ECONNREFUSED quand le backend ne tourne pas
      // Proxy pour Grist (docs.getgrist.com)
      '/grist-proxy': {
        target: 'https://docs.getgrist.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/grist-proxy/, ''),
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('cookie');
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
      // Proxy pour Grist numerique.gouv.fr
      '/grist-gouv-proxy': {
        target: 'https://grist.numerique.gouv.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/grist-gouv-proxy/, ''),
        secure: true,
        configure: (proxy) => {
          // Supprimer les headers qui déclenchent l'erreur "Credentials not supported"
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('cookie');
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
      // Proxy pour Albert API (IA)
      '/albert-proxy': {
        target: 'https://albert.api.etalab.gouv.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/albert-proxy/, ''),
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('cookie');
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
      // Proxy pour tabular-api.data.gouv.fr
      '/tabular-proxy': {
        target: 'https://tabular-api.data.gouv.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tabular-proxy/, ''),
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('cookie');
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
      // Proxy pour INSEE Melodi API
      '/insee-proxy': {
        target: 'https://api.insee.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/insee-proxy/, ''),
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('cookie');
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
      // Proxy générique pour les APIs externes (legacy, prefer /cors-proxy middleware)
      '/api-proxy': {
        target: '',
        changeOrigin: true,
        secure: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Lire l'URL cible depuis le header X-Target-URL
            const targetUrl = req.headers['x-target-url'] as string;
            if (targetUrl) {
              try {
                const url = new URL(targetUrl);
                options.target = url.origin;
                proxyReq.path = url.pathname + url.search;
                proxyReq.setHeader('host', url.host);
              } catch {
                console.error('Invalid target URL:', targetUrl);
              }
            }
          });
        },
      },
    },
  },
  plugins: [
    {
      name: 'guide-examples-list',
      // Serve a JSON list of HTML files in guide/examples/ for the dynamic menu
      configureServer(server) {
        server.middlewares.use('/guide/examples/_list.json', (_req, res) => {
          const examplesDir = resolve(__dirname, 'guide/examples');
          const files: { file: string; title: string }[] = [];
          if (existsSync(examplesDir)) {
            for (const f of readdirSync(examplesDir)) {
              if (!f.endsWith('.html')) continue;
              let title = f.replace(/\.html$/, '').replace(/[-_]/g, ' ');
              // Extract <title> from file if present
              try {
                const content = readFileSync(resolve(examplesDir, f), 'utf-8');
                const m = content.match(/<title>([^<]+)<\/title>/i);
                if (m) title = m[1].trim();
              } catch {
                /* ignore */
              }
              files.push({ file: f, title });
            }
          }
          files.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(files));
        });
      },
    },
    {
      name: 'dev-lib-redirect',
      // In dev, redirect requests for the built bundle to the TS source
      // so components work without running "npm run build" first.
      resolveId(id) {
        if (id.endsWith('dist/dsfr-data.esm.js')) {
          return resolve(__dirname, 'packages/core/src/index.ts');
        }
      },
    },
    {
      name: 'api-proxy-silent',
      // Proxy vers le backend Express (mode database).
      // Remplace le proxy Vite standard pour eviter les logs ECONNREFUSED
      // quand le backend ne tourne pas (cas normal en dev sans BDD).
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url || !req.url.startsWith('/api/')) return next();

          const proxyReq = httpRequest(
            {
              hostname: 'localhost',
              port: 3002,
              path: req.url,
              method: req.method,
              headers: { ...req.headers, host: 'localhost:3002' },
            },
            (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
              proxyRes.pipe(res);
            }
          );

          proxyReq.on('error', () => {
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Backend not running' }));
            }
          });

          req.pipe(proxyReq);
        });
      },
    },
    {
      name: 'dsfr-data-umd',
      // Serve the UMD bundle for grist-widgets pages (test-local.html, chart/, datalist/)
      configureServer(server) {
        const umdPath = resolve(__dirname, 'packages/core/dist/dsfr-data.umd.js');
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.endsWith('/lib/dsfr-data.umd.js')) {
            if (!existsSync(umdPath)) {
              res.statusCode = 404;
              res.end('UMD not found. Run "npm run build" first.');
              return;
            }
            res.setHeader('Content-Type', 'application/javascript');
            res.end(readFileSync(umdPath));
            return;
          }
          next();
        });
      },
    },
    {
      name: 'cors-proxy',
      configureServer(server) {
        // Proxy CORS generique pour dsfr-data-source use-proxy :
        // lit l'URL cible depuis le header X-Target-URL
        // et forwarde la requete cote serveur (contourne CORS)
        server.middlewares.use('/cors-proxy', (req, res) => {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Target-URL',
            });
            res.end();
            return;
          }

          const targetUrl = req.headers['x-target-url'] as string;
          if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing X-Target-URL header' }));
            return;
          }

          let parsed: URL;
          try {
            parsed = new URL(targetUrl);
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid X-Target-URL' }));
            return;
          }

          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            const body = Buffer.concat(chunks);
            const isHttps = parsed.protocol === 'https:';
            const doRequest = isHttps ? httpsRequest : httpRequest;

            const skipHeaders = new Set([
              'host',
              'connection',
              'x-target-url',
              'transfer-encoding',
              'origin',
              'referer',
            ]);
            const forwardHeaders: Record<string, string> = {};
            for (const [key, val] of Object.entries(req.headers)) {
              if (skipHeaders.has(key)) continue;
              if (val) forwardHeaders[key] = Array.isArray(val) ? val[0] : val;
            }
            forwardHeaders['host'] = parsed.host;
            if (body.length > 0) {
              forwardHeaders['content-length'] = String(body.length);
            }

            const proxyReq = doRequest(
              {
                hostname: parsed.hostname,
                port: parsed.port || (isHttps ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: req.method,
                headers: forwardHeaders,
              },
              (proxyRes) => {
                res.writeHead(proxyRes.statusCode || 500, {
                  ...proxyRes.headers,
                  'access-control-allow-origin': '*',
                });
                proxyRes.pipe(res);
              }
            );

            proxyReq.on('error', (err) => {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `CORS proxy error: ${err.message}` }));
            });

            if (body.length > 0) proxyReq.write(body);
            proxyReq.end();
          });
        });
      },
    },
    {
      name: 'ia-server-config',
      configureServer(server) {
        // GET /ia-server-config — returns default IA config (no token exposed)
        server.middlewares.use('/ia-server-config', (req, res) => {
          const token = process.env.IA_DEFAULT_TOKEN || '';
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(
            JSON.stringify(
              token
                ? {
                    available: true,
                    apiUrl:
                      process.env.IA_DEFAULT_API_URL ||
                      'https://albert.api.etalab.gouv.fr/v1/chat/completions',
                    model: process.env.IA_DEFAULT_MODEL || 'albert-large',
                  }
                : { available: false }
            )
          );
        });

        // POST /ia-proxy-default — proxy with server-side token injection
        server.middlewares.use('/ia-proxy-default', (req, res) => {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            });
            res.end();
            return;
          }

          const token = process.env.IA_DEFAULT_TOKEN || '';
          const apiUrl =
            process.env.IA_DEFAULT_API_URL ||
            'https://albert.api.etalab.gouv.fr/v1/chat/completions';
          const model = process.env.IA_DEFAULT_MODEL || 'albert-large';

          if (!token) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'IA default config not available' }));
            return;
          }

          let parsed: URL;
          try {
            parsed = new URL(apiUrl);
          } catch {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid IA_DEFAULT_API_URL' }));
            return;
          }

          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            const rawBody = Buffer.concat(chunks);

            let body: Record<string, unknown>;
            try {
              body = JSON.parse(rawBody.toString());
              body.model = model;
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON body' }));
              return;
            }

            const payload = JSON.stringify(body);
            const isHttps = parsed.protocol === 'https:';
            const doRequest = isHttps ? httpsRequest : httpRequest;

            const proxyReq = doRequest(
              {
                hostname: parsed.hostname,
                port: parsed.port || (isHttps ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Content-Length': String(Buffer.byteLength(payload)),
                  Authorization: `Bearer ${token}`,
                  Host: parsed.host,
                },
              },
              (proxyRes) => {
                res.writeHead(proxyRes.statusCode || 500, {
                  ...proxyRes.headers,
                  'access-control-allow-origin': '*',
                });
                proxyRes.pipe(res);
              }
            );

            proxyReq.on('error', (err) => {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
            });

            proxyReq.write(payload);
            proxyReq.end();
          });
        });
      },
    },
    {
      name: 'ia-proxy',
      configureServer(server) {
        // Proxy IA generique : lit l'URL cible depuis le header X-Target-URL
        // et forwarde la requete cote serveur (contourne CORS + CSP)
        server.middlewares.use('/ia-proxy', (req, res) => {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers':
                'Content-Type, Authorization, X-Target-URL, x-api-key, anthropic-version',
            });
            res.end();
            return;
          }

          const targetUrl = req.headers['x-target-url'] as string;
          if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing X-Target-URL header' }));
            return;
          }

          let parsed: URL;
          try {
            parsed = new URL(targetUrl);
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid X-Target-URL' }));
            return;
          }

          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            const body = Buffer.concat(chunks);
            const isHttps = parsed.protocol === 'https:';
            const doRequest = isHttps ? httpsRequest : httpRequest;

            const skipHeaders = new Set([
              'host',
              'connection',
              'x-target-url',
              'transfer-encoding',
              'origin',
              'referer',
            ]);
            const forwardHeaders: Record<string, string> = {};
            for (const [key, val] of Object.entries(req.headers)) {
              if (skipHeaders.has(key)) continue;
              if (val) forwardHeaders[key] = Array.isArray(val) ? val[0] : val;
            }
            forwardHeaders['host'] = parsed.host;
            if (body.length > 0) {
              forwardHeaders['content-length'] = String(body.length);
            }

            const proxyReq = doRequest(
              {
                hostname: parsed.hostname,
                port: parsed.port || (isHttps ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: req.method,
                headers: forwardHeaders,
              },
              (proxyRes) => {
                res.writeHead(proxyRes.statusCode || 500, {
                  ...proxyRes.headers,
                  'access-control-allow-origin': '*',
                });
                proxyRes.pipe(res);
              }
            );

            proxyReq.on('error', (err) => {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
            });

            if (body.length > 0) proxyReq.write(body);
            proxyReq.end();
          });
        });
      },
    },
  ],
});
