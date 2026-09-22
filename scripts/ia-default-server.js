#!/usr/bin/env node
/**
 * Tiny HTTP server for server-side IA default config.
 * Runs on port 3003 in production (behind nginx).
 *
 * Endpoints:
 *   GET  /ia-server-config   — returns { available, apiUrl, model } (no token)
 *   POST /ia-proxy-default   — forwards to Albert API with server-side token injected
 *
 * Plafond global (#999) : au-dela de IA_MAX_RPM appels acceptes par minute
 * glissante (defaut 10, tous utilisateurs confondus), /ia-proxy-default repond
 * 429 avec `Retry-After` (secondes entieres) SANS appeler l'amont. Module
 * partage avec le middleware de dev de vite.config.ts : ./lib/debit.cjs.
 *
 * Proxy d'entreprise (runtime) : si HTTP_PROXY/HTTPS_PROXY est défini au
 * niveau du conteneur (cf. docker-compose `environment:`), les appels
 * sortants vers l'API Albert sont routés via le proxy. NO_PROXY est honoré.
 * Cf. issue #168 — PR-4.
 */

const http = require('http');
const { request, EnvHttpProxyAgent, setGlobalDispatcher } = require('undici');
const { creerDebit, lireMaxRpm, reponseRefus } = require('./lib/debit.cjs');

const TOKEN = process.env.IA_DEFAULT_TOKEN || '';
const API_URL =
  process.env.IA_DEFAULT_API_URL || 'https://albert.api.etalab.gouv.fr/v1/chat/completions';
const MODEL = process.env.IA_DEFAULT_MODEL || 'openweight-large';
const PORT = 3003;
const MAX_RPM = lireMaxRpm(process.env.IA_MAX_RPM);
const debit = creerDebit({ maxParMinute: MAX_RPM });

// Active le proxy HTTP sortant si HTTP_PROXY ou HTTPS_PROXY est défini.
// EnvHttpProxyAgent lit HTTP_PROXY/HTTPS_PROXY/NO_PROXY (et variantes
// minuscules) directement depuis process.env. Sans variable, on n'installe
// aucun dispatcher : comportement strictement inchangé. Cf. issue #168 PR-4.
if (
  process.env.HTTP_PROXY ||
  process.env.HTTPS_PROXY ||
  process.env.http_proxy ||
  process.env.https_proxy
) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
  console.log(
    `[ia-default-server] Outbound proxy enabled ` +
      `(HTTPS_PROXY=${process.env.HTTPS_PROXY || process.env.https_proxy || ''}, ` +
      `NO_PROXY=${process.env.NO_PROXY || process.env.no_proxy || ''})`
  );
}

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

// nosemgrep: problem-based-packs.insecure-transport.js-node.using-http-server.using-http-server
const server = http.createServer(async (req, res) => {
  // --- GET /ia-server-config ---
  if (req.url === '/ia-server-config' && req.method === 'GET') {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify(
        TOKEN ? { available: true, apiUrl: API_URL, model: MODEL } : { available: false }
      )
    );
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

    // Plafond global (#999) : refuse AVANT tout appel amont.
    const jeton = debit.tenter();
    if (!jeton.ok) {
      console.log(
        `[ia-default-server] ${new Date().toISOString()} LOCAL-RATE-LIMIT ` +
          `max=${MAX_RPM}/min retry-after=${jeton.retryAfter}s`
      );
      const refus = reponseRefus(jeton.retryAfter);
      res.writeHead(refus.status, refus.headers);
      res.end(refus.body);
      return;
    }

    const payload = JSON.stringify(parsed);

    // Observabilite du volume/taille des echanges (diagnostic rate-limit 429).
    // Log compact : nb messages, taille payload, presence/nb de tools.
    const msgCount = Array.isArray(parsed.messages) ? parsed.messages.length : 0;
    const toolCount = Array.isArray(parsed.tools) ? parsed.tools.length : 0;
    const kb = (Buffer.byteLength(payload) / 1024).toFixed(1);
    const t0 = Date.now();

    try {
      // undici.request honore le dispatcher global (EnvHttpProxyAgent si
      // HTTP_PROXY/HTTPS_PROXY est défini). Sans, requête directe.
      const upstream = await request(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`,
        },
        body: payload,
      });
      const status = upstream.statusCode || 500;
      const retryAfter = upstream.headers['retry-after'];
      // Une ligne par appel Albert : statut, latence, taille, volume conversationnel.
      console.log(
        `[ia-default-server] ${new Date().toISOString()} upstream=${status} ` +
          `${Date.now() - t0}ms payload=${kb}KB messages=${msgCount} tools=${toolCount}` +
          (status === 429 ? ` RATE-LIMIT retry-after=${retryAfter || 'n/a'}` : '')
      );
      res.writeHead(status, {
        'Content-Type': upstream.headers['content-type'] || 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      upstream.body.pipe(res);
    } catch (err) {
      console.error(`[ia-default-server] proxy error after ${Date.now() - t0}ms: ${err.message}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
    }
    return;
  }

  // --- Fallback ---
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[ia-default-server] Listening on 127.0.0.1:${PORT} (IA_MAX_RPM=${MAX_RPM})`);
});
