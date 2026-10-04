// Faux portail de données pour éprouver la BIBLIOTHÈQUE à travers le relais de
// référence (ADR-155, lot 2, #1232).
//
// Le faux amont de la suite de conformance (`fake-upstream.mjs`) est hostile et
// ne sert pas de jeu. Celui-ci fait l'inverse : il sert 250 lignes à la façon
// d'un portail Opendatasoft (`/records` paginé par `limit` / `offset`, `group_by`
// avec une somme, `/exports/json`), pour qu'un adaptateur de la bibliothèque
// puisse charger, paginer et déléguer un regroupement À TRAVERS le relais.
//
// Il note chaque requête reçue (URL brute, en-têtes) : c'est ce qui prouve que
// le chemin et la requête arrivent octet pour octet, et qu'aucun en-tête du
// visiteur ne passe.
//
// Aucun domaine réel : `.test` est réservé (RFC 6761).

import http from 'node:http';
import { Buffer } from 'node:buffer';
import { setTimeout } from 'node:timers';
import { URL } from 'node:url';

/** Hôte autorisé du profil de conformance, que ce faux portail incarne. */
export const PORTAL_HOST = 'ouvert.conformance.test';
/** Hôte hors liste blanche du profil. */
export const FORBIDDEN_PORTAL_HOST = 'interdit.conformance.test';

export const PORTAL_DATASET = 'jeu';
export const RECORDS_PATH = `/api/explore/v2.1/catalog/datasets/${PORTAL_DATASET}/records`;
export const EXPORT_PATH = `/api/explore/v2.1/catalog/datasets/${PORTAL_DATASET}/exports/json`;

export const REGIONS = ['Bretagne', 'Île-de-France', "Provence-Alpes-Côte d'Azur", 'Grand Est'];

/** @type {{ id: number, region: string, montant: number }[]} */
export const ROWS = Array.from({ length: 250 }, (_, i) => ({
  id: i + 1,
  region: REGIONS[i % REGIONS.length],
  montant: ((i * 37) % 101) + 1,
}));

/** Somme des montants du jeu, recalculée ici, à la main. */
export const TOTAL = ROWS.reduce((total, row) => total + row.montant, 0);

/** Somme des montants par région. @type {Map<string, number>} */
export const TOTAL_BY_REGION = new Map();
for (const row of ROWS) {
  TOTAL_BY_REGION.set(row.region, (TOTAL_BY_REGION.get(row.region) ?? 0) + row.montant);
}

/**
 * La réponse du portail à une URL (chemin et requête), ou `null` si le chemin
 * n'est pas servi (404).
 *
 * @param {string} rawUrl `req.url`, ou une URL absolue
 * @returns {unknown | null}
 */
export function answerPortal(rawUrl) {
  const url = new URL(rawUrl, `https://${PORTAL_HOST}`);
  if (url.pathname === EXPORT_PATH) return ROWS;
  if (url.pathname !== RECORDS_PATH) return null;
  if (url.searchParams.get('group_by') === 'region') {
    const alias = /sum\(montant\)\s+as\s+(\w+)/.exec(url.searchParams.get('select') ?? '');
    const column = alias ? alias[1] : 'sum(montant)';
    return {
      results: [...TOTAL_BY_REGION].map(([region, total]) => ({ region, [column]: total })),
    };
  }
  const limit = Number(url.searchParams.get('limit') ?? '10');
  const offset = Number(url.searchParams.get('offset') ?? '0');
  return { total_count: ROWS.length, results: ROWS.slice(offset, offset + limit) };
}

/**
 * Démarre le faux portail sur un port libre de la boucle locale.
 *
 * @returns {Promise<{
 *   port: number,
 *   requests: { url: string, headers: import('node:http').IncomingHttpHeaders }[],
 *   setDelay: (ms: number) => void,
 *   close: () => Promise<void>,
 * }>}
 */
export async function startPortalUpstream() {
  /** @type {{ url: string, headers: import('node:http').IncomingHttpHeaders }[]} */
  const requests = [];
  let delayMs = 0;

  const server = http.createServer((req, res) => {
    requests.push({ url: req.url ?? '', headers: req.headers });
    const payload = answerPortal(req.url ?? '');
    const body = Buffer.from(JSON.stringify(payload ?? { error: 'inconnu' }));
    const send = () => {
      res.writeHead(payload === null ? 404 : 200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
      });
      res.end(body);
    };
    if (delayMs > 0) setTimeout(send, delayMs);
    else send();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    port,
    requests,
    setDelay: (ms) => {
      delayMs = ms;
    },
    close: () => new Promise((resolve) => server.close(() => resolve(undefined))),
  };
}
