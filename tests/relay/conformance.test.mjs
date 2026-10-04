// Suite de conformance du relais cachable (ADR-155, contrat : docs/RELAY.md).
//
//   node --test tests/relay/conformance.test.mjs
//       → éprouve le relais Node de référence (proxy/relay/node/), lancé ici même.
//
//   RELAY_URL=http://127.0.0.1:8155/donnees-relais node --test tests/relay/conformance.test.mjs
//       → éprouve N'IMPORTE QUEL relais, configuré selon le profil de conformance
//         (tests/relay/conformance-profile.json, mode d'emploi : docs/RELAY.md §7).
//
// `node:test` et modules `node:` seuls. La suite démarre elle-même son faux
// amont ; elle ne joint aucun service réel. Chaque test porte l'identifiant de
// la règle du contrat qu'il vérifie.
//
// Réglages (relais tiers) : CONFORMANCE_UPSTREAM_PORT (18155), CONFORMANCE_TIMEOUT_MS,
// CONFORMANCE_MAX_BYTES, CONFORMANCE_RATE_REQUESTS (0 : test de débit sauté),
// CONFORMANCE_HAS_CACHE=1 (le relais a son propre cache), RELAY_KEY_CONFORMANCE.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from './support/client.mjs';
import {
  ALLOWED_HOST,
  FORBIDDEN_HOST,
  KEYED_HOST,
  SECOND_HOST,
  startFakeUpstream,
} from './support/fake-upstream.mjs';
import { CONFORMANCE_KEY, readProfile } from './support/profile.mjs';

const profile = readProfile();
const thirdParty = Boolean(process.env.RELAY_URL);

const envNumber = (name, fallback) => {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : Number(raw);
};

const TIMEOUT_MS = envNumber('CONFORMANCE_TIMEOUT_MS', profile.limits.timeoutMs);
const MAX_BYTES = envNumber('CONFORMANCE_MAX_BYTES', profile.limits.maxBytes);
const RATE_REQUESTS = envNumber('CONFORMANCE_RATE_REQUESTS', profile.limits.rateLimitRequests);
const HAS_CACHE = !thirdParty || process.env.CONFORMANCE_HAS_CACHE === '1';
const KEY = process.env.RELAY_KEY_CONFORMANCE ?? CONFORMANCE_KEY;
const KEYED_PREFIX = profile.hosts[KEYED_HOST].pathPrefixes[0];

/** Délai de réponse du faux amont sur `/lent` : nettement au-delà du délai du relais. */
const SLOW_MS = TIMEOUT_MS + 3000;
/** Attente avant chaque saut de `/redirection/lente` : sous le délai, mais trois sauts le dépassent. */
const HOP_MS = Math.round(TIMEOUT_MS * 0.6);
/** Taille du flux `/gros` : très au-delà du plafond, pour que la coupure se voie. */
const BIG_BYTES = MAX_BYTES + 32 * 1024 * 1024;

/** Ce que le visiteur envoie et qui ne doit JAMAIS atteindre l'amont ni revenir. */
const VISITOR = {
  Cookie: 'session=temoin-cookie-visiteur',
  Authorization: 'Bearer temoin-autorisation-visiteur',
  Origin: 'https://temoin-origine.conformance.test',
  Referer: 'https://temoin-origine.conformance.test/page?recherche=temoin-referent',
  'X-Forwarded-For': '203.0.113.77',
  'X-Real-IP': '203.0.113.78',
  Forwarded: 'for=203.0.113.79',
  'X-Forwarded-Host': 'temoin-hote-transmis.conformance.test',
  Accept: 'text/html;temoin-accept=1',
  'Accept-Language': 'fr-temoin',
  'User-Agent': 'temoin-navigateur/1.0',
  Range: 'bytes=0-0',
  'If-None-Match': '"temoin-etag"',
  'X-Temoin': 'temoin-en-tete-libre',
};
const VISITOR_MARKS = [
  'temoin-cookie-visiteur',
  'temoin-autorisation-visiteur',
  'temoin-origine',
  'temoin-referent',
  '203.0.113.77',
  '203.0.113.78',
  '203.0.113.79',
  'temoin-hote-transmis',
  'temoin-accept',
  'fr-temoin',
  'temoin-navigateur',
  'temoin-etag',
  'temoin-en-tete-libre',
];
/** Ce que le faux amont pose dans ses réponses et que le relais doit retenir. */
const UPSTREAM_MARKS = ['temoin-amont', 'amont-factice'];

/** @type {Awaited<ReturnType<typeof startFakeUpstream>>} */
let upstream;
/** @type {ReturnType<typeof createClient>} */
let client;
/** @type {{ close: () => Promise<void> } | undefined} */
let reference;
let responses = 0;

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
let sequence = 0;
/** Marqueur unique : isole chaque test dans le cache et dans le journal du faux amont. */
const mark = () => {
  sequence += 1;
  return `m${runId}x${sequence}x`;
};

/**
 * Invariants vérifiés sur CHAQUE réponse de la suite, succès ou erreur
 * (C-NAV-1, C-NAV-2, C-NAV-3, C-NAV-4, C-CACHE-3, C-FUITE-1).
 */
function assertInvariants(response, label) {
  responses += 1;
  const dump = `${response.rawHeaders.join('\n')}\n${response.text}`;
  assert.ok(!dump.includes(KEY), `${label} : C-FUITE-1 — la clé du relais figure dans la réponse`);
  for (const value of VISITOR_MARKS) {
    assert.ok(
      !dump.includes(value),
      `${label} : C-FUITE-1 — « ${value} » du visiteur revient dans la réponse`
    );
  }
  for (const value of UPSTREAM_MARKS) {
    assert.ok(
      !dump.includes(value),
      `${label} : C-NAV-1 — « ${value} » de l'amont a traversé le relais`
    );
  }
  const headers = response.headers;
  assert.equal(headers['set-cookie'], undefined, `${label} : C-NAV-1 — Set-Cookie`);
  assert.equal(
    headers['access-control-allow-origin'],
    '*',
    `${label} : C-NAV-4 — Access-Control-Allow-Origin`
  );
  assert.equal(
    headers['access-control-allow-credentials'],
    undefined,
    `${label} : C-NAV-4 — Allow-Credentials`
  );
  assert.match(
    String(headers['x-content-type-options']),
    /^nosniff$/i,
    `${label} : C-NAV-2 — nosniff`
  );
  const csp = String(headers['content-security-policy']);
  assert.ok(
    csp.includes("default-src 'none'") && /\bsandbox\b/.test(csp),
    `${label} : C-NAV-2 — CSP (${csp})`
  );
  assert.doesNotMatch(
    String(headers['content-type'] ?? ''),
    /html|xml|svg|javascript|ecmascript/i,
    `${label} : C-NAV-3 — type de contenu actif`
  );
  assert.ok(
    response.status < 300 || response.status >= 400,
    `${label} : C-SSRF-7 — statut 3xx (${response.status})`
  );
  assert.equal(headers.location, undefined, `${label} : C-SSRF-7 — Location`);
  for (const name of Object.keys(headers)) {
    assert.doesNotMatch(name, /^x-ratelimit/i, `${label} : C-NAV-1 — en-tête de quota de l'amont`);
  }
  if (response.status >= 400) {
    assert.match(
      String(headers['cache-control']),
      /no-store/i,
      `${label} : C-CACHE-3 — une erreur est no-store`
    );
  }
}

/** Requête au relais, invariants compris. */
async function call(rawPath, options) {
  const response = await client.call(rawPath, options);
  assertInvariants(response, `${options?.method ?? 'GET'} ${rawPath.slice(0, 120)}`);
  return response;
}

/** Statuts par lesquels un relais refuse une cible : 403 pour l'hôte, 400 pour la forme. */
function assertRefused(response, marker, allowed, rule) {
  assert.ok(
    allowed.includes(response.status),
    `${rule} : statut ${response.status}, attendu ${allowed.join(' ou ')}`
  );
  assert.equal(upstream.seen(marker).length, 0, `${rule} : l'amont a été contacté`);
}

/**
 * Un chemin piégé est conforme s'il est REFUSÉ, ou s'il arrive à l'amont
 * normalisé et contenu (un relais bâti sur nginx normalise avant de router).
 * Dans aucun cas l'amont ne doit recevoir la forme piégée.
 */
function assertPathContained(response, marker, prefix, rule) {
  const seen = upstream.seen(marker);
  if (response.status >= 400) {
    assert.ok([400, 403, 404].includes(response.status), `${rule} : statut ${response.status}`);
    assert.equal(seen.length, 0, `${rule} : refusé, mais l'amont a été contacté`);
    return;
  }
  for (const request of seen) {
    const path = request.url.split('?', 1)[0];
    assert.ok(path.startsWith(prefix), `${rule} : l'amont a reçu ${path}, hors de ${prefix}`);
    const names = path.split('/').map((segment) => segment.split(';', 1)[0]);
    assert.ok(
      !names.includes('.') && !names.includes('..'),
      `${rule} : segment de remontée transmis (${path})`
    );
    assert.doesNotMatch(
      path,
      /%(2e|2f|5c|25|3b|c0|c1|e0%[89][0-9a-f]|0[0-9a-f]|1[0-9a-f])/i,
      `${rule} : encodage piégé transmis (${path})`
    );
    assert.ok(
      !path.includes('//') && !path.includes('\\'),
      `${rule} : barre piégée transmise (${path})`
    );
  }
}

before(async () => {
  upstream = await startFakeUpstream({
    port: thirdParty ? envNumber('CONFORMANCE_UPSTREAM_PORT', 18155) : 0,
    delayMs: SLOW_MS,
    bigBytes: BIG_BYTES,
    hopDelayMs: HOP_MS,
  });
  if (thirdParty) {
    client = createClient(new URL(process.env.RELAY_URL));
  } else {
    const { startReference } = await import('./support/reference.mjs');
    const started = await startReference({ upstreamPort: upstream.port });
    reference = started;
    client = createClient(started.url);
  }
});

after(async () => {
  await reference?.close();
  await upstream?.close();
});

// ---------------------------------------------------------------------------
describe('URL — forme et transmission', () => {
  test('C-URL-1 — le chemin et la requête arrivent à l’amont octet pour octet, sous le bon hôte', async () => {
    const m = mark();
    const target = `/api/explore/v2.1/catalog/datasets/a-b_c.d~e/records?${m}&where=nom%20like%20%22a%25%22&limit=10&x=%2F%2E%2E&y=a+b&z=%C3%A9[]{}|^&vide=&b=2&a=1`;
    const response = await call(`/${ALLOWED_HOST}${target}`);
    assert.equal(response.status, 200);
    const seen = upstream.seen(m);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, target, 'aucun réencodage, aucun tri, aucun paramètre perdu');
    assert.equal(seen[0].host, ALLOWED_HOST, 'en-tête Host de l’amont');
    assert.equal(seen[0].method, 'GET');
  });

  test('C-URL-1 — les paramètres ne sont pas triés : deux ordres, deux URL d’amont', async () => {
    const m = mark();
    await call(`/${ALLOWED_HOST}/donnees.json?${m}&b=2&a=1`);
    await call(`/${ALLOWED_HOST}/donnees.json?${m}&a=1&b=2`);
    assert.deepEqual(
      upstream.seen(m).map((request) => request.url),
      [`/donnees.json?${m}&b=2&a=1`, `/donnees.json?${m}&a=1&b=2`]
    );
  });

  for (const host of ['OUVERT.CONFORMANCE.TEST', 'Ouvert.Conformance.Test', `${ALLOWED_HOST}.`]) {
    test(`C-URL-2 — hôte comparé octet pour octet : « ${host} » est refusé (403)`, async () => {
      const m = mark();
      assertRefused(await call(`/${host}/donnees.json?${m}`), m, [403], 'C-URL-2');
    });
  }

  test('C-URL-3 — une URL de 7 900 caractères passe, au-delà de 8 000 le relais répond 414', async () => {
    const m = mark();
    const head = `/${ALLOWED_HOST}/donnees.json?${m}&q=`;
    const fits = `${head}${'a'.repeat(7900 - client.basePath.length - head.length)}`;
    assert.equal((await call(fits)).status, 200);
    const m2 = mark();
    const head2 = `/${ALLOWED_HOST}/donnees.json?${m2}&q=`;
    const tooLong = await call(`${head2}${'a'.repeat(8200)}`);
    assert.equal(tooLong.status, 414);
    assert.equal(upstream.seen(m2).length, 0);
  });
});

// ---------------------------------------------------------------------------
describe('SSRF — la cible', () => {
  const outside = [
    FORBIDDEN_HOST,
    `${ALLOWED_HOST}.interdit.conformance.test`,
    `prefixe-${ALLOWED_HOST}`,
    `sous.${ALLOWED_HOST}`,
    'conformance.test',
    'test',
  ];
  for (const host of outside) {
    test(`C-SSRF-1 — liste blanche exacte : « ${host} » est refusé (403), l’amont n’est pas contacté`, async () => {
      const m = mark();
      assertRefused(await call(`/${host}/donnees.json?${m}`), m, [403], 'C-SSRF-1');
    });
  }

  const addresses = [
    ['décimale pointée', '127.0.0.1'],
    ['entier décimal', '2130706433'],
    ['hexadécimale', '0x7f000001'],
    ['octale', '0177.0.0.1'],
    ['abrégée', '127.1'],
    ['métadonnées d’hébergeur', '169.254.169.254'],
    ['IPv6 de boucle locale', '[::1]'],
    ['IPv4 mappée', '[::ffff:127.0.0.1]'],
    ['IPv4 mappée en hexadécimal', '[::ffff:7f00:1]'],
    ['nom local', 'localhost'],
  ];
  for (const [label, host] of addresses) {
    test(`C-SSRF-2 — hôte sous forme d’adresse (${label}, « ${host} ») : refusé (403)`, async () => {
      const m = mark();
      assertRefused(await call(`/${host}/donnees.json?${m}`), m, [400, 403], 'C-SSRF-2');
    });
  }

  const disguised = [
    ['identifiants', `utilisateur:motdepasse@${ALLOWED_HOST}`],
    ['identifiants menant ailleurs', `${ALLOWED_HOST}@${FORBIDDEN_HOST}`],
    ['port 443 explicite', `${ALLOWED_HOST}:443`],
    ['autre port', `${ALLOWED_HOST}:8443`],
    ['schéma https', `https:`],
    ['schéma http', `http:`],
    ['hôte encodé', `%6fuvert.conformance.test`],
    ['barre encodée dans l’hôte', `${ALLOWED_HOST}%2f..`],
    ['octet nul encodé', `${ALLOWED_HOST}%00`],
    ['barre oblique inverse', `${ALLOWED_HOST}\\@${FORBIDDEN_HOST}`],
  ];
  for (const [label, host] of disguised) {
    test(`C-SSRF-3 — ${label} dans le segment d’hôte (« ${host} ») : refusé`, async () => {
      const m = mark();
      assertRefused(await call(`/${host}/donnees.json?${m}`), m, [400, 403], 'C-SSRF-3');
    });
  }

  test('C-SSRF-3 — segment d’hôte vide (`<relais>//hôte/…`) : refusé', async () => {
    const m = mark();
    assertRefused(
      await call(`//${ALLOWED_HOST}/donnees.json?${m}`),
      m,
      [400, 403, 404],
      'C-SSRF-3'
    );
  });

  test('C-SSRF-3 — cible en forme absolue (`GET http://hôte/…`) : jamais relayée', async () => {
    const m = mark();
    const reply = await client.raw(
      `GET http://${FORBIDDEN_HOST}/secret.json?${m} HTTP/1.1\r\nHost: ${client.hostHeader}\r\nConnection: close\r\n\r\n`
    );
    assert.doesNotMatch(reply, /^HTTP\/1\.[01] 2\d\d/, 'C-SSRF-3 : la cible absolue a été servie');
    assert.equal(upstream.seen(m).length, 0);
  });

  const traversals = [
    ['remontée `..`', '../prive/secret.json'],
    ['remontée encodée `%2e%2e`', '%2e%2e/prive/secret.json'],
    ['remontée encodée en majuscules `%2E%2E`', '%2E%2E/prive/secret.json'],
    ['remontée à moitié encodée `.%2e`', '.%2e/prive/secret.json'],
    ['remontée à moitié encodée `%2e.`', '%2e./prive/secret.json'],
    ['double encodage `%252e%252e`', '%252e%252e/prive/secret.json'],
    ['barre encodée `..%2f`', '..%2fprive/secret.json'],
    ['barre inverse encodée `..%5c`', '..%5cprive/secret.json'],
    ['barre inverse `..\\`', '..\\prive\\secret.json'],
    ['paramètre de chemin `..;`', '..;/prive/secret.json'],
    ['barre double `//`', '/donnees.json'],
    ['segment `.`', './donnees.json'],
    ['remontée finale `..`', 'jeu/..'],
    ['octet nul encodé `%00`', 'donnees.json%00.html'],
    ['point-virgule encodé `..%3b`', '..%3b/prive/secret.json'],
    ['point surlong `%c0%ae%c0%ae`', '%c0%ae%c0%ae/prive/secret.json'],
    ['barre surlongue `..%c0%af`', '..%c0%afprive/secret.json'],
    ['point surlong sur trois octets `%e0%80%ae`', '%e0%80%ae%e0%80%ae/prive/secret.json'],
  ];
  for (const [label, tail] of traversals) {
    test(`C-SSRF-4 — chemin piégé, ${label} : refusé ou contenu sous le préfixe autorisé`, async () => {
      const m = mark();
      const response = await call(`/${KEYED_HOST}${KEYED_PREFIX}${tail}?${m}`);
      assertPathContained(response, m, KEYED_PREFIX, 'C-SSRF-4');
    });
  }

  test('C-SSRF-4 — barre double en tête de chemin (`<hôte>//…`) : refusée ou contenue', async () => {
    const m = mark();
    const response = await call(`/${ALLOWED_HOST}//${FORBIDDEN_HOST}/secret.json?${m}`);
    assertPathContained(response, m, '/', 'C-SSRF-4');
  });

  const outsidePrefix = [
    ['chemin voisin', '/api/prive/secret.json'],
    ['préfixe tronqué', '/api/publi'],
    ['préfixe prolongé sans frontière de segment', '/api/public-prive/secret.json'],
    ['casse différente', '/API/PUBLIC/donnees.json'],
    ['racine', '/'],
  ];
  for (const [label, path] of outsidePrefix) {
    test(`C-SSRF-5 — hôte à clé, ${label} (« ${path} ») : hors préfixe autorisé, refusé (403)`, async () => {
      const m = mark();
      assertRefused(await call(`/${KEYED_HOST}${path}?${m}`), m, [403], 'C-SSRF-5');
    });
  }

  test('C-SSRF-5 — hôte à clé, chemin sous le préfixe autorisé : servi', async () => {
    const m = mark();
    assert.equal((await call(`/${KEYED_HOST}${KEYED_PREFIX}donnees.json?${m}`)).status, 200);
    assert.equal(upstream.seen(m).length, 1);
  });

  test('C-SSRF-6 — https, port 443, adresse privée après résolution DNS, connexion à l’adresse vérifiée', (t) => {
    t.skip(
      'non observable de l’extérieur : éprouvé sur le relais de référence dans tests/relay/reference/relay.test.mjs'
    );
  });
});

// ---------------------------------------------------------------------------
describe('SSRF — les redirections de l’amont', () => {
  const refusedRedirects = [
    ['vers un hôte hors liste', ALLOWED_HOST, '/redirection/interdit'],
    ['vers http', ALLOWED_HOST, '/redirection/http'],
    ['vers un autre port', ALLOWED_HOST, '/redirection/port'],
    ['vers une adresse de boucle locale', ALLOWED_HOST, '/redirection/ip'],
    [
      'vers une adresse de boucle locale où un service écoute',
      ALLOWED_HOST,
      '/redirection/ip-joignable',
    ],
    ['vers l’adresse des métadonnées', ALLOWED_HOST, '/redirection/metadonnees'],
    ['avec identifiants', ALLOWED_HOST, '/redirection/identifiants'],
    ['hors du préfixe autorisé', KEYED_HOST, `${KEYED_PREFIX}redirection/hors-prefixe`],
    ['avec remontée de chemin', ALLOWED_HOST, '/redirection/remontee'],
    [
      'vers un chemin à barre encodée `..%2f`',
      KEYED_HOST,
      `${KEYED_PREFIX}redirection/chemin-encode`,
    ],
    ['vers un chemin à paramètre `..;`', KEYED_HOST, `${KEYED_PREFIX}redirection/chemin-parametre`],
    ['vers un chemin à barre double', KEYED_HOST, `${KEYED_PREFIX}redirection/chemin-double`],
  ];
  for (const [label, host, path] of refusedRedirects) {
    test(`C-SSRF-7 — redirection ${label} : non suivie (502), jamais renvoyée au navigateur`, async () => {
      const m = mark();
      const response = await call(`/${host}${path}?${m}`);
      assert.equal(response.status, 502);
      // Rien n'a été demandé au-delà de la redirection elle-même.
      assert.equal(
        upstream.requests.filter((request) => request.host === FORBIDDEN_HOST).length,
        0
      );
      assert.equal(
        upstream.requests.filter((request) => request.url.includes('/secret')).length,
        0
      );
      // 502 ne prouve pas le refus : un relais qui suit la redirection vers une
      // adresse morte répond 502 aussi. Les cibles refusées portent `/suivie-`.
      assert.equal(
        upstream.requests.filter((request) => request.url.includes('/suivie-')).length,
        0,
        'C-SSRF-7 : la redirection refusée a été suivie'
      );
    });
  }

  test('C-SSRF-7 — redirection en boucle : arrêtée après trois sauts au plus (502)', async () => {
    const m = mark();
    const response = await call(`/${ALLOWED_HOST}/redirection/boucle?${m}`);
    assert.equal(response.status, 502);
    assert.ok(upstream.seen(m).length <= 4, `l’amont a été appelé ${upstream.seen(m).length} fois`);
  });

  test('C-SSRF-7 — quatre redirections en chaîne : refusées (502)', async () => {
    const before = upstream.requests.length;
    const response = await call(`/${ALLOWED_HOST}/redirection/chaine/4`);
    assert.equal(response.status, 502);
    assert.ok(upstream.requests.length - before <= 4);
  });

  test('C-SSRF-7 — redirection vers un hôte autorisé : suivie (200) ou refusée (502), jamais un 3xx', async () => {
    const m = mark();
    const response = await call(`/${ALLOWED_HOST}/redirection/second?${m}`);
    assert.ok([200, 502].includes(response.status), `statut ${response.status}`);
    if (response.status === 200) assert.equal(JSON.parse(response.text).hote, SECOND_HOST);
  });

  test('C-AMONT-2 — une redirection ne transporte pas la clé vers un autre hôte', async () => {
    const m = mark();
    await call(`/${KEYED_HOST}${KEYED_PREFIX}redirection/second?${m}`);
    for (const request of upstream.requests.filter((entry) => entry.host === SECOND_HOST)) {
      assert.ok(!JSON.stringify(request.headers).includes(KEY), 'la clé a suivi la redirection');
    }
  });
});

// ---------------------------------------------------------------------------
describe('Méthodes — lecture seule', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'PURGE', 'TRACE']) {
    test(`C-MET-1 — ${method} : 405 avec Allow, l’amont n’est pas contacté`, async () => {
      const m = mark();
      const response = await call(`/${ALLOWED_HOST}/donnees.json?${m}`, {
        method,
        body: ['POST', 'PUT', 'PATCH'].includes(method) ? '{"ecriture":true}' : undefined,
      });
      assert.equal(response.status, 405);
      assert.match(String(response.headers.allow), /GET/);
      assert.doesNotMatch(String(response.headers.allow), /POST|PUT|PATCH|DELETE/);
      assert.equal(upstream.seen(m).length, 0);
    });
  }

  test('C-MET-2 — un GET avec corps : refusé, ou relayé SANS son corps', async () => {
    const m = mark();
    const response = await call(`/${ALLOWED_HOST}/donnees.json?${m}`, {
      body: 'corps-du-visiteur',
    });
    if (response.status !== 200)
      assert.ok([400, 411, 413].includes(response.status), `statut ${response.status}`);
    for (const request of upstream.seen(m)) {
      assert.equal(request.bodyBytes, 0, 'le corps du visiteur a atteint l’amont');
      assert.equal(request.headers['transfer-encoding'], undefined);
    }
  });

  test('C-MET-3 — HEAD : mêmes en-têtes qu’un GET, aucun corps', async () => {
    const m = mark();
    const head = await call(`/${ALLOWED_HOST}/donnees.json?${m}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    assert.match(String(head.headers['content-type']), /^application\/json/);
    assert.match(String(head.headers['cache-control']), /max-age=/);
  });

  test('C-MET-3 — OPTIONS : pré-vérification CORS répondue par le relais, sans contacter l’amont', async () => {
    const m = mark();
    const response = await call(`/${ALLOWED_HOST}/donnees.json?${m}`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://site.conformance.test',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    assert.ok([200, 204].includes(response.status), `statut ${response.status}`);
    assert.match(String(response.headers['access-control-allow-methods']), /GET/);
    assert.doesNotMatch(
      String(response.headers['access-control-allow-methods']),
      /POST|PUT|PATCH|DELETE/
    );
    // Le relais n'attend AUCUN en-tête du visiteur : il n'en autorise aucun, ni
    // par leur nom, ni par `*`.
    assert.equal(
      String(response.headers['access-control-allow-headers'] ?? '').trim(),
      '',
      'C-MET-3 : Access-Control-Allow-Headers doit être absent ou vide'
    );
    assert.equal(upstream.seen(m).length, 0);
  });
});

// ---------------------------------------------------------------------------
describe('Injection d’en-têtes et séparation de requêtes', () => {
  const noInjection = (m) => {
    assert.equal(
      upstream.requests.filter((request) => request.headers['x-injecte'] !== undefined).length,
      0,
      'C-INJ-1 : un en-tête injecté a atteint l’amont'
    );
    assert.ok(upstream.seen(m).length <= 1, 'C-INJ-1 : une requête a été dédoublée');
    assert.equal(upstream.requests.filter((request) => request.host === FORBIDDEN_HOST).length, 0);
    assert.equal(upstream.requests.filter((request) => request.url.includes('/secret')).length, 0);
  };

  const encoded = [
    ['CR LF encodés dans le chemin', (m) => `/donnees.json%0d%0aX-Injecte:%20oui?${m}`],
    ['LF encodé dans le chemin', (m) => `/donnees.json%0aX-Injecte:%20oui?${m}`],
    ['CR LF encodés dans la requête', (m) => `/donnees.json?${m}&x=%0d%0aX-Injecte:%20oui`],
    ['en-tête de réponse dans la requête', (m) => `/donnees.json?${m}&x=%0d%0aSet-Cookie:%20a=b`],
    [
      'seconde requête encodée dans la requête',
      (m) =>
        `/donnees.json?${m}&x=1%20HTTP/1.1%0d%0aHost:%20${FORBIDDEN_HOST}%0d%0aX-Injecte:%20oui%0d%0a%0d%0aGET%20/secret.json%20HTTP/1.1%0d%0aHost:%20${FORBIDDEN_HOST}%0d%0a%0d%0a`,
    ],
  ];
  for (const [label, build] of encoded) {
    test(`C-INJ-1 — ${label} : aucun en-tête ni requête fabriqués chez l’amont`, async () => {
      const m = mark();
      const response = await call(`/${ALLOWED_HOST}${build(m)}`);
      assert.equal(response.headers['x-injecte'], undefined);
      noInjection(m);
      if (response.status === 200) {
        // Accepté : la séquence est restée ENCODÉE jusqu'à l'amont.
        for (const request of upstream.seen(m)) assert.doesNotMatch(request.url, /[\r\n]/);
      } else {
        assert.equal(response.status, 400);
      }
    });
  }

  for (const [label, separator] of [
    ['CR nu', '\r'],
    ['LF nu', '\n'],
    ['CR LF nus', '\r\n'],
  ]) {
    test(`C-INJ-1 — ${label} dans la cible de requête : aucun en-tête ni requête fabriqués chez l’amont`, async () => {
      const m = mark();
      const reply = await client.raw(
        `GET ${client.basePath}/${ALLOWED_HOST}/donnees.json?${m}${separator}X-Injecte: oui HTTP/1.1\r\nHost: ${client.hostHeader}\r\nConnection: close\r\n\r\n`
      );
      // Un analyseur HTTP peut lire ce qui suit le saut de ligne comme un en-tête
      // du VISITEUR : ce n'est une faille que si cet en-tête atteint l'amont. Le
      // relais de référence refuse (400), ce que vérifie tests/relay/reference/.
      assert.doesNotMatch(reply, /x-injecte/i, 'l’en-tête injecté revient dans la réponse');
      noInjection(m);
    });
  }
});

// ---------------------------------------------------------------------------
describe('En-têtes vers l’amont', () => {
  const forbiddenNames = [
    'cookie',
    'origin',
    'referer',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-real-ip',
    'forwarded',
    'accept-language',
    'range',
    'if-none-match',
    'if-modified-since',
    'x-temoin',
    'proxy-authorization',
  ];

  test('C-AMONT-1 — rien de ce qu’envoie le visiteur n’atteint l’amont', async () => {
    const m = mark();
    const response = await call(`/${ALLOWED_HOST}/donnees.json?${m}`, { headers: VISITOR });
    assert.equal(response.status, 200);
    const [request] = upstream.seen(m);
    assert.ok(request, 'l’amont n’a rien reçu');
    for (const name of forbiddenNames) {
      assert.equal(request.headers[name], undefined, `C-AMONT-1 : « ${name} » transmis à l’amont`);
    }
    assert.equal(
      request.headers.authorization,
      undefined,
      'C-AMONT-1 : Authorization du visiteur transmis'
    );
    const dump = JSON.stringify(request.headers);
    for (const value of VISITOR_MARKS) {
      assert.ok(!dump.includes(value), `C-AMONT-1 : « ${value} » transmis à l’amont`);
    }
  });

  test('C-AMONT-2 — la clé est posée par le relais sur l’hôte configuré, et seulement lui', async () => {
    const m = mark();
    const keyed = await call(`/${KEYED_HOST}${KEYED_PREFIX}donnees.json?${m}`, {
      headers: VISITOR,
    });
    assert.equal(keyed.status, 200);
    const [request] = upstream.seen(m);
    assert.equal(
      request.headers.authorization,
      `Apikey ${KEY}`,
      'la clé du relais, pas celle du visiteur'
    );

    const m2 = mark();
    await call(`/${ALLOWED_HOST}/donnees.json?${m2}`);
    assert.equal(
      upstream.seen(m2)[0].headers.authorization,
      undefined,
      'clé envoyée à un hôte sans clé'
    );
  });
});

// ---------------------------------------------------------------------------
describe('En-têtes vers le navigateur', () => {
  test('C-NAV-1 — Set-Cookie, Vary, CORS, quotas et signature de l’amont ne traversent pas', async () => {
    const m = mark();
    const response = await call(`/${ALLOWED_HOST}/donnees.json?${m}`);
    assert.equal(response.status, 200);
    // Le détail est dans `assertInvariants` ; ici, ce qui ne vaut que pour une 200.
    assert.doesNotMatch(String(response.headers.vary ?? ''), /cookie|host|accept-language|\*/i);
    assert.doesNotMatch(String(response.headers['cache-control']), /private/);
    assert.equal(response.headers['x-powered-by'], undefined);
  });

  test('C-NAV-2 — nosniff et CSP `default-src ’none’; sandbox` sur un succès comme sur une erreur', async () => {
    const ok = await call(`/${ALLOWED_HOST}/donnees.json?${mark()}`);
    const refused = await call(`/${FORBIDDEN_HOST}/donnees.json?${mark()}`);
    for (const response of [ok, refused]) {
      assert.equal(String(response.headers['x-content-type-options']).toLowerCase(), 'nosniff');
      assert.match(
        String(response.headers['content-security-policy']),
        /default-src 'none'.*sandbox/
      );
    }
  });

  for (const [label, path] of [
    ['HTML', '/page.html'],
    ['SVG', '/image.svg'],
    ['JavaScript', '/script.js'],
    ['réponse sans type', '/sans-type'],
  ]) {
    test(`C-NAV-3 — ${label} de l’amont : jamais servi sur l’origine du site (502)`, async () => {
      const response = await call(`/${ALLOWED_HOST}${path}?${mark()}`);
      assert.equal(response.status, 502);
      assert.ok(!response.text.includes('<script'), 'le corps de l’amont a été servi');
    });
  }

  for (const [label, path] of [
    ['`application/json+xml`', '/type/json-xml'],
    ['`application/jsonx`', '/type/json-prolonge'],
    ['`application/jsonp`', '/type/jsonp'],
    ['`application/xhtml+xml`', '/type/xhtml'],
    ['`text/xml`', '/type/xml'],
    ['`text/csvx`', '/type/csv-prolonge'],
    ['une liste de types', '/type/liste'],
    ['`application/octet-stream`', '/type/octets'],
  ]) {
    test(`C-NAV-3 — ${label} : le type est comparé EN ENTIER à la liste blanche (502)`, async () => {
      const response = await call(`/${ALLOWED_HOST}${path}?${mark()}`);
      assert.equal(response.status, 502);
      assert.ok(!response.text.includes('hors liste blanche'), 'le corps de l’amont a été servi');
    });
  }

  for (const [label, path, type] of [
    ['JSON', '/donnees.json', /^application\/json/],
    ['GeoJSON', '/geo.geojson', /^application\/geo\+json/],
    ['CSV', '/table.csv', /^text\/csv/],
  ]) {
    test(`C-NAV-3 — ${label} : type de la liste blanche, servi tel quel`, async () => {
      const response = await call(`/${ALLOWED_HOST}${path}?${mark()}`);
      assert.equal(response.status, 200);
      assert.match(String(response.headers['content-type']), type);
    });
  }

  test('C-NAV-4 — toute erreur porte l’en-tête CORS, sans Allow-Credentials', async () => {
    // Vérifié sur chaque réponse par `assertInvariants` ; ce test en nomme un échantillon.
    const statuses = [];
    statuses.push((await call(`/${FORBIDDEN_HOST}/x?${mark()}`)).status);
    statuses.push((await call(`/${ALLOWED_HOST}/statut/500?${mark()}`)).status);
    statuses.push((await call(`/${ALLOWED_HOST}/statut/404?${mark()}`)).status);
    statuses.push((await call(`/${ALLOWED_HOST}/x?${mark()}`, { method: 'DELETE' })).status);
    assert.deepEqual(statuses, [403, 502, 404, 405]);
  });

  test('C-NAV-5 — ETag et Last-Modified de l’amont : transmis tels quels, ou omis', async () => {
    const response = await call(`/${ALLOWED_HOST}/etag.json?${mark()}`);
    assert.equal(response.status, 200);
    if (response.headers.etag !== undefined) {
      assert.match(response.headers.etag, /^(W\/)?"version-1"$/);
    }
    if (response.headers['last-modified'] !== undefined) {
      assert.equal(response.headers['last-modified'], 'Thu, 01 Oct 2026 08:00:00 GMT');
    }
  });
});

// ---------------------------------------------------------------------------
describe('Cache', () => {
  /** Directives de `Cache-Control`, une par élément. */
  const directives = (response) =>
    String(response.headers['cache-control'])
      .split(',')
      .map((directive) => directive.trim());

  test('C-CACHE-1 — une 200 porte Cache-Control public, max-age, s-maxage, stale-while-revalidate, stale-if-error et Vary: Accept-Encoding', async () => {
    const response = await call(`/${ALLOWED_HOST}/donnees.json?${mark()}`);
    const cacheControl = String(response.headers['cache-control']);
    assert.match(cacheControl, /\bpublic\b/);
    assert.ok(
      directives(response).includes(`max-age=${profile.ttl}`),
      'durée par défaut du profil'
    );
    assert.match(cacheControl, /\bs-maxage=\d+\b/);
    assert.match(cacheControl, /\bstale-while-revalidate=\d+\b/);
    assert.match(cacheControl, /\bstale-if-error=\d+\b/);
    assert.match(String(response.headers.vary), /accept-encoding/i);
  });

  test('C-CACHE-1 — la durée se règle par hôte', async () => {
    const response = await call(`/${SECOND_HOST}/donnees.json?${mark()}`);
    assert.ok(directives(response).includes(`max-age=${profile.hosts[SECOND_HOST].ttl}`));
  });

  test('C-CACHE-2 — la clé de cache est l’URL seule : aucun en-tête du visiteur ne change la réponse', async () => {
    const m = mark();
    const path = `/${ALLOWED_HOST}/compteur?${m}`;
    // Premier visiteur : tous les en-têtes par lesquels on empoisonne un cache.
    const first = await call(path, {
      headers: {
        ...VISITOR,
        'X-Original-URL': '/autre',
        'X-HTTP-Method-Override': 'POST',
        'Accept-Encoding': 'gzip',
      },
    });
    const second = await call(path);
    for (const response of [first, second]) {
      assert.equal(
        response.status,
        200,
        'ni 206 ni 304 : Range et If-None-Match du visiteur sont ignorés'
      );
      assert.equal(typeof JSON.parse(response.text).n, 'number', 'corps complet');
    }
    if (HAS_CACHE) {
      assert.equal(
        upstream.seen(m).length,
        1,
        'la seconde requête devait être servie par le cache'
      );
      assert.equal(second.text, first.text);
    }
  });

  test('C-CACHE-2 — deux requêtes différentes, deux entrées : la requête fait partie de la clé', async () => {
    const m = mark();
    const one = await call(`/${ALLOWED_HOST}/compteur?${m}&page=1`);
    const two = await call(`/${ALLOWED_HOST}/compteur?${m}&page=2`);
    assert.equal(JSON.parse(one.text).n, 1);
    assert.equal(JSON.parse(two.text).n, 1);
    assert.equal(upstream.seen(m).length, 2);
  });

  test('C-CACHE-2 — même chemin, deux hôtes : l’hôte fait partie de la clé', async () => {
    const m = mark();
    const one = await call(`/${ALLOWED_HOST}/donnees.json?${m}`);
    const two = await call(`/${SECOND_HOST}/donnees.json?${m}`);
    assert.equal(JSON.parse(one.text).hote, ALLOWED_HOST);
    assert.equal(JSON.parse(two.text).hote, SECOND_HOST);
  });

  test('C-CACHE-3 — une 5xx de l’amont n’est jamais mise en cache : la requête suivante repart à l’amont', async () => {
    const m = mark();
    const path = `/${ALLOWED_HOST}/instable?${m}`;
    assert.equal((await call(path)).status, 502);
    const retry = await call(path);
    assert.equal(retry.status, 200);
    assert.equal(JSON.parse(retry.text).retabli, true);
    assert.equal(upstream.seen(m).length, 2);
  });

  test('C-CACHE-3 — une 429 de l’amont n’est jamais mise en cache', async () => {
    const m = mark();
    const path = `/${ALLOWED_HOST}/sollicite?${m}`;
    const limited = await call(path);
    assert.equal(limited.status, 429);
    assert.equal((await call(path)).status, 200);
    assert.equal(upstream.seen(m).length, 2);
  });

  test('C-CACHE-3 — une 404 de l’amont n’est jamais mise en cache', async () => {
    const m = mark();
    const path = `/${ALLOWED_HOST}/statut/404?${m}`;
    assert.equal((await call(path)).status, 404);
    assert.equal((await call(path)).status, 404);
    assert.equal(upstream.seen(m).length, 2);
  });

  test('C-CACHE-4 et C-CACHE-5 — cache borné, réponse périmée servie si l’amont tombe', (t) => {
    t.skip(
      'état interne du relais : éprouvé sur le relais de référence dans tests/relay/reference/relay.test.mjs'
    );
  });
});

// ---------------------------------------------------------------------------
describe('Erreurs — codes et barème de la bibliothèque', () => {
  const upstreamStatuses = [
    [400, 400, 'page-mal-reglee'],
    [401, 403, 'acces-restreint'],
    [403, 403, 'acces-restreint'],
    [404, 404, 'donnees-introuvables'],
    [410, 410, 'donnees-introuvables'],
    [429, 429, 'service-sollicite'],
    [500, 502, 'service-indisponible'],
    [502, 502, 'service-indisponible'],
    [503, 502, 'service-indisponible'],
  ];
  for (const [fromUpstream, expected, cause] of upstreamStatuses) {
    test(`C-ERR-1 — l’amont répond ${fromUpstream} : le relais répond ${expected} (${cause})`, async () => {
      const response = await call(`/${ALLOWED_HOST}/statut/${fromUpstream}?${mark()}`);
      assert.equal(response.status, expected);
    });
  }

  test('C-ERR-1 — hôte hors liste : 403 (acces-restreint) ; méthode refusée : 405 ; URL trop longue : 414', async () => {
    assert.equal((await call(`/${FORBIDDEN_HOST}/x?${mark()}`)).status, 403);
    assert.equal(
      (await call(`/${ALLOWED_HOST}/x?${mark()}`, { method: 'POST', body: 'x' })).status,
      405
    );
    assert.equal((await call(`/${ALLOWED_HOST}/x?${mark()}&q=${'a'.repeat(8200)}`)).status, 414);
  });

  test('C-ERR-2 — le corps d’une erreur ne reprend ni la réponse de l’amont ni la requête du visiteur', async () => {
    const m = mark();
    const response = await call(`/${ALLOWED_HOST}/statut/500?${m}&recherche=saisie-du-visiteur`, {
      headers: VISITOR,
    });
    assert.equal(response.status, 502);
    assert.ok(
      !response.text.includes('saisie-du-visiteur'),
      'la requête du visiteur est reprise dans l’erreur'
    );
    assert.ok(!response.text.includes('"statut"'), 'le corps de l’erreur de l’amont a été relayé');
  });
});

// ---------------------------------------------------------------------------
describe('Déni de service', () => {
  test('C-DOS-1 — amont trop lent : 504 au terme du délai, sans attendre la réponse', async () => {
    const started = Date.now();
    const response = await call(`/${ALLOWED_HOST}/lent?${mark()}`);
    const elapsed = Date.now() - started;
    assert.equal(response.status, 504);
    assert.ok(
      elapsed < SLOW_MS,
      `le relais a attendu ${elapsed} ms, l’amont répondait en ${SLOW_MS} ms`
    );
  });

  test('C-DOS-1 — le délai est GLOBAL : trois redirections lentes, chacune dans le délai, ne le rallongent pas', async () => {
    const m = mark();
    const started = Date.now();
    const response = await call(`/${ALLOWED_HOST}/redirection/lente/3?${m}`);
    const elapsed = Date.now() - started;
    // 504 au terme du délai ; 502 si le relais ne suit aucune redirection. Jamais
    // 200 : il aurait fallu attendre trois sauts, soit 1,8 fois le délai.
    assert.ok([502, 504].includes(response.status), `statut ${response.status}`);
    assert.ok(
      elapsed < TIMEOUT_MS * 1.5,
      `le relais a attendu ${elapsed} ms pour un délai de ${TIMEOUT_MS} ms`
    );
  });

  test('C-DOS-2 — réponse plus grosse que le plafond : 502, et la connexion à l’amont est coupée EN FLUX', async () => {
    const response = await call(`/${ALLOWED_HOST}/gros?${mark()}`);
    assert.equal(response.status, 502);
    const stream = upstream.bigStreams.at(-1);
    assert.ok(stream, 'l’amont n’a pas été contacté');
    // Le faux amont s'apprêtait à envoyer plafond + 32 Mo : s'il a tout envoyé,
    // c'est que le relais a téléchargé la réponse entière avant de la refuser.
    await sleep(200);
    assert.ok(stream.closedEarly, 'C-DOS-2 : le relais a laissé l’amont tout envoyer');
    assert.ok(
      stream.sent < stream.total,
      `C-DOS-2 : ${stream.sent} octets reçus sur ${stream.total}`
    );
  });

  test('C-DOS-2 — longueur déclarée au-delà du plafond : 502 sans lire le corps', async () => {
    const started = Date.now();
    const response = await call(`/${ALLOWED_HOST}/gros-declare?${mark()}`);
    assert.equal(response.status, 502);
    assert.ok(
      Date.now() - started < TIMEOUT_MS,
      'refus attendu dès les en-têtes, pas au terme du délai'
    );
  });

  test('C-DOS-4 — connexions et requêtes simultanées bornées', (t) => {
    t.skip(
      'état interne du relais : éprouvé sur le relais de référence dans tests/relay/reference/relay.test.mjs'
    );
  });

  // DERNIER test de la suite : il épuise le quota de l'adresse du banc.
  test('C-DOS-3 — limite de débit par adresse : 429 avec Retry-After', async (t) => {
    if (RATE_REQUESTS === 0) {
      t.skip('CONFORMANCE_RATE_REQUESTS=0');
      return;
    }
    const m = mark();
    const path = `/${ALLOWED_HOST}/donnees.json?${m}`;
    /** @type {import('./support/client.mjs').RelayResponse | undefined} */
    let limited;
    const budget = RATE_REQUESTS + 50;
    for (let sent = 0; sent < budget && !limited; sent += 25) {
      const batch = await Promise.all(Array.from({ length: 25 }, () => call(path)));
      limited = batch.find((response) => response.status === 429);
      for (const response of batch)
        assert.ok([200, 429].includes(response.status), `statut ${response.status}`);
    }
    assert.ok(limited, `aucune 429 après ${budget} requêtes (limite annoncée : ${RATE_REQUESTS})`);
    assert.match(String(limited.headers['retry-after']), /^\d+$/, 'Retry-After en secondes');
    t.diagnostic(`${responses} réponses vérifiées par les invariants sur l’ensemble de la suite`);
  });
});
