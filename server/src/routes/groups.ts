/**
 * Groups CRUD routes.
 * Groups allow sharing resources with multiple users at once.
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * GET / - List groups the user belongs to
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;

    const groups = await query<Record<string, unknown> & { member_role: string }>(
      `SELECT g.*, gm.role as member_role
       FROM \`groups\` g
       JOIN group_members gm ON g.id = gm.group_id
       WHERE gm.user_id = ?
       ORDER BY g.name`,
      [authReq.user!.userId]
    );

    // Add member count to each group
    const result = await Promise.all(
      groups.map(async (g) => {
        const countRow = await queryOne<{ count: number }>(
          'SELECT COUNT(*) as count FROM group_members WHERE group_id = ?',
          [g.id]
        );
        return { ...g, memberCount: countRow?.count ?? 0 };
      })
    );

    res.json(result);
  } catch (err) {
    console.error('List groups error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST / - Create a new group
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { name, description } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Group name is required' });
      return;
    }

    const id = uuidv4();

    await execute('INSERT INTO `groups` (id, name, description, created_by) VALUES (?, ?, ?, ?)', [
      id,
      name,
      description || null,
      authReq.user!.userId,
    ]);

    // Creator becomes admin of the group
    await execute('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)', [
      id,
      authReq.user!.userId,
      'admin',
    ]);

    const group = await queryOne('SELECT * FROM `groups` WHERE id = ?', [id]);
    res.status(201).json({ ...group, memberCount: 1 });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /:id - Update a group (admin only)
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;

    // Check admin role in group
    const membership = await queryOne<{ role: string }>(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [req.params.id, authReq.user!.userId]
    );

    if (!membership || membership.role !== 'admin') {
      res.status(403).json({ error: 'Only group admins can update the group' });
      return;
    }

    const { name, description } = req.body;
    if (name) {
      await execute('UPDATE `groups` SET name = ?, description = ? WHERE id = ?', [
        name,
        description ?? null,
        req.params.id,
      ]);
    }

    const group = await queryOne('SELECT * FROM `groups` WHERE id = ?', [req.params.id]);
    res.json(group);
  } catch (err) {
    console.error('Update group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /:id - Delete a group (admin only)
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;

    const membership = await queryOne<{ role: string }>(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [req.params.id, authReq.user!.userId]
    );

    if (!membership || membership.role !== 'admin') {
      res.status(403).json({ error: 'Only group admins can delete the group' });
      return;
    }

    // Delete group shares
    await execute("DELETE FROM shares WHERE target_type = 'group' AND target_id = ?", [
      req.params.id,
    ]);
    // Delete group (cascades to group_members)
    await execute('DELETE FROM `groups` WHERE id = ?', [req.params.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /:id/members - List group members
 */
router.get('/:id/members', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;

    // Check membership
    const membership = await queryOne(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [req.params.id, authReq.user!.userId]
    );

    if (!membership) {
      res.status(403).json({ error: 'You are not a member of this group' });
      return;
    }

    const members = await query<{ id: string; email: string; display_name: string; role: string }>(
      `SELECT u.id, u.email, u.display_name, gm.role
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ?
       ORDER BY gm.role DESC, u.display_name`,
      [req.params.id]
    );

    res.json(
      members.map((m) => ({
        id: m.id,
        email: m.email,
        displayName: m.display_name,
        role: m.role,
      }))
    );
  } catch (err) {
    console.error('List members error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /:id/members - Add a member to the group (admin only)
 */
router.post('/:id/members', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;

    const membership = await queryOne<{ role: string }>(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [req.params.id, authReq.user!.userId]
    );

    if (!membership || membership.role !== 'admin') {
      res.status(403).json({ error: 'Only group admins can add members' });
      return;
    }

    const { userId, role } = req.body;
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    // Check user exists
    const user = await queryOne('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check not already a member
    const existing = await queryOne(
      'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?',
      [req.params.id, userId]
    );

    if (existing) {
      res.status(409).json({ error: 'User is already a member' });
      return;
    }

    await execute('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)', [
      req.params.id,
      userId,
      role || 'member',
    ]);

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /:id/members/:userId - Remove a member from the group (admin only)
 */
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;

    const membership = await queryOne<{ role: string }>(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [req.params.id, authReq.user!.userId]
    );

    if (!membership || membership.role !== 'admin') {
      res.status(403).json({ error: 'Only group admins can remove members' });
      return;
    }

    // Cannot remove yourself if you're the only admin
    if (req.params.userId === authReq.user!.userId) {
      const adminCount = await queryOne<{ count: number }>(
        "SELECT COUNT(*) as count FROM group_members WHERE group_id = ? AND role = 'admin'",
        [req.params.id]
      );

      if ((adminCount?.count ?? 0) <= 1) {
        res.status(400).json({ error: 'Cannot remove the last admin from the group' });
        return;
      }
    }

    await execute('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [
      req.params.id,
      req.params.userId,
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
