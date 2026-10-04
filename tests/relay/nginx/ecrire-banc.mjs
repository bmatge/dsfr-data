// Réécrit `tests/relay/nginx/banc/` depuis l'extrait de production.
//
//   node tests/relay/nginx/ecrire-banc.mjs
//
// À relancer après toute modification des fichiers d'hôtes de `proxy/relay/nginx/` :
// `extrait-nginx.test.ts` refuse un banc qui n'est plus la dérivation de l'extrait.

import { mkdirSync, writeFileSync } from 'node:fs';
import { BANC_DIR, deriverBanc } from './banc.mjs';

const banc = deriverBanc();
mkdirSync(BANC_DIR, { recursive: true });
writeFileSync(`${BANC_DIR}hotes.http.conf`, banc.http);
writeFileSync(`${BANC_DIR}hotes.server.conf`, banc.server);
writeFileSync(`${BANC_DIR}cles.conf`, banc.cles);
