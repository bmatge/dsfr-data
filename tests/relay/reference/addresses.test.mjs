// Relais de référence (ADR-155) — classement des adresses et des noms d'hôte.
// Règles C-SSRF-2, C-SSRF-6 et C-DOS-3 du contrat (docs/RELAY.md).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPublicAddress,
  isValidHostname,
  rateLimitKey,
} from '../../../proxy/relay/node/addresses.mjs';

describe('C-SSRF-6 — adresses que le relais refuse de joindre', () => {
  const refused = [
    ['boucle locale IPv4', '127.0.0.1'],
    ['boucle locale IPv4, autre adresse du /8', '127.255.255.254'],
    ['privée 10/8', '10.0.0.7'],
    ['privée 172.16/12', '172.31.255.1'],
    ['privée 192.168/16', '192.168.1.1'],
    ['lien local et métadonnées d’hébergeur', '169.254.169.254'],
    ['CGNAT', '100.64.0.1'],
    ['adresse nulle', '0.0.0.0'],
    ['« ce réseau »', '0.1.2.3'],
    ['multidiffusion', '224.0.0.1'],
    ['diffusion', '255.255.255.255'],
    ['réservée', '240.0.0.1'],
    ['banc de mesure', '198.18.0.1'],
    ['boucle locale IPv6', '::1'],
    ['adresse nulle IPv6', '::'],
    ['lien local IPv6', 'fe80::1'],
    ['lien local IPv6 avec zone', 'fe80::1%lo0'],
    ['locale unique IPv6', 'fd12:3456:789a::1'],
    ['locale de site, obsolète', 'fec0::1'],
    ['multidiffusion IPv6', 'ff02::1'],
    ['IPv4 mappée vers la boucle locale', '::ffff:127.0.0.1'],
    ['IPv4 mappée en hexadécimal', '::ffff:7f00:1'],
    ['IPv4 mappée vers une adresse publique', '::ffff:192.0.2.10'],
    ['IPv4 compatible', '::127.0.0.1'],
    ['NAT64', '64:ff9b::7f00:1'],
    ['6to4 embarquant la boucle locale', '2002:7f00:1::1'],
    ['Teredo', '2001:0:4136:e378:8000:63bf:3fff:fdd2'],
    ['documentation IPv6', '2001:db8::1'],
    ['documentation IPv6, nouvelle plage', '3fff::1'],
    ['documentation TEST-NET-1', '192.0.2.10'],
    ['documentation TEST-NET-2', '198.51.100.7'],
    ['documentation TEST-NET-3', '203.0.113.1'],
    ['AS112', '192.31.196.1'],
    ['AMT', '192.52.193.1'],
    ['AS112, délégation directe', '192.175.48.1'],
    ['AS112 IPv6', '2620:4f:8000::1'],
  ];
  for (const [label, address] of refused) {
    test(`${label} (${address}) : refusée`, () => {
      assert.equal(isPublicAddress(address), false);
    });
  }

  // Classement seul : ces adresses ne sont jamais jointes par le banc.
  for (const address of ['192.0.3.1', '198.51.101.7', '203.0.114.1', '2606:4700:4700::1111', '2a01:e0a::1']) {
    test(`adresse publique (${address}) : acceptée`, () => {
      assert.equal(isPublicAddress(address), true);
    });
  }

  for (const value of ['', 'ouvert.conformance.test', '1.2.3', '2130706433', undefined, null, 42]) {
    test(`ce qui n’est pas une adresse littérale (${JSON.stringify(value)}) : refusé`, () => {
      assert.equal(isPublicAddress(value), false);
    });
  }
});

describe('C-SSRF-2 — forme d’un nom d’hôte', () => {
  for (const host of [
    'ouvert.conformance.test',
    'a.b.c.d.exemple.fr',
    'xn--e1afmkfd.xn--p1ai',
    'a-b.exemple.fr',
  ]) {
    test(`« ${host} » : accepté`, () => {
      assert.equal(isValidHostname(host), true);
    });
  }
  const refused = [
    'Ouvert.conformance.test',
    'ouvert.conformance.test.',
    '127.0.0.1',
    '2130706433',
    '0x7f000001',
    '0177.0.0.1',
    '127.1',
    'exemple.0x7f',
    '[::1]',
    'localhost',
    'exemple.fr:443',
    'utilisateur@exemple.fr',
    '*.exemple.fr',
    'exemple..fr',
    '-exemple.fr',
    'exemple-.fr',
    'exem ple.fr',
    'exemple.fr/chemin',
    '%65xemple.fr',
    '',
    `${'a'.repeat(64)}.fr`,
    `${'a.'.repeat(130)}fr`,
  ];
  for (const host of refused) {
    test(`« ${host.slice(0, 40)} » : refusé`, () => {
      assert.equal(isValidHostname(host), false);
    });
  }
});

describe('C-DOS-3 — clé de la limite de débit', () => {
  test('une IPv4 compte pour elle-même, y compris mappée par un socket double pile', () => {
    assert.equal(rateLimitKey('198.51.100.7'), '198.51.100.7');
    assert.equal(rateLimitKey('::ffff:198.51.100.7'), '198.51.100.7');
  });
  test('une IPv6 compte par préfixe /64 : changer d’adresse dans son /64 ne remet pas le compteur à zéro', () => {
    assert.equal(rateLimitKey('2a01:e0a:1:2:aaaa:bbbb:cccc:dddd'), rateLimitKey('2a01:e0a:1:2::1'));
    assert.notEqual(rateLimitKey('2a01:e0a:1:2::1'), rateLimitKey('2a01:e0a:1:3::1'));
    assert.equal(rateLimitKey('2A01:0E0A:0001:0002::1'), '2a01:e0a:1:2');
  });
});
