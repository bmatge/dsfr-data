/**
 * Groups CRUD routes.
 * Groups allow sharing resources with multiple users at once.
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * GET / - List groups the user belongs to
 */
router.get('/', requireAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const db = getDb();

  const groups = db.prepare(
    `SELECT g.*, gm.role as member_role
     FROM groups g
     JOIN group_members gm ON g.id = gm.group_id
     WHERE gm.user_id = ?
     ORDER BY g.name`,
  ).all(authReq.user!.userId) as (Record<string, unknown> & { member_role: string })[];

  // Add member count to each group
  const result = groups.map(g => {
    const memberCount = (db.prepare(
      'SELECT COUNT(*) as count FROM group_members WHERE group_id = ?',
    ).get(g.id) as { count: number }).count;
    return { ...g, memberCount };
  });

  res.json(result);
});

/**
 * POST / - Create a new group
 */
router.post('/', requireAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { name, description } = req.body;

  if (!name) {
    res.status(400).json({ error: 'Group name is required' });
    return;
  }

  const db = getDb();
  const id = uuidv4();

  db.prepare('INSERT INTO groups (id, name, description, created_by) VALUES (?, ?, ?, ?)')
    .run(id, name, description || null, authReq.user!.userId);

  // Creator becomes admin of the group
  db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)')
    .run(id, authReq.user!.userId, 'admin');

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as Record<string, unknown>;
  res.status(201).json({ ...group, memberCount: 1 });
});

/**
 * PUT /:id - Update a group (admin only)
 */
router.put('/:id', requireAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const db = getDb();

  // Check admin role in group
  const membership = db.prepare(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
  ).get(req.params.id, authReq.user!.userId) as { role: string } | undefined;

  if (!membership || membership.role !== 'admin') {
    res.status(403).json({ error: 'Only group admins can update the group' });
    return;
  }

  const { name, description } = req.body;
  if (name) {
    db.prepare('UPDATE groups SET name = ?, description = ? WHERE id = ?')
      .run(name, description ?? null, req.params.id);
  }

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  res.json(group);
});

/**
 * DELETE /:id - Delete a group (admin only)
 */
router.delete('/:id', requireAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const db = getDb();

  const membership = db.prepare(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
  ).get(req.params.id, authReq.user!.userId) as { role: string } | undefined;

  if (!membership || membership.role !== 'admin') {
    res.status(403).json({ error: 'Only group admins can delete the group' });
    return;
  }

  // Delete group shares
  db.prepare("DELETE FROM shares WHERE target_type = 'group' AND target_id = ?").run(req.params.id);
  // Delete group (cascades to group_members)
  db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id);

  res.json({ ok: true });
});

/**
 * GET /:id/members - List group members
 */
router.get('/:id/members', requireAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const db = getDb();

  // Check membership
  const membership = db.prepare(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
  ).get(req.params.id, authReq.user!.userId);

  if (!membership) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const members = db.prepare(
    `SELECT u.id, u.email, u.display_name, gm.role
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = ?
     ORDER BY gm.role DESC, u.display_name`,
  ).all(req.params.id) as { id: string; email: string; display_name: string; role: string }[];

  res.json(members.map(m => ({
    id: m.id,
    email: m.email,
    displayName: m.display_name,
    role: m.role,
  })));
});

/**
 * POST /:id/members - Add a member to the group (admin only)
 */
router.post('/:id/members', requireAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const db = getDb();

  const membership = db.prepare(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
  ).get(req.params.id, authReq.user!.userId) as { role: string } | undefined;

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
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Check not already a member
  const existing = db.prepare(
    'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?',
  ).get(req.params.id, userId);

  if (existing) {
    res.status(409).json({ error: 'User is already a member' });
    return;
  }

  db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)')
    .run(req.params.id, userId, role || 'member');

  res.status(201).json({ ok: true });
});

/**
 * DELETE /:id/members/:userId - Remove a member from the group (admin only)
 */
router.delete('/:id/members/:userId', requireAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const db = getDb();

  const membership = db.prepare(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
  ).get(req.params.id, authReq.user!.userId) as { role: string } | undefined;

  if (!membership || membership.role !== 'admin') {
    res.status(403).json({ error: 'Only group admins can remove members' });
    return;
  }

  // Cannot remove yourself if you're the only admin
  if (req.params.userId === authReq.user!.userId) {
    const adminCount = (db.prepare(
      "SELECT COUNT(*) as count FROM group_members WHERE group_id = ? AND role = 'admin'",
    ).get(req.params.id) as { count: number }).count;

    if (adminCount <= 1) {
      res.status(400).json({ error: 'Cannot remove the last admin from the group' });
      return;
    }
  }

  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?')
    .run(req.params.id, req.params.userId);

  res.json({ ok: true });
});

export default router;
