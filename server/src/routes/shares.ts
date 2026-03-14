/**
 * Shares management routes.
 * Only resource owners can create/delete shares.
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

const RESOURCE_TABLES: Record<string, string> = {
  source: 'sources',
  connection: 'connections',
  favorite: 'favorites',
  dashboard: 'dashboards',
};

/**
 * GET / - List shares for a resource
 * Query params: resource_type, resource_id
 */
router.get('/', requireAuth, (req, res) => {
  const { resource_type, resource_id } = req.query;

  if (!resource_type || !resource_id) {
    res.status(400).json({ error: 'resource_type and resource_id are required' });
    return;
  }

  const db = getDb();

  const shares = db.prepare(
    `SELECT s.*,
            CASE
              WHEN s.target_type = 'user' THEN u.display_name
              WHEN s.target_type = 'group' THEN g.name
              ELSE 'Tout le monde'
            END as target_name,
            CASE
              WHEN s.target_type = 'user' THEN u.email
              ELSE NULL
            END as target_email
     FROM shares s
     LEFT JOIN users u ON s.target_type = 'user' AND s.target_id = u.id
     LEFT JOIN groups g ON s.target_type = 'group' AND s.target_id = g.id
     WHERE s.resource_type = ? AND s.resource_id = ?
     ORDER BY s.created_at DESC`,
  ).all(resource_type, resource_id);

  res.json(shares);
});

/**
 * POST / - Create a share
 */
router.post('/', requireAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { resource_type, resource_id, target_type, target_id, permission } = req.body;

  if (!resource_type || !resource_id || !target_type) {
    res.status(400).json({ error: 'resource_type, resource_id, and target_type are required' });
    return;
  }

  const table = RESOURCE_TABLES[resource_type];
  if (!table) {
    res.status(400).json({ error: 'Invalid resource_type' });
    return;
  }

  if (!['user', 'group', 'global'].includes(target_type)) {
    res.status(400).json({ error: 'target_type must be user, group, or global' });
    return;
  }

  if (target_type !== 'global' && !target_id) {
    res.status(400).json({ error: 'target_id is required for user and group shares' });
    return;
  }

  const db = getDb();

  // Check ownership
  const resource = db.prepare(`SELECT owner_id FROM ${table} WHERE id = ?`).get(resource_id) as { owner_id: string } | undefined;
  if (!resource) {
    res.status(404).json({ error: 'Resource not found' });
    return;
  }

  if (resource.owner_id !== authReq.user!.userId) {
    res.status(403).json({ error: 'Only the owner can share this resource' });
    return;
  }

  // Cannot share with yourself
  if (target_type === 'user' && target_id === authReq.user!.userId) {
    res.status(400).json({ error: 'Cannot share with yourself' });
    return;
  }

  const id = uuidv4();
  const perm = permission === 'write' ? 'write' : 'read';

  try {
    db.prepare(
      `INSERT INTO shares (id, resource_type, resource_id, target_type, target_id, permission, granted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, resource_type, resource_id, target_type, target_id || null, perm, authReq.user!.userId);

    const share = db.prepare('SELECT * FROM shares WHERE id = ?').get(id);
    res.status(201).json(share);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      res.status(409).json({ error: 'Share already exists' });
    } else {
      throw err;
    }
  }
});

/**
 * DELETE /:id - Remove a share (resource owner only)
 */
router.delete('/:id', requireAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const db = getDb();

  const share = db.prepare('SELECT * FROM shares WHERE id = ?').get(req.params.id) as { resource_type: string; resource_id: string; granted_by: string } | undefined;
  if (!share) {
    res.status(404).json({ error: 'Share not found' });
    return;
  }

  // Check that the user owns the resource
  const table = RESOURCE_TABLES[share.resource_type];
  if (table) {
    const resource = db.prepare(`SELECT owner_id FROM ${table} WHERE id = ?`).get(share.resource_id) as { owner_id: string } | undefined;
    if (resource && resource.owner_id !== authReq.user!.userId) {
      res.status(403).json({ error: 'Only the resource owner can remove shares' });
      return;
    }
  }

  db.prepare('DELETE FROM shares WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
