/**
 * Server tests for auth routes (/api/auth).
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import type { Express } from 'express';
import { createTestApp, closeTestApp } from './test-helpers.js';
import { execute, queryOne } from '../../server/src/db/database.js';

// Mock the mailer module — capture emails instead of sending
vi.mock('../../server/src/utils/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  setTransporter: vi.fn(),
}));

import { sendVerificationEmail } from '../../server/src/utils/mailer.js';

/** Valid password that meets complexity requirements (8+ chars, upper, lower, digit). */
const VALID_PASSWORD = 'Password1';

/** Extract the set-cookie header value to use in subsequent requests. */
function extractCookie(res: request.Response): string {
  const cookies = res.headers['set-cookie'];
  if (!cookies) return '';
  const raw = Array.isArray(cookies) ? cookies[0] : cookies;
  return raw.split(';')[0];
}

/** Register the first user (admin) and return cookie. Admin is auto-verified. */
async function registerAdmin(app: Express, email = 'admin@example.com'): Promise<string> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: VALID_PASSWORD, displayName: 'Admin' });
  return extractCookie(res);
}

/** Register a non-admin user. Returns the response (no cookie — needs verification). */
async function registerUser(app: Express, email: string, displayName?: string) {
  // Ensure there's already an admin so this user is not the first
  const count = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
  if (count?.count === 0) {
    await registerAdmin(app);
  }
  return request(app)
    .post('/api/auth/register')
    .send({ email, password: VALID_PASSWORD, displayName: displayName || email.split('@')[0] });
}

/** Verify a user's email directly in DB (shortcut for tests that don't test verification). */
async function verifyUserEmail(email: string): Promise<void> {
  await execute(
    'UPDATE users SET email_verified = TRUE, verification_token_hash = NULL, verification_expires = NULL WHERE email = ?',
    [email],
  );
}

describe('POST /api/auth/register', () => {
  let app: Express;

  beforeEach(async () => {
    app = await createTestApp();
    vi.clearAllMocks();
  });

  it('first user gets admin role and is auto-verified (cookie set)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'first@example.com', password: VALID_PASSWORD, displayName: 'First' });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'first@example.com', role: 'admin' });
    // Admin gets a cookie (auto-verified)
    expect(res.headers['set-cookie']).toBeDefined();
    // No verification email sent for admin
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('second user gets editor role and verification email (no cookie)', async () => {
    await registerAdmin(app);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'second@example.com', password: VALID_PASSWORD, displayName: 'Second' });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/verification/i);
    expect(res.body.email).toBe('second@example.com');
    // No cookie for unverified user
    const cookies = res.headers['set-cookie'];
    const hasCookie = cookies && (Array.isArray(cookies) ? cookies : [cookies]).some((c: string) => c.startsWith('gw-auth-token='));
    expect(hasCookie).toBeFalsy();
    // Verification email sent
    expect(sendVerificationEmail).toHaveBeenCalledWith('second@example.com', expect.any(String));
  });

  it('rejects duplicate email', async () => {
    await registerAdmin(app, 'dup@example.com');

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: 'OtherPass1', displayName: 'Dup2' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already/i);
  });

  it('allows re-register of unverified account (replaces it)', async () => {
    await registerAdmin(app);

    // Register once (unverified)
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'retry@example.com', password: VALID_PASSWORD });

    // Register again with same email — should succeed (replaces unverified)
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'retry@example.com', password: VALID_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/verification/i);
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

describe('GET /api/auth/verify-email', () => {
  let app: Express;

  beforeEach(async () => {
    app = await createTestApp();
    vi.clearAllMocks();
  });

  it('verifies email and logs in (redirect to /)', async () => {
    await registerAdmin(app);

    // Register a user (sends verification email)
    await registerUser(app, 'verify@example.com');

    // Get the token that was passed to sendVerificationEmail
    const calls = vi.mocked(sendVerificationEmail).mock.calls;
    expect(calls.length).toBe(1);
    const token = calls[0][1];

    // Verify
    const res = await request(app)
      .get(`/api/auth/verify-email?token=${token}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(res.headers['set-cookie']).toBeDefined();

    // Check DB: email_verified = true
    const user = await queryOne<{ email_verified: number }>(
      'SELECT email_verified FROM users WHERE email = ?', ['verify@example.com'],
    );
    expect(user?.email_verified).toBe(1);
  });

  it('rejects invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/verify-email?token=invalidtoken123');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/?error=invalid_token');
  });

  it('rejects expired token', async () => {
    await registerAdmin(app);
    await registerUser(app, 'expired@example.com');

    const calls = vi.mocked(sendVerificationEmail).mock.calls;
    const token = calls[0][1];

    // Expire the token in DB
    await execute(
      'UPDATE users SET verification_expires = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE email = ?',
      ['expired@example.com'],
    );

    const res = await request(app)
      .get(`/api/auth/verify-email?token=${token}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/?error=token_expired');
  });

  it('rejects missing token parameter', async () => {
    const res = await request(app)
      .get('/api/auth/verify-email');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/?error=invalid_token');
  });
});

describe('POST /api/auth/resend-verification', () => {
  let app: Express;

  beforeEach(async () => {
    app = await createTestApp();
    vi.clearAllMocks();
  });

  it('resends verification email for unverified account', async () => {
    await registerAdmin(app);
    await registerUser(app, 'resend@example.com');

    vi.clearAllMocks(); // Clear the initial sendVerificationEmail call

    // Make the token old enough to allow resend (set expires to less than 23.67h from now)
    await execute(
      'UPDATE users SET verification_expires = DATE_ADD(NOW(), INTERVAL 20 HOUR) WHERE email = ?',
      ['resend@example.com'],
    );

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'resend@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/verification/i);
    expect(sendVerificationEmail).toHaveBeenCalledWith('resend@example.com', expect.any(String));
  });

  it('returns 200 for non-existent email (no leak)', async () => {
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('returns 200 for already verified email (no leak)', async () => {
    await registerAdmin(app, 'verified@example.com');

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'verified@example.com' });

    expect(res.status).toBe(200);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/login', () => {
  let app: Express;

  beforeEach(async () => {
    app = await createTestApp();
    vi.clearAllMocks();

    // Seed: register admin, then a verified user
    await registerAdmin(app);
    await registerUser(app, 'user@example.com', 'User');
    await verifyUserEmail('user@example.com');
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
    const user = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', ['user@example.com']);
    await execute('UPDATE users SET is_active = FALSE WHERE id = ?', [user!.id]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: VALID_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/disabled/i);
  });

  it('rejects unverified email', async () => {
    // Create an unverified user
    await registerUser(app, 'unverified@example.com');

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
    vi.clearAllMocks();
  });

  it('clears cookie', async () => {
    const res = await request(app)
      .post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const raw = Array.isArray(cookies) ? cookies[0] : cookies;
    expect(raw).toMatch(/gw-auth-token=/);
  });

  it('revokes session so token cannot be reused', async () => {
    // Login as admin
    const cookie = await registerAdmin(app, 'logout-test@example.com');

    // Verify we can access /me
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);
    expect(meRes.status).toBe(200);

    // Logout
    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie);

    // Try to reuse the same token — should be rejected (session revoked)
    const afterLogout = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);
    expect(afterLogout.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  let app: Express;

  beforeEach(async () => {
    app = await createTestApp();
    vi.clearAllMocks();
  });

  it('returns user info with new fields', async () => {
    const cookie = await registerAdmin(app, 'me@example.com');

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: 'me@example.com',
      displayName: 'Admin',
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
    const cookie = await registerAdmin(app, 'disabled@example.com');

    const user = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', ['disabled@example.com']);
    await execute('UPDATE users SET is_active = FALSE WHERE id = ?', [user!.id]);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);

    expect(res.status).toBe(401);
  });
});

describe('PUT /api/auth/me', () => {
  let app: Express;

  beforeEach(async () => {
    app = await createTestApp();
    vi.clearAllMocks();
  });

  it('updates display name', async () => {
    const cookie = await registerAdmin(app, 'update@example.com');

    const res = await request(app)
      .put('/api/auth/me')
      .set('Cookie', cookie)
      .send({ displayName: 'After' });

    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('After');
  });

  it('updates password with strong password', async () => {
    const cookie = await registerAdmin(app, 'pwchange@example.com');

    const updateRes = await request(app)
      .put('/api/auth/me')
      .set('Cookie', cookie)
      .send({ password: 'NewPassword2' });

    expect(updateRes.status).toBe(200);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'pwchange@example.com', password: 'NewPassword2' });

    expect(loginRes.status).toBe(200);
  });

  it('rejects weak password update', async () => {
    const cookie = await registerAdmin(app, 'weakpw@example.com');

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
    vi.clearAllMocks();
  });

  it('finds by email', async () => {
    const cookie = await registerAdmin(app, 'searchme@example.com');

    const res = await request(app)
      .get('/api/auth/users?q=searchme')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].email).toBe('searchme@example.com');
  });

  it('excludes disabled users from search', async () => {
    const cookie = await registerAdmin(app);

    // Create and verify another user, then disable
    await registerUser(app, 'hidden@example.com', 'Hidden');
    await verifyUserEmail('hidden@example.com');
    const user = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', ['hidden@example.com']);
    await execute('UPDATE users SET is_active = FALSE WHERE id = ?', [user!.id]);

    const res = await request(app)
      .get('/api/auth/users?q=hidden')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns empty for short query', async () => {
    const cookie = await registerAdmin(app, 'test@example.com');

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
