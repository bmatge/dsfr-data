// Lance le relais Node de référence (proxy/relay/node/) pour le banc de tests.
//
// Le relais de production exige https, le port 443 et une adresse publique : il
// ne peut pas joindre un faux amont local. Le banc lui substitue donc DEUX
// choses, par injection dans `createRelay` — jamais par configuration :
//   - la résolution DNS : les hôtes `.conformance.test` reçoivent une adresse
//     « publique » de documentation (TEST-NET-1, RFC 5737) ;
//   - la connexion : au lieu d'un TLS vers cette adresse, un TCP vers le faux amont.
// Tout le reste — liste blanche, vérification des adresses, redirections,
// plafonds, cache, en-têtes — est le code de production, inchangé.

import net from 'node:net';
import { URL } from 'node:url';
import { validateConfig } from '../../../proxy/relay/node/config.mjs';
import { createRelay } from '../../../proxy/relay/node/relay.mjs';
import { CONFORMANCE_KEY, readProfile } from './profile.mjs';

/** Adresse « publique » rendue par le faux DNS : TEST-NET-1, jamais routée. */
export const PUBLIC_TEST_ADDRESS = '192.0.2.10';

/**
 * @param {{
 *   upstreamPort: number,
 *   config?: (profile: Record<string, any>) => Record<string, any>,
 *   env?: Record<string, string>,
 *   resolve?: (hostname: string) => Promise<{ address: string, family: number }[]>,
 *   now?: () => number,
 * }} options
 */
export async function startReference({ upstreamPort, config, env = {}, resolve, now }) {
  const profile = readProfile();
  const raw = { ...profile, listen: { host: '127.0.0.1', port: 0 } };
  const validated = validateConfig(config ? config(raw) : raw, {
    RELAY_KEY_CONFORMANCE: CONFORMANCE_KEY,
    ...env,
  });

  /** @type {Record<string, unknown>[]} */
  const logs = [];
  /** @type {{ address: string, hostname: string }[]} */
  const connections = [];
  /** @type {string[]} */
  const resolutions = [];

  const relay = createRelay(validated, {
    resolve: async (hostname) => {
      resolutions.push(hostname);
      if (resolve) return resolve(hostname);
      return [{ address: PUBLIC_TEST_ADDRESS, family: 4 }];
    },
    connect: ({ address, hostname }) => {
      connections.push({ address, hostname });
      return net.connect(upstreamPort, '127.0.0.1');
    },
    log: (record) => logs.push(record),
    now,
  });
  const { port } = await relay.listen();

  return {
    url: new URL(`http://127.0.0.1:${port}${validated.prefix}`),
    relay,
    config: validated,
    logs,
    connections,
    resolutions,
    close: () => relay.close(),
  };
}
