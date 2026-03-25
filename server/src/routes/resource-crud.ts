/**
 * Generic CRUD route factory for resources (sources, connections, favorites, dashboards).
 * Each resource follows the same pattern: list (own + shared), get, create, update, delete.
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../db/database.js';
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
  router.get('/', requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user!.userId;

      // Own resources
      const ownResources = await query(`SELECT * FROM ${table} WHERE owner_id = ? ORDER BY updated_at DESC`, [userId]);

      // Resources shared with user (directly, via group, or globally)
      const userGroupIds = (await query<{ group_id: string }>('SELECT group_id FROM group_members WHERE user_id = ?', [userId]))
        .map(g => g.group_id);

      const sharedResourceIds = new Set<string>();

      // Direct user shares
      const userShares = await query<{ resource_id: string }>(
        `SELECT resource_id FROM shares WHERE resource_type = ? AND target_type = 'user' AND target_id = ?`,
        [type, userId],
      );
      userShares.forEach(s => sharedResourceIds.add(s.resource_id));

      // Group shares
      for (const groupId of userGroupIds) {
        const groupShares = await query<{ resource_id: string }>(
          `SELECT resource_id FROM shares WHERE resource_type = ? AND target_type = 'group' AND target_id = ?`,
          [type, groupId],
        );
        groupShares.forEach(s => sharedResourceIds.add(s.resource_id));
      }

      // Global shares
      const globalShares = await query<{ resource_id: string }>(
        `SELECT resource_id FROM shares WHERE resource_type = ? AND target_type = 'global'`,
        [type],
      );
      globalShares.forEach(s => sharedResourceIds.add(s.resource_id));

      // Remove own resources from shared set (already included)
      const ownIds = new Set((ownResources as { id: string }[]).map(r => r.id));
      for (const id of ownIds) sharedResourceIds.delete(id);

      let sharedResources: Record<string, unknown>[] = [];
      if (sharedResourceIds.size > 0) {
        const placeholders = [...sharedResourceIds].map(() => '?').join(',');
        sharedResources = await query(`SELECT * FROM ${table} WHERE id IN (${placeholders}) ORDER BY updated_at DESC`,
          [...sharedResourceIds]);
      }

      const all = [
        ...ownResources.map(r => ({ ...parseJsonColumns(r as Record<string, unknown>, jsonColumns), _owned: true })),
        ...sharedResources.map(r => ({ ...parseJsonColumns(r, jsonColumns), _owned: false })),
      ];

      // Add permissions to each resource
      const result = await Promise.all(all.map(async r => ({
        ...r,
        _permissions: await getPermissions(userId, type, (r as Record<string, unknown>).id as string),
      })));

      res.json(result);
    } catch (err) {
      console.error(`List ${type}s error:`, err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /:id - Get a single resource
   */
  router.get('/:id', requireAuth, requireAccess(type, 'read'), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;

      const resource = await queryOne(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      if (!resource) {
        res.status(404).json({ error: 'Resource not found' });
        return;
      }

      const parsed = parseJsonColumns(resource as Record<string, unknown>, jsonColumns);
      const permissions = await getPermissions(authReq.user!.userId, type, req.params.id as string);

      res.json({ ...parsed, _permissions: permissions });
    } catch (err) {
      console.error(`Get ${type} error:`, err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST / - Create a new resource
   */
  router.post('/', requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;

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

      await execute(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`, values);

      const created = await queryOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
      const parsed = parseJsonColumns(created as Record<string, unknown>, jsonColumns);

      res.status(201).json({
        ...parsed,
        _permissions: await getPermissions(authReq.user!.userId, type, id),
      });
    } catch (err) {
      console.error(`Create ${type} error:`, err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * PUT /:id - Update a resource
   */
  router.put('/:id', requireAuth, requireAccess(type, 'write'), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;

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

      sets.push('updated_at = NOW()');
      values.push(req.params.id);

      await execute(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`, values);

      const updated = await queryOne(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      const parsed = parseJsonColumns(updated as Record<string, unknown>, jsonColumns);

      res.json({
        ...parsed,
        _permissions: await getPermissions(authReq.user!.userId, type, req.params.id as string),
      });
    } catch (err) {
      console.error(`Update ${type} error:`, err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * DELETE /:id - Delete a resource (owner only)
   */
  router.delete('/:id', requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;

      const resource = await queryOne<{ owner_id: string }>(`SELECT owner_id FROM ${table} WHERE id = ?`, [req.params.id]);
      if (!resource) {
        res.status(404).json({ error: 'Resource not found' });
        return;
      }

      if (resource.owner_id !== authReq.user!.userId) {
        res.status(403).json({ error: 'Only the owner can delete this resource' });
        return;
      }

      // Delete associated shares
      await execute('DELETE FROM shares WHERE resource_type = ? AND resource_id = ?', [type, req.params.id]);
      // Delete the resource
      await execute(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);

      res.json({ ok: true });
    } catch (err) {
      console.error(`Delete ${type} error:`, err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

/**
 * Parse JSON columns in a row.
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
