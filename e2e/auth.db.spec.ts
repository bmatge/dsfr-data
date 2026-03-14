/**
 * E2E tests for authentication (register, login, me, logout).
 *
 * These tests run against the Express backend API.
 * Requires: backend running on port 3002 with JWT_SECRET set.
 *
 * Run: npx playwright test e2e/auth.db.spec.ts --project=chromium-db
 */
import { test, expect, type APIRequestContext } from '@playwright/test';

const API = 'http://localhost:3002';

// Unique suffix per test run to avoid collisions
const RUN_ID = Date.now().toString(36);

function testEmail(label: string): string {
  return `${label}-${RUN_ID}@test.local`;
}

test.describe('Auth API E2E', () => {
  test('POST /api/auth/register creates a new user', async ({ request }) => {
    const email = testEmail('register');
    const res = await request.post(`${API}/api/auth/register`, {
      data: { email, password: 'secret123', displayName: 'Test User' },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(email);
    expect(body.user.displayName).toBe('Test User');
    expect(body.user.role).toBeDefined();

    // Should set auth cookie
    const cookies = res.headers()['set-cookie'];
    expect(cookies).toContain('gw-auth-token');
  });

  test('POST /api/auth/register rejects duplicate email', async ({ request }) => {
    const email = testEmail('dup');
    await request.post(`${API}/api/auth/register`, {
      data: { email, password: 'secret123', displayName: 'First' },
    });

    const res = await request.post(`${API}/api/auth/register`, {
      data: { email, password: 'secret456', displayName: 'Second' },
    });

    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('already');
  });

  test('POST /api/auth/register rejects short password', async ({ request }) => {
    const res = await request.post(`${API}/api/auth/register`, {
      data: { email: testEmail('short'), password: '123', displayName: 'X' },
    });

    expect(res.status()).toBe(400);
  });

  test('POST /api/auth/login succeeds with valid credentials', async ({ request }) => {
    const email = testEmail('login');
    await request.post(`${API}/api/auth/register`, {
      data: { email, password: 'mypassword', displayName: 'Login User' },
    });

    const res = await request.post(`${API}/api/auth/login`, {
      data: { email, password: 'mypassword' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe(email);
    expect(body.user.displayName).toBe('Login User');

    const cookies = res.headers()['set-cookie'];
    expect(cookies).toContain('gw-auth-token');
  });

  test('POST /api/auth/login rejects wrong password', async ({ request }) => {
    const email = testEmail('wrongpw');
    await request.post(`${API}/api/auth/register`, {
      data: { email, password: 'correct', displayName: 'Wrong PW' },
    });

    const res = await request.post(`${API}/api/auth/login`, {
      data: { email, password: 'incorrect' },
    });

    expect(res.status()).toBe(401);
  });

  test('POST /api/auth/login rejects unknown email', async ({ request }) => {
    const res = await request.post(`${API}/api/auth/login`, {
      data: { email: 'nobody@nowhere.test', password: 'anything' },
    });

    expect(res.status()).toBe(401);
  });

  test('GET /api/auth/me returns user when authenticated', async ({ request }) => {
    const email = testEmail('me');
    const regRes = await request.post(`${API}/api/auth/register`, {
      data: { email, password: 'secret123', displayName: 'Me User' },
    });

    // Extract auth cookie
    const cookie = extractAuthCookie(regRes.headers()['set-cookie']);

    const res = await request.get(`${API}/api/auth/me`, {
      headers: { Cookie: cookie },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe(email);
    expect(body.user.displayName).toBe('Me User');
  });

  test('GET /api/auth/me returns 401 without cookie', async ({ request }) => {
    const res = await request.get(`${API}/api/auth/me`);
    expect(res.status()).toBe(401);
  });

  test('POST /api/auth/logout clears auth cookie', async ({ request }) => {
    const email = testEmail('logout');
    const regRes = await request.post(`${API}/api/auth/register`, {
      data: { email, password: 'secret123', displayName: 'Logout User' },
    });
    const cookie = extractAuthCookie(regRes.headers()['set-cookie']);

    const res = await request.post(`${API}/api/auth/logout`, {
      headers: { Cookie: cookie },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Cookie should be cleared (max-age=0 or expires in the past)
    const setCookie = res.headers()['set-cookie'] || '';
    expect(setCookie).toContain('gw-auth-token');
  });

  test('PUT /api/auth/me updates profile', async ({ request }) => {
    const email = testEmail('update');
    const regRes = await request.post(`${API}/api/auth/register`, {
      data: { email, password: 'secret123', displayName: 'Old Name' },
    });
    const cookie = extractAuthCookie(regRes.headers()['set-cookie']);

    const res = await request.put(`${API}/api/auth/me`, {
      headers: { Cookie: cookie },
      data: { displayName: 'New Name' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user.displayName).toBe('New Name');
  });

  test('full auth flow: register -> me -> logout -> me fails', async ({ request }) => {
    const email = testEmail('flow');

    // Register
    const regRes = await request.post(`${API}/api/auth/register`, {
      data: { email, password: 'flowtest', displayName: 'Flow User' },
    });
    expect(regRes.status()).toBe(201);
    const cookie = extractAuthCookie(regRes.headers()['set-cookie']);

    // Authenticated request
    const meRes = await request.get(`${API}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    expect(meRes.status()).toBe(200);

    // Logout
    await request.post(`${API}/api/auth/logout`, {
      headers: { Cookie: cookie },
    });

    // me without cookie should fail
    const meAfter = await request.get(`${API}/api/auth/me`);
    expect(meAfter.status()).toBe(401);
  });

  test('GET /api/health returns ok', async ({ request }) => {
    const res = await request.get(`${API}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.mode).toBe('database');
  });
});

/** Extract the gw-auth-token cookie from Set-Cookie header */
function extractAuthCookie(setCookie: string): string {
  if (!setCookie) return '';
  // Set-Cookie can be a single string or joined with newlines
  const parts = setCookie.split(/,(?=\s*\w+=)/);
  for (const part of parts) {
    if (part.includes('gw-auth-token=')) {
      const match = part.match(/gw-auth-token=[^;]+/);
      return match ? match[0] : '';
    }
  }
  return '';
}
