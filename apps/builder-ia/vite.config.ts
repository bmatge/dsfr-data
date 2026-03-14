import { defineConfig } from 'vite';
import { resolve } from 'path';
import { request as httpsRequest } from 'https';
import { request as httpRequest } from 'http';

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
    }
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
      name: 'ia-proxy',
      configureServer(server) {
        // Generic IA proxy: reads target URL from X-Target-URL header
        // and forwards the request server-side (bypasses CORS + CSP)
        server.middlewares.use('/ia-proxy', (req, res) => {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Target-URL, x-api-key, anthropic-version',
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

            const skipHeaders = new Set(['host', 'connection', 'x-target-url', 'transfer-encoding', 'origin', 'referer']);
            const forwardHeaders: Record<string, string> = {};
            for (const [key, val] of Object.entries(req.headers)) {
              if (skipHeaders.has(key)) continue;
              if (val) forwardHeaders[key] = Array.isArray(val) ? val[0] : val;
            }
            forwardHeaders['host'] = parsed.host;
            if (body.length > 0) {
              forwardHeaders['content-length'] = String(body.length);
            }

            const proxyReq = doRequest({
              hostname: parsed.hostname,
              port: parsed.port || (isHttps ? 443 : 80),
              path: parsed.pathname + parsed.search,
              method: req.method,
              headers: forwardHeaders,
            }, (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 500, {
                ...proxyRes.headers,
                'access-control-allow-origin': '*',
              });
              proxyRes.pipe(res);
            });

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
