// Client HTTP du banc de conformance du relais (ADR-155).
//
// `fetch` et `new URL()` NORMALISENT une URL avant de l'envoyer (`..` résolu,
// `%2e%2e` aussi) : ils ne peuvent pas porter une attaque de chemin. Ce client
// écrit la cible de requête telle quelle, et descend au socket nu quand il faut
// envoyer ce qu'aucun client HTTP n'accepterait d'écrire (CR, LF).

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { Buffer } from 'node:buffer';

/**
 * @typedef {object} RelayResponse
 * @property {number} status
 * @property {import('node:http').IncomingHttpHeaders} headers
 * @property {string[]} rawHeaders
 * @property {Buffer} body
 * @property {string} text
 */

/**
 * @param {URL} base URL du relais, préfixe compris (`http://127.0.0.1:8155/donnees-relais`)
 */
export function createClient(base) {
  const secure = base.protocol === 'https:';
  const transport = secure ? https : http;
  const port = base.port === '' ? (secure ? 443 : 80) : Number(base.port);
  const basePath = base.pathname.replace(/\/$/, '');

  /**
   * Envoie une requête dont la cible est `<préfixe du relais><rawPath>`, sans aucune normalisation.
   *
   * @param {string} rawPath commence par `/` ; `absolute: true` pour une cible hors préfixe
   * @param {{ method?: string, headers?: Record<string, string>, body?: string, absolute?: boolean }} [options]
   * @returns {Promise<RelayResponse>}
   */
  function call(rawPath, { method = 'GET', headers = {}, body, absolute = false } = {}) {
    return new Promise((resolve, reject) => {
      const request = transport.request(
        {
          host: base.hostname,
          port,
          method,
          path: absolute ? rawPath : `${basePath}${rawPath}`,
          headers:
            body === undefined
              ? headers
              : { 'Content-Length': Buffer.byteLength(body), ...headers },
          agent: false,
        },
        (response) => {
          /** @type {Buffer[]} */
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('error', reject);
          response.on('end', () => {
            const buffer = Buffer.concat(chunks);
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              rawHeaders: response.rawHeaders,
              body: buffer,
              text: buffer.toString('utf8'),
            });
          });
        }
      );
      request.on('error', reject);
      request.end(body);
    });
  }

  /**
   * Écrit des octets bruts sur une connexion et rend tout ce que le relais répond.
   *
   * @param {string} payload
   * @returns {Promise<string>}
   */
  function raw(payload) {
    return new Promise((resolve, reject) => {
      const socket = secure
        ? tls.connect({ host: base.hostname, port, servername: base.hostname })
        : net.connect(port, base.hostname);
      /** @type {Buffer[]} */
      const chunks = [];
      socket.setTimeout(5000, () => socket.destroy());
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.on('error', reject);
      socket.on('close', () => resolve(Buffer.concat(chunks).toString('latin1')));
      socket.write(payload);
    });
  }

  return { call, raw, basePath, hostHeader: base.host };
}
