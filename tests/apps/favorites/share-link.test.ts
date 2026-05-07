/**
 * Tests for the favorites public-share helper (issue #148).
 *
 * The `openShareModal` flow is integration-heavy (modals, fetch, clipboard) —
 * we cover the parts that are pure / data-shape : URL building and active-share
 * filtering. End-to-end behavior is covered by the server tests + manual QA.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  buildPublicShareUrl,
  findActivePublicShare,
  createPublicShare,
} from '../../../apps/favorites/src/share-link';

describe('share-link', () => {
  describe('buildPublicShareUrl', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: new URL('https://example.gov.fr/apps/favorites/index.html'),
      });
    });

    it('builds a URL pointing at public-view.html with the token', () => {
      const url = buildPublicShareUrl('abcd1234-aaaa-bbbb-cccc-eeeeffff0000');
      expect(url).toBe(
        'https://example.gov.fr/apps/favorites/public-view.html?token=abcd1234-aaaa-bbbb-cccc-eeeeffff0000'
      );
    });

    it('encodes a token containing URL-special characters', () => {
      const url = buildPublicShareUrl('abc def');
      expect(url).toContain('token=abc+def');
    });
  });

  describe('findActivePublicShare', () => {
    let originalFetch: typeof fetch;
    beforeEach(() => {
      originalFetch = global.fetch;
    });
    afterEach(() => {
      global.fetch = originalFetch;
    });

    function mockFetchOnce(payload: unknown, ok = true): void {
      global.fetch = vi.fn().mockResolvedValue({
        ok,
        json: async () => payload,
      } as Response);
    }

    it('returns null when no shares exist', async () => {
      mockFetchOnce([]);
      const share = await findActivePublicShare('fav-1');
      expect(share).toBeNull();
    });

    it('returns null when /api/shares responds with an error', async () => {
      mockFetchOnce({ error: 'oops' }, false);
      const share = await findActivePublicShare('fav-1');
      expect(share).toBeNull();
    });

    it('skips revoked shares', async () => {
      mockFetchOnce([
        {
          id: 't-1',
          resource_id: 'fav-1',
          target_type: 'public',
          revoked_at: '2024-01-01T00:00:00Z',
          expires_at: null,
        },
      ]);
      const share = await findActivePublicShare('fav-1');
      expect(share).toBeNull();
    });

    it('skips expired shares', async () => {
      mockFetchOnce([
        {
          id: 't-1',
          resource_id: 'fav-1',
          target_type: 'public',
          revoked_at: null,
          expires_at: '2000-01-01T00:00:00Z',
        },
      ]);
      const share = await findActivePublicShare('fav-1');
      expect(share).toBeNull();
    });

    it('returns the active share', async () => {
      const future = new Date(Date.now() + 3600_000).toISOString();
      mockFetchOnce([
        {
          id: 't-1',
          resource_id: 'fav-1',
          target_type: 'public',
          revoked_at: null,
          expires_at: future,
        },
      ]);
      const share = await findActivePublicShare('fav-1');
      expect(share?.id).toBe('t-1');
    });

    it('ignores shares whose target_type is not public', async () => {
      mockFetchOnce([
        {
          id: 't-1',
          resource_id: 'fav-1',
          target_type: 'user',
          revoked_at: null,
          expires_at: null,
        },
      ]);
      const share = await findActivePublicShare('fav-1');
      expect(share).toBeNull();
    });
  });

  describe('createPublicShare', () => {
    let originalFetch: typeof fetch;
    beforeEach(() => {
      originalFetch = global.fetch;
    });
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('throws an Error tagged with the server code when the source is private', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Cette favori utilise une source privee...',
          code: 'PRIVATE_SOURCE_NOT_SUPPORTED',
        }),
      } as Response);

      await expect(createPublicShare('fav-1')).rejects.toMatchObject({
        code: 'PRIVATE_SOURCE_NOT_SUPPORTED',
      });
    });

    it('returns the share row on success', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'token-1', resource_id: 'fav-1' }),
      } as Response);

      const share = await createPublicShare('fav-1');
      expect(share.id).toBe('token-1');
    });
  });
});
