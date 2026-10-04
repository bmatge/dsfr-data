// Relais de référence (ADR-155) — lecture de la cible dans l'URL.
// La suite de conformance accepte qu'un relais tiers NORMALISE un chemin piégé ;
// le relais de référence, lui, le REFUSE : c'est ce que ces tests verrouillent.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RelayError,
  isSafePath,
  isSafeSearch,
  isUnderPrefix,
  parseTarget,
} from '../../../proxy/relay/node/target.mjs';

const PREFIX = '/donnees-relais';
const parse = (rest) => parseTarget(`${PREFIX}${rest}`, PREFIX, 8000);

/** @returns {RelayError} */
const failure = (rest) => {
  try {
    parse(rest);
  } catch (error) {
    assert.ok(error instanceof RelayError);
    return error;
  }
  throw new assert.AssertionError({ message: `cible acceptée : ${rest}` });
};

describe('C-URL-1 — une cible acceptée est rendue telle quelle', () => {
  test('hôte, chemin et requête sont découpés sans décodage ni réécriture', () => {
    assert.deepEqual(
      parse('/ouvert.conformance.test/api/v2.1/jeux/a%20b/records?where=a%25&b=2&a=1'),
      {
        host: 'ouvert.conformance.test',
        path: '/api/v2.1/jeux/a%20b/records',
        search: '?where=a%25&b=2&a=1',
      }
    );
  });
  test('sans chemin, la cible est la racine de l’hôte', () => {
    assert.deepEqual(parse('/ouvert.conformance.test'), {
      host: 'ouvert.conformance.test',
      path: '/',
      search: '',
    });
    assert.deepEqual(parse('/ouvert.conformance.test/?a=1'), {
      host: 'ouvert.conformance.test',
      path: '/',
      search: '?a=1',
    });
  });
  test('une barre finale est conservée', () => {
    assert.equal(parse('/ouvert.conformance.test/api/records/').path, '/api/records/');
  });
  test('la requête garde ses caractères bruts et ses échappements, `%2F` et `%25` compris', () => {
    assert.equal(
      parse('/ouvert.conformance.test/a?x=%2F%2E%2E&y=50%25&z=[]{}|^').search,
      '?x=%2F%2E%2E&y=50%25&z=[]{}|^'
    );
  });
});

describe('C-URL-2, C-SSRF-1 à 3 — segment d’hôte : 403', () => {
  const hosts = [
    'OUVERT.conformance.test',
    'ouvert.conformance.test.',
    '127.0.0.1',
    '2130706433',
    '0x7f000001',
    '[::1]',
    '[::ffff:127.0.0.1]',
    'utilisateur:motdepasse@ouvert.conformance.test',
    'ouvert.conformance.test:443',
    'https:',
    '%6fuvert.conformance.test',
    'ouvert.conformance.test%00',
    'localhost',
    '',
  ];
  for (const host of hosts) {
    test(`« ${host} » : 403 host-not-allowed`, () => {
      const error = failure(`/${host}/donnees.json`);
      assert.equal(error.status, 403);
      assert.equal(error.code, 'host-not-allowed');
    });
  }
});

describe('C-SSRF-4 — chemin piégé : 400', () => {
  const paths = [
    '/a/../b',
    '/a/..',
    '/..',
    '/a/./b',
    '/a/%2e%2e/b',
    '/a/%2E%2E/b',
    '/a/.%2e/b',
    '/a/%2e./b',
    '/a/%252e%252e/b',
    '/a/..%2fb',
    '/a/..%5cb',
    '/a/..\\b',
    '/a/..;/b',
    '/a/..;x=1/b',
    '/a//b',
    '//b',
    '/a/%00',
    '/a/%0d%0aX-Injecte:%20oui',
    '/a/%0a',
    '/a/%7f',
    '/a/%zz',
    '/a/%2',
    '/a/b c',
    '/a/<script>',
    '/a/"b"',
  ];
  for (const path of paths) {
    test(`« ${path} » : 400 invalid-path`, () => {
      assert.equal(isSafePath(path), false);
      const error = failure(`/ouvert.conformance.test${path}?a=1`);
      assert.equal(error.status, 400);
    });
  }
  for (const path of [
    '/',
    '/a',
    '/a/b.json',
    '/a/b/',
    '/a/.b',
    '/a/b..c',
    '/a/...',
    "/a/b-c_d.e~f!$&'()*+,;=:@",
    '/a/%20b/%C3%A9',
  ]) {
    test(`« ${path} » : accepté`, () => {
      assert.equal(isSafePath(path), true);
    });
  }
});

describe('C-INJ-1 — requête piégée : 400', () => {
  for (const search of [
    '?a=%0d%0aX-Injecte:%20oui',
    '?a=%0A',
    '?a=%0D',
    '?a=%00',
    '?a=b c',
    '?a=b#c',
    '?a=é',
  ]) {
    test(`« ${search} » : refusée`, () => {
      assert.equal(isSafeSearch(search), false);
      assert.equal(failure(`/ouvert.conformance.test/a${search}`).status, 400);
    });
  }
  test('CR ou LF nu dans la cible : 400', () => {
    assert.equal(failure('/ouvert.conformance.test/a\r\nX-Injecte: oui').status, 400);
    assert.equal(failure('/ouvert.conformance.test/a?b=1\nX-Injecte: oui').status, 400);
  });
});

describe('C-URL-3 — longueur', () => {
  test('8 000 caractères passent, 8 001 donnent 414', () => {
    const head = `${PREFIX}/ouvert.conformance.test/a?q=`;
    assert.equal(
      parseTarget(`${head}${'a'.repeat(8000 - head.length)}`, PREFIX, 8000).host,
      'ouvert.conformance.test'
    );
    assert.throws(
      () => parseTarget(`${head}${'a'.repeat(8001 - head.length)}`, PREFIX, 8000),
      (error) => error instanceof RelayError && error.status === 414
    );
  });
});

describe('Routes hors du relais', () => {
  for (const url of [
    '/',
    '/autre/ouvert.conformance.test/a',
    '/donnees-relaisX/ouvert.conformance.test/a',
    '/donnees-relais',
    'http://ouvert.conformance.test/a',
    '*',
  ]) {
    test(`« ${url} » : 404`, () => {
      assert.throws(
        () => parseTarget(url, PREFIX, 8000),
        (error) => error instanceof RelayError && error.status === 404
      );
    });
  }
});

describe('C-SSRF-5 — préfixes de chemin', () => {
  test('un préfixe s’arrête à une frontière de segment', () => {
    assert.equal(isUnderPrefix('/api/public/x', ['/api/public/']), true);
    assert.equal(isUnderPrefix('/api/public/x', ['/api/public']), true);
    assert.equal(isUnderPrefix('/api/public', ['/api/public']), true);
    assert.equal(isUnderPrefix('/api/public-prive/x', ['/api/public']), false);
    assert.equal(isUnderPrefix('/api/publi', ['/api/public/']), false);
    assert.equal(isUnderPrefix('/API/PUBLIC/x', ['/api/public/']), false);
    assert.equal(isUnderPrefix('/api/prive/x', ['/api/public/', '/api/ouvert/']), false);
    assert.equal(isUnderPrefix('/api/ouvert/x', ['/api/public/', '/api/ouvert/']), true);
  });
  test('sans préfixe déclaré, tout chemin sain de l’hôte est autorisé', () => {
    assert.equal(isUnderPrefix('/n-importe/quoi', []), true);
  });
});
