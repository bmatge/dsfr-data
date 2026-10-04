// Relais cachable (ADR-155) — le serveur HTTP du relais de référence.
//
// Contrat : docs/RELAY.md. Modules `node:` seuls, aucune dépendance.
//
// Le relais n'est PAS un proxy ouvert et ne remplace pas `/cors-proxy` :
// lecture seule, hôtes de la liste blanche uniquement, clé détenue ici.
//
// `createRelay(config, deps)` : `deps` permet au banc de tests de substituer la
// résolution DNS, la connexion, l'horloge et le journal. `server.mjs`, le point
// d'entrée de production, n'en passe AUCUN : aucune variable d'environnement,
// aucun champ de configuration ne peut désactiver une défense.

import http from 'node:http';
import process from 'node:process';
import { isIP } from 'node:net';
import { Buffer } from 'node:buffer';
import { rateLimitKey } from './addresses.mjs';
import { MemoryCache } from './cache.mjs';
import { RateLimiter } from './rate-limit.mjs';
import { RelayError, isUnderPrefix, parseTarget } from './target.mjs';
import { createTlsConnector, defaultResolve, fetchUpstream } from './upstream.mjs';

const ALLOWED_METHODS = 'GET, HEAD, OPTIONS';

/**
 * En-têtes posés sur TOUTE réponse, erreurs comprises (C-NAV-2, C-NAV-4).
 * Sans l'en-tête CORS, le navigateur ne voit d'une erreur qu'un `TypeError`.
 */
const COMMON_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
});

/** Messages d'erreur : texte FIXE par code. Rien de la requête ni de l'amont n'y entre. */
const MESSAGES = Object.freeze({
  'invalid-url': "L'URL de la requête n'est pas une URL de relais valide.",
  'invalid-path': 'Le chemin contient une séquence refusée (remontée, barre double, encodage).',
  'invalid-query': 'La requête contient un caractère de contrôle encodé.',
  'not-found': "Cette adresse n'est pas une route du relais.",
  'url-too-long': "L'URL dépasse la longueur acceptée par le relais.",
  'host-not-allowed': "Cet hôte n'est pas dans la liste blanche du relais.",
  'path-not-allowed': "Ce chemin n'est pas autorisé pour cet hôte.",
  'method-not-allowed': 'Le relais est en lecture seule : GET, HEAD ou OPTIONS.',
  'body-not-allowed': "Le relais n'accepte aucun corps de requête.",
  'rate-limited': 'Trop de requêtes depuis cette adresse.',
  'relay-busy': 'Le relais est momentanément saturé.',
  'relay-error': 'Erreur interne du relais.',
  'upstream-unreachable': "Le service amont n'a pas pu être joint.",
  'upstream-address-forbidden': "L'hôte autorisé se résout vers une adresse refusée.",
  'upstream-timeout': "Le service amont n'a pas répondu dans le délai.",
  'upstream-error': 'Le service amont a répondu une erreur.',
  'upstream-too-large': 'La réponse du service amont dépasse la taille acceptée.',
  'upstream-content-type': 'Le service amont a répondu un type de contenu non autorisé.',
  'upstream-encoding': 'Le service amont a répondu un encodage non demandé.',
  'upstream-redirect-refused': 'Le service amont a répondu une redirection non autorisée.',
  'upstream-leak': "La réponse du service amont a été retenue : elle contenait la clé d'accès.",
  'upstream-rate-limited': 'Le service amont limite le débit.',
  'upstream-forbidden': "Le service amont refuse l'accès.",
  'upstream-not-found': 'Le service amont ne connaît pas cette ressource.',
  'upstream-rejected': 'Le service amont a refusé la requête.',
});

/** Échecs de l'amont pour lesquels une réponse périmée vaut mieux qu'une erreur. */
function isUpstreamFailure(error) {
  if (!(error instanceof RelayError)) return false;
  return error.status >= 502 || error.code === 'upstream-rate-limited';
}

/** Journal par défaut : une ligne JSON par requête sur la sortie standard. */
function defaultLog(record) {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

/**
 * @param {object} config configuration validée (config.mjs)
 * @param {{
 *   resolve?: (hostname: string) => Promise<{ address: string, family: number }[]>,
 *   connect?: (target: { address: string, family: number, hostname: string }) => import('node:net').Socket,
 *   now?: () => number,
 *   log?: (record: Record<string, unknown>) => void,
 * }} [deps]
 */
export function createRelay(config, deps = {}) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? defaultLog;
  const upstreamDeps = {
    resolve: deps.resolve ?? defaultResolve,
    connect: deps.connect ?? createTlsConnector(),
  };

  const cache = new MemoryCache({
    maxBytes: config.limits.cacheMaxBytes,
    maxEntries: config.limits.cacheMaxEntries,
  });
  const limiter = new RateLimiter({
    requests: config.limits.rateLimitRequests,
    windowSeconds: config.limits.rateLimitWindowSeconds,
  });
  const trustedProxies = new Set(config.trustedProxies);
  /** Requêtes vers l'amont en cours, par clé de cache : N visiteurs, une seule requête. */
  const inFlight = new Map();

  /**
   * Adresse du visiteur, pour la SEULE limite de débit. Elle n'est ni transmise
   * à l'amont, ni écrite dans une réponse, ni journalisée.
   * `X-Forwarded-For` n'est lu que si la connexion vient d'un mandataire de
   * confiance déclaré ; on en prend alors la dernière valeur, celle qu'il a posée.
   */
  function clientAddress(req) {
    const peer = (req.socket.remoteAddress ?? '').replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
    if (!trustedProxies.has(peer)) return peer;
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded !== 'string') return peer;
    const last = forwarded.split(',').pop()?.trim() ?? '';
    return isIP(last) !== 0 ? last : peer;
  }

  function sendError(req, res, error) {
    const known = error instanceof RelayError && Object.hasOwn(MESSAGES, error.code);
    const status = known ? error.status : 500;
    const code = known ? error.code : 'relay-error';
    const body = Buffer.from(JSON.stringify({ error: code, message: MESSAGES[code] }));
    /** @type {Record<string, string | number>} */
    const headers = {
      ...COMMON_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      // Une erreur n'est jamais mise en cache : « Réessayer » rejoue la même URL.
      'Cache-Control': 'no-store',
    };
    if (status === 405) headers.Allow = ALLOWED_METHODS;
    if (known && error.retryAfter !== undefined) headers['Retry-After'] = String(error.retryAfter);
    // La requête n'a pas forcément été lue jusqu'au bout (corps refusé) : on ferme.
    if (status === 400 || status === 405) headers.Connection = 'close';
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
    return { status, code, bytes: body.length };
  }

  function sendEntry(req, res, entry, state, hostConfig) {
    /** @type {Record<string, string | number>} */
    const headers = {
      ...COMMON_HEADERS,
      'Content-Type': entry.contentType,
      'Content-Length': entry.body.length,
      'Cache-Control': `public, max-age=${hostConfig.ttl}, s-maxage=${hostConfig.sharedTtl}, stale-while-revalidate=${hostConfig.staleWhileRevalidate}, stale-if-error=${hostConfig.staleIfError}`,
      // La réponse ne dépend d'aucun en-tête de requête ; `Accept-Encoding` est
      // déclaré pour le cache du site, qui compresse devant le relais.
      Vary: 'Accept-Encoding',
      'X-Relay-Cache': state,
    };
    if (entry.etag) headers.ETag = entry.etag;
    if (entry.lastModified) headers['Last-Modified'] = entry.lastModified;
    if (state !== 'MISS') headers.Age = Math.max(0, Math.floor((now() - entry.storedAt) / 1000));
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : entry.body);
    return { status: 200, code: undefined, bytes: entry.body.length };
  }

  /** Va chercher la cible chez l'amont et range la réponse. Seule une 200 arrive jusqu'ici. */
  function fetchShared(cacheKey, target, hostConfig) {
    const pending = inFlight.get(cacheKey);
    if (pending) return pending;
    if (inFlight.size >= config.limits.maxUpstreamRequests) {
      throw new RelayError(503, 'relay-busy', { retryAfter: 1 });
    }
    const started = fetchUpstream(target, config, upstreamDeps)
      .then((response) => {
        // Défense en profondeur : un amont qui renverrait la clé dans sa réponse
        // (page de débogage, écho des en-têtes) ne la fait pas sortir.
        for (const hostEntry of config.hosts.values()) {
          if (hostEntry.key && response.body.includes(hostEntry.key.secret)) {
            throw new RelayError(502, 'upstream-leak');
          }
        }
        const storedAt = now();
        const entry = {
          body: response.body,
          contentType: response.contentType,
          etag: response.etag,
          lastModified: response.lastModified,
          storedAt,
          freshUntil: storedAt + hostConfig.sharedTtl * 1000,
          staleUntil: storedAt + (hostConfig.sharedTtl + hostConfig.staleIfError) * 1000,
        };
        cache.set(cacheKey, entry);
        return entry;
      })
      .finally(() => inFlight.delete(cacheKey));
    inFlight.set(cacheKey, started);
    return started;
  }

  async function obtain(target, hostConfig) {
    // La clé de cache est l'URL seule : hôte (en minuscules par construction),
    // chemin et requête tels que reçus. Aucun en-tête de requête n'y entre.
    const cacheKey = `${target.host}${target.path}${target.search}`;
    const cached = cache.get(cacheKey, now());
    if (cached && now() < cached.freshUntil) return { entry: cached, state: 'HIT' };
    try {
      return { entry: await fetchShared(cacheKey, target, hostConfig), state: 'MISS' };
    } catch (error) {
      if (cached && isUpstreamFailure(error)) return { entry: cached, state: 'STALE' };
      throw error;
    }
  }

  async function handle(req, res) {
    const startedAt = now();
    /** @type {Record<string, unknown>} */
    const record = { time: new Date(startedAt).toISOString(), method: req.method };
    let outcome;
    try {
      // Une ligne de requête sans version (« HTTP/0.9 ») est ce que l'analyseur
      // retient d'une cible coupée par un LF nu : refusée d'office.
      if (req.httpVersion !== '1.1' && req.httpVersion !== '1.0') {
        throw new RelayError(400, 'invalid-url');
      }
      if (req.url === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
        const body = Buffer.from('{"status":"ok"}');
        res.writeHead(200, {
          ...COMMON_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': body.length,
          'Cache-Control': 'no-store',
        });
        res.end(req.method === 'HEAD' ? undefined : body);
        return;
      }

      const limit = limiter.take(rateLimitKey(clientAddress(req)), now());
      if (!limit.allowed) {
        throw new RelayError(429, 'rate-limited', { retryAfter: limit.retryAfter });
      }

      if (req.method === 'OPTIONS') {
        // Pré-vérification CORS : répondue ici, l'amont n'est jamais contacté.
        // Aucun en-tête de requête n'est autorisé : le relais n'en lit aucun.
        res.writeHead(204, {
          ...COMMON_HEADERS,
          'Access-Control-Allow-Methods': ALLOWED_METHODS,
          'Access-Control-Max-Age': '86400',
          'Cache-Control': 'no-store',
          Allow: ALLOWED_METHODS,
        });
        res.end();
        outcome = { status: 204, code: undefined, bytes: 0 };
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        throw new RelayError(405, 'method-not-allowed');
      }
      const declaredLength = req.headers['content-length'];
      if (
        req.headers['transfer-encoding'] !== undefined ||
        (declaredLength !== undefined && declaredLength !== '0')
      ) {
        throw new RelayError(400, 'body-not-allowed');
      }

      const requested = parseTarget(req.url, config.prefix, config.limits.maxUrlLength);
      const hostConfig = config.hosts.get(requested.host);
      if (!hostConfig) throw new RelayError(403, 'host-not-allowed');
      const target = { host: hostConfig.name, path: requested.path, search: requested.search };
      // À partir d'ici l'hôte est une valeur de la configuration, pas une saisie.
      record.host = target.host;
      if (!isUnderPrefix(target.path, hostConfig.pathPrefixes)) {
        throw new RelayError(403, 'path-not-allowed');
      }
      record.path = target.path;
      // La requête porte ce que l'usager a tapé dans une recherche déléguée :
      // elle n'est journalisée que sur demande explicite (`logQuery`).
      if (config.logQuery) record.query = target.search;

      const { entry, state } = await obtain(target, hostConfig);
      record.cache = state;
      outcome = sendEntry(req, res, entry, state, hostConfig);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        outcome = { status: 0, code: 'relay-error', bytes: 0 };
      } else {
        outcome = sendError(req, res, error);
      }
    } finally {
      if (outcome) {
        record.status = outcome.status;
        if (outcome.code) record.error = outcome.code;
        record.bytes = outcome.bytes;
        record.ms = now() - startedAt;
        try {
          log(record);
        } catch {
          // Un journal en panne ne doit pas faire tomber une réponse.
        }
      }
    }
  }

  const server = http.createServer(
    {
      maxHeaderSize: 16384,
      // Une requête lente ne tient pas une connexion ouverte indéfiniment.
      headersTimeout: 10000,
      requestTimeout: 15000,
      keepAliveTimeout: 5000,
      connectionsCheckingInterval: 5000,
    },
    (req, res) => {
      handle(req, res).catch(() => res.destroy());
    }
  );
  server.maxConnections = config.limits.maxConnections;
  // Un visiteur qui ne lit pas sa réponse ne garde pas sa connexion : sans
  // activité au-delà du délai de l'amont plus une marge, le socket est fermé.
  server.setTimeout(config.limits.timeoutMs + 20000);
  server.maxRequestsPerSocket = 1000;

  // Requête que l'analyseur HTTP refuse (CR ou LF nu dans la cible, en-têtes
  // trop longs…) : réponse minimale, avec l'en-tête CORS, puis fermeture.
  server.on('clientError', (error, socket) => {
    if (!socket.writable) {
      socket.destroy();
      return;
    }
    const tooLarge = error?.code === 'HPE_HEADER_OVERFLOW';
    const body = JSON.stringify({ error: 'invalid-url', message: MESSAGES['invalid-url'] });
    socket.end(
      `HTTP/1.1 ${tooLarge ? '431 Request Header Fields Too Large' : '400 Bad Request'}\r\n` +
        'Access-Control-Allow-Origin: *\r\n' +
        'X-Content-Type-Options: nosniff\r\n' +
        "Content-Security-Policy: default-src 'none'; sandbox\r\n" +
        'Cache-Control: no-store\r\n' +
        'Content-Type: application/json; charset=utf-8\r\n' +
        `Content-Length: ${Buffer.byteLength(body)}\r\n` +
        'Connection: close\r\n\r\n' +
        body
    );
  });

  return {
    server,
    cache,
    /** @returns {Promise<{ address: string, port: number }>} */
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.listenPort, config.listenHost, () => {
          server.off('error', reject);
          const address = server.address();
          resolve({
            address: config.listenHost,
            port: typeof address === 'object' && address ? address.port : 0,
          });
        });
      });
    },
    /** @returns {Promise<void>} */
    close() {
      return new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}
