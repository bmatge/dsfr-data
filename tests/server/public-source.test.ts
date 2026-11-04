/**
 * Server tests for published sources (ADR-165, #1361).
 *
 * Requires MariaDB (see test-helpers.ts). The upstream Grist API is replaced
 * by a stubbed global `fetch` : what the route sends upstream (URL, headers)
 * is asserted, what it returns to the visitor too.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createTestApp, closeTestApp, authCookie } from './test-helpers.js';
import { execute, queryOne } from '../../server/src/db/database.js';
import { clearPublicSourceCache } from '../../server/src/routes/public-source.js';
import type { Express } from 'express';

vi.mock('../../server/src/utils/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  setTransporter: vi.fn(),
}));

let app: Express;

const GRIST_BODY = JSON.stringify({ records: [{ id: 1, fields: { region: 'Bretagne', pop: 3 } }] });

/** Stub de l'amont : enregistre les appels, répond comme Grist. */
function stubUpstream(status = 200, body = GRIST_BODY, contentType = 'application/json') {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(body, { status, headers: { 'content-type': contentType } });
    })
  );
  return calls;
}

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

async function createConnection(cookie: string, apiKey: string | null): Promise<string> {
  const res = await request(app)
    .post('/api/connections')
    .set('Cookie', cookie)
    .send({
      name: 'Grist',
      type: 'grist',
      config_json: { url: 'https://grist.numerique.gouv.fr', isPublic: apiKey === null },
      api_key_encrypted: apiKey,
      status: 'connected',
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function createGristSource(
  cookie: string,
  config: Record<string, unknown>,
  type = 'grist'
): Promise<string> {
  const res = await request(app)
    .post('/api/sources')
    .set('Cookie', cookie)
    .send({ name: 'Table', type, config_json: config, data_json: [], record_count: 0 });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function publish(cookie: string, sourceId: string) {
  return request(app)
    .post('/api/shares')
    .set('Cookie', cookie)
    .send({ resource_type: 'source', resource_id: sourceId, target_type: 'public' });
}

describe('Published sources (ADR-165)', () => {
  beforeEach(async () => {
    app = await createTestApp();
    clearPublicSourceCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  describe('POST /api/shares (resource_type=source, target_type=public)', () => {
    it('publishes a Grist source bound to a keyed connection', async () => {
      const alice = await registerUser('alice@test.fr');
      const connId = await createConnection(alice.cookie, 'sk_secret');
      const srcId = await createGristSource(alice.cookie, {
        connectionId: connId,
        documentId: 'doc1',
        tableId: 'T',
        isPublic: false,
      });

      const res = await publish(alice.cookie, srcId);

      expect(res.status).toBe(201);
      expect(res.body.target_type).toBe('public');
      expect(res.body.resource_id).toBe(srcId);
      const audit = await queryOne<{ action: string }>(
        "SELECT action FROM audit_log WHERE action = 'source.published' AND target_id = ?",
        [srcId]
      );
      expect(audit?.action).toBe('source.published');
    });

    it('refuses a source that needs no publication (manual, public Grist)', async () => {
      const alice = await registerUser('alice@test.fr');
      const manual = await createGristSource(alice.cookie, {}, 'manual');
      const publicGrist = await createGristSource(alice.cookie, {
        documentId: 'doc1',
        tableId: 'T',
        isPublic: true,
      });

      expect((await publish(alice.cookie, manual)).body.code).toBe('SOURCE_NOT_PUBLISHABLE');
      expect((await publish(alice.cookie, publicGrist)).body.code).toBe('SOURCE_NOT_PUBLISHABLE');
    });

    it('refuses a second publication while one is active', async () => {
      const alice = await registerUser('alice@test.fr');
      const srcId = await createGristSource(alice.cookie, {
        apiKey: 'k',
        documentId: 'd',
        tableId: 'T',
      });
      expect((await publish(alice.cookie, srcId)).status).toBe(201);
      const again = await publish(alice.cookie, srcId);
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('ALREADY_PUBLISHED');
    });

    it('refuses publication by a non-owner', async () => {
      const alice = await registerUser('alice@test.fr');
      const bob = await registerUser('bob@test.fr');
      const srcId = await createGristSource(alice.cookie, {
        apiKey: 'k',
        documentId: 'd',
        tableId: 'T',
      });
      expect((await publish(bob.cookie, srcId)).status).toBe(403);
    });
  });

  describe('GET /api/public/sources/:token/records (anonymous)', () => {
    it('reads upstream with the connection key, at the bound URL, and never leaks the key', async () => {
      const alice = await registerUser('alice@test.fr');
      const connId = await createConnection(alice.cookie, 'sk_secret');
      const srcId = await createGristSource(alice.cookie, {
        connectionId: connId,
        documentId: 'doc1',
        tableId: 'T',
        apiUrl: 'https://grist.numerique.gouv.fr/api/docs/doc1/tables/T/records',
        isPublic: false,
      });
      const token = (await publish(alice.cookie, srcId)).body.id as string;
      const calls = stubUpstream();

      const res = await request(app).get(`/api/public/sources/${token}/records?limit=1&x=1`);

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(res.headers['cache-control']).toContain('public');
      expect(res.headers['x-robots-tag']).toContain('noindex');
      expect(res.text).toBe(GRIST_BODY);
      expect(res.text).not.toContain('sk_secret');
      // L'amont est appele a l'URL FIXEE par la source, sans la requete du client
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('https://grist.numerique.gouv.fr/api/docs/doc1/tables/T/records');
      expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(
        'Bearer sk_secret'
      );
      expect(calls[0].init?.method).toBe('GET');
    });

    it('serves from cache on the second read within the TTL', async () => {
      const alice = await registerUser('alice@test.fr');
      const srcId = await createGristSource(alice.cookie, {
        apiKey: 'k',
        apiUrl: 'https://docs.getgrist.com/api/docs/d/tables/T/records',
      });
      const token = (await publish(alice.cookie, srcId)).body.id as string;
      const calls = stubUpstream();

      await request(app).get(`/api/public/sources/${token}/records`);
      await request(app).get(`/api/public/sources/${token}/records`);

      expect(calls).toHaveLength(1);
    });

    it('returns 404 for a malformed, unknown, or revoked token, without calling upstream', async () => {
      const alice = await registerUser('alice@test.fr');
      const srcId = await createGristSource(alice.cookie, {
        apiKey: 'k',
        documentId: 'd',
        tableId: 'T',
        apiUrl: 'https://docs.getgrist.com/api/docs/d/tables/T/records',
      });
      const token = (await publish(alice.cookie, srcId)).body.id as string;
      const calls = stubUpstream();

      expect((await request(app).get('/api/public/sources/not-a-token/records')).status).toBe(404);
      expect(
        (await request(app).get('/api/public/sources/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90/records'))
          .status
      ).toBe(404);

      const del = await request(app).delete(`/api/shares/${token}`).set('Cookie', alice.cookie);
      expect(del.status).toBe(200);
      expect((await request(app).get(`/api/public/sources/${token}/records`)).status).toBe(404);
      const audit = await queryOne<{ action: string }>(
        "SELECT action FROM audit_log WHERE action = 'source.unpublished' AND target_id = ?",
        [srcId]
      );
      expect(audit?.action).toBe('source.unpublished');
      expect(calls).toHaveLength(0);
    });

    it('does not serve a favorite share token on the source route', async () => {
      const alice = await registerUser('alice@test.fr');
      const fav = await request(app).post('/api/favorites').set('Cookie', alice.cookie).send({
        name: 'f',
        chart_type: 'bar',
        code: '<x>',
        builder_state_json: {},
        source_app: 'builder',
      });
      const share = await request(app)
        .post('/api/shares')
        .set('Cookie', alice.cookie)
        .send({ resource_type: 'favorite', resource_id: fav.body.id, target_type: 'public' });
      const calls = stubUpstream();
      expect((await request(app).get(`/api/public/sources/${share.body.id}/records`)).status).toBe(
        404
      );
      expect(calls).toHaveLength(0);
    });

    it('maps upstream 401/403 to 403 and other failures to 502', async () => {
      const alice = await registerUser('alice@test.fr');
      const srcId = await createGristSource(alice.cookie, {
        apiKey: 'k',
        apiUrl: 'https://docs.getgrist.com/api/docs/d/tables/T/records',
      });
      const token = (await publish(alice.cookie, srcId)).body.id as string;

      stubUpstream(401, '{"error":"no"}');
      expect((await request(app).get(`/api/public/sources/${token}/records`)).status).toBe(403);
      clearPublicSourceCache();
      stubUpstream(200, '<html>', 'text/html');
      expect((await request(app).get(`/api/public/sources/${token}/records`)).status).toBe(502);
    });

    it('rejects a non-GET method', async () => {
      const alice = await registerUser('alice@test.fr');
      const srcId = await createGristSource(alice.cookie, {
        apiKey: 'k',
        apiUrl: 'https://docs.getgrist.com/api/docs/d/tables/T/records',
      });
      const token = (await publish(alice.cookie, srcId)).body.id as string;
      const res = await request(app).post(`/api/public/sources/${token}/records`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/sources/:id/records (authenticated preview)', () => {
    it('serves the owner without publication, refuses anonymous and strangers', async () => {
      const alice = await registerUser('alice@test.fr');
      const bob = await registerUser('bob@test.fr');
      const srcId = await createGristSource(alice.cookie, {
        apiKey: 'k',
        apiUrl: 'https://docs.getgrist.com/api/docs/d/tables/T/records',
      });
      const calls = stubUpstream();

      const mine = await request(app)
        .get(`/api/sources/${srcId}/records`)
        .set('Cookie', alice.cookie);
      expect(mine.status).toBe(200);
      expect(mine.text).toBe(GRIST_BODY);
      expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer k');

      expect((await request(app).get(`/api/sources/${srcId}/records`)).status).toBe(401);
      expect(
        (await request(app).get(`/api/sources/${srcId}/records`).set('Cookie', bob.cookie)).status
      ).toBe(403);
    });
  });
});
