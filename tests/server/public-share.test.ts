/**
 * Server tests for public favorite sharing (issue #148).
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createTestApp, closeTestApp, authCookie } from './test-helpers.js';
import { execute, queryOne } from '../../server/src/db/database.js';
import type { Express } from 'express';

vi.mock('../../server/src/utils/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  setTransporter: vi.fn(),
}));

let app: Express;

async function registerUser(email: string, password = 'Password1') {
  const res = await request(app).post('/api/auth/register').send({ email, password });
  if (res.body.user) {
    const userId = res.body.user.id as string;
    const role = res.body.user.role as string;
    return { id: userId, email, role, cookie: authCookie({ userId, email, role }) };
  }
  await execute(
    'UPDATE users SET email_verified = TRUE, verification_token_hash = NULL WHERE email = ?',
    [email]
  );
  const user = await queryOne<{ id: string; role: string }>(
    'SELECT id, role FROM users WHERE email = ?',
    [email]
  );
  return {
    id: user!.id,
    email,
    role: user!.role,
    cookie: authCookie({ userId: user!.id, email, role: user!.role }),
  };
}

async function createFavorite(
  cookie: string,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const body = {
    name: 'My chart',
    chart_type: 'bar',
    code: '<dsfr-data-chart type="bar"></dsfr-data-chart>',
    builder_state_json: { chartType: 'bar' },
    source_app: 'builder',
    ...overrides,
  };
  const res = await request(app).post('/api/favorites').set('Cookie', cookie).send(body);
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function createPublicShare(
  cookie: string,
  resourceId: string,
  body: Record<string, unknown> = {}
) {
  return request(app)
    .post('/api/shares')
    .set('Cookie', cookie)
    .send({
      resource_type: 'favorite',
      resource_id: resourceId,
      target_type: 'public',
      ...body,
    });
}

describe('Public favorite sharing (issue #148)', () => {
  beforeEach(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('POST /api/shares with target_type=public', () => {
    it('creates a public share for an owned favorite', async () => {
      const alice = await registerUser('alice@test.fr');
      const favId = await createFavorite(alice.cookie);

      const res = await createPublicShare(alice.cookie, favId);

      expect(res.status).toBe(201);
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body.target_type).toBe('public');
      expect(res.body.target_id).toBeNull();
      expect(res.body.resource_id).toBe(favId);
    });

    it('refuses to share a favorite the user does not own', async () => {
      const alice = await registerUser('alice@test.fr');
      const bob = await registerUser('bob@test.fr');
      const favId = await createFavorite(alice.cookie);

      const res = await createPublicShare(bob.cookie, favId);

      expect(res.status).toBe(403);
    });

    it('refuses public share for favorites with a private connectionId', async () => {
      const alice = await registerUser('alice@test.fr');
      const favId = await createFavorite(alice.cookie, {
        builder_state_json: {
          chartType: 'bar',
          savedSource: { connectionId: 'conn-123' },
        },
      });

      const res = await createPublicShare(alice.cookie, favId);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PRIVATE_SOURCE_NOT_SUPPORTED');
    });

    it('refuses public share for favorites with a legacy inline apiKey', async () => {
      const alice = await registerUser('alice@test.fr');
      const favId = await createFavorite(alice.cookie, {
        builder_state_json: {
          chartType: 'bar',
          savedSource: { apiKey: 'sk_secret' },
        },
      });

      const res = await createPublicShare(alice.cookie, favId);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PRIVATE_SOURCE_NOT_SUPPORTED');
    });

    it('refuses public share for non-favorite resources', async () => {
      const alice = await registerUser('alice@test.fr');
      const sourceRes = await request(app)
        .post('/api/sources')
        .set('Cookie', alice.cookie)
        .send({ name: 'src', type: 'csv', config_json: {}, data_json: [], record_count: 0 });
      const sourceId = sourceRes.body.id as string;

      const res = await request(app).post('/api/shares').set('Cookie', alice.cookie).send({
        resource_type: 'source',
        resource_id: sourceId,
        target_type: 'public',
      });

      expect(res.status).toBe(400);
    });

    it('rejects expires_at in the past', async () => {
      const alice = await registerUser('alice@test.fr');
      const favId = await createFavorite(alice.cookie);

      const res = await createPublicShare(alice.cookie, favId, {
        expires_at: '2000-01-01T00:00:00Z',
      });

      expect(res.status).toBe(400);
    });

    it('accepts a future expires_at', async () => {
      const alice = await registerUser('alice@test.fr');
      const favId = await createFavorite(alice.cookie);

      const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      const res = await createPublicShare(alice.cookie, favId, { expires_at: future });

      expect(res.status).toBe(201);
      expect(res.body.expires_at).toBeTruthy();
    });
  });

  describe('GET /api/public/share/:token (anonymous)', () => {
    it('returns the favorite payload without auth', async () => {
      const alice = await registerUser('alice@test.fr');
      const favId = await createFavorite(alice.cookie);
      const share = await createPublicShare(alice.cookie, favId);
      const token = share.body.id as string;

      const res = await request(app).get(`/api/public/share/${token}`);

      expect(res.status).toBe(200);
      expect(res.body.resourceType).toBe('favorite');
      expect(res.body.name).toBe('My chart');
      expect(res.body.chartType).toBe('bar');
      expect(res.body.code).toContain('<dsfr-data-chart');
      // Must not leak owner identity or builder state blob
      expect(res.body.ownerId).toBeUndefined();
      expect(res.body.owner_id).toBeUndefined();
      expect(res.body.builder_state_json).toBeUndefined();
      expect(res.body.builderStateJson).toBeUndefined();
      // Must set X-Robots-Tag to discourage indexing
      expect(res.headers['x-robots-tag']).toContain('noindex');
    });

    it('returns 404 for an unknown token', async () => {
      const res = await request(app).get('/api/public/share/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
    });

    it('returns 404 for malformed token (sanity check, no DB hit)', async () => {
      const res = await request(app).get('/api/public/share/not-a-uuid');
      expect(res.status).toBe(404);
    });

    it('returns 410 Gone after the owner revokes the share', async () => {
      const alice = await registerUser('alice@test.fr');
      const favId = await createFavorite(alice.cookie);
      const share = await createPublicShare(alice.cookie, favId);
      const token = share.body.id as string;

      // Mark revoked directly (DELETE via /api/shares/:id removes the row;
      // here we test the soft-revoke path that shows "Gone" on the public side)
      await execute('UPDATE shares SET revoked_at = NOW() WHERE id = ?', [token]);

      const res = await request(app).get(`/api/public/share/${token}`);
      expect(res.status).toBe(410);
      expect(res.body.code).toBe('REVOKED');
    });

    it('returns 410 Gone when expired', async () => {
      const alice = await registerUser('alice@test.fr');
      const favId = await createFavorite(alice.cookie);
      const share = await createPublicShare(alice.cookie, favId);
      const token = share.body.id as string;

      // Force expiration to the past directly in DB (route only accepts future)
      await execute('UPDATE shares SET expires_at = ? WHERE id = ?', [
        '2000-01-01 00:00:00',
        token,
      ]);

      const res = await request(app).get(`/api/public/share/${token}`);
      expect(res.status).toBe(410);
      expect(res.body.code).toBe('EXPIRED');
    });

    it('returns 410 Gone if the underlying favorite was deleted', async () => {
      const alice = await registerUser('alice@test.fr');
      const favId = await createFavorite(alice.cookie);
      const share = await createPublicShare(alice.cookie, favId);
      const token = share.body.id as string;

      await execute('DELETE FROM favorites WHERE id = ?', [favId]);

      const res = await request(app).get(`/api/public/share/${token}`);
      expect(res.status).toBe(410);
      expect(res.body.code).toBe('GONE');
    });

    it('does not leak shares whose target_type is not public', async () => {
      const alice = await registerUser('alice@test.fr');
      const bob = await registerUser('bob@test.fr');
      const favId = await createFavorite(alice.cookie);

      // user-targeted share (not public)
      const shareRes = await request(app).post('/api/shares').set('Cookie', alice.cookie).send({
        resource_type: 'favorite',
        resource_id: favId,
        target_type: 'user',
        target_id: bob.id,
      });
      const token = shareRes.body.id as string;

      const res = await request(app).get(`/api/public/share/${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/shares/:id (owner revokes link)', () => {
    it('removes the row so the public link returns 404 afterwards', async () => {
      const alice = await registerUser('alice@test.fr');
      const favId = await createFavorite(alice.cookie);
      const share = await createPublicShare(alice.cookie, favId);
      const token = share.body.id as string;

      const del = await request(app).delete(`/api/shares/${token}`).set('Cookie', alice.cookie);
      expect(del.status).toBe(200);

      const res = await request(app).get(`/api/public/share/${token}`);
      expect(res.status).toBe(404);
    });

    it('refuses revocation by a non-owner', async () => {
      const alice = await registerUser('alice@test.fr');
      const bob = await registerUser('bob@test.fr');
      const favId = await createFavorite(alice.cookie);
      const share = await createPublicShare(alice.cookie, favId);
      const token = share.body.id as string;

      const del = await request(app).delete(`/api/shares/${token}`).set('Cookie', bob.cookie);
      expect(del.status).toBe(403);
    });
  });
});
