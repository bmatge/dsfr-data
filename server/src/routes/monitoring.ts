/**
 * Monitoring routes.
 * Replaces the beacon pixel tracking with a centralized API.
 */

import { Router } from 'express';
import { query, execute } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { beaconRateLimiter } from '../middleware/rate-limit.js';

const router = Router();

/**
 * POST /beacon - Record a widget usage beacon
 * No auth required (fire-and-forget from frontend).
 * Rate-limited: 60 requests/minute/IP.
 * Accepts `pageUrl` (full origin+path, new) or `origin` (origin only, legacy).
 */
router.post('/beacon', beaconRateLimiter, async (req, res) => {
  const { component, chartType, pageUrl, origin } = req.body;

  // Accept pageUrl (new) or origin (legacy) — prefer pageUrl
  const url = pageUrl || origin;

  if (!component || !url) {
    res.status(400).json({ error: 'component and pageUrl are required' });
    return;
  }

  try {
    await execute(
      `INSERT INTO monitoring (component, chart_type, origin)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         last_seen = NOW(),
         call_count = call_count + 1`,
      [component, chartType || null, url]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Beacon error:', err);
    res.status(500).json({ error: 'Failed to record beacon' });
  }
});

/**
 * GET /data - Get monitoring data (compatible with monitoring-data.json format)
 * Returns flat entries with referer (= origin column, now stores full URL).
 */
router.get('/data', requireAuth, async (_req, res) => {
  try {
    const rows = await query<{
      component: string;
      chart_type: string | null;
      origin: string;
      first_seen: string;
      last_seen: string;
      call_count: number;
    }>(
      `SELECT component, chart_type, origin, first_seen, last_seen, call_count
       FROM monitoring
       ORDER BY last_seen DESC`
    );

    // Flat format compatible with the monitoring frontend
    const entries = rows.map((row) => ({
      referer: row.origin,
      component: row.component,
      chartType: row.chart_type,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      callCount: row.call_count,
    }));

    const sites = new Set(
      entries.map((e) => {
        try {
          return new URL(e.referer).hostname;
        } catch {
          return e.referer;
        }
      })
    );

    const byComponent: Record<string, number> = {};
    const byChartType: Record<string, number> = {};
    for (const e of entries) {
      byComponent[e.component] = (byComponent[e.component] || 0) + 1;
      if (e.chartType) byChartType[e.chartType] = (byChartType[e.chartType] || 0) + 1;
    }

    res.json({
      generated: new Date().toISOString(),
      entries,
      summary: {
        totalSites: sites.size,
        totalComponents: entries.length,
        byComponent,
        byChartType,
      },
    });
  } catch (err) {
    console.error('Get monitoring data error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /data - Purge all monitoring data (admin only)
 */
router.delete('/data', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    await execute('DELETE FROM monitoring');
    res.json({ ok: true });
  } catch (err) {
    console.error('Purge monitoring error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /entries - Delete monitoring entries for a specific page URL (admin only)
 */
router.delete('/entries', requireAuth, requireRole('admin'), async (req, res) => {
  const { referer } = req.body;
  if (!referer) {
    res.status(400).json({ error: 'referer is required' });
    return;
  }

  try {
    await execute('DELETE FROM monitoring WHERE origin = ?', [referer]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete monitoring entries error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
