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
import { BlockList, isIP } from 'node:net';
import { Buffer } from 'node:buffer';
import { rateLimitKey } from './addresses.mjs';
import { MemoryCache } from './cache.mjs';
import { RateLimiter } from './rate-limit.mjs';
import { RelayError, isUnderPrefix, parseTarget } from './target.mjs';
import { createTlsConnector, defaultResolve, fetchUpstream } from './upstream.mjs';

const ALLOWED_METHODS = 'GET, HEAD, OPTIONS';

/**
 * Requêtes servies sur une même connexion avant de la fermer. Le plafond de
 * Node (`maxRequestsPerSocket`) répond lui-même, par une 503 sans aucun des
 * en-têtes du contrat : le relais compte donc lui-même, et ferme proprement.
 */
const MAX_REQUESTS_PER_SOCKET = 1000;

/** Statuts après lesquels la connexion est fermée : la requête n'a pas forcément été lue. */
const CLOSING_STATUSES = new Set([400, 405, 408, 417, 431]);

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
  'expectation-failed': "Le relais n'honore aucun en-tête Expect.",
  'request-timeout': "La requête n'a pas été reçue en entier dans le délai.",
  'headers-too-large': 'Les en-têtes de la requête dépassent la taille acceptée.',
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
  'upstream-unframed':
    'Le service amont a répondu sans longueur ni découpage : la fin de la réponse ne se prouve pas.',
  'upstream-redirect-refused': 'Le service amont a répondu une redirection non autorisée.',
  'upstream-leak': "La réponse du service amont a été retenue : elle contenait la clé d'accès.",
  'upstream-rate-limited': 'Le service amont limite le débit.',
  'upstream-forbidden': "Le service amont refuse l'accès.",
  'upstream-not-found': 'Le service amont ne connaît pas cette ressource.',
  'upstream-rejected': 'Le service amont a refusé la requête.',
});

/**
 * Réponses par lesquelles l'amont dit que la donnée n'est plus là, ou plus pour
 * nous (401, 403, 404, 410). L'entrée en cache est alors PURGÉE : sans cela, la
 * première panne de l'amont resservirait en « périmé » une donnée dépubliée.
 */
function isWithdrawal(error) {
  return (
    error instanceof RelayError &&
    (error.code === 'upstream-forbidden' || error.code === 'upstream-not-found')
  );
}

/**
 * Vrai si la clé d'un hôte figure dans ce que le relais s'apprête à servir :
 * le corps, mais aussi les trois en-têtes repris de l'amont. Le type de contenu
 * est reconstruit en minuscules : la comparaison des en-têtes ignore la casse.
 */
function leaksKey(response, hosts) {
  const headers = [response.contentType, response.etag, response.lastModified]
    .filter((value) => typeof value === 'string')
    .join('\n')
    .toLowerCase();
  for (const hostEntry of hosts.values()) {
    if (!hostEntry.key) continue;
    if (response.body.includes(hostEntry.key.secret)) return true;
    if (headers.includes(hostEntry.key.secret.toLowerCase())) return true;
  }
  return false;
}

/** Échecs de l'amont pour lesquels une réponse périmée vaut mieux qu'une erreur. */
function isUpstreamFailure(error) {
  if (!(error instanceof RelayError)) return false;
  return error.status >= 502 || error.code === 'upstream-rate-limited';
}

/**
 * Durée pendant laquelle `X-Forwarded-For` n'est plus cru d'un mandataire pris
 * à ne pas le poser. Chaque nouvelle requête sans en-tête la prolonge.
 */
const PROXY_DISTRUST_MS = 15 * 60 * 1000;

/** Avertissement par défaut : la sortie d'erreur, comme les messages de démarrage. */
function defaultWarn(message) {
  process.stderr.write(`[relais] ${message}\n`);
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
 *   warn?: (message: string) => void,
 * }} [deps]
 */
export function createRelay(config, deps = {}) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? defaultLog;
  const warn = deps.warn ?? defaultWarn;
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
  // `BlockList` compare des ADRESSES, pas des chaînes : `::1` et `0:0:0:0:0:0:0:1`
  // désignent le même mandataire.
  const trustedProxies = new BlockList();
  for (const address of config.trustedProxies) {
    trustedProxies.addAddress(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');
  }
  /**
   * Mandataires de confiance pris à NE PAS poser `X-Forwarded-For`, et jusqu'à quand.
   * Bornée par construction : une entrée par adresse de `trustedProxies`.
   * @type {Map<string, number>}
   */
  const distrustedUntil = new Map();
  /** @type {Set<string>} */
  const warnedProxies = new Set();
  /** Requêtes vers l'amont en cours, par clé de cache : N visiteurs, une seule requête. */
  const inFlight = new Map();
  /**
   * Places amont tenues par client (clé de limite de débit). Sans cette part,
   * un seul client qui demande N URL lentes occupe toutes les places et prive
   * les autres visiteurs de toute URL absente du cache.
   * @type {Map<string, number>}
   */
  const upstreamByClient = new Map();
  /**
   * Corps remis à un socket et pas encore écrits (visiteur qui lit lentement,
   * ou pas du tout). Un même `Buffer` servi à N visiteurs ne compte qu'une fois
   * dans le total ; il compte pour chacun dans sa part.
   * @type {Map<Buffer, number>}
   */
  const pendingBodies = new Map();
  /** @type {Map<string, number>} */
  const pendingByClient = new Map();
  let pendingBytes = 0;

  /**
   * Réserve la place d'un corps en attente d'écriture. Faux si le total, ou la
   * part de ce client (la moitié), est atteint : la réponse est alors une 503.
   */
  function holdBody(res, body, clientKey) {
    const readers = pendingBodies.get(body) ?? 0;
    const added = readers === 0 ? body.length : 0;
    const mine = pendingByClient.get(clientKey) ?? 0;
    const max = config.limits.maxPendingBytes;
    if (pendingBytes + added > max || mine + body.length > max / 2) return false;
    pendingBodies.set(body, readers + 1);
    pendingBytes += added;
    pendingByClient.set(clientKey, mine + body.length);
    // `close` suit la fin de l'écriture comme la coupure de la connexion.
    res.once('close', () => {
      const left = (pendingBodies.get(body) ?? 1) - 1;
      if (left === 0) {
        pendingBodies.delete(body);
        pendingBytes -= body.length;
      } else {
        pendingBodies.set(body, left);
      }
      const rest = (pendingByClient.get(clientKey) ?? body.length) - body.length;
      if (rest <= 0) pendingByClient.delete(clientKey);
      else pendingByClient.set(clientKey, rest);
    });
    return true;
  }

  /**
   * Adresse du visiteur, pour la SEULE limite de débit (et la part de ce client
   * dans les places du relais). Elle n'est ni transmise à l'amont, ni écrite
   * dans une réponse, ni journalisée.
   *
   * `X-Forwarded-For` n'est lu que si la connexion vient d'un mandataire de
   * confiance déclaré ; on en prend alors la DERNIÈRE valeur, celle qu'il a
   * ajoutée — tout ce qui précède vient du client et se forge.
   *
   * Cela suppose que le mandataire POSE l'en-tête (C-DOS-5). S'il se contente de
   * transmettre celui du client (`proxy_pass` nu), chaque requête forge son
   * adresse et la limite ne limite plus rien. Le relais ne peut pas le voir sur
   * une requête forgée ; il le voit sur toutes les autres, car un navigateur
   * n'envoie pas cet en-tête : une requête SANS en-tête venue du mandataire
   * prouve qu'il ne le pose pas. L'en-tête cesse alors d'être cru pour ce
   * mandataire — la limite devient globale, ce qui est sûr —, et un
   * avertissement le dit une fois.
   */
  function clientAddress(req, at) {
    const peer = (req.socket.remoteAddress ?? '').replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
    const family = isIP(peer);
    if (family === 0 || !trustedProxies.check(peer, family === 6 ? 'ipv6' : 'ipv4')) return peer;
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded !== 'string') {
      distrustedUntil.set(peer, at + PROXY_DISTRUST_MS);
      if (!warnedProxies.has(peer)) {
        warnedProxies.add(peer);
        try {
          warn(
            'Un mandataire de confiance (trustedProxies) a transmis une requête sans X-Forwarded-For : il ne pose pas cet en-tête. Tant que c’est le cas, l’en-tête n’est plus cru et la limite de débit vaut pour ce mandataire entier. Voir docs/RELAY.md, règle C-DOS-5.'
          );
        } catch {
          // Un avertissement qui échoue ne fait pas tomber une requête.
        }
      }
      return peer;
    }
    if (at < (distrustedUntil.get(peer) ?? 0)) return peer;
    const last = forwarded.split(',').pop()?.trim() ?? '';
    return isIP(last) !== 0 ? last : peer;
  }

  /**
   * Connexions sur lesquelles une réponse `Connection: close` est partie (ou va
   * partir). Plus rien n'y est traité ni écrit : ni la requête collée derrière
   * un refus, ni une seconde réponse à une requête déjà refusée.
   * @type {WeakSet<import('node:net').Socket>}
   */
  const closingSockets = new WeakSet();
  /** @type {WeakMap<import('node:net').Socket, number>} */
  const requestsBySocket = new WeakMap();

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
    if (CLOSING_STATUSES.has(status)) {
      headers.Connection = 'close';
      closingSockets.add(req.socket);
    }
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
    return { status, code, bytes: body.length };
  }

  function sendEntry(req, res, entry, state, hostConfig, clientKey) {
    const withBody = req.method !== 'HEAD';
    // Avant d'écrire le moindre octet : au-delà de la borne, c'est une 503 entière.
    if (withBody && !holdBody(res, entry.body, clientKey)) {
      throw new RelayError(503, 'relay-busy', { retryAfter: 1 });
    }
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
    res.end(withBody ? entry.body : undefined);
    return { status: 200, code: undefined, bytes: entry.body.length };
  }

  /** Va chercher la cible chez l'amont et range la réponse. Seule une 200 arrive jusqu'ici. */
  function fetchShared(cacheKey, target, hostConfig, clientKey) {
    // Rejoindre une requête déjà partie ne prend aucune place.
    const pending = inFlight.get(cacheKey);
    if (pending) return pending;
    const mine = upstreamByClient.get(clientKey) ?? 0;
    if (
      inFlight.size >= config.limits.maxUpstreamRequests ||
      mine >= config.limits.maxUpstreamRequestsPerClient
    ) {
      throw new RelayError(503, 'relay-busy', { retryAfter: 1 });
    }
    upstreamByClient.set(clientKey, mine + 1);
    const started = fetchUpstream(target, config, upstreamDeps)
      .then((response) => {
        // Défense en profondeur : un amont qui renverrait la clé dans sa réponse
        // (page de débogage, écho des en-têtes) ne la fait pas sortir — ni par le
        // corps, ni par `ETag`, `Last-Modified` ou `Content-Type`.
        if (leaksKey(response, config.hosts)) throw new RelayError(502, 'upstream-leak');
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
      .finally(() => {
        inFlight.delete(cacheKey);
        const left = (upstreamByClient.get(clientKey) ?? 1) - 1;
        if (left <= 0) upstreamByClient.delete(clientKey);
        else upstreamByClient.set(clientKey, left);
      });
    inFlight.set(cacheKey, started);
    return started;
  }

  async function obtain(target, hostConfig, clientKey) {
    // La clé de cache est l'URL seule : hôte (en minuscules par construction),
    // chemin et requête tels que reçus. Aucun en-tête de requête n'y entre.
    const cacheKey = `${target.host}${target.path}${target.search}`;
    const cached = cache.get(cacheKey, now());
    if (cached && now() < cached.freshUntil) return { entry: cached, state: 'HIT' };
    try {
      return { entry: await fetchShared(cacheKey, target, hostConfig, clientKey), state: 'MISS' };
    } catch (error) {
      if (isWithdrawal(error)) cache.delete(cacheKey);
      if (cached && isUpstreamFailure(error)) return { entry: cached, state: 'STALE' };
      throw error;
    }
  }

  async function handle(req, res, { expectation = false } = {}) {
    // Une connexion en cours de fermeture ne traite plus rien : la requête
    // collée derrière un refus n'atteint ni l'amont ni le journal. On ne détruit
    // pas le socket, la réponse au refus est peut-être encore en route.
    if (closingSockets.has(req.socket)) return;
    const served = (requestsBySocket.get(req.socket) ?? 0) + 1;
    requestsBySocket.set(req.socket, served);
    if (served >= MAX_REQUESTS_PER_SOCKET) {
      res.setHeader('Connection', 'close');
      closingSockets.add(req.socket);
    }
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

      // La clé du client sert à la limite de débit et à sa part des places du
      // relais (requêtes amont, octets en attente). À rien d'autre.
      const clientKey = rateLimitKey(clientAddress(req, startedAt));
      const limit = limiter.take(clientKey, startedAt);
      if (!limit.allowed) {
        throw new RelayError(429, 'rate-limited', { retryAfter: limit.retryAfter });
      }

      // `Expect` : le relais n'envoie jamais `100 Continue` (il refuse tout corps)
      // et ne connaît aucune autre attente.
      if (expectation) throw new RelayError(417, 'expectation-failed');

      if (req.method === 'OPTIONS') {
        // Pré-vérification CORS : répondue ici, l'amont n'est jamais contacté.
        // Aucun en-tête de requête n'est autorisé : le relais n'en lit aucun.
        // Hors du préfixe du relais, ce n'est pas une route : 404 comme pour un GET.
        if (!String(req.url).startsWith(`${config.prefix}/`)) {
          throw new RelayError(404, 'not-found');
        }
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
      if (config.logPath) record.path = target.path;
      // La requête porte ce que l'usager a tapé dans une recherche déléguée :
      // elle n'est journalisée que sur demande explicite (`logQuery`).
      if (config.logQuery) record.query = target.search;

      const { entry, state } = await obtain(target, hostConfig, clientKey);
      record.cache = state;
      outcome = sendEntry(req, res, entry, state, hostConfig, clientKey);
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
  // Pas de plafond de Node par connexion : il répondrait seul (voir MAX_REQUESTS_PER_SOCKET).
  server.maxRequestsPerSocket = 0;

  // `Expect` : sans ces écouteurs, Node répond seul — `100 Continue` pour l'un,
  // une 417 sans en-têtes du contrat pour l'autre.
  server.on('checkContinue', (req, res) => {
    handle(req, res).catch(() => res.destroy());
  });
  server.on('checkExpectation', (req, res) => {
    handle(req, res, { expectation: true }).catch(() => res.destroy());
  });

  // Requête que l'analyseur HTTP refuse (CR ou LF nu dans la cible, en-têtes
  // trop longs, requête jamais terminée…) : réponse minimale, avec les en-têtes
  // communs, puis fermeture.
  server.on('clientError', (error, socket) => {
    if (!socket.writable) {
      socket.destroy();
      return;
    }
    // Une réponse qui ferme est déjà partie sur cette connexion (corps refusé,
    // puis corps illisible) : on n'en écrit pas une seconde.
    if (closingSockets.has(socket)) {
      socket.end();
      return;
    }
    closingSockets.add(socket);
    const [statusLine, code] =
      error?.code === 'HPE_HEADER_OVERFLOW'
        ? ['431 Request Header Fields Too Large', 'headers-too-large']
        : error?.code === 'ERR_HTTP_REQUEST_TIMEOUT'
          ? ['408 Request Timeout', 'request-timeout']
          : ['400 Bad Request', 'invalid-url'];
    const body = JSON.stringify({ error: code, message: MESSAGES[code] });
    socket.end(
      `HTTP/1.1 ${statusLine}\r\n` +
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
    /** État des bornes, pour le banc de tests. Rien de la configuration ni des visiteurs. */
    stats() {
      return { upstreamRequests: inFlight.size, pendingBytes };
    },
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
