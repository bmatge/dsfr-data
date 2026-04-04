import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { request as httpsRequest } from 'https';
import { request as httpRequest } from 'http';

// Load .env from project root so IA_DEFAULT_* vars are available in server plugins
const rootEnv = loadEnv('development', resolve(__dirname, '../..'), '');
for (const [key, val] of Object.entries(rootEnv)) {
  if (key.startsWith('IA_DEFAULT_') && !process.env[key]) {
    process.env[key] = val;
  }
}

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
      '/albert-proxy': {
        target: 'https://albert.api.etalab.gouv.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/albert-proxy/, ''),
        secure: true,
      },
    },
  },
  plugins: [
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

            // Force model in request body
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
        // Generic IA proxy: reads target URL from X-Target-URL header
        // and forwards the request server-side (bypasses CORS + CSP)
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
