// Profil de conformance du relais (ADR-155, docs/RELAY.md §7) : les hôtes, la
// clé fictive et les plafonds que le relais à l'épreuve doit avoir en configuration.

import { readFileSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';

/** Clé FICTIVE du profil de conformance. Elle n'ouvre rien, nulle part. */
export const CONFORMANCE_KEY = 'cle-fictive-de-conformance';

export const PROFILE_PATH = fileURLToPath(new URL('../conformance-profile.json', import.meta.url));

/** @returns {Record<string, any>} */
export function readProfile() {
  return JSON.parse(readFileSync(PROFILE_PATH, 'utf8'));
}
