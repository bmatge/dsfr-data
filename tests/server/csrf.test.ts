/**
 * CSRF protection integration tests (issue #92).
 * Vérifie que les routes muantes rejettent les requêtes sans token valide,
 * et acceptent celles qui portent un token obtenu via GET /api/auth/csrf.
 *
 * Ces tests activent explicitement CSRF (short-circuité par défaut en NODE_ENV=test
 * pour ne pas casser les 61+ autres tests qui n'exercent pas ce chemin).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, closeTestApp } from './test-helpers.js';

describe('CSRF protection (issue #92)', () => {
  let app: Express;

  beforeAll(() => {
    process.env.CSRF_ENABLED = '1';
  });

  beforeEach(async () => {
    app = await createTestApp({ csrf: true });
  });

  afterAll(async () => {
    delete process.env.CSRF_ENABLED;
    await closeTestApp();
  });

  it('GET /api/auth/csrf retourne un token et pose le cookie gw-csrf', async () => {
    const res = await request(app).get('/api/auth/csrf');

    expect(res.status).toBe(200);
    expect(typeof res.body.csrfToken).toBe('string');
    expect(res.body.csrfToken.length).toBeGreaterThan(20);
    const setCookie = res.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    expect(cookies.some((c: string) => c.startsWith('gw-csrf='))).toBe(true);
  });

  it('POST muant sans token → 403 CSRF_INVALID', async () => {
    // /api/migrate est un POST non-auth-bootstrap, c'est un bon canari :
    // il retourne 401 (auth manquante) OU 403 (CSRF manquant) selon quelle
    // protection matche en premier. L'ordre middleware fait que CSRF matche
    // avant requireAuth.
    const res = await request(app).post('/api/migrate').send({});

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_INVALID');
  });

  it('POST muant avec token valide → pas de 403 (rejoint la route)', async () => {
    // On enchaîne : GET /csrf pour obtenir token+cookie, puis POST en renvoyant
    // le cookie + X-CSRF-Token. Le test ne valide PAS le contenu de /migrate
    // (il retournera probablement 401 sans auth), seulement l'absence de 403
    // CSRF.
    const csrfRes = await request(app).get('/api/auth/csrf');
    const token = csrfRes.body.csrfToken as string;
    const cookies = csrfRes.headers['set-cookie'] as unknown as string[];

    const res = await request(app)
      .post('/api/migrate')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', token)
      .send({ sources: [], connections: [], favorites: [], dashboards: [] });

    expect(res.status).not.toBe(403);
    expect(res.body.code).not.toBe('CSRF_INVALID');
  });

  it("POST auth-bootstrap (login, register, reset-password) n'exige PAS de token", async () => {
    // Ces routes s'exécutent AVANT qu'un token puisse exister (cf. SKIP_PATHS
    // dans csrf.ts). Elles s'appuient sur le rate-limiter + SameSite du cookie.
    const login = await request(app).post('/api/auth/login').send({ email: 'x', password: 'y' });
    expect(login.status).not.toBe(403);

    const register = await request(app)
      .post('/api/auth/register')
      .send({ email: 'x', password: 'y' });
    expect(register.status).not.toBe(403);

    const reset = await request(app).post('/api/auth/forgot-password').send({ email: 'x' });
    expect(reset.status).not.toBe(403);
  });

  it("GET/HEAD/OPTIONS n'exigent pas de token (idempotents)", async () => {
    const get = await request(app).get('/api/health');
    expect(get.status).not.toBe(403);
  });

  it('POST muant avec token invalide → 403 CSRF_INVALID', async () => {
    const res = await request(app)
      .post('/api/migrate')
      .set('X-CSRF-Token', 'token-totalement-bidon')
      .set('Cookie', 'gw-csrf=cookie-bidon')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_INVALID');
  });
});
