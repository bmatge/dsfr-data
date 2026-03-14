/**
 * E2E tests for data migration (localStorage -> database).
 *
 * Tests the POST /api/migrate endpoint which imports localStorage
 * data into the database for a newly registered user.
 *
 * Requires: backend running on port 3002 with JWT_SECRET set.
 *
 * Run: npx playwright test e2e/migration.db.spec.ts --project=chromium-db
 */
import { test, expect } from '@playwright/test';

const API = 'http://localhost:3002';
const RUN_ID = Date.now().toString(36);

function extractAuthCookie(setCookie: string): string {
  if (!setCookie) return '';
  const parts = setCookie.split(/,(?=\s*\w+=)/);
  for (const part of parts) {
    if (part.includes('gw-auth-token=')) {
      const match = part.match(/gw-auth-token=[^;]+/);
      return match ? match[0] : '';
    }
  }
  return '';
}

test.describe('Migration E2E', () => {
  test('POST /api/migrate imports sources, connections, favorites, dashboards', async ({ request }) => {
    // Register a new user
    const email = `migrate-full-${RUN_ID}@test.local`;
    const regRes = await request.post(`${API}/api/auth/register`, {
      data: { email, password: 'secret123', displayName: 'Migrate User' },
    });
    expect(regRes.status()).toBe(201);
    const cookie = extractAuthCookie(regRes.headers()['set-cookie']);

    // Prepare localStorage-like data
    const migrationPayload = {
      sources: [
        {
          id: `src-manual-${RUN_ID}`,
          name: 'Statistiques regions',
          type: 'manual',
          recordCount: 3,
          data: [
            { region: 'Ile-de-France', PIB: 739 },
            { region: 'Auvergne-Rhone-Alpes', PIB: 282 },
            { region: 'Occitanie', PIB: 177 },
          ],
        },
        {
          id: `src-api-${RUN_ID}`,
          name: 'Industrie du futur',
          type: 'api',
          connectionId: `conn-api-${RUN_ID}`,
          apiUrl: 'https://data.economie.gouv.fr/api/records',
          recordCount: 101,
        },
      ],
      connections: [
        {
          id: `conn-grist-${RUN_ID}`,
          type: 'grist',
          name: 'Grist public',
          url: 'https://grist.numerique.gouv.fr',
          apiKey: null,
          status: 'connected',
        },
        {
          id: `conn-api-${RUN_ID}`,
          type: 'api',
          name: 'API economie',
          apiUrl: 'https://data.economie.gouv.fr/api/records',
          method: 'GET',
          dataPath: 'results',
          status: 'connected',
        },
      ],
      favorites: [
        {
          id: `fav-bar-${RUN_ID}`,
          name: 'Beneficiaires par region',
          code: '<div><bar-chart></bar-chart></div>',
          chartType: 'bar',
          source: 'builder',
        },
        {
          id: `fav-pie-${RUN_ID}`,
          name: 'Repartition PIB',
          code: '<div><pie-chart></pie-chart></div>',
          chartType: 'pie',
          source: 'builder-ia',
        },
      ],
      dashboards: [
        {
          id: `dash-${RUN_ID}`,
          name: 'Dashboard test',
          description: 'E2E migration test dashboard',
          layout: { columns: 2, gap: 'fr-grid-row--gutters' },
          widgets: [
            { id: 'w-1', type: 'kpi', title: 'KPI 1' },
          ],
        },
      ],
    };

    // Call migration endpoint
    const migrateRes = await request.post(`${API}/api/migrate`, {
      headers: { Cookie: cookie },
      data: migrationPayload,
    });

    expect(migrateRes.status()).toBe(200);
    const result = await migrateRes.json();

    // Verify import counts
    expect(result.imported.sources).toBe(2);
    expect(result.imported.connections).toBe(2);
    expect(result.imported.favorites).toBe(2);
    expect(result.imported.dashboards).toBe(1);
    expect(result.skipped.sources).toBe(0);
    expect(result.skipped.connections).toBe(0);
    expect(result.skipped.favorites).toBe(0);
    expect(result.skipped.dashboards).toBe(0);

    // Verify data is accessible via CRUD endpoints
    // Note: list returns own + globally shared, so filter by _owned
    const sourcesRes = await request.get(`${API}/api/sources`, {
      headers: { Cookie: cookie },
    });
    const sources = await sourcesRes.json();
    const ownSources = sources.filter((s: any) => s._owned);
    expect(ownSources.length).toBe(2);
    expect(ownSources.some((s: any) => s.name === 'Statistiques regions')).toBe(true);
    expect(ownSources.some((s: any) => s.name === 'Industrie du futur')).toBe(true);

    const connsRes = await request.get(`${API}/api/connections`, {
      headers: { Cookie: cookie },
    });
    const conns = await connsRes.json();
    const ownConns = conns.filter((c: any) => c._owned);
    expect(ownConns.length).toBe(2);

    const favsRes = await request.get(`${API}/api/favorites`, {
      headers: { Cookie: cookie },
    });
    const favs = await favsRes.json();
    const ownFavs = favs.filter((f: any) => f._owned);
    expect(ownFavs.length).toBe(2);

    const dashRes = await request.get(`${API}/api/dashboards`, {
      headers: { Cookie: cookie },
    });
    const dashes = await dashRes.json();
    const ownDashes = dashes.filter((d: any) => d._owned);
    expect(ownDashes.length).toBe(1);
    expect(ownDashes[0].name).toBe('Dashboard test');
  });

  test('POST /api/migrate deduplicates by id', async ({ request }) => {
    const email = `migrate-dedup-${RUN_ID}@test.local`;
    const regRes = await request.post(`${API}/api/auth/register`, {
      data: { email, password: 'secret123', displayName: 'Dedup User' },
    });
    const cookie = extractAuthCookie(regRes.headers()['set-cookie']);

    const payload = {
      sources: [
        { id: `src-dedup-${RUN_ID}`, name: 'Source A', type: 'manual', recordCount: 0 },
      ],
    };

    // First migration
    const res1 = await request.post(`${API}/api/migrate`, {
      headers: { Cookie: cookie },
      data: payload,
    });
    const result1 = await res1.json();
    expect(result1.imported.sources).toBe(1);
    expect(result1.skipped.sources).toBe(0);

    // Second migration with same id
    const res2 = await request.post(`${API}/api/migrate`, {
      headers: { Cookie: cookie },
      data: payload,
    });
    const result2 = await res2.json();
    expect(result2.imported.sources).toBe(0);
    expect(result2.skipped.sources).toBe(1);

    // Verify only one own source exists
    const sourcesRes = await request.get(`${API}/api/sources`, {
      headers: { Cookie: cookie },
    });
    const sources = await sourcesRes.json();
    const ownSources = sources.filter((s: any) => s._owned);
    expect(ownSources.length).toBe(1);
  });

  test('POST /api/migrate requires authentication', async ({ request }) => {
    const res = await request.post(`${API}/api/migrate`, {
      data: { sources: [] },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/migrate handles empty payload', async ({ request }) => {
    const email = `migrate-empty-${RUN_ID}@test.local`;
    const regRes = await request.post(`${API}/api/auth/register`, {
      data: { email, password: 'secret123', displayName: 'Empty User' },
    });
    const cookie = extractAuthCookie(regRes.headers()['set-cookie']);

    const res = await request.post(`${API}/api/migrate`, {
      headers: { Cookie: cookie },
      data: {},
    });

    expect(res.status()).toBe(200);
    const result = await res.json();
    expect(result.imported.sources).toBe(0);
    expect(result.imported.connections).toBe(0);
    expect(result.imported.favorites).toBe(0);
    expect(result.imported.dashboards).toBe(0);
  });

  test('migrated data can be shared with other users', async ({ request }) => {
    // Register two users
    const emailA = `migrate-share-a-${RUN_ID}@test.local`;
    const regA = await request.post(`${API}/api/auth/register`, {
      data: { email: emailA, password: 'secret123', displayName: 'Migrator A' },
    });
    const cookieA = extractAuthCookie(regA.headers()['set-cookie']);

    const emailB = `migrate-share-b-${RUN_ID}@test.local`;
    const regB = await request.post(`${API}/api/auth/register`, {
      data: { email: emailB, password: 'secret123', displayName: 'Viewer B' },
    });
    const cookieB = extractAuthCookie(regB.headers()['set-cookie']);
    const userB = await regB.json();

    // Migrate a favorite as User A
    await request.post(`${API}/api/migrate`, {
      headers: { Cookie: cookieA },
      data: {
        favorites: [
          {
            id: `fav-share-${RUN_ID}`,
            name: 'Shared Chart',
            code: '<div>chart</div>',
            chartType: 'line',
            source: 'builder',
          },
        ],
      },
    });

    // Share with User B
    const shareRes = await request.post(`${API}/api/shares`, {
      headers: { Cookie: cookieA },
      data: {
        resource_type: 'favorite',
        resource_id: `fav-share-${RUN_ID}`,
        target_type: 'user',
        target_id: userB.user.id,
        permission: 'read',
      },
    });
    expect(shareRes.status()).toBe(201);

    // User B can access the migrated favorite
    const accessRes = await request.get(`${API}/api/favorites/fav-share-${RUN_ID}`, {
      headers: { Cookie: cookieB },
    });
    expect(accessRes.status()).toBe(200);
    const fav = await accessRes.json();
    expect(fav.name).toBe('Shared Chart');
  });
});
