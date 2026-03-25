/**
 * Data cache routes.
 * Stores API response data for fallback when external APIs are unavailable.
 */

import { Router } from 'express';
import { queryOne, execute } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * GET /:sourceId - Get cached data for a source
 * Returns the data if cache is not expired (based on TTL).
 */
router.get('/:sourceId', requireAuth, async (req, res) => {
  try {
    const cache = await queryOne<{
      data_json: string;
      data_hash: string;
      record_count: number;
      fetched_at: string;
      ttl_seconds: number;
    }>(
      `SELECT * FROM data_cache
       WHERE source_id = ?
       AND DATE_ADD(fetched_at, INTERVAL ttl_seconds SECOND) > NOW()`,
      [req.params.sourceId],
    );

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
  } catch (err) {
    console.error('Get cache error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /:sourceId - Store/update cached data for a source
 */
router.put('/:sourceId', requireAuth, async (req, res) => {
  try {
    const { data, dataHash, recordCount, ttlSeconds } = req.body;

    if (data === undefined) {
      res.status(400).json({ error: 'data is required' });
      return;
    }

    await execute(
      `INSERT INTO data_cache (source_id, data_json, data_hash, record_count, ttl_seconds, fetched_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         data_json = VALUES(data_json),
         data_hash = VALUES(data_hash),
         record_count = VALUES(record_count),
         ttl_seconds = VALUES(ttl_seconds),
         fetched_at = NOW()`,
      [
        req.params.sourceId,
        JSON.stringify(data),
        dataHash || null,
        recordCount || 0,
        ttlSeconds || 3600,
      ],
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Put cache error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /:sourceId - Invalidate cache for a source
 */
router.delete('/:sourceId', requireAuth, async (req, res) => {
  try {
    await execute('DELETE FROM data_cache WHERE source_id = ?', [req.params.sourceId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete cache error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
