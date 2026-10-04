// Faux amont du banc de conformance du relais (ADR-155, docs/RELAY.md §7).
//
// Un serveur HTTP local qui joue TOUS les hôtes du profil de conformance : il
// note ce qu'il reçoit (hôte, méthode, URL brute, en-têtes, taille du corps) et
// répond selon le chemin. Il est volontairement hostile : chaque réponse porte
// des en-têtes qu'un relais conforme ne doit jamais laisser passer.
//
// Aucun domaine réel : `.test` est réservé (RFC 6761) et ne se résout nulle part.

import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { clearTimeout, setTimeout } from 'node:timers';
import { Buffer } from 'node:buffer';

export const ALLOWED_HOST = 'ouvert.conformance.test';
export const SECOND_HOST = 'second.conformance.test';
export const KEYED_HOST = 'cle.conformance.test';
export const FORBIDDEN_HOST = 'interdit.conformance.test';

/** En-têtes que l'amont pose et que le relais doit retenir (C-NAV-1). */
const HOSTILE_HEADERS = {
  'Set-Cookie': 'session=temoin-amont; Path=/; HttpOnly',
  Vary: 'Cookie, Host, Accept-Language',
  'Access-Control-Allow-Origin': 'https://amont.conformance.test',
  'Access-Control-Allow-Credentials': 'true',
  'X-RateLimit-Limit': '50000',
  'X-RateLimit-Remaining': '49999',
  'Cache-Control': 'private, max-age=1',
  Server: 'amont-factice',
  'X-Powered-By': 'amont-factice',
};

// Les cibles REFUSÉES portent `/suivie-` ou `/secret` dans leur chemin : le banc
// route tous les hôtes vers ce faux amont, si bien qu'un relais qui suivrait
// l'une d'elles à l'aveugle y laisserait une requête reconnaissable. Exiger 502
// ne suffit pas : un relais qui suit une redirection vers une adresse morte
// répond 502 lui aussi.
const REDIRECTIONS = {
  interdit: `https://${FORBIDDEN_HOST}/secret.json`,
  http: `http://${ALLOWED_HOST}/suivie-http.json`,
  port: `https://${ALLOWED_HOST}:8443/suivie-port.json`,
  ip: 'https://127.0.0.1/suivie-ip.json',
  metadonnees: 'https://169.254.169.254/latest/meta-data/suivie-metadonnees',
  identifiants: `https://utilisateur:motdepasse@${ALLOWED_HOST}/suivie-identifiants.json`,
  'hors-prefixe': '/api/prive/secret.json',
  remontee: `https://${KEYED_HOST}/api/public/../prive/secret.json`,
  // Chemins que l'analyse d'une URL ne normalise PAS : seul un contrôle du
  // chemin de la redirection, le même que pour la requête, les arrête.
  'chemin-encode': '/api/public/..%2fprive/secret.json',
  'chemin-parametre': '/api/public/..;/prive/secret.json',
  'chemin-double': '/api/public//prive/secret.json',
  second: `https://${SECOND_HOST}/donnees.json?depuis=redirection`,
  relative: '/donnees.json?depuis=redirection-relative',
  // Formes que l'analyse d'une URL normalise : même hôte, même port.
  majuscules: `https://${SECOND_HOST.toUpperCase()}/donnees.json?depuis=majuscules`,
  'port-explicite': `https://${SECOND_HOST}:443/donnees.json?depuis=port-explicite`,
};

/** Types de contenu hors liste blanche, dont ceux qu'une comparaison par préfixe laisserait passer. */
const FORBIDDEN_TYPES = {
  'json-xml': 'application/json+xml',
  'json-prolonge': 'application/jsonx',
  jsonp: 'application/jsonp',
  xhtml: 'application/xhtml+xml',
  xml: 'text/xml',
  'csv-prolonge': 'text/csvx',
  liste: 'application/json, text/html',
  octets: 'application/octet-stream',
};

/**
 * @param {{ port?: number, delayMs: number, bigBytes: number, hopDelayMs?: number }} options
 *   `hopDelayMs` : attente avant chaque saut de `/redirection/lente/<n>`
 */
export async function startFakeUpstream({ port = 0, delayMs, bigBytes, hopDelayMs = delayMs }) {
  /** @type {{ host: string | undefined, method: string | undefined, url: string, headers: import('node:http').IncomingHttpHeaders, bodyBytes: number }[]} */
  const requests = [];
  /** @type {Map<string, number>} */
  const counters = new Map();
  /** @type {{ sent: number, total: number, closedEarly: boolean }[]} */
  const bigStreams = [];
  /** @type {Set<ReturnType<typeof setTimeout>>} */
  const timers = new Set();

  const hit = (key) => {
    const value = (counters.get(key) ?? 0) + 1;
    counters.set(key, value);
    return value;
  };

  const json = (res, status, payload, extra = {}) => {
    const body = Buffer.from(JSON.stringify(payload));
    res.writeHead(status, {
      ...HOSTILE_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      ...extra,
    });
    res.end(body);
  };

  const server = http.createServer((req, res) => {
    const record = {
      host: req.headers.host,
      method: req.method,
      url: req.url ?? '',
      headers: req.headers,
      bodyBytes: 0,
    };
    requests.push(record);
    req.on('data', (chunk) => {
      record.bodyBytes += chunk.length;
    });

    const url = req.url ?? '';
    const path = url.split('?', 1)[0];
    const counterKey = `${req.headers.host}${url}`;

    if (path.endsWith('/compteur')) {
      json(res, 200, { n: hit(counterKey) });
      return;
    }
    if (path === '/geo.geojson') {
      const body = '{"type":"FeatureCollection","features":[]}';
      res.writeHead(200, { ...HOSTILE_HEADERS, 'Content-Type': 'application/geo+json' });
      res.end(body);
      return;
    }
    if (path === '/table.csv') {
      res.writeHead(200, { ...HOSTILE_HEADERS, 'Content-Type': 'text/csv; charset=utf-8' });
      res.end('code;libelle\n01;Ain\n');
      return;
    }
    if (path === '/page.html') {
      res.writeHead(200, { ...HOSTILE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><script>document.title="amont"</script>');
      return;
    }
    if (path === '/image.svg') {
      res.writeHead(200, { ...HOSTILE_HEADERS, 'Content-Type': 'image/svg+xml' });
      res.end('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
      return;
    }
    if (path === '/script.js') {
      res.writeHead(200, { ...HOSTILE_HEADERS, 'Content-Type': 'text/javascript' });
      res.end('globalThis.amont = 1;');
      return;
    }
    const forbiddenType = /^\/type\/([a-z-]+)$/.exec(path);
    if (forbiddenType && Object.hasOwn(FORBIDDEN_TYPES, forbiddenType[1])) {
      res.writeHead(200, { ...HOSTILE_HEADERS, 'Content-Type': FORBIDDEN_TYPES[forbiddenType[1]] });
      res.end('{"type":"hors liste blanche"}');
      return;
    }
    if (path === '/sans-type') {
      res.writeHead(200, HOSTILE_HEADERS);
      res.end('{"sans":"type"}');
      return;
    }
    if (path === '/etag.json') {
      json(
        res,
        200,
        { etag: true },
        { ETag: '"version-1"', 'Last-Modified': 'Thu, 01 Oct 2026 08:00:00 GMT' }
      );
      return;
    }
    if (path === '/compresse.json') {
      const body = gzipSync(Buffer.from('{"compresse":true}'));
      res.writeHead(200, {
        ...HOSTILE_HEADERS,
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Content-Length': body.length,
      });
      res.end(body);
      return;
    }
    if (path.endsWith('/cle-nue.json')) {
      // Variante : la clé seule, sans le préfixe (« Apikey  ») que le relais lui ajoute.
      json(res, 200, {
        cle: String(req.headers.authorization ?? '')
          .split(' ')
          .pop(),
      });
      return;
    }
    if (path.endsWith('/cle-etag.json')) {
      // La clé reçue, renvoyée dans un en-tête que le relais transmet au navigateur.
      const key = String(req.headers.authorization ?? '')
        .split(' ')
        .pop();
      json(res, 200, { fuite: 'etag' }, { ETag: `"${key}"` });
      return;
    }
    if (path.endsWith('/cle-charset.json')) {
      const key = String(req.headers.authorization ?? '')
        .split(' ')
        .pop();
      json(res, 200, { fuite: 'charset' }, { 'Content-Type': `application/json; charset=${key}` });
      return;
    }
    if (path === '/etag-hostile.json') {
      json(
        res,
        200,
        { etag: 'hostile' },
        { ETag: 'sans-guillemets <script>alert(1)</script>', 'Last-Modified': 'demain matin' }
      );
      return;
    }
    if (path === '/charset-hostile.json') {
      json(
        res,
        200,
        { charset: 'hostile' },
        { 'Content-Type': 'application/json; charset="><script>alert(1)</script>' }
      );
      return;
    }
    if (path.endsWith('/reflet.json')) {
      // Un amont de débogage qui renvoie les en-têtes reçus, clé comprise.
      json(res, 200, { recu: req.headers });
      return;
    }
    if (path === '/lent') {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!res.destroyed) json(res, 200, { lent: true });
      }, delayMs);
      timers.add(timer);
      return;
    }
    if (path === '/gros') {
      // Flux sans longueur déclarée, bien plus long que le plafond du relais.
      const stream = { sent: 0, total: bigBytes, closedEarly: false };
      bigStreams.push(stream);
      res.writeHead(200, { ...HOSTILE_HEADERS, 'Content-Type': 'application/json' });
      const chunk = Buffer.alloc(64 * 1024, 0x20);
      let closed = false;
      res.on('close', () => {
        closed = true;
        stream.closedEarly = stream.sent < stream.total;
      });
      const pump = () => {
        while (!closed && stream.sent < stream.total) {
          stream.sent += chunk.length;
          if (!res.write(chunk)) {
            res.once('drain', pump);
            return;
          }
        }
        if (!closed) res.end();
      };
      pump();
      return;
    }
    if (path === '/gros-declare') {
      res.writeHead(200, {
        ...HOSTILE_HEADERS,
        'Content-Type': 'application/json',
        'Content-Length': bigBytes,
      });
      res.write('{"debut":true');
      return;
    }
    if (path.endsWith('/instable')) {
      if (hit(counterKey) === 1) json(res, 500, { erreur: 'panne' });
      else json(res, 200, { retabli: true });
      return;
    }
    if (path.endsWith('/fragile')) {
      // L'inverse d'`/instable` : une bonne réponse, puis la panne.
      if (hit(counterKey) === 1) json(res, 200, { avant: 'la panne' });
      else json(res, 500, { erreur: 'panne' });
      return;
    }
    if (path.endsWith('/sollicite')) {
      if (hit(counterKey) === 1) json(res, 429, { erreur: 'quota' }, { 'Retry-After': '7' });
      else json(res, 200, { retabli: true });
      return;
    }
    const sequence = /\/suite\/([\d-]+)$/.exec(path);
    if (sequence) {
      // Une suite de statuts, un par appel ; le dernier se répète.
      const statuses = sequence[1].split('-').map(Number);
      const index = hit(counterKey);
      const current = statuses[Math.min(index, statuses.length) - 1];
      json(res, current, { suite: index, statut: current });
      return;
    }
    const status = /\/statut\/(\d{3})$/.exec(path);
    if (status) {
      hit(counterKey);
      json(res, Number(status[1]), { statut: Number(status[1]) });
      return;
    }
    const chain = /\/redirection\/chaine\/(\d)$/.exec(path);
    if (chain) {
      const remaining = Number(chain[1]);
      if (remaining === 0) json(res, 200, { chaine: 'arrivee' });
      else {
        res.writeHead(302, {
          ...HOSTILE_HEADERS,
          Location: `/redirection/chaine/${remaining - 1}`,
        });
        res.end();
      }
      return;
    }
    const slowChain = /\/redirection\/lente\/(\d)$/.exec(path);
    if (slowChain) {
      // Chaque saut répond dans le délai du relais ; leur SOMME le dépasse.
      const remaining = Number(slowChain[1]);
      if (remaining === 0) {
        json(res, 200, { lente: 'arrivee' });
        return;
      }
      const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (res.destroyed) return;
        res.writeHead(302, {
          ...HOSTILE_HEADERS,
          Location: `/redirection/lente/${remaining - 1}${query}`,
        });
        res.end();
      }, hopDelayMs);
      timers.add(timer);
      return;
    }
    if (path.endsWith('/redirection/ip-joignable')) {
      // Une adresse de boucle locale où quelque chose ÉCOUTE (ce faux amont) :
      // le relais qui suivrait y laisse une trace.
      const local = server.address();
      const localPort = typeof local === 'object' && local ? local.port : 0;
      res.writeHead(302, {
        ...HOSTILE_HEADERS,
        Location: `http://127.0.0.1:${localPort}/suivie-ip-joignable.json`,
      });
      res.end();
      return;
    }
    if (path.endsWith('/redirection/boucle')) {
      res.writeHead(302, { ...HOSTILE_HEADERS, Location: url });
      res.end();
      return;
    }
    const redirection = /\/redirection\/([a-z-]+)$/.exec(path);
    if (redirection && Object.hasOwn(REDIRECTIONS, redirection[1])) {
      res.writeHead(302, { ...HOSTILE_HEADERS, Location: REDIRECTIONS[redirection[1]] });
      res.end();
      return;
    }

    // Tout autre chemin : une réponse JSON qui dit ce que l'amont a reçu.
    json(res, 200, { hote: req.headers.host, chemin: url });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(undefined));
  });
  const address = server.address();

  return {
    port: typeof address === 'object' && address ? address.port : port,
    requests,
    bigStreams,
    /** Requêtes reçues dont l'URL contient `marker`. */
    seen(marker) {
      return requests.filter((request) => request.url.includes(marker));
    },
    async close() {
      for (const timer of timers) clearTimeout(timer);
      server.closeAllConnections();
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    },
  };
}
