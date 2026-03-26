/**
 * Admin routes: user management, session management, audit log, stats.
 * All endpoints require admin role.
 */

import { Router } from 'express';
import { query, queryOne, execute, transaction, connQuery, connQueryOne, connExecute } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { revokeAllUserSessions } from '../utils/sessions.js';
import { logAudit } from '../utils/audit.js';

const router = Router();

// All admin routes require auth + admin role
router.use(requireAuth);
router.use(requireRole('admin'));

/**
 * GET /api/admin/users
 * Paginated list of all users.
 */
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const countRow = await queryOne<{ total: number }>('SELECT COUNT(*) as total FROM users');
    const total = countRow?.total || 0;

    const users = await query<{
      id: string; email: string; display_name: string; role: string;
      auth_provider: string; is_active: number; email_verified: number;
      last_login: string | null; created_at: string;
    }>(
      `SELECT id, email, display_name, role, auth_provider, is_active, email_verified, last_login, created_at
       FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    res.json({
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        displayName: u.display_name,
        role: u.role,
        authProvider: u.auth_provider,
        isActive: !!u.is_active,
        emailVerified: !!u.email_verified,
        lastLogin: u.last_login,
        createdAt: u.created_at,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/users/:id
 * User detail with resource counts.
 */
router.get('/users/:id', async (req, res) => {
  try {
    const user = await queryOne<{
      id: string; email: string; display_name: string; role: string;
      auth_provider: string; external_id: string | null; idp_id: string | null;
      siret: string | null; organizational_unit: string | null;
      is_active: number; email_verified: number; last_login: string | null; created_at: string;
    }>(
      `SELECT id, email, display_name, role, auth_provider, external_id, idp_id, siret,
       organizational_unit, is_active, email_verified, last_login, created_at
       FROM users WHERE id = ?`,
      [req.params.id],
    );

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Count resources
    const [sources, connections, favorites, dashboards] = await Promise.all([
      queryOne<{ count: number }>('SELECT COUNT(*) as count FROM sources WHERE owner_id = ?', [user.id]),
      queryOne<{ count: number }>('SELECT COUNT(*) as count FROM connections WHERE owner_id = ?', [user.id]),
      queryOne<{ count: number }>('SELECT COUNT(*) as count FROM favorites WHERE owner_id = ?', [user.id]),
      queryOne<{ count: number }>('SELECT COUNT(*) as count FROM dashboards WHERE owner_id = ?', [user.id]),
    ]);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        authProvider: user.auth_provider,
        externalId: user.external_id,
        idpId: user.idp_id,
        siret: user.siret,
        organizationalUnit: user.organizational_unit,
        isActive: !!user.is_active,
        emailVerified: !!user.email_verified,
        lastLogin: user.last_login,
        createdAt: user.created_at,
      },
      resources: {
        sources: sources?.count || 0,
        connections: connections?.count || 0,
        favorites: favorites?.count || 0,
        dashboards: dashboards?.count || 0,
      },
    });
  } catch (err) {
    console.error('Admin get user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/users/:id/role
 * Change a user's role.
 */
router.put('/users/:id/role', async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { role } = req.body;
    const targetId = req.params.id;

    if (!['admin', 'editor', 'viewer'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be admin, editor, or viewer' });
      return;
    }

    // Cannot change own role
    if (targetId === authReq.user!.userId) {
      res.status(400).json({ error: 'Cannot change your own role' });
      return;
    }

    const target = await queryOne<{ id: string; role: string }>(
      'SELECT id, role FROM users WHERE id = ?', [targetId],
    );
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // If demoting from admin, ensure at least 1 admin remains
    if (target.role === 'admin' && role !== 'admin') {
      const adminCount = await queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = TRUE',
        ['admin'],
      );
      if ((adminCount?.count || 0) <= 1) {
        res.status(400).json({ error: 'Cannot remove the last admin' });
        return;
      }
    }

    await execute('UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?', [role, targetId]);
    await logAudit(req, 'role_change', 'user', targetId, { from: target.role, to: role });

    res.json({ ok: true, role });
  } catch (err) {
    console.error('Admin change role error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/users/:id/status
 * Activate or deactivate a user.
 */
router.put('/users/:id/status', async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { active } = req.body;
    const targetId = req.params.id;

    if (typeof active !== 'boolean') {
      res.status(400).json({ error: 'active must be a boolean' });
      return;
    }

    // Cannot deactivate yourself
    if (targetId === authReq.user!.userId && !active) {
      res.status(400).json({ error: 'Cannot deactivate your own account' });
      return;
    }

    const target = await queryOne<{ id: string; role: string }>(
      'SELECT id, role FROM users WHERE id = ?', [targetId],
    );
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // If deactivating an admin, ensure at least 1 active admin remains
    if (!active && target.role === 'admin') {
      const adminCount = await queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = TRUE',
        ['admin'],
      );
      if ((adminCount?.count || 0) <= 1) {
        res.status(400).json({ error: 'Cannot deactivate the last admin' });
        return;
      }
    }

    await execute('UPDATE users SET is_active = ?, updated_at = NOW() WHERE id = ?', [active, targetId]);
    await logAudit(req, active ? 'user_activate' : 'user_deactivate', 'user', targetId);

    // Revoke all sessions when deactivating
    if (!active) {
      await revokeAllUserSessions(targetId);
    }

    res.json({ ok: true, active });
  } catch (err) {
    console.error('Admin change status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user and cascade (resources, shares, group_members).
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const targetId = req.params.id;

    // Cannot delete yourself
    if (targetId === authReq.user!.userId) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    const target = await queryOne<{ id: string; role: string; email: string }>(
      'SELECT id, role, email FROM users WHERE id = ?', [targetId],
    );
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Cannot delete the last admin
    if (target.role === 'admin') {
      const adminCount = await queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = TRUE',
        ['admin'],
      );
      if ((adminCount?.count || 0) <= 1) {
        res.status(400).json({ error: 'Cannot delete the last admin' });
        return;
      }
    }

    // Cascade delete in transaction
    await transaction(async (conn) => {
      // Delete shares granted by or targeting this user
      await connExecute(conn, 'DELETE FROM shares WHERE granted_by = ? OR (target_type = ? AND target_id = ?)',
        [targetId, 'user', targetId]);
      // Delete resources
      for (const table of ['sources', 'connections', 'favorites', 'dashboards']) {
        await connExecute(conn, `DELETE FROM ${table} WHERE owner_id = ?`, [targetId]);
      }
      // Delete group memberships
      await connExecute(conn, 'DELETE FROM group_members WHERE user_id = ?', [targetId]);
      // Delete sessions
      await connExecute(conn, 'DELETE FROM sessions WHERE user_id = ?', [targetId]);
      // Delete user
      await connExecute(conn, 'DELETE FROM users WHERE id = ?', [targetId]);
    });

    await logAudit(req, 'user_delete', 'user', targetId, { email: target.email });
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/users/:id/sessions
 * List active sessions for a user.
 */
router.get('/users/:id/sessions', async (req, res) => {
  try {
    const sessions = await query<{
      id: string; auth_provider: string; ip_address: string | null;
      user_agent: string | null; created_at: string; expires_at: string; revoked_at: string | null;
    }>(
      `SELECT id, auth_provider, ip_address, user_agent, created_at, expires_at, revoked_at
       FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.params.id],
    );

    res.json(sessions.map(s => ({
      id: s.id,
      authProvider: s.auth_provider,
      ipAddress: s.ip_address,
      userAgent: s.user_agent,
      createdAt: s.created_at,
      expiresAt: s.expires_at,
      revokedAt: s.revoked_at,
      isActive: !s.revoked_at && new Date(s.expires_at) > new Date(),
    })));
  } catch (err) {
    console.error('Admin list sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/users/:id/sessions
 * Revoke all active sessions for a user.
 */
router.delete('/users/:id/sessions', async (req, res) => {
  try {
    const count = await revokeAllUserSessions(req.params.id);
    await logAudit(req, 'sessions_revoke_all', 'user', req.params.id, { count });
    res.json({ ok: true, revoked: count });
  } catch (err) {
    console.error('Admin revoke sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/audit
 * Paginated audit log with optional filters.
 */
router.get('/audit', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const action = req.query.action as string | undefined;
    const userId = req.query.user_id as string | undefined;

    let where = '1=1';
    const params: unknown[] = [];
    if (action) { where += ' AND action = ?'; params.push(action); }
    if (userId) { where += ' AND user_id = ?'; params.push(userId); }

    const countRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM audit_log WHERE ${where}`, params,
    );
    const total = countRow?.total || 0;

    const logs = await query<{
      id: number; user_id: string | null; action: string; target_type: string | null;
      target_id: string | null; details: string | null; ip_address: string | null; created_at: string;
    }>(
      `SELECT id, user_id, action, target_type, target_id, details, ip_address, created_at
       FROM audit_log WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    res.json({
      logs: logs.map(l => ({
        id: l.id,
        userId: l.user_id,
        action: l.action,
        targetType: l.target_type,
        targetId: l.target_id,
        details: l.details ? JSON.parse(l.details) : null,
        ipAddress: l.ip_address,
        createdAt: l.created_at,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Admin audit log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/stats
 * Global statistics.
 */
router.get('/stats', async (req, res) => {
  try {
    const [byRole, byProvider, total, active] = await Promise.all([
      query<{ role: string; count: number }>(
        'SELECT role, COUNT(*) as count FROM users GROUP BY role',
      ),
      query<{ auth_provider: string; count: number }>(
        'SELECT auth_provider, COUNT(*) as count FROM users GROUP BY auth_provider',
      ),
      queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users'),
      queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users WHERE is_active = TRUE'),
    ]);

    res.json({
      totalUsers: total?.count || 0,
      activeUsers: active?.count || 0,
      byRole: Object.fromEntries(byRole.map(r => [r.role, r.count])),
      byProvider: Object.fromEntries(byProvider.map(p => [p.auth_provider, p.count])),
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
