// Relais de référence (ADR-155) — la réception de la réponse de l'amont, face à
// un amont qui écrit lui-même ses octets (tests/relay/support/raw-upstream.mjs) :
// fragments d'un octet, réponse sans longueur, encodage de transfert inattendu.
// Règles C-DOS-2 et C-CACHE-3 du contrat (docs/RELAY.md).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { clearInterval, setInterval } from 'node:timers';
import { createClient } from '../support/client.mjs';
import { ALLOWED_HOST } from '../support/fake-upstream.mjs';
import { startRawUpstream } from '../support/raw-upstream.mjs';
import { startReference } from '../support/reference.mjs';

const MEGA = 1024 * 1024;
const errorCode = (response) => JSON.parse(response.text).error;
const withLimits = (limits) => (profile) => ({
  ...profile,
  limits: { ...profile.limits, ...limits },
});

/**
 * @param {Parameters<typeof startRawUpstream>[0]} respond
 * @param {Omit<Parameters<typeof startReference>[0], 'upstreamPort'>} options
 * @param {(context: { reference: Awaited<ReturnType<typeof startReference>>, client: ReturnType<typeof createClient>, upstream: Awaited<ReturnType<typeof startRawUpstream>> }) => Promise<void>} run
 */
async function withRawUpstream(respond, options, run) {
  const upstream = await startRawUpstream(respond);
  const reference = await startReference({ upstreamPort: upstream.port, ...options });
  try {
    await run({ reference, client: createClient(reference.url), upstream });
  } finally {
    await reference.close();
    await upstream.close();
  }
}

describe('C-DOS-2 — le plafond de taille borne la mémoire, quel que soit le découpage', () => {
  test('un amont qui répond 1 Mo en fragments d’UN octet, quatre fois de front : le tas ne suit pas le nombre de fragments', async (t) => {
    // Chaque fragment « 1\r\n \r\n » porte un octet de corps pour six sur le fil.
    const fragments = Buffer.alloc(MEGA * 6);
    for (let offset = 0; offset < fragments.length; offset += 6) {
      fragments.write('1\r\n \r\n', offset, 'latin1');
    }
    const respond = (socket) => {
      socket.write(
        'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n'
      );
      socket.write(fragments);
      socket.end('0\r\n\r\n');
    };
    const config = withLimits({ maxBytes: MEGA, timeoutMs: 60000 });
    await withRawUpstream(respond, { config }, async ({ client }) => {
      const used = () => {
        const usage = process.memoryUsage();
        return usage.heapUsed + usage.external;
      };
      const before = used();
      let peak = before;
      const sampler = setInterval(() => {
        peak = Math.max(peak, used());
      }, 1);
      const responses = await Promise.all(
        [0, 1, 2, 3].map((index) => client.call(`/${ALLOWED_HOST}/fragments?i=${index}`))
      );
      clearInterval(sampler);
      peak = Math.max(peak, used());
      for (const response of responses) {
        assert.equal(response.status, 200);
        assert.equal(response.body.length, MEGA);
      }
      const growth = Math.round((peak - before) / MEGA);
      t.diagnostic(`tas : +${growth} Mo au pic pour 4 Mo de corps en fragments d’un octet`);
      // 4 Mo de corps : avant la correction, le tas montait de plusieurs centaines de Mo
      // (un objet `Buffer` par fragment). La borne laisse de la marge au ramasse-miettes.
      assert.ok(growth < 100, `le tas a grossi de ${growth} Mo pour 4 Mo de corps`);
    });
  });
});

describe('C-CACHE-3 — une réponse dont la fin ne se prouve pas n’est ni servie ni gardée', () => {
  test('ni `Content-Length` ni découpage (réponse délimitée par la fermeture) : 502, rien en cache', async () => {
    const respond = (socket) => {
      // L'amont ferme PROPREMENT au milieu d'un JSON : rien ne distingue cette
      // fin d'une réponse complète.
      socket.end(
        'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"jusqua":"la fermeture"'
      );
    };
    await withRawUpstream(respond, {}, async ({ reference, client, upstream }) => {
      const path = `/${ALLOWED_HOST}/sans-longueur`;
      const first = await client.call(path);
      assert.equal(first.status, 502);
      assert.equal(errorCode(first), 'upstream-unframed');
      assert.ok(!first.text.includes('jusqua'));
      assert.equal(reference.relay.cache.size, 0);
      assert.equal((await client.call(path)).status, 502);
      assert.equal(upstream.requests.length, 2, 'rien n’a été servi par le cache');
    });
  });

  test('`Transfer-Encoding: gzip, chunked` : le relais ne sert pas un corps qu’il ne sait pas décoder (502)', async () => {
    const respond = (socket) => {
      socket.end(
        'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: gzip, chunked\r\n\r\n3\r\nabc\r\n0\r\n\r\n'
      );
    };
    await withRawUpstream(respond, {}, async ({ reference, client }) => {
      const response = await client.call(`/${ALLOWED_HOST}/transfert-gzip`);
      assert.equal(response.status, 502);
      assert.equal(errorCode(response), 'upstream-encoding');
      assert.equal(reference.relay.cache.size, 0);
    });
  });

  test('une réponse découpée complète, et une réponse à longueur déclarée : servies', async () => {
    const respond = (socket, target) => {
      if (target.includes('decoupee')) {
        socket.end(
          'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n5\r\n{"a":\r\n2\r\n1}\r\n0\r\n\r\n'
        );
      } else {
        socket.end(
          'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 7\r\n\r\n{"a":1}'
        );
      }
    };
    await withRawUpstream(respond, {}, async ({ client }) => {
      for (const name of ['decoupee', 'declaree']) {
        const response = await client.call(`/${ALLOWED_HOST}/${name}`);
        assert.equal(response.status, 200);
        assert.equal(response.text, '{"a":1}');
      }
    });
  });

  test('une longueur déclarée que l’amont ne tient pas (fermeture avant la fin) : 502, rien en cache', async () => {
    const respond = (socket) => {
      socket.end(
        'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 70\r\n\r\n{"a":1}'
      );
    };
    await withRawUpstream(respond, {}, async ({ reference, client }) => {
      assert.equal((await client.call(`/${ALLOWED_HOST}/tronquee`)).status, 502);
      assert.equal(reference.relay.cache.size, 0);
    });
  });
});
