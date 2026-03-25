/**
 * Migration route.
 * Imports localStorage data into the database for a user.
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { transaction, connQueryOne, connExecute } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { PoolConnection } from 'mysql2/promise';

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
router.post('/', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.userId;
    const payload = req.body as MigratePayload;

    const result = {
      imported: { sources: 0, connections: 0, favorites: 0, dashboards: 0 },
      skipped: { sources: 0, connections: 0, favorites: 0, dashboards: 0 },
    };

    await transaction(async (conn: PoolConnection) => {
      // Sources
      if (Array.isArray(payload.sources)) {
        for (const src of payload.sources) {
          const s = src as Record<string, unknown>;
          const id = (s.id as string) || uuidv4();
          const existing = await connQueryOne(conn, 'SELECT id FROM sources WHERE id = ?', [id]);
          if (existing) {
            result.skipped.sources++;
            continue;
          }
          await connExecute(conn,
            'INSERT INTO sources (id, owner_id, name, type, config_json, data_json, record_count) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              id, userId,
              s.name || 'Unnamed',
              s.type || 'manual',
              JSON.stringify(extractConfig(s)),
              s.data ? JSON.stringify(s.data) : null,
              s.recordCount || 0,
            ],
          );
          result.imported.sources++;
        }
      }

      // Connections
      if (Array.isArray(payload.connections)) {
        for (const conn2 of payload.connections) {
          const c = conn2 as Record<string, unknown>;
          const id = (c.id as string) || uuidv4();
          const existing = await connQueryOne(conn, 'SELECT id FROM connections WHERE id = ?', [id]);
          if (existing) {
            result.skipped.connections++;
            continue;
          }
          await connExecute(conn,
            'INSERT INTO connections (id, owner_id, name, type, config_json, api_key_encrypted, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              id, userId,
              c.name || 'Unnamed',
              c.type || 'api',
              JSON.stringify(c),
              (c.apiKey as string) || null,
              (c.status as string) || 'unknown',
            ],
          );
          result.imported.connections++;
        }
      }

      // Favorites
      if (Array.isArray(payload.favorites)) {
        for (const fav of payload.favorites) {
          const f = fav as Record<string, unknown>;
          const id = (f.id as string) || uuidv4();
          const existing = await connQueryOne(conn, 'SELECT id FROM favorites WHERE id = ?', [id]);
          if (existing) {
            result.skipped.favorites++;
            continue;
          }
          await connExecute(conn,
            'INSERT INTO favorites (id, owner_id, name, chart_type, code, builder_state_json, source_app) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              id, userId,
              f.name || 'Unnamed',
              (f.chartType as string) || null,
              (f.code as string) || '',
              f.builderState ? JSON.stringify(f.builderState) : null,
              (f.source as string) || null,
            ],
          );
          result.imported.favorites++;
        }
      }

      // Dashboards
      if (Array.isArray(payload.dashboards)) {
        for (const dash of payload.dashboards) {
          const d = dash as Record<string, unknown>;
          const id = (d.id as string) || uuidv4();
          const existing = await connQueryOne(conn, 'SELECT id FROM dashboards WHERE id = ?', [id]);
          if (existing) {
            result.skipped.dashboards++;
            continue;
          }
          await connExecute(conn,
            'INSERT INTO dashboards (id, owner_id, name, description, layout_json, widgets_json) VALUES (?, ?, ?, ?, ?, ?)',
            [
              id, userId,
              d.name || 'Unnamed',
              (d.description as string) || null,
              d.layout ? JSON.stringify(d.layout) : '{}',
              d.widgets ? JSON.stringify(d.widgets) : '[]',
            ],
          );
          result.imported.dashboards++;
        }
      }
    });

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
