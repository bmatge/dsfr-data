// Observations sur un VRAI nginx (ADR-155, lot 3) — ce que la suite de conformance ne
// dit pas de l'extrait `proxy/relay/nginx/`.
//
// Lancé par `relais-nginx.test.ts` (job CI `relais-nginx`), jamais seul : il lui faut
// deux nginx en conteneur et le port du faux amont.
//
//   OBS_RELAIS_URL      l'extrait, durée de cache ramenée à UNE seconde (et trois
//                       `location` naïves) : on y regarde le cache périmé sans attendre
//   OBS_MANDATAIRE_URL  nginx placé devant le relais Node de référence, lancé ici
//
// Trois sujets :
//   1. ce qui TIENT derrière chaque limite documentée (`limites.mjs`) ;
//   2. ce que nginx fait d'une entrée périmée : C-CACHE-5 et C-CACHE-6, que la suite de
//      conformance ne peut pas voir (docs/RELAY.md §7) ;
//   3. ce que `proxy_pass` transmet à l'amont pour un chemin piégé, selon sa forme.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '../support/client.mjs';
import {
  ALLOWED_HOST,
  FORBIDDEN_HOST,
  KEYED_HOST,
  startFakeUpstream,
} from '../support/fake-upstream.mjs';
import { startReference } from '../support/reference.mjs';

const UPSTREAM_PORT = 18155;
/** Taille du flux `/gros` : petite, on ne veut que constater l'absence de plafond. */
const BIG_BYTES = 3 * 1024 * 1024;
/**
 * Une entrée valable une seconde est périmée au plus tard deux secondes après : nginx
 * compte en secondes entières.
 */
const PEREMPTION_MS = 2300;
/** Démarrage du nginx observé (posé par le pont) ; son cache est chargé une minute après. */
const STARTED_AT = Number(process.env.OBS_DEMARRE_A ?? Date.now());
const CACHE_LOADED_MS = 75_000;

/** @type {Awaited<ReturnType<typeof startFakeUpstream>>} */
let upstream;
/** @type {ReturnType<typeof createClient>} */
let relais;
/** @type {ReturnType<typeof createClient>} */
let mandataire;
/** @type {Awaited<ReturnType<typeof startReference>>} */
let reference;

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
let sequence = 0;
const mark = () => {
  sequence += 1;
  return `o${runId}x${sequence}x`;
};

/** Les en-têtes que porte toute réponse écrite par le relais. */
function assertRelayHeaders(response, label) {
  assert.equal(response.headers['access-control-allow-origin'], '*', `${label} : CORS`);
  assert.equal(response.headers['x-content-type-options'], 'nosniff', `${label} : nosniff`);
  assert.equal(
    response.headers['content-security-policy'],
    "default-src 'none'; sandbox",
    `${label} : CSP`
  );
  assert.equal(
    response.headers['access-control-expose-headers'],
    'Retry-After',
    `${label} : Access-Control-Expose-Headers`
  );
}

before(async () => {
  upstream = await startFakeUpstream({
    port: UPSTREAM_PORT,
    delayMs: 15_000,
    bigBytes: BIG_BYTES,
  });
  relais = createClient(
    new URL(process.env.OBS_RELAIS_URL ?? 'http://127.0.0.1:8167/donnees-relais')
  );
  mandataire = createClient(
    new URL(process.env.OBS_MANDATAIRE_URL ?? 'http://127.0.0.1:8166/donnees-relais')
  );
  // Le relais Node, là où mandataire-node.server.conf le cherche : 127.0.0.1:8155.
  reference = await startReference({
    upstreamPort: UPSTREAM_PORT,
    config: (profile) => ({
      ...profile,
      listen: { host: '127.0.0.1', port: 8155 },
      trustedProxies: ['127.0.0.1'],
      limits: { ...profile.limits, rateLimitRequests: 30 },
    }),
  });
});

after(async () => {
  await reference?.close();
  await upstream?.close();
});

// ---------------------------------------------------------------------------
describe('extrait nginx — ce qui tient derrière chaque limite documentée', () => {
  test('avant-routage — TRACE : nginx répond 405 lui-même, sans les en-têtes du relais, sans contacter l’amont', async () => {
    const m = mark();
    const response = await relais.call(`/${ALLOWED_HOST}/donnees.json?${m}`, { method: 'TRACE' });
    assert.equal(response.status, 405);
    assert.equal(upstream.seen(m).length, 0, 'l’amont a été contacté');
    assert.equal(
      response.headers['access-control-allow-origin'],
      undefined,
      'la limite est levée : retirer « avant-routage » de limites.mjs et des documents'
    );
  });

  test('avant-routage — `%00` : nginx répond 400 lui-même, sans contacter l’amont', async () => {
    for (const path of [
      `/${ALLOWED_HOST}%00/donnees.json`,
      `/${KEYED_HOST}/api/public/donnees.json%00.html`,
    ]) {
      const m = mark();
      const response = await relais.call(`${path}?${m}`);
      assert.equal(response.status, 400, path);
      assert.equal(upstream.seen(m).length, 0, `${path} : l’amont a été contacté`);
    }
  });

  test('type-de-contenu — un type hors liste est servi sous `application/octet-stream`, avec nosniff et la CSP, jamais sous son type', async () => {
    for (const path of [
      '/page.html',
      '/image.svg',
      '/script.js',
      '/sans-type',
      '/type/json-xml',
      '/type/json-prolonge',
      '/type/jsonp',
      '/type/xhtml',
      '/type/xml',
      '/type/csv-prolonge',
      '/type/liste',
      '/type/octets',
    ]) {
      const response = await relais.call(`/${ALLOWED_HOST}${path}?${mark()}`);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers['content-type'], 'application/octet-stream', path);
      assert.deepEqual(
        response.rawHeaders.filter((name, index) => index % 2 === 0 && /^content-type$/i.test(name))
          .length,
        1,
        `${path} : un seul Content-Type`
      );
      assertRelayHeaders(response, path);
    }
  });

  test('type-de-contenu — un type de la liste garde son jeu de caractères ; un jeu de caractères piégé fait retomber sur `application/octet-stream`', async () => {
    const json = await relais.call(`/${ALLOWED_HOST}/donnees.json?${mark()}`);
    assert.equal(json.headers['content-type'], 'application/json; charset=utf-8');
    const geo = await relais.call(`/${ALLOWED_HOST}/geo.geojson?${mark()}`);
    assert.equal(geo.headers['content-type'], 'application/geo+json');
    const hostile = await relais.call(`/${ALLOWED_HOST}/charset-hostile.json?${mark()}`);
    assert.equal(hostile.headers['content-type'], 'application/octet-stream');
  });

  test('memo-une-seconde — une 404 est retenue une seconde, pas plus, et reste `no-store`', async () => {
    const m = mark();
    const path = `/${ALLOWED_HOST}/statut/404?${m}`;
    const first = await relais.call(path);
    const second = await relais.call(path);
    assert.equal(first.status, 404);
    assert.equal(second.status, 404);
    assert.match(String(second.headers['cache-control']), /no-store/);
    assertRelayHeaders(second, 'mémo');
    assert.equal(upstream.seen(m).length, 1, 'la limite est levée : la 404 n’est plus retenue');
    await sleep(PEREMPTION_MS);
    assert.equal((await relais.call(path)).status, 404);
    assert.equal(upstream.seen(m).length, 2, 'passé la seconde, la requête repart à l’amont');
  });

  test('taille — nginx ne plafonne pas la taille : le flux est servi en entier', async () => {
    const response = await relais.call(`/${ALLOWED_HOST}/gros?${mark()}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.length, upstream.bigStreams.at(-1)?.total);
  });
});

// ---------------------------------------------------------------------------
describe('extrait nginx — le cache périmé (C-CACHE-5, C-CACHE-6)', () => {
  /** Première réponse (mise en cache), puis l'entrée périme. */
  async function primed(path) {
    const first = await relais.call(path);
    assert.equal(first.status, 200);
    assert.equal(first.headers['x-relay-cache'], 'MISS');
    await sleep(PEREMPTION_MS);
    return first;
  }

  test('C-CACHE-6 — LIMITE : dans la minute qui suit le démarrage de nginx, une donnée retirée est resservie à la panne suivante', async () => {
    // nginx ne charge son cache qu'une minute après avoir démarré. D'ici là il va
    // chercher sur disque l'entrée qu'il vient d'oublier, et y retrouve l'ancien fichier.
    assert.ok(
      Date.now() - STARTED_AT < 50_000,
      'trop tard pour observer la fenêtre de démarrage : le banc a pris plus de 50 s'
    );
    const m = mark();
    const path = `/${ALLOWED_HOST}/${m}/suite/200-404-500`;
    const first = await primed(path);
    assert.equal((await relais.call(path)).status, 404, 'la donnée a été retirée');
    await sleep(PEREMPTION_MS);
    const afterOutage = await relais.call(path);
    assert.equal(
      afterOutage.status,
      200,
      'la limite est levée : la retirer du README de l’extrait et de docs/RELAY.md'
    );
    assert.equal(afterOutage.headers['x-relay-cache'], 'STALE');
    assert.equal(afterOutage.text, first.text);
  });

  for (const failure of [500, 502, 503, 504, 429]) {
    test(`C-CACHE-5 — l’amont répond ${failure} : la réponse périmée est servie (STALE)`, async () => {
      const m = mark();
      const path = `/${ALLOWED_HOST}/${m}/suite/200-${failure}`;
      const first = await primed(path);
      const stale = await relais.call(path);
      assert.equal(stale.status, 200);
      assert.equal(stale.headers['x-relay-cache'], 'STALE');
      assert.equal(stale.text, first.text);
      assert.equal(upstream.seen(m).length, 2, 'l’amont a bien été redemandé');
    });
  }

  test('C-CACHE-5 — jamais sur une autre 4xx : un 400 de l’amont est rendu', async () => {
    const m = mark();
    const path = `/${ALLOWED_HOST}/${m}/suite/200-400`;
    await primed(path);
    assert.equal((await relais.call(path)).status, 400);
  });

  test('C-CACHE-1 — une réponse servie par le cache garde ses en-têtes de cache (HIT)', async () => {
    const path = `/${ALLOWED_HOST}/donnees.json?${mark()}`;
    await relais.call(path);
    const hit = await relais.call(path);
    assert.equal(hit.headers['x-relay-cache'], 'HIT');
    assert.match(String(hit.headers['cache-control']), /^public, max-age=300, s-maxage=300, /);
    assert.equal(hit.headers['content-type'], 'application/json; charset=utf-8');
  });
});

// ---------------------------------------------------------------------------
describe('extrait nginx — statuts et en-têtes', () => {
  for (const status of [402, 409, 418, 422, 451]) {
    test(`une ${status} de l’amont garde son statut, avec le corps du relais`, async () => {
      const response = await relais.call(`/${ALLOWED_HOST}/statut/${status}?${mark()}`);
      assert.equal(response.status, status);
      assert.equal(JSON.parse(response.text).error, 'upstream-rejected');
      assert.match(String(response.headers['cache-control']), /no-store/);
      assertRelayHeaders(response, String(status));
    });
  }

  test('`Retry-After` de l’amont est repris sur un 429, et `Access-Control-Expose-Headers` l’expose', async () => {
    const response = await relais.call(`/${ALLOWED_HOST}/sollicite?${mark()}`);
    assert.equal(response.status, 429);
    assert.equal(response.headers['retry-after'], '7');
    assertRelayHeaders(response, '429');
  });

  test('`Access-Control-Expose-Headers: Retry-After` est sur toute réponse du relais', async () => {
    assertRelayHeaders(await relais.call(`/${ALLOWED_HOST}/donnees.json?${mark()}`), '200');
    assertRelayHeaders(await relais.call(`/${FORBIDDEN_HOST}/donnees.json?${mark()}`), '403');
    assertRelayHeaders(
      await relais.call(`/${ALLOWED_HOST}/donnees.json?${mark()}`, { method: 'OPTIONS' }),
      '204'
    );
    assertRelayHeaders(
      await relais.call(`/${ALLOWED_HOST}/donnees.json?${mark()}`, { method: 'DELETE' }),
      '405'
    );
  });

  test('hôte sans barre finale : refusé par le relais, jamais une redirection de nginx', async () => {
    const response = await relais.call(`/${ALLOWED_HOST}`);
    assert.equal(response.status, 400);
    assertRelayHeaders(response, 'sans barre');
    const keyed = await relais.call(`/${KEYED_HOST}/api/public`);
    assert.equal(keyed.status, 403);
    assert.equal(keyed.headers.location, undefined);
  });

  test('préfixe de chemin : comparé à la cible BRUTE (`/api/%70ublic/` est refusé, comme par le relais Node)', async () => {
    const m = mark();
    const response = await relais.call(`/${KEYED_HOST}/api/%70ublic/donnees.json?${m}`);
    assert.equal(response.status, 403);
    assert.equal(upstream.seen(m).length, 0);
  });

  test('compression : gzip selon `Accept-Encoding`, une seule entrée de cache', async () => {
    const m = mark();
    const path = `/${ALLOWED_HOST}/donnees.json?${m}&remplissage=${'a'.repeat(400)}`;
    const plain = await relais.call(path);
    const zipped = await relais.call(path, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.equal(zipped.headers['content-encoding'], 'gzip');
    assert.equal(gunzipSync(zipped.body).toString('utf8'), plain.text);
    assert.match(String(zipped.headers.vary), /accept-encoding/i);
    assert.equal(upstream.seen(m).length, 1);
  });

  test('requête conditionnelle : nginx répond 304 à un validateur qui correspond (écart documenté à C-CACHE-2)', async (t) => {
    const path = `/${ALLOWED_HOST}/etag.json?${mark()}`;
    const full = await relais.call(path);
    assert.equal(full.status, 200);
    const conditional = await relais.call(path, { headers: { 'If-None-Match': '"version-1"' } });
    const other = await relais.call(path, { headers: { 'If-None-Match': '"autre"' } });
    t.diagnostic(
      `If-None-Match qui correspond : ${conditional.status} ; qui ne correspond pas : ${other.status} ; ETag servi : ${full.headers.etag}`
    );
    assert.equal(other.status, 200);
    assert.ok([200, 304].includes(conditional.status));
    // Le cache, lui, n'est pas touché : la requête suivante reçoit la réponse entière.
    assert.equal((await relais.call(path)).text, full.text);
  });

  test('un 2xx de l’amont autre que 200 : ni mis en cache, ni typé', async (t) => {
    const m = mark();
    const path = `/${ALLOWED_HOST}/statut/201?${m}`;
    const first = await relais.call(path);
    await relais.call(path);
    t.diagnostic(
      `201 de l’amont → ${first.status}, Content-Type : ${first.headers['content-type']}, Cache-Control : ${first.headers['cache-control']}`
    );
    assert.equal(upstream.seen(m).length, 2, 'un 201 a été mis en cache');
    assert.match(String(first.headers['cache-control']), /no-store/);
  });
});

// ---------------------------------------------------------------------------
describe('ce que `proxy_pass` transmet à l’amont pour un chemin piégé', () => {
  const traps = [
    ['remontée', 'a/../b'],
    ['remontée encodée', 'a/%2e%2e/b'],
    ['barre encodée', 'a%2fb'],
    ['remontée par barre encodée', 'a/..%2fb'],
    ['barre double', 'a//b'],
    ['segment point', 'a/./b'],
    ['paramètre de chemin', 'a/..;/b'],
    ['point-virgule encodé', 'a/..%3b/b'],
    ['point surlong', 'a/%c0%ae%c0%ae/b'],
    ['barre inverse', 'a\\..\\b'],
    ['double encodage', 'a/%252e%252e/b'],
    ['octets encodés en minuscules', 'caf%c3%a9'],
    ['espace encodé', 'a%20b'],
    ['caractère sûr encodé', '%61bc'],
  ];
  const forms = [
    ['avec URI (`proxy_pass http://amont/;`)', '/naif-uri/'],
    ['sans URI (`proxy_pass http://amont;`)', '/naif-brut/'],
    ['variable (`proxy_pass http://amont$request_uri;`)', '/naif-variable/'],
  ];

  /** @type {Record<string, Record<string, string>>} */
  const table = {};

  for (const [form, prefix] of forms) {
    test(`forme ${form}`, async (t) => {
      for (const [label, trap] of traps) {
        const m = mark();
        const response = await relais.call(`${prefix}${trap}?${m}`, { absolute: true });
        const seen = upstream.seen(m).map((request) => request.url.split('?', 1)[0]);
        table[label] ??= {};
        table[label][prefix] = seen.length === 0 ? `(${response.status})` : seen.join(' ');
        t.diagnostic(`${prefix}${trap}  →  ${table[label][prefix]}`);
      }
    });
  }

  test('l’extrait : la cible admise arrive octet pour octet, la cible piégée n’arrive pas', async (t) => {
    for (const [label, trap] of traps) {
      const m = mark();
      const response = await relais.call(`/${ALLOWED_HOST}/${trap}?${m}`);
      const seen = upstream.seen(m).map((request) => request.url.split('?', 1)[0]);
      t.diagnostic(
        `extrait /${trap}  →  ${seen.length === 0 ? `(${response.status})` : seen.join(' ')}`
      );
      if (response.status === 200) {
        assert.deepEqual(seen, [`/${trap}`], `${label} : la cible a été réécrite`);
      } else {
        assert.equal(response.status, 400, label);
        assert.equal(seen.length, 0, `${label} : refusée, mais l’amont a été contacté`);
      }
    }
  });

  test('le tableau du README de l’extrait est ce que nginx fait', () => {
    const row = (label) => [
      table[label]['/naif-uri/'],
      table[label]['/naif-brut/'],
      table[label]['/naif-variable/'],
    ];
    // Avec URI : nginx résout la remontée, fusionne les barres, décode `%2f` en barre, et
    // réencode à sa façon — la cible n'arrive pas octet pour octet (C-URL-1).
    // Sans URI et par variable : la forme brute arrive telle quelle, remontée comprise.
    assert.deepEqual(row('remontée'), ['/b', '/naif-brut/a/../b', '/naif-variable/a/../b']);
    assert.deepEqual(row('remontée encodée'), [
      '/b',
      '/naif-brut/a/%2e%2e/b',
      '/naif-variable/a/%2e%2e/b',
    ]);
    assert.deepEqual(row('barre encodée'), ['/a/b', '/naif-brut/a%2fb', '/naif-variable/a%2fb']);
    assert.deepEqual(row('barre double'), ['/a/b', '/naif-brut/a//b', '/naif-variable/a//b']);
    assert.deepEqual(row('octets encodés en minuscules'), [
      '/caf%C3%A9',
      '/naif-brut/caf%c3%a9',
      '/naif-variable/caf%c3%a9',
    ]);
    assert.deepEqual(row('caractère sûr encodé'), [
      '/abc',
      '/naif-brut/%61bc',
      '/naif-variable/%61bc',
    ]);
  });

  test('`proxy_pass_request_body off` retire le corps, pas sa longueur : l’amont reçoit un `Content-Length` sans corps', async () => {
    const m = mark();
    await relais.call(`/naif-corps/x?${m}`, { absolute: true, body: 'corps-du-visiteur' });
    const [request] = upstream.seen(m);
    assert.equal(request.headers['content-length'], '17');
    assert.equal(request.bodyBytes, 0);
  });

  test('l’extrait : un GET avec corps est refusé (400), et la requête suivante n’en souffre pas', async () => {
    const m = mark();
    const path = `/${ALLOWED_HOST}/donnees.json?${m}`;
    const refused = await relais.call(path, { body: 'corps-du-visiteur' });
    assert.equal(refused.status, 400);
    assert.equal(JSON.parse(refused.text).error, 'body-not-allowed');
    assert.equal(upstream.seen(m).length, 0);
    assertRelayHeaders(refused, 'corps');
    for (let index = 0; index < 12; index += 1) {
      const head = await relais.call(`/${ALLOWED_HOST}/donnees.json?${mark()}`, { method: 'HEAD' });
      assert.equal(head.status, 200, 'la connexion vers l’amont a été désynchronisée');
    }
  });
});

// ---------------------------------------------------------------------------
describe('nginx placé devant le relais Node (mandataire-node.*.conf)', () => {
  test('un 429 n’est pas retenu par le cache placé devant ; une 200 l’est', async () => {
    const m = mark();
    const path = `/${ALLOWED_HOST}/${m}/sollicite`;
    const handled = () => reference.logs.filter((record) => String(record.path).includes(m));
    assert.equal((await mandataire.call(path)).status, 429);
    assert.equal((await mandataire.call(path)).status, 200);
    assert.equal(handled().length, 2, 'le 429 a été servi par le cache de nginx');
    assert.equal((await mandataire.call(path)).status, 200);
    assert.equal(handled().length, 2, 'la 200 n’a pas été mise en cache par nginx');
  });

  test('C-DOS-5 — nginx POSE `X-Forwarded-For` : trente adresses forgées, un seul quota', async () => {
    const statuses = [];
    for (let index = 0; index < 60; index += 1) {
      const response = await mandataire.call(`/${ALLOWED_HOST}/donnees.json?${mark()}`, {
        headers: { 'X-Forwarded-For': `198.51.100.${index + 1}` },
      });
      statuses.push(response.status);
    }
    assert.ok(
      statuses.includes(429),
      'aucun 429 : chaque adresse forgée a eu son quota, nginx transmet l’en-tête du client'
    );
    assert.deepEqual(reference.warnings, [], 'le relais a vu une requête sans X-Forwarded-For');
  });
});

// ---------------------------------------------------------------------------
// En DERNIER : il faut que nginx ait chargé son cache, une minute après son démarrage.
describe('extrait nginx — la purge (C-CACHE-6), cache chargé', () => {
  before(async () => {
    const remaining = STARTED_AT + CACHE_LOADED_MS - Date.now();
    if (remaining > 0) await sleep(remaining);
  });

  for (const [gone, expected] of [
    [401, 403],
    [403, 403],
    [404, 404],
    [410, 410],
  ]) {
    test(`C-CACHE-6 — l’amont répond ${gone}, puis tombe : 502, pas l’ancienne donnée`, async () => {
      const m = mark();
      const path = `/${ALLOWED_HOST}/${m}/suite/200-${gone}-500`;
      const first = await relais.call(path);
      assert.equal(first.status, 200);
      await sleep(PEREMPTION_MS);
      assert.equal((await relais.call(path)).status, expected, 'la donnée a été retirée');
      await sleep(PEREMPTION_MS);
      const afterOutage = await relais.call(path);
      assert.equal(
        afterOutage.status,
        502,
        'C-CACHE-6 : la panne qui suit un retrait ressert la donnée retirée'
      );
      assert.equal(upstream.seen(m).length, 3);
    });
  }

  test('C-CACHE-5 tient toujours une fois le cache chargé : STALE sur une panne', async () => {
    const m = mark();
    const path = `/${ALLOWED_HOST}/${m}/suite/200-500`;
    const first = await relais.call(path);
    await sleep(PEREMPTION_MS);
    const stale = await relais.call(path);
    assert.equal(stale.status, 200);
    assert.equal(stale.headers['x-relay-cache'], 'STALE');
    assert.equal(stale.text, first.text);
  });
});
