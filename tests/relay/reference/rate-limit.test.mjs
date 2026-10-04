// Relais de référence (ADR-155) — la limite de débit (C-DOS-3) et sa table.
// La table des compteurs est bornée : sinon la limite de débit devient le moyen
// d'épuiser la mémoire. Contrat : docs/RELAY.md.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../../../proxy/relay/node/rate-limit.mjs';

describe('C-DOS-3 — la fenêtre', () => {
  test('`requests` requêtes par fenêtre, puis refus avec le délai restant', () => {
    const limiter = new RateLimiter({ requests: 2, windowSeconds: 10 });
    assert.deepEqual(limiter.take('a', 0), { allowed: true, retryAfter: 0 });
    assert.deepEqual(limiter.take('a', 1000), { allowed: true, retryAfter: 0 });
    assert.deepEqual(limiter.take('a', 4000), { allowed: false, retryAfter: 6 });
    assert.deepEqual(limiter.take('b', 4000), { allowed: true, retryAfter: 0 });
    assert.deepEqual(limiter.take('a', 10000), { allowed: true, retryAfter: 0 });
  });
});

describe('C-DOS-3 — la table des compteurs est bornée', () => {
  test('autant d’adresses qu’on veut : jamais plus de `maxKeys` compteurs', () => {
    const limiter = new RateLimiter({ requests: 5, windowSeconds: 60, maxKeys: 100 });
    for (let index = 0; index < 1000; index += 1) {
      limiter.take(`adresse-${index}`, index);
      assert.ok(limiter.windows.size <= 100, `${limiter.windows.size} compteurs`);
    }
  });

  test('table pleine : les fenêtres échues partent d’abord', () => {
    const limiter = new RateLimiter({ requests: 5, windowSeconds: 10, maxKeys: 100 });
    for (let index = 0; index < 60; index += 1) limiter.take(`ancienne-${index}`, 0);
    for (let index = 0; index < 40; index += 1) limiter.take(`recente-${index}`, 9000);
    limiter.take('nouvelle', 10000);
    assert.equal(limiter.windows.size, 41);
    assert.ok(limiter.windows.has('recente-0'));
    assert.ok(!limiter.windows.has('ancienne-0'));
  });

  test('table pleine de fenêtres vivantes : l’éviction se fait par LOT, pas à chaque adresse', () => {
    const limiter = new RateLimiter({ requests: 5, windowSeconds: 60, maxKeys: 100 });
    for (let index = 0; index < 100; index += 1) limiter.take(`adresse-${index}`, index);
    limiter.take('nouvelle', 200);
    // Un dixième de la table est libéré d'un coup : les dix adresses suivantes
    // n'ont plus à reparcourir toute la table.
    assert.equal(limiter.windows.size, 91);
    assert.ok(!limiter.windows.has('adresse-0'), 'les plus anciennes partent les premières');
    assert.ok(limiter.windows.has('adresse-99'));
  });

  test('une adresse en cours de limitation n’est pas évincée : elle ne repart pas de zéro', () => {
    const limiter = new RateLimiter({ requests: 2, windowSeconds: 60, maxKeys: 100 });
    const answers = [limiter.take('abusive', 0), limiter.take('abusive', 1), limiter.take('abusive', 2)];
    assert.deepEqual(
      answers.map((answer) => answer.allowed),
      [true, true, false]
    );
    // 500 autres adresses débordent la table plusieurs fois.
    for (let index = 0; index < 500; index += 1) limiter.take(`adresse-${index}`, 10 + index);
    assert.equal(limiter.take('abusive', 1000).allowed, false, 'le compteur a été évincé');
    assert.ok(limiter.windows.size <= 100);
  });

  test('une table pleine d’adresses limitées reste bornée : les plus anciennes partent', () => {
    const limiter = new RateLimiter({ requests: 1, windowSeconds: 60, maxKeys: 50 });
    for (let index = 0; index < 200; index += 1) {
      limiter.take(`adresse-${index}`, index);
      limiter.take(`adresse-${index}`, index);
      assert.ok(limiter.windows.size <= 50);
    }
    assert.ok(limiter.windows.has('adresse-199'));
  });
});
