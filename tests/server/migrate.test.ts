/**
 * Server tests for migration route (/api/migrate).
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, closeTestApp } from './test-helpers.js';

// Mock mailer
vi.mock('../../server/src/utils/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  setTransporter: vi.fn(),
}));

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
    .send({ email: 'migrate-user@example.com', password: 'Password1', displayName: 'MigrateUser' });
  return extractCookie(res);
}

/** Sample migration payload with all four entity types. */
function fullPayload() {
  return {
    sources: [
      { id: 'src-1', name: 'Source A', type: 'csv', url: 'https://example.com/a.csv' },
      { id: 'src-2', name: 'Source B', type: 'api', url: 'https://example.com/b.json' },
    ],
    connections: [
      { id: 'conn-1', name: 'Grist Prod', type: 'grist', apiKey: 'key-123', status: 'ok' },
    ],
    favorites: [
      { id: 'fav-1', name: 'Bar Chart', chartType: 'bar', code: '<dsfr-data-chart type="bar"></dsfr-data-chart>', source: 'builder' },
      { id: 'fav-2', name: 'Pie Chart', chartType: 'pie', code: '<dsfr-data-chart type="pie"></dsfr-data-chart>', source: 'builder-ia' },
    ],
    dashboards: [
      { id: 'dash-1', name: 'Overview', description: 'Main dashboard', layout: { rows: 2 }, widgets: [{ id: 'w1' }] },
    ],
  };
}

describe('POST /api/migrate', () => {
  let app: Express;
  let cookie: string;

  beforeEach(async () => {
    app = await createTestApp();
    cookie = await registerAndGetCookie(app);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('imports all entity types (full migration)', async () => {
    const payload = fullPayload();

    const res = await request(app)
      .post('/api/migrate')
      .set('Cookie', cookie)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.imported).toEqual({
      sources: 2,
      connections: 1,
      favorites: 2,
      dashboards: 1,
    });
    expect(res.body.skipped).toEqual({
      sources: 0,
      connections: 0,
      favorites: 0,
      dashboards: 0,
    });
  });

  it('deduplicates on second import (skips existing items)', async () => {
    const payload = fullPayload();

    // First import
    await request(app)
      .post('/api/migrate')
      .set('Cookie', cookie)
      .send(payload);

    // Second import with the same IDs
    const res = await request(app)
      .post('/api/migrate')
      .set('Cookie', cookie)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.imported).toEqual({
      sources: 0,
      connections: 0,
      favorites: 0,
      dashboards: 0,
    });
    expect(res.body.skipped).toEqual({
      sources: 2,
      connections: 1,
      favorites: 2,
      dashboards: 1,
    });
  });

  it('partial migration (only sources)', async () => {
    const res = await request(app)
      .post('/api/migrate')
      .set('Cookie', cookie)
      .send({
        sources: [
          { id: 'src-partial-1', name: 'Partial Source', type: 'csv' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.imported).toEqual({
      sources: 1,
      connections: 0,
      favorites: 0,
      dashboards: 0,
    });
    expect(res.body.skipped).toEqual({
      sources: 0,
      connections: 0,
      favorites: 0,
      dashboards: 0,
    });
  });

  it('empty payload returns all zeros', async () => {
    const res = await request(app)
      .post('/api/migrate')
      .set('Cookie', cookie)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.imported).toEqual({
      sources: 0,
      connections: 0,
      favorites: 0,
      dashboards: 0,
    });
    expect(res.body.skipped).toEqual({
      sources: 0,
      connections: 0,
      favorites: 0,
      dashboards: 0,
    });
  });

  it('requires auth (401 without cookie)', async () => {
    const res = await request(app)
      .post('/api/migrate')
      .send(fullPayload());

    expect(res.status).toBe(401);
  });
});
