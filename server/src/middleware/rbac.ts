/**
 * RBAC middleware for resource access control.
 * Checks ownership, direct shares, group shares, and global shares.
 */

import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import { getDb } from '../db/database.js';

type ResourceType = 'source' | 'connection' | 'favorite' | 'dashboard';
type Permission = 'read' | 'write';

/**
 * Map resource type to its database table name.
 */
const RESOURCE_TABLES: Record<ResourceType, string> = {
  source: 'sources',
  connection: 'connections',
  favorite: 'favorites',
  dashboard: 'dashboards',
};

/**
 * Middleware that requires a specific role (admin, editor, viewer).
 * Role hierarchy: admin > editor > viewer.
 */
export function requireRole(minRole: string) {
  const hierarchy: Record<string, number> = { viewer: 0, editor: 1, admin: 2 };

  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userLevel = hierarchy[authReq.user.role] ?? 0;
    const requiredLevel = hierarchy[minRole] ?? 0;

    if (userLevel < requiredLevel) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Check if a user can access a resource with a given permission.
 * Checks: ownership → direct user share → group share → global share.
 */
export function canAccess(
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
  permission: Permission,
): boolean {
  const db = getDb();
  const table = RESOURCE_TABLES[resourceType];

  // 1. Check ownership
  const resource = db.prepare(`SELECT owner_id FROM ${table} WHERE id = ?`).get(resourceId) as { owner_id: string } | undefined;
  if (!resource) return false;
  if (resource.owner_id === userId) return true;

  // 2. Check direct user share
  const userShare = db.prepare(
    `SELECT permission FROM shares
     WHERE resource_type = ? AND resource_id = ? AND target_type = 'user' AND target_id = ?`,
  ).get(resourceType, resourceId, userId) as { permission: string } | undefined;

  if (userShare) {
    if (permission === 'read') return true;
    if (userShare.permission === 'write') return true;
  }

  // 3. Check group shares
  const userGroups = db.prepare(
    'SELECT group_id FROM group_members WHERE user_id = ?',
  ).all(userId) as { group_id: string }[];

  for (const { group_id } of userGroups) {
    const groupShare = db.prepare(
      `SELECT permission FROM shares
       WHERE resource_type = ? AND resource_id = ? AND target_type = 'group' AND target_id = ?`,
    ).get(resourceType, resourceId, group_id) as { permission: string } | undefined;

    if (groupShare) {
      if (permission === 'read') return true;
      if (groupShare.permission === 'write') return true;
    }
  }

  // 4. Check global share
  const globalShare = db.prepare(
    `SELECT permission FROM shares
     WHERE resource_type = ? AND resource_id = ? AND target_type = 'global'`,
  ).get(resourceType, resourceId) as { permission: string } | undefined;

  if (globalShare) {
    if (permission === 'read') return true;
    if (globalShare.permission === 'write') return true;
  }

  return false;
}

/**
 * Middleware factory that checks resource access.
 * Expects :id parameter in the route.
 */
export function requireAccess(resourceType: ResourceType, permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const resourceId = req.params.id;
    if (!resourceId) {
      res.status(400).json({ error: 'Resource ID required' });
      return;
    }

    if (!canAccess(authReq.user!.userId, resourceType, resourceId as string, permission)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    next();
  };
}

/**
 * Get permissions info for a resource (used in API responses).
 */
export function getPermissions(userId: string, resourceType: ResourceType, resourceId: string) {
  const db = getDb();
  const table = RESOURCE_TABLES[resourceType];

  const resource = db.prepare(`SELECT owner_id FROM ${table} WHERE id = ?`).get(resourceId) as { owner_id: string } | undefined;
  if (!resource) return null;

  const isOwner = resource.owner_id === userId;

  const shares = db.prepare(
    `SELECT s.id, s.target_type, s.target_id, s.permission,
            CASE
              WHEN s.target_type = 'user' THEN u.display_name
              WHEN s.target_type = 'group' THEN g.name
              ELSE 'Tout le monde'
            END as target_name
     FROM shares s
     LEFT JOIN users u ON s.target_type = 'user' AND s.target_id = u.id
     LEFT JOIN groups g ON s.target_type = 'group' AND s.target_id = g.id
     WHERE s.resource_type = ? AND s.resource_id = ?`,
  ).all(resourceType, resourceId);

  return {
    isOwner,
    canEdit: isOwner || canAccess(userId, resourceType, resourceId, 'write'),
    canDelete: isOwner,
    sharedWith: shares,
  };
}
