/**
 * Shares management routes.
 * Only resource owners can create/delete shares.
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../db/database.js';
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
router.get('/', requireAuth, async (req, res) => {
  try {
    const { resource_type, resource_id } = req.query;

    if (!resource_type || !resource_id) {
      res.status(400).json({ error: 'resource_type and resource_id are required' });
      return;
    }

    const shares = await query(
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
       LEFT JOIN \`groups\` g ON s.target_type = 'group' AND s.target_id = g.id
       WHERE s.resource_type = ? AND s.resource_id = ?
       ORDER BY s.created_at DESC`,
      [resource_type, resource_id]
    );

    res.json(shares);
  } catch (err) {
    console.error('List shares error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST / - Create a share
 */
router.post('/', requireAuth, async (req, res) => {
  try {
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

    // Check ownership
    const resource = await queryOne<{ owner_id: string }>(
      `SELECT owner_id FROM ${table} WHERE id = ?`,
      [resource_id]
    );
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
      await execute(
        `INSERT INTO shares (id, resource_type, resource_id, target_type, target_id, permission, granted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, resource_type, resource_id, target_type, target_id || null, perm, authReq.user!.userId]
      );

      const share = await queryOne('SELECT * FROM shares WHERE id = ?', [id]);
      res.status(201).json(share);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as { code: string }).code === 'ER_DUP_ENTRY'
      ) {
        res.status(409).json({ error: 'Share already exists' });
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error('Create share error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /:id - Remove a share (resource owner only)
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;

    const share = await queryOne<{
      resource_type: string;
      resource_id: string;
      granted_by: string;
    }>('SELECT * FROM shares WHERE id = ?', [req.params.id]);
    if (!share) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    // Check that the user owns the resource
    const table = RESOURCE_TABLES[share.resource_type];
    if (table) {
      const resource = await queryOne<{ owner_id: string }>(
        `SELECT owner_id FROM ${table} WHERE id = ?`,
        [share.resource_id]
      );
      if (resource && resource.owner_id !== authReq.user!.userId) {
        res.status(403).json({ error: 'Only the resource owner can remove shares' });
        return;
      }
    }

    await execute('DELETE FROM shares WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete share error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
