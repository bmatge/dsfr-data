/**
 * Session management: create, verify, and revoke JWT sessions.
 * Sessions are stored in DB with a SHA-256 hash of the JWT token.
 */

import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, execute } from '../db/database.js';
import type { Request } from 'express';

/** Hash a JWT token with SHA-256 for DB storage. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create a session record in the database.
 * Called after successful login/register/verify-email.
 */
export async function createSession(
  userId: string,
  token: string,
  authProvider: 'local' | 'proconnect',
  req: Request
): Promise<string> {
  const id = uuidv4();
  const tokenHash = hashToken(token);
  const ip = req.ip || req.socket?.remoteAddress || null;
  const userAgent = req.headers['user-agent']?.substring(0, 500) || null;
  // 7 days expiry (matching JWT)
  await execute(
    `INSERT INTO sessions (id, user_id, token_hash, auth_provider, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
    [id, userId, tokenHash, authProvider, ip, userAgent]
  );
  return id;
}

/**
 * Check if a session is valid (exists and not revoked).
 */
export async function isSessionValid(token: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const session = await queryOne<{ revoked_at: string | null; expires_at: string }>(
    'SELECT revoked_at, expires_at FROM sessions WHERE token_hash = ?',
    [tokenHash]
  );
  if (!session) return true; // No session record = legacy token (pre-sessions), allow
  if (session.revoked_at) return false;
  if (new Date(session.expires_at) < new Date()) return false;
  return true;
}

/**
 * Revoke a session by token.
 */
export async function revokeSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await execute(
    'UPDATE sessions SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL',
    [tokenHash]
  );
}

/**
 * Revoke all active sessions for a user.
 */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const result = await execute(
    'UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
    [userId]
  );
  return result.affectedRows;
}
