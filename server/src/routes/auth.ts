/**
 * Authentication routes: register, login, logout, me, email verification.
 */

import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../db/database.js';
import { createToken, setAuthCookie, clearAuthCookie, requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rate-limit.js';
import { isValidEmail, isStrongPassword } from '../utils/validation.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/mailer.js';
import { createSession, revokeSession, revokeAllUserSessions } from '../utils/sessions.js';

const router = Router();
const SALT_ROUNDS = 10;
const VERIFICATION_TOKEN_BYTES = 32;
const VERIFICATION_EXPIRY_HOURS = 24;
const RESEND_MAX = 3; // max resend per hour per email
const RESET_TOKEN_BYTES = 32;
const RESET_EXPIRY_HOURS = 1;

/** Hash a verification token with SHA-256 for safe DB storage. */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * POST /api/auth/register
 * Create a new user account.
 * First user (admin): auto-verified, logged in immediately.
 * Other users: verification email sent, must click link to activate.
 */
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Invalid email address' });
      return;
    }

    const pwCheck = isStrongPassword(password);
    if (!pwCheck.valid) {
      res.status(400).json({ error: pwCheck.reason });
      return;
    }

    // Check if email already exists (active accounts only — allow re-register if previous expired)
    const existing = await queryOne<{ id: string; email_verified: number }>(
      'SELECT id, email_verified FROM users WHERE email = ?',
      [email],
    );
    if (existing) {
      if (existing.email_verified) {
        res.status(409).json({ error: 'Email already registered' });
        return;
      }
      // Unverified account exists — delete it so user can re-register
      await execute('DELETE FROM users WHERE id = ?', [existing.id]);
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const name = displayName || email.split('@')[0];

    // First user becomes admin (with email auto-verified)
    const countRow = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
    const isFirstUser = countRow?.count === 0;
    const role = isFirstUser ? 'admin' : 'editor';

    if (isFirstUser) {
      // Admin: skip email verification, log in immediately
      await execute(
        `INSERT INTO users (id, email, password_hash, display_name, role, email_verified)
         VALUES (?, ?, ?, ?, ?, TRUE)`,
        [id, email, passwordHash, name, role],
      );
      await execute('UPDATE users SET last_login = NOW() WHERE id = ?', [id]);

      const token = createToken({ userId: id, email, role });
      setAuthCookie(res, token);
      await createSession(id, token, 'local', req);

      res.status(201).json({
        user: { id, email, displayName: name, role },
      });
    } else {
      // Regular user: generate verification token, send email
      const verificationToken = crypto.randomBytes(VERIFICATION_TOKEN_BYTES).toString('hex');
      const tokenHash = hashToken(verificationToken);

      await execute(
        `INSERT INTO users (id, email, password_hash, display_name, role, email_verified, verification_token_hash, verification_expires)
         VALUES (?, ?, ?, ?, ?, FALSE, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
        [id, email, passwordHash, name, role, tokenHash, VERIFICATION_EXPIRY_HOURS],
      );

      // Send verification email (best-effort — if SMTP fails, user can resend)
      try {
        await sendVerificationEmail(email, verificationToken);
      } catch (err) {
        console.error('Failed to send verification email:', err);
        // Don't fail registration — user can resend later
      }

      res.status(201).json({
        message: 'Verification email sent',
        email,
      });
    }
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/verify-email?token=xxx
 * Verify the email token, activate the account, log in, redirect to /.
 */
router.get('/verify-email', async (req, res) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      res.redirect('/?error=invalid_token');
      return;
    }

    const tokenHash = hashToken(token);

    const user = await queryOne<{
      id: string; email: string; role: string; verification_expires: string;
    }>(
      `SELECT id, email, role, verification_expires FROM users
       WHERE verification_token_hash = ? AND email_verified = FALSE`,
      [tokenHash],
    );

    if (!user) {
      res.redirect('/?error=invalid_token');
      return;
    }

    // Check expiry
    const expires = new Date(user.verification_expires);
    if (expires < new Date()) {
      res.redirect('/?error=token_expired');
      return;
    }

    // Activate account
    await execute(
      `UPDATE users SET email_verified = TRUE, verification_token_hash = NULL,
       verification_expires = NULL, last_login = NOW() WHERE id = ?`,
      [user.id],
    );

    // Log in
    const jwt = createToken({ userId: user.id, email: user.email, role: user.role });
    setAuthCookie(res, jwt);
    await createSession(user.id, jwt, 'local', req);

    res.redirect('/');
  } catch (err) {
    console.error('Verify email error:', err);
    res.redirect('/?error=server_error');
  }
});

/**
 * POST /api/auth/resend-verification
 * Resend the verification email for an unverified account.
 * Rate limited: max 3 per hour per email.
 * Always returns 200 to avoid leaking account existence.
 */
router.post('/resend-verification', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.json({ message: 'If an account exists, a verification email has been sent' });
      return;
    }

    const user = await queryOne<{ id: string; verification_expires: string }>(
      `SELECT id, verification_expires FROM users
       WHERE email = ? AND email_verified = FALSE AND is_active = TRUE AND auth_provider = 'local'`,
      [email],
    );

    if (!user) {
      // Don't leak whether the account exists
      res.json({ message: 'If an account exists, a verification email has been sent' });
      return;
    }

    // Rate limit: check how many times verification was regenerated in the last hour
    // We use verification_expires as a proxy — if it was recently set, reject
    if (user.verification_expires) {
      const expires = new Date(user.verification_expires);
      const hoursUntilExpiry = (expires.getTime() - Date.now()) / (1000 * 60 * 60);
      // If token was generated less than 20 minutes ago (24h - 20min = 23.67h remaining), throttle
      if (hoursUntilExpiry > (VERIFICATION_EXPIRY_HOURS - 1 / RESEND_MAX)) {
        res.json({ message: 'If an account exists, a verification email has been sent' });
        return;
      }
    }

    // Generate new token
    const verificationToken = crypto.randomBytes(VERIFICATION_TOKEN_BYTES).toString('hex');
    const tokenHash = hashToken(verificationToken);

    await execute(
      `UPDATE users SET verification_token_hash = ?,
       verification_expires = DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE id = ?`,
      [tokenHash, VERIFICATION_EXPIRY_HOURS, user.id],
    );

    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (err) {
      console.error('Failed to resend verification email:', err);
    }

    res.json({ message: 'If an account exists, a verification email has been sent' });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * Authenticate with email and password.
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await queryOne<{
      id: string; email: string; password_hash: string | null;
      display_name: string; role: string; is_active: number; email_verified: number;
    }>(
      'SELECT id, email, password_hash, display_name, role, is_active, email_verified FROM users WHERE email = ? AND auth_provider = ?',
      [email, 'local'],
    );

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({ error: 'Account disabled' });
      return;
    }

    if (!user.email_verified) {
      res.status(403).json({ error: 'email_not_verified', email: user.email });
      return;
    }

    if (!user.password_hash) {
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
    await createSession(user.id, token, 'local', req);
    await execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

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
 * Clear the auth cookie and revoke the session.
 */
router.post('/logout', async (req, res) => {
  const token = req.cookies?.['gw-auth-token'];
  if (token) {
    try {
      await revokeSession(token);
    } catch {
      // Best-effort revocation
    }
  }
  clearAuthCookie(res);
  res.json({ ok: true });
});

/**
 * GET /api/auth/me
 * Get the current authenticated user.
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await queryOne<{
      id: string; email: string; display_name: string; role: string;
      auth_provider: string; is_active: number; email_verified: number; created_at: string;
    }>(
      'SELECT id, email, display_name, role, auth_provider, is_active, email_verified, created_at FROM users WHERE id = ?',
      [authReq.user!.userId],
    );

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
        authProvider: user.auth_provider,
        isActive: !!user.is_active,
        emailVerified: !!user.email_verified,
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/auth/me
 * Update the current user's profile.
 */
router.put('/me', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { displayName, currentPassword, password } = req.body;

    if (displayName) {
      await execute(
        'UPDATE users SET display_name = ?, updated_at = NOW() WHERE id = ?',
        [displayName, authReq.user!.userId],
      );
    }

    if (password) {
      // Require current password for security
      if (!currentPassword) {
        res.status(400).json({ error: 'Le mot de passe actuel est requis' });
        return;
      }

      const dbUser = await queryOne<{ password_hash: string | null }>(
        'SELECT password_hash FROM users WHERE id = ?',
        [authReq.user!.userId],
      );
      if (!dbUser?.password_hash) {
        res.status(400).json({ error: 'Changement de mot de passe non disponible pour ce compte' });
        return;
      }

      const currentValid = await bcrypt.compare(currentPassword, dbUser.password_hash);
      if (!currentValid) {
        res.status(400).json({ error: 'Mot de passe actuel incorrect' });
        return;
      }

      const pwCheck = isStrongPassword(password);
      if (!pwCheck.valid) {
        res.status(400).json({ error: pwCheck.reason });
        return;
      }
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      await execute(
        'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
        [passwordHash, authReq.user!.userId],
      );

      // Revoke all other sessions (keep current one active)
      const currentToken = req.cookies?.['gw-auth-token'];
      await revokeAllUserSessions(authReq.user!.userId);
      // Re-create current session so user stays logged in
      if (currentToken) {
        await createSession(authReq.user!.userId, currentToken, 'local', req);
      }
    }

    const user = await queryOne<{ id: string; email: string; display_name: string; role: string }>(
      'SELECT id, email, display_name, role FROM users WHERE id = ?',
      [authReq.user!.userId],
    );

    res.json({
      user: {
        id: user!.id,
        email: user!.email,
        displayName: user!.display_name,
        role: user!.role,
      },
    });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/forgot-password
 * Request a password reset email.
 * Always returns 200 to avoid leaking account existence.
 */
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const genericMsg = 'Si un compte existe avec cet email, un lien de reinitialisation a ete envoye';

    if (!email) {
      res.json({ message: genericMsg });
      return;
    }

    const user = await queryOne<{ id: string; reset_token_expires: string | null }>(
      `SELECT id, reset_token_expires FROM users
       WHERE email = ? AND is_active = TRUE AND email_verified = TRUE AND auth_provider = 'local'`,
      [email],
    );

    if (!user) {
      res.json({ message: genericMsg });
      return;
    }

    // Throttle: if a reset token was generated less than 5 minutes ago, skip
    if (user.reset_token_expires) {
      const expires = new Date(user.reset_token_expires);
      const minutesUntilExpiry = (expires.getTime() - Date.now()) / (1000 * 60);
      if (minutesUntilExpiry > (RESET_EXPIRY_HOURS * 60 - 5)) {
        res.json({ message: genericMsg });
        return;
      }
    }

    const resetToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const tokenHash = hashToken(resetToken);

    await execute(
      `UPDATE users SET reset_token_hash = ?, reset_token_expires = DATE_ADD(NOW(), INTERVAL ? HOUR)
       WHERE id = ?`,
      [tokenHash, RESET_EXPIRY_HOURS, user.id],
    );

    try {
      await sendPasswordResetEmail(email, resetToken);
    } catch (err) {
      console.error('Failed to send password reset email:', err);
    }

    res.json({ message: genericMsg });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset the password using a valid token.
 */
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      res.status(400).json({ error: 'Token et nouveau mot de passe requis' });
      return;
    }

    const pwCheck = isStrongPassword(password);
    if (!pwCheck.valid) {
      res.status(400).json({ error: pwCheck.reason });
      return;
    }

    const tokenHash = hashToken(token);

    const user = await queryOne<{
      id: string; email: string; role: string; reset_token_expires: string;
    }>(
      `SELECT id, email, role, reset_token_expires FROM users
       WHERE reset_token_hash = ? AND is_active = TRUE`,
      [tokenHash],
    );

    if (!user) {
      res.status(400).json({ error: 'Lien invalide ou expire' });
      return;
    }

    const expires = new Date(user.reset_token_expires);
    if (expires < new Date()) {
      res.status(400).json({ error: 'Lien expire, veuillez refaire une demande' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    await execute(
      `UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_token_expires = NULL,
       updated_at = NOW() WHERE id = ?`,
      [passwordHash, user.id],
    );

    // Revoke all existing sessions
    await revokeAllUserSessions(user.id);

    // Log user in with a fresh session
    const jwt = createToken({ userId: user.id, email: user.email, role: user.role });
    setAuthCookie(res, jwt);
    await createSession(user.id, jwt, 'local', req);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/users
 * Search users by email or display name (for share dialog autocomplete).
 */
router.get('/users', requireAuth, async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q || q.length < 2) {
      res.json([]);
      return;
    }

    const users = await query<{ id: string; email: string; display_name: string; role: string }>(
      `SELECT id, email, display_name, role FROM users
       WHERE is_active = TRUE AND (email LIKE ? OR display_name LIKE ?)
       LIMIT 10`,
      [`%${q}%`, `%${q}%`],
    );

    res.json(users.map(u => ({
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      role: u.role,
    })));
  } catch (err) {
    console.error('Search users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
