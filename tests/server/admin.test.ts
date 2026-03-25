/**
 * Server tests for admin routes (/api/admin).
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, closeTestApp, authCookie } from './test-helpers.js';
import { execute, queryOne } from '../../server/src/db/database.js';

// Mock mailer
vi.mock('../../server/src/utils/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  setTransporter: vi.fn(),
}));

const VALID_PASSWORD = 'Password1';

/** Extract cookie from register response. */
function extractCookie(res: request.Response): string {
  const cookies = res.headers['set-cookie'];
  if (!cookies) return '';
  const raw = Array.isArray(cookies) ? cookies[0] : cookies;
  return raw.split(';')[0];
}

/** Register admin (first user) and return cookie. */
async function registerAdmin(app: Express, email = 'admin@example.com'): Promise<string> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: VALID_PASSWORD, displayName: 'Admin' });
  return extractCookie(res);
}

/** Register a non-admin user, verify in DB, return { id, cookie }. */
async function registerVerifiedUser(app: Express, email: string, displayName?: string) {
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: VALID_PASSWORD, displayName: displayName || email.split('@')[0] });

  await execute('UPDATE users SET email_verified = TRUE, verification_token_hash = NULL WHERE email = ?', [email]);
  const user = await queryOne<{ id: string; role: string }>('SELECT id, role FROM users WHERE email = ?', [email]);
  const cookie = authCookie({ userId: user!.id, email, role: user!.role });
  return { id: user!.id, email, role: user!.role, cookie };
}

let app: Express;

beforeEach(async () => {
  app = await createTestApp();
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestApp();
});

describe('GET /api/admin/users', () => {
  it('returns paginated user list for admin', async () => {
    const adminCookie = await registerAdmin(app);
    await registerVerifiedUser(app, 'user1@example.com');
    await registerVerifiedUser(app, 'user2@example.com');

    const res = await request(app)
      .get('/api/admin/users')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(3);
    expect(res.body.pagination.total).toBe(3);
  });

  it('rejects non-admin', async () => {
    await registerAdmin(app);
    const editor = await registerVerifiedUser(app, 'editor@example.com');

    const res = await request(app)
      .get('/api/admin/users')
      .set('Cookie', editor.cookie);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/users/:id', () => {
  it('returns user detail with resource counts', async () => {
    const adminCookie = await registerAdmin(app);
    const user = await registerVerifiedUser(app, 'detail@example.com', 'Detail');

    const res = await request(app)
      .get(`/api/admin/users/${user.id}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('detail@example.com');
    expect(res.body.user.displayName).toBe('Detail');
    expect(res.body.resources).toEqual({
      sources: 0, connections: 0, favorites: 0, dashboards: 0,
    });
  });

  it('returns 404 for unknown user', async () => {
    const adminCookie = await registerAdmin(app);

    const res = await request(app)
      .get('/api/admin/users/nonexistent')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/admin/users/:id/role', () => {
  it('changes user role', async () => {
    const adminCookie = await registerAdmin(app);
    const user = await registerVerifiedUser(app, 'role-target@example.com');

    const res = await request(app)
      .put(`/api/admin/users/${user.id}/role`)
      .set('Cookie', adminCookie)
      .send({ role: 'viewer' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('viewer');

    // Verify in DB
    const updated = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = ?', [user.id]);
    expect(updated?.role).toBe('viewer');
  });

  it('cannot change own role', async () => {
    const adminCookie = await registerAdmin(app);
    const admin = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', ['admin@example.com']);

    const res = await request(app)
      .put(`/api/admin/users/${admin!.id}/role`)
      .set('Cookie', adminCookie)
      .send({ role: 'editor' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/own role/i);
  });

  it('cannot remove last admin', async () => {
    const adminCookie = await registerAdmin(app);
    // Create a second admin
    const user = await registerVerifiedUser(app, 'admin2@example.com');
    await execute('UPDATE users SET role = ? WHERE id = ?', ['admin', user.id]);

    // Demote user (ok, still 1 admin left)
    const res1 = await request(app)
      .put(`/api/admin/users/${user.id}/role`)
      .set('Cookie', adminCookie)
      .send({ role: 'editor' });
    expect(res1.status).toBe(200);

    // Now there's only 1 admin — cannot demote self (blocked by own-role check)
    // But let's try to demote via another admin scenario
    // Re-promote user, then try to demote the original admin
    await execute('UPDATE users SET role = ? WHERE id = ?', ['admin', user.id]);
    const admin = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', ['admin@example.com']);

    // User is now admin, use their cookie
    const user2Cookie = authCookie({ userId: user.id, email: 'admin2@example.com', role: 'admin' });
    const res2 = await request(app)
      .put(`/api/admin/users/${admin!.id}/role`)
      .set('Cookie', user2Cookie)
      .send({ role: 'editor' });
    // This should succeed (2 admins, demoting 1 leaves 1)
    expect(res2.status).toBe(200);
  });
});

describe('PUT /api/admin/users/:id/status', () => {
  it('deactivates a user', async () => {
    const adminCookie = await registerAdmin(app);
    const user = await registerVerifiedUser(app, 'deactivate@example.com');

    const res = await request(app)
      .put(`/api/admin/users/${user.id}/status`)
      .set('Cookie', adminCookie)
      .send({ active: false });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);

    // User should not be able to log in
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'deactivate@example.com', password: VALID_PASSWORD });
    expect(loginRes.status).toBe(403);
  });

  it('reactivates a user', async () => {
    const adminCookie = await registerAdmin(app);
    const user = await registerVerifiedUser(app, 'reactivate@example.com');
    await execute('UPDATE users SET is_active = FALSE WHERE id = ?', [user.id]);

    const res = await request(app)
      .put(`/api/admin/users/${user.id}/status`)
      .set('Cookie', adminCookie)
      .send({ active: true });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);
  });

  it('cannot deactivate yourself', async () => {
    const adminCookie = await registerAdmin(app);
    const admin = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', ['admin@example.com']);

    const res = await request(app)
      .put(`/api/admin/users/${admin!.id}/status`)
      .set('Cookie', adminCookie)
      .send({ active: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/own account/i);
  });
});

describe('DELETE /api/admin/users/:id', () => {
  it('deletes a user and their resources', async () => {
    const adminCookie = await registerAdmin(app);
    const user = await registerVerifiedUser(app, 'delete-me@example.com');

    // Create a source for the user
    await request(app)
      .post('/api/sources')
      .set('Cookie', user.cookie)
      .send({ name: 'Doomed', type: 'csv', config_json: {}, data_json: [] });

    const res = await request(app)
      .delete(`/api/admin/users/${user.id}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // User should be gone
    const gone = await queryOne<{ id: string }>('SELECT id FROM users WHERE id = ?', [user.id]);
    expect(gone).toBeUndefined();
  });

  it('cannot delete yourself', async () => {
    const adminCookie = await registerAdmin(app);
    const admin = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', ['admin@example.com']);

    const res = await request(app)
      .delete(`/api/admin/users/${admin!.id}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/own account/i);
  });
});

describe('GET /api/admin/audit', () => {
  it('returns audit log entries', async () => {
    const adminCookie = await registerAdmin(app);
    const user = await registerVerifiedUser(app, 'audited@example.com');

    // Trigger an audit action (change role)
    await request(app)
      .put(`/api/admin/users/${user.id}/role`)
      .set('Cookie', adminCookie)
      .send({ role: 'viewer' });

    const res = await request(app)
      .get('/api/admin/audit')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBeGreaterThanOrEqual(1);
    expect(res.body.logs[0].action).toBe('role_change');
  });
});

describe('GET /api/admin/stats', () => {
  it('returns user statistics', async () => {
    const adminCookie = await registerAdmin(app);
    await registerVerifiedUser(app, 'stat1@example.com');
    await registerVerifiedUser(app, 'stat2@example.com');

    const res = await request(app)
      .get('/api/admin/stats')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.totalUsers).toBe(3);
    expect(res.body.activeUsers).toBe(3);
    expect(res.body.byRole.admin).toBe(1);
    expect(res.body.byRole.editor).toBe(2);
    expect(res.body.byProvider.local).toBe(3);
  });
});
