/**
 * E2E tests for resource CRUD and sharing between users.
 *
 * Tests the full flow:
 * - User A creates a source
 * - User A shares with User B (read)
 * - User B can see the source
 * - User A upgrades permission to write
 * - User B can modify
 * - User A removes the share
 * - User B can no longer see it
 *
 * Requires: backend running on port 3002 with JWT_SECRET set.
 *
 * Run: npx playwright test e2e/sharing.db.spec.ts --project=chromium-db
 */
import { test, expect, type APIRequestContext } from '@playwright/test';

const API = 'http://localhost:3002';
const RUN_ID = Date.now().toString(36);

interface UserContext {
  cookie: string;
  userId: string;
  email: string;
}

async function registerUser(request: APIRequestContext, label: string): Promise<UserContext> {
  const email = `${label}-${RUN_ID}@test.local`;
  const res = await request.post(`${API}/api/auth/register`, {
    data: { email, password: 'secret123', displayName: `User ${label}` },
  });
  const body = await res.json();
  const cookie = extractAuthCookie(res.headers()['set-cookie']);
  return { cookie, userId: body.user.id, email };
}

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

test.describe('Sharing E2E', () => {
  let userA: UserContext;
  let userB: UserContext;

  test.beforeAll(async ({ request }) => {
    userA = await registerUser(request, 'share-owner');
    userB = await registerUser(request, 'share-viewer');
  });

  test('User A creates a source', async ({ request }) => {
    const res = await request.post(`${API}/api/sources`, {
      headers: { Cookie: userA.cookie },
      data: {
        name: 'Test Source',
        type: 'manual',
        config_json: JSON.stringify({ description: 'E2E test source' }),
        data_json: JSON.stringify([{ x: 1, y: 2 }]),
        record_count: 1,
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe('Test Source');

    // Store for later tests
    (test.info() as any).sourceId = body.id;
  });

  test('User A can list own sources', async ({ request }) => {
    const res = await request.get(`${API}/api/sources`, {
      headers: { Cookie: userA.cookie },
    });

    expect(res.status()).toBe(200);
    const sources = await res.json();
    expect(Array.isArray(sources)).toBe(true);
    expect(sources.length).toBeGreaterThanOrEqual(1);
    expect(sources.some((s: any) => s.name === 'Test Source')).toBe(true);
  });

  test('User B cannot see User A sources before sharing', async ({ request }) => {
    const res = await request.get(`${API}/api/sources`, {
      headers: { Cookie: userB.cookie },
    });

    expect(res.status()).toBe(200);
    const sources = await res.json();
    // User B should have no sources
    expect(sources.every((s: any) => s.name !== 'Test Source')).toBe(true);
  });

  test('full sharing workflow: share -> access -> upgrade -> modify -> revoke', async ({ request }) => {
    // 1. Create a source as User A
    const createRes = await request.post(`${API}/api/sources`, {
      headers: { Cookie: userA.cookie },
      data: {
        name: 'Shared Source',
        type: 'manual',
        config_json: JSON.stringify({}),
        data_json: JSON.stringify([{ a: 1 }]),
        record_count: 1,
      },
    });
    expect(createRes.status()).toBe(201);
    const source = await createRes.json();
    const sourceId = source.id;

    // 2. User B cannot access this source
    const accessBefore = await request.get(`${API}/api/sources/${sourceId}`, {
      headers: { Cookie: userB.cookie },
    });
    expect(accessBefore.status()).toBe(403);

    // 3. User A shares with User B (read)
    const shareRes = await request.post(`${API}/api/shares`, {
      headers: { Cookie: userA.cookie },
      data: {
        resource_type: 'source',
        resource_id: sourceId,
        target_type: 'user',
        target_id: userB.userId,
        permission: 'read',
      },
    });
    expect(shareRes.status()).toBe(201);
    const share = await shareRes.json();
    const shareId = share.id;

    // 4. User B can now read the source
    const accessAfterShare = await request.get(`${API}/api/sources/${sourceId}`, {
      headers: { Cookie: userB.cookie },
    });
    expect(accessAfterShare.status()).toBe(200);
    const sharedSource = await accessAfterShare.json();
    expect(sharedSource.name).toBe('Shared Source');

    // 5. User B cannot modify (read-only share)
    const modifyReadOnly = await request.put(`${API}/api/sources/${sourceId}`, {
      headers: { Cookie: userB.cookie },
      data: { name: 'Hacked Name' },
    });
    expect(modifyReadOnly.status()).toBe(403);

    // 6. User A removes the read share and creates a write share
    await request.delete(`${API}/api/shares/${shareId}`, {
      headers: { Cookie: userA.cookie },
    });

    const writeShareRes = await request.post(`${API}/api/shares`, {
      headers: { Cookie: userA.cookie },
      data: {
        resource_type: 'source',
        resource_id: sourceId,
        target_type: 'user',
        target_id: userB.userId,
        permission: 'write',
      },
    });
    expect(writeShareRes.status()).toBe(201);
    const writeShare = await writeShareRes.json();

    // 7. User B can now modify
    const modifyWrite = await request.put(`${API}/api/sources/${sourceId}`, {
      headers: { Cookie: userB.cookie },
      data: { name: 'Updated by B' },
    });
    expect(modifyWrite.status()).toBe(200);

    // Verify the update
    const verifyUpdate = await request.get(`${API}/api/sources/${sourceId}`, {
      headers: { Cookie: userA.cookie },
    });
    const updated = await verifyUpdate.json();
    expect(updated.name).toBe('Updated by B');

    // 8. User B still cannot delete (only owner can)
    const deleteByB = await request.delete(`${API}/api/sources/${sourceId}`, {
      headers: { Cookie: userB.cookie },
    });
    expect(deleteByB.status()).toBe(403);

    // 9. User A revokes the share
    await request.delete(`${API}/api/shares/${writeShare.id}`, {
      headers: { Cookie: userA.cookie },
    });

    // 10. User B can no longer access
    const accessRevoked = await request.get(`${API}/api/sources/${sourceId}`, {
      headers: { Cookie: userB.cookie },
    });
    expect(accessRevoked.status()).toBe(403);

    // 11. User A can still access
    const accessOwner = await request.get(`${API}/api/sources/${sourceId}`, {
      headers: { Cookie: userA.cookie },
    });
    expect(accessOwner.status()).toBe(200);
  });

  test('global share makes resource visible to all users', async ({ request }) => {
    // Create a source as User A
    const createRes = await request.post(`${API}/api/sources`, {
      headers: { Cookie: userA.cookie },
      data: {
        name: 'Global Source',
        type: 'manual',
        config_json: JSON.stringify({}),
        record_count: 0,
      },
    });
    const source = await createRes.json();

    // Share globally (read)
    const shareRes = await request.post(`${API}/api/shares`, {
      headers: { Cookie: userA.cookie },
      data: {
        resource_type: 'source',
        resource_id: source.id,
        target_type: 'global',
        permission: 'read',
      },
    });
    expect(shareRes.status()).toBe(201);

    // User B can see it
    const accessRes = await request.get(`${API}/api/sources/${source.id}`, {
      headers: { Cookie: userB.cookie },
    });
    expect(accessRes.status()).toBe(200);
  });

  test('only owner can create shares', async ({ request }) => {
    // Create source as User A
    const createRes = await request.post(`${API}/api/sources`, {
      headers: { Cookie: userA.cookie },
      data: {
        name: 'Owner Only Share',
        type: 'manual',
        config_json: JSON.stringify({}),
        record_count: 0,
      },
    });
    const source = await createRes.json();

    // User B tries to share User A's source
    const shareRes = await request.post(`${API}/api/shares`, {
      headers: { Cookie: userB.cookie },
      data: {
        resource_type: 'source',
        resource_id: source.id,
        target_type: 'global',
        permission: 'read',
      },
    });
    expect(shareRes.status()).toBe(403);
  });

  test('cannot share with yourself', async ({ request }) => {
    const createRes = await request.post(`${API}/api/sources`, {
      headers: { Cookie: userA.cookie },
      data: {
        name: 'Self Share Test',
        type: 'manual',
        config_json: JSON.stringify({}),
        record_count: 0,
      },
    });
    const source = await createRes.json();

    const shareRes = await request.post(`${API}/api/shares`, {
      headers: { Cookie: userA.cookie },
      data: {
        resource_type: 'source',
        resource_id: source.id,
        target_type: 'user',
        target_id: userA.userId,
        permission: 'read',
      },
    });
    expect(shareRes.status()).toBe(400);
  });

  test('CRUD for favorites works', async ({ request }) => {
    // Create
    const createRes = await request.post(`${API}/api/favorites`, {
      headers: { Cookie: userA.cookie },
      data: {
        name: 'Test Favorite',
        chart_type: 'bar',
        code: '<div>Test chart</div>',
        source_app: 'builder',
      },
    });
    expect(createRes.status()).toBe(201);
    const fav = await createRes.json();

    // Read
    const readRes = await request.get(`${API}/api/favorites/${fav.id}`, {
      headers: { Cookie: userA.cookie },
    });
    expect(readRes.status()).toBe(200);
    const readFav = await readRes.json();
    expect(readFav.name).toBe('Test Favorite');

    // Update
    const updateRes = await request.put(`${API}/api/favorites/${fav.id}`, {
      headers: { Cookie: userA.cookie },
      data: { name: 'Updated Favorite' },
    });
    expect(updateRes.status()).toBe(200);

    // Delete
    const deleteRes = await request.delete(`${API}/api/favorites/${fav.id}`, {
      headers: { Cookie: userA.cookie },
    });
    expect(deleteRes.status()).toBe(200);

    // Verify deleted (returns 403 because RBAC middleware checks before handler)
    const verifyRes = await request.get(`${API}/api/favorites/${fav.id}`, {
      headers: { Cookie: userA.cookie },
    });
    expect([403, 404]).toContain(verifyRes.status());
  });
});
