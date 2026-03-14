/**
 * Generic CRUD route factory for resources (sources, connections, favorites, dashboards).
 * Each resource follows the same pattern: list (own + shared), get, create, update, delete.
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAccess, getPermissions, canAccess } from '../middleware/rbac.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

type ResourceType = 'source' | 'connection' | 'favorite' | 'dashboard';

interface ResourceConfig {
  type: ResourceType;
  table: string;
  /** Columns that store JSON (will be parsed on read, stringified on write) */
  jsonColumns: string[];
  /** All columns except id, owner_id, created_at, updated_at */
  dataColumns: string[];
}

/**
 * Create a CRUD router for a resource type.
 */
export function createResourceRouter(config: ResourceConfig): Router {
  const router = Router();
  const { type, table, jsonColumns, dataColumns } = config;

  /**
   * GET / - List resources owned by user + shared with user
   */
  router.get('/', requireAuth, (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.userId;
    const db = getDb();

    // Own resources
    const ownResources = db.prepare(`SELECT * FROM ${table} WHERE owner_id = ? ORDER BY updated_at DESC`).all(userId);

    // Resources shared with user (directly, via group, or globally)
    const userGroupIds = (db.prepare('SELECT group_id FROM group_members WHERE user_id = ?').all(userId) as { group_id: string }[])
      .map(g => g.group_id);

    const sharedResourceIds = new Set<string>();

    // Direct user shares
    const userShares = db.prepare(
      `SELECT resource_id FROM shares WHERE resource_type = ? AND target_type = 'user' AND target_id = ?`,
    ).all(type, userId) as { resource_id: string }[];
    userShares.forEach(s => sharedResourceIds.add(s.resource_id));

    // Group shares
    for (const groupId of userGroupIds) {
      const groupShares = db.prepare(
        `SELECT resource_id FROM shares WHERE resource_type = ? AND target_type = 'group' AND target_id = ?`,
      ).all(type, groupId) as { resource_id: string }[];
      groupShares.forEach(s => sharedResourceIds.add(s.resource_id));
    }

    // Global shares
    const globalShares = db.prepare(
      `SELECT resource_id FROM shares WHERE resource_type = ? AND target_type = 'global'`,
    ).all(type) as { resource_id: string }[];
    globalShares.forEach(s => sharedResourceIds.add(s.resource_id));

    // Remove own resources from shared set (already included)
    const ownIds = new Set((ownResources as { id: string }[]).map(r => r.id));
    for (const id of ownIds) sharedResourceIds.delete(id);

    let sharedResources: unknown[] = [];
    if (sharedResourceIds.size > 0) {
      const placeholders = [...sharedResourceIds].map(() => '?').join(',');
      sharedResources = db.prepare(`SELECT * FROM ${table} WHERE id IN (${placeholders}) ORDER BY updated_at DESC`)
        .all(...sharedResourceIds);
    }

    const all = [
      ...ownResources.map(r => ({ ...parseJsonColumns(r as Record<string, unknown>, jsonColumns), _owned: true })),
      ...sharedResources.map(r => ({ ...parseJsonColumns(r as Record<string, unknown>, jsonColumns), _owned: false })),
    ];

    // Add permissions to each resource
    const result = all.map(r => ({
      ...r,
      _permissions: getPermissions(userId, type, (r as Record<string, unknown>).id as string),
    }));

    res.json(result);
  });

  /**
   * GET /:id - Get a single resource
   */
  router.get('/:id', requireAuth, requireAccess(type, 'read'), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const db = getDb();

    const resource = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!resource) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }

    const parsed = parseJsonColumns(resource as Record<string, unknown>, jsonColumns);
    const permissions = getPermissions(authReq.user!.userId, type, req.params.id as string);

    res.json({ ...parsed, _permissions: permissions });
  });

  /**
   * POST / - Create a new resource
   */
  router.post('/', requireAuth, (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const db = getDb();

    const id = req.body.id || uuidv4();
    const values: unknown[] = [id, authReq.user!.userId];

    const columns = ['id', 'owner_id'];
    const placeholders = ['?', '?'];

    for (const col of dataColumns) {
      columns.push(col);
      placeholders.push('?');
      const value = req.body[col] ?? req.body[camelCase(col)];
      values.push(jsonColumns.includes(col) ? JSON.stringify(value ?? null) : (value ?? null));
    }

    db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`).run(...values);

    const created = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    const parsed = parseJsonColumns(created as Record<string, unknown>, jsonColumns);

    res.status(201).json({
      ...parsed,
      _permissions: getPermissions(authReq.user!.userId, type, id),
    });
  });

  /**
   * PUT /:id - Update a resource
   */
  router.put('/:id', requireAuth, requireAccess(type, 'write'), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const db = getDb();

    const sets: string[] = [];
    const values: unknown[] = [];

    for (const col of dataColumns) {
      const value = req.body[col] ?? req.body[camelCase(col)];
      if (value !== undefined) {
        sets.push(`${col} = ?`);
        values.push(jsonColumns.includes(col) ? JSON.stringify(value) : value);
      }
    }

    if (sets.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    sets.push("updated_at = datetime('now')");
    values.push(req.params.id);

    db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    const parsed = parseJsonColumns(updated as Record<string, unknown>, jsonColumns);

    res.json({
      ...parsed,
      _permissions: getPermissions(authReq.user!.userId, type, req.params.id as string),
    });
  });

  /**
   * DELETE /:id - Delete a resource (owner only)
   */
  router.delete('/:id', requireAuth, (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const db = getDb();

    const resource = db.prepare(`SELECT owner_id FROM ${table} WHERE id = ?`).get(req.params.id) as { owner_id: string } | undefined;
    if (!resource) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }

    if (resource.owner_id !== authReq.user!.userId) {
      res.status(403).json({ error: 'Only the owner can delete this resource' });
      return;
    }

    // Delete associated shares
    db.prepare('DELETE FROM shares WHERE resource_type = ? AND resource_id = ?').run(type, req.params.id);
    // Delete the resource
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);

    res.json({ ok: true });
  });

  return router;
}

/**
 * Parse JSON columns in a row from SQLite.
 */
function parseJsonColumns(row: Record<string, unknown>, jsonColumns: string[]): Record<string, unknown> {
  const result = { ...row };
  for (const col of jsonColumns) {
    if (typeof result[col] === 'string') {
      try {
        result[col] = JSON.parse(result[col] as string);
      } catch {
        // leave as string if parse fails
      }
    }
  }
  return result;
}

/**
 * Convert snake_case to camelCase.
 */
function camelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
