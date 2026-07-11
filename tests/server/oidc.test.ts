/**
 * Server tests for OIDC auth flow (/api/auth/oidc/*).
 * openid-client is mocked end-to-end: discovery returns a stub Configuration
 * and authorizationCodeGrant returns whatever claims the test sets up.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, closeTestApp } from './test-helpers.js';
import { execute, queryOne } from '../../server/src/db/database.js';
import { resetOidcConfig, OIDC_STATE_COOKIE } from '../../server/src/utils/oidc.js';

vi.mock('../../server/src/utils/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  setTransporter: vi.fn(),
}));

const idTokenClaims = vi.fn();

vi.mock('openid-client', () => ({
  discovery: vi.fn(async () => ({ __stub: true })),
  randomState: vi.fn(() => 'test-state-xxxxxxxxxxxxxxxx'),
  randomNonce: vi.fn(() => 'test-nonce-yyyyyyyyyyyyyyyy'),
  randomPKCECodeVerifier: vi.fn(() => 'test-pkce-verifier-zzzzzzzzzz'),
  calculatePKCECodeChallenge: vi.fn(async () => 'test-pkce-challenge'),
  buildAuthorizationUrl: vi.fn((_config: unknown, params: Record<string, string>) => {
    const url = new URL('https://idp.example.com/authorize');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url;
  }),
  authorizationCodeGrant: vi.fn(async () => ({
    claims: idTokenClaims,
  })),
}));

const ISSUER = 'https://idp.example.com';
const CLIENT_ID = 'test-client-id';
const CLIENT_SECRET = 'test-client-secret';
const REDIRECT_URI = 'https://app.example.com/api/auth/oidc/callback';

function enableOidc(extra: Record<string, string> = {}): void {
  process.env.OIDC_ENABLED = 'true';
  process.env.OIDC_ISSUER = ISSUER;
  process.env.OIDC_CLIENT_ID = CLIENT_ID;
  process.env.OIDC_CLIENT_SECRET = CLIENT_SECRET;
  process.env.OIDC_REDIRECT_URI = REDIRECT_URI;
  for (const [k, v] of Object.entries(extra)) process.env[k] = v;
  resetOidcConfig();
}

function disableOidc(): void {
  delete process.env.OIDC_ENABLED;
  delete process.env.OIDC_ONLY;
  delete process.env.OIDC_ISSUER;
  delete process.env.OIDC_CLIENT_ID;
  delete process.env.OIDC_CLIENT_SECRET;
  delete process.env.OIDC_REDIRECT_URI;
  delete process.env.OIDC_DEFAULT_ROLE;
  delete process.env.OIDC_PROVIDER_LABEL;
  resetOidcConfig();
}

const VALID_STATE_COOKIE = `${OIDC_STATE_COOKIE}=${encodeURIComponent(
  JSON.stringify({
    state: 'test-state-xxxxxxxxxxxxxxxx',
    nonce: 'test-nonce-yyyyyyyyyyyyyyyy',
    codeVerifier: 'test-pkce-verifier-zzzzzzzzzz',
  })
)}`;

describe('GET /api/auth/oidc/login', () => {
  let app: Express;

  beforeEach(async () => {
    app = await createTestApp();
    vi.clearAllMocks();
    disableOidc();
  });

  it('returns 404 when OIDC is not enabled', async () => {
    const res = await request(app).get('/api/auth/oidc/login');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not enabled/i);
  });

  it('redirects to the IdP /authorize with PKCE + state + nonce', async () => {
    enableOidc();
    const res = await request(app).get('/api/auth/oidc/login');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('https://idp.example.com/authorize');
    expect(res.headers.location).toContain('code_challenge=test-pkce-challenge');
    expect(res.headers.location).toContain('code_challenge_method=S256');
    expect(res.headers.location).toContain('state=test-state-xxxxxxxxxxxxxxxx');
    expect(res.headers.location).toContain('nonce=test-nonce-yyyyyyyyyyyyyyyy');
    expect(res.headers.location).toContain(`redirect_uri=${encodeURIComponent(REDIRECT_URI)}`);

    const setCookie = res.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    const stateCookie = cookies.find((c) => c && c.startsWith(OIDC_STATE_COOKIE));
    expect(stateCookie).toBeDefined();
    expect(stateCookie).toContain('HttpOnly');
    expect(stateCookie).toContain('SameSite=Lax');
    expect(stateCookie).toContain('Path=/api/auth/oidc');
  });

  it('returns 500 when discovery config is incomplete', async () => {
    process.env.OIDC_ENABLED = 'true';
    process.env.OIDC_ISSUER = ISSUER;
    delete process.env.OIDC_CLIENT_ID;
    resetOidcConfig();
    const res = await request(app).get('/api/auth/oidc/login');
    expect(res.status).toBe(500);
  });

  // --- SSO silencieux (#365) -------------------------------------------------

  it('?silent=1 ajoute prompt=none à l URL /authorize', async () => {
    enableOidc();
    const res = await request(app).get('/api/auth/oidc/login?silent=1');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('prompt=none');
  });

  it('sans silent, pas de prompt dans l URL /authorize', async () => {
    enableOidc();
    const res = await request(app).get('/api/auth/oidc/login');
    expect(res.status).toBe(302);
    expect(res.headers.location).not.toContain('prompt=');
  });

  it('?return_to relatif est porté par le cookie d état', async () => {
    enableOidc();
    const res = await request(app).get(
      '/api/auth/oidc/login?return_to=%2Fapps%2Fdashboard%2F%3Ftab%3D2'
    );
    const setCookie = res.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    const stateCookie = cookies.find((c) => c && c.startsWith(OIDC_STATE_COOKIE)) ?? '';
    const payload = JSON.parse(
      decodeURIComponent(stateCookie.split(';')[0].slice(OIDC_STATE_COOKIE.length + 1))
    );
    expect(payload.returnTo).toBe('/apps/dashboard/?tab=2');
  });

  it('return_to non relatif (open redirect) retombe sur /', async () => {
    enableOidc();
    for (const evil of ['https://evil.example', '//evil.example', '/valid\\..\\evil']) {
      const res = await request(app).get(
        `/api/auth/oidc/login?return_to=${encodeURIComponent(evil)}`
      );
      const setCookie = res.headers['set-cookie'];
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      const stateCookie = cookies.find((c) => c && c.startsWith(OIDC_STATE_COOKIE)) ?? '';
      const payload = JSON.parse(
        decodeURIComponent(stateCookie.split(';')[0].slice(OIDC_STATE_COOKIE.length + 1))
      );
      expect(payload.returnTo).toBe('/');
    }
  });
});

describe('GET /api/auth/oidc/callback', () => {
  let app: Express;

  beforeEach(async () => {
    app = await createTestApp();
    vi.clearAllMocks();
    disableOidc();
    idTokenClaims.mockReset();
  });

  it('returns 404 when OIDC is not enabled', async () => {
    const res = await request(app).get('/api/auth/oidc/callback?code=x&state=y');
    expect(res.status).toBe(404);
  });

  // --- SSO silencieux (#365) : erreurs « pas de session IdP » ----------------

  it.each([
    'login_required',
    'interaction_required',
    'consent_required',
    'account_selection_required',
  ])('error=%s → redirect / silencieux (pas de 400), même sans cookie', async (idpError) => {
    enableOidc();
    const res = await request(app).get(`/api/auth/oidc/callback?error=${idpError}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('error=login_required avec cookie → redirect vers le returnTo stocké', async () => {
    enableOidc();
    const cookie = `${OIDC_STATE_COOKIE}=${encodeURIComponent(
      JSON.stringify({
        state: 'test-state-xxxxxxxxxxxxxxxx',
        nonce: 'test-nonce-yyyyyyyyyyyyyyyy',
        codeVerifier: 'test-pkce-verifier-zzzzzzzzzz',
        returnTo: '/apps/dashboard/',
      })
    )}`;
    const res = await request(app)
      .get('/api/auth/oidc/callback?error=login_required')
      .set('Cookie', cookie);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/apps/dashboard/');
  });

  it('une vraie erreur OAuth (access_denied) reste une erreur', async () => {
    enableOidc();
    const res = await request(app)
      .get('/api/auth/oidc/callback?error=access_denied')
      .set('Cookie', VALID_STATE_COOKIE);
    expect(res.status).toBe(400);
  });

  it('login réussi → redirect vers le returnTo stocké dans le cookie', async () => {
    enableOidc();
    idTokenClaims.mockReturnValue({
      sub: 'idp-sub-returnto',
      email: 'return.to@example.com',
      email_verified: true,
      name: 'Return To',
    });
    const cookie = `${OIDC_STATE_COOKIE}=${encodeURIComponent(
      JSON.stringify({
        state: 'test-state-xxxxxxxxxxxxxxxx',
        nonce: 'test-nonce-yyyyyyyyyyyyyyyy',
        codeVerifier: 'test-pkce-verifier-zzzzzzzzzz',
        returnTo: '/apps/sources/',
      })
    )}`;
    const res = await request(app)
      .get('/api/auth/oidc/callback?code=x&state=test-state-xxxxxxxxxxxxxxxx')
      .set('Cookie', cookie);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/apps/sources/');
  });

  it('returns 400 when the state cookie is missing', async () => {
    enableOidc();
    const res = await request(app).get('/api/auth/oidc/callback?code=x&state=y');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/state cookie/i);
  });

  it('returns 400 when the state cookie payload is invalid', async () => {
    enableOidc();
    const res = await request(app)
      .get('/api/auth/oidc/callback?code=x&state=y')
      .set('Cookie', `${OIDC_STATE_COOKIE}=not-json`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('returns 400 when the IdP returns no email claim', async () => {
    enableOidc();
    idTokenClaims.mockReturnValue({ sub: 'idp-sub-1' });
    const res = await request(app)
      .get('/api/auth/oidc/callback?code=x&state=test-state-xxxxxxxxxxxxxxxx')
      .set('Cookie', VALID_STATE_COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('auto-provisions a new user with role=editor and redirects to /', async () => {
    enableOidc();
    idTokenClaims.mockReturnValue({
      sub: 'idp-sub-new',
      email: 'new.user@example.com',
      email_verified: true,
      name: 'New User',
    });
    const res = await request(app)
      .get('/api/auth/oidc/callback?code=x&state=test-state-xxxxxxxxxxxxxxxx')
      .set('Cookie', VALID_STATE_COOKIE);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');

    const user = await queryOne<{
      role: string;
      auth_provider: string;
      external_id: string;
      oidc_issuer: string;
      email_verified: number;
    }>(
      'SELECT role, auth_provider, external_id, oidc_issuer, email_verified FROM users WHERE email = ?',
      ['new.user@example.com']
    );
    expect(user).toBeDefined();
    expect(user!.role).toBe('editor');
    expect(user!.auth_provider).toBe('oidc');
    expect(user!.external_id).toBe('idp-sub-new');
    expect(user!.oidc_issuer).toBe(ISSUER);
    expect(user!.email_verified).toBe(1);

    const setCookie = res.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    expect(cookies.some((c) => c && c.startsWith('gw-auth-token='))).toBe(true);
  });

  it('honors OIDC_DEFAULT_ROLE when provisioning', async () => {
    enableOidc({ OIDC_DEFAULT_ROLE: 'viewer' });
    idTokenClaims.mockReturnValue({
      sub: 'idp-sub-viewer',
      email: 'viewer@example.com',
      email_verified: true,
    });
    await request(app)
      .get('/api/auth/oidc/callback?code=x&state=test-state-xxxxxxxxxxxxxxxx')
      .set('Cookie', VALID_STATE_COOKIE);
    const user = await queryOne<{ role: string }>('SELECT role FROM users WHERE email = ?', [
      'viewer@example.com',
    ]);
    expect(user?.role).toBe('viewer');
  });

  it('links an existing local account when email_verified=true', async () => {
    enableOidc();
    await execute(
      `INSERT INTO users (id, email, display_name, role, auth_provider, password_hash, email_verified, is_active)
       VALUES (?, ?, ?, 'editor', 'local', 'hash', TRUE, TRUE)`,
      ['user-existing-1', 'existing@example.com', 'Existing']
    );
    idTokenClaims.mockReturnValue({
      sub: 'idp-sub-existing',
      email: 'existing@example.com',
      email_verified: true,
    });

    const res = await request(app)
      .get('/api/auth/oidc/callback?code=x&state=test-state-xxxxxxxxxxxxxxxx')
      .set('Cookie', VALID_STATE_COOKIE);

    expect(res.status).toBe(302);
    const user = await queryOne<{
      auth_provider: string;
      external_id: string;
      oidc_issuer: string;
    }>('SELECT auth_provider, external_id, oidc_issuer FROM users WHERE id = ?', [
      'user-existing-1',
    ]);
    expect(user?.auth_provider).toBe('oidc');
    expect(user?.external_id).toBe('idp-sub-existing');
    expect(user?.oidc_issuer).toBe(ISSUER);
  });

  it('refuses linking when email_verified=false (anti-takeover)', async () => {
    enableOidc();
    await execute(
      `INSERT INTO users (id, email, display_name, role, auth_provider, password_hash, email_verified, is_active)
       VALUES (?, ?, ?, 'editor', 'local', 'hash', TRUE, TRUE)`,
      ['user-existing-2', 'victim@example.com', 'Victim']
    );
    idTokenClaims.mockReturnValue({
      sub: 'attacker-sub',
      email: 'victim@example.com',
      email_verified: false,
    });

    const res = await request(app)
      .get('/api/auth/oidc/callback?code=x&state=test-state-xxxxxxxxxxxxxxxx')
      .set('Cookie', VALID_STATE_COOKIE);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not verified/i);

    const user = await queryOne<{ auth_provider: string }>(
      'SELECT auth_provider FROM users WHERE id = ?',
      ['user-existing-2']
    );
    expect(user?.auth_provider).toBe('local');

    // logAudit range le requérant (non authentifié → NULL) dans user_id et la
    // cible dans target_id — c'est donc target_id qu'il faut interroger.
    const audit = await queryOne<{ action: string }>(
      'SELECT action FROM audit_log WHERE target_id = ? ORDER BY id DESC LIMIT 1',
      ['user-existing-2']
    );
    expect(audit?.action).toBe('oidc.callback.denied_unverified_email');
  });

  it('refuses provisioning a new user when email_verified=false', async () => {
    enableOidc();
    idTokenClaims.mockReturnValue({
      sub: 'idp-sub-unverified',
      email: 'unverified@example.com',
      email_verified: false,
    });
    const res = await request(app)
      .get('/api/auth/oidc/callback?code=x&state=test-state-xxxxxxxxxxxxxxxx')
      .set('Cookie', VALID_STATE_COOKIE);
    expect(res.status).toBe(403);
    const user = await queryOne('SELECT id FROM users WHERE email = ?', ['unverified@example.com']);
    expect(user).toBeUndefined();
  });

  it('re-uses an existing OIDC account on subsequent logins', async () => {
    enableOidc();
    idTokenClaims.mockReturnValue({
      sub: 'idp-sub-recurring',
      email: 'recurring@example.com',
      email_verified: true,
    });

    await request(app)
      .get('/api/auth/oidc/callback?code=x&state=test-state-xxxxxxxxxxxxxxxx')
      .set('Cookie', VALID_STATE_COOKIE);
    await request(app)
      .get('/api/auth/oidc/callback?code=x&state=test-state-xxxxxxxxxxxxxxxx')
      .set('Cookie', VALID_STATE_COOKIE);

    const count = await queryOne<{ n: number }>('SELECT COUNT(*) as n FROM users WHERE email = ?', [
      'recurring@example.com',
    ]);
    expect(count?.n).toBe(1);
  });

  it('refuses login on a disabled account', async () => {
    enableOidc();
    await execute(
      `INSERT INTO users (id, email, display_name, role, auth_provider, external_id, oidc_issuer, email_verified, is_active)
       VALUES (?, ?, ?, 'editor', 'oidc', ?, ?, TRUE, FALSE)`,
      ['user-disabled-1', 'disabled@example.com', 'Disabled', 'idp-sub-disabled', ISSUER]
    );
    idTokenClaims.mockReturnValue({
      sub: 'idp-sub-disabled',
      email: 'disabled@example.com',
      email_verified: true,
    });

    const res = await request(app)
      .get('/api/auth/oidc/callback?code=x&state=test-state-xxxxxxxxxxxxxxxx')
      .set('Cookie', VALID_STATE_COOKIE);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/disabled/i);
  });
});

describe('OIDC_ONLY=true blocks local auth routes', () => {
  let app: Express;

  beforeEach(async () => {
    app = await createTestApp();
    vi.clearAllMocks();
    disableOidc();
    enableOidc({ OIDC_ONLY: 'true' });
  });

  it('returns 403 on /register', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'Password1' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/OIDC_ONLY/);
  });

  it('returns 403 on /login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'Password1' });
    expect(res.status).toBe(403);
  });

  it('returns 403 on /forgot-password', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'a@b.com' });
    expect(res.status).toBe(403);
  });

  it('returns 403 on /reset-password', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'x', password: 'Password1' });
    expect(res.status).toBe(403);
  });

  it('exposes oidcOnly=true in /providers payload', async () => {
    const res = await request(app).get('/api/auth/providers');
    expect(res.status).toBe(200);
    expect(res.body.oidcOnly).toBe(true);
    expect(res.body.providers).toHaveLength(1);
  });
});

afterAll(async () => {
  disableOidc();
  await closeTestApp();
});
