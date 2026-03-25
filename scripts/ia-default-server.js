#!/usr/bin/env node
/**
 * Tiny HTTP server for server-side IA default config.
 * Runs on port 3003 in production (behind nginx).
 *
 * Endpoints:
 *   GET  /ia-server-config   — returns { available, apiUrl, model } (no token)
 *   POST /ia-proxy-default   — forwards to Albert API with server-side token injected
 */

const http = require('http');
const https = require('https');

const TOKEN = process.env.IA_DEFAULT_TOKEN || '';
const API_URL = process.env.IA_DEFAULT_API_URL || 'https://albert.api.etalab.gouv.fr/v1/chat/completions';
const MODEL = process.env.IA_DEFAULT_MODEL || 'albert-large';
const PORT = 3003;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

const server = http.createServer(async (req, res) => {
  // --- GET /ia-server-config ---
  if (req.url === '/ia-server-config' && req.method === 'GET') {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(
      TOKEN
        ? { available: true, apiUrl: API_URL, model: MODEL }
        : { available: false }
    ));
    return;
  }

  // --- OPTIONS /ia-proxy-default (CORS preflight) ---
  if (req.url === '/ia-proxy-default' && req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  // --- POST /ia-proxy-default ---
  if (req.url === '/ia-proxy-default' && req.method === 'POST') {
    cors(res);

    if (!TOKEN) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'IA default config not available (no token)' }));
      return;
    }

    const body = await readBody(req);

    // Force model to prevent abuse
    let parsed;
    try {
      parsed = JSON.parse(body.toString());
      parsed.model = MODEL;
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }

    const payload = JSON.stringify(parsed);
    const target = new URL(API_URL);
    const doRequest = target.protocol === 'https:' ? https.request : http.request;

    const proxyReq = doRequest({
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname + target.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${TOKEN}`,
        'Host': target.host,
      },
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
    });

    proxyReq.write(payload);
    proxyReq.end();
    return;
  }

  // --- Fallback ---
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[ia-default-server] Listening on 127.0.0.1:${PORT}`);
});
