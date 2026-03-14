/**
 * Migration route.
 * Imports localStorage data into the database for a user.
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

interface MigratePayload {
  sources?: unknown[];
  connections?: unknown[];
  favorites?: unknown[];
  dashboards?: unknown[];
}

/**
 * POST / - Import localStorage data into the database
 * Deduplicates by id (skips existing).
 */
router.post('/', requireAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user!.userId;
  const payload = req.body as MigratePayload;
  const db = getDb();

  const result = {
    imported: { sources: 0, connections: 0, favorites: 0, dashboards: 0 },
    skipped: { sources: 0, connections: 0, favorites: 0, dashboards: 0 },
  };

  const importInTransaction = db.transaction(() => {
    // Sources
    if (Array.isArray(payload.sources)) {
      for (const src of payload.sources) {
        const s = src as Record<string, unknown>;
        const id = (s.id as string) || uuidv4();
        const existing = db.prepare('SELECT id FROM sources WHERE id = ?').get(id);
        if (existing) {
          result.skipped.sources++;
          continue;
        }
        db.prepare(
          'INSERT INTO sources (id, owner_id, name, type, config_json, data_json, record_count) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(
          id, userId,
          s.name || 'Unnamed',
          s.type || 'manual',
          JSON.stringify(extractConfig(s)),
          s.data ? JSON.stringify(s.data) : null,
          s.recordCount || 0,
        );
        result.imported.sources++;
      }
    }

    // Connections
    if (Array.isArray(payload.connections)) {
      for (const conn of payload.connections) {
        const c = conn as Record<string, unknown>;
        const id = (c.id as string) || uuidv4();
        const existing = db.prepare('SELECT id FROM connections WHERE id = ?').get(id);
        if (existing) {
          result.skipped.connections++;
          continue;
        }
        db.prepare(
          'INSERT INTO connections (id, owner_id, name, type, config_json, api_key_encrypted, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(
          id, userId,
          c.name || 'Unnamed',
          c.type || 'api',
          JSON.stringify(c),
          (c.apiKey as string) || null,
          (c.status as string) || 'unknown',
        );
        result.imported.connections++;
      }
    }

    // Favorites
    if (Array.isArray(payload.favorites)) {
      for (const fav of payload.favorites) {
        const f = fav as Record<string, unknown>;
        const id = (f.id as string) || uuidv4();
        const existing = db.prepare('SELECT id FROM favorites WHERE id = ?').get(id);
        if (existing) {
          result.skipped.favorites++;
          continue;
        }
        db.prepare(
          'INSERT INTO favorites (id, owner_id, name, chart_type, code, builder_state_json, source_app) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(
          id, userId,
          f.name || 'Unnamed',
          (f.chartType as string) || null,
          (f.code as string) || '',
          f.builderState ? JSON.stringify(f.builderState) : null,
          (f.source as string) || null,
        );
        result.imported.favorites++;
      }
    }

    // Dashboards
    if (Array.isArray(payload.dashboards)) {
      for (const dash of payload.dashboards) {
        const d = dash as Record<string, unknown>;
        const id = (d.id as string) || uuidv4();
        const existing = db.prepare('SELECT id FROM dashboards WHERE id = ?').get(id);
        if (existing) {
          result.skipped.dashboards++;
          continue;
        }
        db.prepare(
          'INSERT INTO dashboards (id, owner_id, name, description, layout_json, widgets_json) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(
          id, userId,
          d.name || 'Unnamed',
          (d.description as string) || null,
          d.layout ? JSON.stringify(d.layout) : '{}',
          d.widgets ? JSON.stringify(d.widgets) : '[]',
        );
        result.imported.dashboards++;
      }
    }
  });

  try {
    importInTransaction();
    res.json(result);
  } catch (err) {
    console.error('Migration error:', err);
    res.status(500).json({ error: 'Migration failed' });
  }
});

/**
 * Extract config fields from a source object (everything except data, id, name, type, recordCount).
 */
function extractConfig(source: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const skip = new Set(['id', 'name', 'type', 'data', 'recordCount', 'rawRecords']);
  for (const [key, value] of Object.entries(source)) {
    if (!skip.has(key)) {
      config[key] = value;
    }
  }
  return config;
}

export default router;
