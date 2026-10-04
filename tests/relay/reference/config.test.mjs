// Relais de référence (ADR-155) — ce que la configuration refuse AU DÉMARRAGE.
// Règle C-CONF-1 du contrat (docs/RELAY.md) : une configuration douteuse n'ouvre pas de port.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { clearTimeout, setTimeout } from 'node:timers';
import { URL, fileURLToPath } from 'node:url';
import {
  ConfigError,
  DEFAULTS,
  loadConfig,
  validateConfig,
} from '../../../proxy/relay/node/config.mjs';

const SERVER = fileURLToPath(new URL('../../../proxy/relay/node/server.mjs', import.meta.url));
const SECRET = 'valeur-fictive-jamais-affichee';

const refuses = (raw, env, pattern) =>
  assert.throws(
    () => validateConfig(raw, env),
    (error) => {
      assert.ok(error instanceof ConfigError, `erreur inattendue : ${error}`);
      assert.match(error.message, pattern);
      assert.ok(!error.message.includes(SECRET), 'le message d’erreur affiche la valeur de la clé');
      return true;
    }
  );

const keyed = (extra = {}) => ({
  hosts: {
    'cle.conformance.test': {
      pathPrefixes: ['/api/public/'],
      key: { header: 'Authorization', prefix: 'Apikey ', env: 'RELAY_KEY_TEST' },
      ...extra,
    },
  },
});

describe('C-CONF-1 — liste blanche', () => {
  test('liste blanche vide : refus de démarrer', () => {
    refuses({}, {}, /Liste blanche vide/);
    refuses({ hosts: {} }, { RELAY_HOSTS: ' , ' }, /Liste blanche vide/);
  });

  const badHosts = [
    ['joker', '*.exemple.fr', /joker/],
    ['joker seul', '*', /joker/],
    ['adresse IPv4', '127.0.0.1', /nom d'hôte attendu/],
    ['adresse en entier décimal', '2130706433', /nom d'hôte attendu/],
    ['adresse hexadécimale', '0x7f000001', /nom d'hôte attendu/],
    ['adresse IPv6', '[::1]', /nom d'hôte attendu/],
    ['nom local', 'localhost', /nom d'hôte attendu/],
    ['majuscules', 'Data.Exemple.fr', /nom d'hôte attendu/],
    ['port', 'data.exemple.fr:8443', /nom d'hôte attendu/],
    ['schéma', 'https://data.exemple.fr', /nom d'hôte attendu/],
    ['point final', 'data.exemple.fr.', /nom d'hôte attendu/],
    ['chemin', 'data.exemple.fr/api', /nom d'hôte attendu/],
  ];
  for (const [label, host, pattern] of badHosts) {
    test(`hôte refusé (${label}) : « ${host} »`, () => {
      refuses({ hosts: { [host]: {} } }, {}, pattern);
      refuses({}, { RELAY_HOSTS: host }, pattern);
    });
  }

  test('RELAY_HOSTS ajoute des hôtes sans clé à ceux du fichier', () => {
    const config = validateConfig(
      { hosts: { 'a.conformance.test': { ttl: 60 } } },
      { RELAY_HOSTS: 'b.conformance.test, a.conformance.test' }
    );
    assert.deepEqual([...config.hosts.keys()], ['a.conformance.test', 'b.conformance.test']);
    assert.equal(
      config.hosts.get('a.conformance.test').ttl,
      60,
      'le fichier garde la main sur son hôte'
    );
    assert.equal(config.hosts.get('b.conformance.test').ttl, 300);
  });
});

describe('C-CONF-1 — clé et préfixes de chemin', () => {
  test('une clé sans préfixe de chemin : refus (elle rendrait public tout ce qu’elle sait lire)', () => {
    refuses(keyed({ pathPrefixes: [] }), { RELAY_KEY_TEST: SECRET }, /préfixe de chemin/);
    refuses(keyed({ pathPrefixes: undefined }), { RELAY_KEY_TEST: SECRET }, /préfixe de chemin/);
  });
  test('une clé absente de l’environnement : refus, la variable est nommée', () => {
    refuses(keyed(), {}, /RELAY_KEY_TEST/);
    refuses(keyed(), { RELAY_KEY_TEST: '' }, /RELAY_KEY_TEST/);
  });
  test('une clé contenant CR ou LF : refus, sans afficher sa valeur', () => {
    refuses(keyed(), { RELAY_KEY_TEST: `${SECRET}\r\nX-Injecte: oui` }, /RELAY_KEY_TEST/);
  });
  test('la clé ne s’écrit pas dans le fichier : `value` est un champ inconnu', () => {
    refuses(
      { hosts: { 'cle.conformance.test': { pathPrefixes: ['/api/'], key: { value: SECRET } } } },
      {},
      /champ inconnu/
    );
  });
  test('en-tête de clé réservé au transport ou invalide : refus', () => {
    for (const header of [
      'Host',
      'Cookie',
      'Content-Length',
      'X-Forwarded-For',
      'Mauvais En-tête',
      'X:Y',
    ]) {
      refuses(
        keyed({ key: { header, env: 'RELAY_KEY_TEST' } }),
        { RELAY_KEY_TEST: SECRET },
        /en-tête invalide ou réservé/
      );
    }
  });
  test('préfixe de chemin piégé : refus', () => {
    for (const prefix of ['/', 'api/', '/api/../', '/api//x', '/api/%2e%2e/', '']) {
      refuses(keyed({ pathPrefixes: [prefix] }), { RELAY_KEY_TEST: SECRET }, /pathPrefixes/);
    }
  });
  test('configuration valide : la clé est composée, avec son préfixe', () => {
    const config = validateConfig(keyed(), { RELAY_KEY_TEST: SECRET });
    assert.deepEqual(config.hosts.get('cle.conformance.test').key, {
      header: 'Authorization',
      value: `Apikey ${SECRET}`,
      secret: SECRET,
    });
  });
});

describe('C-CONF-1 — plafonds et champs', () => {
  const ok = { hosts: { 'ouvert.conformance.test': {} } };
  test('les défauts : 300 s, 10 s, 10 Mo, trois redirections, JSON, GeoJSON et CSV', () => {
    const config = validateConfig(ok, {});
    const host = config.hosts.get('ouvert.conformance.test');
    assert.equal(host.ttl, 300);
    assert.equal(host.sharedTtl, 300);
    assert.equal(config.limits.timeoutMs, 10000);
    assert.equal(config.limits.maxBytes, 10 * 1024 * 1024);
    assert.equal(config.limits.maxRedirects, 3);
    assert.equal(config.limits.maxUrlLength, 8000);
    assert.deepEqual(
      [...config.contentTypes],
      ['application/json', 'application/geo+json', 'text/csv']
    );
    assert.equal(config.listenHost, '127.0.0.1');
    assert.equal(config.prefix, DEFAULTS.prefix);
    assert.equal(config.logQuery, false);
  });
  test('plus de trois redirections : refus', () => {
    refuses({ ...ok, limits: { maxRedirects: 4 } }, {}, /maxRedirects/);
  });
  test('un champ inconnu : refus (une faute de frappe ne doit pas ouvrir un hôte)', () => {
    refuses({ ...ok, host: {} }, {}, /champ inconnu « host »/);
    refuses(
      { hosts: { 'ouvert.conformance.test': { pathPrefixe: ['/api/'] } } },
      {},
      /champ inconnu « pathPrefixe »/
    );
    refuses({ ...ok, limits: { maxOctets: 1 } }, {}, /champ inconnu « maxOctets »/);
  });
  test('un type de contenu actif dans la liste blanche : refus', () => {
    for (const type of [
      'text/html',
      'image/svg+xml',
      'application/xhtml+xml',
      'text/javascript',
      'application/xml',
    ]) {
      refuses({ ...ok, contentTypes: [type] }, {}, /contentTypes/);
    }
  });
  test('préfixe du relais invalide : refus', () => {
    for (const prefix of ['donnees-relais', '/donnees-relais/', '/a/../b', '/a b']) {
      refuses({ ...ok, prefix }, {}, /prefix/);
    }
  });
  test('`trustedProxies` : une adresse que le relais ne reconnaîtrait jamais est refusée, pas ignorée', () => {
    for (const entry of [
      '::ffff:127.0.0.1', // la connexion est vue comme 127.0.0.1 : jamais reconnue
      'fe80::1%eth0',
      '0.0.0.0',
      '::',
      '10.0.0.0/8',
      'mandataire.exemple.fr',
      42,
    ]) {
      refuses({ ...ok, trustedProxies: [entry] }, {}, /trustedProxies/);
    }
    refuses({ ...ok, trustedProxies: '127.0.0.1' }, {}, /trustedProxies/);
    const config = validateConfig({ ...ok, trustedProxies: ['127.0.0.1', '::1', '10.0.0.5'] }, {});
    assert.deepEqual([...config.trustedProxies], ['127.0.0.1', '::1', '10.0.0.5']);
  });
  test('part d’un client : la moitié des places amont par défaut, jamais plus que le total', () => {
    assert.equal(validateConfig(ok, {}).limits.maxUpstreamRequestsPerClient, 8);
    const one = validateConfig({ ...ok, limits: { maxUpstreamRequests: 1 } }, {});
    assert.equal(one.limits.maxUpstreamRequestsPerClient, 1);
    const five = validateConfig({ ...ok, limits: { maxUpstreamRequests: 5 } }, {});
    assert.equal(five.limits.maxUpstreamRequestsPerClient, 3);
    refuses(
      { ...ok, limits: { maxUpstreamRequests: 4, maxUpstreamRequestsPerClient: 5 } },
      {},
      /maxUpstreamRequestsPerClient/
    );
    refuses({ ...ok, limits: { maxUpstreamRequestsPerClient: 0 } }, {}, /PerClient/);
  });
  test('octets en attente d’écriture : au moins deux réponses de taille maximale', () => {
    assert.equal(validateConfig(ok, {}).limits.maxPendingBytes, 64 * 1024 * 1024);
    refuses(
      { ...ok, limits: { maxBytes: 10 * 1024 * 1024, maxPendingBytes: 15 * 1024 * 1024 } },
      {},
      /maxPendingBytes/
    );
  });
  test('l’environnement prime sur le fichier', () => {
    const config = validateConfig(
      { ...ok, prefix: '/a', ttl: 60, listen: { port: 1 } },
      { RELAY_PREFIX: '/relais', RELAY_TTL: '120', RELAY_PORT: '8200', RELAY_LISTEN: '0.0.0.0' }
    );
    assert.equal(config.prefix, '/relais');
    assert.equal(config.hosts.get('ouvert.conformance.test').ttl, 120);
    assert.equal(config.listenPort, 8200);
    assert.equal(config.listenHost, '0.0.0.0');
  });
  test('l’exemple livré (`relay.config.example.json`) est une configuration valide', () => {
    const example = fileURLToPath(
      new URL('../../../proxy/relay/node/relay.config.example.json', import.meta.url)
    );
    const config = loadConfig({ RELAY_CONFIG: example, RELAY_KEY_PORTAIL_PRIVE: SECRET }, (path) =>
      readFileSync(path, 'utf8')
    );
    assert.deepEqual(
      [...config.hosts.keys()],
      ['donnees.portail.example', 'portail-prive.example']
    );
    assert.equal(config.hosts.get('portail-prive.example').ttl, 600);
    // Sans la clé dans l'environnement, le même fichier est refusé.
    assert.throws(
      () => loadConfig({ RELAY_CONFIG: example }, (path) => readFileSync(path, 'utf8')),
      ConfigError
    );
  });
  test('fichier illisible ou JSON invalide : refus', () => {
    assert.throws(
      () =>
        loadConfig({ RELAY_CONFIG: '/absent.json' }, () => {
          throw new Error('ENOENT');
        }),
      ConfigError
    );
    assert.throws(
      () => loadConfig({ RELAY_CONFIG: '/x.json' }, () => '{ pas du json'),
      ConfigError
    );
  });
});

/** Lance `server.mjs` et rend son code de sortie et sa sortie d'erreur. */
function runServer(env, { stopWhen } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SERVER], {
      env: { PATH: process.env.PATH, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stopWhen && stopWhen.test(stderr)) child.kill('SIGTERM');
    });
    // Un relais qui démarre alors qu'il devait refuser ne doit pas bloquer la suite.
    const guard = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.on('close', (code) => {
      clearTimeout(guard);
      resolve({ code, stderr });
    });
  });
}

describe('C-CONF-1 — le point d’entrée `server.mjs`', () => {
  test('sans liste blanche : sortie en erreur, aucun port ouvert', async () => {
    const { code, stderr } = await runServer({});
    assert.equal(code, 1);
    assert.match(stderr, /Liste blanche vide/);
  });
  test('clé absente : sortie en erreur', async () => {
    const { code, stderr } = await runServer({
      RELAY_CONFIG: fileURLToPath(new URL('../conformance-profile.json', import.meta.url)),
    });
    assert.equal(code, 1);
    assert.match(stderr, /RELAY_KEY_CONFORMANCE/);
  });
  test('avec une liste blanche : écoute sur la boucle locale, puis s’arrête sur SIGTERM', async () => {
    const { code, stderr } = await runServer(
      { RELAY_HOSTS: 'ouvert.conformance.test', RELAY_PORT: '0' },
      { stopWhen: /à l'écoute/ }
    );
    assert.match(
      stderr,
      /à l'écoute sur http:\/\/127\.0\.0\.1:\d+\/donnees-relais\/ — 1 hôte\(s\) autorisé\(s\), dont 0 avec clé/
    );
    assert.equal(code, 0);
  });
});
