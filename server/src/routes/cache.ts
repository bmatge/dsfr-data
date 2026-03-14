/**
 * Data cache routes.
 * Stores API response data for fallback when external APIs are unavailable.
 */

import { Router } from 'express';
import { getDb } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * GET /:sourceId - Get cached data for a source
 * Returns the data if cache is not expired (based on TTL).
 */
router.get('/:sourceId', requireAuth, (req, res) => {
  const db = getDb();
  const cache = db.prepare(
    `SELECT * FROM data_cache
     WHERE source_id = ?
     AND datetime(fetched_at, '+' || ttl_seconds || ' seconds') > datetime('now')`,
  ).get(req.params.sourceId) as { data_json: string; data_hash: string; record_count: number; fetched_at: string; ttl_seconds: number } | undefined;

  if (!cache) {
    res.status(404).json({ error: 'No valid cache found' });
    return;
  }

  let data: unknown;
  try {
    data = JSON.parse(cache.data_json);
  } catch {
    data = null;
  }

  res.json({
    data,
    dataHash: cache.data_hash,
    recordCount: cache.record_count,
    fetchedAt: cache.fetched_at,
    ttlSeconds: cache.ttl_seconds,
  });
});

/**
 * PUT /:sourceId - Store/update cached data for a source
 */
router.put('/:sourceId', requireAuth, (req, res) => {
  const { data, dataHash, recordCount, ttlSeconds } = req.body;

  if (data === undefined) {
    res.status(400).json({ error: 'data is required' });
    return;
  }

  const db = getDb();
  db.prepare(
    `INSERT INTO data_cache (source_id, data_json, data_hash, record_count, ttl_seconds, fetched_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(source_id) DO UPDATE SET
       data_json = excluded.data_json,
       data_hash = excluded.data_hash,
       record_count = excluded.record_count,
       ttl_seconds = excluded.ttl_seconds,
       fetched_at = datetime('now')`,
  ).run(
    req.params.sourceId,
    JSON.stringify(data),
    dataHash || null,
    recordCount || 0,
    ttlSeconds || 3600,
  );

  res.json({ ok: true });
});

/**
 * DELETE /:sourceId - Invalidate cache for a source
 */
router.delete('/:sourceId', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM data_cache WHERE source_id = ?').run(req.params.sourceId);
  res.json({ ok: true });
});

export default router;
