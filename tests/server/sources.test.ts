/**
 * Server tests for the sources CRUD routes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, closeTestApp, authCookie } from './test-helpers.js';
import type { Express } from 'express';

let app: Express;

/** Register a user via the API and return { id, email, cookie }. */
async function registerUser(
  email: string,
  password = 'password123',
  displayName?: string,
) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password, displayName });
  const userId = res.body.user.id as string;
  const role = res.body.user.role as string;
  const cookie = authCookie({ userId, email, role });
  return { id: userId, email, role, cookie };
}

/** Helper to create a source for a user. */
async function createSource(
  cookie: string,
  overrides: Record<string, unknown> = {},
) {
  const body = {
    name: 'Test source',
    type: 'csv',
    config_json: { delimiter: ';' },
    data_json: [{ a: 1 }, { a: 2 }],
    record_count: 2,
    ...overrides,
  };
  return request(app)
    .post('/api/sources')
    .set('Cookie', cookie)
    .send(body);
}

describe('Sources CRUD routes', () => {
  beforeEach(() => {
    closeTestApp();
    app = createTestApp();
  });

  // ------------------------------------------------------------------
  // 1. Create
  // ------------------------------------------------------------------
  describe('POST /api/sources', () => {
    it('creates a source and returns it with _permissions (isOwner=true)', async () => {
      const user = await registerUser('alice@test.fr');
      const res = await createSource(user.cookie);

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test source');
      expect(res.body.type).toBe('csv');
      expect(res.body.config_json).toEqual({ delimiter: ';' });
      expect(res.body.data_json).toEqual([{ a: 1 }, { a: 2 }]);
      expect(res.body.record_count).toBe(2);
      expect(res.body.owner_id).toBe(user.id);
      expect(res.body._permissions).toBeDefined();
      expect(res.body._permissions.isOwner).toBe(true);
      expect(res.body._permissions.canEdit).toBe(true);
      expect(res.body._permissions.canDelete).toBe(true);
    });

    it('auto-generates an id if not provided', async () => {
      const user = await registerUser('alice@test.fr');
      const res = await createSource(user.cookie);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('string');
      expect(res.body.id.length).toBeGreaterThan(0);
    });

    it('uses a provided id when given', async () => {
      const user = await registerUser('alice@test.fr');
      const res = await createSource(user.cookie, { id: 'my-custom-id' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('my-custom-id');
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/sources')
        .send({ name: 'No auth', type: 'csv', config_json: {}, data_json: [], record_count: 0 });

      expect(res.status).toBe(401);
    });
  });

  // ------------------------------------------------------------------
  // 2. List
  // ------------------------------------------------------------------
  describe('GET /api/sources', () => {
    it('returns an empty list when user has no sources', async () => {
      const user = await registerUser('alice@test.fr');
      const res = await request(app)
        .get('/api/sources')
        .set('Cookie', user.cookie);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns own sources', async () => {
      const user = await registerUser('alice@test.fr');
      await createSource(user.cookie, { name: 'Source A' });
      await createSource(user.cookie, { name: 'Source B' });

      const res = await request(app)
        .get('/api/sources')
        .set('Cookie', user.cookie);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      const names = res.body.map((s: { name: string }) => s.name);
      expect(names).toContain('Source A');
      expect(names).toContain('Source B');
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app).get('/api/sources');
      expect(res.status).toBe(401);
    });
  });

  // ------------------------------------------------------------------
  // 3. Get by id
  // ------------------------------------------------------------------
  describe('GET /api/sources/:id', () => {
    it('returns a source with _permissions', async () => {
      const user = await registerUser('alice@test.fr');
      const created = await createSource(user.cookie);
      const sourceId = created.body.id;

      const res = await request(app)
        .get(`/api/sources/${sourceId}`)
        .set('Cookie', user.cookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(sourceId);
      expect(res.body.name).toBe('Test source');
      expect(res.body._permissions).toBeDefined();
      expect(res.body._permissions.isOwner).toBe(true);
    });

    it('returns 403 for another user without share', async () => {
      const alice = await registerUser('alice@test.fr');
      const bob = await registerUser('bob@test.fr');
      const created = await createSource(alice.cookie);
      const sourceId = created.body.id;

      const res = await request(app)
        .get(`/api/sources/${sourceId}`)
        .set('Cookie', bob.cookie);

      expect(res.status).toBe(403);
    });

    it('returns 403 for unknown id (no resource found means access denied)', async () => {
      const user = await registerUser('alice@test.fr');

      const res = await request(app)
        .get('/api/sources/nonexistent-id')
        .set('Cookie', user.cookie);

      // requireAccess calls canAccess which returns false when resource not found
      expect(res.status).toBe(403);
    });
  });

  // ------------------------------------------------------------------
  // 4. Update
  // ------------------------------------------------------------------
  describe('PUT /api/sources/:id', () => {
    it('updates fields on own source', async () => {
      const user = await registerUser('alice@test.fr');
      const created = await createSource(user.cookie);
      const sourceId = created.body.id;

      const res = await request(app)
        .put(`/api/sources/${sourceId}`)
        .set('Cookie', user.cookie)
        .send({ name: 'Renamed source', record_count: 42 });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Renamed source');
      expect(res.body.record_count).toBe(42);
      // Unchanged fields persist
      expect(res.body.type).toBe('csv');
    });

    it('returns 403 for non-owner without write share', async () => {
      const alice = await registerUser('alice@test.fr');
      const bob = await registerUser('bob@test.fr');
      const created = await createSource(alice.cookie);
      const sourceId = created.body.id;

      const res = await request(app)
        .put(`/api/sources/${sourceId}`)
        .set('Cookie', bob.cookie)
        .send({ name: 'Hijacked' });

      expect(res.status).toBe(403);
    });

    it('allows update when user has a write share', async () => {
      const alice = await registerUser('alice@test.fr');
      const bob = await registerUser('bob@test.fr');
      const created = await createSource(alice.cookie);
      const sourceId = created.body.id;

      // Alice shares with write permission to Bob
      await request(app)
        .post('/api/shares')
        .set('Cookie', alice.cookie)
        .send({
          resource_type: 'source',
          resource_id: sourceId,
          target_type: 'user',
          target_id: bob.id,
          permission: 'write',
        });

      const res = await request(app)
        .put(`/api/sources/${sourceId}`)
        .set('Cookie', bob.cookie)
        .send({ name: 'Updated by Bob' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated by Bob');
    });
  });

  // ------------------------------------------------------------------
  // 5. Delete
  // ------------------------------------------------------------------
  describe('DELETE /api/sources/:id', () => {
    it('deletes own source', async () => {
      const user = await registerUser('alice@test.fr');
      const created = await createSource(user.cookie);
      const sourceId = created.body.id;

      const res = await request(app)
        .delete(`/api/sources/${sourceId}`)
        .set('Cookie', user.cookie);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Verify it is gone
      const get = await request(app)
        .get(`/api/sources/${sourceId}`)
        .set('Cookie', user.cookie);
      expect(get.status).toBe(403); // canAccess returns false for missing resource
    });

    it('returns 403 for non-owner', async () => {
      const alice = await registerUser('alice@test.fr');
      const bob = await registerUser('bob@test.fr');
      const created = await createSource(alice.cookie);
      const sourceId = created.body.id;

      const res = await request(app)
        .delete(`/api/sources/${sourceId}`)
        .set('Cookie', bob.cookie);

      expect(res.status).toBe(403);
    });

    it('returns 404 for unknown id', async () => {
      const user = await registerUser('alice@test.fr');

      const res = await request(app)
        .delete('/api/sources/nonexistent-id')
        .set('Cookie', user.cookie);

      expect(res.status).toBe(404);
    });

    it('also deletes associated shares', async () => {
      const alice = await registerUser('alice@test.fr');
      const bob = await registerUser('bob@test.fr');
      const created = await createSource(alice.cookie);
      const sourceId = created.body.id;

      // Create a share
      await request(app)
        .post('/api/shares')
        .set('Cookie', alice.cookie)
        .send({
          resource_type: 'source',
          resource_id: sourceId,
          target_type: 'user',
          target_id: bob.id,
          permission: 'read',
        });

      // Delete the source
      await request(app)
        .delete(`/api/sources/${sourceId}`)
        .set('Cookie', alice.cookie);

      // Shares for that source should be gone
      const shares = await request(app)
        .get('/api/shares')
        .set('Cookie', alice.cookie)
        .query({ resource_type: 'source', resource_id: sourceId });

      expect(shares.body).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // 6. Ownership / isolation
  // ------------------------------------------------------------------
  describe('Ownership isolation', () => {
    it('user A cannot see user B sources in the list', async () => {
      const alice = await registerUser('alice@test.fr');
      const bob = await registerUser('bob@test.fr');

      await createSource(alice.cookie, { name: 'Alice only' });
      await createSource(bob.cookie, { name: 'Bob only' });

      const aliceList = await request(app)
        .get('/api/sources')
        .set('Cookie', alice.cookie);

      expect(aliceList.body).toHaveLength(1);
      expect(aliceList.body[0].name).toBe('Alice only');

      const bobList = await request(app)
        .get('/api/sources')
        .set('Cookie', bob.cookie);

      expect(bobList.body).toHaveLength(1);
      expect(bobList.body[0].name).toBe('Bob only');
    });

    it('shared source appears in the list of the target user', async () => {
      const alice = await registerUser('alice@test.fr');
      const bob = await registerUser('bob@test.fr');

      const created = await createSource(alice.cookie, { name: 'Shared source' });
      const sourceId = created.body.id;

      // Share with Bob
      await request(app)
        .post('/api/shares')
        .set('Cookie', alice.cookie)
        .send({
          resource_type: 'source',
          resource_id: sourceId,
          target_type: 'user',
          target_id: bob.id,
          permission: 'read',
        });

      const bobList = await request(app)
        .get('/api/sources')
        .set('Cookie', bob.cookie);

      expect(bobList.body).toHaveLength(1);
      expect(bobList.body[0].name).toBe('Shared source');
      expect(bobList.body[0]._owned).toBe(false);
      expect(bobList.body[0]._permissions.isOwner).toBe(false);
    });

    it('user B can read shared source by id but cannot delete it', async () => {
      const alice = await registerUser('alice@test.fr');
      const bob = await registerUser('bob@test.fr');

      const created = await createSource(alice.cookie, { name: 'Read only' });
      const sourceId = created.body.id;

      // Share read-only with Bob
      await request(app)
        .post('/api/shares')
        .set('Cookie', alice.cookie)
        .send({
          resource_type: 'source',
          resource_id: sourceId,
          target_type: 'user',
          target_id: bob.id,
          permission: 'read',
        });

      // Bob can read
      const get = await request(app)
        .get(`/api/sources/${sourceId}`)
        .set('Cookie', bob.cookie);
      expect(get.status).toBe(200);
      expect(get.body._permissions.isOwner).toBe(false);
      expect(get.body._permissions.canDelete).toBe(false);

      // Bob cannot delete
      const del = await request(app)
        .delete(`/api/sources/${sourceId}`)
        .set('Cookie', bob.cookie);
      expect(del.status).toBe(403);
    });
  });
});
