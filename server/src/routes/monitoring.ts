/**
 * Monitoring routes.
 * Replaces the beacon pixel tracking with a centralized API.
 */

import { Router } from 'express';
import { getDb } from '../db/database.js';

const router = Router();

/**
 * POST /beacon - Record a widget usage beacon
 * No auth required (fire-and-forget from frontend).
 */
router.post('/beacon', (req, res) => {
  const { component, chartType, origin } = req.body;

  if (!component || !origin) {
    res.status(400).json({ error: 'component and origin are required' });
    return;
  }

  const db = getDb();

  try {
    db.prepare(
      `INSERT INTO monitoring (component, chart_type, origin)
       VALUES (?, ?, ?)
       ON CONFLICT(component, chart_type, origin) DO UPDATE SET
         last_seen = datetime('now'),
         call_count = call_count + 1`,
    ).run(component, chartType || null, origin);

    res.json({ ok: true });
  } catch (err) {
    console.error('Beacon error:', err);
    res.status(500).json({ error: 'Failed to record beacon' });
  }
});

/**
 * GET /data - Get monitoring data (compatible with monitoring-data.json format)
 */
router.get('/data', (req, res) => {
  const db = getDb();

  const rows = db.prepare(
    `SELECT component, chart_type, origin, first_seen, last_seen, call_count
     FROM monitoring
     ORDER BY last_seen DESC`,
  ).all() as {
    component: string;
    chart_type: string | null;
    origin: string;
    first_seen: string;
    last_seen: string;
    call_count: number;
  }[];

  // Group by origin for compatibility with existing monitoring app
  const byOrigin: Record<string, { components: Record<string, { chartTypes: string[]; count: number; firstSeen: string; lastSeen: string }> }> = {};

  for (const row of rows) {
    if (!byOrigin[row.origin]) {
      byOrigin[row.origin] = { components: {} };
    }
    const key = row.component;
    if (!byOrigin[row.origin].components[key]) {
      byOrigin[row.origin].components[key] = {
        chartTypes: [],
        count: 0,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
      };
    }
    const entry = byOrigin[row.origin].components[key];
    if (row.chart_type) entry.chartTypes.push(row.chart_type);
    entry.count += row.call_count;
    if (row.first_seen < entry.firstSeen) entry.firstSeen = row.first_seen;
    if (row.last_seen > entry.lastSeen) entry.lastSeen = row.last_seen;
  }

  res.json({
    origins: byOrigin,
    totalBeacons: rows.reduce((sum, r) => sum + r.call_count, 0),
    uniqueOrigins: Object.keys(byOrigin).length,
  });
});

export default router;
