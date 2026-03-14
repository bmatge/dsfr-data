/**
 * Server tests for auth routes (/api/auth).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, closeTestApp, authCookie } from './test-helpers.js';

/** Extract the set-cookie header value to use in subsequent requests. */
function extractCookie(res: request.Response): string {
  const cookies = res.headers['set-cookie'];
  if (!cookies) return '';
  const raw = Array.isArray(cookies) ? cookies[0] : cookies;
  // Return only the key=value part (before the first semicolon)
  return raw.split(';')[0];
}

describe('POST /api/auth/register', () => {
  let app: Express;

  beforeEach(() => {
    closeTestApp();
    app = createTestApp();
  });

  it('creates a user successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'password123', displayName: 'Alice' });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: 'alice@example.com',
      displayName: 'Alice',
    });
    expect(res.body.user.id).toBeDefined();
    expect(res.body.user.role).toBeDefined();
    // Should set an httpOnly cookie
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('first user gets admin role', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'first@example.com', password: 'password123', displayName: 'First' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('admin');
  });

  it('second user gets editor role', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'first@example.com', password: 'password123', displayName: 'First' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'second@example.com', password: 'password123', displayName: 'Second' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('editor');
  });

  it('rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: 'password123', displayName: 'Dup' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: 'password456', displayName: 'Dup2' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already/i);
  });

  it('rejects short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'short@example.com', password: '123', displayName: 'Short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 characters/i);
  });

  it('rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('POST /api/auth/login', () => {
  let app: Express;

  beforeEach(async () => {
    closeTestApp();
    app = createTestApp();

    // Seed a user for login tests
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@example.com', password: 'correctpassword', displayName: 'User' });
  });

  it('successful login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'correctpassword' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: 'user@example.com',
      displayName: 'User',
    });
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('wrong email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonexistent@example.com', password: 'correctpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });
});

describe('POST /api/auth/logout', () => {
  let app: Express;

  beforeEach(() => {
    closeTestApp();
    app = createTestApp();
  });

  it('clears cookie', async () => {
    const res = await request(app)
      .post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // The set-cookie header should clear the auth cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const raw = Array.isArray(cookies) ? cookies[0] : cookies;
    expect(raw).toMatch(/gw-auth-token=/);
  });
});

describe('GET /api/auth/me', () => {
  let app: Express;

  beforeEach(() => {
    closeTestApp();
    app = createTestApp();
  });

  it('returns user info', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'me@example.com', password: 'password123', displayName: 'Me' });

    const cookie = extractCookie(registerRes);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: 'me@example.com',
      displayName: 'Me',
      role: 'admin',
    });
    expect(res.body.user.id).toBeDefined();
    expect(res.body.user.createdAt).toBeDefined();
  });

  it('401 without token', async () => {
    const res = await request(app)
      .get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authentication/i);
  });
});

describe('PUT /api/auth/me', () => {
  let app: Express;

  beforeEach(() => {
    closeTestApp();
    app = createTestApp();
  });

  it('updates display name', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'update@example.com', password: 'password123', displayName: 'Before' });

    const cookie = extractCookie(registerRes);

    const res = await request(app)
      .put('/api/auth/me')
      .set('Cookie', cookie)
      .send({ displayName: 'After' });

    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('After');
  });

  it('updates password', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'pwchange@example.com', password: 'oldpassword', displayName: 'PW' });

    const cookie = extractCookie(registerRes);

    // Update password
    const updateRes = await request(app)
      .put('/api/auth/me')
      .set('Cookie', cookie)
      .send({ password: 'newpassword' });

    expect(updateRes.status).toBe(200);

    // Verify new password works for login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'pwchange@example.com', password: 'newpassword' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.email).toBe('pwchange@example.com');
  });
});

describe('GET /api/auth/users', () => {
  let app: Express;

  beforeEach(() => {
    closeTestApp();
    app = createTestApp();
  });

  it('finds by email', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'searchme@example.com', password: 'password123', displayName: 'SearchMe' });

    const cookie = extractCookie(registerRes);

    const res = await request(app)
      .get('/api/auth/users?q=searchme')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].email).toBe('searchme@example.com');
  });

  it('returns empty for short query', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123', displayName: 'Test' });

    const cookie = extractCookie(registerRes);

    const res = await request(app)
      .get('/api/auth/users?q=a')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
