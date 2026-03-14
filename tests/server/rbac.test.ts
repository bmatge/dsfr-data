/**
 * Server tests for RBAC (sharing permissions).
 * Tests user-to-user sharing, group sharing, and global sharing flows.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, closeTestApp } from './test-helpers.js';
import type { Express } from 'express';

let app: Express;

/** Register a user and return { userId, cookies } */
async function registerUser(
  app: Express,
  email: string,
  password = 'password123',
  displayName?: string,
): Promise<{ userId: string; cookies: string[] }> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password, displayName });
  expect(res.status).toBe(201);
  const cookies = res.headers['set-cookie'] as unknown as string[];
  return { userId: res.body.user.id, cookies };
}

/** Create a source owned by the authenticated user, return source id */
async function createSource(
  app: Express,
  cookies: string[],
  name = 'Test Source',
): Promise<string> {
  const res = await request(app)
    .post('/api/sources')
    .set('Cookie', cookies)
    .send({ name, type: 'csv', config_json: {}, data_json: [] });
  expect(res.status).toBe(201);
  return res.body.id;
}

beforeEach(() => {
  closeTestApp();
  app = createTestApp();
});

// --------------------------------------------------------------------------
// User-to-user sharing
// --------------------------------------------------------------------------

describe('User-to-user sharing', () => {
  it('complete sharing lifecycle: create, read, upgrade, revoke', async () => {
    // 1. User A registers and creates a source
    const userA = await registerUser(app, 'alice@example.com');
    const sourceId = await createSource(app, userA.cookies, 'Alice Source');

    // 2. User B registers
    const userB = await registerUser(app, 'bob@example.com');

    // 3. User B cannot GET User A's source (403)
    const forbidden = await request(app)
      .get(`/api/sources/${sourceId}`)
      .set('Cookie', userB.cookies);
    expect(forbidden.status).toBe(403);

    // 4. User A shares the source with User B (read)
    const shareRes = await request(app)
      .post('/api/shares')
      .set('Cookie', userA.cookies)
      .send({
        resource_type: 'source',
        resource_id: sourceId,
        target_type: 'user',
        target_id: userB.userId,
        permission: 'read',
      });
    expect(shareRes.status).toBe(201);
    const readShareId = shareRes.body.id;
    expect(readShareId).toBeDefined();

    // 5. User B can now GET User A's source
    const canRead = await request(app)
      .get(`/api/sources/${sourceId}`)
      .set('Cookie', userB.cookies);
    expect(canRead.status).toBe(200);
    expect(canRead.body.name).toBe('Alice Source');

    // 6. User B cannot PUT (update) User A's source (403 -- only read permission)
    const cannotWrite = await request(app)
      .put(`/api/sources/${sourceId}`)
      .set('Cookie', userB.cookies)
      .send({ name: 'Hacked Name' });
    expect(cannotWrite.status).toBe(403);

    // 7. User A updates share to write: delete old share, create new with write
    const deleteOld = await request(app)
      .delete(`/api/shares/${readShareId}`)
      .set('Cookie', userA.cookies);
    expect(deleteOld.status).toBe(200);

    const writeShareRes = await request(app)
      .post('/api/shares')
      .set('Cookie', userA.cookies)
      .send({
        resource_type: 'source',
        resource_id: sourceId,
        target_type: 'user',
        target_id: userB.userId,
        permission: 'write',
      });
    expect(writeShareRes.status).toBe(201);
    const writeShareId = writeShareRes.body.id;

    // 8. User B can now PUT User A's source
    const canWrite = await request(app)
      .put(`/api/sources/${sourceId}`)
      .set('Cookie', userB.cookies)
      .send({ name: 'Updated by Bob' });
    expect(canWrite.status).toBe(200);
    expect(canWrite.body.name).toBe('Updated by Bob');

    // 9. User A deletes the share
    const revokeRes = await request(app)
      .delete(`/api/shares/${writeShareId}`)
      .set('Cookie', userA.cookies);
    expect(revokeRes.status).toBe(200);

    // 10. User B can no longer access
    const noAccess = await request(app)
      .get(`/api/sources/${sourceId}`)
      .set('Cookie', userB.cookies);
    expect(noAccess.status).toBe(403);
  });
});

// --------------------------------------------------------------------------
// Group sharing
// --------------------------------------------------------------------------

describe('Group sharing', () => {
  it('sharing via group grants access to group members', async () => {
    // Setup: User A and User B
    const userA = await registerUser(app, 'alice@example.com');
    const userB = await registerUser(app, 'bob@example.com');
    const sourceId = await createSource(app, userA.cookies, 'Shared via Group');

    // 1. User A creates a group
    const groupRes = await request(app)
      .post('/api/groups')
      .set('Cookie', userA.cookies)
      .send({ name: 'Team' });
    expect(groupRes.status).toBe(201);
    const groupId = groupRes.body.id;

    // 2. User A adds User B to the group
    const addMemberRes = await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set('Cookie', userA.cookies)
      .send({ userId: userB.userId });
    expect(addMemberRes.status).toBe(201);

    // Verify User B cannot access the source before sharing
    const beforeShare = await request(app)
      .get(`/api/sources/${sourceId}`)
      .set('Cookie', userB.cookies);
    expect(beforeShare.status).toBe(403);

    // 3. User A shares the source with the group
    const shareRes = await request(app)
      .post('/api/shares')
      .set('Cookie', userA.cookies)
      .send({
        resource_type: 'source',
        resource_id: sourceId,
        target_type: 'group',
        target_id: groupId,
        permission: 'read',
      });
    expect(shareRes.status).toBe(201);

    // 4. User B can now see the source in their list
    const listRes = await request(app)
      .get('/api/sources')
      .set('Cookie', userB.cookies);
    expect(listRes.status).toBe(200);
    const sharedSource = listRes.body.find((s: Record<string, unknown>) => s.id === sourceId);
    expect(sharedSource).toBeDefined();
    expect(sharedSource.name).toBe('Shared via Group');
    expect(sharedSource._owned).toBe(false);

    // User B can also GET the source directly
    const getRes = await request(app)
      .get(`/api/sources/${sourceId}`)
      .set('Cookie', userB.cookies);
    expect(getRes.status).toBe(200);
  });
});

// --------------------------------------------------------------------------
// Global sharing
// --------------------------------------------------------------------------

describe('Global sharing', () => {
  it('global read share allows any user to read but not write', async () => {
    // Setup: User A creates a source
    const userA = await registerUser(app, 'alice@example.com');
    const sourceId = await createSource(app, userA.cookies, 'Public Source');

    // User B registers
    const userB = await registerUser(app, 'bob@example.com');

    // Verify User B cannot access before global share
    const beforeShare = await request(app)
      .get(`/api/sources/${sourceId}`)
      .set('Cookie', userB.cookies);
    expect(beforeShare.status).toBe(403);

    // 1. User A shares the source globally with read permission
    const shareRes = await request(app)
      .post('/api/shares')
      .set('Cookie', userA.cookies)
      .send({
        resource_type: 'source',
        resource_id: sourceId,
        target_type: 'global',
        permission: 'read',
      });
    expect(shareRes.status).toBe(201);

    // 2. User B can see and read the source
    const readRes = await request(app)
      .get(`/api/sources/${sourceId}`)
      .set('Cookie', userB.cookies);
    expect(readRes.status).toBe(200);
    expect(readRes.body.name).toBe('Public Source');

    // User B can see it in the list
    const listRes = await request(app)
      .get('/api/sources')
      .set('Cookie', userB.cookies);
    expect(listRes.status).toBe(200);
    const publicSource = listRes.body.find((s: Record<string, unknown>) => s.id === sourceId);
    expect(publicSource).toBeDefined();

    // 3. User B cannot write to it
    const writeRes = await request(app)
      .put(`/api/sources/${sourceId}`)
      .set('Cookie', userB.cookies)
      .send({ name: 'Hacked Name' });
    expect(writeRes.status).toBe(403);
  });
});
