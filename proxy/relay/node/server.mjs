#!/usr/bin/env node
// Relais cachable (ADR-155) — point d'entrée de production.
//
//   RELAY_CONFIG=./relay.config.json node proxy/relay/node/server.mjs
//
// Ce fichier ne passe AUCUNE substitution à `createRelay` : la résolution DNS,
// la connexion TLS sur le port 443 et le refus des adresses privées ne se
// débranchent pas par configuration. Contrat : docs/RELAY.md.

import process from 'node:process';
import { readFileSync } from 'node:fs';
import { ConfigError, loadConfig } from './config.mjs';
import { createRelay } from './relay.mjs';

let config;
try {
  config = loadConfig(process.env, (path) => readFileSync(path, 'utf8'));
} catch (error) {
  // Un `ConfigError` ne contient jamais de valeur de clé, seulement des noms.
  const message = error instanceof ConfigError ? error.message : 'Configuration illisible.';
  process.stderr.write(`[relais] ${message}\n`);
  process.exit(1);
}

for (const warning of config.warnings) process.stderr.write(`[relais] attention : ${warning}\n`);

const relay = createRelay(config);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    relay.close().then(() => process.exit(0));
  });
}

try {
  const { address, port } = await relay.listen();
  const keyed = [...config.hosts.values()].filter((host) => host.key).length;
  process.stderr.write(
    `[relais] à l'écoute sur http://${address}:${port}${config.prefix}/ — ${config.hosts.size} hôte(s) autorisé(s), dont ${keyed} avec clé\n`
  );
} catch (error) {
  process.stderr.write(`[relais] écoute impossible (${error?.code ?? 'erreur'}).\n`);
  process.exit(1);
}
