// Relais de référence (ADR-155) — le connecteur TLS de production.
//
// Partout ailleurs dans le banc, la connexion est substituée (le faux amont
// parle HTTP en clair). Ce fichier éprouve donc À PART le seul morceau que la
// substitution court-circuite : `createTlsConnector`, qui se connecte à une
// ADRESSE et vérifie le certificat contre le NOM (C-SSRF-6).
//
// Le connecteur est éprouvé PAR `fetchUpstream` lui-même — la fonction que le
// relais appelle —, pas par une copie de sa requête : c'est le chemin de
// production, de la résolution à la lecture du corps. Seule l'adresse du
// serveur de test (la boucle locale) est déclarée par l'injection du banc.
//
// Le certificat est fabriqué à la volée par `openssl` dans un dossier
// temporaire : aucune clé privée n'est versionnée. Sans `openssl`, les quatre
// tests qui en dépendent sont sautés sur un poste de travail, et ils le disent ;
// en CI (`CI` défini), son absence est un ÉCHEC : le pont Vitest ne peut pas
// être vert sans que le connecteur ait été vérifié.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import tls from 'node:tls';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { validateConfig } from '../../../proxy/relay/node/config.mjs';
import { RelayError } from '../../../proxy/relay/node/target.mjs';
import { createTlsConnector, fetchUpstream } from '../../../proxy/relay/node/upstream.mjs';

const HOSTNAME = 'amont.conformance.test';
const OTHER_HOSTNAME = 'autre.conformance.test';
const LOOPBACK = '127.0.0.1';

const config = validateConfig({ hosts: { [HOSTNAME]: {}, [OTHER_HOSTNAME]: {} } }, {});

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
    if (process.env.CI) {
      throw new Error(
        'openssl absent ou sans `-addext` : en CI, le connecteur TLS doit être vérifié, pas sauté.'
      );
    }
    skipReason = 'openssl absent ou sans `-addext` : certificat de test non fabriqué';
    return;
  }
  certificate = readFileSync(certificatePath);
  server = https.createServer({ key: readFileSync(keyPath), cert: certificate }, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ hote: req.headers.host, sni: req.socket.servername }));
  });
  await new Promise((resolve) => server.listen(0, LOOPBACK, () => resolve(undefined)));
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

/**
 * `fetchUpstream`, le code de production, à travers le connecteur donné. Le nom
 * « résout » vers la boucle locale, où écoute le serveur de test : c'est la
 * seule substitution, avec la déclaration de cette adresse au banc.
 *
 * @returns {Promise<{ result?: Awaited<ReturnType<typeof fetchUpstream>>, error?: unknown, socketErrors: string[], targets: object[] }>}
 */
async function fetchThrough(connector, hostname = HOSTNAME) {
  /** @type {string[]} */
  const socketErrors = [];
  /** @type {object[]} */
  const targets = [];
  const connect = (target) => {
    targets.push(target);
    const socket = connector(target);
    socket.on('error', (error) => socketErrors.push(String(error.code)));
    return socket;
  };
  const deps = {
    resolve: async () => [{ address: LOOPBACK, family: 4 }],
    connect,
    benchAddresses: new Set([LOOPBACK]),
  };
  try {
    const result = await fetchUpstream({ host: hostname, path: '/', search: '' }, config, deps);
    return { result, socketErrors, targets };
  } catch (error) {
    return { error, socketErrors, targets };
  }
}

const assertUnreachable = (outcome) => {
  assert.equal(outcome.result, undefined, 'la réponse de l’amont a été lue');
  assert.ok(outcome.error instanceof RelayError);
  assert.equal(outcome.error.status, 502);
  assert.equal(outcome.error.code, 'upstream-unreachable');
};

describe('C-SSRF-6 — connecteur TLS de production, à travers `fetchUpstream`', () => {
  test('connexion à l’adresse, certificat vérifié contre le nom, SNI et `Host` au nom de l’hôte', async (t) => {
    if (skipReason) return t.skip(skipReason);
    const outcome = await fetchThrough(createTlsConnector({ port, ca: certificate }));
    assert.equal(outcome.error, undefined);
    assert.equal(outcome.result.kind, 'response');
    assert.equal(outcome.result.contentType, 'application/json');
    assert.deepEqual(JSON.parse(outcome.result.body.toString('utf8')), {
      hote: HOSTNAME,
      sni: HOSTNAME,
    });
    assert.deepEqual(outcome.targets, [{ address: LOOPBACK, family: 4, hostname: HOSTNAME }]);
  });

  test('certificat émis pour un autre nom : 502, la requête ne part pas', async (t) => {
    if (skipReason) return t.skip(skipReason);
    const outcome = await fetchThrough(
      createTlsConnector({ port, ca: certificate }),
      OTHER_HOSTNAME
    );
    assertUnreachable(outcome);
    assert.deepEqual(outcome.socketErrors, ['ERR_TLS_CERT_ALTNAME_INVALID']);
  });

  test('certificat qu’aucune autorité de confiance ne signe : 502', async (t) => {
    if (skipReason) return t.skip(skipReason);
    const outcome = await fetchThrough(createTlsConnector({ port }));
    assertUnreachable(outcome);
    assert.equal(outcome.socketErrors.length, 1);
    assert.match(outcome.socketErrors[0], /SELF_SIGNED|UNABLE_TO_VERIFY/);
  });

  test('`NODE_TLS_REJECT_UNAUTHORIZED=0` ne débranche pas la vérification du certificat', async (t) => {
    if (skipReason) return t.skip(skipReason);
    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    // Node avertit sur la sortie d'erreur quand cette variable est posée : c'est attendu.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
      assertUnreachable(await fetchThrough(createTlsConnector({ port })));
    } finally {
      if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
    }
  });

  test('amont qui ne parle pas TLS : 502, rien n’est envoyé en clair', async () => {
    let received = '';
    const plain = http.createServer((req, res) => {
      received += req.url;
      res.end('en clair');
    });
    plain.on('connection', (socket) =>
      socket.on('data', (chunk) => (received += chunk.toString('latin1')))
    );
    await new Promise((resolve) => plain.listen(0, LOOPBACK, () => resolve(undefined)));
    const address = plain.address();
    const plainPort = typeof address === 'object' && address ? address.port : 0;
    try {
      assertUnreachable(await fetchThrough(createTlsConnector({ port: plainPort })));
      assert.ok(!received.includes('GET '), 'la requête est partie en clair');
    } finally {
      plain.closeAllConnections();
      await new Promise((resolve) => plain.close(() => resolve(undefined)));
    }
  });

  test('sans option, le connecteur vise le port 443 de l’ADRESSE donnée, et vérifie le certificat contre le NOM', () => {
    // Aucune connexion n'est ouverte : `tls.connect` est observé, puis remis. Le
    // test ne dépend donc ni d'`openssl`, ni de ce qui écoute sur le port 443.
    const original = tls.connect;
    /** @type {object[]} */
    const calls = [];
    const fakeSocket = {};
    tls.connect = (options) => {
      calls.push(options);
      return fakeSocket;
    };
    let returned;
    try {
      returned = createTlsConnector()({ address: '192.0.2.10', family: 4, hostname: HOSTNAME });
    } finally {
      tls.connect = original;
    }
    assert.equal(returned, fakeSocket);
    assert.deepEqual(calls, [
      {
        host: '192.0.2.10',
        port: 443,
        servername: HOSTNAME,
        ca: undefined,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        ALPNProtocols: ['http/1.1'],
      },
    ]);
  });
});
