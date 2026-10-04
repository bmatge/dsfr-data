// Amont BRUT du banc du relais (ADR-155) : un serveur `net` qui écrit lui-même
// les octets de sa réponse. Le faux amont ordinaire (`fake-upstream.mjs`) passe
// par `node:http`, qui ne sait pas mal se tenir : pas de fragments d'un octet,
// pas de réponse sans longueur, pas d'encodage de transfert exotique.
//
// Tout se joue sur 127.0.0.1 ; rien ne quitte la machine.

import net from 'node:net';

/**
 * @param {(socket: import('node:net').Socket, target: string) => void} respond
 *   appelé une fois les en-têtes de la requête reçus, avec la cible (`/chemin?requête`)
 */
export async function startRawUpstream(respond) {
  /** @type {string[]} */
  const requests = [];
  /** @type {Set<import('node:net').Socket>} */
  const sockets = new Set();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let head = '';
    const onData = (chunk) => {
      head += chunk.toString('latin1');
      if (!head.includes('\r\n\r\n')) return;
      socket.off('data', onData);
      const target = head.split(' ')[1] ?? '';
      requests.push(target);
      respond(socket, target);
    };
    socket.on('data', onData);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  const address = server.address();

  return {
    port: typeof address === 'object' && address ? address.port : 0,
    requests,
    /** Requêtes reçues dont la cible contient `marker`. */
    seen(marker) {
      return requests.filter((target) => target.includes(marker));
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    },
  };
}
