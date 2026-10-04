// Relais cachable (ADR-155) — la requête vers l'amont.
//
// C'est ici que se joue l'essentiel de la défense contre la falsification de
// requête côté serveur (SSRF) :
//   1. le nom est résolu PAR LE RELAIS, toutes les adresses sont vérifiées ;
//   2. la connexion part vers L'ADRESSE VÉRIFIÉE, pas vers le nom — sinon un
//      DNS qui change de réponse entre la vérification et la connexion
//      (« rebond DNS ») ferait passer une adresse privée ;
//   3. TLS, port 443, certificat vérifié contre le NOM ;
//   4. une redirection est une nouvelle cible : elle repasse toutes les règles.

import http from 'node:http';
import tls from 'node:tls';
import { lookup } from 'node:dns/promises';
import { clearTimeout, setTimeout } from 'node:timers';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { isPublicAddress, isValidHostname } from './addresses.mjs';
import { RelayError, isSafePath, isSafeSearch, isUnderPrefix } from './target.mjs';

/** Valeurs FIXES : aucun en-tête envoyé à l'amont ne dépend de la requête du visiteur. */
export const UPSTREAM_ACCEPT = 'application/json, application/geo+json, text/csv;q=0.9, */*;q=0.1';
export const UPSTREAM_USER_AGENT = 'dsfr-data-relay';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ETAG_RE = /^(?:W\/)?"[\x21\x23-\x7e]{0,200}"$/;
const HTTP_DATE_RE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;
const CHARSET_RE = /;\s*charset\s*=\s*"?([A-Za-z0-9._-]{1,40})"?/i;

/**
 * Résolution par défaut : toutes les adresses du nom, dans l'ordre du résolveur.
 *
 * @param {string} hostname
 * @returns {Promise<{ address: string, family: number }[]>}
 */
export function defaultResolve(hostname) {
  return lookup(hostname, { all: true, order: 'verbatim' });
}

/**
 * Connecteur par défaut : TLS vers l'adresse vérifiée, port 443, certificat
 * contrôlé contre le nom d'hôte (`servername`), jamais contre l'adresse.
 * Les deux options n'existent que pour le test du connecteur lui-même
 * (tests/relay/reference/) ; `server.mjs` n'en passe aucune.
 *
 * @param {{ port?: number, ca?: string | Buffer }} [options]
 * @returns {(target: { address: string, family: number, hostname: string }) => import('node:net').Socket}
 */
export function createTlsConnector({ port = 443, ca } = {}) {
  return ({ address, hostname }) =>
    tls.connect({
      host: address,
      port,
      servername: hostname,
      ca,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      ALPNProtocols: ['http/1.1'],
    });
}

/**
 * Type de contenu d'une réponse, s'il est dans la liste blanche. L'en-tête est
 * RECONSTRUIT (type, puis jeu de caractères s'il est sain) : jamais recopié.
 *
 * @param {string | undefined} header
 * @param {readonly string[]} allowed
 * @returns {string | null}
 */
export function allowedContentType(header, allowed) {
  if (typeof header !== 'string') return null;
  const type = header.split(';', 1)[0].trim().toLowerCase();
  if (!allowed.includes(type)) return null;
  const charset = CHARSET_RE.exec(header);
  return charset ? `${type}; charset=${charset[1].toLowerCase()}` : type;
}

/**
 * Traduit un statut d'erreur de l'amont en erreur du relais (docs/RELAY.md §5).
 *
 * @param {number | undefined} status
 * @param {import('node:http').IncomingHttpHeaders} headers
 * @returns {RelayError}
 */
function upstreamStatusError(status, headers) {
  if (status === 429) {
    const raw = headers['retry-after'];
    const seconds = typeof raw === 'string' && /^\d{1,4}$/.test(raw) ? Number(raw) : undefined;
    return new RelayError(429, 'upstream-rate-limited', {
      retryAfter: seconds !== undefined && seconds >= 1 && seconds <= 3600 ? seconds : undefined,
    });
  }
  if (status === 401 || status === 403) return new RelayError(403, 'upstream-forbidden');
  if (status === 404 || status === 410) return new RelayError(status, 'upstream-not-found');
  if (status === 408 || status === 504) return new RelayError(504, 'upstream-timeout');
  if (status !== undefined && status >= 400 && status < 500) {
    return new RelayError(status, 'upstream-rejected');
  }
  return new RelayError(502, 'upstream-error');
}

/**
 * Une redirection est une nouvelle cible : https, port 443, sans identifiants,
 * hôte de la liste blanche, chemin sain et sous un préfixe autorisé de CET hôte.
 *
 * @param {{ host: string, path: string, search: string }} from
 * @param {string} location
 * @param {{ hosts: Map<string, { pathPrefixes: readonly string[] }> }} config
 * @returns {{ host: string, path: string, search: string }}
 */
export function resolveRedirect(from, location, config) {
  const refused = new RelayError(502, 'upstream-redirect-refused');
  let url;
  try {
    url = new URL(location, `https://${from.host}${from.path}${from.search}`);
  } catch {
    throw refused;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') {
    throw refused;
  }
  const host = url.hostname;
  const hostConfig = config.hosts.get(host);
  if (!isValidHostname(host) || !hostConfig) throw refused;
  if (!isSafePath(url.pathname) || !isSafeSearch(url.search)) throw refused;
  if (!isUnderPrefix(url.pathname, hostConfig.pathPrefixes)) throw refused;
  // L'hôte rendu est celui de la CONFIGURATION, pas la chaîne lue dans `Location`.
  return { host: hostConfig.name, path: url.pathname, search: url.search };
}

/**
 * Résout le nom et rend une adresse publique. Si UNE SEULE des adresses du nom
 * est privée, tout est refusé : un nom qui mélange adresses publiques et
 * privées est le montage type d'un rebond DNS.
 *
 * @param {string} hostname
 * @param {(hostname: string) => Promise<{ address: string, family: number }[]>} resolve
 */
async function resolvePublicAddress(hostname, resolve) {
  let addresses;
  try {
    addresses = await resolve(hostname);
  } catch {
    throw new RelayError(502, 'upstream-unreachable');
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new RelayError(502, 'upstream-unreachable');
  }
  for (const entry of addresses) {
    if (!isPublicAddress(entry?.address)) {
      throw new RelayError(502, 'upstream-address-forbidden');
    }
  }
  return addresses[0];
}

/** Taille d'un bloc de réception quand l'amont n'annonce pas de longueur. */
const BLOCK_BYTES = 64 * 1024;

/**
 * Corps de réponse en cours de réception.
 *
 * Garder les fragments tels que l'amont les découpe (`chunks.push(chunk)`)
 * laisse l'AMONT choisir le coût en mémoire : 1 Mo envoyé en fragments d'un
 * octet, c'est un million d'objets `Buffer`, soit plus de 200 Mo de tas. Ici
 * les octets sont recopiés dans des blocs de 64 Kio (ou un bloc unique à la
 * longueur déclarée) : le fragment reçu n'est jamais retenu.
 */
export class BodyCollector {
  /** @param {number} [declared] longueur annoncée par l'amont, déjà vérifiée sous le plafond */
  constructor(declared) {
    this.received = 0;
    this.blockSize = declared !== undefined && declared > 0 ? declared : BLOCK_BYTES;
    /** @type {Buffer[]} */
    this.blocks = [];
    this.fill = 0;
  }

  /** @param {Buffer} chunk */
  append(chunk) {
    let offset = 0;
    while (offset < chunk.length) {
      let block = this.blocks[this.blocks.length - 1];
      if (block === undefined || this.fill === block.length) {
        // Au-delà de la longueur déclarée (l'amont ment), on retombe sur des blocs fixes.
        block = Buffer.allocUnsafe(this.blocks.length === 0 ? this.blockSize : BLOCK_BYTES);
        this.blocks.push(block);
        this.fill = 0;
      }
      const copied = chunk.copy(block, this.fill, offset);
      this.fill += copied;
      offset += copied;
    }
    this.received += chunk.length;
  }

  /** @returns {Buffer} le corps, à sa taille exacte */
  toBuffer() {
    if (this.blocks.length === 1 && this.blocks[0].length === this.received) return this.blocks[0];
    return Buffer.concat(this.blocks, this.received);
  }
}

/**
 * Une requête GET vers l'amont, sans suivre de redirection.
 *
 * @returns {Promise<
 *   | { kind: 'redirect', location: string }
 *   | { kind: 'response', body: Buffer, contentType: string, etag: string | undefined, lastModified: string | undefined }
 * >}
 */
async function requestOnce(target, hostConfig, config, deps, signal) {
  // Le nom résolu, joint et envoyé en `Host` est celui de la liste blanche : la
  // requête du visiteur a servi à le CHOISIR dans la configuration, pas à l'écrire.
  const hostname = hostConfig.name;
  const { address, family } = await resolvePublicAddress(hostname, deps.resolve);

  /** @type {Record<string, string>} */
  const headers = {
    Host: hostname,
    Accept: UPSTREAM_ACCEPT,
    // Pas de compression demandée : le plafond de taille se compte sur ce qui
    // circule, et une réponse compressée servie depuis le cache supposerait de
    // négocier l'encodage avec chaque visiteur. C'est le cache du site qui compresse.
    'Accept-Encoding': 'identity',
    'User-Agent': UPSTREAM_USER_AGENT,
    Connection: 'close',
  };
  if (hostConfig.key) headers[hostConfig.key.header] = hostConfig.key.value;

  return new Promise((resolve, reject) => {
    let request;
    try {
      request = http.request({
        // La connexion part vers l'adresse qu'on vient de vérifier.
        createConnection: () => deps.connect({ address, family, hostname }),
        method: 'GET',
        host: hostname,
        path: `${target.path}${target.search}`,
        headers,
        setHost: false,
        signal,
      });
    } catch {
      reject(new RelayError(502, 'upstream-unreachable'));
      return;
    }

    request.on('error', () => reject(new RelayError(502, 'upstream-unreachable')));

    request.on('response', (response) => {
      const status = response.statusCode;

      if (status !== undefined && REDIRECT_STATUSES.has(status)) {
        const location = response.headers.location;
        response.destroy();
        if (typeof location !== 'string' || location === '') {
          reject(new RelayError(502, 'upstream-redirect-refused'));
        } else {
          resolve({ kind: 'redirect', location });
        }
        return;
      }

      if (status !== 200) {
        // Le corps d'une erreur de l'amont n'est ni lu ni relayé.
        response.destroy();
        reject(upstreamStatusError(status, response.headers));
        return;
      }

      const encoding = response.headers['content-encoding'];
      if (encoding !== undefined && encoding.toLowerCase() !== 'identity') {
        response.destroy();
        reject(new RelayError(502, 'upstream-encoding'));
        return;
      }

      const contentType = allowedContentType(response.headers['content-type'], config.contentTypes);
      if (contentType === null) {
        response.destroy();
        reject(new RelayError(502, 'upstream-content-type'));
        return;
      }

      // La fin de la réponse doit se PROUVER : une longueur déclarée, ou un
      // découpage (`chunked`) qui se termine. Une réponse délimitée par la seule
      // fermeture de la connexion est indiscernable d'une réponse tronquée — et
      // une réponse tronquée mise en cache serait servie à tout le monde.
      const transferEncoding = response.headers['transfer-encoding'];
      if (transferEncoding !== undefined && transferEncoding.trim().toLowerCase() !== 'chunked') {
        // `gzip, chunked` : Node retire le découpage, pas la compression.
        response.destroy();
        reject(new RelayError(502, 'upstream-encoding'));
        return;
      }
      const rawLength = response.headers['content-length'];
      if (transferEncoding === undefined && rawLength === undefined) {
        response.destroy();
        reject(new RelayError(502, 'upstream-unframed'));
        return;
      }

      const maxBytes = config.limits.maxBytes;
      const declared = Number(rawLength);
      if (Number.isFinite(declared) && declared > maxBytes) {
        response.destroy();
        reject(new RelayError(502, 'upstream-too-large'));
        return;
      }

      // Plafond compté EN FLUX : la connexion est coupée au premier octet de
      // trop, on n'attend pas la fin d'un téléchargement sans fin. Les octets
      // sont RECOPIÉS dans des blocs de taille fixe : la mémoire tenue dépend du
      // nombre d'octets, jamais du nombre de fragments (voir `BodyCollector`).
      const collector = new BodyCollector(Number.isFinite(declared) ? declared : undefined);
      response.on('data', (chunk) => {
        if (collector.received + chunk.length > maxBytes) {
          response.destroy();
          reject(new RelayError(502, 'upstream-too-large'));
          return;
        }
        collector.append(chunk);
      });
      response.on('error', () => reject(new RelayError(502, 'upstream-unreachable')));
      response.on('close', () => {
        if (!response.complete) reject(new RelayError(502, 'upstream-unreachable'));
      });
      response.on('end', () => {
        const etag = response.headers.etag;
        const lastModified = response.headers['last-modified'];
        resolve({
          kind: 'response',
          body: collector.toBuffer(),
          contentType,
          etag: typeof etag === 'string' && ETAG_RE.test(etag) ? etag : undefined,
          lastModified:
            typeof lastModified === 'string' && HTTP_DATE_RE.test(lastModified)
              ? lastModified
              : undefined,
        });
      });
    });

    request.end();
  });
}

/**
 * Va chercher une cible chez l'amont, redirections autorisées comprises, sous
 * un délai GLOBAL (résolution, connexion, redirections et corps inclus).
 *
 * @param {{ host: string, path: string, search: string }} target cible déjà validée
 * @param {object} config configuration validée (config.mjs)
 * @param {{ resolve: Function, connect: Function }} deps
 */
export async function fetchUpstream(target, config, deps) {
  const controller = new globalThis.AbortController();
  /** @type {(reason: RelayError) => void} */
  let expire = () => {};
  const expired = new Promise((_, reject) => {
    expire = reject;
  });
  // Sans ce `catch`, un délai qui tombe après la fin de la course serait un rejet non géré.
  expired.catch(() => {});
  const timer = setTimeout(() => {
    expire(new RelayError(504, 'upstream-timeout'));
    controller.abort();
  }, config.limits.timeoutMs);

  try {
    let current = target;
    for (let hop = 0; ; hop += 1) {
      const hostConfig = config.hosts.get(current.host);
      if (!hostConfig) throw new RelayError(403, 'host-not-allowed');
      const attempt = requestOnce(current, hostConfig, config, deps, controller.signal);
      attempt.catch(() => {});
      const result = await Promise.race([attempt, expired]);
      if (result.kind === 'response') return result;
      if (hop >= config.limits.maxRedirects) {
        throw new RelayError(502, 'upstream-redirect-refused');
      }
      current = resolveRedirect(current, result.location, config);
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
