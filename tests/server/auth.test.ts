/**
 * Server tests for auth routes (/api/auth).
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, closeTestApp, authCookie } from './test-helpers.js';
import { execute, queryOne } from '../../server/src/db/database.js';

/** Valid password that meets complexity requirements (8+ chars, upper, lower, digit). */
const VALID_PASSWORD = 'Password1';

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

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('creates a user successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: VALID_PASSWORD, displayName: 'Alice' });

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
      .send({ email: 'first@example.com', password: VALID_PASSWORD, displayName: 'First' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('admin');
  });

  it('second user gets editor role', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'first@example.com', password: VALID_PASSWORD, displayName: 'First' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'second@example.com', password: VALID_PASSWORD, displayName: 'Second' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('editor');
  });

  it('rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: VALID_PASSWORD, displayName: 'Dup' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: 'OtherPass1', displayName: 'Dup2' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already/i);
  });

  it('rejects short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'short@example.com', password: 'Ab1', displayName: 'Short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 caracteres/i);
  });

  it('rejects password without uppercase', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'noup@example.com', password: 'password1', displayName: 'NoUp' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/majuscule/i);
  });

  it('rejects password without digit', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'nodig@example.com', password: 'Passwordx', displayName: 'NoDig' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/chiffre/i);
  });

  it('rejects invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: VALID_PASSWORD, displayName: 'Bad' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid email/i);
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
    app = await createTestApp();

    // Seed a user for login tests
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@example.com', password: VALID_PASSWORD, displayName: 'User' });
  });

  it('successful login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: VALID_PASSWORD });

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
      .send({ email: 'user@example.com', password: 'WrongPass1' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('wrong email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonexistent@example.com', password: VALID_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('rejects disabled account', async () => {
    // Disable the user via DB
    const user = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', ['user@example.com']);
    await execute('UPDATE users SET is_active = FALSE WHERE id = ?', [user!.id]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: VALID_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/disabled/i);
  });

  it('rejects unverified email', async () => {
    // Create a second user and mark as unverified
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'unverified@example.com', password: VALID_PASSWORD, displayName: 'Unverified' });

    const user = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', ['unverified@example.com']);
    await execute('UPDATE users SET email_verified = FALSE WHERE id = ?', [user!.id]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unverified@example.com', password: VALID_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('email_not_verified');
  });
});

describe('POST /api/auth/logout', () => {
  let app: Express;

  beforeEach(async () => {
    app = await createTestApp();
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

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('returns user info with new fields', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'me@example.com', password: VALID_PASSWORD, displayName: 'Me' });

    const cookie = extractCookie(registerRes);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: 'me@example.com',
      displayName: 'Me',
      role: 'admin',
      authProvider: 'local',
      isActive: true,
      emailVerified: true,
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

  it('401 for disabled account', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'disabled@example.com', password: VALID_PASSWORD, displayName: 'Disabled' });

    const cookie = extractCookie(registerRes);

    // Disable the user
    const user = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', ['disabled@example.com']);
    await execute('UPDATE users SET is_active = FALSE WHERE id = ?', [user!.id]);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);

    // authMiddleware sets user to null when is_active = false → 401
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/auth/me', () => {
  let app: Express;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('updates display name', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'update@example.com', password: VALID_PASSWORD, displayName: 'Before' });

    const cookie = extractCookie(registerRes);

    const res = await request(app)
      .put('/api/auth/me')
      .set('Cookie', cookie)
      .send({ displayName: 'After' });

    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('After');
  });

  it('updates password with strong password', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'pwchange@example.com', password: VALID_PASSWORD, displayName: 'PW' });

    const cookie = extractCookie(registerRes);

    // Update password
    const updateRes = await request(app)
      .put('/api/auth/me')
      .set('Cookie', cookie)
      .send({ password: 'NewPassword2' });

    expect(updateRes.status).toBe(200);

    // Verify new password works for login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'pwchange@example.com', password: 'NewPassword2' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.email).toBe('pwchange@example.com');
  });

  it('rejects weak password update', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'weakpw@example.com', password: VALID_PASSWORD, displayName: 'WeakPw' });

    const cookie = extractCookie(registerRes);

    const res = await request(app)
      .put('/api/auth/me')
      .set('Cookie', cookie)
      .send({ password: 'short' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/users', () => {
  let app: Express;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('finds by email', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'searchme@example.com', password: VALID_PASSWORD, displayName: 'SearchMe' });

    const cookie = extractCookie(registerRes);

    const res = await request(app)
      .get('/api/auth/users?q=searchme')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].email).toBe('searchme@example.com');
  });

  it('excludes disabled users from search', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'admin@example.com', password: VALID_PASSWORD, displayName: 'Admin' });

    const cookie = extractCookie(registerRes);

    // Create another user and disable it
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'hidden@example.com', password: VALID_PASSWORD, displayName: 'Hidden' });

    const user = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', ['hidden@example.com']);
    await execute('UPDATE users SET is_active = FALSE WHERE id = ?', [user!.id]);

    const res = await request(app)
      .get('/api/auth/users?q=hidden')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns empty for short query', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: VALID_PASSWORD, displayName: 'Test' });

    const cookie = extractCookie(registerRes);

    const res = await request(app)
      .get('/api/auth/users?q=a')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

afterAll(async () => {
  await closeTestApp();
});
