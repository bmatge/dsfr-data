/**
 * Audit log helper — records sensitive actions for traceability.
 */

import { execute } from '../db/database.js';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export async function logAudit(
  req: Request,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user?.userId || null;
  const ip = req.ip || req.socket?.remoteAddress || null;
  try {
    await execute(
      `INSERT INTO audit_log (user_id, action, target_type, target_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, action, targetType || null, targetId || null, details ? JSON.stringify(details) : null, ip],
    );
  } catch (err) {
    // Best-effort logging — don't break the request
    console.error('[audit] Failed to log:', action, err);
  }
}
