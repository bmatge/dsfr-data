/**
 * Connections CRUD routes.
 * Wraps the generic resource-crud with encryption for api_key_encrypted.
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAccess, getPermissions } from '../middleware/rbac.js';
import { encrypt, decrypt, isEncryptionConfigured } from '../utils/crypto.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

const TYPE = 'connection' as const;
const TABLE = 'connections';
const JSON_COLUMNS = ['config_json'];
const DATA_COLUMNS = ['name', 'type', 'config_json', 'api_key_encrypted', 'status'];

/**
 * Encrypt an API key if encryption is configured, otherwise store as-is.
 */
function encryptApiKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return isEncryptionConfigured() ? encrypt(value) : value;
}

/**
 * Decrypt an API key if it looks encrypted (contains ':' separators).
 */
function decryptApiKey(value: string | null | undefined): string | null {
  if (!value) return null;
  // Encrypted format: base64:base64:base64
  if (isEncryptionConfigured() && value.includes(':')) {
    try {
      return decrypt(value);
    } catch {
      // If decryption fails, return as-is (might be a legacy unencrypted value)
      return value;
    }
  }
  return value;
}

/**
 * Mask an API key: show only the last 4 characters.
 */
function maskApiKey(key: string): string {
  if (key.length <= 4) return '****';
  return '*'.repeat(key.length - 4) + key.slice(-4);
}

function parseJsonColumns(
  row: Record<string, unknown>,
  options?: { maskKey?: boolean }
): Record<string, unknown> {
  const result = { ...row };
  for (const col of JSON_COLUMNS) {
    if (typeof result[col] === 'string') {
      try {
        result[col] = JSON.parse(result[col] as string);
      } catch {
        // leave as string
      }
    }
  }
  // Decrypt api_key_encrypted for the response
  if (result.api_key_encrypted) {
    const decrypted = decryptApiKey(result.api_key_encrypted as string);
    result.api_key_encrypted = options?.maskKey && decrypted ? maskApiKey(decrypted) : decrypted;
  }
  return result;
}

function camelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * GET / - List connections owned by user + shared with user
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.userId;

    const ownResources = await query(
      `SELECT * FROM ${TABLE} WHERE owner_id = ? ORDER BY updated_at DESC`,
      [userId]
    );

    const userGroupIds = (
      await query<{ group_id: string }>('SELECT group_id FROM group_members WHERE user_id = ?', [
        userId,
      ])
    ).map((g) => g.group_id);

    const sharedResourceIds = new Set<string>();

    const userShares = await query<{ resource_id: string }>(
      `SELECT resource_id FROM shares WHERE resource_type = ? AND target_type = 'user' AND target_id = ?`,
      [TYPE, userId]
    );
    userShares.forEach((s) => sharedResourceIds.add(s.resource_id));

    for (const groupId of userGroupIds) {
      const groupShares = await query<{ resource_id: string }>(
        `SELECT resource_id FROM shares WHERE resource_type = ? AND target_type = 'group' AND target_id = ?`,
        [TYPE, groupId]
      );
      groupShares.forEach((s) => sharedResourceIds.add(s.resource_id));
    }

    const globalShares = await query<{ resource_id: string }>(
      `SELECT resource_id FROM shares WHERE resource_type = ? AND target_type = 'global'`,
      [TYPE]
    );
    globalShares.forEach((s) => sharedResourceIds.add(s.resource_id));

    const ownIds = new Set((ownResources as { id: string }[]).map((r) => r.id));
    for (const id of ownIds) sharedResourceIds.delete(id);

    let sharedResources: Record<string, unknown>[] = [];
    if (sharedResourceIds.size > 0) {
      const placeholders = [...sharedResourceIds].map(() => '?').join(',');
      sharedResources = await query(
        `SELECT * FROM ${TABLE} WHERE id IN (${placeholders}) ORDER BY updated_at DESC`,
        [...sharedResourceIds]
      );
    }

    const all = [
      ...ownResources.map((r) => ({
        ...parseJsonColumns(r as Record<string, unknown>, { maskKey: true }),
        _owned: true,
      })),
      ...sharedResources.map((r) => ({
        ...parseJsonColumns(r, { maskKey: true }),
        _owned: false,
      })),
    ];

    const result = await Promise.all(
      all.map(async (r) => ({
        ...r,
        _permissions: await getPermissions(
          userId,
          TYPE,
          (r as Record<string, unknown>).id as string
        ),
      }))
    );

    res.json(result);
  } catch (err) {
    console.error('List connections error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /:id - Get a single connection
 */
router.get('/:id', requireAuth, requireAccess(TYPE, 'read'), async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;

    const resource = await queryOne(`SELECT * FROM ${TABLE} WHERE id = ?`, [req.params.id]);
    if (!resource) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }

    const parsed = parseJsonColumns(resource as Record<string, unknown>);
    const permissions = await getPermissions(authReq.user!.userId, TYPE, req.params.id as string);

    res.json({ ...parsed, _permissions: permissions });
  } catch (err) {
    console.error('Get connection error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST / - Create a new connection
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;

    const id = req.body.id || uuidv4();
    const values: unknown[] = [id, authReq.user!.userId];

    const columns = ['id', 'owner_id'];
    const placeholders = ['?', '?'];

    for (const col of DATA_COLUMNS) {
      columns.push(col);
      placeholders.push('?');
      const value = req.body[col] ?? req.body[camelCase(col)];
      if (col === 'api_key_encrypted') {
        values.push(encryptApiKey(value as string | null));
      } else if (JSON_COLUMNS.includes(col)) {
        values.push(JSON.stringify(value ?? null));
      } else {
        values.push(value ?? null);
      }
    }

    await execute(
      `INSERT INTO ${TABLE} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
      values
    );

    const created = await queryOne(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
    const parsed = parseJsonColumns(created as Record<string, unknown>);

    res.status(201).json({
      ...parsed,
      _permissions: await getPermissions(authReq.user!.userId, TYPE, id),
    });
  } catch (err) {
    console.error('Create connection error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /:id - Update a connection
 */
router.put('/:id', requireAuth, requireAccess(TYPE, 'write'), async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;

    const sets: string[] = [];
    const values: unknown[] = [];

    for (const col of DATA_COLUMNS) {
      const value = req.body[col] ?? req.body[camelCase(col)];
      if (value !== undefined) {
        sets.push(`${col} = ?`);
        if (col === 'api_key_encrypted') {
          values.push(encryptApiKey(value as string | null));
        } else if (JSON_COLUMNS.includes(col)) {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
      }
    }

    if (sets.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    sets.push('updated_at = NOW()');
    values.push(req.params.id);

    await execute(`UPDATE ${TABLE} SET ${sets.join(', ')} WHERE id = ?`, values);

    const updated = await queryOne(`SELECT * FROM ${TABLE} WHERE id = ?`, [req.params.id]);
    const parsed = parseJsonColumns(updated as Record<string, unknown>);

    res.json({
      ...parsed,
      _permissions: await getPermissions(authReq.user!.userId, TYPE, req.params.id as string),
    });
  } catch (err) {
    console.error('Update connection error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /:id - Delete a connection (owner only)
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;

    const resource = await queryOne<{ owner_id: string }>(
      `SELECT owner_id FROM ${TABLE} WHERE id = ?`,
      [req.params.id]
    );
    if (!resource) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }

    if (resource.owner_id !== authReq.user!.userId) {
      res.status(403).json({ error: 'Only the owner can delete this resource' });
      return;
    }

    await execute('DELETE FROM shares WHERE resource_type = ? AND resource_id = ?', [
      TYPE,
      req.params.id,
    ]);
    await execute(`DELETE FROM ${TABLE} WHERE id = ?`, [req.params.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete connection error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
