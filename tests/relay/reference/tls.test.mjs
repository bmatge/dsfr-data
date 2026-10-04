// Relais de référence (ADR-155) — le connecteur TLS de production.
//
// Partout ailleurs dans le banc, la connexion est substituée (le faux amont
// parle HTTP en clair). Ce fichier éprouve donc À PART le seul morceau que la
// substitution court-circuite : `createTlsConnector`, qui se connecte à une
// ADRESSE et vérifie le certificat contre le NOM (C-SSRF-6).
//
// Le certificat est fabriqué à la volée par `openssl` dans un dossier
// temporaire : aucune clé privée n'est versionnée. Sans `openssl`, les tests
// sont sautés, et ils le disent.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createTlsConnector } from '../../../proxy/relay/node/upstream.mjs';

const HOSTNAME = 'amont.conformance.test';

/** @type {string | undefined} */
let directory;
/** @type {Buffer | undefined} */
let certificate;
/** @type {import('node:https').Server | undefined} */
let server;
let port = 0;
let skipReason = '';

before(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'relais-tls-'));
  const keyPath = path.join(directory, 'cle.pem');
  const certificatePath = path.join(directory, 'certificat.pem');
  const generated = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-keyout',
      keyPath,
      '-out',
      certificatePath,
      '-subj',
      `/CN=${HOSTNAME}`,
      '-addext',
      `subjectAltName=DNS:${HOSTNAME}`,
    ],
    { stdio: 'ignore' }
  );
  if (generated.status !== 0) {
    skipReason = 'openssl absent ou sans `-addext` : certificat de test non fabriqué';
    return;
  }
  certificate = readFileSync(certificatePath);
  server = https.createServer({ key: readFileSync(keyPath), cert: certificate }, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ hote: req.headers.host, sni: req.socket.servername }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = server.address();
  port = typeof address === 'object' && address ? address.port : 0;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  }
  if (directory) rmSync(directory, { recursive: true, force: true });
});

/** Une requête HTTP sur le socket rendu par le connecteur, comme le fait `upstream.mjs`. */
function requestThrough(connect, hostname) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        createConnection: () => connect({ address: '127.0.0.1', family: 4, hostname }),
        host: hostname,
        path: '/',
        headers: { Host: hostname, Connection: 'close' },
        setHost: false,
      },
      (response) => {
        let text = '';
        response.on('data', (chunk) => {
          text += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode, text }));
      }
    );
    request.on('error', reject);
    request.end();
  });
}

describe('C-SSRF-6 — connecteur TLS de production', () => {
  test('connexion à l’adresse, certificat vérifié contre le nom, SNI au nom de l’hôte', async (t) => {
    if (skipReason) return t.skip(skipReason);
    const response = await requestThrough(createTlsConnector({ port, ca: certificate }), HOSTNAME);
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.text), { hote: HOSTNAME, sni: HOSTNAME });
  });

  test('certificat émis pour un autre nom : connexion refusée', async (t) => {
    if (skipReason) return t.skip(skipReason);
    await assert.rejects(
      requestThrough(createTlsConnector({ port, ca: certificate }), 'autre.conformance.test'),
      (error) => error.code === 'ERR_TLS_CERT_ALTNAME_INVALID'
    );
  });

  test('certificat qu’aucune autorité de confiance ne signe : connexion refusée', async (t) => {
    if (skipReason) return t.skip(skipReason);
    await assert.rejects(requestThrough(createTlsConnector({ port }), HOSTNAME), (error) =>
      /SELF_SIGNED|UNABLE_TO_VERIFY/.test(error.code)
    );
  });

  test('amont qui ne parle pas TLS : connexion refusée, rien n’est envoyé en clair', async () => {
    let received = '';
    const plain = http.createServer((req, res) => {
      received += req.url;
      res.end('en clair');
    });
    plain.on('connection', (socket) =>
      socket.on('data', (chunk) => (received += chunk.toString('latin1')))
    );
    await new Promise((resolve) => plain.listen(0, '127.0.0.1', () => resolve(undefined)));
    const address = plain.address();
    const plainPort = typeof address === 'object' && address ? address.port : 0;
    try {
      await assert.rejects(requestThrough(createTlsConnector({ port: plainPort }), HOSTNAME));
      assert.ok(!received.includes('GET '), 'la requête est partie en clair');
    } finally {
      plain.closeAllConnections();
      await new Promise((resolve) => plain.close(() => resolve(undefined)));
    }
  });

  test('sans option, le connecteur vise le port 443 de l’adresse donnée', async (t) => {
    const error = await new Promise((resolve) => {
      const socket = createTlsConnector()({ address: '127.0.0.1', family: 4, hostname: HOSTNAME });
      socket.on('error', resolve);
      socket.on('secureConnect', () => {
        socket.destroy();
        resolve(null);
      });
    });
    if (error?.code !== 'ECONNREFUSED') {
      return t.skip(
        'un service écoute sur le port 443 de cette machine : destination non observable'
      );
    }
    assert.equal(error.port, 443);
    assert.equal(error.address, '127.0.0.1');
  });
});
