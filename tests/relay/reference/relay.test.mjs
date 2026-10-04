// Relais de référence (ADR-155) — ce que la suite de conformance ne peut pas
// provoquer de l'extérieur : résolution DNS vers une adresse privée, rebond DNS,
// état du cache, horloge, journaux, saturation. Contrat : docs/RELAY.md.
//
// Le relais est le code de production ; seuls la résolution, la connexion,
// l'horloge et le journal sont substitués (tests/relay/support/reference.mjs).

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '../support/client.mjs';
import {
  ALLOWED_HOST,
  FORBIDDEN_HOST,
  KEYED_HOST,
  SECOND_HOST,
  startFakeUpstream,
} from '../support/fake-upstream.mjs';
import { CONFORMANCE_KEY } from '../support/profile.mjs';
import { PUBLIC_TEST_ADDRESS, startReference } from '../support/reference.mjs';

const SLOW_MS = 400;

/** @type {Awaited<ReturnType<typeof startFakeUpstream>>} */
let upstream;
before(async () => {
  upstream = await startFakeUpstream({ delayMs: SLOW_MS, bigBytes: 8 * 1024 * 1024 });
});
after(async () => {
  await upstream.close();
});

let sequence = 0;
const mark = () => {
  sequence += 1;
  return `r${sequence}x`;
};

/**
 * @param {Omit<Parameters<typeof startReference>[0], 'upstreamPort'>} options
 * @param {(reference: Awaited<ReturnType<typeof startReference>>, client: ReturnType<typeof createClient>) => Promise<void>} run
 */
async function withRelay(options, run) {
  const reference = await startReference({ upstreamPort: upstream.port, ...options });
  try {
    await run(reference, createClient(reference.url));
  } finally {
    await reference.close();
  }
}

const withLimits = (limits) => (profile) => ({
  ...profile,
  limits: { ...profile.limits, ...limits },
});
const errorCode = (response) => JSON.parse(response.text).error;

// ---------------------------------------------------------------------------
describe('C-SSRF-6 — l’adresse, après résolution DNS', () => {
  const privateAddresses = [
    ['boucle locale', '127.0.0.1', 4],
    ['réseau privé', '10.0.0.7', 4],
    ['réseau privé', '192.168.1.10', 4],
    ['métadonnées d’hébergeur', '169.254.169.254', 4],
    ['adresse nulle', '0.0.0.0', 4],
    ['boucle locale IPv6', '::1', 6],
    ['lien local IPv6', 'fe80::1', 6],
    ['locale unique IPv6', 'fd00::1', 6],
    ['IPv4 mappée', '::ffff:127.0.0.1', 6],
  ];
  for (const [label, address, family] of privateAddresses) {
    test(`un hôte AUTORISÉ qui résout vers ${label} (${address}) : 502, aucune connexion ouverte`, async () => {
      await withRelay({ resolve: async () => [{ address, family }] }, async (reference, client) => {
        const m = mark();
        const response = await client.call(`/${ALLOWED_HOST}/donnees.json?${m}`);
        assert.equal(response.status, 502);
        assert.equal(errorCode(response), 'upstream-address-forbidden');
        assert.equal(reference.connections.length, 0);
        assert.equal(upstream.seen(m).length, 0);
      });
    });
  }

  test('un nom qui mêle adresse publique et adresse privée : refusé en bloc', async () => {
    const mixed = async () => [
      { address: PUBLIC_TEST_ADDRESS, family: 4 },
      { address: '10.0.0.7', family: 4 },
    ];
    await withRelay({ resolve: mixed }, async (reference, client) => {
      const response = await client.call(`/${ALLOWED_HOST}/donnees.json?${mark()}`);
      assert.equal(response.status, 502);
      assert.equal(reference.connections.length, 0);
    });
  });

  test('rebond DNS : la connexion part vers l’adresse VÉRIFIÉE, le nom n’est résolu qu’une fois', async () => {
    // Le résolveur répond une adresse publique à la première question, privée ensuite :
    // un relais qui vérifierait puis laisserait le système résoudre à nouveau serait pris.
    let asked = 0;
    const rebinding = async () => {
      asked += 1;
      return [{ address: asked === 1 ? PUBLIC_TEST_ADDRESS : '127.0.0.1', family: 4 }];
    };
    await withRelay({ resolve: rebinding }, async (reference, client) => {
      const first = await client.call(`/${ALLOWED_HOST}/donnees.json?${mark()}`);
      assert.equal(first.status, 200);
      assert.equal(asked, 1, 'une seule résolution par requête vers l’amont');
      assert.deepEqual(reference.connections, [
        { address: PUBLIC_TEST_ADDRESS, hostname: ALLOWED_HOST },
      ]);

      const second = await client.call(`/${ALLOWED_HOST}/donnees.json?${mark()}`);
      assert.equal(second.status, 502);
      assert.equal(errorCode(second), 'upstream-address-forbidden');
      assert.equal(reference.connections.length, 1, 'aucune connexion vers l’adresse privée');
    });
  });

  test('résolution impossible ou vide : 502, aucune connexion', async () => {
    const failing = async () => {
      throw new Error('ENOTFOUND');
    };
    await withRelay({ resolve: failing }, async (reference, client) => {
      const response = await client.call(`/${ALLOWED_HOST}/donnees.json?${mark()}`);
      assert.equal(response.status, 502);
      assert.equal(errorCode(response), 'upstream-unreachable');
      assert.equal(reference.connections.length, 0);
    });
    await withRelay({ resolve: async () => [] }, async (reference, client) => {
      assert.equal((await client.call(`/${ALLOWED_HOST}/donnees.json?${mark()}`)).status, 502);
      assert.equal(reference.connections.length, 0);
    });
  });

  test('une résolution qui ne répond pas : 504 au terme du délai', async () => {
    const hanging = () => new Promise(() => {});
    await withRelay(
      { resolve: hanging, config: withLimits({ timeoutMs: 150 }) },
      async (reference, client) => {
        const response = await client.call(`/${ALLOWED_HOST}/donnees.json?${mark()}`);
        assert.equal(response.status, 504);
        assert.equal(errorCode(response), 'upstream-timeout');
      }
    );
  });
});

// ---------------------------------------------------------------------------
describe('C-SSRF-7 — redirections sur le relais de référence', () => {
  test('redirection vers un hôte autorisé : suivie, et l’hôte d’arrivée est résolu et vérifié à son tour', async () => {
    await withRelay({}, async (reference, client) => {
      const response = await client.call(`/${ALLOWED_HOST}/redirection/second?${mark()}`);
      assert.equal(response.status, 200);
      assert.equal(JSON.parse(response.text).hote, SECOND_HOST);
      assert.deepEqual(reference.resolutions, [ALLOWED_HOST, SECOND_HOST]);
      assert.deepEqual(
        reference.connections.map((connection) => connection.hostname),
        [ALLOWED_HOST, SECOND_HOST]
      );
    });
  });

  test('redirection vers un hôte autorisé qui résout vers une adresse privée : 502, aucune connexion vers lui', async () => {
    const resolve = async (hostname) => [
      { address: hostname === SECOND_HOST ? '10.0.0.7' : PUBLIC_TEST_ADDRESS, family: 4 },
    ];
    await withRelay({ resolve }, async (reference, client) => {
      const response = await client.call(`/${ALLOWED_HOST}/redirection/second?${mark()}`);
      assert.equal(response.status, 502);
      assert.equal(errorCode(response), 'upstream-address-forbidden');
      assert.deepEqual(
        reference.connections.map((connection) => connection.hostname),
        [ALLOWED_HOST]
      );
    });
  });

  test('redirection relative, et chaîne de trois : suivies ; chaîne de quatre : refusée', async () => {
    await withRelay({}, async (reference, client) => {
      assert.equal(
        (await client.call(`/${ALLOWED_HOST}/redirection/relative?${mark()}`)).status,
        200
      );
      const three = await client.call(`/${ALLOWED_HOST}/redirection/chaine/3`);
      assert.equal(three.status, 200);
      assert.equal(JSON.parse(three.text).chaine, 'arrivee');
      const four = await client.call(`/${ALLOWED_HOST}/redirection/chaine/4`);
      assert.equal(four.status, 502);
      assert.equal(errorCode(four), 'upstream-redirect-refused');
    });
  });

  test('`maxRedirects: 0` : aucune redirection n’est suivie, même vers un hôte autorisé', async () => {
    await withRelay({ config: withLimits({ maxRedirects: 0 }) }, async (reference, client) => {
      const response = await client.call(`/${ALLOWED_HOST}/redirection/second?${mark()}`);
      assert.equal(response.status, 502);
      assert.deepEqual(reference.resolutions, [ALLOWED_HOST]);
    });
  });

  test('la clé de l’hôte de départ ne suit pas la redirection ; l’hôte d’arrivée reçoit la sienne, ou rien', async () => {
    await withRelay({}, async (reference, client) => {
      const m = mark();
      const response = await client.call(`/${KEYED_HOST}/api/public/redirection/second?${m}`);
      assert.equal(response.status, 200);
      const arrival = upstream.requests.filter((request) => request.host === SECOND_HOST).at(-1);
      assert.equal(arrival.headers.authorization, undefined);
    });
  });
});

// ---------------------------------------------------------------------------
describe('C-AMONT-1 — en-têtes envoyés à l’amont par le relais de référence', () => {
  test('exactement Host, Accept, Accept-Encoding, User-Agent, Connection — et la clé sur l’hôte à clé', async () => {
    await withRelay({}, async (reference, client) => {
      const m = mark();
      await client.call(`/${ALLOWED_HOST}/donnees.json?${m}`, {
        headers: { Cookie: 'a=b', Accept: 'text/html', 'X-Forwarded-For': '203.0.113.77' },
      });
      assert.deepEqual(upstream.seen(m)[0].headers, {
        host: ALLOWED_HOST,
        accept: 'application/json, application/geo+json, text/csv;q=0.9, */*;q=0.1',
        'accept-encoding': 'identity',
        'user-agent': 'dsfr-data-relay',
        connection: 'close',
      });
      const m2 = mark();
      await client.call(`/${KEYED_HOST}/api/public/donnees.json?${m2}`);
      assert.deepEqual(Object.keys(upstream.seen(m2)[0].headers).sort(), [
        'accept',
        'accept-encoding',
        'authorization',
        'connection',
        'host',
        'user-agent',
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
describe('C-FUITE-1 — la clé ne sort pas, même si l’amont la renvoie', () => {
  test('un amont qui renvoie les en-têtes reçus : 502, rien n’est servi ni mis en cache', async () => {
    await withRelay({}, async (reference, client) => {
      for (const name of ['reflet.json', 'cle-nue.json']) {
        const response = await client.call(`/${KEYED_HOST}/api/public/${name}?${mark()}`);
        assert.equal(response.status, 502);
        assert.equal(errorCode(response), 'upstream-leak');
        assert.ok(!response.text.includes(CONFORMANCE_KEY));
      }
      assert.equal(reference.relay.cache.size, 0);
    });
  });

  test('une réponse compressée que le relais n’a pas demandée : 502', async () => {
    await withRelay({}, async (reference, client) => {
      const response = await client.call(`/${ALLOWED_HOST}/compresse.json?${mark()}`);
      assert.equal(response.status, 502);
      assert.equal(errorCode(response), 'upstream-encoding');
    });
  });
});

// ---------------------------------------------------------------------------
describe('C-INJ-1 — refus stricts du relais de référence', () => {
  test('LF nu dans la cible (ligne de requête sans version) : 400', async () => {
    await withRelay({}, async (reference, client) => {
      const m = mark();
      const reply = await client.raw(
        `GET ${client.basePath}/${ALLOWED_HOST}/donnees.json?${m}\nX-Injecte: oui HTTP/1.1\r\nHost: relais\r\nConnection: close\r\n\r\n`
      );
      assert.match(reply, /^HTTP\/1\.1 400 /);
      assert.match(
        reply,
        /access-control-allow-origin: \*/i,
        'une erreur d’analyse porte aussi l’en-tête CORS'
      );
      assert.equal(upstream.seen(m).length, 0);
    });
  });
  test('CR nu dans la cible : 400 avec l’en-tête CORS', async () => {
    await withRelay({}, async (reference, client) => {
      const m = mark();
      const reply = await client.raw(
        `GET ${client.basePath}/${ALLOWED_HOST}/donnees.json?${m}\rX-Injecte: oui HTTP/1.1\r\nHost: relais\r\n\r\n`
      );
      assert.match(reply, /^HTTP\/1\.1 400 /);
      assert.match(reply, /access-control-allow-origin: \*/i);
      assert.match(reply, /x-content-type-options: nosniff/i);
      assert.equal(upstream.seen(m).length, 0);
    });
  });
  test('CR LF encodés, dans le chemin comme dans la requête : 400', async () => {
    await withRelay({}, async (reference, client) => {
      const m = mark();
      for (const path of [
        `/donnees.json%0d%0aX-Injecte:%20oui?${m}`,
        `/donnees.json?${m}&x=%0d%0aX-Injecte:%20oui`,
      ]) {
        assert.equal((await client.call(`/${ALLOWED_HOST}${path}`)).status, 400);
      }
      assert.equal(upstream.seen(m).length, 0);
    });
  });
});

// ---------------------------------------------------------------------------
describe('Cache du relais de référence', () => {
  test('C-CACHE-2 — N visiteurs simultanés sur la même URL : une seule requête vers l’amont', async () => {
    await withRelay({}, async (reference, client) => {
      const m = mark();
      const responses = await Promise.all(
        Array.from({ length: 8 }, () => client.call(`/${ALLOWED_HOST}/lent?${m}`))
      );
      for (const response of responses) assert.equal(response.status, 200);
      assert.equal(upstream.seen(m).length, 1);
    });
  });

  test('C-CACHE-2 — succès servi par le cache : HIT, avec son âge', async () => {
    let clock = 1_800_000_000_000;
    await withRelay({ now: () => clock }, async (reference, client) => {
      const path = `/${ALLOWED_HOST}/compteur?${mark()}`;
      const miss = await client.call(path);
      assert.equal(miss.headers['x-relay-cache'], 'MISS');
      assert.equal(miss.headers.age, undefined);
      clock += 42_000;
      const hit = await client.call(path);
      assert.equal(hit.headers['x-relay-cache'], 'HIT');
      assert.equal(hit.headers.age, '42');
      assert.equal(hit.text, miss.text);
    });
  });

  test('C-CACHE-4 — cache borné en nombre d’entrées : la moins récemment servie part la première', async () => {
    await withRelay({ config: withLimits({ cacheMaxEntries: 3 }) }, async (reference, client) => {
      const m = mark();
      const path = (index) => `/${ALLOWED_HOST}/compteur?${m}&i=${index}`;
      for (let index = 0; index < 3; index += 1) await client.call(path(index));
      await client.call(path(0)); // 0 redevient la plus récente : c'est 1 qui partira.
      for (let index = 3; index < 6; index += 1) await client.call(path(index));
      assert.equal(reference.relay.cache.size, 3);
      assert.equal((await client.call(path(5))).headers['x-relay-cache'], 'HIT');
      assert.equal((await client.call(path(1))).headers['x-relay-cache'], 'MISS');
    });
  });

  test('C-CACHE-4 — cache borné en octets, quel que soit le nombre d’URL demandées', async () => {
    const maxBytes = 4096;
    await withRelay(
      { config: withLimits({ cacheMaxBytes: maxBytes }) },
      async (reference, client) => {
        const m = mark();
        for (let index = 0; index < 40; index += 1) {
          await client.call(`/${ALLOWED_HOST}/compteur?${m}&aleatoire=${index}`);
          assert.ok(
            reference.relay.cache.bytes <= maxBytes,
            `cache à ${reference.relay.cache.bytes} octets`
          );
        }
        assert.ok(reference.relay.cache.size > 0 && reference.relay.cache.size < 40);
      }
    );
  });

  test('C-CACHE-4 — une réponse plus grosse que le cache est servie, pas gardée', async () => {
    await withRelay({ config: withLimits({ cacheMaxBytes: 100 }) }, async (reference, client) => {
      const path = `/${ALLOWED_HOST}/compteur?${mark()}`;
      assert.equal((await client.call(path)).status, 200);
      assert.equal(reference.relay.cache.size, 0);
      assert.equal(reference.relay.cache.bytes, 0);
    });
  });

  test('C-CACHE-5 — l’amont tombe : la réponse périmée est servie (STALE), puis plus rien passé la fenêtre', async () => {
    let clock = 1_800_000_000_000;
    await withRelay({ now: () => clock }, async (reference, client) => {
      const host = reference.config.hosts.get(ALLOWED_HOST);
      const m = mark();
      const path = `/${ALLOWED_HOST}/fragile?${m}`;

      const fresh = await client.call(path);
      assert.equal(fresh.status, 200);
      assert.equal(fresh.headers['x-relay-cache'], 'MISS');

      // Encore fraîche : l'amont n'est pas rappelé.
      clock += (host.sharedTtl - 1) * 1000;
      assert.equal((await client.call(path)).headers['x-relay-cache'], 'HIT');
      assert.equal(upstream.seen(m).length, 1);

      // Périmée, l'amont répond 500 : on sert ce qu'on a.
      clock += 2000;
      const stale = await client.call(path);
      assert.equal(stale.status, 200);
      assert.equal(stale.headers['x-relay-cache'], 'STALE');
      assert.equal(stale.text, fresh.text);
      assert.equal(stale.headers.age, String(host.sharedTtl + 1));
      assert.equal(upstream.seen(m).length, 2);

      // Passé la fenêtre `stale-if-error` : l'erreur, et rien d'autre.
      clock += host.staleIfError * 1000;
      const gone = await client.call(path);
      assert.equal(gone.status, 502);
      assert.match(gone.headers['cache-control'], /no-store/);
    });
  });
});

// ---------------------------------------------------------------------------
describe('C-DOS — plafonds du relais de référence', () => {
  test('C-DOS-4 — requêtes simultanées vers l’amont bornées : au-delà, 503 avec Retry-After', async () => {
    await withRelay(
      { config: withLimits({ maxUpstreamRequests: 1 }) },
      async (reference, client) => {
        const slow = client.call(`/${ALLOWED_HOST}/lent?${mark()}`);
        await sleep(50);
        const m = mark();
        const busy = await client.call(`/${ALLOWED_HOST}/donnees.json?${m}`);
        assert.equal(busy.status, 503);
        assert.equal(errorCode(busy), 'relay-busy');
        assert.equal(busy.headers['retry-after'], '1');
        assert.equal(busy.headers['access-control-allow-origin'], '*');
        assert.equal(upstream.seen(m).length, 0);
        assert.equal((await slow).status, 200);
        assert.equal((await client.call(`/${ALLOWED_HOST}/donnees.json?${m}`)).status, 200);
      }
    );
  });

  test('C-DOS-4 — connexions simultanées bornées : au-delà, la connexion est refusée', async () => {
    await withRelay({ config: withLimits({ maxConnections: 2 }) }, async (reference, client) => {
      const port = Number(reference.url.port);
      const idle = await Promise.all(
        [0, 1].map(
          () =>
            new Promise((resolve, reject) => {
              const socket = net.connect(port, '127.0.0.1', () => resolve(socket));
              socket.on('error', reject);
            })
        )
      );
      await sleep(50);
      await assert.rejects(client.call(`/${ALLOWED_HOST}/donnees.json?${mark()}`));
      for (const socket of idle) socket.destroy();
      await sleep(50);
      assert.equal((await client.call(`/${ALLOWED_HOST}/donnees.json?${mark()}`)).status, 200);
    });
  });

  test('C-DOS-3 — limite de débit : la fenêtre se rouvre à son terme', async () => {
    let clock = 1_800_000_000_000;
    const config = withLimits({ rateLimitRequests: 3, rateLimitWindowSeconds: 10 });
    await withRelay({ now: () => clock, config }, async (reference, client) => {
      const path = `/${ALLOWED_HOST}/donnees.json?${mark()}`;
      for (let index = 0; index < 3; index += 1)
        assert.equal((await client.call(path)).status, 200);
      const limited = await client.call(path);
      assert.equal(limited.status, 429);
      assert.equal(errorCode(limited), 'rate-limited');
      assert.equal(limited.headers['retry-after'], '10');
      // La limite vaut aussi pour OPTIONS et pour une cible refusée.
      assert.equal((await client.call(`/${FORBIDDEN_HOST}/x`)).status, 429);
      assert.equal((await client.call(path, { method: 'OPTIONS' })).status, 429);
      clock += 10_000;
      assert.equal((await client.call(path)).status, 200);
    });
  });

  test('C-DOS-3 — `X-Forwarded-For` n’est lu que d’un mandataire de confiance déclaré', async () => {
    const limits = withLimits({ rateLimitRequests: 2 });
    const from = (address) => ({ headers: { 'X-Forwarded-For': `198.51.100.250, ${address}` } });

    // Sans mandataire de confiance : l'en-tête est ignoré, on ne s'invente pas une adresse neuve.
    await withRelay({ config: limits }, async (reference, client) => {
      const path = `/${ALLOWED_HOST}/donnees.json?${mark()}`;
      assert.equal((await client.call(path, from('198.51.100.1'))).status, 200);
      assert.equal((await client.call(path, from('198.51.100.2'))).status, 200);
      assert.equal((await client.call(path, from('198.51.100.3'))).status, 429);
    });

    // Derrière un mandataire déclaré : c'est la dernière adresse, celle qu'il a posée, qui compte.
    const trusting = (profile) => ({ ...limits(profile), trustedProxies: ['127.0.0.1'] });
    await withRelay({ config: trusting }, async (reference, client) => {
      const path = `/${ALLOWED_HOST}/donnees.json?${mark()}`;
      assert.equal((await client.call(path, from('198.51.100.1'))).status, 200);
      assert.equal((await client.call(path, from('198.51.100.1'))).status, 200);
      assert.equal((await client.call(path, from('198.51.100.1'))).status, 429);
      assert.equal((await client.call(path, from('198.51.100.2'))).status, 200);
    });
  });
});

// ---------------------------------------------------------------------------
describe('C-FUITE-2 — journaux', () => {
  const visitor = {
    Cookie: 'session=temoin-cookie-visiteur',
    Authorization: 'Bearer temoin-autorisation-visiteur',
    'X-Forwarded-For': '203.0.113.77',
    Referer: 'https://temoin-origine.conformance.test/',
    'User-Agent': 'temoin-navigateur/1.0',
  };

  async function exercise(client) {
    await client.call(`/${KEYED_HOST}/api/public/donnees.json?recherche=saisie-du-visiteur`, {
      headers: visitor,
    });
    await client.call(`/${KEYED_HOST}/api/public/reflet.json?recherche=saisie-du-visiteur`, {
      headers: visitor,
    });
    await client.call(`/${KEYED_HOST}/api/prive/chemin-refuse-du-visiteur`, { headers: visitor });
    await client.call(`/hote-choisi-par-le-visiteur.conformance.test/x`, { headers: visitor });
    await client.call(`/${ALLOWED_HOST}/statut/500?recherche=saisie-du-visiteur`, {
      headers: visitor,
    });
    await client.call(`/${ALLOWED_HOST}/donnees.json`, {
      method: 'POST',
      body: 'corps',
      headers: visitor,
    });
    return 6;
  }

  test('une ligne par requête ; ni clé, ni adresse du visiteur, ni en-têtes, ni requête, ni hôte ou chemin refusés', async () => {
    await withRelay(
      { config: (profile) => ({ ...profile, trustedProxies: ['127.0.0.1'] }) },
      async (reference, client) => {
        const count = await exercise(client);
        assert.equal(reference.logs.length, count);
        const dump = JSON.stringify(reference.logs);
        for (const secret of [
          CONFORMANCE_KEY,
          '127.0.0.1',
          '203.0.113.77',
          'temoin-',
          'saisie-du-visiteur',
          'hote-choisi-par-le-visiteur',
          'chemin-refuse-du-visiteur',
        ]) {
          assert.ok(!dump.includes(secret), `« ${secret} » figure dans le journal`);
        }
        assert.deepEqual(
          reference.logs.map((record) => [record.status, record.error, record.host, record.path]),
          [
            [200, undefined, KEYED_HOST, '/api/public/donnees.json'],
            [502, 'upstream-leak', KEYED_HOST, '/api/public/reflet.json'],
            [403, 'path-not-allowed', KEYED_HOST, undefined],
            [403, 'host-not-allowed', undefined, undefined],
            [502, 'upstream-error', ALLOWED_HOST, '/statut/500'],
            [405, 'method-not-allowed', undefined, undefined],
          ]
        );
      }
    );
  });

  test('`logQuery: true` : la requête est journalisée, sur demande explicite seulement', async () => {
    await withRelay(
      { config: (profile) => ({ ...profile, logQuery: true }) },
      async (reference, client) => {
        await exercise(client);
        assert.equal(reference.logs[0].query, '?recherche=saisie-du-visiteur');
        assert.ok(!JSON.stringify(reference.logs).includes(CONFORMANCE_KEY));
      }
    );
  });
});

// ---------------------------------------------------------------------------
describe('C-ERR — forme des erreurs du relais de référence', () => {
  test('un corps JSON `{ error, message }`, message fixe par code', async () => {
    await withRelay({}, async (reference, client) => {
      const response = await client.call(`/${FORBIDDEN_HOST}/x?recherche=saisie-du-visiteur`);
      assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
      assert.deepEqual(JSON.parse(response.text), {
        error: 'host-not-allowed',
        message: "Cet hôte n'est pas dans la liste blanche du relais.",
      });
    });
  });

  test('hors du préfixe du relais : 404 ; `/health` : 200 sans détail de configuration', async () => {
    await withRelay({}, async (reference, client) => {
      assert.equal((await client.call('/', { absolute: true })).status, 404);
      assert.equal(
        (await client.call(`/autre/${ALLOWED_HOST}/donnees.json`, { absolute: true })).status,
        404
      );
      const health = await client.call('/health', { absolute: true });
      assert.equal(health.status, 200);
      assert.equal(health.text, '{"status":"ok"}');
    });
  });

  test('`If-None-Match` du visiteur : ignoré, la réponse reste une 200 complète', async () => {
    await withRelay({}, async (reference, client) => {
      const path = `/${ALLOWED_HOST}/etag.json?${mark()}`;
      const first = await client.call(path);
      assert.equal(first.headers.etag, '"version-1"');
      assert.equal(first.headers['last-modified'], 'Thu, 01 Oct 2026 08:00:00 GMT');
      const second = await client.call(path, {
        headers: { 'If-None-Match': '"version-1"', Range: 'bytes=0-1' },
      });
      assert.equal(second.status, 200);
      assert.equal(second.text, first.text);
    });
  });
});
