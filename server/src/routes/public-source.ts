/**
 * Route publique de source (ADR-165, #1361).
 *
 * `GET /api/public/sources/:token/records` sert les lignes d'une source
 * PUBLIÉE par son propriétaire (un partage `public` sur la ressource
 * `source`, table `shares`), en lisant l'amont avec la clé déchiffrée côté
 * serveur. La clé ne quitte jamais le serveur ; l'URL amont est fixée par la
 * configuration de la source (`utils/source-upstream.ts`), jamais par la
 * requête.
 *
 * La même lecture, authentifiée, est exposée par `GET /api/sources/:id/records`
 * (routes/sources.ts) pour l'aperçu des apps avant publication.
 *
 * Réponses :
 *  - 200 : le JSON Grist tel quel (`{ records: [{ id, fields }] }`), pour que
 *    `transform="records"` du mode URL de `dsfr-data-source` s'applique ;
 *  - 404 : jeton mal formé, inconnu, révoqué, expiré, ou source non
 *    résoluble — indistincts, sans contacter l'amont ;
 *  - 403 : l'amont refuse la clé (401/403) ;
 *  - 502 : toute autre panne amont (hors https, délai, type de contenu).
 *
 * Ni la clé ni les en-têtes du visiteur ne figurent dans une réponse ou un
 * journal (C-FUITE-1 et C-FUITE-2 du relais, repris ici).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { queryOne } from '../db/database.js';
import { publicSourceRateLimiter } from '../middleware/rate-limit.js';
import { decryptApiKey } from './connections.js';
import {
  isWellFormedToken,
  resolveGristUpstream,
  type SourceUpstreamConfig,
} from '../utils/source-upstream.js';

const router = Router();

/** Durée de cache (navigateur et mémoire), en secondes. */
export const PUBLIC_SOURCE_CACHE_TTL = Math.max(
  0,
  Number.parseInt(process.env.PUBLIC_SOURCE_CACHE_TTL || '300', 10) || 300
);

/** Délai amont, en millisecondes. */
const UPSTREAM_TIMEOUT_MS = 15_000;

/** Taille maximale d'une réponse amont relayée (octets). */
const UPSTREAM_MAX_BYTES = 20 * 1024 * 1024;

interface ShareRow {
  id: string;
  resource_id: string;
  expires_at: string | null;
  revoked_at: string | null;
}

interface SourceRow {
  id: string;
  owner_id: string;
  type: string;
  config_json: unknown;
}

interface ConnectionRow {
  owner_id: string;
  type: string;
  config_json: unknown;
  api_key_encrypted: string | null;
}

interface CachedBody {
  expiresAt: number;
  body: string;
}

/** Cache mémoire par source : une table publiée n'est lue qu'une fois par TTL. */
const cache = new Map<string, CachedBody>();

function parseJson(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Lit l'amont d'une source et écrit la réponse. `cacheKey` isole le cache de
 * la route publique (par jeton) de celui de la route authentifiée (par id).
 */
export async function serveSourceRecords(
  source: SourceRow,
  res: Response,
  cacheKey: string
): Promise<void> {
  const config = parseJson(source.config_json) as SourceUpstreamConfig | null;
  if (source.type !== 'grist' || !config) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }

  let connection: { type?: unknown; url?: unknown; apiKey?: string | null } | null = null;
  if (typeof config.connectionId === 'string' && config.connectionId) {
    const row = await queryOne<ConnectionRow>(
      'SELECT owner_id, type, config_json, api_key_encrypted FROM connections WHERE id = ?',
      [config.connectionId]
    );
    // La connexion doit appartenir au propriétaire de la source : une source
    // ne lit jamais avec la clé d'un autre compte.
    if (row && row.owner_id === source.owner_id) {
      const connConfig = parseJson(row.config_json) ?? {};
      connection = {
        type: row.type,
        url: connConfig.url,
        apiKey: decryptApiKey(row.api_key_encrypted),
      };
    }
  }

  const upstream = resolveGristUpstream(config, connection);
  if (!upstream) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }

  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', `public, max-age=${PUBLIC_SOURCE_CACHE_TTL}`);
  res.set('Vary', 'Accept-Encoding');

  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    res.type('application/json').send(hit.body);
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let upstreamRes: globalThis.Response;
  try {
    upstreamRes = await fetch(upstream.url, {
      method: 'GET',
      headers: upstream.headers,
      redirect: 'error',
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    res.status(502).json({ error: 'Upstream unavailable', code: 'UPSTREAM' });
    return;
  }
  clearTimeout(timer);

  if (upstreamRes.status === 401 || upstreamRes.status === 403) {
    res.status(403).json({ error: 'Access restricted', code: 'ACCES_RESTREINT' });
    return;
  }
  if (!upstreamRes.ok) {
    res.status(502).json({ error: 'Upstream error', code: 'UPSTREAM' });
    return;
  }
  const contentType = (upstreamRes.headers.get('content-type') || '').split(';')[0].trim();
  if (contentType !== 'application/json') {
    res.status(502).json({ error: 'Upstream returned a non-JSON body', code: 'UPSTREAM' });
    return;
  }

  let body: string;
  try {
    body = await upstreamRes.text();
  } catch {
    res.status(502).json({ error: 'Upstream read failed', code: 'UPSTREAM' });
    return;
  }
  if (Buffer.byteLength(body) > UPSTREAM_MAX_BYTES) {
    res.status(502).json({ error: 'Upstream body too large', code: 'UPSTREAM' });
    return;
  }

  if (PUBLIC_SOURCE_CACHE_TTL > 0) {
    cache.set(cacheKey, { expiresAt: now + PUBLIC_SOURCE_CACHE_TTL * 1000, body });
  }
  res.type('application/json').send(body);
}

/** Vide le cache mémoire (tests, révocation). */
export function clearPublicSourceCache(): void {
  cache.clear();
}

router.use(publicSourceRateLimiter);

router.get('/:token/records', async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    if (!isWellFormedToken(token)) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }

    const share = await queryOne<ShareRow>(
      `SELECT id, resource_id, expires_at, revoked_at
       FROM shares
       WHERE id = ? AND target_type = 'public' AND resource_type = 'source'`,
      [token]
    );
    if (
      !share ||
      share.revoked_at ||
      (share.expires_at && new Date(share.expires_at).getTime() <= Date.now())
    ) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }

    const source = await queryOne<SourceRow>(
      'SELECT id, owner_id, type, config_json FROM sources WHERE id = ?',
      [share.resource_id]
    );
    if (!source) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }

    await serveSourceRecords(source, res, `token:${token}`);
  } catch (err) {
    console.error('Public source error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
