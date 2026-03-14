/**
 * Authentication routes: register, login, logout, me.
 */

import { Router } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { createToken, setAuthCookie, clearAuthCookie, requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();
const SALT_ROUNDS = 10;

/**
 * POST /api/auth/register
 * Create a new user account.
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const db = getDb();

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // First user becomes admin
    const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
    const role = userCount === 0 ? 'admin' : 'editor';

    db.prepare(
      'INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)',
    ).run(id, email, passwordHash, displayName || email.split('@')[0], role);

    const token = createToken({ userId: id, email, role });
    setAuthCookie(res, token);

    res.status(201).json({
      user: { id, email, displayName: displayName || email.split('@')[0], role },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * Authenticate with email and password.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const db = getDb();
    const user = db.prepare(
      'SELECT id, email, password_hash, display_name, role FROM users WHERE email = ?',
    ).get(email) as { id: string; email: string; password_hash: string; display_name: string; role: string } | undefined;

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = createToken({ userId: user.id, email: user.email, role: user.role });
    setAuthCookie(res, token);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/logout
 * Clear the auth cookie.
 */
router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

/**
 * GET /api/auth/me
 * Get the current authenticated user.
 */
router.get('/me', requireAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const db = getDb();
  const user = db.prepare(
    'SELECT id, email, display_name, role, created_at FROM users WHERE id = ?',
  ).get(authReq.user!.userId) as { id: string; email: string; display_name: string; role: string; created_at: string } | undefined;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      createdAt: user.created_at,
    },
  });
});

/**
 * PUT /api/auth/me
 * Update the current user's profile.
 */
router.put('/me', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { displayName, password } = req.body;
    const db = getDb();

    if (displayName) {
      db.prepare('UPDATE users SET display_name = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(displayName, authReq.user!.userId);
    }

    if (password) {
      if (password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters' });
        return;
      }
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(passwordHash, authReq.user!.userId);
    }

    const user = db.prepare(
      'SELECT id, email, display_name, role FROM users WHERE id = ?',
    ).get(authReq.user!.userId) as { id: string; email: string; display_name: string; role: string };

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/users
 * Search users by email or display name (for share dialog autocomplete).
 */
router.get('/users', requireAuth, (req, res) => {
  const q = req.query.q as string;
  if (!q || q.length < 2) {
    res.json([]);
    return;
  }

  const db = getDb();
  const users = db.prepare(
    `SELECT id, email, display_name, role FROM users
     WHERE email LIKE ? OR display_name LIKE ?
     LIMIT 10`,
  ).all(`%${q}%`, `%${q}%`) as { id: string; email: string; display_name: string; role: string }[];

  res.json(users.map(u => ({
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    role: u.role,
  })));
});

export default router;
