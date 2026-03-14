/**
 * Server tests for cache routes (/api/cache).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, closeTestApp } from './test-helpers.js';

/** Extract the set-cookie header value to use in subsequent requests. */
function extractCookie(res: request.Response): string {
  const cookies = res.headers['set-cookie'];
  if (!cookies) return '';
  const raw = Array.isArray(cookies) ? cookies[0] : cookies;
  return raw.split(';')[0];
}

/** Register a user and return the auth cookie. */
async function registerAndGetCookie(app: Express): Promise<string> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'cache-user@example.com', password: 'password123', displayName: 'CacheUser' });
  return extractCookie(res);
}

describe('PUT /api/cache/:sourceId', () => {
  let app: Express;
  let cookie: string;

  beforeEach(async () => {
    closeTestApp();
    app = createTestApp();
    cookie = await registerAndGetCookie(app);
  });

  it('stores cached data and retrieves it', async () => {
    const sourceId = 'src-001';
    const payload = {
      data: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      dataHash: 'abc123',
      recordCount: 2,
      ttlSeconds: 3600,
    };

    // PUT to store
    const putRes = await request(app)
      .put(`/api/cache/${sourceId}`)
      .set('Cookie', cookie)
      .send(payload);

    expect(putRes.status).toBe(200);
    expect(putRes.body).toEqual({ ok: true });

    // GET to retrieve
    const getRes = await request(app)
      .get(`/api/cache/${sourceId}`)
      .set('Cookie', cookie);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data).toEqual(payload.data);
    expect(getRes.body.dataHash).toBe('abc123');
    expect(getRes.body.recordCount).toBe(2);
    expect(getRes.body.ttlSeconds).toBe(3600);
    expect(getRes.body.fetchedAt).toBeDefined();
  });

  it('stores data with default values when optional fields are omitted', async () => {
    const sourceId = 'src-defaults';

    const putRes = await request(app)
      .put(`/api/cache/${sourceId}`)
      .set('Cookie', cookie)
      .send({ data: { key: 'value' } });

    expect(putRes.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/cache/${sourceId}`)
      .set('Cookie', cookie);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data).toEqual({ key: 'value' });
    expect(getRes.body.dataHash).toBeNull();
    expect(getRes.body.recordCount).toBe(0);
    expect(getRes.body.ttlSeconds).toBe(3600);
  });

  it('returns 400 when data is missing', async () => {
    const res = await request(app)
      .put('/api/cache/src-no-data')
      .set('Cookie', cookie)
      .send({ dataHash: 'xyz' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/data/i);
  });

  it('requires auth (401 without cookie)', async () => {
    const res = await request(app)
      .put('/api/cache/src-001')
      .send({ data: [1, 2, 3] });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/cache/:sourceId', () => {
  let app: Express;
  let cookie: string;

  beforeEach(async () => {
    closeTestApp();
    app = createTestApp();
    cookie = await registerAndGetCookie(app);
  });

  it('returns 404 when no cache exists', async () => {
    const res = await request(app)
      .get('/api/cache/nonexistent-source')
      .set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no valid cache/i);
  });

  it('requires auth (401 without cookie)', async () => {
    const res = await request(app)
      .get('/api/cache/src-001');

    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/cache/:sourceId', () => {
  let app: Express;
  let cookie: string;

  beforeEach(async () => {
    closeTestApp();
    app = createTestApp();
    cookie = await registerAndGetCookie(app);
  });

  it('invalidates cache so subsequent GET returns 404', async () => {
    const sourceId = 'src-to-delete';

    // Store some data
    await request(app)
      .put(`/api/cache/${sourceId}`)
      .set('Cookie', cookie)
      .send({ data: { hello: 'world' }, recordCount: 1 });

    // Verify it exists
    const getRes1 = await request(app)
      .get(`/api/cache/${sourceId}`)
      .set('Cookie', cookie);
    expect(getRes1.status).toBe(200);
    expect(getRes1.body.data).toEqual({ hello: 'world' });

    // Delete
    const deleteRes = await request(app)
      .delete(`/api/cache/${sourceId}`)
      .set('Cookie', cookie);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({ ok: true });

    // Verify it is gone
    const getRes2 = await request(app)
      .get(`/api/cache/${sourceId}`)
      .set('Cookie', cookie);
    expect(getRes2.status).toBe(404);
  });

  it('returns ok even if no cache existed', async () => {
    const res = await request(app)
      .delete('/api/cache/nonexistent')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('requires auth (401 without cookie)', async () => {
    const res = await request(app)
      .delete('/api/cache/src-001');

    expect(res.status).toBe(401);
  });
});
